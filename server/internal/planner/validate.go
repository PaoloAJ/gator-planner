package planner

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"gatorplan/internal/audit"
	"gatorplan/internal/catalog"
	"gatorplan/internal/prereq"
	"gatorplan/internal/store"
	"gatorplan/internal/term"
)

// Catalog is the read access the planner needs.
type Catalog interface {
	Terms(ctx context.Context) ([]catalog.Term, error)
	Search(ctx context.Context, termCode, q string, limit int) ([]catalog.SearchResult, error)
	CourseFacts(ctx context.Context, codes []string) (map[string]store.CourseFacts, error)
}

// Plan is the planner's final output.
type Plan struct {
	Programs         []audit.Program `json:"programs"`
	CreditsCompleted float64         `json:"creditsCompleted"`
	CreditsPlanned   float64         `json:"creditsPlanned"`
	GraduationTerm   string          `json:"graduationTerm"` // label of the last term with courses
	Terms            []PlanTerm      `json:"terms"`
	Summary          string          `json:"summary"`
	Milestones       []string        `json:"milestones"`
	// PreferencesApplied is the agent's account of how the student's
	// preferences, instructions, and answers shaped the plan.
	PreferencesApplied string   `json:"preferencesApplied"`
	Answers            []Answer `json:"answers"`
	Unresolved         []string `json:"unresolved"`
	Warnings           []string `json:"warnings"`
	// Problems are validation errors left after the agent ran out of
	// attempts. Empty for a plan that passed every check.
	Problems []string `json:"problems"`
}

type PlanTerm struct {
	Code       string          `json:"code"`
	Label      string          `json:"label"`
	Credits    float64         `json:"credits"`
	Focus      string          `json:"focus"`
	Away       bool            `json:"away"`
	Workload   string          `json:"workload"`   // light, moderate, heavy
	Difficulty *float64        `json:"difficulty"` // credit-weighted RMP difficulty
	Courses    []PlannedCourse `json:"courses"`
}

type PlannedCourse struct {
	Code          string   `json:"code"`
	Name          string   `json:"name"`
	Credits       float64  `json:"credits"`
	Requirement   string   `json:"requirement"`
	Reason        string   `json:"reason"`
	Prerequisites string   `json:"prerequisites,omitempty"`
	Rating        *float64 `json:"rating"`
	Difficulty    *float64 `json:"difficulty"`
}

// draft is what the agent submits.
type draft struct {
	Terms []struct {
		Term    string `json:"term"`
		Focus   string `json:"focus"`
		Courses []struct {
			Code        string `json:"code"`
			Requirement string `json:"requirement"`
			Reason      string `json:"reason"`
		} `json:"courses"`
	} `json:"terms"`
	Summary            string   `json:"summary"`
	Milestones         []string `json:"milestones"`
	PreferencesApplied string   `json:"preferencesApplied"`
	Unresolved         []string `json:"unresolved"`
}

// Display limits on agent-written text.
const (
	maxSummary     = 1200
	maxApplied     = 800
	maxReason      = 300
	maxFocus       = 140
	maxRequirement = 200
	maxListItem    = 300
	maxMilestones  = 8
	maxUnresolved  = 15
)

// validate checks a draft against the student's history, preferences, and
// the catalog, and fills in catalog facts. Errors must be fixed by the agent;
// warnings are shown to the student.
func validate(ctx context.Context, cat Catalog, s *audit.Summary, opt Options, d draft) (Plan, []string, error) {
	plan := Plan{
		Programs:           s.Programs,
		CreditsCompleted:   s.Credits,
		Summary:            clip(d.Summary, maxSummary),
		PreferencesApplied: clip(d.PreferencesApplied, maxApplied),
		Answers:            opt.Answers,
	}
	for i, m := range d.Milestones {
		if i < maxMilestones {
			plan.Milestones = append(plan.Milestones, clip(m, maxListItem))
		}
	}
	for i, u := range d.Unresolved {
		if i < maxUnresolved {
			plan.Unresolved = append(plan.Unresolved, clip(u, maxListItem))
		}
	}
	var errs []string
	if plan.Summary == "" {
		errs = append(errs, "Write a summary for the student.")
	}

	window := opt.Window()
	position := map[string]int{}
	for i, c := range window {
		position[c] = i
	}

	var codes []string
	for _, t := range d.Terms {
		for _, c := range t.Courses {
			codes = append(codes, prereq.Normalize(c.Code))
		}
	}
	facts, err := cat.CourseFacts(ctx, codes)
	if err != nil {
		return plan, nil, err
	}
	seasonsInData, err := seasonsWithData(ctx, cat)
	if err != nil {
		return plan, nil, err
	}

	terms := d.Terms
	seenTerm := map[string]bool{}
	for _, t := range terms {
		if _, ok := position[t.Term]; !ok {
			errs = append(errs, fmt.Sprintf("Term %q is outside the planning window (%s).", t.Term, strings.Join(window, ", ")))
		}
		if seenTerm[t.Term] {
			errs = append(errs, fmt.Sprintf("Term %s appears more than once; merge its courses.", t.Term))
		}
		seenTerm[t.Term] = true
	}
	if len(errs) > 0 {
		return plan, errs, nil
	}
	sort.SliceStable(terms, func(i, j int) bool { return position[terms[i].Term] < position[terms[j].Term] })

	done := s.CompletedCodes()
	completedHas := prereq.Has(done)
	planned := map[string]string{} // base code → term label
	avoid := prereq.Has(toSet(opt.Avoid))

	for ti, t := range terms {
		label, _ := term.Label(t.Term)
		_, season, _ := term.Parse(t.Term)
		pt := PlanTerm{Code: t.Term, Label: label, Focus: clip(t.Focus, maxFocus)}
		has := prereq.Has(done)

		if opt.away(t.Term) && len(t.Courses) > 0 {
			errs = append(errs, fmt.Sprintf("%s is a term the student will be away; it must have no courses.", label))
		}

		withThisTerm := map[string]bool{}
		for c := range done {
			withThisTerm[c] = true
		}
		for _, c := range t.Courses {
			withThisTerm[prereq.Normalize(c.Code)] = true
		}
		hasCoreq := prereq.Has(withThisTerm)

		var weighted, weight float64
		for _, c := range t.Courses {
			code := prereq.Normalize(c.Code)
			pc := PlannedCourse{
				Code:        code,
				Requirement: clip(c.Requirement, maxRequirement),
				Reason:      clip(c.Reason, maxReason),
				Credits:     3,
				Name:        code,
			}
			if pc.Requirement == "" {
				errs = append(errs, fmt.Sprintf("%s (%s): say which requirement it satisfies.", code, label))
			}
			if pc.Reason == "" {
				errs = append(errs, fmt.Sprintf("%s (%s): give a reason for taking it then.", code, label))
			}
			if completedHas(code) {
				errs = append(errs, fmt.Sprintf("%s (%s): already completed or in progress; remove it.", code, label))
			}
			if avoid(code) {
				errs = append(errs, fmt.Sprintf("%s (%s): the student asked to avoid this course.", code, label))
			}
			if prev, dup := planned[prereq.Base(code)]; dup {
				errs = append(errs, fmt.Sprintf("%s is planned twice (%s and %s).", code, prev, label))
			}
			planned[prereq.Base(code)] = label

			if f, ok := facts[code]; !ok {
				plan.Warnings = append(plan.Warnings, fmt.Sprintf("%s isn't in the current Schedule of Courses data; confirm it's still offered (assumed 3 credits).", code))
			} else {
				pc.Name, pc.Rating, pc.Difficulty = f.Name, f.Rating, f.Difficulty
				if f.Credits > 0 {
					pc.Credits = f.Credits
				}
				rules := prereq.Parse(f.Prerequisites)
				if rules.Prereq != nil {
					pc.Prerequisites = rules.Prereq.String()
					if !rules.Prereq.Satisfied(has) {
						errs = append(errs, fmt.Sprintf("%s (%s) needs %s completed in an earlier term.", code, label, rules.Prereq))
					}
				}
				if rules.Coreq != nil && !rules.Coreq.Satisfied(hasCoreq) {
					errs = append(errs, fmt.Sprintf("%s (%s) needs %s in the same or an earlier term.", code, label, rules.Coreq))
				}
				for _, n := range rules.Notes {
					plan.Warnings = append(plan.Warnings, fmt.Sprintf("%s: %s", code, n))
				}
				if offered := seasons(f.Terms); seasonsInData[season] && !offered[season] {
					plan.Warnings = append(plan.Warnings, fmt.Sprintf("%s (%s) was only offered in %s in recent data.", code, label, seasonList(offered)))
				}
			}
			if pc.Difficulty != nil {
				weighted += *pc.Difficulty * pc.Credits
				weight += pc.Credits
			}
			pt.Courses = append(pt.Courses, pc)
			pt.Credits += pc.Credits
		}
		if weight > 0 {
			avg := weighted / weight
			pt.Difficulty = &avg
		}
		pt.Workload = workload(pt.Credits, pt.Difficulty)

		last := ti == len(terms)-1
		switch {
		case season == term.Summer && pt.Credits > float64(opt.MaxSummerCredits):
			errs = append(errs, fmt.Sprintf("%s has %g credits; the student's summer limit is %d.", label, pt.Credits, opt.MaxSummerCredits))
		case season != term.Summer && pt.Credits > float64(opt.MaxCredits):
			errs = append(errs, fmt.Sprintf("%s has %g credits; the limit is %d.", label, pt.Credits, opt.MaxCredits))
		case season != term.Summer && !last && len(t.Courses) > 0 && pt.Credits < float64(opt.MinCredits):
			plan.Warnings = append(plan.Warnings, fmt.Sprintf("%s has %g credits, under the %d minimum you asked for.", label, pt.Credits, opt.MinCredits))
		}

		for c := range withThisTerm {
			done[c] = true
		}
		if len(pt.Courses) > 0 {
			plan.CreditsPlanned += pt.Credits
			plan.GraduationTerm = label
		}
		plan.Terms = append(plan.Terms, pt)
	}

	// Away terms the agent left out still appear on the timeline.
	plan.Terms = withAwayTerms(plan.Terms, opt)

	unresolved := strings.ToLower(strings.Join(d.Unresolved, "\n"))
	plannedHas := func(code string) bool { _, ok := planned[prereq.Base(code)]; return ok }

	for _, c := range opt.MustTake {
		switch {
		case completedHas(c):
			plan.Warnings = append(plan.Warnings, fmt.Sprintf("You asked to take %s, but it's already completed or in progress.", c))
		case !plannedHas(c) && !strings.Contains(unresolved, strings.ToLower(c)):
			errs = append(errs, fmt.Sprintf("The student asked to take %s; plan it or explain in unresolved why it can't fit.", c))
		}
	}

	// Every unmet requirement with a concrete course list must be planned or
	// explained, so nothing silently falls off the plan.
	for _, req := range s.Requirements {
		if len(req.Options) == 0 || anyWildcard(req.Options) {
			continue
		}
		covered := false
		for _, o := range req.Options {
			if plannedHas(o) {
				covered = true
			}
		}
		if covered || mentions(unresolved, req) {
			continue
		}
		errs = append(errs, fmt.Sprintf("Requirement “%s” has nothing planned (options: %s). Plan one, or list it in unresolved with a reason.",
			req.Title, strings.Join(req.Options, ", ")))
	}
	return plan, errs, nil
}

func workload(credits float64, difficulty *float64) string {
	d := 3.0 // RMP's midpoint when there's no data
	if difficulty != nil {
		d = *difficulty
	}
	switch {
	case credits == 0:
		return ""
	case credits >= 17 || d >= 4 || (credits >= 15 && d >= 3.5):
		return "heavy"
	case credits <= 12 && d < 3.2:
		return "light"
	}
	return "moderate"
}

func withAwayTerms(terms []PlanTerm, opt Options) []PlanTerm {
	have := map[string]bool{}
	for i, t := range terms {
		have[t.Code] = true
		terms[i].Away = opt.away(t.Code)
	}
	for _, a := range opt.AwayTerms {
		if !have[a] {
			l, _ := term.Label(a)
			terms = append(terms, PlanTerm{Code: a, Label: l, Away: true})
		}
	}
	sort.SliceStable(terms, func(i, j int) bool { return terms[i].Code < terms[j].Code })
	return terms
}

func anyWildcard(codes []string) bool {
	for _, c := range codes {
		if strings.Contains(c, "X") && !courseCode.MatchString(c) {
			return true
		}
	}
	return false
}

// mentions reports whether the unresolved notes explain a requirement, by
// its title or one of its course codes.
func mentions(unresolved string, req audit.Requirement) bool {
	title := req.Title
	if i := strings.LastIndex(title, " › "); i >= 0 {
		title = title[i+len(" › "):]
	}
	if title != "" && strings.Contains(unresolved, strings.ToLower(title)) {
		return true
	}
	for _, o := range req.Options {
		if strings.Contains(unresolved, strings.ToLower(o)) {
			return true
		}
	}
	return false
}

func toSet(codes []string) map[string]bool {
	m := map[string]bool{}
	for _, c := range codes {
		m[c] = true
	}
	return m
}

func seasons(termCodes []string) map[term.Semester]bool {
	out := map[term.Semester]bool{}
	for _, c := range termCodes {
		if _, s, err := term.Parse(c); err == nil {
			out[s] = true
		}
	}
	return out
}

func seasonList(m map[term.Semester]bool) string {
	var out []string
	for _, s := range []term.Semester{term.Fall, term.Spring, term.Summer} {
		if m[s] {
			out = append(out, s.String())
		}
	}
	return strings.Join(out, " and ")
}

// seasonsWithData reports which semesters the database has a scrape for, so
// "only offered in Fall" is only claimed when Spring data exists to compare.
func seasonsWithData(ctx context.Context, cat Catalog) (map[term.Semester]bool, error) {
	terms, err := cat.Terms(ctx)
	if err != nil {
		return nil, err
	}
	var codes []string
	for _, t := range terms {
		if t.CourseCount > 0 {
			codes = append(codes, t.Code)
		}
	}
	return seasons(codes), nil
}
