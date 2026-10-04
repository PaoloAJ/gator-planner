package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"gatorplan/internal/catalog"
)

// ErrShrink guards against replacing a good catalog with a truncated scrape.
var ErrShrink = errors.New("store: scrape has under half the courses already stored; refusing to replace")

type IngestOptions struct {
	TimesAvailable bool // scrape carried meeting times + seats
	AllowShrink    bool // skip the ErrShrink guard
	Now            time.Time
}

type IngestStats struct {
	Courses, Sections, Meetings, Removed int
}

const batchSize = 1000

// IngestTerm replaces a term's catalog with courses in one transaction, so
// readers see either the old catalog or the new one and a failed scrape
// leaves the last good data in place.
//
// When the scrape has no times/seats (anonymous or expired session), sections
// keep whatever meeting times and seat counts were stored before.
func (s *Store) IngestTerm(ctx context.Context, termCode, label string, courses []catalog.Course, opt IngestOptions) (IngestStats, error) {
	var st IngestStats
	if len(courses) == 0 {
		return st, fmt.Errorf("store: term %s: scrape returned no courses", termCode)
	}
	now := opt.Now.UTC().Truncate(time.Microsecond)
	if now.IsZero() {
		now = time.Now().UTC().Truncate(time.Microsecond)
	}

	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		if !opt.AllowShrink {
			var existing int
			if err := tx.QueryRow(ctx, `SELECT count(*) FROM course WHERE term_code = $1`, termCode).Scan(&existing); err != nil {
				return err
			}
			if existing > 0 && len(courses) < existing/2 {
				return fmt.Errorf("%w (term %s: %d stored, %d scraped)", ErrShrink, termCode, existing, len(courses))
			}
		}

		if _, err := tx.Exec(ctx, `
			INSERT INTO term (term_code, label, scraped_at, times_scraped_at)
			VALUES ($1, $2, $3::timestamptz, CASE WHEN $4::boolean THEN $3::timestamptz END)
			ON CONFLICT (term_code) DO UPDATE SET
				label = EXCLUDED.label,
				scraped_at = EXCLUDED.scraped_at,
				times_scraped_at = CASE WHEN $4::boolean THEN EXCLUDED.scraped_at ELSE term.times_scraped_at END`,
			termCode, label, now, opt.TimesAvailable); err != nil {
			return err
		}

		// Courses.
		courseIDs := make([]int64, len(courses))
		err := sendBatches(ctx, tx, len(courses), func(b *pgx.Batch, i int) {
			c := courses[i]
			b.Queue(`
				INSERT INTO course (term_code, code, code_with_space, name, description, prerequisites, credits, scraped_at)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
				ON CONFLICT (term_code, code) DO UPDATE SET
					code_with_space = EXCLUDED.code_with_space, name = EXCLUDED.name,
					description = EXCLUDED.description, prerequisites = EXCLUDED.prerequisites,
					credits = EXCLUDED.credits, scraped_at = EXCLUDED.scraped_at
				RETURNING id`,
				termCode, c.Code, c.CodeWithSpace, c.Name, c.Description, c.Prerequisites, c.Credits, now,
			).QueryRow(func(row pgx.Row) error { return row.Scan(&courseIDs[i]) })
		})
		if err != nil {
			return fmt.Errorf("courses: %w", err)
		}
		st.Courses = len(courses)

		// Instructors.
		var names []string
		seen := map[string]bool{}
		for _, c := range courses {
			for _, sec := range c.Sections {
				for _, in := range sec.Instructors {
					if !seen[in.Name] {
						seen[in.Name] = true
						names = append(names, in.Name)
					}
				}
			}
		}
		instructorIDs := make([]int64, len(names))
		err = sendBatches(ctx, tx, len(names), func(b *pgx.Batch, i int) {
			// DO UPDATE (a no-op) so RETURNING yields the id for existing rows.
			b.Queue(`INSERT INTO instructor (name) VALUES ($1)
				ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`, names[i],
			).QueryRow(func(row pgx.Row) error { return row.Scan(&instructorIDs[i]) })
		})
		if err != nil {
			return fmt.Errorf("instructors: %w", err)
		}
		instructorID := make(map[string]int64, len(names))
		for i, n := range names {
			instructorID[n] = instructorIDs[i]
		}

		// Sections.
		type ref struct {
			courseID int64
			sec      *catalog.Section
		}
		var refs []ref
		for i := range courses {
			for j := range courses[i].Sections {
				refs = append(refs, ref{courseIDs[i], &courses[i].Sections[j]})
			}
		}
		var seatsAt *time.Time
		if opt.TimesAvailable {
			seatsAt = &now
		}
		sectionIDs := make([]int64, len(refs))
		err = sendBatches(ctx, tx, len(refs), func(b *pgx.Batch, i int) {
			r := refs[i]
			b.Queue(`
				INSERT INTO section (course_id, class_number, section_number, credits_min, credits_max,
					dept_name, gen_ed, grad_basis, delivery, open_seats, waitlist_cap, waitlist_total,
					final_exam, drop_add_deadline, scraped_at, seats_scraped_at)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
				ON CONFLICT (course_id, class_number) DO UPDATE SET
					section_number = EXCLUDED.section_number, credits_min = EXCLUDED.credits_min,
					credits_max = EXCLUDED.credits_max, dept_name = EXCLUDED.dept_name,
					gen_ed = EXCLUDED.gen_ed, grad_basis = EXCLUDED.grad_basis, delivery = EXCLUDED.delivery,
					waitlist_cap = EXCLUDED.waitlist_cap, waitlist_total = EXCLUDED.waitlist_total,
					final_exam = EXCLUDED.final_exam, drop_add_deadline = EXCLUDED.drop_add_deadline,
					scraped_at = EXCLUDED.scraped_at,
					open_seats = CASE WHEN $17::boolean THEN EXCLUDED.open_seats ELSE section.open_seats END,
					seats_scraped_at = CASE WHEN $17::boolean THEN EXCLUDED.seats_scraped_at ELSE section.seats_scraped_at END
				RETURNING id`,
				r.courseID, r.sec.ClassNumber, r.sec.SectionNumber, r.sec.CreditsMin, r.sec.CreditsMax,
				r.sec.DeptName, r.sec.GenEd, r.sec.GradBasis, r.sec.Delivery, r.sec.OpenSeats,
				r.sec.WaitlistCap, r.sec.WaitlistTotal, r.sec.FinalExam, r.sec.DropAddDeadline,
				now, seatsAt, opt.TimesAvailable,
			).QueryRow(func(row pgx.Row) error { return row.Scan(&sectionIDs[i]) })
		})
		if err != nil {
			return fmt.Errorf("sections: %w", err)
		}
		st.Sections = len(refs)

		// Section ↔ instructor links are always replaced.
		if _, err := tx.Exec(ctx, `DELETE FROM section_instructor WHERE section_id = ANY($1)`, sectionIDs); err != nil {
			return err
		}
		type link struct {
			section, instructor int64
			pos                 int
		}
		var links []link
		for i, r := range refs {
			for pos, in := range r.sec.Instructors {
				links = append(links, link{sectionIDs[i], instructorID[in.Name], pos})
			}
		}
		err = sendBatches(ctx, tx, len(links), func(b *pgx.Batch, i int) {
			l := links[i]
			b.Queue(`INSERT INTO section_instructor (section_id, instructor_id, position) VALUES ($1, $2, $3)
				ON CONFLICT DO NOTHING`, l.section, l.instructor, l.pos)
		})
		if err != nil {
			return fmt.Errorf("section instructors: %w", err)
		}

		// Meeting times only change when the scrape actually has them.
		if opt.TimesAvailable {
			if _, err := tx.Exec(ctx, `DELETE FROM meeting_time WHERE section_id = ANY($1)`, sectionIDs); err != nil {
				return err
			}
			type mt struct {
				section int64
				m       catalog.Meeting
			}
			var meets []mt
			for i, r := range refs {
				for _, m := range r.sec.Meetings {
					meets = append(meets, mt{sectionIDs[i], m})
				}
			}
			err = sendBatches(ctx, tx, len(meets), func(b *pgx.Batch, i int) {
				m := meets[i]
				b.Queue(`INSERT INTO meeting_time (section_id, days, begin_min, end_min, building, room)
					VALUES ($1, $2, $3, $4, $5, $6)`, m.section, m.m.Days, m.m.Begin, m.m.End, m.m.Building, m.m.Room)
			})
			if err != nil {
				return fmt.Errorf("meeting times: %w", err)
			}
			st.Meetings = len(meets)
		}

		// Anything not in this scrape has been dropped from the schedule.
		tag, err := tx.Exec(ctx, `
			DELETE FROM section s USING course c
			WHERE s.course_id = c.id AND c.term_code = $1 AND s.scraped_at < $2`, termCode, now)
		if err != nil {
			return err
		}
		st.Removed = int(tag.RowsAffected())
		tag, err = tx.Exec(ctx, `DELETE FROM course WHERE term_code = $1 AND scraped_at < $2`, termCode, now)
		if err != nil {
			return err
		}
		st.Removed += int(tag.RowsAffected())
		return nil
	})
	return st, err
}

// sendBatches queues n statements via queue, sending them batchSize at a time.
func sendBatches(ctx context.Context, tx pgx.Tx, n int, queue func(b *pgx.Batch, i int)) error {
	for start := 0; start < n; start += batchSize {
		b := &pgx.Batch{}
		for i := start; i < min(start+batchSize, n); i++ {
			queue(b, i)
		}
		if err := tx.SendBatch(ctx, b).Close(); err != nil {
			return err
		}
	}
	return nil
}

// InstructorNames lists every instructor, for rating matching.
func (s *Store) InstructorNames(ctx context.Context) ([]string, error) {
	rows, err := s.pool.Query(ctx, `SELECT name FROM instructor ORDER BY name`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

// RatingsStale reports whether any instructor hasn't been checked against
// RateMyProfessors since cutoff.
func (s *Store) RatingsStale(ctx context.Context, cutoff time.Time) (bool, error) {
	var stale bool
	err := s.pool.QueryRow(ctx, `SELECT EXISTS (
		SELECT 1 FROM instructor WHERE rmp_checked_at IS NULL OR rmp_checked_at < $1)`, cutoff).Scan(&stale)
	return stale, err
}

// SaveRatings records ratings by instructor name. Names missing from the map
// are marked checked with no rating.
func (s *Store) SaveRatings(ctx context.Context, names []string, ratings map[string]*catalog.Rating, checkedAt time.Time) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		return sendBatches(ctx, tx, len(names), func(b *pgx.Batch, i int) {
			r := ratings[names[i]]
			var legacy, num *int
			var quality, difficulty, again *float64
			if r != nil {
				legacy, num = &r.LegacyID, &r.NumRatings
				quality, difficulty, again = &r.Quality, &r.Difficulty, r.WouldTakeAgain
			}
			b.Queue(`UPDATE instructor SET rmp_legacy_id = $2, rmp_rating = $3, rmp_difficulty = $4,
				rmp_num_ratings = $5, rmp_would_take_again = $6, rmp_checked_at = $7 WHERE name = $1`,
				names[i], legacy, quality, difficulty, num, again, checkedAt)
		})
	})
}
