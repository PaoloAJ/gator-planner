package prereq

import "testing"

func set(codes ...string) func(string) bool {
	m := map[string]bool{}
	for _, c := range codes {
		m[c] = true
	}
	return Has(m)
}

func TestParseUFPrereqs(t *testing.T) {
	cop3530 := "Prereq: (COP 3504 or COP 3503) and COT 3100 and (MAC 2234 or MAC 2312 or MAC 2512 or MAC 3473), all with a minimum grade of C."
	p := Parse(cop3530)
	if got, want := p.Prereq.String(), "(COP3504 or COP3503) and COT3100 and (MAC2234 or MAC2312 or MAC2512 or MAC3473)"; got != want {
		t.Fatalf("String() = %q\nwant      %q", got, want)
	}
	cases := []struct {
		have []string
		want bool
	}{
		{[]string{"COP3503C", "COT3100", "MAC2312"}, true}, // C suffix still counts
		{[]string{"COP3504", "COT3100", "MAC2512"}, true},
		{[]string{"COP3503", "MAC2312"}, false}, // missing COT3100
		{nil, false},
	}
	for _, c := range cases {
		if got := p.Prereq.Satisfied(set(c.have...)); got != c.want {
			t.Errorf("have %v: satisfied = %v; want %v", c.have, got, c.want)
		}
	}
	if len(p.Notes) != 0 {
		t.Errorf("unexpected notes %v", p.Notes)
	}
}

func TestParseVariants(t *testing.T) {
	cases := map[string]struct{ pre, co string }{
		"":                                      {"", ""},
		"Prereq: MAC 2311.":                     {"MAC2311", ""},
		"Prereq: COP 3503C, COT 3100; MAS 3114": {"COP3503C and COT3100 and MAS3114", ""},
		"Prereq: PHY 2048. Coreq: MAC 2312.":    {"PHY2048", "MAC2312"},
		"Prereq or Coreq: MAC 2311":             {"", "MAC2311"},
		"Prereq: (MAC 2311 or MAC 2233)) and STA 2023":                                              {"(MAC2311 or MAC2233) and STA2023", ""}, // stray paren
		"Prereq: and or COP 3530":                                                                   {"COP3530", ""},
		"Prereq: MAC 2312, MAC 2512 or MAC 3473 with a minimum grade of C":                          {"MAC2312 or MAC2512 or MAC3473", ""},
		"Prereq: COP 3530, CDA 3101, and COT 3100":                                                  {"COP3530 and CDA3101 and COT3100", ""},
		"Prereq: (MAC 2311 or MAC 3472) and (COP 3502C or equivalent); Coreq: COP 3504 or COP 3503": {"(MAC2311 or MAC3472) and COP3502C", "COP3504 or COP3503"},
	}
	for in, want := range cases {
		p := Parse(in)
		if got := str(p.Prereq); got != want.pre {
			t.Errorf("Parse(%q).Prereq = %q; want %q", in, got, want.pre)
		}
		if got := str(p.Coreq); got != want.co {
			t.Errorf("Parse(%q).Coreq = %q; want %q", in, got, want.co)
		}
	}
}

func TestNotes(t *testing.T) {
	p := Parse("Prereq: COP 3530 and junior standing, or instructor permission.")
	if len(p.Notes) != 1 {
		t.Errorf("notes = %v; want the condition surfaced", p.Notes)
	}
}

func str(r Rule) string {
	if r == nil {
		return ""
	}
	return r.String()
}
