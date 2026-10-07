package api

import (
	"bufio"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"

	"gatorplan/internal/audit"
	"gatorplan/internal/planner"
)

type fakePlanner struct {
	opts planner.Options
	ask  bool
}

func (f *fakePlanner) Run(_ context.Context, s *audit.Summary, opt planner.Options, emit func(planner.Event)) (*planner.Result, error) {
	f.opts = opt
	emit(planner.Event{Type: "status", Message: "working"})
	if f.ask {
		return &planner.Result{Questions: []planner.Question{{Question: "Which elective track?", Options: []string{"A", "B"}}}}, nil
	}
	return &planner.Result{Plan: &planner.Plan{Summary: "ok", Programs: s.Programs}}, nil
}

func post(h http.Handler, body string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/plan", strings.NewReader(body))
	req.Header.Set("X-Forwarded-For", "10.0.0.1")
	h.ServeHTTP(rec, req)
	return rec
}

func TestPlanStreamsNDJSON(t *testing.T) {
	sample, err := os.ReadFile("../audit/testdata/sample_audit.json")
	if err != nil {
		t.Fatal(err)
	}
	fp := &fakePlanner{}
	srv := New(&fakeCatalog{}, fp, 2)
	srv.now = func() time.Time { return time.Date(2026, 10, 7, 0, 0, 0, 0, time.UTC) }
	h := srv.Handler()

	rec := post(h, `{"audit":`+string(sample)+`,"startTerm":"2271","includeSummer":true,"notes":"email me at a@b.co"}`)
	if rec.Code != 200 || rec.Header().Get("Content-Type") != "application/x-ndjson" {
		t.Fatalf("status %d, type %q: %s", rec.Code, rec.Header().Get("Content-Type"), rec.Body)
	}
	var lines []string
	sc := bufio.NewScanner(rec.Body)
	for sc.Scan() {
		lines = append(lines, sc.Text())
	}
	if len(lines) != 2 || !strings.Contains(lines[0], `"status"`) || !strings.Contains(lines[1], `"plan"`) {
		t.Errorf("lines = %q", lines)
	}
	if fp.opts.StartTerm != "2271" || !fp.opts.IncludeSummer || fp.opts.Notes != "email me at [email removed]" {
		t.Errorf("options not checked and passed through: %+v", fp.opts)
	}

	post(h, `{"audit":`+string(sample)+`}`)
	if got := post(h, `{"audit":`+string(sample)+`}`).Code; got != http.StatusTooManyRequests {
		t.Errorf("third request = %d; want 429", got)
	}
}

func TestPlanStreamsQuestions(t *testing.T) {
	sample, _ := os.ReadFile("../audit/testdata/sample_audit.json")
	srv := New(&fakeCatalog{}, &fakePlanner{ask: true}, 0)
	srv.now = func() time.Time { return time.Date(2026, 10, 7, 0, 0, 0, 0, time.UTC) }
	rec := post(srv.Handler(), `{"audit":`+string(sample)+`,"startTerm":"2271"}`)
	if !strings.Contains(rec.Body.String(), `"type":"questions"`) || !strings.Contains(rec.Body.String(), "Which elective track?") {
		t.Errorf("body = %s", rec.Body)
	}
}

func TestPlanRejectsBadInput(t *testing.T) {
	sample, _ := os.ReadFile("../audit/testdata/sample_audit.json")
	audit := `{"audit":` + string(sample)
	srv := New(&fakeCatalog{}, &fakePlanner{}, 0)
	srv.now = func() time.Time { return time.Date(2026, 10, 7, 0, 0, 0, 0, time.UTC) }
	h := srv.Handler()
	for _, body := range []string{
		`nope`, `{"audit":{"foo":1}}`, `{}`,
		audit + `,"startTerm":"2271","pace":"yolo"}`,
		audit + `,"startTerm":"2271","mustTake":["not a code"]}`,
		audit + `,"startTerm":"2271","notes":"` + strings.Repeat("a", 1001) + `"}`,
		audit + `,"startTerm":"2271","maxCredits":40}`,
	} {
		if rec := post(h, body); rec.Code != http.StatusBadRequest {
			t.Errorf("body %.80s… = %d; want 400", body, rec.Code)
		}
	}
	if got := post(New(&fakeCatalog{}, nil, 0).Handler(), `{}`).Code; got != http.StatusServiceUnavailable {
		t.Errorf("disabled planner = %d; want 503", got)
	}
}

// Real *anthropic.Error values, produced by calling a fake API.
func TestPlanErrorMessages(t *testing.T) {
	cases := []struct {
		status int
		body   string
		want   string
	}{
		{400, `{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}`, "out of API credits"},
		{429, `{"type":"error","error":{"type":"rate_limit_error","message":"Rate limited"}}`, "busy right now"},
		{529, `{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}`, "busy right now"},
		{404, `{"type":"error","error":{"type":"not_found_error","message":"model: claude-x"}}`, "ANTHROPIC_MODEL"},
		{401, `{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}`, "ANTHROPIC_API_KEY"},
	}
	for _, c := range cases {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(c.status)
			w.Write([]byte(c.body))
		}))
		client := anthropic.NewClient(option.WithBaseURL(srv.URL), option.WithAPIKey("k"), option.WithMaxRetries(0))
		_, err := client.Messages.New(context.Background(), anthropic.MessageNewParams{
			Model: "claude-sonnet-5-5", MaxTokens: 1,
			Messages: []anthropic.MessageParam{anthropic.NewUserMessage(anthropic.NewTextBlock("hi"))},
		})
		srv.Close()
		if got := planErrorMessage(err); !strings.Contains(got, c.want) {
			t.Errorf("HTTP %d: %q; want it to mention %q", c.status, got, c.want)
		}
	}
}
