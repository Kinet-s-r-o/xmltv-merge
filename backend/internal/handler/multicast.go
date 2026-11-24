package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"xmltv-merge/internal/models"
	"xmltv-merge/internal/service"
)

func multicastID(w http.ResponseWriter, r *http.Request) (int, bool) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil || id < 1 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid multicast output id"})
		return 0, false
	}
	return id, true
}

// writeMulticastError maps service errors to HTTP status codes.
func writeMulticastError(w http.ResponseWriter, err error) {
	switch {
	case service.IsValidation(err):
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
	case service.IsConflict(err):
		writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
	default:
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
}

func writeMulticastNotFound(w http.ResponseWriter) {
	writeJSON(w, http.StatusNotFound, map[string]string{"error": "multicast output not found"})
}

func (h *Handler) withStatus(o *models.MulticastOutput) {
	st := h.multicastMgr.Status(*o)
	o.Status = &st
}

func (h *Handler) ListMulticastOutputs(w http.ResponseWriter, r *http.Request) {
	outputs, err := h.multicastSvc.List(r.Context())
	if err != nil {
		writeMulticastError(w, err)
		return
	}
	for i := range outputs {
		h.withStatus(&outputs[i])
	}
	writeJSON(w, http.StatusOK, outputs)
}

func (h *Handler) MulticastStatuses(w http.ResponseWriter, r *http.Request) {
	outputs, err := h.multicastSvc.List(r.Context())
	if err != nil {
		writeMulticastError(w, err)
		return
	}
	statuses := make([]models.MulticastStatus, 0, len(outputs))
	for _, o := range outputs {
		statuses = append(statuses, h.multicastMgr.Status(o))
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"streaming_enabled": h.multicastMgr.StreamingEnabled(),
		"outputs":           statuses,
	})
}

func (h *Handler) GetMulticastOutput(w http.ResponseWriter, r *http.Request) {
	id, ok := multicastID(w, r)
	if !ok {
		return
	}
	o, err := h.multicastSvc.Get(r.Context(), id)
	if err != nil {
		writeMulticastError(w, err)
		return
	}
	if o == nil {
		writeMulticastNotFound(w)
		return
	}
	if o.Services == nil {
		o.Services = make([]models.MulticastService, 0)
	}
	h.withStatus(o)
	writeJSON(w, http.StatusOK, o)
}

func decodeMulticastOutput(w http.ResponseWriter, r *http.Request) (models.MulticastOutput, bool) {
	var o models.MulticastOutput
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<20)).Decode(&o); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return o, false
	}
	return o, true
}

func (h *Handler) AddMulticastOutput(w http.ResponseWriter, r *http.Request) {
	o, ok := decodeMulticastOutput(w, r)
	if !ok {
		return
	}
	id, err := h.multicastSvc.Create(r.Context(), o)
	if err != nil {
		writeMulticastError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]int{"id": id})
}

func (h *Handler) UpdateMulticastOutput(w http.ResponseWriter, r *http.Request) {
	id, ok := multicastID(w, r)
	if !ok {
		return
	}
	o, ok := decodeMulticastOutput(w, r)
	if !ok {
		return
	}
	o.ID = id
	updated, err := h.multicastSvc.Update(r.Context(), o)
	if err != nil {
		writeMulticastError(w, err)
		return
	}
	if !updated {
		writeMulticastNotFound(w)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) DeleteMulticastOutput(w http.ResponseWriter, r *http.Request) {
	id, ok := multicastID(w, r)
	if !ok {
		return
	}
	deleted, err := h.multicastSvc.Delete(r.Context(), id)
	if err != nil {
		writeMulticastError(w, err)
		return
	}
	if !deleted {
		writeMulticastNotFound(w)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) SetMulticastOutputEnabled(w http.ResponseWriter, r *http.Request) {
	id, ok := multicastID(w, r)
	if !ok {
		return
	}
	var input struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	updated, err := h.multicastSvc.SetEnabled(r.Context(), id, input.Enabled)
	if err != nil {
		writeMulticastError(w, err)
		return
	}
	if !updated {
		writeMulticastNotFound(w)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) PreviewMulticastOutput(w http.ResponseWriter, r *http.Request) {
	id, ok := multicastID(w, r)
	if !ok {
		return
	}
	p, err := h.multicastSvc.Preview(r.Context(), id, time.Now())
	if err != nil {
		writeMulticastError(w, err)
		return
	}
	if p == nil {
		writeMulticastNotFound(w)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

// DumpMulticastOutput returns carousel cycles as an MPEG-TS file for offline
// analysis (tsduck, dvbsnoop). Query "cycles" selects 1-10 cycles.
func (h *Handler) DumpMulticastOutput(w http.ResponseWriter, r *http.Request) {
	id, ok := multicastID(w, r)
	if !ok {
		return
	}
	cycles := 1
	if raw := r.URL.Query().Get("cycles"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > 10 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "cycles must be between 1 and 10"})
			return
		}
		cycles = n
	}
	now := time.Now()
	o, data, err := h.multicastSvc.Dump(r.Context(), id, cycles, now)
	if err != nil {
		writeMulticastError(w, err)
		return
	}
	if o == nil {
		writeMulticastNotFound(w)
		return
	}
	filename := fmt.Sprintf("eit-%d-%s.ts", o.ID, now.UTC().Format("20060102-150405"))
	w.Header().Set("Content-Type", "video/mp2t")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	w.Write(data)
}

func (h *Handler) ExportMulticastOutputs(w http.ResponseWriter, r *http.Request) {
	now := time.Now()
	body, err := h.multicastSvc.ExportConfigs(r.Context(), now)
	writeConfigDownload(w, "multicast-outputs", now, body, err)
}

func (h *Handler) PreviewMulticastImport(w http.ResponseWriter, r *http.Request) {
	h.configImport(w, r, service.MaxMulticastConfigBytes, func(data []byte) (interface{}, error) {
		return h.multicastSvc.ImportConfigs(r.Context(), data, false)
	})
}

func (h *Handler) ImportMulticastOutputs(w http.ResponseWriter, r *http.Request) {
	h.configImport(w, r, service.MaxMulticastConfigBytes, func(data []byte) (interface{}, error) {
		return h.multicastSvc.ImportConfigs(r.Context(), data, true)
	})
}
