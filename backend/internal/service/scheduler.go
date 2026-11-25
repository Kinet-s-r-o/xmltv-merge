package service

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"xmltv-merge/internal/repository"
)

type Scheduler struct {
	sources    *repository.SourceRepository
	programmes *repository.ProgrammeRepository
	imports    *ImportService
}

func NewScheduler(db *pgxpool.Pool, imports *ImportService) *Scheduler {
	return &Scheduler{
		sources:    repository.NewSourceRepository(db),
		programmes: repository.NewProgrammeRepository(db),
		imports:    imports,
	}
}

func (s *Scheduler) Run(ctx context.Context) {
	s.runDue(ctx)
	s.cleanupHistory(ctx)
	importTicker := time.NewTicker(time.Minute)
	defer importTicker.Stop()
	housekeepingTicker := time.NewTicker(time.Hour)
	defer housekeepingTicker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-importTicker.C:
			s.runDue(ctx)
		case <-housekeepingTicker.C:
			s.cleanupHistory(ctx)
		}
	}
}

func (s *Scheduler) cleanupHistory(ctx context.Context) {
	deleted, err := s.programmes.CleanupHistory(ctx)
	if err != nil {
		log.Printf("scheduler: clean programme history: %v", err)
		return
	}
	if deleted > 0 {
		log.Printf("scheduler: removed %d programmes outside source retention periods", deleted)
	}
}

func (s *Scheduler) runDue(ctx context.Context) {
	sources, err := s.sources.Due(ctx)
	if err != nil {
		log.Printf("scheduler: list due sources: %v", err)
		return
	}
	for _, source := range sources {
		if ctx.Err() != nil {
			return
		}
		skipped, err := s.imports.ImportScheduled(ctx, source)
		if skipped {
			continue
		}
		if err != nil {
			log.Printf("scheduler: import source %q: %v", source.Name, err)
		} else {
			log.Printf("scheduler: imported source %q", source.Name)
		}
	}
}
