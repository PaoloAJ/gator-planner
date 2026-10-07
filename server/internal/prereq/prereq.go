// Package prereq parses UF's free-text prerequisite strings into boolean
// rules that can be checked against a set of completed courses.
//
// The Schedule of Courses writes them like
//
//	Prereq: (COP 3504 or COP 3503) and COT 3100 and (MAC 2234 or MAC 2312),
//	all with a minimum grade of C.
//
// Course codes, "and", "or", commas, and parentheses are understood; any
// other condition ("instructor permission", "junior standing") is reported
// as a note rather than enforced.
package prereq

import (
	"regexp"
	"strings"
)

// Rule is a parsed requirement. A nil Rule is always satisfied.
type Rule interface {
	// Satisfied reports whether have() covers the rule.
	Satisfied(have func(code string) bool) bool
	String() string
}

type courseRule string

type allRule []Rule

type anyRule []Rule

func (c courseRule) Satisfied(have func(string) bool) bool { return have(string(c)) }
func (c courseRule) String() string                        { return string(c) }

func (a allRule) Satisfied(have func(string) bool) bool {
	for _, r := range a {
		if !r.Satisfied(have) {
			return false
		}
	}
	return true
}
func (a allRule) String() string { return join(a, " and ") }

func (a anyRule) Satisfied(have func(string) bool) bool {
	for _, r := range a {
		if r.Satisfied(have) {
			return true
		}
	}
	return len(a) == 0
}
func (a anyRule) String() string { return join(a, " or ") }

func join[T ~[]Rule](rs T, sep string) string {
	parts := make([]string, len(rs))
	for i, r := range rs {
		s := r.String()
		if _, nested := r.(courseRule); !nested && len(rs) > 1 {
			s = "(" + s + ")"
		}
		parts[i] = s
	}
	return strings.Join(parts, sep)
}

// Parsed is the result of parsing one course's prerequisite text.
type Parsed struct {
	Prereq Rule // must be completed in an earlier term
	Coreq  Rule // may be taken in the same term or earlier
	// Notes lists conditions that aren't course codes, e.g. "consent of
	// instructor"; they are surfaced to the student, not enforced.
	Notes []string
}

var (
	coreqSplit = regexp.MustCompile(`(?i)\b(?:prereq(?:uisite)?s?\s+or\s+)?co-?req(?:uisite)?s?\s*:`)
	prereqHead = regexp.MustCompile(`(?i)^\s*pre-?req(?:uisite)?s?\s*:\s*`)
	token      = regexp.MustCompile(`(?i)[A-Z]{3}\s?[0-9]{4}[A-Z]?|\(|\)|\band\b|\bor\b|,|;`)
	codeToken  = regexp.MustCompile(`(?i)^[A-Z]{3}\s?[0-9]{4}[A-Z]?$`)
	// Conditions worth telling the student about.
	conditions = regexp.MustCompile(`(?i)(consent|permission|instructor|standing|admission|admitted|majors? only|department|approval|placement|score)`)
)

// Parse reads a prerequisite string. It never fails: text it can't make
// sense of becomes a nil rule plus a note.
func Parse(text string) Parsed {
	var p Parsed
	text = strings.TrimSpace(text)
	if text == "" {
		return p
	}

	pre, co := text, ""
	if loc := coreqSplit.FindStringIndex(text); loc != nil {
		pre, co = text[:loc[0]], text[loc[1]:]
	}
	pre = prereqHead.ReplaceAllString(pre, "")

	p.Prereq = parseExpr(pre)
	p.Coreq = parseExpr(co)
	if m := conditions.FindString(text); m != "" {
		p.Notes = append(p.Notes, strings.TrimSpace(text))
	}
	return p
}

func parseExpr(s string) Rule {
	ps := &parser{toks: resolveCommas(token.FindAllString(s, -1))}
	// A stray ")" stops or(); keep going so nothing after it is dropped.
	var parts allRule
	for ps.i < len(ps.toks) {
		start := ps.i
		parts = append(parts, ps.or())
		if ps.i == start {
			ps.i++
		}
	}
	return simplify(parts)
}

// resolveCommas gives each list comma the conjunction that ends its list:
// "A, B or C" means any of the three, "A, B, and C" means all of them. A
// comma with no conjunction after it (at the same nesting depth) is "and".
func resolveCommas(toks []string) []string {
	out := make([]string, len(toks))
	copy(out, toks)
	for i, t := range out {
		if t != "," {
			continue
		}
		op, depth := "and", 0
	scan:
		for _, next := range toks[i+1:] {
			switch strings.ToLower(next) {
			case "(":
				depth++
			case ")":
				if depth == 0 {
					break scan
				}
				depth--
			case ";":
				if depth == 0 {
					break scan
				}
			case "and", "or":
				if depth == 0 {
					op = strings.ToLower(next)
					break scan
				}
			}
		}
		out[i] = op
	}
	return out
}

type parser struct {
	toks []string
	i    int
}

func (p *parser) peek() string {
	if p.i < len(p.toks) {
		return strings.ToLower(p.toks[p.i])
	}
	return ""
}

func (p *parser) or() Rule {
	var alts anyRule
	if r := p.and(); r != nil {
		alts = append(alts, r)
	}
	for p.peek() == "or" {
		p.i++
		if r := p.and(); r != nil {
			alts = append(alts, r)
		}
	}
	return alts
}

// and treats semicolons (and any comma resolveCommas left as-is) as "and".
func (p *parser) and() Rule {
	var all allRule
	for {
		if r := p.factor(); r != nil {
			all = append(all, r)
		}
		switch p.peek() {
		case "and", ",", ";":
			p.i++
			continue
		}
		return all
	}
}

func (p *parser) factor() Rule {
	switch t := p.peek(); {
	case t == "(":
		p.i++
		r := p.or()
		if p.peek() == ")" {
			p.i++
		}
		return r
	case codeToken.MatchString(t):
		p.i++
		return courseRule(Normalize(t))
	case t == ")" || t == "":
		return nil
	default:
		// Stray operator; skip it.
		p.i++
		return nil
	}
}

func simplify(r Rule) Rule {
	switch v := r.(type) {
	case allRule:
		var out allRule
		for _, c := range v {
			switch c := simplify(c).(type) {
			case nil:
			case allRule: // (A and B) and C → A and B and C
				out = append(out, c...)
			default:
				out = append(out, c)
			}
		}
		switch len(out) {
		case 0:
			return nil
		case 1:
			return out[0]
		}
		return out
	case anyRule:
		var out anyRule
		for _, c := range v {
			switch c := simplify(c).(type) {
			case nil:
			case anyRule:
				out = append(out, c...)
			default:
				out = append(out, c)
			}
		}
		switch len(out) {
		case 0:
			return nil
		case 1:
			return out[0]
		}
		return out
	}
	return r
}

// Normalize uppercases a code and removes the space: "cop 3530" → "COP3530".
func Normalize(code string) string {
	return strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(code), " ", ""))
}

// Base strips a trailing letter suffix: "COP3502C" → "COP3502". UF
// prerequisite text often names the base number of a combined lecture/lab
// course.
func Base(code string) string {
	code = Normalize(code)
	if n := len(code); n == 8 && code[n-1] >= 'A' && code[n-1] <= 'Z' {
		return code[:n-1]
	}
	return code
}

// Has builds a membership check that treats "COP3502" and "COP3502C" as the
// same course.
func Has(codes map[string]bool) func(string) bool {
	bases := make(map[string]bool, len(codes))
	for c := range codes {
		bases[Base(c)] = true
	}
	return func(code string) bool { return bases[Base(code)] }
}
