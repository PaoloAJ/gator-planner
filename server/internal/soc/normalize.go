package soc

import (
	"sort"
	"strconv"
	"strings"
	"unicode"

	"gatorplan/internal/catalog"
)

// Normalize converts raw SOC courses into catalog courses. The SOC can list a
// course code more than once (e.g. per rotating topic), so courses are merged
// by code and sections de-duplicated by class number.
func Normalize(raw []rawCourse) []catalog.Course {
	byCode := map[string]*catalog.Course{}
	seen := map[string]map[int]bool{}
	var order []string

	for _, rc := range raw {
		code := strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(rc.Code), " ", ""))
		if code == "" {
			continue
		}
		c, ok := byCode[code]
		if !ok {
			c = &catalog.Course{
				Code:          code,
				CodeWithSpace: CodeWithSpace(code),
				Name:          strings.TrimSpace(rc.Name),
				Description:   strings.TrimSpace(rc.Description),
				Prerequisites: strings.TrimSpace(rc.Prerequisites),
			}
			byCode[code] = c
			seen[code] = map[int]bool{}
			order = append(order, code)
		}
		for _, rs := range rc.Sections {
			if !rs.ClassNumber.Set || seen[code][rs.ClassNumber.V] {
				continue
			}
			seen[code][rs.ClassNumber.V] = true
			c.Sections = append(c.Sections, normalizeSection(rs))
		}
	}

	out := make([]catalog.Course, 0, len(order))
	for _, code := range order {
		c := byCode[code]
		sort.Slice(c.Sections, func(i, j int) bool { return c.Sections[i].ClassNumber < c.Sections[j].ClassNumber })
		for _, s := range c.Sections {
			if s.CreditsMax != nil && *s.CreditsMax > c.Credits {
				c.Credits = *s.CreditsMax
			}
		}
		out = append(out, *c)
	}
	return out
}

func normalizeSection(rs rawSection) catalog.Section {
	s := catalog.Section{
		ClassNumber:     rs.ClassNumber.V,
		SectionNumber:   strings.TrimSpace(rs.Number),
		CreditsMin:      rs.CreditsMin.Ptr(),
		CreditsMax:      rs.CreditsMax.Ptr(),
		DeptName:        strings.TrimSpace(rs.DeptName),
		GenEd:           rs.GenEd,
		GradBasis:       rs.GradBasis,
		Delivery:        rs.SectWeb,
		OpenSeats:       rs.OpenSeats.Ptr(),
		WaitlistCap:     rs.WaitList.Cap.V,
		WaitlistTotal:   rs.WaitList.Total.V,
		FinalExam:       strings.TrimSpace(rs.FinalExam),
		DropAddDeadline: strings.TrimSpace(rs.DropAddDeadline),
	}
	if s.CreditsMin == nil {
		s.CreditsMin = rs.Credits.Ptr()
	}
	if s.CreditsMax == nil {
		s.CreditsMax = rs.Credits.Ptr()
	}
	if s.GenEd == nil {
		s.GenEd = []string{}
	}
	for _, in := range rs.Instructors {
		if name := strings.Join(strings.Fields(in.Name), " "); name != "" {
			s.Instructors = append(s.Instructors, catalog.Instructor{Name: name})
		}
	}
	for _, mt := range rs.MeetTimes {
		begin, ok1 := ParseClock(mt.MeetTimeBegin)
		end, ok2 := ParseClock(mt.MeetTimeEnd)
		if !ok1 || !ok2 || len(mt.MeetDays) == 0 || end <= begin {
			continue
		}
		building := mt.MeetBldgCode
		if building == "" {
			building = mt.MeetBuilding
		}
		s.Meetings = append(s.Meetings, catalog.Meeting{
			Days:     mt.MeetDays,
			Begin:    begin,
			End:      end,
			Building: strings.TrimSpace(building),
			Room:     strings.TrimSpace(mt.MeetRoom),
		})
	}
	return s
}

// ParseClock reads "9:35 AM", "1:55 PM", "09:35", or "13:55" into minutes
// since midnight.
func ParseClock(s string) (int, bool) {
	s = strings.ToUpper(strings.TrimSpace(s))
	if s == "" {
		return 0, false
	}
	pm := strings.HasSuffix(s, "PM")
	am := strings.HasSuffix(s, "AM")
	s = strings.TrimSpace(strings.TrimSuffix(strings.TrimSuffix(s, "PM"), "AM"))

	hStr, mStr, ok := strings.Cut(s, ":")
	if !ok {
		return 0, false
	}
	h, err1 := strconv.Atoi(hStr)
	m, err2 := strconv.Atoi(mStr)
	if err1 != nil || err2 != nil || h < 0 || h > 23 || m < 0 || m > 59 {
		return 0, false
	}
	if pm && h < 12 {
		h += 12
	}
	if am && h == 12 {
		h = 0
	}
	return h*60 + m, true
}

// CodeWithSpace turns "COP3530" into "COP 3530" and "MAC2313H" into
// "MAC 2313H".
func CodeWithSpace(code string) string {
	i := strings.IndexFunc(code, unicode.IsDigit)
	if i <= 0 {
		return code
	}
	return code[:i] + " " + code[i:]
}
