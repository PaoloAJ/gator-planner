package soc

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"slices"
	"strconv"
	"testing"
)

// Shaped like a real logged-in response. Course codes repeat across rows the
// way rotating-topic courses do.
const fixture = `[{"COURSES":[
 {"code":"COP3530","courseId":"010942","name":"Data Structures and Algorithm","description":"Trees.","prerequisites":"Prereq: COP 3503.",
  "sections":[
   {"number":"19HD","classNumber":12978,"gradBasis":"GRD","credits":3,"credits_min":3,"credits_max":3,"genEd":[],"sectWeb":"PC",
    "deptName":"CISE","openSeats":12,"instructors":[{"name":"Cheryl  Resch"}],
    "meetTimes":[{"meetNo":1,"meetDays":["M","W","F"],"meetTimeBegin":"9:35 AM","meetTimeEnd":"10:25 AM","meetBuilding":"CSE","meetBldgCode":"CSE","meetRoom":"E119"}],
    "finalExam":"","dropaddDeadline":"01/15/2027","waitList":{"isEligible":"Y","cap":10,"total":2}},
   {"number":"19HE","classNumber":"12979","credits":"VAR","credits_min":1,"credits_max":4,"sectWeb":"AD","openSeats":null,
    "instructors":[],"meetTimes":[],"waitList":{"cap":0,"total":0}}
  ]},
 {"code":"COP3530","name":"Data Structures and Algorithm","sections":[
   {"number":"19HD","classNumber":12978,"credits":3,"instructors":[],"meetTimes":[],"waitList":{}},
   {"number":"19HF","classNumber":12980,"credits":3,"sectWeb":"PC","openSeats":"0",
    "instructors":[{"name":"Amanpreet Kapoor"}],
    "meetTimes":[{"meetDays":"TR","meetTimeBegin":"1:55 PM","meetTimeEnd":"3:10 PM","meetBuilding":"LIT","meetRoom":"109"}],
    "waitList":{"cap":5,"total":5}}
 ]}
],"LASTCONTROLNUMBER":110,"RETRIEVEDROWS":3,"TOTALROWS":3}]`

func TestNormalize(t *testing.T) {
	var pages []page
	if err := json.Unmarshal([]byte(fixture), &pages); err != nil {
		t.Fatal(err)
	}
	courses := Normalize(pages[0].Courses)
	if len(courses) != 1 {
		t.Fatalf("got %d courses; want 1 merged course", len(courses))
	}
	c := courses[0]
	if c.CodeWithSpace != "COP 3530" || c.Credits != 4 || len(c.Sections) != 3 {
		t.Fatalf("course = %+v", c)
	}

	s := c.Sections[0]
	if s.ClassNumber != 12978 || *s.OpenSeats != 12 || s.WaitlistTotal != 2 || s.Instructors[0].Name != "Cheryl Resch" {
		t.Errorf("section 0 = %+v", s)
	}
	if m := s.Meetings[0]; !slices.Equal(m.Days, []string{"M", "W", "F"}) || m.Begin != 575 || m.End != 625 || m.Building != "CSE" {
		t.Errorf("meeting 0 = %+v", m)
	}

	online := c.Sections[1]
	if online.OpenSeats != nil || len(online.Meetings) != 0 || *online.CreditsMin != 1 || *online.CreditsMax != 4 {
		t.Errorf("online section = %+v", online)
	}

	tr := c.Sections[2]
	if *tr.OpenSeats != 0 || !slices.Equal(tr.Meetings[0].Days, []string{"T", "R"}) || tr.Meetings[0].Begin != 13*60+55 {
		t.Errorf("TR section = %+v", tr)
	}

	if !TimesAvailable(courses) {
		t.Error("TimesAvailable = false; want true")
	}
}

func TestParseClock(t *testing.T) {
	cases := map[string]int{"9:35 AM": 575, "12:00 PM": 720, "12:30 AM": 30, "1:55 PM": 835, "13:55": 835, "08:30": 510}
	for in, want := range cases {
		if got, ok := ParseClock(in); !ok || got != want {
			t.Errorf("ParseClock(%q) = %d, %v; want %d", in, got, ok, want)
		}
	}
	for _, bad := range []string{"", "TBA", "25:00", "9"} {
		if _, ok := ParseClock(bad); ok {
			t.Errorf("ParseClock(%q) ok; want failure", bad)
		}
	}
}

func TestFetchTermPaginatesAndSendsCookie(t *testing.T) {
	var cookies []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookies = append(cookies, r.Header.Get("Cookie"))
		last, _ := strconv.Atoi(r.URL.Query().Get("last-control-number"))
		if last >= 200 {
			fmt.Fprint(w, `[{"COURSES":[],"LASTCONTROLNUMBER":200,"RETRIEVEDROWS":0,"TOTALROWS":2}]`)
			return
		}
		next := last + 100
		fmt.Fprintf(w, `[{"COURSES":[{"code":"AAA%d","name":"x","sections":[{"classNumber":%d}]}],
			"LASTCONTROLNUMBER":%d,"RETRIEVEDROWS":1,"TOTALROWS":2}]`, 1000+next, next, next)
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "abc123")
	c.PageDelay = 0
	courses, err := c.FetchTerm(context.Background(), "2271")
	if err != nil {
		t.Fatal(err)
	}
	if len(courses) != 2 || len(cookies) != 2 {
		t.Fatalf("got %d courses over %d requests; want 2 over 2", len(courses), len(cookies))
	}
	if cookies[0] != "ONEUF_SESSION=abc123" {
		t.Errorf("Cookie header = %q", cookies[0])
	}
}

func TestFetchTermDetectsLoginPage(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `<!doctype html><title>GatorLink Login</title>`)
	}))
	defer srv.Close()

	_, err := NewClient(srv.URL, "expired").FetchTerm(context.Background(), "2271")
	if err == nil || !errors.Is(err, ErrSessionRejected) {
		t.Fatalf("err = %v; want ErrSessionRejected", err)
	}
}
