package rmp

import "testing"

func TestIndexMatch(t *testing.T) {
	idx := NewIndex([]Teacher{
		{LegacyID: 1, FirstName: "John", LastName: "Mendoza-Garcia", NumRatings: 172},
		{LegacyID: 2, FirstName: "Cheryl", LastName: "Resch", NumRatings: 40},
		{LegacyID: 3, FirstName: "Cheryl", LastName: "Resch", NumRatings: 3}, // duplicate profile
		{LegacyID: 4, FirstName: "José", LastName: "Núñez", NumRatings: 9},
		{LegacyID: 5, FirstName: "Amanpreet", LastName: "Kapoor", NumRatings: 300},
	})
	cases := map[string]int{
		"John Mendoza Garcia":   1,
		"Cheryl Resch":          2,
		"Jose Nunez":            4,
		"Amanpreet Kaur Kapoor": 5, // middle name on the UF side
		"cheryl   resch":        2,
		"Someone Else Entirely": 0,
		"Staff":                 0,
	}
	for name, want := range cases {
		got, ok := idx.Match(name)
		if want == 0 {
			if ok {
				t.Errorf("Match(%q) = %d; want no match", name, got.LegacyID)
			}
			continue
		}
		if !ok || got.LegacyID != want {
			t.Errorf("Match(%q) = %d, %v; want %d", name, got.LegacyID, ok, want)
		}
	}
}

func TestRatingSkipsUnrated(t *testing.T) {
	if (Teacher{NumRatings: 0, AvgRating: 0}).Rating() != nil {
		t.Error("unrated teacher produced a rating")
	}
	neg := -1.0
	r := Teacher{NumRatings: 5, AvgRating: 4.2, WouldTakeAgain: &neg}.Rating()
	if r == nil || r.Quality != 4.2 || r.WouldTakeAgain != nil {
		t.Errorf("Rating() = %+v", r)
	}
}
