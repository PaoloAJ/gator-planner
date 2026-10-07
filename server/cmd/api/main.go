// Command api serves the GatorPlan REST API.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"

	"gatorplan/internal/api"
	"gatorplan/internal/config"
	"gatorplan/internal/planner"
	"gatorplan/internal/store"
)

func main() {
	if err := run(); err != nil {
		slog.Error("api exited", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	if err := db.Migrate(ctx); err != nil {
		return err
	}

	// The degree planner needs an Anthropic key; without one /api/plan
	// reports that it isn't enabled and everything else works as before.
	var pl api.Planner
	if cfg.AnthropicAPIKey != "" {
		client := anthropic.NewClient(option.WithAPIKey(cfg.AnthropicAPIKey))
		pl = planner.New(client, cfg.AnthropicModel, cfg.PlannerEffort, db)
	} else {
		slog.Warn("ANTHROPIC_API_KEY is blank: the degree planner is disabled")
	}

	srv := &http.Server{
		Addr:              cfg.APIAddr,
		Handler:           api.New(db, pl, cfg.PlansPerHour).Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	errc := make(chan error, 1)
	go func() {
		slog.Info("api listening", "addr", cfg.APIAddr)
		errc <- srv.ListenAndServe()
	}()

	select {
	case err := <-errc:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		slog.Info("shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return srv.Shutdown(shutdownCtx)
	}
	return nil
}
