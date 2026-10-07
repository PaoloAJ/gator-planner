# GatorPlan server

Go backend for GatorPlan. Two binaries share one Postgres database:

| Command          | What it does                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| `cmd/ingest`     | Scrapes UF's Schedule of Courses, enriches instructors with RateMyProfessors, upserts into Postgres |
| `cmd/api`        | Read-only REST API the Next.js app calls                                                           |

Both run database migrations on startup.

## Setup

```sh
cp .env.example .env      # then fill in DATABASE_URL and ONEUF_SESSION
createdb gatorplan        # or point DATABASE_URL at Supabase
go run ./cmd/ingest       # first scrape (~2–3 min per term)
go run ./cmd/api          # serves on :8080
```

Then run the web app (`cd ../web && npm run dev`). It proxies `/api/*` to `API_URL`
(default `http://localhost:8080`).

### The ONEUF_SESSION cookie

Meeting times and open seats only come back for a logged-in ONE.UF session.
Leave `ONEUF_SESSION` blank and everything else still loads: courses, sections,
instructors, ratings, and waitlists. Times then show as "TBA".

To fill it in: log in at <https://one.uf.edu>, open DevTools → Application →
Cookies → `https://one.uf.edu`, and copy the value of `ONEUF_SESSION` into
`.env`. Pasting `ONEUF_SESSION=…` or a whole `Cookie:` header also works.

The cookie expires within hours. When a scrape with a cookie comes back
without times, or UF answers with a login page, the ingester logs an `ALERT`
and posts to `ALERT_WEBHOOK_URL` if one is set. It keeps the last good times
and seats in place until you paste a fresh cookie.

> The `meetTimes` field names (`meetDays`, `meetTimeBegin`, …) couldn't be
> verified without a session. After adding your cookie, run
> `go run ./cmd/ingest -terms 2271 -dump page.json` and check that the log shows
> `meetings=` greater than 0. If it doesn't, compare `page.json` against
> `rawMeetTime` in `internal/soc/types.go`.

## Ingestion

```sh
go run ./cmd/ingest                  # current term + next two
go run ./cmd/ingest -terms 2271      # specific terms
go run ./cmd/ingest -every 1h        # stay running instead of using cron
go run ./cmd/ingest -ratings always  # force a RateMyProfessors refresh
```

Hourly via cron:

```cron
0 * * * * cd /path/to/gator-planner/server && ./bin/ingest >> ingest.log 2>&1
```

(`go build -o bin/ingest ./cmd/ingest` first.)

How each term is handled:

- Terms UF hasn't published yet return no courses and are skipped.
- Each term is replaced in **one transaction**, so the API serves either the
  old catalog or the new one, never a half-written one.
- A scrape with under half the courses already stored is refused
  (`-allow-shrink` overrides this).
- Sections that disappear from the SOC are deleted.
- Without times (no cookie or an expired one), stored meeting times and seat
  counts are left untouched. `term.times_scraped_at` tells the UI how fresh
  they are.
- RateMyProfessors ratings refresh daily (`-ratings auto`). Every UF
  instructor at the school is fetched (~7 requests) and matched by normalized
  name: exact first, then first + last name. That ignores accents, hyphens and
  middle names.

## API

| Endpoint                                  | Returns                                               |
| ----------------------------------------- | ----------------------------------------------------- |
| `GET /healthz`                            | `{"status":"ok"}` when the database is reachable      |
| `GET /api/terms`                          | Terms in the DB, with freshness and `suggested`        |
| `GET /api/terms/{term}/search?q=&limit=`  | Ranked matches: code prefix → name/description → instructor |
| `GET /api/terms/{term}/courses/{code}`    | Course with sections, instructors + ratings, meetings |
| `POST /api/plan`                          | Degree plan from an audit (NDJSON stream; see below)  |

Responses carry `Cache-Control: public, max-age=60, stale-while-revalidate=600`.

## Degree planner (AI agent)

`POST /api/plan` turns a student's UF degree audit plus their preferences into
a detailed semester-by-semester plan. Set `ANTHROPIC_API_KEY` in `.env` (and
add API credits to the Anthropic account) to enable it; without a key the
endpoint returns 503 and the rest of the app works as usual.

**Request:** `{"audit": …, …options}`. Options (`internal/planner/options.go`):

| Field | Meaning |
| --- | --- |
| `startTerm`, `targetTerm` | Planning window; the target ("graduate by") ends it |
| `includeSummer`, `maxSummerCredits` | Summer terms and their credit cap |
| `minCredits`, `maxCredits` | Fall/spring load (min is a preference, max is enforced) |
| `awayTerms` | Co-op/abroad terms that must stay empty |
| `pace` | `balanced`, `front-load`, or `steady` (how to spread hard courses) |
| `interests`, `preferHighlyRated` | Steer elective choices |
| `mustTake`, `avoid` | Course codes to include or exclude (enforced) |
| `notes` | Free-text instructions, up to 1,000 characters |
| `answers`, `skipQuestions` | Follow-up to the agent's clarifying questions |

**Flow:** the agent may first pause with up to 3 multiple-choice questions
(a `questions` event); the client posts again with `answers` (or
`skipQuestions`) and the agent plans. Claude Sonnet 5.5 (`ANTHROPIC_MODEL`) at
`medium` effort (`PLANNER_EFFORT`) works through `lookup_courses`,
`search_courses`, `ask_student`, and `submit_plan`.

**Output:** per course, the requirement, a reason, prerequisites, professor
rating, and difficulty; per term, a focus line and a workload rating computed
from credits and RateMyProfessors difficulty; overall, milestones, graduation
term, credit totals, and how the preferences were applied.

### Guardrails

Hard rules live in code; the prompt only steers.

- **Input** (`Options.Check`, `audit.Parse`): every option is range- and
  format-checked (400 on failure); free text is length-capped, stripped of
  control characters, has emails and ID-like numbers redacted, and has `<`/`>`
  swapped for look-alikes so it can't close or forge the tags it's wrapped in.
  Name, UFID, grades, and GPA never leave `audit.Parse`.
- **Prompt:** student text sits in `<student_notes>`/`<student_answers>` data
  blocks; the system prompt ranks UF rules and the validator above structured
  preferences above notes, and tells the model to decline (and say so)
  anything that breaks rules or isn't degree planning.
- **Agent:** only four narrow tools; questions are allowed once, before any
  submission, and must be 1–3 short multiple-choice items; caps of 30 turns,
  6 submissions, and 5 minutes; refusals and truncated output stop the run
  without executing tools; `PLANS_PER_HOUR` per IP (default 10).
- **Plan validator** (`validate.go`) rejects plans until fixed: prerequisite
  and corequisite order, repeats and duplicates, credit caps (fall/spring and
  summer), the window, away terms, avoided courses, must-take courses, missing
  reasons/requirements/summary, and any unmet audit requirement that's neither
  planned nor explained. Model-written text is length-clipped for display.
- **UI:** the same limits in the browser, a disclaimer to confirm with an
  advisor, and React's escaping for everything the model writes.

## Tests

```sh
go test ./...                                    # unit tests
TEST_DATABASE_URL=postgres://localhost/gatorplan_test?sslmode=disable \
  go test ./internal/store                       # integration tests (drops tables!)
```

## Layout

```
cmd/api, cmd/ingest      entry points
internal/config          env + .env loading
internal/term            term codes ("2271" ↔ "Spring 2027")
internal/soc             UF Schedule of Courses client + normalization
internal/rmp             RateMyProfessors client + name matching
internal/store           Postgres: migrations, ingest, queries
internal/audit           degree audit → planning summary (no personal data)
internal/prereq          UF prerequisite text → and/or rules
internal/planner         Claude agent loop, tools, plan validator
internal/api             HTTP handlers
internal/alert           cookie-expiry alerts
```
