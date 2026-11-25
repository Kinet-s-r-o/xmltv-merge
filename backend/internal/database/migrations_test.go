package database

import (
	"context"
	"io/fs"
	"os"
	"strings"
	"testing"
	"time"
)

// Connect splits migrations on ";", so a semicolon in a comment would cut a
// statement in half and stop the backend from starting.
func TestMigrationCommentsHaveNoSemicolons(t *testing.T) {
	files, err := fs.Glob(migrations, "migrations/*.sql")
	if err != nil {
		t.Fatal(err)
	}
	for _, file := range files {
		data, err := migrations.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		for i, line := range strings.Split(string(data), "\n") {
			if idx := strings.Index(line, "--"); idx >= 0 && strings.Contains(line[idx:], ";") {
				t.Errorf("%s:%d: semicolon in SQL comment breaks the migration runner: %s", file, i+1, strings.TrimSpace(line))
			}
		}
	}
}

// TestMigrationsApplyTwice runs every migration against a real database twice
// (startup re-applies them). Set XMLTV_TEST_DATABASE_URL to an empty database.
func TestMigrationsApplyTwice(t *testing.T) {
	url := os.Getenv("XMLTV_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("XMLTV_TEST_DATABASE_URL not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	for run := 1; run <= 2; run++ {
		pool, err := Connect(ctx, url)
		if err != nil {
			t.Fatalf("run %d: %v", run, err)
		}
		pool.Close()
	}
}
