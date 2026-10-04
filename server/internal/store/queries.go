package store

import (
	"context"
	"errors"
	"strings"
	"unicode"

	"github.com/jackc/pgx/v5"

	"gatorplan/internal/catalog"
)

func (s *Store) Terms(ctx context.Context) ([]catalog.Term, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT t.term_code, t.label, to_char(t.registration_opens, 'YYYY-MM-DD'),
			t.scraped_at, t.times_scraped_at,
			(SELECT count(*) FROM course c WHERE c.term_code = t.term_code)
		FROM term t
		ORDER BY t.term_code`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (catalog.Term, error) {
		var t catalog.Term
		err := row.Scan(&t.Code, &t.Label, &t.RegistrationOpens, &t.ScrapedAt, &t.TimesScrapedAt, &t.CourseCount)
		return t, err
	})
}

// Search ranks code-prefix matches first ("cop35"), then course-name and
// description matches ("data struct"), then instructor-name matches ("resch").
func (s *Store) Search(ctx context.Context, termCode, q string, limit int) ([]catalog.SearchResult, error) {
	q = strings.TrimSpace(q)
	if q == "" {
		return []catalog.SearchResult{}, nil
	}
	codePrefix := escapeLike(strings.ToUpper(strings.Join(strings.Fields(q), ""))) + "%"
	instructor := ""
	if len(q) >= 3 {
		instructor = "%" + escapeLike(q) + "%"
	}
	tsq := prefixTSQuery(q)

	rows, err := s.pool.Query(ctx, `
		WITH matched AS (
			SELECT c.id,
				CASE WHEN c.code LIKE $3::text THEN 3
				     WHEN $4::text <> '' AND c.search @@ to_tsquery('simple', $4::text) THEN 2
				     ELSE 1 END AS score,
				CASE WHEN $4::text <> '' THEN ts_rank(c.search, to_tsquery('simple', $4::text)) ELSE 0 END AS rank
			FROM course c
			WHERE c.term_code = $1 AND (
				c.code LIKE $3
				OR ($4 <> '' AND c.search @@ to_tsquery('simple', $4))
				OR ($2::text <> '' AND EXISTS (
					SELECT 1 FROM section s
					JOIN section_instructor si ON si.section_id = s.id
					JOIN instructor i ON i.id = si.instructor_id
					WHERE s.course_id = c.id AND i.name ILIKE $2))
			)
			ORDER BY score DESC, rank DESC, c.code
			LIMIT $5
		)
		SELECT c.code, c.name, c.credits,
			(SELECT count(*) FROM section s WHERE s.course_id = c.id),
			(SELECT max(i.rmp_rating) FROM section s
				JOIN section_instructor si ON si.section_id = s.id
				JOIN instructor i ON i.id = si.instructor_id
				WHERE s.course_id = c.id AND i.rmp_num_ratings > 0)
		FROM matched m JOIN course c ON c.id = m.id
		ORDER BY m.score DESC, m.rank DESC, c.code`,
		termCode, instructor, codePrefix, tsq, limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (catalog.SearchResult, error) {
		var r catalog.SearchResult
		err := row.Scan(&r.Code, &r.Name, &r.Credits, &r.Sections, &r.BestRating)
		return r, err
	})
}

// Course loads one course with its sections, instructors (with ratings), and
// meeting times.
func (s *Store) Course(ctx context.Context, termCode, code string) (*catalog.Course, error) {
	var id int64
	c := &catalog.Course{Sections: []catalog.Section{}}
	err := s.pool.QueryRow(ctx, `
		SELECT id, code, code_with_space, name, description, prerequisites, credits
		FROM course WHERE term_code = $1 AND code = $2`, termCode, code,
	).Scan(&id, &c.Code, &c.CodeWithSpace, &c.Name, &c.Description, &c.Prerequisites, &c.Credits)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	index := map[int64]int{} // section id → position in c.Sections
	rows, err := s.pool.Query(ctx, `
		SELECT id, class_number, section_number, credits_min, credits_max, dept_name, gen_ed,
			grad_basis, delivery, open_seats, waitlist_cap, waitlist_total, final_exam, drop_add_deadline
		FROM section WHERE course_id = $1 ORDER BY class_number`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var sid int64
		var sec catalog.Section
		if err := rows.Scan(&sid, &sec.ClassNumber, &sec.SectionNumber, &sec.CreditsMin, &sec.CreditsMax,
			&sec.DeptName, &sec.GenEd, &sec.GradBasis, &sec.Delivery, &sec.OpenSeats, &sec.WaitlistCap,
			&sec.WaitlistTotal, &sec.FinalExam, &sec.DropAddDeadline); err != nil {
			return nil, err
		}
		sec.Instructors = []catalog.Instructor{}
		sec.Meetings = []catalog.Meeting{}
		index[sid] = len(c.Sections)
		c.Sections = append(c.Sections, sec)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	rows, err = s.pool.Query(ctx, `
		SELECT si.section_id, i.name, i.rmp_legacy_id, i.rmp_rating, i.rmp_difficulty,
			i.rmp_num_ratings, i.rmp_would_take_again
		FROM section_instructor si
		JOIN instructor i ON i.id = si.instructor_id
		JOIN section s ON s.id = si.section_id
		WHERE s.course_id = $1
		ORDER BY si.section_id, si.position`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var sid int64
		var name string
		var legacy, num *int
		var quality, difficulty, again *float64
		if err := rows.Scan(&sid, &name, &legacy, &quality, &difficulty, &num, &again); err != nil {
			return nil, err
		}
		in := catalog.Instructor{Name: name}
		if quality != nil && num != nil && *num > 0 {
			in.Rating = &catalog.Rating{Quality: *quality, NumRatings: *num, WouldTakeAgain: again}
			if legacy != nil {
				in.Rating.LegacyID = *legacy
			}
			if difficulty != nil {
				in.Rating.Difficulty = *difficulty
			}
		}
		sec := &c.Sections[index[sid]]
		sec.Instructors = append(sec.Instructors, in)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	rows, err = s.pool.Query(ctx, `
		SELECT m.section_id, m.days, m.begin_min, m.end_min, m.building, m.room
		FROM meeting_time m JOIN section s ON s.id = m.section_id
		WHERE s.course_id = $1
		ORDER BY m.section_id, m.begin_min`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var sid int64
		var m catalog.Meeting
		if err := rows.Scan(&sid, &m.Days, &m.Begin, &m.End, &m.Building, &m.Room); err != nil {
			return nil, err
		}
		sec := &c.Sections[index[sid]]
		sec.Meetings = append(sec.Meetings, m)
	}
	return c, rows.Err()
}

// prefixTSQuery turns "data struct" into "data:* & struct:*". Only letters and
// digits survive, so the result is always a valid tsquery.
func prefixTSQuery(q string) string {
	words := strings.FieldsFunc(strings.ToLower(q), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
	for i, w := range words {
		words[i] = w + ":*"
	}
	return strings.Join(words, " & ")
}

func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}
