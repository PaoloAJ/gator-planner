// Package rmp fetches professor ratings from RateMyProfessors' GraphQL API and
// matches them to UF instructor names.
package rmp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode"

	"golang.org/x/text/unicode/norm"

	"gatorplan/internal/catalog"
)

const endpoint = "https://www.ratemyprofessors.com/graphql"

type Teacher struct {
	LegacyID       int      `json:"legacyId"`
	FirstName      string   `json:"firstName"`
	LastName       string   `json:"lastName"`
	Department     string   `json:"department"`
	AvgRating      float64  `json:"avgRating"`
	AvgDifficulty  float64  `json:"avgDifficulty"`
	NumRatings     int      `json:"numRatings"`
	WouldTakeAgain *float64 `json:"wouldTakeAgainPercent"`
}

func (t Teacher) Rating() *catalog.Rating {
	if t.NumRatings == 0 {
		return nil
	}
	r := &catalog.Rating{
		LegacyID:   t.LegacyID,
		Quality:    t.AvgRating,
		Difficulty: t.AvgDifficulty,
		NumRatings: t.NumRatings,
	}
	// RMP reports -1 when nobody answered "would take again".
	if t.WouldTakeAgain != nil && *t.WouldTakeAgain >= 0 {
		r.WouldTakeAgain = t.WouldTakeAgain
	}
	return r
}

type Client struct {
	HTTP     *http.Client
	PageSize int
}

func NewClient() *Client {
	return &Client{HTTP: &http.Client{Timeout: 60 * time.Second}, PageSize: 1000}
}

const query = `query TeacherSearch($q: TeacherSearchQuery!, $n: Int, $c: String) {
  search: newSearch {
    teachers(query: $q, first: $n, after: $c) {
      pageInfo { hasNextPage endCursor }
      edges { node { legacyId firstName lastName department avgRating avgDifficulty numRatings wouldTakeAgainPercent } }
    }
  }
}`

// FetchSchool returns every teacher RMP lists for a school.
func (c *Client) FetchSchool(ctx context.Context, schoolID string) ([]Teacher, error) {
	var all []Teacher
	var cursor *string
	for page := 0; page < 200; page++ {
		body, _ := json.Marshal(map[string]any{
			"query": query,
			"variables": map[string]any{
				"q": map[string]any{"text": "", "schoolID": schoolID, "fallback": false},
				"n": c.PageSize,
				"c": cursor,
			},
		})
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")
		// RMP's public web client sends this fixed credential ("test:test").
		req.Header.Set("Authorization", "Basic dGVzdDp0ZXN0")
		req.Header.Set("User-Agent", "Mozilla/5.0 (GatorPlan class planner)")

		resp, err := c.HTTP.Do(req)
		if err != nil {
			return nil, err
		}
		var out struct {
			Data struct {
				Search struct {
					Teachers struct {
						PageInfo struct {
							HasNextPage bool   `json:"hasNextPage"`
							EndCursor   string `json:"endCursor"`
						} `json:"pageInfo"`
						Edges []struct {
							Node Teacher `json:"node"`
						} `json:"edges"`
					} `json:"teachers"`
				} `json:"search"`
			} `json:"data"`
			Errors []struct {
				Message string `json:"message"`
			} `json:"errors"`
		}
		err = json.NewDecoder(resp.Body).Decode(&out)
		resp.Body.Close()
		if err != nil {
			return nil, fmt.Errorf("rmp: decode page %d: %w", page, err)
		}
		if resp.StatusCode != http.StatusOK || len(out.Errors) > 0 {
			msg := resp.Status
			if len(out.Errors) > 0 {
				msg = out.Errors[0].Message
			}
			return nil, fmt.Errorf("rmp: page %d: %s", page, msg)
		}

		t := out.Data.Search.Teachers
		for _, e := range t.Edges {
			all = append(all, e.Node)
		}
		if !t.PageInfo.HasNextPage {
			return all, nil
		}
		cursor = &t.PageInfo.EndCursor
	}
	return nil, fmt.Errorf("rmp: too many pages")
}

// Index matches instructor names against a set of teachers.
type Index struct {
	full      map[string]Teacher // "first last"
	firstLast map[string]Teacher // first token + last token, for middle names
}

func NewIndex(teachers []Teacher) *Index {
	idx := &Index{full: map[string]Teacher{}, firstLast: map[string]Teacher{}}
	put := func(m map[string]Teacher, key string, t Teacher) {
		// Duplicate profiles are common; keep the one with the most ratings.
		if prev, ok := m[key]; !ok || t.NumRatings > prev.NumRatings {
			m[key] = t
		}
	}
	for _, t := range teachers {
		name := NormalizeName(t.FirstName + " " + t.LastName)
		if name == "" {
			continue
		}
		put(idx.full, name, t)
		put(idx.firstLast, firstLastKey(name), t)
	}
	return idx
}

// Match looks a UF instructor name up by exact normalized name, then by first
// and last name only.
func (idx *Index) Match(name string) (Teacher, bool) {
	n := NormalizeName(name)
	if n == "" {
		return Teacher{}, false
	}
	if t, ok := idx.full[n]; ok {
		return t, true
	}
	t, ok := idx.firstLast[firstLastKey(n)]
	return t, ok
}

// NormalizeName lowercases, strips accents and punctuation, and treats
// hyphens as spaces: "José Mendoza-García" → "jose mendoza garcia".
func NormalizeName(s string) string {
	var b strings.Builder
	for _, r := range norm.NFD.String(s) {
		switch {
		case unicode.Is(unicode.Mn, r):
			// drop combining accents
		case unicode.IsLetter(r):
			b.WriteRune(unicode.ToLower(r))
		case r == '-' || unicode.IsSpace(r):
			b.WriteRune(' ')
		}
	}
	return strings.Join(strings.Fields(b.String()), " ")
}

func firstLastKey(normalized string) string {
	f := strings.Fields(normalized)
	if len(f) < 2 {
		return normalized
	}
	return f[0] + " " + f[len(f)-1]
}
