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
	outputRepo  *repository.OutputRepository
}

func NewEPGService(db *pgxpool.Pool) *EPGService {
	return &EPGService{
		db:          db,
		sourceRepo:  repository.NewSourceRepository(db),
		channelRepo: repository.NewChannelRepository(db),
		progRepo:    repository.NewProgrammeRepository(db),
		outputRepo:  repository.NewOutputRepository(db),
	}
}

func (s *EPGService) GetOutputs(ctx context.Context) ([]models.Output, error) {
	return s.outputRepo.List(ctx)
}
func (s *EPGService) GetOutput(ctx context.Context, id int) (*models.Output, error) {
	return s.outputRepo.Get(ctx, id)
}
func (s *EPGService) GetOutputBySlugAndToken(ctx context.Context, slug, token string) (*models.Output, error) {
	return s.outputRepo.GetBySlugAndToken(ctx, slug, token)
}
func (s *EPGService) AddOutput(ctx context.Context, name string) (int, error) {
	return s.outputRepo.Create(ctx, name)
}
func (s *EPGService) UpdateOutput(ctx context.Context, id int, name string) (bool, error) {
	return s.outputRepo.Update(ctx, id, name)
}
func (s *EPGService) DeleteOutput(ctx context.Context, id int) (bool, error) {
	return s.outputRepo.Delete(ctx, id)
}
func (s *EPGService) SaveOutputChannels(ctx context.Context, id int, channels []models.OutputChannel) error {
	return s.outputRepo.SaveChannels(ctx, id, channels)
}

func (s *EPGService) GetSources(ctx context.Context) ([]models.Source, error) {
	return s.sourceRepo.List(ctx)
}

func (s *EPGService) DeleteSource(ctx context.Context, id int) (bool, error) {
	return s.sourceRepo.Delete(ctx, id)
}

func (s *EPGService) SetSourceEnabled(ctx context.Context, id int, enabled bool) (bool, error) {
	return s.sourceRepo.SetEnabled(ctx, id, enabled)
}

func (s *EPGService) GetChannels(ctx context.Context, sourceID *int, search string) ([]models.Channel, error) {
	return s.channelRepo.List(ctx, sourceID, search)
}

func (s *EPGService) GetChannel(ctx context.Context, id int) (*models.Channel, error) {
	return s.channelRepo.GetByID(ctx, id)
}

func (s *EPGService) GetProgrammes(ctx context.Context, date *time.Time, channelID *int, channelIDs []int, sourceID *int, page, limit int) ([]models.Programme, int, error) {
	return s.progRepo.List(ctx, date, channelID, channelIDs, sourceID, page, limit)
}

func (s *EPGService) GetProgramme(ctx context.Context, id int64) (*models.Programme, error) {
	return s.progRepo.GetByID(ctx, id)
}
