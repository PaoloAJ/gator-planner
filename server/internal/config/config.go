// Package config loads settings from the environment, falling back to a local
// .env file for development. Real environment variables always win.
package config

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	// DatabaseURL is a Postgres connection string (Supabase works; use the
	// direct or session-pooler URL, not the transaction pooler).
	DatabaseURL string

	// OneUFSession is the ONEUF_SESSION cookie from a logged-in ONE.UF browser
	// session. Blank means anonymous scraping: courses, sections, and
	// instructors still load, but meeting times and open seats do not.
	OneUFSession string

	// APIAddr is where the REST API listens.
	APIAddr string

	// IngestTerms optionally pins which term codes to scrape (comma
	// separated). Blank means the current term plus the next two.
	IngestTerms []string

	SOCBaseURL      string
	RMPSchoolID     string
	AlertWebhookURL string

	// AnthropicAPIKey powers the degree planner; blank disables it.
	AnthropicAPIKey string
	AnthropicModel  string
	// PlannerEffort is the Claude effort level: low, medium, high, xhigh, max.
	PlannerEffort string
	// PlansPerHour caps degree-plan requests per client IP (0 = unlimited).
	PlansPerHour int
}

func Load() (Config, error) {
	loadDotEnv(".env")

	c := Config{
		DatabaseURL:     os.Getenv("DATABASE_URL"),
		OneUFSession:    strings.TrimSpace(os.Getenv("ONEUF_SESSION")),
		APIAddr:         getenv("API_ADDR", ":8080"),
		SOCBaseURL:      getenv("SOC_BASE_URL", "https://one.uf.edu/apix/soc/schedule/"),
		RMPSchoolID:     getenv("RMP_SCHOOL_ID", "U2Nob29sLTExMDA="), // base64("School-1100"), University of Florida
		AlertWebhookURL: os.Getenv("ALERT_WEBHOOK_URL"),
		AnthropicAPIKey: strings.TrimSpace(os.Getenv("ANTHROPIC_API_KEY")),
		AnthropicModel:  getenv("ANTHROPIC_MODEL", "claude-sonnet-5-5"),
		PlannerEffort:   getenv("PLANNER_EFFORT", "medium"),
		// A run that ends in questions counts too, so leave room for the
		// follow-up run with answers.
		PlansPerHour: 10,
	}
	if v := os.Getenv("PLANS_PER_HOUR"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 {
			return c, fmt.Errorf("PLANS_PER_HOUR must be a non-negative integer, got %q", v)
		}
		c.PlansPerHour = n
	}
	switch c.PlannerEffort {
	case "low", "medium", "high", "xhigh", "max":
	default:
		return c, fmt.Errorf("PLANNER_EFFORT must be low, medium, high, xhigh, or max, got %q", c.PlannerEffort)
	}
	for _, t := range strings.Split(os.Getenv("INGEST_TERMS"), ",") {
		if t = strings.TrimSpace(t); t != "" {
			c.IngestTerms = append(c.IngestTerms, t)
		}
	}
	if c.DatabaseURL == "" {
		return c, errors.New("DATABASE_URL is not set (see .env.example)")
	}
	return c, nil
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// loadDotEnv sets KEY=VALUE pairs from path without overriding variables that
// are already set. A missing file is fine.
func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, val, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(strings.TrimPrefix(key, "export "))
		val = strings.Trim(strings.TrimSpace(val), `"'`)
		if val == "" {
			continue // blank means unset
		}
		if _, set := os.LookupEnv(key); !set {
			os.Setenv(key, val)
		}
	}
}
