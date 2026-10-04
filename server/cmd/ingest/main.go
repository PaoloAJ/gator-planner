// Command ingest scrapes UF's Schedule of Courses into Postgres and enriches
// instructors with RateMyProfessors ratings.
//
// Run it hourly from cron, or pass -every to keep it running:
//
//	ingest                       # current term + next two, once
//	ingest -terms 2271,2275      # specific terms
//	ingest -every 1h             # loop
//	ingest -dump first-page.json # save the raw first page for debugging
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"gatorplan/internal/alert"
	"gatorplan/internal/catalog"
	"gatorplan/internal/config"
	"gatorplan/internal/rmp"
	"gatorplan/internal/soc"
	"gatorplan/internal/store"
	"gatorplan/internal/term"
)

func main() {
	termsFlag := flag.String("terms", "", "comma-separated term codes (default: INGEST_TERMS, else current + next two)")
	every := flag.Duration("every", 0, "repeat on this interval instead of running once")
	ratings := flag.String("ratings", "auto", "RateMyProfessors refresh: auto (daily), always, or never")
	ratingsMaxAge := flag.Duration("ratings-max-age", 24*time.Hour, "with -ratings auto, refresh when older than this")
	allowShrink := flag.Bool("allow-shrink", false, "replace a term even if the scrape has far fewer courses than stored")
	dump := flag.String("dump", "", "write the raw JSON of the first page of the first term to this file")
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		slog.Error("config", "err", err)
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("database", "err", err)
		os.Exit(1)
	}
	defer db.Close()
	if err := db.Migrate(ctx); err != nil {
		slog.Error("migrate", "err", err)
		os.Exit(1)
	}

	ing := &ingester{
		cfg:           cfg,
		db:            db,
		ratings:       *ratings,
		ratingsMaxAge: *ratingsMaxAge,
		allowShrink:   *allowShrink,
		dumpPath:      *dump,
	}
	if *termsFlag != "" {
		ing.terms = strings.Split(*termsFlag, ",")
	}

	if *every == 0 {
		if err := ing.run(ctx); err != nil {
			slog.Error("ingest failed", "err", err)
			os.Exit(1)
		}
		return
	}
	for {
		if err := ing.run(ctx); err != nil {
			slog.Error("ingest failed; keeping last good data", "err", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(*every):
		}
	}
}

type ingester struct {
	cfg           config.Config
	db            *store.Store
	terms         []string
	ratings       string
	ratingsMaxAge time.Duration
	allowShrink   bool
	dumpPath      string
}

func (in *ingester) termCodes() []string {
	switch {
	case len(in.terms) > 0:
		return in.terms
	case len(in.cfg.IngestTerms) > 0:
		return in.cfg.IngestTerms
	default:
		return term.Window(time.Now(), 3)
	}
}

func (in *ingester) run(ctx context.Context) error {
	client := soc.NewClient(in.cfg.SOCBaseURL, in.cfg.OneUFSession)
	if in.cfg.OneUFSession == "" {
		slog.Warn("ONEUF_SESSION is blank: scraping anonymously, so meeting times and seats will be missing")
	}

	var failed []string
	for i, code := range in.termCodes() {
		code = strings.TrimSpace(code)
		label, err := term.Label(code)
		if err != nil {
			return err
		}
		if i == 0 && in.dumpPath != "" {
			f, err := os.Create(in.dumpPath)
			if err != nil {
				return err
			}
			client.Dump = f
			defer f.Close()
		} else {
			client.Dump = nil
		}

		start := time.Now()
		courses, err := client.FetchTerm(ctx, code)
		if errors.Is(err, soc.ErrSessionRejected) {
			alert.Notify(ctx, in.cfg.AlertWebhookURL,
				"GatorPlan ingest: UF rejected the ONEUF_SESSION cookie. Log in to one.uf.edu and paste a fresh cookie into server/.env.")
		}
		if err != nil {
			slog.Error("scrape failed", "term", code, "err", err)
			failed = append(failed, code)
			continue
		}
		if len(courses) == 0 {
			// UF publishes terms a few months out; until then the SOC is empty.
			slog.Info("term not published yet; skipping", "term", code, "label", label)
			continue
		}

		times := soc.TimesAvailable(courses)
		if in.cfg.OneUFSession != "" && !times {
			alert.Notify(ctx, in.cfg.AlertWebhookURL, fmt.Sprintf(
				"GatorPlan ingest: %s scraped without meeting times or seats. The ONEUF_SESSION cookie has probably expired; paste a fresh one into server/.env.", label))
		}

		stats, err := in.db.IngestTerm(ctx, code, label, courses, store.IngestOptions{
			TimesAvailable: times,
			AllowShrink:    in.allowShrink,
		})
		if err != nil {
			slog.Error("store failed", "term", code, "err", err)
			failed = append(failed, code)
			continue
		}
		slog.Info("term ingested", "term", code, "label", label,
			"courses", stats.Courses, "sections", stats.Sections, "meetings", stats.Meetings,
			"removed", stats.Removed, "timesAvailable", times, "took", time.Since(start).Round(time.Millisecond))
	}

	if err := in.refreshRatings(ctx); err != nil {
		slog.Error("ratings refresh failed; keeping previous ratings", "err", err)
	}

	if len(failed) > 0 {
		return fmt.Errorf("terms failed: %s", strings.Join(failed, ", "))
	}
	return nil
}

func (in *ingester) refreshRatings(ctx context.Context) error {
	switch in.ratings {
	case "never":
		return nil
	case "auto":
		stale, err := in.db.RatingsStale(ctx, time.Now().Add(-in.ratingsMaxAge))
		if err != nil || !stale {
			return err
		}
	case "always":
	default:
		return fmt.Errorf("unknown -ratings %q", in.ratings)
	}

	start := time.Now()
	teachers, err := rmp.NewClient().FetchSchool(ctx, in.cfg.RMPSchoolID)
	if err != nil {
		return err
	}
	idx := rmp.NewIndex(teachers)
	names, err := in.db.InstructorNames(ctx)
	if err != nil {
		return err
	}
	matched := map[string]*catalog.Rating{}
	for _, n := range names {
		if t, ok := idx.Match(n); ok {
			if r := t.Rating(); r != nil {
				matched[n] = r
			}
		}
	}
	if err := in.db.SaveRatings(ctx, names, matched, time.Now()); err != nil {
		return err
	}
	slog.Info("ratings refreshed", "rmpTeachers", len(teachers), "instructors", len(names),
		"matched", len(matched), "took", time.Since(start).Round(time.Millisecond))
	return nil
}
