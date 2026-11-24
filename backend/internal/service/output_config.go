package service

import (
	"context"
	"encoding/xml"
	"fmt"
	"strconv"
	"strings"
	"time"

	"xmltv-merge/internal/models"
	"xmltv-merge/internal/repository"
)

// Output configuration files use a versioned XML schema. Channels are
// referenced portably by source name + XMLTV channel id, never by database id,
// and public feed tokens are never written:
//
//	<?xml version="1.0" encoding="UTF-8"?>
//	<xmltv-outputs version="1" exported-at="2026-11-24T10:00:00Z">
//	  <output>
//	    <name>Customer A</name>
//	    <channel source="Provider EPG – SK" id="joj.sk">
//	      <display-name>JOJ</display-name>
//	      <fields title="true" subtitle="true" description="true" credits="false"
//	              categories="false" country="false" year="false" episode-num="false" icon="true"/>
//	    </channel>
//	  </output>
//	</xmltv-outputs>
const (
	OutputConfigVersion     = "1"
	OutputConfigRoot        = "xmltv-outputs"
	MaxOutputConfigBytes    = 8 << 20
	MaxOutputConfigEntries  = 500
	MaxOutputConfigChannels = 5000
	maxOutputNameLength     = 200
	maxDisplayNameLength    = 500
	maxChannelRefLength     = 200
)

// OutputFields are the programme fields written for one channel.
type OutputFields struct {
	Title, Subtitle, Description, Credits, Categories, Country, Year, EpisodeNum, Icon bool
}

// AllOutputFields is the default when a file omits <fields> or an attribute.
var AllOutputFields = OutputFields{true, true, true, true, true, true, true, true, true}

// OutputChannelConfig is one channel rule of an output configuration.
type OutputChannelConfig struct {
	Source      string
	ChannelID   string
	DisplayName string
	Fields      OutputFields
}

// OutputConfig is one output entry of a configuration file.
type OutputConfig struct {
	Name     string
	Channels []OutputChannelConfig
}

type outputConfigFileXML struct {
	XMLName    xml.Name          `xml:"xmltv-outputs"`
	Version    string            `xml:"version,attr"`
	ExportedAt string            `xml:"exported-at,attr,omitempty"`
	Outputs    []outputConfigXML `xml:"output"`
}

type outputConfigXML struct {
	Name     *string                  `xml:"name"`
	Channels []outputChannelConfigXML `xml:"channel"`
}

type outputChannelConfigXML struct {
	Source      *string          `xml:"source,attr"`
	ID          *string          `xml:"id,attr"`
	DisplayName *string          `xml:"display-name"`
	Fields      *outputFieldsXML `xml:"fields"`
}

type outputFieldsXML struct {
	Title       *string `xml:"title,attr"`
	Subtitle    *string `xml:"subtitle,attr"`
	Description *string `xml:"description,attr"`
	Credits     *string `xml:"credits,attr"`
	Categories  *string `xml:"categories,attr"`
	Country     *string `xml:"country,attr"`
	Year        *string `xml:"year,attr"`
	EpisodeNum  *string `xml:"episode-num,attr"`
	Icon        *string `xml:"icon,attr"`
}

func boolAttr(v bool) *string {
	s := strconv.FormatBool(v)
	return &s
}

// MarshalOutputConfigs renders output configurations as a version 1 file.
func MarshalOutputConfigs(configs []OutputConfig, exportedAt time.Time) ([]byte, error) {
	file := outputConfigFileXML{
		Version:    OutputConfigVersion,
		ExportedAt: exportedAt.UTC().Format(time.RFC3339),
		Outputs:    make([]outputConfigXML, 0, len(configs)),
	}
	for _, c := range configs {
		name := c.Name
		entry := outputConfigXML{Name: &name, Channels: make([]outputChannelConfigXML, 0, len(c.Channels))}
		for _, ch := range c.Channels {
			source, id, display := ch.Source, ch.ChannelID, ch.DisplayName
			f := ch.Fields
			entry.Channels = append(entry.Channels, outputChannelConfigXML{
				Source: &source, ID: &id, DisplayName: &display,
				Fields: &outputFieldsXML{
					Title: boolAttr(f.Title), Subtitle: boolAttr(f.Subtitle), Description: boolAttr(f.Description),
					Credits: boolAttr(f.Credits), Categories: boolAttr(f.Categories), Country: boolAttr(f.Country),
					Year: boolAttr(f.Year), EpisodeNum: boolAttr(f.EpisodeNum), Icon: boolAttr(f.Icon),
				},
			})
		}
		file.Outputs = append(file.Outputs, entry)
	}
	body, err := xml.MarshalIndent(file, "", "  ")
	if err != nil {
		return nil, err
	}
	out := append([]byte(xml.Header), body...)
	return append(out, '\n'), nil
}

// OutputRecordToConfig converts a stored output to its exportable configuration.
func OutputRecordToConfig(o repository.OutputConfigRecord) OutputConfig {
	cfg := OutputConfig{Name: o.Name, Channels: make([]OutputChannelConfig, 0, len(o.Channels))}
	for _, ch := range o.Channels {
		cfg.Channels = append(cfg.Channels, OutputChannelConfig{
			Source:      ch.SourceName,
			ChannelID:   ch.ExternalID,
			DisplayName: ch.DisplayName,
			Fields:      fieldsOf(ch.OutputChannel),
		})
	}
	return cfg
}

func fieldsOf(oc models.OutputChannel) OutputFields {
	return OutputFields{
		Title: oc.IncludeTitle, Subtitle: oc.IncludeSubtitle, Description: oc.IncludeDescription,
		Credits: oc.IncludeCredits, Categories: oc.IncludeCategories, Country: oc.IncludeCountry,
		Year: oc.IncludeYear, EpisodeNum: oc.IncludeEpisodeNum, Icon: oc.IncludeIcon,
	}
}

// ParseOutputConfigs decodes and validates an output configuration file. It
// returns a *ConfigFileError describing every problem when it cannot be imported.
func ParseOutputConfigs(data []byte) ([]OutputConfig, error) {
	var file outputConfigFileXML
	if err := decodeConfigFile(data, OutputConfigRoot, OutputConfigVersion, &file, func() string { return file.Version }); err != nil {
		return nil, err
	}
	if len(file.Outputs) == 0 {
		return nil, &ConfigFileError{Message: "the file contains no <output> entries"}
	}
	if len(file.Outputs) > MaxOutputConfigEntries {
		return nil, &ConfigFileError{Message: fmt.Sprintf("the file contains %d outputs; at most %d are allowed", len(file.Outputs), MaxOutputConfigEntries)}
	}

	configs := make([]OutputConfig, 0, len(file.Outputs))
	var details []string
	seenNames := map[string]int{}
	seenSlugs := map[string]int{}
	for i, entry := range file.Outputs {
		label := fmt.Sprintf("output %d", i+1)
		var problems []string

		name := strings.TrimSpace(deref(entry.Name))
		if name != "" {
			label = fmt.Sprintf("output %d (%q)", i+1, name)
		}
		switch {
		case name == "":
			problems = append(problems, "<name> is required")
		case len([]rune(name)) > maxOutputNameLength:
			problems = append(problems, fmt.Sprintf("<name> is longer than %d characters", maxOutputNameLength))
		case repository.OutputSlug(name) == "":
			problems = append(problems, "<name> must contain at least one letter or digit (it becomes the feed URL slug)")
		default:
			key := strings.ToLower(name)
			slug := repository.OutputSlug(name)
			if first, dup := seenNames[key]; dup {
				problems = append(problems, fmt.Sprintf("duplicate name; already used by output %d", first))
			} else if first, dup := seenSlugs[slug]; dup {
				problems = append(problems, fmt.Sprintf("feed slug %q is already used by output %d", slug, first))
			} else {
				seenNames[key] = i + 1
				seenSlugs[slug] = i + 1
			}
		}
		if len(entry.Channels) > MaxOutputConfigChannels {
			problems = append(problems, fmt.Sprintf("has %d channels; at most %d are allowed", len(entry.Channels), MaxOutputConfigChannels))
		}

		cfg := OutputConfig{Name: name, Channels: make([]OutputChannelConfig, 0, len(entry.Channels))}
		seenChannels := map[repository.ChannelRef]int{}
		for j, ch := range entry.Channels {
			chLabel := fmt.Sprintf("channel %d", j+1)
			source := strings.TrimSpace(deref(ch.Source))
			id := strings.TrimSpace(deref(ch.ID))
			if id != "" {
				chLabel = fmt.Sprintf("channel %d (%q)", j+1, id)
			}
			var chProblems []string
			if source == "" {
				chProblems = append(chProblems, "source attribute is required")
			} else if len([]rune(source)) > maxSourceNameLength {
				chProblems = append(chProblems, fmt.Sprintf("source attribute is longer than %d characters", maxSourceNameLength))
			}
			if id == "" {
				chProblems = append(chProblems, "id attribute is required")
			} else if len([]rune(id)) > maxChannelRefLength {
				chProblems = append(chProblems, fmt.Sprintf("id attribute is longer than %d characters", maxChannelRefLength))
			}
			if source != "" && id != "" {
				ref := repository.ChannelRef{Source: strings.ToLower(source), ExternalID: id}
				if first, dup := seenChannels[ref]; dup {
					chProblems = append(chProblems, fmt.Sprintf("listed twice; already used by channel %d", first))
				} else {
					seenChannels[ref] = j + 1
				}
			}
			display := strings.TrimSpace(deref(ch.DisplayName))
			if len([]rune(display)) > maxDisplayNameLength {
				chProblems = append(chProblems, fmt.Sprintf("<display-name> is longer than %d characters", maxDisplayNameLength))
			}
			fields, fieldProblems := parseOutputFields(ch.Fields)
			chProblems = append(chProblems, fieldProblems...)
			for _, p := range chProblems {
				problems = append(problems, chLabel+": "+p)
			}
			cfg.Channels = append(cfg.Channels, OutputChannelConfig{Source: source, ChannelID: id, DisplayName: display, Fields: fields})
		}

		for _, p := range problems {
			details = append(details, label+": "+p)
		}
		if len(problems) == 0 {
			configs = append(configs, cfg)
		}
	}
	if len(details) > 0 {
		return nil, &ConfigFileError{Message: fmt.Sprintf("%d problem(s) found; nothing was imported", len(details)), Details: details}
	}
	return configs, nil
}

func parseOutputFields(raw *outputFieldsXML) (OutputFields, []string) {
	fields := AllOutputFields
	if raw == nil {
		return fields, nil
	}
	var problems []string
	for _, f := range []struct {
		attr string
		raw  *string
		dst  *bool
	}{
		{"title", raw.Title, &fields.Title}, {"subtitle", raw.Subtitle, &fields.Subtitle},
		{"description", raw.Description, &fields.Description}, {"credits", raw.Credits, &fields.Credits},
		{"categories", raw.Categories, &fields.Categories}, {"country", raw.Country, &fields.Country},
		{"year", raw.Year, &fields.Year}, {"episode-num", raw.EpisodeNum, &fields.EpisodeNum},
		{"icon", raw.Icon, &fields.Icon},
	} {
		value, ok := parseConfigBool(f.raw, true)
		if !ok {
			problems = append(problems, fmt.Sprintf("<fields %s> must be true or false, got %q", f.attr, *f.raw))
			continue
		}
		*f.dst = value
	}
	return fields, problems
}

// Output import actions (same vocabulary as source imports).
const (
	OutputImportCreate    = "create"
	OutputImportUpdate    = "update"
	OutputImportUnchanged = "unchanged"
)

// MissingChannel is a channel referenced by the file that does not exist here.
type MissingChannel struct {
	Source string `json:"source"`
	ID     string `json:"id"`
}

// OutputImportItem is one planned output change. Outputs are matched by name
// (case-insensitive); a matching output's channel list is replaced by the
// file's. Channels that do not exist on this instance are listed in
// MissingChannels and left out.
type OutputImportItem struct {
	Name            string           `json:"name"`
	Slug            string           `json:"slug"`
	Action          string           `json:"action"`
	ExistingID      int              `json:"existing_id,omitempty"`
	Changes         []string         `json:"changes"`
	ChannelCount    int              `json:"channel_count"`
	ChannelsAdded   int              `json:"channels_added"`
	ChannelsRemoved int              `json:"channels_removed"`
	ChannelsChanged int              `json:"channels_changed"`
	MissingChannels []MissingChannel `json:"missing_channels"`

	rules []models.OutputChannel
}

type OutputImportSummary struct {
	Create          int `json:"create"`
	Update          int `json:"update"`
	Unchanged       int `json:"unchanged"`
	MissingChannels int `json:"missing_channels"`
}

type OutputImportPlan struct {
	Version string              `json:"version"`
	Items   []OutputImportItem  `json:"items"`
	Summary OutputImportSummary `json:"summary"`
	Applied bool                `json:"applied"`
}

func ruleFromConfig(channelID int, c OutputChannelConfig) models.OutputChannel {
	f := c.Fields
	return models.OutputChannel{
		ChannelID: channelID, DisplayName: c.DisplayName,
		IncludeTitle: f.Title, IncludeSubtitle: f.Subtitle, IncludeDescription: f.Description,
		IncludeCredits: f.Credits, IncludeCategories: f.Categories, IncludeCountry: f.Country,
		IncludeYear: f.Year, IncludeEpisodeNum: f.EpisodeNum, IncludeIcon: f.Icon,
	}
}

// PlanOutputImport resolves channel references and compares the file with the
// existing outputs. It returns a *ConfigFileError when a new output's feed slug
// collides with an existing output of a different name.
func PlanOutputImport(existing []repository.OutputConfigRecord, channelIDs map[repository.ChannelRef]int, configs []OutputConfig) (OutputImportPlan, error) {
	byName := make(map[string]repository.OutputConfigRecord, len(existing))
	bySlug := make(map[string]repository.OutputConfigRecord, len(existing))
	for _, o := range existing {
		byName[strings.ToLower(strings.TrimSpace(o.Name))] = o
		bySlug[o.Slug] = o
	}

	plan := OutputImportPlan{Version: OutputConfigVersion, Items: make([]OutputImportItem, 0, len(configs))}
	var conflicts []string
	for i, c := range configs {
		item := OutputImportItem{
			Name:            c.Name,
			Slug:            repository.OutputSlug(c.Name),
			Changes:         []string{},
			MissingChannels: []MissingChannel{},
			rules:           make([]models.OutputChannel, 0, len(c.Channels)),
		}
		for _, ch := range c.Channels {
			id, ok := channelIDs[repository.ChannelRef{Source: strings.ToLower(ch.Source), ExternalID: ch.ChannelID}]
			if !ok {
				item.MissingChannels = append(item.MissingChannels, MissingChannel{Source: ch.Source, ID: ch.ChannelID})
				continue
			}
			item.rules = append(item.rules, ruleFromConfig(id, ch))
		}
		item.ChannelCount = len(item.rules)
		plan.Summary.MissingChannels += len(item.MissingChannels)

		current, ok := byName[strings.ToLower(c.Name)]
		if !ok {
			if other, taken := bySlug[item.Slug]; taken {
				conflicts = append(conflicts, fmt.Sprintf("output %d (%q): feed slug %q is already used by existing output %q; rename one of them", i+1, c.Name, item.Slug, other.Name))
				continue
			}
			item.Action = OutputImportCreate
			item.ChannelsAdded = len(item.rules)
			plan.Summary.Create++
			plan.Items = append(plan.Items, item)
			continue
		}

		item.ExistingID = current.ID
		item.Slug = current.Slug
		if current.Name != c.Name {
			item.Changes = append(item.Changes, "name")
		}
		currentByChannel := make(map[int]models.OutputChannel, len(current.Channels))
		for _, rec := range current.Channels {
			currentByChannel[rec.ChannelID] = rec.OutputChannel
		}
		fileChannels := make(map[int]bool, len(item.rules))
		for _, rule := range item.rules {
			fileChannels[rule.ChannelID] = true
			old, exists := currentByChannel[rule.ChannelID]
			if !exists {
				item.ChannelsAdded++
			} else if old.DisplayName != rule.DisplayName || fieldsOf(old) != fieldsOf(rule) {
				item.ChannelsChanged++
			}
		}
		for _, rec := range current.Channels {
			if !fileChannels[rec.ChannelID] {
				item.ChannelsRemoved++
			}
		}
		if item.ChannelsAdded > 0 || item.ChannelsRemoved > 0 {
			item.Changes = append(item.Changes, "channels")
		}
		if item.ChannelsChanged > 0 {
			item.Changes = append(item.Changes, "rules")
		}
		if item.ChannelsAdded == 0 && item.ChannelsRemoved == 0 && !sameChannelOrder(current.Channels, item.rules) {
			item.Changes = append(item.Changes, "order")
		}
		if len(item.Changes) == 0 {
			item.Action = OutputImportUnchanged
			plan.Summary.Unchanged++
		} else {
			item.Action = OutputImportUpdate
			plan.Summary.Update++
		}
		plan.Items = append(plan.Items, item)
	}
	if len(conflicts) > 0 {
		return OutputImportPlan{}, &ConfigFileError{Message: fmt.Sprintf("%d problem(s) found; nothing was imported", len(conflicts)), Details: conflicts}
	}
	return plan, nil
}

func sameChannelOrder(current []repository.OutputChannelRecord, rules []models.OutputChannel) bool {
	if len(current) != len(rules) {
		return false
	}
	for i := range current {
		if current[i].ChannelID != rules[i].ChannelID {
			return false
		}
	}
	return true
}

func outputWrites(items []OutputImportItem) []repository.OutputImportWrite {
	writes := make([]repository.OutputImportWrite, 0, len(items))
	for _, item := range items {
		if item.Action == OutputImportUnchanged {
			continue
		}
		w := repository.OutputImportWrite{ExistingID: item.ExistingID, Name: item.Name, Channels: item.rules}
		for _, change := range item.Changes {
			if change == "name" {
				w.Rename = true
			} else {
				w.ReplaceChannels = true
			}
		}
		writes = append(writes, w)
	}
	return writes
}

// ExportOutputConfigs renders every output with its channel rules. Feed tokens
// and slugs are not exported.
func (s *EPGService) ExportOutputConfigs(ctx context.Context, now time.Time) ([]byte, error) {
	records, err := s.outputRepo.ListConfigs(ctx)
	if err != nil {
		return nil, err
	}
	configs := make([]OutputConfig, 0, len(records))
	for _, rec := range records {
		configs = append(configs, OutputRecordToConfig(rec))
	}
	return MarshalOutputConfigs(configs, now)
}

// ImportOutputConfigs validates a file and returns the plan. When apply is
// true, the plan is written in one transaction; nothing is deleted.
func (s *EPGService) ImportOutputConfigs(ctx context.Context, data []byte, apply bool) (*OutputImportPlan, error) {
	configs, err := ParseOutputConfigs(data)
	if err != nil {
		return nil, err
	}
	existing, err := s.outputRepo.ListConfigs(ctx)
	if err != nil {
		return nil, err
	}
	channelIDs, err := s.outputRepo.ChannelIDsByRef(ctx)
	if err != nil {
		return nil, err
	}
	plan, err := PlanOutputImport(existing, channelIDs, configs)
	if err != nil {
		return nil, err
	}
	if !apply {
		return &plan, nil
	}
	if err := s.outputRepo.ApplyConfigImport(ctx, outputWrites(plan.Items)); err != nil {
		return nil, fmt.Errorf("apply output import: %w", err)
	}
	plan.Applied = true
	return &plan, nil
}
