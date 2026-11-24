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

// Multicast output configuration files use a versioned XML schema. Stations
// reference channels portably by source name + XMLTV channel id; database
// ids and the on/off state are never written:
//
//	<?xml version="1.0" encoding="UTF-8"?>
//	<multicast-outputs version="1" exported-at="2026-11-24T10:00:00Z">
//	  <output>
//	    <name>Kablovka_new</name>
//	    <description>EPG pre CATV</description>
//	    <multicast address="233.11.22.241" port="1234" ttl="16" interface=""/>
//	    <eit pid="18" chunk-seconds="30" days-ahead="4" timezone="Europe/Bratislava"
//	         encoding="utf8" language="slk" table-mode="actual" home-tsid="" tdt-tot="false"/>
//	    <service source="EPG - kinet.sk" id="Jednotka" frequency="306" tsid="1001" onid="1" sid="20" enabled="true">
//	      <name>Jednotka HD</name>
//	    </service>
//	  </output>
//	</multicast-outputs>
const (
	MulticastConfigVersion     = "1"
	MulticastConfigRoot        = "multicast-outputs"
	MaxMulticastConfigBytes    = 8 << 20
	MaxMulticastConfigEntries  = 200
	MaxMulticastConfigServices = 2000
)

type multicastConfigFileXML struct {
	XMLName    xml.Name             `xml:"multicast-outputs"`
	Version    string               `xml:"version,attr"`
	ExportedAt string               `xml:"exported-at,attr,omitempty"`
	Outputs    []multicastOutputXML `xml:"output"`
}

type multicastOutputXML struct {
	Name        *string               `xml:"name"`
	Description *string               `xml:"description"`
	Multicast   *multicastAddrXML     `xml:"multicast"`
	EIT         *multicastEITXML      `xml:"eit"`
	Services    []multicastServiceXML `xml:"service"`
}

type multicastAddrXML struct {
	Address   *string `xml:"address,attr"`
	Port      *string `xml:"port,attr"`
	TTL       *string `xml:"ttl,attr"`
	Interface *string `xml:"interface,attr"`
}

type multicastEITXML struct {
	PID          *string `xml:"pid,attr"`
	ChunkSeconds *string `xml:"chunk-seconds,attr"`
	DaysAhead    *string `xml:"days-ahead,attr"`
	Timezone     *string `xml:"timezone,attr"`
	Encoding     *string `xml:"encoding,attr"`
	Language     *string `xml:"language,attr"`
	TableMode    *string `xml:"table-mode,attr"`
	HomeTSID     *string `xml:"home-tsid,attr"`
	TDTTOT       *string `xml:"tdt-tot,attr"`
}

type multicastServiceXML struct {
	Source    *string `xml:"source,attr"`
	ID        *string `xml:"id,attr"`
	Frequency *string `xml:"frequency,attr"`
	TSID      *string `xml:"tsid,attr"`
	ONID      *string `xml:"onid,attr"`
	SID       *string `xml:"sid,attr"`
	Enabled   *string `xml:"enabled,attr"`
	Name      *string `xml:"name"`
}

func strPtr(s string) *string { return &s }

func intAttr(v int) *string { return strPtr(strconv.Itoa(v)) }

// MarshalMulticastConfigs renders outputs as a version 1 file.
func MarshalMulticastConfigs(outputs []models.MulticastOutput, exportedAt time.Time) ([]byte, error) {
	file := multicastConfigFileXML{
		Version:    MulticastConfigVersion,
		ExportedAt: exportedAt.UTC().Format(time.RFC3339),
		Outputs:    make([]multicastOutputXML, 0, len(outputs)),
	}
	for _, o := range outputs {
		home := ""
		if o.HomeTransportStreamID != nil {
			home = strconv.Itoa(*o.HomeTransportStreamID)
		}
		entry := multicastOutputXML{
			Name:        strPtr(o.Name),
			Description: strPtr(o.Description),
			Multicast: &multicastAddrXML{
				Address: strPtr(o.MulticastAddress), Port: intAttr(o.MulticastPort), TTL: intAttr(o.TTL), Interface: strPtr(o.Interface),
			},
			EIT: &multicastEITXML{
				PID: intAttr(o.PID), ChunkSeconds: intAttr(o.ChunkSeconds), DaysAhead: intAttr(o.DaysAhead),
				Timezone: strPtr(o.Timezone), Encoding: strPtr(o.TextEncoding), Language: strPtr(o.LanguageCode),
				TableMode: strPtr(o.TableMode), HomeTSID: strPtr(home), TDTTOT: boolAttr(o.IncludeTDTTOT),
			},
			Services: make([]multicastServiceXML, 0, len(o.Services)),
		}
		for _, s := range o.Services {
			freq := ""
			if s.Frequency != nil {
				freq = strconv.Itoa(*s.Frequency)
			}
			entry.Services = append(entry.Services, multicastServiceXML{
				Source: strPtr(s.SourceName), ID: strPtr(s.ExternalID), Frequency: strPtr(freq),
				TSID: intAttr(s.TransportStreamID), ONID: intAttr(s.OriginalNetworkID), SID: intAttr(s.ServiceID),
				Enabled: boolAttr(s.Enabled), Name: strPtr(s.DisplayName),
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

// parseIntAttr parses an optional integer attribute; empty means def.
func parseIntAttr(raw *string, def int, name string, problems *[]string) int {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return def
	}
	v, err := strconv.Atoi(strings.TrimSpace(*raw))
	if err != nil {
		*problems = append(*problems, fmt.Sprintf("%s must be a whole number, got %q", name, *raw))
		return def
	}
	return v
}

// ParseMulticastConfigs decodes and validates a configuration file. Every
// output is validated with the same rules as the API.
func ParseMulticastConfigs(data []byte) ([]models.MulticastOutput, error) {
	var file multicastConfigFileXML
	if err := decodeConfigFile(data, MulticastConfigRoot, MulticastConfigVersion, &file, func() string { return file.Version }); err != nil {
		return nil, err
	}
	if len(file.Outputs) == 0 {
		return nil, &ConfigFileError{Message: "the file contains no <output> entries"}
	}
	if len(file.Outputs) > MaxMulticastConfigEntries {
		return nil, &ConfigFileError{Message: fmt.Sprintf("the file contains %d outputs; at most %d are allowed", len(file.Outputs), MaxMulticastConfigEntries)}
	}
	var details []string
	result := make([]models.MulticastOutput, 0, len(file.Outputs))
	seen := map[string]int{}
	for i, entry := range file.Outputs {
		var problems []string
		o := models.MulticastOutput{Name: strings.TrimSpace(deref(entry.Name)), Description: deref(entry.Description)}
		label := fmt.Sprintf("output %d", i+1)
		if o.Name != "" {
			label = fmt.Sprintf("output %d (%q)", i+1, o.Name)
			if first, dup := seen[strings.ToLower(o.Name)]; dup {
				problems = append(problems, fmt.Sprintf("duplicate name; already used by output %d", first))
			}
			seen[strings.ToLower(o.Name)] = i + 1
		}
		if entry.Multicast == nil {
			problems = append(problems, "<multicast> is required")
		} else {
			o.MulticastAddress = deref(entry.Multicast.Address)
			o.MulticastPort = parseIntAttr(entry.Multicast.Port, 0, "port", &problems)
			o.TTL = parseIntAttr(entry.Multicast.TTL, 0, "ttl", &problems)
			o.Interface = deref(entry.Multicast.Interface)
		}
		if e := entry.EIT; e != nil {
			o.PID = parseIntAttr(e.PID, 0, "pid", &problems)
			o.ChunkSeconds = parseIntAttr(e.ChunkSeconds, 0, "chunk-seconds", &problems)
			o.DaysAhead = parseIntAttr(e.DaysAhead, 0, "days-ahead", &problems)
			o.Timezone = deref(e.Timezone)
			o.TextEncoding = deref(e.Encoding)
			o.LanguageCode = deref(e.Language)
			o.TableMode = deref(e.TableMode)
			if e.HomeTSID != nil && strings.TrimSpace(*e.HomeTSID) != "" {
				home := parseIntAttr(e.HomeTSID, 0, "home-tsid", &problems)
				o.HomeTransportStreamID = &home
			}
			tdt, ok := parseConfigBool(e.TDTTOT, false)
			if !ok {
				problems = append(problems, "tdt-tot must be true or false")
			}
			o.IncludeTDTTOT = tdt
		}
		if len(entry.Services) > MaxMulticastConfigServices {
			problems = append(problems, fmt.Sprintf("has %d services; at most %d are allowed", len(entry.Services), MaxMulticastConfigServices))
		}
		o.Services = make([]models.MulticastService, 0, len(entry.Services))
		for j, sx := range entry.Services {
			var sp []string
			svc := models.MulticastService{
				SourceName:  strings.TrimSpace(deref(sx.Source)),
				ExternalID:  strings.TrimSpace(deref(sx.ID)),
				DisplayName: strings.TrimSpace(deref(sx.Name)),
			}
			if svc.SourceName == "" || svc.ExternalID == "" {
				sp = append(sp, "source and id attributes are required")
			}
			if sx.Frequency != nil && strings.TrimSpace(*sx.Frequency) != "" {
				f := parseIntAttr(sx.Frequency, 0, "frequency", &sp)
				svc.Frequency = &f
			}
			svc.TransportStreamID = parseIntAttr(sx.TSID, -1, "tsid", &sp)
			svc.OriginalNetworkID = parseIntAttr(sx.ONID, 1, "onid", &sp)
			svc.ServiceID = parseIntAttr(sx.SID, 0, "sid", &sp)
			enabled, ok := parseConfigBool(sx.Enabled, true)
			if !ok {
				sp = append(sp, "enabled must be true or false")
			}
			svc.Enabled = enabled
			if svc.DisplayName == "" {
				svc.DisplayName = svc.ExternalID
			}
			for _, p := range sp {
				problems = append(problems, fmt.Sprintf("service %d: %s", j+1, p))
			}
			o.Services = append(o.Services, svc)
		}
		if len(problems) == 0 {
			if err := ValidateMulticastOutput(&o); err != nil {
				problems = append(problems, err.Error())
			}
		}
		for _, p := range problems {
			details = append(details, label+": "+p)
		}
		if len(problems) == 0 {
			result = append(result, o)
		}
	}
	if len(details) > 0 {
		return nil, &ConfigFileError{Message: fmt.Sprintf("%d problem(s) found; nothing was imported", len(details)), Details: details}
	}
	return result, nil
}

// MulticastImportItem is one planned output change, matched by name.
type MulticastImportItem struct {
	Name            string           `json:"name"`
	Action          string           `json:"action"`
	ExistingID      int              `json:"existing_id,omitempty"`
	Changes         []string         `json:"changes"`
	ServiceCount    int              `json:"service_count"`
	MissingChannels []MissingChannel `json:"missing_channels"`

	output models.MulticastOutput
}

type MulticastImportSummary struct {
	Create          int `json:"create"`
	Update          int `json:"update"`
	Unchanged       int `json:"unchanged"`
	MissingChannels int `json:"missing_channels"`
}

type MulticastImportPlan struct {
	Version string                 `json:"version"`
	Items   []MulticastImportItem  `json:"items"`
	Summary MulticastImportSummary `json:"summary"`
	Applied bool                   `json:"applied"`
}

func serviceSignature(s models.MulticastService) string {
	freq := ""
	if s.Frequency != nil {
		freq = strconv.Itoa(*s.Frequency)
	}
	return strings.Join([]string{strings.ToLower(s.SourceName), s.ExternalID, s.DisplayName, freq,
		strconv.Itoa(s.TransportStreamID), strconv.Itoa(s.OriginalNetworkID), strconv.Itoa(s.ServiceID),
		strconv.FormatBool(s.Enabled)}, "\x00")
}

func multicastChanges(cur, next models.MulticastOutput) []string {
	changes := []string{}
	if cur.Name != next.Name {
		changes = append(changes, "name")
	}
	if cur.Description != next.Description {
		changes = append(changes, "description")
	}
	if cur.MulticastAddress != next.MulticastAddress || cur.MulticastPort != next.MulticastPort || cur.TTL != next.TTL || cur.Interface != next.Interface {
		changes = append(changes, "multicast")
	}
	homeCur, homeNext := -1, -1
	if cur.HomeTransportStreamID != nil {
		homeCur = *cur.HomeTransportStreamID
	}
	if next.HomeTransportStreamID != nil {
		homeNext = *next.HomeTransportStreamID
	}
	if cur.PID != next.PID || cur.ChunkSeconds != next.ChunkSeconds || cur.DaysAhead != next.DaysAhead || cur.Timezone != next.Timezone ||
		cur.TextEncoding != next.TextEncoding || cur.LanguageCode != next.LanguageCode || cur.TableMode != next.TableMode ||
		homeCur != homeNext || cur.IncludeTDTTOT != next.IncludeTDTTOT {
		changes = append(changes, "eit")
	}
	same := len(cur.Services) == len(next.Services)
	for i := 0; same && i < len(cur.Services); i++ {
		same = serviceSignature(cur.Services[i]) == serviceSignature(next.Services[i])
	}
	if !same {
		changes = append(changes, "services")
	}
	return changes
}

// PlanMulticastImport compares parsed outputs with existing ones. Stations
// whose channel does not exist are kept unlinked and reported as missing.
// Existing outputs keep their on/off state; new outputs are created off.
func PlanMulticastImport(existing []models.MulticastOutput, channelIDs map[repository.ChannelRef]int, configs []models.MulticastOutput) (MulticastImportPlan, error) {
	byName := map[string]models.MulticastOutput{}
	for _, o := range existing {
		byName[strings.ToLower(o.Name)] = o
	}
	plan := MulticastImportPlan{Version: MulticastConfigVersion, Items: make([]MulticastImportItem, 0, len(configs))}
	var conflicts []string
	for _, c := range configs {
		item := MulticastImportItem{Name: c.Name, Changes: []string{}, MissingChannels: []MissingChannel{}, ServiceCount: len(c.Services)}
		for i := range c.Services {
			s := &c.Services[i]
			if id, ok := channelIDs[repository.ChannelRef{Source: strings.ToLower(s.SourceName), ExternalID: s.ExternalID}]; ok {
				s.ChannelID = &id
			} else {
				item.MissingChannels = append(item.MissingChannels, MissingChannel{Source: s.SourceName, ID: s.ExternalID})
			}
		}
		plan.Summary.MissingChannels += len(item.MissingChannels)
		current, ok := byName[strings.ToLower(c.Name)]
		if !ok {
			c.Enabled = false
			item.Action = OutputImportCreate
			item.output = c
			plan.Summary.Create++
			plan.Items = append(plan.Items, item)
			continue
		}
		c.ID = current.ID
		c.Enabled = current.Enabled
		item.ExistingID = current.ID
		item.Changes = multicastChanges(current, c)
		if c.Enabled {
			for _, other := range existing {
				if other.ID != c.ID && other.Enabled && other.MulticastAddress == c.MulticastAddress && other.MulticastPort == c.MulticastPort {
					conflicts = append(conflicts, fmt.Sprintf("output %q: enabled output %q already streams to %s:%d", c.Name, other.Name, c.MulticastAddress, c.MulticastPort))
				}
			}
		}
		item.output = c
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
		return MulticastImportPlan{}, &ConfigFileError{Message: fmt.Sprintf("%d problem(s) found; nothing was imported", len(conflicts)), Details: conflicts}
	}
	return plan, nil
}

func (s *MulticastService) listWithServices(ctx context.Context) ([]models.MulticastOutput, error) {
	if _, err := s.repo.RelinkMissing(ctx); err != nil {
		return nil, err
	}
	outputs, err := s.repo.List(ctx)
	if err != nil {
		return nil, err
	}
	ids := make([]int, len(outputs))
	for i, o := range outputs {
		ids[i] = o.ID
	}
	services, err := s.repo.Services(ctx, ids)
	if err != nil {
		return nil, err
	}
	for i := range outputs {
		outputs[i].Services = services[outputs[i].ID]
		if outputs[i].Services == nil {
			outputs[i].Services = make([]models.MulticastService, 0)
		}
	}
	return outputs, nil
}

// ExportConfigs renders every multicast output with its stations.
func (s *MulticastService) ExportConfigs(ctx context.Context, now time.Time) ([]byte, error) {
	outputs, err := s.listWithServices(ctx)
	if err != nil {
		return nil, err
	}
	return MarshalMulticastConfigs(outputs, now)
}

// ImportConfigs validates a file and returns the plan; when apply is true it
// writes the plan in one transaction. Nothing is deleted.
func (s *MulticastService) ImportConfigs(ctx context.Context, data []byte, apply bool) (*MulticastImportPlan, error) {
	configs, err := ParseMulticastConfigs(data)
	if err != nil {
		return nil, err
	}
	existing, err := s.listWithServices(ctx)
	if err != nil {
		return nil, err
	}
	refs, err := s.repo.ChannelRefs(ctx)
	if err != nil {
		return nil, err
	}
	plan, err := PlanMulticastImport(existing, refs, configs)
	if err != nil {
		return nil, err
	}
	if !apply {
		return &plan, nil
	}
	var writes []models.MulticastOutput
	for _, item := range plan.Items {
		if item.Action != OutputImportUnchanged {
			writes = append(writes, item.output)
		}
	}
	if err := s.repo.ApplyConfigImport(ctx, writes); err != nil {
		return nil, fmt.Errorf("apply multicast import: %w", err)
	}
	plan.Applied = true
	s.changed()
	return &plan, nil
}
