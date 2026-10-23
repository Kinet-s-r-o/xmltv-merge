package service

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"xmltv-merge/internal/models"
	"xmltv-merge/internal/repository"
)

type EPGService struct {
	db          *pgxpool.Pool
	sourceRepo  *repository.SourceRepository
	channelRepo *repository.ChannelRepository
	progRepo    *repository.ProgrammeRepository
}

func NewEPGService(db *pgxpool.Pool) *EPGService {
	return &EPGService{
		db:          db,
		sourceRepo:  repository.NewSourceRepository(db),
		channelRepo: repository.NewChannelRepository(db),
		progRepo:    repository.NewProgrammeRepository(db),
	}
}

func (s *EPGService) GetSources(ctx context.Context) ([]models.Source, error) {
	return s.sourceRepo.List(ctx)
}

func (s *EPGService) GetChannels(ctx context.Context, sourceID *int, search string) ([]models.Channel, error) {
	return s.channelRepo.List(ctx, sourceID, search)
}

func (s *EPGService) GetChannel(ctx context.Context, id int) (*models.Channel, error) {
	return s.channelRepo.GetByID(ctx, id)
}

func (s *EPGService) GetProgrammes(ctx context.Context, date *time.Time, channelID *int, sourceID *int, page, limit int) ([]models.Programme, int, error) {
	return s.progRepo.List(ctx, date, channelID, sourceID, page, limit)
}

func (s *EPGService) GetProgramme(ctx context.Context, id int64) (*models.Programme, error) {
	return s.progRepo.GetByID(ctx, id)
}
