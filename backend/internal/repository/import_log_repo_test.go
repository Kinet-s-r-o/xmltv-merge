package repository

import (
	"context"
	"os"
	"testing"
	"time"

	"xmltv-merge/internal/database"
	"xmltv-merge/internal/models"
)

// TestImportLogRoundTrip needs XMLTV_TEST_DATABASE_URL pointing at a scratch database.
func TestImportLogRoundTrip(t *testing.T) {
	url := os.Getenv("XMLTV_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("XMLTV_TEST_DATABASE_URL not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	pool, err := database.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	sourceID, err := NewSourceRepository(pool).SaveURL(ctx, "import-log-test", "https://example.test/epg.xml", 60, 7)
	if err != nil {
		t.Fatal(err)
	}
	repo := NewImportLogRepository(pool)
	entry := models.SourceImportLog{SourceID: &sourceID, SourceName: "import-log-test", Trigger: "manual", TriggeredBy: "admin",
		StartedAt: time.Now().UTC(), Status: "running", Stage: "download"}
	if err := repo.Start(ctx, &entry); err != nil || entry.ID == 0 {
		t.Fatalf("start: id=%d err=%v", entry.ID, err)
	}
	finished := time.Now().UTC()
	entry.FinishedAt = &finished
	entry.Status, entry.Stage = "partial", "done"
	entry.ProgrammesTotal, entry.ProgrammesImported, entry.ProgrammesUnknownChannel = 10, 7, 3
	entry.IssueCount, entry.Issues = 1, []string{`3 programmes skipped: channel "x" is not declared in the file`}
	if err := repo.Finish(ctx, &entry); err != nil {
		t.Fatalf("finish: %v", err)
	}
	running := models.SourceImportLog{SourceID: &sourceID, SourceName: "import-log-test", Trigger: "scheduled", StartedAt: time.Now().UTC(), Status: "running", Stage: "parse"}
	if err := repo.Start(ctx, &running); err != nil {
		t.Fatal(err)
	}
	if n, err := repo.MarkInterrupted(ctx); err != nil || n < 1 {
		t.Fatalf("mark interrupted: n=%d err=%v", n, err)
	}

	entries, err := repo.ListBySource(ctx, sourceID, 10)
	if err != nil || len(entries) != 2 {
		t.Fatalf("list: %d entries, err=%v", len(entries), err)
	}
	if entries[0].Status != "error" || entries[0].Error == "" {
		t.Fatalf("interrupted entry not closed: %+v", entries[0])
	}
	got := entries[1]
	if got.Status != "partial" || got.ProgrammesUnknownChannel != 3 || len(got.Issues) != 1 || got.TriggeredBy != "admin" {
		t.Fatalf("unexpected stored entry: %+v", got)
	}
	if removed, err := repo.Cleanup(ctx, time.Now().Add(time.Hour)); err != nil || removed != 2 {
		t.Fatalf("cleanup: removed=%d err=%v", removed, err)
	}
}
