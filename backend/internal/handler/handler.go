package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
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

func (h *Handler) AddSource(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Name                   string `json:"name"`
		URL                    string `json:"url"`
		RefreshIntervalMinutes int    `json:"refresh_interval_minutes"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	id, err := h.importSvc.AddURLSource(r.Context(), input.Name, input.URL, input.RefreshIntervalMinutes)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]interface{}{"id": id, "status": "scheduled"})
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
	if limit < 1 || limit > 100 {
		limit = 50
	}

	programmes, total, err := h.epgSvc.GetProgrammes(r.Context(), date, channelID, sourceID, page, limit)
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
