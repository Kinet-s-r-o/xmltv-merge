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
