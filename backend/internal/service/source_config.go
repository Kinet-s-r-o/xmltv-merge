package service

import (
	"context"
	"encoding/xml"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"xmltv-merge/internal/models"
	"xmltv-merge/internal/repository"
)

// Source configuration files (export/import) use a small versioned XML schema:
//
//	<?xml version="1.0" encoding="UTF-8"?>
//	<xmltv-sources version="1" exported-at="2026-11-24T10:00:00Z">
//	  <source enabled="true">
//	    <name>Provider EPG – SK</name>
//	    <url>https://provider.example/epg.xml.gz</url>
//	    <refresh-interval-hours>6</refresh-interval-hours>
//	    <history-days>7</history-days>
//	  </source>
//	</xmltv-sources>
//
// Only configuration is exchanged; channels, programmes and import status are not.
const (
	SourceConfigVersion    = "1"
	SourceConfigRoot       = "xmltv-sources"
	MaxSourceConfigBytes   = 1 << 20
	MaxSourceConfigEntries = 1000
	MinRefreshHours        = 1
	MaxRefreshHours        = 168
	MinHistoryDays         = 1
	MaxHistoryDays         = 3650
	maxSourceNameLength    = 200
	maxSourceURLLength     = 2048
)

// SourceConfig is one source entry of a configuration file.
type SourceConfig struct {
	Name                 string
	URL                  string
	Enabled              bool
	RefreshIntervalHours int
	HistoryDays          int
}

type sourceConfigFileXML struct {
	XMLName    xml.Name          `xml:"xmltv-sources"`
	Version    string            `xml:"version,attr"`
	ExportedAt string            `xml:"exported-at,attr,omitempty"`
	Sources    []sourceConfigXML `xml:"source"`
}

type sourceConfigXML struct {
	Enabled              *string `xml:"enabled,attr"`
	Name                 *string `xml:"name"`
	URL                  *string `xml:"url"`
	RefreshIntervalHours *string `xml:"refresh-interval-hours"`
	HistoryDays          *string `xml:"history-days"`
}

// MarshalSourceConfigs renders source configurations as a version 1 file.
func MarshalSourceConfigs(configs []SourceConfig, exportedAt time.Time) ([]byte, error) {
	file := sourceConfigFileXML{
		Version:    SourceConfigVersion,
		ExportedAt: exportedAt.UTC().Format(time.RFC3339),
		Sources:    make([]sourceConfigXML, 0, len(configs)),
	}
	for _, c := range configs {
		enabled := strconv.FormatBool(c.Enabled)
		name, sourceURL := c.Name, c.URL
		interval, history := strconv.Itoa(c.RefreshIntervalHours), strconv.Itoa(c.HistoryDays)
		file.Sources = append(file.Sources, sourceConfigXML{
			Enabled: &enabled, Name: &name, URL: &sourceURL,
			RefreshIntervalHours: &interval, HistoryDays: &history,
		})
	}
	body, err := xml.MarshalIndent(file, "", "  ")
	if err != nil {
		return nil, err
	}
	out := append([]byte(xml.Header), body...)
	return append(out, '\n'), nil
}

// SourceToConfig converts a stored source to its exportable configuration.
// Intervals are stored in minutes; the file uses whole hours (rounded, clamped to 1–168).
func SourceToConfig(s models.Source) SourceConfig {
	hours := (s.RefreshIntervalMinutes + 30) / 60
	if hours < MinRefreshHours {
		hours = MinRefreshHours
	}
	if hours > MaxRefreshHours {
		hours = MaxRefreshHours
	}
	return SourceConfig{
		Name:                 s.Name,
		URL:                  s.SourceURL,
		Enabled:              s.Enabled,
		RefreshIntervalHours: hours,
		HistoryDays:          s.HistoryDays,
	}
}

// ParseSourceConfigs decodes and validates a configuration file. It returns a
// *ConfigFileError describing every problem when the file cannot be imported.
func ParseSourceConfigs(data []byte) ([]SourceConfig, error) {
	var file sourceConfigFileXML
	if err := decodeConfigFile(data, SourceConfigRoot, SourceConfigVersion, &file, func() string { return file.Version }); err != nil {
		return nil, err
	}
	if len(file.Sources) == 0 {
		return nil, &ConfigFileError{Message: "the file contains no <source> entries"}
	}
	if len(file.Sources) > MaxSourceConfigEntries {
		return nil, &ConfigFileError{Message: fmt.Sprintf("the file contains %d sources; at most %d are allowed", len(file.Sources), MaxSourceConfigEntries)}
	}

	configs := make([]SourceConfig, 0, len(file.Sources))
	var details []string
	seen := make(map[string]int, len(file.Sources))
	for i, entry := range file.Sources {
		label := fmt.Sprintf("source %d", i+1)
		var problems []string

		name := strings.TrimSpace(deref(entry.Name))
		if name != "" {
			label = fmt.Sprintf("source %d (%q)", i+1, name)
		}
		switch {
		case name == "":
			problems = append(problems, "<name> is required")
		case len([]rune(name)) > maxSourceNameLength:
			problems = append(problems, fmt.Sprintf("<name> is longer than %d characters", maxSourceNameLength))
		default:
			key := strings.ToLower(name)
			if first, dup := seen[key]; dup {
				problems = append(problems, fmt.Sprintf("duplicate name; already used by source %d", first))
			} else {
				seen[key] = i + 1
			}
		}

		sourceURL := strings.TrimSpace(deref(entry.URL))
		if sourceURL == "" {
			problems = append(problems, "<url> is required")
		} else if err := validateSourceURL(sourceURL); err != nil {
			problems = append(problems, err.Error())
		}

		enabled, ok := parseConfigBool(entry.Enabled, true)
		if !ok {
			problems = append(problems, fmt.Sprintf("enabled attribute must be true or false, got %q", *entry.Enabled))
		}

		interval, problem := parseBoundedInt(entry.RefreshIntervalHours, "refresh-interval-hours", MinRefreshHours, MaxRefreshHours, "hours")
		if problem != "" {
			problems = append(problems, problem)
		}
		history, problem := parseBoundedInt(entry.HistoryDays, "history-days", MinHistoryDays, MaxHistoryDays, "days")
		if problem != "" {
			problems = append(problems, problem)
		}

		for _, p := range problems {
			details = append(details, label+": "+p)
		}
		if len(problems) == 0 {
			configs = append(configs, SourceConfig{Name: name, URL: sourceURL, Enabled: enabled, RefreshIntervalHours: interval, HistoryDays: history})
		}
	}
	if len(details) > 0 {
		return nil, &ConfigFileError{Message: fmt.Sprintf("%d problem(s) found; nothing was imported", len(details)), Details: details}
	}
	return configs, nil
}

func parseBoundedInt(raw *string, element string, min, max int, unit string) (int, string) {
	value := strings.TrimSpace(deref(raw))
	if value == "" {
		return 0, fmt.Sprintf("<%s> is required", element)
	}
	n, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Sprintf("<%s> must be a whole number, got %q", element, value)
	}
	if n < min || n > max {
		return 0, fmt.Sprintf("<%s> must be between %d and %d %s, got %d", element, min, max, unit, n)
	}
	return n, ""
}

func validateSourceURL(raw string) error {
	if len(raw) > maxSourceURLLength {
		return fmt.Errorf("<url> is longer than %d characters", maxSourceURLLength)
	}
	parsed, err := url.ParseRequestURI(raw)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return fmt.Errorf("<url> must be a valid HTTP or HTTPS URL, got %q", raw)
	}
	return nil
}

// Source import actions shown in the preview and applied on confirm.
const (
	SourceImportCreate    = "create"
	SourceImportUpdate    = "update"
	SourceImportUnchanged = "unchanged"
)

// SourceImportItem is one planned change. Existing sources are matched by name
// (case-insensitive); matching sources are updated, never deleted.
type SourceImportItem struct {
	Name                   string   `json:"name"`
	URL                    string   `json:"url"`
	Enabled                bool     `json:"enabled"`
	RefreshIntervalMinutes int      `json:"refresh_interval_minutes"`
	HistoryDays            int      `json:"history_days"`
	Action                 string   `json:"action"`
	ExistingID             int      `json:"existing_id,omitempty"`
	Changes                []string `json:"changes"`
}

type SourceImportSummary struct {
	Create    int `json:"create"`
	Update    int `json:"update"`
	Unchanged int `json:"unchanged"`
}

type SourceImportPlan struct {
	Version string              `json:"version"`
	Items   []SourceImportItem  `json:"items"`
	Summary SourceImportSummary `json:"summary"`
	Applied bool                `json:"applied"`
}

// PlanSourceImport compares imported configs with existing sources.
func PlanSourceImport(existing []models.Source, configs []SourceConfig) SourceImportPlan {
	byName := make(map[string]models.Source, len(existing))
	for _, s := range existing {
		byName[strings.ToLower(strings.TrimSpace(s.Name))] = s
	}
	plan := SourceImportPlan{Version: SourceConfigVersion, Items: make([]SourceImportItem, 0, len(configs))}
	for _, c := range configs {
		item := SourceImportItem{
			Name:                   c.Name,
			URL:                    c.URL,
			Enabled:                c.Enabled,
			RefreshIntervalMinutes: c.RefreshIntervalHours * 60,
			HistoryDays:            c.HistoryDays,
			Changes:                []string{},
		}
		current, ok := byName[strings.ToLower(c.Name)]
		if !ok {
			item.Action = SourceImportCreate
			plan.Summary.Create++
			plan.Items = append(plan.Items, item)
			continue
		}
		item.ExistingID = current.ID
		if current.Name != c.Name {
			item.Changes = append(item.Changes, "name")
		}
		if current.SourceURL != c.URL {
			item.Changes = append(item.Changes, "url")
		}
		if current.Enabled != c.Enabled {
			item.Changes = append(item.Changes, "enabled")
		}
		if current.RefreshIntervalMinutes != item.RefreshIntervalMinutes {
			item.Changes = append(item.Changes, "refresh_interval")
		}
		if current.HistoryDays != c.HistoryDays {
			item.Changes = append(item.Changes, "history_days")
		}
		if len(item.Changes) == 0 {
			item.Action = SourceImportUnchanged
			plan.Summary.Unchanged++
		} else {
			item.Action = SourceImportUpdate
			plan.Summary.Update++
		}
		plan.Items = append(plan.Items, item)
	}
	return plan
}

// ExportSourceConfigs renders all URL-backed sources. Sources created by a
// one-off file upload have no URL and are not part of the configuration.
func (s *ImportService) ExportSourceConfigs(ctx context.Context, now time.Time) ([]byte, int, error) {
	sources, err := s.sourceRepo.List(ctx)
	if err != nil {
		return nil, 0, err
	}
	configs := make([]SourceConfig, 0, len(sources))
	for _, src := range sources {
		if strings.TrimSpace(src.SourceURL) == "" {
			continue
		}
		configs = append(configs, SourceToConfig(src))
	}
	body, err := MarshalSourceConfigs(configs, now)
	return body, len(configs), err
}

// ImportSourceConfigs validates a configuration file and returns the plan. When
// apply is true, the plan is written in one transaction; nothing is deleted.
func (s *ImportService) ImportSourceConfigs(ctx context.Context, data []byte, apply bool) (*SourceImportPlan, error) {
	configs, err := ParseSourceConfigs(data)
	if err != nil {
		return nil, err
	}
	existing, err := s.sourceRepo.List(ctx)
	if err != nil {
		return nil, err
	}
	plan := PlanSourceImport(existing, configs)
	if !apply {
		return &plan, nil
	}
	if err := s.sourceRepo.ApplyConfigImport(ctx, toRepoItems(plan.Items)); err != nil {
		return nil, fmt.Errorf("apply source import: %w", err)
	}
	plan.Applied = true
	return &plan, nil
}

func toRepoItems(items []SourceImportItem) []repository.ConfigImportItem {
	out := make([]repository.ConfigImportItem, 0, len(items))
	for _, item := range items {
		if item.Action == SourceImportUnchanged {
			continue
		}
		repoItem := repository.ConfigImportItem{
			ExistingID:             item.ExistingID,
			Name:                   item.Name,
			SourceURL:              item.URL,
			Enabled:                item.Enabled,
			RefreshIntervalMinutes: item.RefreshIntervalMinutes,
			HistoryDays:            item.HistoryDays,
		}
		for _, change := range item.Changes {
			if change == "enabled" {
				repoItem.EnabledChanged = true
			} else {
				repoItem.ConfigChanged = true
			}
		}
		out = append(out, repoItem)
	}
	return out
}
