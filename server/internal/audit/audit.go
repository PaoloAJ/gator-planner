// Package audit reads a UF degree audit (the JSON ONE.UF's degree audit page
// loads) into a compact summary for planning.
//
// The summary deliberately omits the student's name, UFID, grades, and GPA:
// planning doesn't need them, and the summary is what gets sent to the model.
package audit

import (
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"regexp"
	"sort"
	"strings"
)

type Program struct {
	Code        string `json:"code"`        // "CPS_BSCS"
	Type        string `json:"type"`        // "Major", "Minor"
	Name        string `json:"name"`        // "Computer Science"
	CatalogYear int    `json:"catalogYear"` // term code, e.g. 2248
}

type Course struct {
	Code       string  `json:"code"` // "COP3502C"
	Name       string  `json:"name"`
	Credits    float64 `json:"credits"`
	Term       string  `json:"term"` // "Fall 2024"
	Transfer   bool    `json:"transfer,omitempty"`
	InProgress bool    `json:"inProgress,omitempty"`
}

// Requirement is one unmet leaf of the audit's requirement tree.
type Requirement struct {
	Program       string   `json:"program"` // plan code it belongs to
	Title         string   `json:"title"`   // "Group › Requirement › Sub-requirement"
	Description   string   `json:"description,omitempty"`
	CoursesNeeded float64  `json:"coursesNeeded,omitempty"`
	UnitsNeeded   float64  `json:"unitsNeeded,omitempty"`
	Options       []string `json:"options,omitempty"` // course codes or patterns like "CAP4XXX"
}

type Summary struct {
	Programs     []Program     `json:"programs"`
	Completed    []Course      `json:"completed"` // includes in-progress courses
	Credits      float64       `json:"creditsCompleted"`
	Requirements []Requirement `json:"unmetRequirements"`
	// Notes are free-text rules from the audit that affect sequencing, such
	// as critical-tracking deadlines.
	Notes []string `json:"notes,omitempty"`
}

// CompletedCodes returns the set of completed or in-progress course codes.
func (s *Summary) CompletedCodes() map[string]bool {
	m := make(map[string]bool, len(s.Completed))
	for _, c := range s.Completed {
		m[c.Code] = true
	}
	return m
}

// --- raw audit JSON -------------------------------------------------------

type rawAudit struct {
	Careers []struct {
		CareerCode string `json:"careerCode"`
		Programs   []struct {
			Plans []struct {
				Plan                string `json:"plan"`
				PlanTypeDescription string `json:"planTypeDescription"`
				PlanDescription     string `json:"planDescription"`
				CatalogYear         int    `json:"catalogYear"`
			} `json:"plans"`
		} `json:"programs"`
		PlanGroups [][]node `json:"planGroups"`
	} `json:"careers"`
}

type node struct {
	Status           string          `json:"status"`
	Met              bool            `json:"met"`
	InProgress       bool            `json:"inProgress"`
	Title            string          `json:"title"`
	Description      string          `json:"description"`
	UnitsNeeded      float64         `json:"unitsNeeded"`
	CourseNeeded     float64         `json:"courseNeeded"`
	AcademicPlan     string          `json:"academicPlan"`
	CoursesTaken     []taken         `json:"coursesTaken"`
	CoursesAvailable json.RawMessage `json:"coursesAvailable"`
	Requirements     []node          `json:"requirements"`
	SubRequirements  []node          `json:"subRequirements"`
}

type taken struct {
	TermDescription string          `json:"termDescription"`
	CourseName      string          `json:"courseName"`
	CourseType      string          `json:"courseType"` // EN at UF, TR transfer, ...
	Credit          float64         `json:"credit"`
	InProgress      bool            `json:"inProgress"`
	Subject         string          `json:"subject"`
	CatalogNumber   json.RawMessage `json:"catalogNumber"` // 2311 or "3502C"
}

const (
	maxDescription = 600
	maxNote        = 2500
)

// Parse summarizes a degree audit. It accepts the raw JSON exactly as ONE.UF
// returns it.
func Parse(data []byte) (*Summary, error) {
	var raw rawAudit
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("audit: not valid degree-audit JSON: %w", err)
	}
	if len(raw.Careers) == 0 {
		return nil, errors.New(`audit: no "careers" found; paste the full degree audit response`)
	}

	s := &Summary{}
	courses := map[string]Course{}
	seenReq := map[string]bool{}

	for _, career := range raw.Careers {
		for _, p := range career.Programs {
			for _, pl := range p.Plans {
				s.Programs = append(s.Programs, Program{
					Code:        pl.Plan,
					Type:        pl.PlanTypeDescription,
					Name:        strings.TrimSpace(pl.PlanDescription),
					CatalogYear: pl.CatalogYear,
				})
			}
		}

		var walk func(n node, path []string)
		walk = func(n node, path []string) {
			title := cleanText(n.Title)
			if title != "" {
				path = append(path, title)
			}
			for _, t := range n.CoursesTaken {
				c := t.course()
				if c.Code == "" {
					continue
				}
				if prev, ok := courses[c.Code]; !ok || (prev.InProgress && !c.InProgress) {
					courses[c.Code] = c
				}
			}

			if isNote(n) {
				s.Notes = append(s.Notes, truncate(title+": "+cleanText(n.Description), maxNote))
			}

			children := append(append([]node{}, n.Requirements...), n.SubRequirements...)
			if satisfied(n) {
				// Still visit children for courses taken.
				for _, c := range children {
					walk(c, path)
				}
				return
			}

			unmetChild := false
			for _, c := range children {
				if !satisfied(c) {
					unmetChild = true
				}
			}
			if !unmetChild {
				key := n.AcademicPlan + "|" + strings.Join(path, " › ")
				if !seenReq[key] {
					seenReq[key] = true
					s.Requirements = append(s.Requirements, Requirement{
						Program:       n.AcademicPlan,
						Title:         strings.Join(path, " › "),
						Description:   truncate(cleanText(n.Description), maxDescription),
						CoursesNeeded: n.CourseNeeded,
						UnitsNeeded:   n.UnitsNeeded,
						Options:       courseOptions(n),
					})
				}
			}
			for _, c := range children {
				walk(c, path)
			}
		}
		for _, group := range career.PlanGroups {
			for _, n := range group {
				walk(n, nil)
			}
		}
	}

	for _, c := range courses {
		s.Completed = append(s.Completed, c)
		s.Credits += c.Credits
	}
	sort.Slice(s.Completed, func(i, j int) bool { return s.Completed[i].Code < s.Completed[j].Code })
	return s, nil
}

func satisfied(n node) bool {
	return n.Met || n.Status == "COMP" || n.InProgress || n.Status == "IP"
}

// isNote keeps long policy text that changes how courses must be sequenced.
func isNote(n node) bool {
	t := strings.ToLower(n.Title)
	return strings.Contains(t, "critical tracking progress") && n.Description != ""
}

func (t taken) course() Course {
	num := strings.Trim(string(t.CatalogNumber), `"`)
	subject := strings.ToUpper(strings.TrimSpace(t.Subject))
	if subject == "" || num == "" || num == "null" {
		return Course{}
	}
	return Course{
		Code:       subject + strings.ToUpper(num),
		Name:       strings.TrimSpace(t.CourseName),
		Credits:    t.Credit,
		Term:       t.TermDescription,
		Transfer:   t.CourseType == "TR",
		InProgress: t.InProgress,
	}
}

// codePattern matches "COP 3530", "COP3503C", and wildcards like "CAP 4XXX".
var codePattern = regexp.MustCompile(`\b([A-Z]{3})\s?([0-9][0-9X]{3}[A-Z]?)\b`)

func courseOptions(n node) []string {
	text := string(n.CoursesAvailable)
	var s string
	if json.Unmarshal(n.CoursesAvailable, &s) == nil {
		text = s
	}
	text += " " + n.Description

	seen := map[string]bool{}
	var out []string
	for _, m := range codePattern.FindAllStringSubmatch(text, -1) {
		code := m[1] + m[2]
		if !seen[code] {
			seen[code] = true
			out = append(out, code)
		}
	}
	return out
}

var tags = regexp.MustCompile(`<[^>]*>`)

func cleanText(s string) string {
	s = html.UnescapeString(tags.ReplaceAllString(s, " "))
	s = strings.ReplaceAll(s, "\r", "")
	lines := strings.Split(s, "\n")
	for i, l := range lines {
		lines[i] = strings.Join(strings.Fields(l), " ")
	}
	s = strings.Join(lines, "\n")
	for strings.Contains(s, "\n\n\n") {
		s = strings.ReplaceAll(s, "\n\n\n", "\n\n")
	}
	s = strings.TrimSpace(s)
	if s == "." {
		return ""
	}
	return s
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
