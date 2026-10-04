// Package soc scrapes UF's Schedule of Courses API.
package soc

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"gatorplan/internal/catalog"
)

// ErrSessionRejected means UF answered with something other than JSON, which
// is what an expired or invalid ONEUF_SESSION cookie looks like.
var ErrSessionRejected = errors.New("soc: non-JSON response (ONEUF_SESSION expired or invalid?)")

type Client struct {
	BaseURL string
	// Session is the ONEUF_SESSION cookie value. Blank scrapes anonymously.
	Session   string
	HTTP      *http.Client
	PageDelay time.Duration // politeness delay between pages

	// Dump, when set, receives the raw body of the first page.
	Dump io.Writer
}

func NewClient(baseURL, session string) *Client {
	return &Client{
		BaseURL:   baseURL,
		Session:   session,
		HTTP:      &http.Client{Timeout: 60 * time.Second},
		PageDelay: 250 * time.Millisecond,
	}
}

const maxPages = 2000

// FetchTerm pulls every course in a term, following LASTCONTROLNUMBER
// pagination, and returns them normalized.
func (c *Client) FetchTerm(ctx context.Context, termCode string) ([]catalog.Course, error) {
	var all []rawCourse
	last, retrieved := 0, 0
	for i := 0; i < maxPages; i++ {
		p, err := c.fetchPage(ctx, termCode, last, i == 0)
		if err != nil {
			return nil, fmt.Errorf("term %s page %d: %w", termCode, i, err)
		}
		all = append(all, p.Courses...)
		retrieved += p.RetrievedRows
		// LASTCONTROLNUMBER is an opaque cursor, not a row count; TOTALROWS
		// is compared against rows retrieved so far.
		if p.RetrievedRows == 0 || len(p.Courses) == 0 || p.LastControlNumber <= last {
			return Normalize(all), nil
		}
		if p.TotalRows > 0 && retrieved >= p.TotalRows {
			return Normalize(all), nil
		}
		last = p.LastControlNumber

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(c.PageDelay):
		}
	}
	return nil, fmt.Errorf("term %s: gave up after %d pages", termCode, maxPages)
}

func (c *Client) fetchPage(ctx context.Context, termCode string, last int, first bool) (*page, error) {
	q := url.Values{
		"category":            {"CWSP"},
		"term":                {termCode},
		"last-control-number": {fmt.Sprint(last)},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+"?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "GatorPlan/0.1 (UF class planner)")
	if cookie := c.cookieHeader(); cookie != "" {
		req.Header.Set("Cookie", cookie)
	}

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return nil, ErrSessionRejected
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("soc: HTTP %d", resp.StatusCode)
	}
	if first && c.Dump != nil {
		c.Dump.Write(body)
	}

	var pages []page
	if err := json.Unmarshal(body, &pages); err != nil {
		if trimmed := strings.TrimSpace(string(body)); !strings.HasPrefix(trimmed, "[") {
			return nil, ErrSessionRejected
		}
		return nil, fmt.Errorf("soc: decode: %w", err)
	}
	if len(pages) == 0 {
		return &page{}, nil
	}
	return &pages[0], nil
}

// cookieHeader accepts either the bare cookie value or a pasted
// "ONEUF_SESSION=..." / full Cookie header.
func (c *Client) cookieHeader() string {
	s := strings.TrimSpace(c.Session)
	if s == "" {
		return ""
	}
	if strings.Contains(s, "=") {
		return strings.TrimPrefix(s, "Cookie: ")
	}
	return "ONEUF_SESSION=" + s
}

// TimesAvailable reports whether a scrape carried meeting times or seat
// counts. Anonymous (or expired-session) scrapes return neither for any
// section.
func TimesAvailable(courses []catalog.Course) bool {
	for _, c := range courses {
		for _, s := range c.Sections {
			if len(s.Meetings) > 0 || s.OpenSeats != nil {
				return true
			}
		}
	}
	return false
}
