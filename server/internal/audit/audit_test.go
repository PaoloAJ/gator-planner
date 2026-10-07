package audit

import (
	"encoding/json"
	"os"
	"slices"
	"strings"
	"testing"
)

func load(t *testing.T) *Summary {
	t.Helper()
	data, err := os.ReadFile("testdata/sample_audit.json")
	if err != nil {
		t.Fatal(err)
	}
	s, err := Parse(data)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestParse(t *testing.T) {
	s := load(t)

	if len(s.Programs) != 2 || s.Programs[0].Name != "Computer Science" || s.Programs[1].Type != "Minor" {
		t.Errorf("programs = %+v", s.Programs)
	}

	var codes []string
	for _, c := range s.Completed {
		codes = append(codes, c.Code)
	}
	if want := []string{"COP3502C", "COP3503C", "MAC2311", "PHY2048"}; !slices.Equal(codes, want) {
		t.Errorf("completed = %v; want %v", codes, want)
	}
	if s.Credits != 15 {
		t.Errorf("credits = %v; want 15", s.Credits)
	}

	var titles []string
	for _, r := range s.Requirements {
		titles = append(titles, r.Title)
	}
	want := []string{
		"Computer Science Core › Data Structures",
		"Computer Science Core › Operating Systems",
		"Technical Electives",
		"Engineering Innovation Minor › Minor Core",
	}
	if !slices.Equal(titles, want) {
		t.Fatalf("unmet = %q\nwant    %q", titles, want)
	}
	if got := s.Requirements[0].Options; !slices.Equal(got, []string{"COP3530"}) {
		t.Errorf("options = %v", got)
	}
	if got := s.Requirements[2].Options; !slices.Equal(got, []string{"CAP4XXX", "CIS4301"}) {
		t.Errorf("wildcard options = %v", got)
	}
	if got := s.Requirements[3].Options; !slices.Equal(got, []string{"EIN4243C"}) {
		t.Errorf("array coursesAvailable = %v", got)
	}
	if s.Requirements[2].Description != "Complete 6 credits from CAP 4XXX or CIS 4301 & related courses." || s.Requirements[2].UnitsNeeded != 6 {
		t.Errorf("electives = %+v", s.Requirements[2])
	}
	if len(s.Notes) != 1 || !strings.Contains(s.Notes[0], "Complete COP 3530") {
		t.Errorf("notes = %q", s.Notes)
	}
}

// The summary is what reaches the model; it must not carry identity or grades.
func TestSummaryOmitsPersonalData(t *testing.T) {
	b, _ := json.Marshal(load(t))
	for _, leak := range []string{"Test Student", "12345678", "ufid", "grade", "gpa"} {
		if strings.Contains(strings.ToLower(string(b)), strings.ToLower(leak)) {
			t.Errorf("summary contains %q", leak)
		}
	}
}

func TestParseRejectsOtherJSON(t *testing.T) {
	for _, in := range []string{`{}`, `[]`, `not json`, `{"careers": []}`} {
		if _, err := Parse([]byte(in)); err == nil {
			t.Errorf("Parse(%s) succeeded", in)
		}
	}
}
