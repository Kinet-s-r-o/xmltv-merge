package parser

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"
)

// XMLTV structures for parsing

type XMLTV struct {
	XMLName           xml.Name    `xml:"tv"`
	GeneratorInfoName string      `xml:"generator-info-name,attr"`
	GeneratorInfoURL  string      `xml:"generator-info-url,attr"`
	Channels          []Channel   `xml:"channel"`
	Programmes        []Programme `xml:"programme"`
}

type Channel struct {
	ID          string        `xml:"id,attr"`
	DisplayName LocalizedText `xml:"display-name"`
	Icon        Icon          `xml:"icon"`
	URL         string        `xml:"url"`
}

type LocalizedText struct {
	Lang  string `xml:"lang,attr"`
	Value string `xml:",chardata"`
}

type Icon struct {
	Src string `xml:"src,attr"`
}

type Programme struct {
	Channel    string        `xml:"channel,attr"`
	Start      string        `xml:"start,attr"`
	Stop       string        `xml:"stop,attr"`
	Titles     []Title       `xml:"title"`
	Subtitle   LocalizedText `xml:"sub-title"`
	Desc       LocalizedText `xml:"desc"`
	Credits    Credits       `xml:"credits"`
	Date       string        `xml:"date"`
	Categories []Category    `xml:"category"`
	Icon       Icon          `xml:"icon"`
	Country    string        `xml:"country"`
	EpisodeNum EpisodeNum    `xml:"episode-num"`
}

type Title struct {
	Lang  string `xml:"lang,attr"`
	Value string `xml:",chardata"`
}

type Category struct {
	Lang  string `xml:"lang,attr"`
	Value string `xml:",chardata"`
}

type Credits struct {
	Directors []string `xml:"director"`
	Actors    []string `xml:"actor"`
	Producers []string `xml:"producer"`
}

type EpisodeNum struct {
	System string `xml:"system,attr"`
	Value  string `xml:",chardata"`
}

// Parsed structures (ready for DB insert)

type ParsedSource struct {
	Name              string
	GeneratorInfoName string
	GeneratorInfoURL  string
}

type ParsedChannel struct {
	ExternalID string
	Name       string
	NameLang   string
	IconURL    string
	URL        string
}

type ParsedProgramme struct {
	ChannelExternalID string
	StartTime         time.Time
	StopTime          time.Time
	Titles            []ParsedTitle
	Subtitle          string
	SubtitleLang      string
	Description       string
	DescriptionLang   string
	Country           string
	Year              *int16
	EpisodeNum        string
	EpisodeNumSystem  string
	IconURL           string
	Credits           []ParsedCredit
	Categories        []ParsedCategory
}

type ParsedTitle struct {
	Lang  string
	Title string
}

type ParsedCredit struct {
	Type string
	Name string
}

type ParsedCategory struct {
	Lang     string
	Category string
}

// ParseResult holds the full parsed XML
type ParseResult struct {
	Source     ParsedSource
	Channels   []ParsedChannel
	Programmes []ParsedProgramme
}

// ParseXML parses XMLTV content and returns structured data
func ParseXML(data []byte) (*ParseResult, error) {
	// Strip BOM if present
	data = bytes.TrimPrefix(data, []byte{0xEF, 0xBB, 0xBF})

	var tv XMLTV
	decoder := xml.NewDecoder(bytes.NewReader(data))
	decoder.Strict = false

	if err := decoder.Decode(&tv); err != nil && err != io.EOF {
		return nil, fmt.Errorf("decode xml: %w", err)
	}

	result := &ParseResult{
		Source: ParsedSource{
			Name:              tv.GeneratorInfoName,
			GeneratorInfoName: tv.GeneratorInfoName,
			GeneratorInfoURL:  tv.GeneratorInfoURL,
		},
	}

	// Parse channels
	for _, ch := range tv.Channels {
		pc := ParsedChannel{
			ExternalID: ch.ID,
			Name:       ch.DisplayName.Value,
			NameLang:   ch.DisplayName.Lang,
			IconURL:    ch.Icon.Src,
			URL:        ch.URL,
		}
		result.Channels = append(result.Channels, pc)
	}

	// Parse programmes
	for _, p := range tv.Programmes {
		pp, err := parseProgramme(p)
		if err != nil {
			continue
		}
		result.Programmes = append(result.Programmes, *pp)
	}

	return result, nil
}

func parseProgramme(p Programme) (*ParsedProgramme, error) {
	startTime, err := parseXMLTVTime(p.Start)
	if err != nil {
		return nil, fmt.Errorf("parse start time: %w", err)
	}

	stopTime, err := parseXMLTVTime(p.Stop)
	if err != nil {
		return nil, fmt.Errorf("parse stop time: %w", err)
	}

	pp := &ParsedProgramme{
		ChannelExternalID: p.Channel,
		StartTime:         startTime,
		StopTime:          stopTime,
		Subtitle:          p.Subtitle.Value,
		SubtitleLang:      p.Subtitle.Lang,
		Description:       p.Desc.Value,
		DescriptionLang:   p.Desc.Lang,
		Country:           p.Country,
		IconURL:           p.Icon.Src,
		EpisodeNum:        p.EpisodeNum.Value,
		EpisodeNumSystem:  p.EpisodeNum.System,
	}

	// Parse year from date
	if p.Date != "" {
		if year, err := strconv.Atoi(p.Date); err == nil && year > 1900 && year < 2100 {
			y := int16(year)
			pp.Year = &y
		}
	}

	// Parse titles
	for _, t := range p.Titles {
		lang := t.Lang
		if lang == "" {
			lang = "en"
		}
		pp.Titles = append(pp.Titles, ParsedTitle{Lang: lang, Title: t.Value})
	}

	// Parse credits
	for _, d := range p.Credits.Directors {
		pp.Credits = append(pp.Credits, ParsedCredit{Type: "director", Name: strings.TrimSuffix(d, ".")})
	}
	for _, a := range p.Credits.Actors {
		pp.Credits = append(pp.Credits, ParsedCredit{Type: "actor", Name: strings.TrimSuffix(a, ".")})
	}
	for _, pr := range p.Credits.Producers {
		pp.Credits = append(pp.Credits, ParsedCredit{Type: "producer", Name: strings.TrimSuffix(pr, ".")})
	}

	// Parse categories
	for _, c := range p.Categories {
		lang := c.Lang
		if lang == "" {
			lang = "en"
		}
		pp.Categories = append(pp.Categories, ParsedCategory{Lang: lang, Category: c.Value})
	}

	return pp, nil
}

// parseXMLTVTime parses XMLTV time format: "20261023020500 +0200"
func parseXMLTVTime(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	parts := strings.SplitN(s, " ", 2)
	if len(parts) == 0 {
		return time.Time{}, fmt.Errorf("invalid time format: %s", s)
	}

	datetimeStr := parts[0]
	if len(datetimeStr) < 14 {
		return time.Time{}, fmt.Errorf("datetime too short: %s", datetimeStr)
	}

	var offsetStr string
	if len(parts) > 1 {
		offsetStr = parts[1]
	}

	t, err := time.Parse("20060102150405", datetimeStr)
	if err != nil {
		return time.Time{}, fmt.Errorf("parse datetime %s: %w", datetimeStr, err)
	}

	if offsetStr != "" {
		t = applyOffset(t, offsetStr)
	}

	return t, nil
}

func applyOffset(t time.Time, offset string) time.Time {
	offset = strings.TrimSpace(offset)
	if len(offset) < 5 {
		return t
	}

	sign := 1
	if offset[0] == '-' {
		sign = -1
	}

	hours, _ := strconv.Atoi(offset[1:3])
	minutes, _ := strconv.Atoi(offset[3:5])

	offsetDuration := time.Duration(hours)*time.Hour + time.Duration(minutes)*time.Minute
	if sign < 0 {
		offsetDuration = -offsetDuration
	}

	loc := time.FixedZone("offset", int(offsetDuration.Seconds()))
	localTime := time.Date(
		t.Year(), t.Month(), t.Day(),
		t.Hour(), t.Minute(), t.Second(), 0,
		loc,
	)

	return localTime.UTC()
}
