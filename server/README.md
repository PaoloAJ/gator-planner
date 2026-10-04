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

Responses carry `Cache-Control: public, max-age=60, stale-while-revalidate=600`.

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
internal/api             HTTP handlers
internal/alert           cookie-expiry alerts
```
