package service

import (
	"context"
	"errors"
	"fmt"
	"net"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"xmltv-merge/internal/dvb"
	"xmltv-merge/internal/models"
	"xmltv-merge/internal/repository"
)

// ValidationError is a user-facing input problem (HTTP 400).
type ValidationError struct{ Message string }

func (e *ValidationError) Error() string { return e.Message }

// ConflictError is a conflict with another stored record (HTTP 409).
type ConflictError struct{ Message string }

func (e *ConflictError) Error() string { return e.Message }

func invalid(format string, args ...any) error {
	return &ValidationError{Message: fmt.Sprintf(format, args...)}
}

// MulticastService manages multicast output configuration and builds their
// EIT carousels.
type MulticastService struct {
	repo *repository.MulticastRepository
	// OnChange is called after an output was created, changed or deleted.
	OnChange func()
}

func NewMulticastService(db *pgxpool.Pool) *MulticastService {
	return &MulticastService{repo: repository.NewMulticastRepository(db)}
}

// Repo exposes the repository to the stream manager.
func (s *MulticastService) Repo() *repository.MulticastRepository { return s.repo }

func (s *MulticastService) changed() {
	if s.OnChange != nil {
		s.OnChange()
	}
}

var languageRe = regexp.MustCompile(`^[a-z]{3}$`)

// ApplyMulticastDefaults fills zero values with the documented defaults.
func ApplyMulticastDefaults(o *models.MulticastOutput) {
	if o.PID == 0 {
		o.PID = 18
	}
	if o.ChunkSeconds == 0 {
		o.ChunkSeconds = 30
	}
	if o.Timezone == "" {
		o.Timezone = "Europe/Bratislava"
	}
	if o.DaysAhead == 0 {
		o.DaysAhead = 4
	}
	if o.TextEncoding == "" {
		o.TextEncoding = string(dvb.EncodingUTF8)
	}
	if o.LanguageCode == "" {
		o.LanguageCode = "slk"
	}
	if o.TableMode == "" {
		o.TableMode = string(dvb.ModeActual)
	}
	if o.TTL == 0 {
		o.TTL = 16
	}
}

// ValidateMulticastOutput normalises and checks an output and its services.
func ValidateMulticastOutput(o *models.MulticastOutput) error {
	ApplyMulticastDefaults(o)
	o.Name = strings.TrimSpace(o.Name)
	o.Description = strings.TrimSpace(o.Description)
	o.MulticastAddress = strings.TrimSpace(o.MulticastAddress)
	o.Timezone = strings.TrimSpace(o.Timezone)
	o.LanguageCode = strings.ToLower(strings.TrimSpace(o.LanguageCode))
	o.Interface = strings.TrimSpace(o.Interface)

	if o.Name == "" || len(o.Name) > 200 {
		return invalid("name is required (at most 200 characters)")
	}
	ip := net.ParseIP(o.MulticastAddress).To4()
	if ip == nil || !ip.IsMulticast() {
		return invalid("multicast address must be an IPv4 address in 224.0.0.0/4")
	}
	if ip[0] == 224 && ip[1] == 0 && ip[2] == 0 {
		return invalid("multicast address 224.0.0.0/24 is reserved for link-local protocols")
	}
	o.MulticastAddress = ip.String()
	if o.MulticastPort < 1 || o.MulticastPort > 65535 {
		return invalid("multicast port must be between 1 and 65535")
	}
	if o.PID < 0x10 || o.PID > 0x1FFE {
		return invalid("PID must be between 16 and 8190")
	}
	if o.IncludeTDTTOT && o.PID == dvb.TDTPID {
		return invalid("PID 20 (0x14) is used by TDT/TOT; choose another EIT PID")
	}
	if o.ChunkSeconds < 2 || o.ChunkSeconds > 300 {
		return invalid("chunk time must be between 2 and 300 seconds")
	}
	if o.DaysAhead < 1 || o.DaysAhead > dvb.MaxDaysAhead {
		return invalid("days ahead must be between 1 and %d", dvb.MaxDaysAhead)
	}
	if !dvb.ValidEncoding(o.TextEncoding) {
		return invalid("text encoding must be utf8, iso8859-2 or iso6937")
	}
	if !languageRe.MatchString(o.LanguageCode) {
		return invalid("language code must be three lowercase letters (ISO 639-2), e.g. slk")
	}
	if _, err := time.LoadLocation(o.Timezone); err != nil || o.Timezone == "Local" {
		return invalid("timezone %q is not a valid IANA time zone", o.Timezone)
	}
	switch dvb.TableMode(o.TableMode) {
	case dvb.ModeActual:
		o.HomeTransportStreamID = nil
	case dvb.ModeActualOther:
		if o.HomeTransportStreamID == nil || *o.HomeTransportStreamID < 0 || *o.HomeTransportStreamID > 65535 {
			return invalid("home transport stream id (0-65535) is required for actual + other mode")
		}
	default:
		return invalid("table mode must be actual or actual_other")
	}
	if o.TTL < 1 || o.TTL > 255 {
		return invalid("TTL must be between 1 and 255")
	}
	if len(o.Interface) > 64 {
		return invalid("interface name is too long")
	}

	if o.Services == nil {
		o.Services = make([]models.MulticastService, 0)
	}
	seen := map[[3]int]string{}
	for i := range o.Services {
		svc := &o.Services[i]
		svc.DisplayName = strings.TrimSpace(svc.DisplayName)
		svc.SourceName = strings.TrimSpace(svc.SourceName)
		svc.ExternalID = strings.TrimSpace(svc.ExternalID)
		label := svc.DisplayName
		if label == "" {
			label = fmt.Sprintf("row %d", i+1)
		}
		if svc.ChannelID == nil && svc.ExternalID == "" {
			return invalid("station %s has no channel", label)
		}
		if svc.TransportStreamID < 0 || svc.TransportStreamID > 65535 {
			return invalid("station %s: transport stream id must be between 0 and 65535", label)
		}
		if svc.OriginalNetworkID < 0 || svc.OriginalNetworkID > 65535 {
			return invalid("station %s: network id must be between 0 and 65535", label)
		}
		if svc.ServiceID < 1 || svc.ServiceID > 65535 {
			return invalid("station %s: service id must be between 1 and 65535", label)
		}
		if svc.Frequency != nil && (*svc.Frequency < 0 || *svc.Frequency > 100000) {
			return invalid("station %s: frequency is out of range", label)
		}
		key := [3]int{svc.OriginalNetworkID, svc.TransportStreamID, svc.ServiceID}
		if other, ok := seen[key]; ok {
			return invalid("stations %s and %s use the same network/transport/service id %d/%d/%d", other, label, key[0], key[1], key[2])
		}
		seen[key] = label
	}
	return nil
}

func (s *MulticastService) List(ctx context.Context) ([]models.MulticastOutput, error) {
	return s.repo.List(ctx)
}

func (s *MulticastService) Get(ctx context.Context, id int) (*models.MulticastOutput, error) {
	if _, err := s.repo.RelinkMissing(ctx); err != nil {
		return nil, err
	}
	return s.repo.Get(ctx, id)
}

// fillChannelRefs stores the portable source name + XMLTV id for each
// linked service so it can be relinked if the channel is deleted later.
func (s *MulticastService) fillChannelRefs(ctx context.Context, o *models.MulticastOutput) error {
	refs, err := s.repo.ChannelRefs(ctx)
	if err != nil {
		return err
	}
	byID := map[int]repository.ChannelRef{}
	for ref, id := range refs {
		byID[id] = ref
	}
	sources, err := s.sourceNames(ctx)
	if err != nil {
		return err
	}
	for i := range o.Services {
		svc := &o.Services[i]
		if svc.ChannelID == nil {
			// Try to link a missing reference.
			if id, ok := refs[repository.ChannelRef{Source: strings.ToLower(svc.SourceName), ExternalID: svc.ExternalID}]; ok {
				svc.ChannelID = &id
			}
			continue
		}
		ref, ok := byID[*svc.ChannelID]
		if !ok {
			return invalid("station %s refers to an unknown channel", svc.DisplayName)
		}
		svc.ExternalID = ref.ExternalID
		if name, ok := sources[ref.Source]; ok {
			svc.SourceName = name
		}
		if svc.DisplayName == "" {
			svc.DisplayName = ref.ExternalID
		}
	}
	return nil
}

func (s *MulticastService) sourceNames(ctx context.Context) (map[string]string, error) {
	list, err := repository.NewSourceRepository(s.repoPool()).List(ctx)
	if err != nil {
		return nil, err
	}
	result := map[string]string{}
	for _, src := range list {
		result[strings.ToLower(strings.TrimSpace(src.Name))] = src.Name
	}
	return result, nil
}

func (s *MulticastService) repoPool() *pgxpool.Pool { return s.repo.Pool() }

func (s *MulticastService) checkConflict(ctx context.Context, o *models.MulticastOutput) error {
	if !o.Enabled {
		return nil
	}
	name, err := s.repo.EnabledConflict(ctx, o.ID, o.MulticastAddress, o.MulticastPort)
	if err != nil {
		return err
	}
	if name != "" {
		return &ConflictError{Message: fmt.Sprintf("enabled output %q already streams to %s:%d", name, o.MulticastAddress, o.MulticastPort)}
	}
	return nil
}

// Create validates and stores a new output.
func (s *MulticastService) Create(ctx context.Context, o models.MulticastOutput) (int, error) {
	o.ID = 0
	if err := ValidateMulticastOutput(&o); err != nil {
		return 0, err
	}
	if err := s.fillChannelRefs(ctx, &o); err != nil {
		return 0, err
	}
	if err := s.checkConflict(ctx, &o); err != nil {
		return 0, err
	}
	id, err := s.repo.Create(ctx, o)
	if err != nil {
		return 0, uniqueNameError(err, o.Name)
	}
	s.changed()
	return id, nil
}

// Update validates and replaces an output's settings and services.
func (s *MulticastService) Update(ctx context.Context, o models.MulticastOutput) (bool, error) {
	if err := ValidateMulticastOutput(&o); err != nil {
		return false, err
	}
	if err := s.fillChannelRefs(ctx, &o); err != nil {
		return false, err
	}
	if err := s.checkConflict(ctx, &o); err != nil {
		return false, err
	}
	ok, err := s.repo.Update(ctx, o)
	if err != nil {
		return false, uniqueNameError(err, o.Name)
	}
	if ok {
		s.changed()
	}
	return ok, nil
}

func uniqueNameError(err error, name string) error {
	if err != nil && strings.Contains(err.Error(), "multicast_outputs_name_key") {
		return &ConflictError{Message: fmt.Sprintf("a multicast output named %q already exists", name)}
	}
	return err
}

func (s *MulticastService) Delete(ctx context.Context, id int) (bool, error) {
	ok, err := s.repo.Delete(ctx, id)
	if ok {
		s.changed()
	}
	return ok, err
}

// SetEnabled switches an output on or off.
func (s *MulticastService) SetEnabled(ctx context.Context, id int, enabled bool) (bool, error) {
	if enabled {
		o, err := s.repo.Get(ctx, id)
		if err != nil || o == nil {
			return false, err
		}
		o.Enabled = true
		if err := s.checkConflict(ctx, o); err != nil {
			return false, err
		}
	}
	ok, err := s.repo.SetEnabled(ctx, id, enabled)
	if ok {
		s.changed()
	}
	return ok, err
}

// languageAlias maps ISO 639-2 codes to the ISO 639-1 codes typically used
// in XMLTV lang attributes.
var languageAlias = map[string]string{
	"slk": "sk", "slo": "sk", "ces": "cs", "cze": "cs", "eng": "en", "deu": "de", "ger": "de",
	"hun": "hu", "pol": "pl", "fra": "fr", "fre": "fr", "ita": "it", "spa": "es", "ukr": "uk",
}

// BuildResult is a built carousel with diagnostic information.
type BuildResult struct {
	Carousel            *dvb.Carousel
	ServicesWithoutData []string
	// NextChange is when present/following next changes (or the next UTC
	// midnight), i.e. when the carousel must be rebuilt at the latest.
	NextChange time.Time
	Location   *time.Location
}

func (s *MulticastService) loadEvents(ctx context.Context, o *models.MulticastOutput, now time.Time) (map[int][]dvb.Event, error) {
	var ids []int
	for _, svc := range o.Services {
		if svc.Enabled && svc.ChannelID != nil {
			ids = append(ids, *svc.ChannelID)
		}
	}
	from := dvb.ScheduleStart(now)
	to := from.Add(time.Duration(o.DaysAhead) * 24 * time.Hour)
	return s.repo.ProgrammesForEIT(ctx, ids, from, to, o.LanguageCode, languageAlias[o.LanguageCode])
}

// Build generates the EIT carousel of o at now. versions may be nil.
func (s *MulticastService) Build(ctx context.Context, o *models.MulticastOutput, now time.Time, versions dvb.VersionStore) (*BuildResult, error) {
	loc, err := time.LoadLocation(o.Timezone)
	if err != nil {
		loc = time.UTC
	}
	events, err := s.loadEvents(ctx, o, now)
	if err != nil {
		return nil, err
	}
	res := &BuildResult{Location: loc, ServicesWithoutData: make([]string, 0)}
	midnight := dvb.ScheduleStart(now).Add(24 * time.Hour)
	res.NextChange = midnight
	var services []dvb.Service
	for _, svc := range o.Services {
		if !svc.Enabled {
			continue
		}
		var evs []dvb.Event
		if svc.ChannelID != nil {
			evs = events[*svc.ChannelID]
		}
		if len(evs) == 0 {
			res.ServicesWithoutData = append(res.ServicesWithoutData, svc.DisplayName)
		}
		for _, ev := range evs {
			if !ev.Stop.After(now) {
				continue
			}
			change := ev.Start
			if !ev.Start.After(now) {
				change = ev.Stop
			}
			if change.Before(res.NextChange) {
				res.NextChange = change
			}
			break
		}
		services = append(services, dvb.Service{
			ONID: uint16(svc.OriginalNetworkID), TSID: uint16(svc.TransportStreamID), SID: uint16(svc.ServiceID), Events: evs,
		})
	}
	home := uint16(0)
	if o.HomeTransportStreamID != nil {
		home = uint16(*o.HomeTransportStreamID)
	}
	eit := dvb.BuildEIT(dvb.EITConfig{
		Now: now, DaysAhead: o.DaysAhead, Encoding: dvb.TextEncoding(o.TextEncoding), Language: o.LanguageCode,
		Mode: dvb.TableMode(o.TableMode), HomeTSID: home,
	}, services, versions)
	res.Carousel = dvb.BuildCarousel(uint16(o.PID), time.Duration(o.ChunkSeconds)*time.Second, eit)
	return res, nil
}

// Dump renders cycles of an output's carousel as a transport stream using
// the persisted section versions (without changing them).
func (s *MulticastService) Dump(ctx context.Context, id int, cycles int, now time.Time) (*models.MulticastOutput, []byte, error) {
	o, err := s.Get(ctx, id)
	if err != nil || o == nil {
		return o, nil, err
	}
	seed, err := s.repo.LoadVersions(ctx, id)
	if err != nil {
		return nil, nil, err
	}
	res, err := s.Build(ctx, o, now, dvb.NewMemoryVersions(seed))
	if err != nil {
		return nil, nil, err
	}
	var loc *time.Location
	if o.IncludeTDTTOT {
		loc = res.Location
	}
	return o, dvb.Dump(res.Carousel, cycles, now, loc, dvb.CountryForZone(o.Timezone)), nil
}

// ServicePreview summarises the data available for one service.
type ServicePreview struct {
	ServiceID         int        `json:"service_id"`
	TransportStreamID int        `json:"transport_stream_id"`
	OriginalNetworkID int        `json:"original_network_id"`
	DisplayName       string     `json:"display_name"`
	Events            int        `json:"events"`
	Now               *EventInfo `json:"now"`
	Next              *EventInfo `json:"next"`
}

// EventInfo is a short event description for previews.
type EventInfo struct {
	Title string    `json:"title"`
	Start time.Time `json:"start"`
	Stop  time.Time `json:"stop"`
}

// OutputPreview is the response of the preview endpoint.
type OutputPreview struct {
	ComputedKbps float64          `json:"computed_kbps"`
	Sections     int              `json:"sections"`
	Events       int              `json:"events"`
	Truncated    int              `json:"truncated_events"`
	Services     []ServicePreview `json:"services"`
}

// Preview builds the carousel without touching versions and reports now/next
// and event counts per service.
func (s *MulticastService) Preview(ctx context.Context, id int, now time.Time) (*OutputPreview, error) {
	o, err := s.Get(ctx, id)
	if err != nil || o == nil {
		return nil, err
	}
	events, err := s.loadEvents(ctx, o, now)
	if err != nil {
		return nil, err
	}
	res, err := s.Build(ctx, o, now, nil)
	if err != nil {
		return nil, err
	}
	p := &OutputPreview{
		ComputedKbps: res.Carousel.Kbps(), Sections: res.Carousel.Sections, Events: res.Carousel.Events,
		Truncated: res.Carousel.Truncated, Services: make([]ServicePreview, 0, len(o.Services)),
	}
	for _, svc := range o.Services {
		sp := ServicePreview{ServiceID: svc.ServiceID, TransportStreamID: svc.TransportStreamID,
			OriginalNetworkID: svc.OriginalNetworkID, DisplayName: svc.DisplayName}
		if svc.ChannelID != nil && svc.Enabled {
			evs := events[*svc.ChannelID]
			sp.Events = len(evs)
			for _, ev := range evs {
				if !ev.Stop.After(now) {
					continue
				}
				info := &EventInfo{Title: ev.Title, Start: ev.Start, Stop: ev.Stop}
				if !ev.Start.After(now) && sp.Now == nil {
					sp.Now = info
					continue
				}
				sp.Next = info
				break
			}
		}
		p.Services = append(p.Services, sp)
	}
	return p, nil
}

// IsValidation reports whether err is a ValidationError.
func IsValidation(err error) bool {
	var v *ValidationError
	return errors.As(err, &v)
}

// IsConflict reports whether err is a ConflictError.
func IsConflict(err error) bool {
	var c *ConflictError
	return errors.As(err, &c)
}
