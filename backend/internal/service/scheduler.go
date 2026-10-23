package service

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"xmltv-merge/internal/repository"
)

type Scheduler struct {
	sources *repository.SourceRepository
	imports *ImportService
}

func NewScheduler(db *pgxpool.Pool, imports *ImportService) *Scheduler {
	return &Scheduler{sources: repository.NewSourceRepository(db), imports: imports}
}

func (s *Scheduler) Run(ctx context.Context) {
	s.runDue(ctx)
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.runDue(ctx)
		}
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
		importCtx, cancel := context.WithTimeout(ctx, 6*time.Minute)
		err := s.imports.ImportURL(importCtx, source)
		cancel()
		if err != nil {
			log.Printf("scheduler: import source %q: %v", source.Name, err)
		} else {
			log.Printf("scheduler: imported source %q", source.Name)
		}
	}
}
