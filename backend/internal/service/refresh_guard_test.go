package service

import (
	"context"
	"testing"

	"xmltv-merge/internal/models"
)

func TestRefreshGuardPreventsOverlappingImports(t *testing.T) {
	s := NewImportService(nil)
	if !s.beginRefresh(5) {
		t.Fatal("first refresh of a source must start")
	}
	if !s.IsRefreshing(5) {
		t.Fatal("source must report refreshing while an import runs")
	}
	if s.beginRefresh(5) {
		t.Fatal("second refresh of the same source must be refused")
	}
	skipped, err := s.ImportScheduled(context.Background(), models.Source{ID: 5})
	if !skipped || err != nil {
		t.Fatalf("scheduled import of a refreshing source: skipped=%v err=%v, want skipped", skipped, err)
	}
	if !s.beginRefresh(6) {
		t.Fatal("other sources must not be blocked")
	}
	s.endRefresh(5)
	if s.IsRefreshing(5) {
		t.Fatal("source must stop reporting refreshing after the import ends")
	}
}
