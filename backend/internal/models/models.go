package models

import "time"

type Source struct {
	ID                     int        `json:"id"`
	Name                   string     `json:"name"`
	SourceURL              string     `json:"source_url"`
	Enabled                bool       `json:"enabled"`
	RefreshIntervalMinutes int        `json:"refresh_interval_minutes"`
	HistoryDays            int        `json:"history_days"`
	GeneratorInfoName      string     `json:"generator_info_name,omitempty"`
	GeneratorInfoURL       string     `json:"generator_info_url,omitempty"`
	LastImportAt           *time.Time `json:"last_import_at,omitempty"`
	LastImportStatus       string     `json:"last_import_status,omitempty"`
	LastImportError        string     `json:"last_import_error,omitempty"`
	CreatedAt              time.Time  `json:"created_at"`
	UpdatedAt              time.Time  `json:"updated_at"`
	ChannelCount           int        `json:"channel_count"`
	ProgrammeCount         int        `json:"programme_count"`
	// Refreshing is true while an import of the source is running or queued.
	Refreshing bool `json:"refreshing"`
}

type Channel struct {
	ID         int       `json:"id"`
	SourceID   int       `json:"source_id"`
	ExternalID string    `json:"external_id"`
	Name       string    `json:"name"`
	NameLang   string    `json:"name_lang,omitempty"`
	IconURL    string    `json:"icon_url,omitempty"`
	URL        string    `json:"url,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

type Programme struct {
	ID              int64      `json:"id"`
	SourceID        int        `json:"source_id"`
	ChannelID       int        `json:"channel_id"`
	StartTime       time.Time  `json:"start_time"`
	StopTime        time.Time  `json:"stop_time"`
	Subtitle        string     `json:"subtitle,omitempty"`
	SubtitleLang    string     `json:"subtitle_lang,omitempty"`
	Description     string     `json:"description,omitempty"`
	DescriptionLang string     `json:"description_lang,omitempty"`
	Country         string     `json:"country,omitempty"`
	Year            *int16     `json:"year,omitempty"`
	EpisodeNum      string     `json:"episode_num,omitempty"`
	EpisodeNumSys   string     `json:"episode_num_system,omitempty"`
	IconURL         string     `json:"icon_url,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	Titles          []Title    `json:"titles,omitempty"`
	Credits         []Credit   `json:"credits,omitempty"`
	Categories      []Category `json:"categories,omitempty"`
	Channel         *Channel   `json:"channel,omitempty"`
}

type Title struct {
	ID          int64  `json:"id"`
	ProgrammeID int64  `json:"programme_id"`
	Lang        string `json:"lang"`
	Title       string `json:"title"`
}

type Credit struct {
	ID          int64  `json:"id"`
	ProgrammeID int64  `json:"programme_id"`
	Type        string `json:"type"`
	Name        string `json:"name"`
}

type Category struct {
	ID          int64  `json:"id"`
	ProgrammeID int64  `json:"programme_id"`
	Lang        string `json:"lang,omitempty"`
	Category    string `json:"category"`
}

type OutputChannel struct {
	ID                 int      `json:"id"`
	OutputID           int      `json:"output_id"`
	ChannelID          int      `json:"channel_id"`
	DisplayName        string   `json:"display_name"`
	IncludeTitle       bool     `json:"include_title"`
	IncludeSubtitle    bool     `json:"include_subtitle"`
	IncludeDescription bool     `json:"include_description"`
	IncludeCredits     bool     `json:"include_credits"`
	IncludeCategories  bool     `json:"include_categories"`
	IncludeCountry     bool     `json:"include_country"`
	IncludeYear        bool     `json:"include_year"`
	IncludeEpisodeNum  bool     `json:"include_episode_num"`
	IncludeIcon        bool     `json:"include_icon"`
	Channel            *Channel `json:"channel,omitempty"`
}

type Output struct {
	ID           int             `json:"id"`
	Name         string          `json:"name"`
	Slug         string          `json:"slug"`
	PublicToken  string          `json:"public_token"`
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
	ChannelCount int             `json:"channel_count"`
	Channels     []OutputChannel `json:"channels,omitempty"`
}

// MulticastOutput is a DVB EIT stream sent to a UDP multicast group.
type MulticastOutput struct {
	ID                    int                `json:"id"`
	Name                  string             `json:"name"`
	Description           string             `json:"description"`
	MulticastAddress      string             `json:"multicast_address"`
	MulticastPort         int                `json:"multicast_port"`
	PID                   int                `json:"pid"`
	ChunkSeconds          int                `json:"chunk_seconds"`
	Timezone              string             `json:"timezone"`
	DaysAhead             int                `json:"days_ahead"`
	TextEncoding          string             `json:"text_encoding"`
	LanguageCode          string             `json:"language_code"`
	TableMode             string             `json:"table_mode"`
	HomeTransportStreamID *int               `json:"home_transport_stream_id"`
	IncludeTDTTOT         bool               `json:"include_tdt_tot"`
	TTL                   int                `json:"ttl"`
	Interface             string             `json:"interface"`
	Enabled               bool               `json:"enabled"`
	CreatedAt             time.Time          `json:"created_at"`
	UpdatedAt             time.Time          `json:"updated_at"`
	ServiceCount          int                `json:"service_count"`
	Services              []MulticastService `json:"services,omitempty"`
	Status                *MulticastStatus   `json:"status,omitempty"`
}

// MulticastService maps an imported channel to a DVB service of an output.
// ChannelID is nil when the channel was deleted; SourceName and ExternalID
// keep the reference so the service can be relinked.
type MulticastService struct {
	ID                int      `json:"id"`
	OutputID          int      `json:"output_id"`
	ChannelID         *int     `json:"channel_id"`
	SourceName        string   `json:"source_name"`
	ExternalID        string   `json:"external_id"`
	DisplayName       string   `json:"display_name"`
	Frequency         *int     `json:"frequency"`
	TransportStreamID int      `json:"transport_stream_id"`
	OriginalNetworkID int      `json:"original_network_id"`
	ServiceID         int      `json:"service_id"`
	Enabled           bool     `json:"enabled"`
	Missing           bool     `json:"missing"`
	Channel           *Channel `json:"channel,omitempty"`
}

// MulticastStatus is the live playout state of a multicast output.
type MulticastStatus struct {
	OutputID            int        `json:"output_id"`
	State               string     `json:"state"`
	LastError           string     `json:"last_error,omitempty"`
	StartedAt           *time.Time `json:"started_at,omitempty"`
	LastBuildAt         *time.Time `json:"last_build_at,omitempty"`
	PacketsSent         uint64     `json:"packets_sent"`
	BytesSent           uint64     `json:"bytes_sent"`
	MeasuredKbps        float64    `json:"measured_kbps"`
	ComputedKbps        float64    `json:"computed_kbps"`
	CycleSeconds        int        `json:"cycle_seconds"`
	Sections            int        `json:"sections"`
	Events              int        `json:"events"`
	TruncatedEvents     int        `json:"truncated_events"`
	ServicesWithoutData []string   `json:"services_without_data"`
}

// SourceImportLog is one audited import attempt of a source.
type SourceImportLog struct {
	ID                       int64      `json:"id"`
	SourceID                 *int       `json:"source_id,omitempty"`
	SourceName               string     `json:"source_name"`
	Trigger                  string     `json:"trigger"`
	TriggeredBy              string     `json:"triggered_by,omitempty"`
	StartedAt                time.Time  `json:"started_at"`
	FinishedAt               *time.Time `json:"finished_at,omitempty"`
	Status                   string     `json:"status"`
	Stage                    string     `json:"stage"`
	Error                    string     `json:"error,omitempty"`
	Bytes                    int64      `json:"bytes"`
	ChannelsTotal            int        `json:"channels_total"`
	ChannelsImported         int        `json:"channels_imported"`
	ProgrammesTotal          int        `json:"programmes_total"`
	ProgrammesImported       int        `json:"programmes_imported"`
	ProgrammesPast           int        `json:"programmes_past"`
	ProgrammesInvalid        int        `json:"programmes_invalid"`
	ProgrammesUnknownChannel int        `json:"programmes_unknown_channel"`
	ProgrammesFailed         int        `json:"programmes_failed"`
	DetailErrors             int        `json:"detail_errors"`
	IssueCount               int        `json:"issue_count"`
	Issues                   []string   `json:"issues"`
}
