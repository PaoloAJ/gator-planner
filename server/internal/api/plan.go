package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/anthropics/anthropic-sdk-go"

	"gatorplan/internal/audit"
	"gatorplan/internal/planner"
)

const (
	maxAuditBytes = 5 << 20
	planTimeout   = 5 * time.Minute
	heartbeat     = 10 * time.Second
)

type planRequest struct {
	Audit json.RawMessage `json:"audit"`
	planner.Options
}

// plan streams newline-delimited JSON events: "status" lines while the agent
// works, "ping" lines to keep proxies from timing out, then one "plan",
// "questions" (answer them and post again with "answers"), or "error" line.
// The audit and the student's notes are used for this request only and are
// never stored or logged.
func (s *Server) plan(w http.ResponseWriter, r *http.Request) {
	if s.planner == nil {
		writeError(w, http.StatusServiceUnavailable, "degree planner is not enabled")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxAuditBytes)
	var req planRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "request must be JSON with an \"audit\" field")
		return
	}
	summary, err := audit.Parse(req.Audit)
	if err != nil {
		writeError(w, http.StatusBadRequest, strings.TrimPrefix(err.Error(), "audit: "))
		return
	}
	// Validates every preference and cleans the free text (redacts likely
	// personal data, neutralizes tag-like markup) before the model sees it.
	if err := req.Options.Check(s.now()); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if !s.limiter.allow(clientIP(r), s.now()) {
		writeError(w, http.StatusTooManyRequests, "plan limit reached; try again in an hour")
		return
	}

	rc := http.NewResponseController(w)
	rc.SetWriteDeadline(time.Now().Add(planTimeout + 30*time.Second))
	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	var mu sync.Mutex
	enc := json.NewEncoder(w)
	emit := func(e planner.Event) {
		mu.Lock()
		defer mu.Unlock()
		enc.Encode(e)
		rc.Flush()
	}

	ctx, cancel := context.WithTimeout(r.Context(), planTimeout)
	defer cancel()
	go func() {
		t := time.NewTicker(heartbeat)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				emit(planner.Event{Type: "ping"})
			}
		}
	}()

	res, err := s.planner.Run(ctx, summary, req.Options, emit)
	cancel()
	switch {
	case err != nil:
		// Logs the provider's error (code and message), never the audit.
		slog.Error("plan failed", "err", err)
		emit(planner.Event{Type: "error", Message: planErrorMessage(err)})
	case len(res.Questions) > 0:
		emit(planner.Event{Type: "questions", Questions: res.Questions})
	default:
		emit(planner.Event{Type: "plan", Plan: res.Plan})
	}
}

func planErrorMessage(err error) string {
	var apiErr *anthropic.Error
	switch {
	case errors.Is(err, planner.ErrRefused):
		return "The planner declined this request. Try again, or check that the audit is complete."
	case errors.Is(err, context.DeadlineExceeded):
		return "Planning took too long. Try again with a shorter planning window."
	case errors.As(err, &apiErr):
		switch {
		case strings.Contains(apiErr.Error(), "credit balance"):
			// Anthropic reports an empty balance as a 400; retrying won't help.
			return "The planner's Anthropic account is out of API credits. Add credits at console.anthropic.com/settings/billing."
		case apiErr.StatusCode == http.StatusNotFound:
			return "This Anthropic account can't use the planner's model. Set ANTHROPIC_MODEL in server/.env to a model it can access."
		case apiErr.StatusCode == http.StatusUnauthorized || apiErr.StatusCode == http.StatusForbidden:
			return "The planner isn't configured: set a valid ANTHROPIC_API_KEY in server/.env."
		case apiErr.StatusCode == http.StatusTooManyRequests || apiErr.StatusCode == 529:
			return "The planner is busy right now. Try again in a minute."
		}
		if apiErr.StatusCode >= 500 {
			return "The AI service had a temporary problem. Try again in a minute."
		}
	}
	return "Something went wrong while planning. Try again."
}

// clientIP prefers the first X-Forwarded-For hop: the API sits behind the
// Next.js proxy, so RemoteAddr is always the proxy itself.
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		ip, _, _ := strings.Cut(xff, ",")
		return strings.TrimSpace(ip)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// limiter allows n events per window per key, in memory.
type limiter struct {
	mu     sync.Mutex
	n      int
	window time.Duration
	hits   map[string][]time.Time
}

func newLimiter(n int, window time.Duration) *limiter {
	return &limiter{n: n, window: window, hits: map[string][]time.Time{}}
}

func (l *limiter) allow(key string, now time.Time) bool {
	if l.n <= 0 {
		return true
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	recent := l.hits[key][:0]
	for _, t := range l.hits[key] {
		if now.Sub(t) < l.window {
			recent = append(recent, t)
		}
	}
	if len(recent) >= l.n {
		l.hits[key] = recent
		return false
	}
	l.hits[key] = append(recent, now)
	return true
}
