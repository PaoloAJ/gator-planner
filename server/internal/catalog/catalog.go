// Package catalog holds the normalized course data shared by ingestion, the
// store, and the API. It mirrors the schema in store/migrations.
package catalog

import "time"

type Term struct {
	Code              string     `json:"code"`
	Label             string     `json:"label"`
	RegistrationOpens *string    `json:"registrationOpens"` // YYYY-MM-DD, set by hand
	ScrapedAt         *time.Time `json:"scrapedAt"`
	TimesScrapedAt    *time.Time `json:"timesScrapedAt"` // last scrape that had times + seats
	CourseCount       int        `json:"courseCount"`
	Suggested         bool       `json:"suggested"` // the term students are most likely planning
}

type Course struct {
	Code          string    `json:"code"`
	CodeWithSpace string    `json:"codeWithSpace"`
	Name          string    `json:"name"`
	Description   string    `json:"description"`
	Prerequisites string    `json:"prerequisites"`
	Credits       float64   `json:"credits"`
	Sections      []Section `json:"sections"`
}

type Section struct {
	ClassNumber     int          `json:"classNumber"`
	SectionNumber   string       `json:"sectionNumber"`
	CreditsMin      *float64     `json:"creditsMin"`
	CreditsMax      *float64     `json:"creditsMax"`
	DeptName        string       `json:"deptName"`
	GenEd           []string     `json:"genEd"`
	GradBasis       string       `json:"gradBasis"`
	Delivery        string       `json:"delivery"` // UF sectWeb: PC in person, AD online, HB hybrid
	OpenSeats       *int         `json:"openSeats"`
	WaitlistCap     int          `json:"waitlistCap"`
	WaitlistTotal   int          `json:"waitlistTotal"`
	FinalExam       string       `json:"finalExam"`
	DropAddDeadline string       `json:"dropAddDeadline"`
	Instructors     []Instructor `json:"instructors"`
	Meetings        []Meeting    `json:"meetings"`
}

type Meeting struct {
	Days     []string `json:"days"`  // M T W R F S
	Begin    int      `json:"begin"` // minutes since midnight
	End      int      `json:"end"`
	Building string   `json:"building"`
	Room     string   `json:"room"`
}

type Instructor struct {
	Name   string  `json:"name"`
	Rating *Rating `json:"rating"`
}

// Rating is a RateMyProfessors match for an instructor.
type Rating struct {
	LegacyID       int      `json:"legacyId"`
	Quality        float64  `json:"quality"`
	Difficulty     float64  `json:"difficulty"`
	NumRatings     int      `json:"numRatings"`
	WouldTakeAgain *float64 `json:"wouldTakeAgain"` // percent, nil when RMP has none
}

// SearchResult is one row of a catalog search.
type SearchResult struct {
	Code       string   `json:"code"`
	Name       string   `json:"name"`
	Credits    float64  `json:"credits"`
	Sections   int      `json:"sections"`
	BestRating *float64 `json:"bestRating"`
}
