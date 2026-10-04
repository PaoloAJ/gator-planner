package term

import (
	"slices"
	"testing"
	"time"
)

func TestLabel(t *testing.T) {
	for code, want := range map[string]string{"2271": "Spring 2027", "2275": "Summer 2027", "2268": "Fall 2026"} {
		if got, err := Label(code); err != nil || got != want {
			t.Errorf("Label(%q) = %q, %v; want %q", code, got, err, want)
		}
	}
	for _, bad := range []string{"", "227", "2273", "1271", "2x71"} {
		if _, err := Label(bad); err == nil {
			t.Errorf("Label(%q) succeeded; want error", bad)
		}
	}
}

func TestWindow(t *testing.T) {
	cases := map[string][]string{
		"2026-10-03": {"2268", "2271", "2275"},
		"2027-02-01": {"2271", "2275", "2278"},
		"2027-06-15": {"2275", "2278", "2281"},
	}
	for date, want := range cases {
		d, _ := time.Parse(time.DateOnly, date)
		if got := Window(d, 3); !slices.Equal(got, want) {
			t.Errorf("Window(%s) = %v; want %v", date, got, want)
		}
	}
}
