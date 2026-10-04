// Package api serves the catalog over a small read-only REST API.
//
//	GET /healthz
//	GET /api/terms
//	GET /api/terms/{term}/search?q=cop35&limit=8
//	GET /api/terms/{term}/courses/{code}
package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"gatorplan/internal/catalog"
	"gatorplan/internal/store"
	"gatorplan/internal/term"
)

// Catalog is the read side of the store.
type Catalog interface {
	Ping(ctx context.Context) error
	Terms(ctx context.Context) ([]catalog.Term, error)
	Search(ctx context.Context, termCode, q string, limit int) ([]catalog.SearchResult, error)
	Course(ctx context.Context, termCode, code string) (*catalog.Course, error)
}

type Server struct {
	cat Catalog
	now func() time.Time
}

func New(cat Catalog) *Server {
	return &Server{cat: cat, now: time.Now}
}

// Data only changes on the hourly scrape, so let browsers and the CDN cache
// briefly and serve stale while revalidating.
const cacheControl = "public, max-age=60, stale-while-revalidate=600"

var courseCode = regexp.MustCompile(`^[A-Z]{3}[0-9]{4}[A-Z]?$`)

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)
	mux.HandleFunc("GET /api/terms", s.terms)
	mux.HandleFunc("GET /api/terms/{term}/search", s.search)
	mux.HandleFunc("GET /api/terms/{term}/courses/{code}", s.course)
	return logRequests(mux)
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	if err := s.cat.Ping(r.Context()); err != nil {
		writeError(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) terms(w http.ResponseWriter, r *http.Request) {
	terms, err := s.cat.Terms(r.Context())
	if err != nil {
		s.internal(w, r, err)
		return
	}
	markSuggested(terms, term.Current(s.now()))
	w.Header().Set("Cache-Control", cacheControl)
	writeJSON(w, http.StatusOK, terms)
}

// markSuggested flags the first term after the one in session (the one
// students are registering for), falling back to the latest term.
func markSuggested(terms []catalog.Term, current string) {
	if len(terms) == 0 {
		return
	}
	for i := range terms {
		if terms[i].Code > current {
			terms[i].Suggested = true
			return
		}
	}
	terms[len(terms)-1].Suggested = true
}

func (s *Server) search(w http.ResponseWriter, r *http.Request) {
	termCode, ok := s.termParam(w, r)
	if !ok {
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(q) > 100 {
		writeError(w, http.StatusBadRequest, "query too long")
		return
	}
	limit := 8
	if l := r.URL.Query().Get("limit"); l != "" {
		n, err := strconv.Atoi(l)
		if err != nil || n < 1 || n > 50 {
			writeError(w, http.StatusBadRequest, "limit must be 1–50")
			return
		}
		limit = n
	}
	results, err := s.cat.Search(r.Context(), termCode, q, limit)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", cacheControl)
	writeJSON(w, http.StatusOK, results)
}

func (s *Server) course(w http.ResponseWriter, r *http.Request) {
	termCode, ok := s.termParam(w, r)
	if !ok {
		return
	}
	code := strings.ToUpper(strings.ReplaceAll(r.PathValue("code"), " ", ""))
	if !courseCode.MatchString(code) {
		writeError(w, http.StatusBadRequest, "malformed course code")
		return
	}
	c, err := s.cat.Course(r.Context(), termCode, code)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "course not found")
		return
	}
	if err != nil {
		s.internal(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", cacheControl)
	writeJSON(w, http.StatusOK, c)
}

func (s *Server) termParam(w http.ResponseWriter, r *http.Request) (string, bool) {
	code := r.PathValue("term")
	if _, _, err := term.Parse(code); err != nil {
		writeError(w, http.StatusBadRequest, "malformed term code")
		return "", false
	}
	return code, true
}

func (s *Server) internal(w http.ResponseWriter, r *http.Request, err error) {
	slog.Error("request failed", "path", r.URL.Path, "err", err)
	writeError(w, http.StatusInternalServerError, "internal error")
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, status, map[string]string{"error": msg})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		slog.Info("http", "method", r.Method, "path", r.URL.Path, "status", rec.status,
			"ms", time.Since(start).Milliseconds())
	})
}
