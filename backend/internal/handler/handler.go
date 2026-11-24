package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"xmltv-merge/internal/models"
	"xmltv-merge/internal/service"
)

type Handler struct {
	importSvc *service.ImportService
	epgSvc    *service.EPGService
}

func NewHandler(importSvc *service.ImportService, epgSvc *service.EPGService) *Handler {
	return &Handler{
		importSvc: importSvc,
		epgSvc:    epgSvc,
	}
}

func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) Import(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(50 << 20); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid form"})
		return
	}

	sourceName := r.FormValue("source_name")
	file, _, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "file is required"})
		return
	}
	defer file.Close()

	result, err := h.importSvc.ImportXML(r.Context(), sourceName, file)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) ListSources(w http.ResponseWriter, r *http.Request) {
	sources, err := h.epgSvc.GetSources(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, sources)
}

func (h *Handler) ListOutputs(w http.ResponseWriter, r *http.Request) {
	outputs, err := h.epgSvc.GetOutputs(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, outputs)
}

func (h *Handler) GetOutput(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid output id"})
		return
	}
	output, err := h.epgSvc.GetOutput(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if output == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "output not found"})
		return
	}
	writeJSON(w, http.StatusOK, output)
}

func (h *Handler) AddOutput(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&input); err != nil || strings.TrimSpace(input.Name) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
		return
	}
	id, err := h.epgSvc.AddOutput(r.Context(), input.Name)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]int{"id": id})
}

func (h *Handler) UpdateOutput(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid output id"})
		return
	}
	var input struct {
		Name     string                 `json:"name"`
		Channels []models.OutputChannel `json:"channels"`
	}
	if err = json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<20)).Decode(&input); err != nil || strings.TrimSpace(input.Name) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	updated, err := h.epgSvc.UpdateOutput(r.Context(), id, input.Name)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if !updated {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "output not found"})
		return
	}
	if err = h.epgSvc.SaveOutputChannels(r.Context(), id, input.Channels); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) DeleteOutput(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid output id"})
		return
	}
	deleted, err := h.epgSvc.DeleteOutput(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if !deleted {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "output not found"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) OutputXML(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid output id", http.StatusBadRequest)
		return
	}
	output, err := h.epgSvc.GetOutput(r.Context(), id)
	h.writeOutputXML(w, r, output, err)
}

func (h *Handler) PublicOutputXML(w http.ResponseWriter, r *http.Request) {
	output, err := h.epgSvc.GetOutputBySlugAndToken(r.Context(), chi.URLParam(r, "slug"), r.URL.Query().Get("token"))
	if output == nil && err == nil {
		http.NotFound(w, r)
		return
	}
	h.writeOutputXML(w, r, output, err)
}

func (h *Handler) writeOutputXML(w http.ResponseWriter, r *http.Request, output *models.Output, err error) {
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if output == nil {
		http.NotFound(w, r)
		return
	}
	ids := make([]int, 0, len(output.Channels))
	for _, c := range output.Channels {
		ids = append(ids, c.ChannelID)
	}
	programmes, _, err := h.epgSvc.GetProgrammes(r.Context(), nil, nil, ids, nil, 1, 20000)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	feed := outputXML{XMLName: xml.Name{Local: "tv"}, Generator: "xmltv-merge / " + output.Name}
	channelIDs := make(map[int]string, len(output.Channels))
	for _, c := range output.Channels {
		if c.Channel == nil {
			continue
		}
		channelIDs[c.ChannelID] = c.Channel.ExternalID
		feed.Channels = append(feed.Channels, outputXMLChannel{ID: c.Channel.ExternalID, Name: c.DisplayName})
	}
	for _, p := range programmes {
		var rule *models.OutputChannel
		for i := range output.Channels {
			if output.Channels[i].ChannelID == p.ChannelID {
				rule = &output.Channels[i]
				break
			}
		}
		if rule == nil {
			continue
		}
		op := outputXMLProgramme{Channel: channelIDs[p.ChannelID], Start: p.StartTime.Format("20060102150405 -0700"), Stop: p.StopTime.Format("20060102150405 -0700")}
		if rule.IncludeTitle && len(p.Titles) > 0 {
			op.Title = p.Titles[0].Title
		}
		if rule.IncludeSubtitle {
			op.Subtitle = p.Subtitle
		}
		if rule.IncludeDescription {
			op.Description = p.Description
		}
		if rule.IncludeCountry {
			op.Country = p.Country
		}
		if rule.IncludeYear && p.Year != nil {
			op.Date = strconv.Itoa(int(*p.Year))
		}
		if rule.IncludeEpisodeNum {
			op.EpisodeNum = p.EpisodeNum
		}
		if rule.IncludeCredits {
			for _, credit := range p.Credits {
				op.Credits = append(op.Credits, outputXMLCredit{Type: credit.Type, Name: credit.Name})
			}
		}
		if rule.IncludeCategories {
			for _, category := range p.Categories {
				op.Categories = append(op.Categories, outputXMLText{Lang: category.Lang, Value: category.Category})
			}
		}
		if rule.IncludeIcon {
			op.Icon = outputXMLIcon{Src: p.IconURL}
		}
		feed.Programmes = append(feed.Programmes, op)
	}
	data, err := xml.MarshalIndent(feed, "", "  ")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	var buf bytes.Buffer
	buf.WriteString(xml.Header)
	buf.Write(data)
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Write(buf.Bytes())
}

type outputXML struct {
	XMLName    xml.Name             `xml:"tv"`
	Generator  string               `xml:"generator-info-name,attr"`
	Channels   []outputXMLChannel   `xml:"channel"`
	Programmes []outputXMLProgramme `xml:"programme"`
}
type outputXMLChannel struct {
	ID   string `xml:"id,attr"`
	Name string `xml:"display-name"`
}
type outputXMLProgramme struct {
	Channel     string            `xml:"channel,attr"`
	Start       string            `xml:"start,attr"`
	Stop        string            `xml:"stop,attr"`
	Title       string            `xml:"title,omitempty"`
	Subtitle    string            `xml:"sub-title,omitempty"`
	Description string            `xml:"desc,omitempty"`
	Country     string            `xml:"country,omitempty"`
	Date        string            `xml:"date,omitempty"`
	EpisodeNum  string            `xml:"episode-num,omitempty"`
	Icon        outputXMLIcon     `xml:"icon,omitempty"`
	Credits     []outputXMLCredit `xml:"credits>credit,omitempty"`
	Categories  []outputXMLText   `xml:"category,omitempty"`
}

type outputXMLIcon struct {
	Src string `xml:"src,attr"`
}

type outputXMLCredit struct {
	Type string `xml:"type,attr"`
	Name string `xml:",chardata"`
}

type outputXMLText struct {
	Lang  string `xml:"lang,attr,omitempty"`
	Value string `xml:",chardata"`
}

func (h *Handler) AddSource(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Name                   string `json:"name"`
		URL                    string `json:"url"`
		RefreshIntervalMinutes int    `json:"refresh_interval_minutes"`
		HistoryDays            int    `json:"history_days"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	id, err := h.importSvc.AddURLSource(r.Context(), input.Name, input.URL, input.RefreshIntervalMinutes, input.HistoryDays)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]interface{}{"id": id, "status": "scheduled"})
}

func (h *Handler) UpdateSource(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil || id < 1 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid source id"})
		return
	}
	var input struct {
		Name                   string `json:"name"`
		URL                    string `json:"url"`
		RefreshIntervalMinutes int    `json:"refresh_interval_minutes"`
		HistoryDays            int    `json:"history_days"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	updated, err := h.importSvc.UpdateURLSource(r.Context(), id, input.Name, input.URL, input.RefreshIntervalMinutes, input.HistoryDays)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if !updated {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "source not found"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) DeleteSource(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil || id < 1 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid source id"})
		return
	}
	deleted, err := h.epgSvc.DeleteSource(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if !deleted {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "source not found"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) RefreshSource(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil || id < 1 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid source id"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 6*time.Minute)
	defer cancel()
	found, err := h.importSvc.RefreshSource(ctx, id)
	if err != nil {
		if err == service.ErrSourceDisabled {
			writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	if !found {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "source not found"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "success"})
}

func (h *Handler) SetSourceEnabled(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil || id < 1 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid source id"})
		return
	}
	var input struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	updated, err := h.epgSvc.SetSourceEnabled(r.Context(), id, input.Enabled)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if !updated {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "source not found"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListChannels(w http.ResponseWriter, r *http.Request) {
	var sourceID *int
	if sid := r.URL.Query().Get("source_id"); sid != "" {
		id, _ := strconv.Atoi(sid)
		sourceID = &id
	}
	search := r.URL.Query().Get("search")

	channels, err := h.epgSvc.GetChannels(r.Context(), sourceID, search)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, channels)
}

func (h *Handler) GetChannel(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.Atoi(chi.URLParam(r, "id"))
	channel, err := h.epgSvc.GetChannel(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if channel == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	writeJSON(w, http.StatusOK, channel)
}

func (h *Handler) ListProgrammes(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	var date *time.Time
	if d := q.Get("date"); d != "" {
		t, err := time.Parse("2006-01-02", d)
		if err == nil {
			date = &t
		}
	}

	var channelID *int
	if cid := q.Get("channel_id"); cid != "" {
		id, _ := strconv.Atoi(cid)
		channelID = &id
	}
	var channelIDs []int
	if ids := q.Get("channel_ids"); ids != "" {
		for _, value := range strings.Split(ids, ",") {
			id, err := strconv.Atoi(value)
			if err != nil || id < 1 {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid channel_ids"})
				return
			}
			channelIDs = append(channelIDs, id)
		}
	}

	var sourceID *int
	if sid := q.Get("source_id"); sid != "" {
		id, _ := strconv.Atoi(sid)
		sourceID = &id
	}

	page, _ := strconv.Atoi(q.Get("page"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit < 1 || limit > 20000 {
		limit = 50
	}

	programmes, total, err := h.epgSvc.GetProgrammes(r.Context(), date, channelID, channelIDs, sourceID, page, limit)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if programmes == nil {
		programmes = []models.Programme{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"data":  programmes,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

func (h *Handler) GetProgramme(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	programme, err := h.epgSvc.GetProgramme(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if programme == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	writeJSON(w, http.StatusOK, programme)
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// ExportSources downloads the source configuration as a versioned XML file.
func (h *Handler) ExportSources(w http.ResponseWriter, r *http.Request) {
	now := time.Now()
	body, _, err := h.importSvc.ExportSourceConfigs(r.Context(), now)
	writeConfigDownload(w, "xmltv-sources", now, body, err)
}

// PreviewSourceImport validates an uploaded configuration file and returns the
// planned create/update/unchanged actions without writing anything.
func (h *Handler) PreviewSourceImport(w http.ResponseWriter, r *http.Request) {
	h.configImport(w, r, service.MaxSourceConfigBytes, func(data []byte) (interface{}, error) {
		return h.importSvc.ImportSourceConfigs(r.Context(), data, false)
	})
}

// ImportSources validates an uploaded configuration file and applies it.
func (h *Handler) ImportSources(w http.ResponseWriter, r *http.Request) {
	h.configImport(w, r, service.MaxSourceConfigBytes, func(data []byte) (interface{}, error) {
		return h.importSvc.ImportSourceConfigs(r.Context(), data, true)
	})
}

// ExportOutputs downloads the output configuration (channel references and
// field rules, never feed tokens) as a versioned XML file.
func (h *Handler) ExportOutputs(w http.ResponseWriter, r *http.Request) {
	now := time.Now()
	body, err := h.epgSvc.ExportOutputConfigs(r.Context(), now)
	writeConfigDownload(w, "xmltv-outputs", now, body, err)
}

// PreviewOutputImport validates an uploaded output configuration and returns
// the planned actions and unresolved channels without writing anything.
func (h *Handler) PreviewOutputImport(w http.ResponseWriter, r *http.Request) {
	h.configImport(w, r, service.MaxOutputConfigBytes, func(data []byte) (interface{}, error) {
		return h.epgSvc.ImportOutputConfigs(r.Context(), data, false)
	})
}

// ImportOutputs validates an uploaded output configuration and applies it.
func (h *Handler) ImportOutputs(w http.ResponseWriter, r *http.Request) {
	h.configImport(w, r, service.MaxOutputConfigBytes, func(data []byte) (interface{}, error) {
		return h.epgSvc.ImportOutputConfigs(r.Context(), data, true)
	})
}

func writeConfigDownload(w http.ResponseWriter, prefix string, now time.Time, body []byte, err error) {
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	filename := prefix + "-" + now.UTC().Format("20060102-150405") + ".xml"
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	w.Write(body)
}

// configImport reads the multipart "file" field (at most limit bytes) and runs
// run on it. Invalid files answer 422 with every problem in "details".
func (h *Handler) configImport(w http.ResponseWriter, r *http.Request, limit int64, run func([]byte) (interface{}, error)) {
	r.Body = http.MaxBytesReader(w, r.Body, limit+(64<<10))
	if err := r.ParseMultipartForm(limit + (64 << 10)); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{"error": fmt.Sprintf("upload a configuration file of at most %d MB", limit>>20), "details": []string{}})
		return
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{"error": "file is required", "details": []string{}})
		return
	}
	defer file.Close()

	data, err := service.ReadConfigFile(file, limit)
	if err == nil {
		var plan interface{}
		plan, err = run(data)
		if err == nil {
			writeJSON(w, http.StatusOK, plan)
			return
		}
	}
	if cfgErr, ok := service.IsConfigFileError(err); ok {
		details := cfgErr.Details
		if details == nil {
			details = []string{}
		}
		writeJSON(w, http.StatusUnprocessableEntity, map[string]interface{}{"error": cfgErr.Message, "details": details})
		return
	}
	writeJSON(w, http.StatusInternalServerError, map[string]interface{}{"error": err.Error(), "details": []string{}})
}
