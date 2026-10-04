package soc

import (
	"encoding/json"
	"strconv"
	"strings"
)

// Raw response types for one.uf.edu/apix/soc/schedule. The endpoint is
// undocumented, so fields that have been seen as both strings and numbers use
// lenient types.

type page struct {
	Courses           []rawCourse `json:"COURSES"`
	LastControlNumber int         `json:"LASTCONTROLNUMBER"`
	RetrievedRows     int         `json:"RETRIEVEDROWS"`
	TotalRows         int         `json:"TOTALROWS"`
}

type rawCourse struct {
	Code          string       `json:"code"`
	CourseID      string       `json:"courseId"`
	Name          string       `json:"name"`
	Description   string       `json:"description"`
	Prerequisites string       `json:"prerequisites"`
	Sections      []rawSection `json:"sections"`
}

type rawSection struct {
	Number          string    `json:"number"`
	ClassNumber     flexInt   `json:"classNumber"`
	GradBasis       string    `json:"gradBasis"`
	Credits         flexFloat `json:"credits"`
	CreditsMin      flexFloat `json:"credits_min"`
	CreditsMax      flexFloat `json:"credits_max"`
	GenEd           []string  `json:"genEd"`
	SectWeb         string    `json:"sectWeb"`
	DeptName        string    `json:"deptName"`
	OpenSeats       flexInt   `json:"openSeats"`
	FinalExam       string    `json:"finalExam"`
	DropAddDeadline string    `json:"dropaddDeadline"`
	Instructors     []struct {
		Name string `json:"name"`
	} `json:"instructors"`
	MeetTimes []rawMeetTime `json:"meetTimes"`
	WaitList  struct {
		Cap   flexInt `json:"cap"`
		Total flexInt `json:"total"`
	} `json:"waitList"`
}

// rawMeetTime is only returned to logged-in sessions. Field names follow what
// the ONE.UF schedule UI consumes; verify with `ingest -dump` once a session
// cookie is configured.
type rawMeetTime struct {
	MeetDays      flexDays `json:"meetDays"`
	MeetTimeBegin string   `json:"meetTimeBegin"`
	MeetTimeEnd   string   `json:"meetTimeEnd"`
	MeetBuilding  string   `json:"meetBuilding"`
	MeetBldgCode  string   `json:"meetBldgCode"`
	MeetRoom      string   `json:"meetRoom"`
}

// flexInt accepts 12, "12", null, or "" (the last two decode as unset).
type flexInt struct {
	V   int
	Set bool
}

func (f *flexInt) UnmarshalJSON(b []byte) error {
	s := strings.Trim(string(b), `"`)
	if s == "null" || s == "" {
		return nil
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return nil // tolerate junk rather than failing a whole page
	}
	f.V, f.Set = n, true
	return nil
}

func (f flexInt) Ptr() *int {
	if !f.Set {
		return nil
	}
	v := f.V
	return &v
}

// flexFloat accepts 3, 3.5, "3", null, or "VAR".
type flexFloat struct {
	V   float64
	Set bool
}

func (f *flexFloat) UnmarshalJSON(b []byte) error {
	s := strings.Trim(string(b), `"`)
	n, err := strconv.ParseFloat(s, 64)
	if err == nil {
		f.V, f.Set = n, true
	}
	return nil
}

func (f flexFloat) Ptr() *float64 {
	if !f.Set {
		return nil
	}
	v := f.V
	return &v
}

// flexDays accepts ["M","W","F"], ["MWF"], or "MWF".
type flexDays []string

func (d *flexDays) UnmarshalJSON(b []byte) error {
	var parts []string
	if err := json.Unmarshal(b, &parts); err != nil {
		var s string
		if err := json.Unmarshal(b, &s); err != nil {
			return nil
		}
		parts = []string{s}
	}
	for _, p := range parts {
		for _, r := range strings.ToUpper(strings.TrimSpace(p)) {
			if strings.ContainsRune("MTWRFSU", r) {
				*d = append(*d, string(r))
			}
		}
	}
	return nil
}
