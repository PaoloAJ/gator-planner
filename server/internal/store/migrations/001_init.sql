-- Initial schema. Follows the data model sketch in the root README (§3).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE term (
    term_code          text PRIMARY KEY,         -- "2271" = Spring 2027
    label              text NOT NULL,
    registration_opens date,                     -- set by hand; not in the SOC feed
    scraped_at         timestamptz,              -- last successful scrape of any kind
    times_scraped_at   timestamptz               -- last scrape that included times + seats
);

CREATE TABLE course (
    id              bigserial PRIMARY KEY,
    term_code       text NOT NULL REFERENCES term ON DELETE CASCADE,
    code            text NOT NULL,               -- "COP3530"
    code_with_space text NOT NULL,               -- "COP 3530"
    name            text NOT NULL,
    description     text NOT NULL DEFAULT '',
    prerequisites   text NOT NULL DEFAULT '',
    credits         double precision NOT NULL DEFAULT 0,
    scraped_at      timestamptz NOT NULL,
    search          tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', code || ' ' || code_with_space), 'A') ||
        setweight(to_tsvector('simple', name), 'B') ||
        setweight(to_tsvector('simple', description), 'D')
    ) STORED,
    UNIQUE (term_code, code)
);
CREATE INDEX course_search_idx ON course USING gin (search);
CREATE INDEX course_code_prefix_idx ON course (term_code, code text_pattern_ops);

CREATE TABLE section (
    id                bigserial PRIMARY KEY,
    course_id         bigint NOT NULL REFERENCES course ON DELETE CASCADE,
    class_number      integer NOT NULL,
    section_number    text NOT NULL DEFAULT '',
    credits_min       double precision,
    credits_max       double precision,
    dept_name         text NOT NULL DEFAULT '',
    gen_ed            text[] NOT NULL DEFAULT '{}',
    grad_basis        text NOT NULL DEFAULT '',
    delivery          text NOT NULL DEFAULT '',  -- PC in person, AD online, HB hybrid
    open_seats        integer,                   -- null until a logged-in scrape
    waitlist_cap      integer NOT NULL DEFAULT 0,
    waitlist_total    integer NOT NULL DEFAULT 0,
    final_exam        text NOT NULL DEFAULT '',
    drop_add_deadline text NOT NULL DEFAULT '',
    scraped_at        timestamptz NOT NULL,
    seats_scraped_at  timestamptz,
    UNIQUE (course_id, class_number)
);

CREATE TABLE meeting_time (
    id         bigserial PRIMARY KEY,
    section_id bigint NOT NULL REFERENCES section ON DELETE CASCADE,
    days       text[] NOT NULL,                  -- {M,W,F}; R is Thursday
    begin_min  integer NOT NULL,                 -- minutes since midnight
    end_min    integer NOT NULL,
    building   text NOT NULL DEFAULT '',
    room       text NOT NULL DEFAULT ''
);
CREATE INDEX meeting_time_section_idx ON meeting_time (section_id);

CREATE TABLE instructor (
    id                   bigserial PRIMARY KEY,
    name                 text NOT NULL UNIQUE,
    rmp_legacy_id        integer,
    rmp_rating           double precision,
    rmp_difficulty       double precision,
    rmp_num_ratings      integer,
    rmp_would_take_again double precision,
    rmp_checked_at       timestamptz            -- last time we looked, matched or not
);
CREATE INDEX instructor_name_trgm_idx ON instructor USING gin (name gin_trgm_ops);

CREATE TABLE section_instructor (
    section_id    bigint NOT NULL REFERENCES section ON DELETE CASCADE,
    instructor_id bigint NOT NULL REFERENCES instructor ON DELETE CASCADE,
    position      integer NOT NULL DEFAULT 0,
    PRIMARY KEY (section_id, instructor_id)
);
CREATE INDEX section_instructor_instructor_idx ON section_instructor (instructor_id);
