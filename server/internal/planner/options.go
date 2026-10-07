package planner

import (
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"gatorplan/internal/prereq"
	"gatorplan/internal/term"
)

// Options are the student's planning preferences. Everything here comes from
// the browser, so Check validates and cleans it before anything else runs.
type Options struct {
	StartTerm string `json:"startTerm"` // first term to plan; default: the next term
	// TargetTerm is the latest term the student wants to graduate in. When
	// set it ends the planning window; otherwise NumTerms does.
	TargetTerm       string `json:"targetTerm"`
	NumTerms         int    `json:"numTerms"`
	IncludeSummer    bool   `json:"includeSummer"`
	MaxCredits       int    `json:"maxCredits"`       // per fall/spring term
	MinCredits       int    `json:"minCredits"`       // per fall/spring term (soft)
	MaxSummerCredits int    `json:"maxSummerCredits"` // per summer term
	// AwayTerms are terms with no courses (co-op, study abroad, leave).
	AwayTerms   []string `json:"awayTerms"`
	Pace        string   `json:"pace"` // balanced, front-load, steady
	Interests   []string `json:"interests"`
	PreferRated bool     `json:"preferHighlyRated"`
	MustTake    []string `json:"mustTake"`
	Avoid       []string `json:"avoid"`
	// Notes is the student's free-text instructions. It's treated as
	// preferences, never as rules: the validator still has the last word.
	Notes string `json:"notes"`
	// Answers to the agent's clarifying questions, from a previous run.
	Answers       []Answer `json:"answers"`
	SkipQuestions bool     `json:"skipQuestions"`
}

type Answer struct {
	Question string `json:"question"`
	Answer   string `json:"answer"`
}

// Limits on student-supplied input.
const (
	MaxNotes       = 1000 // characters
	maxInterests   = 8
	maxInterestLen = 40
	maxCodeList    = 10
	maxAnswers     = 3
	maxAnswerLen   = 300
	maxAwayTerms   = 6
	maxWindow      = 18 // terms: six years with summers
)

var paces = map[string]string{
	"balanced":   "Mix harder and easier courses in every term.",
	"front-load": "Take the hardest required courses as early as prerequisites allow.",
	"steady":     "Keep every term manageable; avoid stacking difficult courses together.",
}

var courseCode = regexp.MustCompile(`^[A-Z]{3}[0-9]{4}[A-Z]?$`)

func (o Options) withDefaults(now time.Time) Options {
	if o.StartTerm == "" {
		o.StartTerm = term.Next(term.Current(now))
	}
	if o.NumTerms <= 0 || o.NumTerms > 12 {
		o.NumTerms = 8
	}
	if o.MaxCredits <= 0 {
		o.MaxCredits = 18
	}
	if o.MinCredits <= 0 {
		o.MinCredits = min(12, o.MaxCredits)
	}
	if o.MaxSummerCredits <= 0 {
		o.MaxSummerCredits = 9
	}
	if o.Pace == "" {
		o.Pace = "balanced"
	}
	return o
}

// Window lists the term codes the plan may use, in order. Away terms are
// included (they stay empty) so the timeline shows them.
func (o Options) Window() []string {
	var out []string
	code := o.StartTerm
	for i := 0; i < 3*maxWindow; i++ {
		if _, s, err := term.Parse(code); err != nil {
			break
		} else if s != term.Summer || o.IncludeSummer {
			out = append(out, code)
		}
		if o.TargetTerm != "" {
			if code >= o.TargetTerm || len(out) >= maxWindow {
				break
			}
		} else if len(out) >= o.NumTerms {
			break
		}
		code = term.Next(code)
	}
	return out
}

func (o Options) away(code string) bool {
	for _, a := range o.AwayTerms {
		if a == code {
			return true
		}
	}
	return false
}

// Check validates and cleans the options in place. Its errors are written
// for the student.
func (o *Options) Check(now time.Time) error {
	*o = o.withDefaults(now)

	if _, _, err := term.Parse(o.StartTerm); err != nil {
		return fmt.Errorf("start term %q isn't a valid term", o.StartTerm)
	}
	if o.StartTerm <= term.Current(now) {
		return fmt.Errorf("start term must be after the current term")
	}
	if o.TargetTerm != "" {
		if _, _, err := term.Parse(o.TargetTerm); err != nil {
			return fmt.Errorf("graduation term %q isn't a valid term", o.TargetTerm)
		}
		if o.TargetTerm < o.StartTerm {
			return fmt.Errorf("graduation term can't be before the start term")
		}
		if w := o.Window(); len(w) == 0 || w[len(w)-1] < o.TargetTerm {
			return fmt.Errorf("graduation term is more than six years out")
		}
	}
	if o.MaxCredits < 1 || o.MaxCredits > 21 {
		return fmt.Errorf("max credits must be between 1 and 21")
	}
	if o.MinCredits > o.MaxCredits {
		return fmt.Errorf("min credits can't exceed max credits")
	}
	if o.MaxSummerCredits < 1 || o.MaxSummerCredits > 15 {
		return fmt.Errorf("summer credits must be between 1 and 15")
	}
	if _, ok := paces[o.Pace]; !ok {
		return fmt.Errorf("unknown pace %q", o.Pace)
	}

	window := map[string]bool{}
	for _, c := range o.Window() {
		window[c] = true
	}
	if len(o.AwayTerms) > maxAwayTerms {
		return fmt.Errorf("at most %d terms away", maxAwayTerms)
	}
	for _, a := range o.AwayTerms {
		if !window[a] {
			return fmt.Errorf("term away %q isn't in the planning window", a)
		}
	}

	if len(o.Interests) > maxInterests {
		return fmt.Errorf("at most %d interests", maxInterests)
	}
	var interests []string
	for _, in := range o.Interests {
		in = cleanText(in)
		if utf8.RuneCountInString(in) > maxInterestLen {
			return fmt.Errorf("interests must be under %d characters each", maxInterestLen)
		}
		if in != "" {
			interests = append(interests, in)
		}
	}
	o.Interests = interests

	var err error
	if o.MustTake, err = codeList(o.MustTake, "courses to take"); err != nil {
		return err
	}
	if o.Avoid, err = codeList(o.Avoid, "courses to avoid"); err != nil {
		return err
	}
	for _, c := range o.MustTake {
		for _, a := range o.Avoid {
			if prereq.Base(c) == prereq.Base(a) {
				return fmt.Errorf("%s is in both “take” and “avoid”", c)
			}
		}
	}

	o.Notes = cleanText(o.Notes)
	if n := utf8.RuneCountInString(o.Notes); n > MaxNotes {
		return fmt.Errorf("instructions are %d characters; the limit is %d", n, MaxNotes)
	}

	if len(o.Answers) > maxAnswers {
		return fmt.Errorf("at most %d answers", maxAnswers)
	}
	for i := range o.Answers {
		o.Answers[i].Question = cleanText(o.Answers[i].Question)
		o.Answers[i].Answer = cleanText(o.Answers[i].Answer)
		if utf8.RuneCountInString(o.Answers[i].Question) > maxAnswerLen || utf8.RuneCountInString(o.Answers[i].Answer) > maxAnswerLen {
			return fmt.Errorf("answers must be under %d characters", maxAnswerLen)
		}
	}
	return nil
}

func codeList(codes []string, what string) ([]string, error) {
	if len(codes) > maxCodeList {
		return nil, fmt.Errorf("at most %d %s", maxCodeList, what)
	}
	var out []string
	seen := map[string]bool{}
	for _, c := range codes {
		c = prereq.Normalize(c)
		if c == "" || seen[c] {
			continue
		}
		if !courseCode.MatchString(c) {
			return nil, fmt.Errorf("%q isn't a course code (like COP3530) in %s", c, what)
		}
		seen[c] = true
		out = append(out, c)
	}
	return out, nil
}

var (
	emails = regexp.MustCompile(`[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`)
	// UFIDs are 8 digits; phone numbers and similar are caught too.
	longNumbers = regexp.MustCompile(`\b\d[\d -]{6,}\d\b`)
)

// cleanText is applied to every piece of student-written text before it can
// reach the model: control characters are dropped, likely personal data is
// redacted, and angle brackets are swapped for look-alikes so the text can't
// close or forge the tags it's wrapped in.
func cleanText(s string) string {
	s = strings.Map(func(r rune) rune {
		switch {
		case r == '\n' || r == '\t':
			return r
		case unicode.IsControl(r) || r == 0x200b || r == 0xfeff: // zero-width space, BOM
			return -1
		case r == '<':
			return '‹'
		case r == '>':
			return '›'
		}
		return r
	}, s)
	s = emails.ReplaceAllString(s, "[email removed]")
	s = longNumbers.ReplaceAllString(s, "[number removed]")
	for strings.Contains(s, "\n\n\n") {
		s = strings.ReplaceAll(s, "\n\n\n", "\n\n")
	}
	return strings.TrimSpace(s)
}

// clip trims model-written text to n characters for display.
func clip(s string, n int) string {
	s = strings.TrimSpace(strings.Map(func(r rune) rune {
		if unicode.IsControl(r) && r != '\n' {
			return -1
		}
		return r
	}, s))
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	return string([]rune(s)[:n-1]) + "…"
}
