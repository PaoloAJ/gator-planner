// Package term converts between UF term codes and human labels.
//
// A term code is "2" + two-digit year + semester digit, where spring is 1,
// summer is 5, and fall is 8. Spring 2027 is "2271".
package term

import (
	"fmt"
	"strconv"
	"time"
)

type Semester int

const (
	Spring Semester = 1
	Summer Semester = 5
	Fall   Semester = 8
)

func (s Semester) String() string {
	switch s {
	case Spring:
		return "Spring"
	case Summer:
		return "Summer"
	case Fall:
		return "Fall"
	}
	return "Unknown"
}

func Code(year int, s Semester) string {
	return fmt.Sprintf("2%02d%d", year%100, s)
}

// Parse splits a term code into its year and semester.
func Parse(code string) (year int, s Semester, err error) {
	if len(code) != 4 || code[0] != '2' {
		return 0, 0, fmt.Errorf("term: malformed code %q", code)
	}
	yy, err := strconv.Atoi(code[1:3])
	if err != nil {
		return 0, 0, fmt.Errorf("term: malformed code %q", code)
	}
	switch Semester(code[3] - '0') {
	case Spring, Summer, Fall:
		s = Semester(code[3] - '0')
	default:
		return 0, 0, fmt.Errorf("term: unknown semester in %q", code)
	}
	return 2000 + yy, s, nil
}

// Label turns "2271" into "Spring 2027".
func Label(code string) (string, error) {
	year, s, err := Parse(code)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%s %d", s, year), nil
}

// Current is the term in session at t: Jan–Apr spring, May–Jul summer,
// Aug–Dec fall.
func Current(t time.Time) string {
	switch m := t.Month(); {
	case m <= time.April:
		return Code(t.Year(), Spring)
	case m <= time.July:
		return Code(t.Year(), Summer)
	default:
		return Code(t.Year(), Fall)
	}
}

// Next returns the term after code.
func Next(code string) string {
	year, s, err := Parse(code)
	if err != nil {
		return ""
	}
	switch s {
	case Spring:
		return Code(year, Summer)
	case Summer:
		return Code(year, Fall)
	default:
		return Code(year+1, Spring)
	}
}

// Window returns the current term followed by the next n-1 terms.
func Window(t time.Time, n int) []string {
	codes := []string{Current(t)}
	for len(codes) < n {
		codes = append(codes, Next(codes[len(codes)-1]))
	}
	return codes
}
