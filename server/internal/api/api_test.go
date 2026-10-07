package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"gatorplan/internal/catalog"
	"gatorplan/internal/store"
)

type fakeCatalog struct {
	lastQuery string
}

func (f *fakeCatalog) Ping(context.Context) error { return nil }

func (f *fakeCatalog) Terms(context.Context) ([]catalog.Term, error) {
	return []catalog.Term{{Code: "2268", Label: "Fall 2026"}, {Code: "2271", Label: "Spring 2027"}}, nil
}

func (f *fakeCatalog) Search(_ context.Context, _, q string, _ int) ([]catalog.SearchResult, error) {
	f.lastQuery = q
	return []catalog.SearchResult{{Code: "COP3530", Name: "Data Structures"}}, nil
}

func (f *fakeCatalog) Course(_ context.Context, termCode, code string) (*catalog.Course, error) {
	if code != "COP3530" {
		return nil, store.ErrNotFound
	}
	return &catalog.Course{Code: code, Sections: []catalog.Section{}}, nil
}

func get(t *testing.T, h http.Handler, path string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec
}

func TestTermsMarksSuggested(t *testing.T) {
	s := New(&fakeCatalog{}, nil, 0)
	s.now = func() time.Time { return time.Date(2026, 10, 3, 0, 0, 0, 0, time.UTC) }
	rec := get(t, s.Handler(), "/api/terms")
	var terms []catalog.Term
	json.NewDecoder(rec.Body).Decode(&terms)
	if rec.Code != 200 || terms[0].Suggested || !terms[1].Suggested {
		t.Fatalf("status %d, terms %+v; want Spring 2027 suggested", rec.Code, terms)
	}
	if rec.Header().Get("Cache-Control") == "" {
		t.Error("missing Cache-Control")
	}
}

func TestCourseRoutes(t *testing.T) {
	h := New(&fakeCatalog{}, nil, 0).Handler()
	cases := map[string]int{
		"/api/terms/2271/courses/COP3530":      200,
		"/api/terms/2271/courses/cop3530":      200, // case-insensitive
		"/api/terms/2271/courses/COP9999":      404,
		"/api/terms/2271/courses/DROP;--":      400,
		"/api/terms/9999/courses/COP3530":      400,
		"/api/terms/2271/search?q=x&limit=500": 400,
	}
	for path, want := range cases {
		if got := get(t, h, path).Code; got != want {
			t.Errorf("GET %s = %d; want %d", path, got, want)
		}
	}
}

func TestSearchPassesQuery(t *testing.T) {
	f := &fakeCatalog{}
	rec := get(t, New(f, nil, 0).Handler(), "/api/terms/2271/search?q=+data+struct+")
	if rec.Code != 200 || f.lastQuery != "data struct" {
		t.Fatalf("status %d, query %q", rec.Code, f.lastQuery)
	}
}
