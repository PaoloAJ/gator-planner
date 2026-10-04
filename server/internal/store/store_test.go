package store

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"gatorplan/internal/catalog"
)

// Integration tests run against a scratch database:
//
//	TEST_DATABASE_URL=postgres://localhost/gatorplan_test go test ./internal/store
//
// They drop and recreate every table.
func openTest(t *testing.T) *Store {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	s, err := Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(s.Close)
	if _, err := s.pool.Exec(ctx, `DROP TABLE IF EXISTS section_instructor, meeting_time, section, course, instructor, term, schema_migrations CASCADE`); err != nil {
		t.Fatal(err)
	}
	if err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if err := s.Migrate(ctx); err != nil { // idempotent
		t.Fatal(err)
	}
	return s
}

func ptr[T any](v T) *T { return &v }

func sampleCourses(withTimes bool) []catalog.Course {
	seats := func(n int) *int {
		if !withTimes {
			return nil
		}
		return ptr(n)
	}
	meet := func(days []string, b, e int) []catalog.Meeting {
		if !withTimes {
			return nil
		}
		return []catalog.Meeting{{Days: days, Begin: b, End: e, Building: "CSE", Room: "E119"}}
	}
	return []catalog.Course{
		{Code: "COP3530", CodeWithSpace: "COP 3530", Name: "Data Structures and Algorithm", Credits: 3,
			Prerequisites: "Prereq: COP 3503.", Sections: []catalog.Section{
				{ClassNumber: 1001, SectionNumber: "A", CreditsMax: ptr(3.0), GenEd: []string{}, OpenSeats: seats(12),
					Instructors: []catalog.Instructor{{Name: "Cheryl Resch"}}, Meetings: meet([]string{"M", "W", "F"}, 575, 625)},
				{ClassNumber: 1002, SectionNumber: "B", CreditsMax: ptr(3.0), GenEd: []string{}, OpenSeats: seats(0), WaitlistTotal: 4,
					Instructors: []catalog.Instructor{{Name: "Amanpreet Kapoor"}, {Name: "Cheryl Resch"}}, Meetings: meet([]string{"T", "R"}, 705, 780)},
			}},
		{Code: "MAC2313", CodeWithSpace: "MAC 2313", Name: "Analytic Geometry and Calculus 3", Credits: 4, Sections: []catalog.Section{
			{ClassNumber: 2001, CreditsMax: ptr(4.0), GenEd: []string{"M"}, OpenSeats: seats(30),
				Instructors: []catalog.Instructor{{Name: "Luis Moreno"}}, Meetings: meet([]string{"M", "W", "F"}, 705, 755)},
		}},
	}
}

func TestIngestAndQuery(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()
	t0 := time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC)

	st, err := s.IngestTerm(ctx, "2271", "Spring 2027", sampleCourses(true), IngestOptions{TimesAvailable: true, Now: t0})
	if err != nil {
		t.Fatal(err)
	}
	if st.Courses != 2 || st.Sections != 3 || st.Meetings != 3 {
		t.Fatalf("stats = %+v", st)
	}

	c, err := s.Course(ctx, "2271", "COP3530")
	if err != nil {
		t.Fatal(err)
	}
	if len(c.Sections) != 2 || *c.Sections[0].OpenSeats != 12 || c.Sections[0].Meetings[0].Begin != 575 {
		t.Fatalf("course = %+v", c)
	}
	if got := c.Sections[1].Instructors; len(got) != 2 || got[0].Name != "Amanpreet Kapoor" {
		t.Errorf("instructor order = %+v", got)
	}

	// An anonymous scrape an hour later keeps the last good times and seats.
	t1 := t0.Add(time.Hour)
	if _, err := s.IngestTerm(ctx, "2271", "Spring 2027", sampleCourses(false), IngestOptions{Now: t1}); err != nil {
		t.Fatal(err)
	}
	c, _ = s.Course(ctx, "2271", "COP3530")
	if c.Sections[0].OpenSeats == nil || *c.Sections[0].OpenSeats != 12 || len(c.Sections[0].Meetings) != 1 {
		t.Errorf("anonymous scrape clobbered times/seats: %+v", c.Sections[0])
	}
	terms, _ := s.Terms(ctx)
	if len(terms) != 1 || !terms[0].ScrapedAt.Equal(t1) || !terms[0].TimesScrapedAt.Equal(t0) || terms[0].CourseCount != 2 {
		t.Errorf("terms = %+v", terms[0])
	}

	// A section that disappears from the SOC is removed.
	next := sampleCourses(true)
	next[0].Sections = next[0].Sections[:1]
	st, err = s.IngestTerm(ctx, "2271", "Spring 2027", next, IngestOptions{TimesAvailable: true, Now: t1.Add(time.Hour)})
	if err != nil || st.Removed != 1 {
		t.Fatalf("removed = %d, err %v; want 1", st.Removed, err)
	}

	// A scrape with under half the courses is refused and changes nothing.
	_, err = s.IngestTerm(ctx, "2271", "Spring 2027", next[:0:0], IngestOptions{})
	if err == nil {
		t.Fatal("empty scrape accepted")
	}
	tiny := []catalog.Course{{Code: "AAA1000", CodeWithSpace: "AAA 1000", Name: "x"}}
	big := append(sampleCourses(true), catalog.Course{Code: "BBB1000", CodeWithSpace: "BBB 1000", Name: "y"},
		catalog.Course{Code: "CCC1000", CodeWithSpace: "CCC 1000", Name: "z"})
	if _, err := s.IngestTerm(ctx, "2271", "Spring 2027", big, IngestOptions{TimesAvailable: true, Now: t1.Add(2 * time.Hour)}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.IngestTerm(ctx, "2271", "Spring 2027", tiny, IngestOptions{}); !errors.Is(err, ErrShrink) {
		t.Fatalf("err = %v; want ErrShrink", err)
	}
	if _, err := s.Course(ctx, "2271", "MAC2313"); err != nil {
		t.Errorf("refused scrape still removed data: %v", err)
	}

	if _, err := s.Course(ctx, "2271", "XYZ1234"); !errors.Is(err, ErrNotFound) {
		t.Errorf("err = %v; want ErrNotFound", err)
	}
}

func TestSearchRanking(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()
	if _, err := s.IngestTerm(ctx, "2271", "Spring 2027", sampleCourses(true), IngestOptions{TimesAvailable: true}); err != nil {
		t.Fatal(err)
	}
	names, err := s.InstructorNames(ctx)
	if err != nil || len(names) != 3 {
		t.Fatalf("names = %v, err %v", names, err)
	}
	if err := s.SaveRatings(ctx, names, map[string]*catalog.Rating{
		"Cheryl Resch": {LegacyID: 9, Quality: 4.4, Difficulty: 3.1, NumRatings: 50},
	}, time.Now()); err != nil {
		t.Fatal(err)
	}

	cases := map[string]string{
		"cop35":       "COP3530", // code prefix
		"COP 3530":    "COP3530", // code with space
		"data struct": "COP3530", // name prefix words
		"calculus":    "MAC2313",
		"moreno":      "MAC2313", // instructor
	}
	for q, want := range cases {
		res, err := s.Search(ctx, "2271", q, 8)
		if err != nil {
			t.Fatal(err)
		}
		if len(res) == 0 || res[0].Code != want {
			t.Errorf("Search(%q) = %+v; want %s first", q, res, want)
		}
	}

	res, _ := s.Search(ctx, "2271", "cop3530", 8)
	if res[0].BestRating == nil || *res[0].BestRating != 4.4 || res[0].Sections != 2 {
		t.Errorf("COP3530 result = %+v", res[0])
	}
	if res, _ := s.Search(ctx, "2271", "%%", 8); len(res) != 0 {
		t.Errorf("wildcard query matched %d rows", len(res))
	}

	c, _ := s.Course(ctx, "2271", "COP3530")
	if r := c.Sections[0].Instructors[0].Rating; r == nil || r.Quality != 4.4 {
		t.Errorf("rating = %+v", r)
	}
	stale, _ := s.RatingsStale(ctx, time.Now().Add(-time.Hour))
	if stale {
		t.Error("ratings reported stale right after saving")
	}
}
