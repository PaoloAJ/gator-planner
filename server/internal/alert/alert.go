// Package alert notifies the maintainer when ingestion needs attention, such
// as an expired ONEUF_SESSION cookie.
package alert

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"
)

// Notify logs msg and, when webhookURL is set, POSTs it there. The payload
// carries both "text" (Slack) and "content" (Discord) so either works.
func Notify(ctx context.Context, webhookURL, msg string) {
	slog.Warn("ALERT: " + msg)
	if webhookURL == "" {
		return
	}
	body, _ := json.Marshal(map[string]string{"text": msg, "content": msg})
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, webhookURL, bytes.NewReader(body))
	if err != nil {
		slog.Error("alert: build request", "err", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		slog.Error("alert: webhook", "err", err)
		return
	}
	resp.Body.Close()
	if resp.StatusCode >= 300 {
		slog.Error("alert: webhook", "status", resp.Status)
	}
}
