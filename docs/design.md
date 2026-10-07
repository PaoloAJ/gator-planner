# UF Class Scheduler — Tech Stack & MVP Requirements

> Status: Draft v0.1 · Last updated: 2026-10-02
> A class planner for upcoming UF semesters. Students browse the full course
> catalog with live meeting times and seat availability, then build a
> conflict-free schedule. Course data is enriched with RateMyProfessors ratings.

---

## 1. Product Goal

Let a UF student answer, in seconds and on any device:
**"What classes can I take, when do they meet, and are there seats open?"**

Everything in the MVP serves that one question. Schedule-building, ratings, and
nice-to-haves come after the core browse/search/seats loop is fast and obvious.

### Guiding principles

- **Ease of use first.** A new student should get a useful result with zero
  instructions and zero login.
- **Performance is a feature.** Search feels instant; the page is usable on a
  weak laptop over campus Wi-Fi.
- **User-centered.** Scope and UI decisions are driven by observed student
  behavior, not assumptions (see §6, UCD cycle).

---

## 2. Tech Stack

| Layer           | Choice                                           | Why                                                                                                                                     |
| --------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend**    | Next.js (App Router) + TypeScript                | ISR matches the hourly data refresh; server-rendered course pages are SEO-indexable; server-side search keeps the client payload small. |
| **Backend API** | Go                                               | Fast, single-binary deploy; strong at the combinatorial schedule-generation work; shared models with the ingestion service.             |
| **API style**   | GraphQL (`gqlgen`) _or_ REST — **open decision** | Workload is read-heavy and fairly fixed (search, course detail, schedule-gen). GraphQL is good to learn but may be overkill; see §7.    |
| **Database**    | PostgreSQL (via Supabase)                        | Managed Postgres + good dashboard. With a Go API in front, Supabase is used mainly as Postgres (auto-REST/realtime largely unused).     |
| **Auth**        | Clerk                                            | Prebuilt login UI. **MVP needs almost no auth** — browsing is anonymous. Only saved schedules (post-MVP) require a user.                |
| **Ingestion**   | Go cron job / daemon                             | Scrapes UF Schedule of Courses hourly, enriches with RMP, writes to Postgres. Runs on the home server. See §4.                          |
| **Hosting**     | Debian home server + CDN for static assets       | Already running portfolio/web apps. CDN caches the ISR-rendered catalog pages.                                                          |

### Notes on overlap (decide deliberately)

- **Clerk + Supabase Auth** both do authentication. Pick one as the live auth
  system. For MVP, lean on Clerk only where a login is actually required; wire
  Clerk JWTs into Supabase RLS only if/when the client talks to Postgres directly.
- **Go API + Supabase** means Supabase is effectively just managed Postgres.
  That's fine — just a conscious trade (you give up auto-generated REST/realtime).

---

## 3. Data Model (initial sketch)

Normalized in Postgres. One row per section; meeting times and instructors in
child tables.

```
term(term_code PK, label)                         -- "2271" -> "Spring 2027"
course(id PK, code, code_with_space, name, description, prerequisites, term_code FK)
section(id PK, course_id FK, class_number, section_number, credits,
        dept_name, gen_ed[], grad_basis, open_seats, waitlist_cap,
        waitlist_total, final_exam, drop_add_deadline, scraped_at)
meeting_time(id PK, section_id FK, days[], begin, end, building, room)
instructor(id PK, name, rmp_rating, rmp_difficulty, rmp_legacy_id)
section_instructor(section_id FK, instructor_id FK)   -- many-to-many
```

- Full-text search index on `course(code, code_with_space, name, description)`
  using Postgres FTS (`tsvector` + GIN), the equivalent of the reference app's
  SQLite FTS5.
- `scraped_at` on every section so the UI can show data freshness.

---

## 4. Data Source (the critical risk)

The headline feature — **times and seats** — depends on an undocumented UF API,
and this is the riskiest part of the project.

**Endpoint**

```
https://one.uf.edu/apix/soc/schedule/?category=CWSP&term={term_code}&last-control-number={n}
```

- `term_code = "2" + YY + {spring:1, summer:5, fall:8}` (e.g. Spring 2027 = `2271`).
- Paginates via `RETRIEVEDROWS` / `LASTCONTROLNUMBER`.

**Confirmed behavior (2026-10):**

- **Anonymous requests return `meetTimes: []` and `openSeats: null`.** Course,
  section, instructor, credits, prereqs, and waitlist data still come back.
- **A logged-in session cookie (`ONEUF_SESSION`) unlocks meeting times and
  seats.** Verified manually.
- Auth is **cookie-based, not a bearer token.** `one.ufl.edu` 302-redirects to
  `one.uf.edu`.

**Implications / risks:**

- The session cookie **expires** (hours, not weeks) and renewing it requires a
  GatorLink login + Duo. This cannot be auto-renewed without undermining MFA, so
  **the scraper must detect expiry and alert for a manual cookie refresh.**
- Serving login-gated data publicly, tied to one student account, may conflict
  with **UF's acceptable-use policy.** Review before any public launch; the
  durable fix is to request a sanctioned feed/API from the **Registrar or UFIT**
  (stronger coming from UF ACM than from one student).
- **Mitigation:** build the catalog on the always-available public fields; treat
  times/seats as an enrichment layer that degrades gracefully (show "time TBA"
  rather than breaking) when the cookie is stale.

**Ratings:** RateMyProfessors GraphQL (`schoolID` for UF), matched by exact
instructor name. Coverage is partial (~2k of ~12k sections in the reference app).

**Ingestion flow (hourly):** scrape term(s) → clean/normalize → enrich with RMP →
upsert into Postgres atomically → leave last-good data in place on failure.

---

## 5. MVP Requirements

### 5.1 Core user stories

1. As a student, I can **see every available class** for a selected term.
2. I can **search/filter** by course code, name, department, or instructor and
   get results instantly.
3. For any section, I can **see its meeting days/times, building/room, and open
   seats** (with a freshness indicator).
4. I can **see the professor's RMP rating** where available.
5. I can do all of the above **without logging in**, on desktop or mobile.

### 5.2 Functional requirements (MoSCoW)

**Must have**

- [ ] Term selector (current + upcoming terms present in the DB).
- [ ] Browse full catalog for the selected term (paginated / virtualized).
- [ ] Search by code/name/dept/instructor with prefix + ranked results.
- [ ] Section detail: meeting times, location, credits, instructor(s).
- [ ] **Open seats + waitlist count**, with "last updated" freshness.
- [ ] Graceful degradation when times/seats are unavailable ("TBA").
- [ ] RMP rating/difficulty shown when matched.
- [ ] Responsive, mobile-first layout.

**Should have**

- [ ] Filter by meeting day/time, credits, gen-ed, online vs. in-person.
- [ ] Sort by seats, rating, or time.
- [ ] Link to the course syllabus / UF catalog entry.

**Could have**

- [ ] "Add to cart" of sections held in local state (no account).
- [ ] Basic conflict highlighting within the cart.

**Won't have (this MVP)**

- Full schedule generation / permutation engine.
- Saved schedules, accounts, cross-device sync.
- Prerequisite graph, campus map, live chat, AI assistant.
- Direct registration / push to ONE.UF.

### 5.3 Non-functional requirements

**Performance (targets to validate, not guarantees)**

- Search results render in **< 150 ms** p95 after keystroke (debounced),
  server-side query included.
- First Contentful Paint **< 1.5 s** on a mid-range laptop over campus Wi-Fi.
- Catalog pages served from **ISR cache**, revalidated on the scrape cadence.
- **Never ship the full catalog to the browser** — search and paginate
  server-side through the Go API.
- Data freshness: section data no more than ~1 hour stale; show the timestamp.

**Usability**

- Zero-instruction first use; useful result in one interaction.
- Keyboard-navigable search; accessible (WCAG AA color contrast, focus states).
- Clear empty/loading/error states, including the "times TBA" degraded case.

**Reliability**

- Ingestion failure leaves last-good data intact.
- Cookie-expiry alert reaches the maintainer within one failed cycle.

---

## 6. UCD Cycle

User-centered design loop, run once per MVP milestone:

1. **Research / Understand** — interview 5–8 UF students about how they pick
   classes today (ONE.UF, Schedule of Courses, spreadsheets, word of mouth).
   Capture pain points: finding open seats, avoiding time conflicts, judging
   professors. Define primary persona(s) and the top 3 tasks.
2. **Design** — low-fidelity wireframes of the browse → search → section-detail
   flow. Paper/Figma, test the information hierarchy before writing UI code.
3. **Build** — implement the smallest slice that lets a real student complete
   the core task (see all classes, times, seats). Vertical slice, not polish.
4. **Evaluate** — usability test with 3–5 students on real tasks ("find an open
   section of COP3530 that doesn't conflict with your morning class"). Measure
   task success, time-on-task, and confusion points.
5. **Iterate** — fold findings back into the next cycle; re-prioritize the
   MoSCoW list from evidence.

**Success metric for MVP:** a student unfamiliar with the app can find an open
section with its meeting time in **under 60 seconds**, unaided.

---

## 7. Open Decisions

- **GraphQL vs REST for the Go API.** Lean REST (or gRPC) for the fixed,
  read-heavy MVP workload; choose GraphQL only if the learning value or a future
  public API justifies the resolver overhead.
- **Cron binary vs long-running daemon** for ingestion. Start with OS cron +
  Go binary; move to a daemon if holding the session cookie warm in memory helps
  with expiry.
- **Auth system of record** (Clerk vs Supabase Auth) — defer until saved
  schedules are on the roadmap; MVP is anonymous.
- **Legitimacy of the data source** — pursue a sanctioned UF feed in parallel.

---

## 8. Milestones (suggested)

1. **M0 — Ingestion spike:** Go scraper pulls one term with times/seats into
   Postgres; confirm cookie lifetime across several hourly runs.
2. **M1 — Read-only catalog:** Next.js browse + server-side search + section
   detail with times/seats. UCD cycle 1.
3. **M2 — Filters + ratings:** day/time/gen-ed filters, RMP integration,
   freshness UI. UCD cycle 2.
4. **M3 — Cart + conflict highlighting (could-have):** local-state cart,
   in-cart conflict detection. Sets up post-MVP schedule generation.
