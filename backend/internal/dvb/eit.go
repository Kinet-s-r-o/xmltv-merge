package dvb

import (
	"encoding/binary"
	"hash/fnv"
	"sort"
	"time"
)

// TableMode controls whether services are signalled as EIT actual or other.
type TableMode string

const (
	// ModeActual signals every service as EIT actual (0x4E, 0x50-0x5F),
	// each with its own transport_stream_id.
	ModeActual TableMode = "actual"
	// ModeActualOther signals services in HomeTSID as actual and all other
	// services as other (0x4F, 0x60-0x6F).
	ModeActualOther TableMode = "actual_other"
)

const (
	tablePFActual       = 0x4E
	tablePFOther        = 0x4F
	tableScheduleActual = 0x50
	tableScheduleOther  = 0x60

	maxSectionBytes = 4096
	// table_id(1) + flags/length(2) + header fields after length(11) + CRC(4)
	eitOverhead     = 3 + 11 + 4
	maxEventLoop    = maxSectionBytes - eitOverhead
	eventHeaderSize = 12

	segmentDuration    = 3 * time.Hour
	segmentsPerTable   = 32
	sectionsPerSegment = 8
	// MaxDaysAhead is the schedule horizon of 16 schedule tables (64 days)
	// limited to what receivers commonly support.
	MaxDaysAhead = 16
)

// Event is one programme to be signalled.
type Event struct {
	Start       time.Time
	Stop        time.Time
	Title       string
	Subtitle    string
	Description string
}

// Service identifies a DVB service and carries its events.
type Service struct {
	ONID   uint16
	TSID   uint16
	SID    uint16
	Events []Event
}

// EITConfig controls EIT generation.
type EITConfig struct {
	Now       time.Time
	DaysAhead int
	Encoding  TextEncoding
	Language  string
	Mode      TableMode
	HomeTSID  uint16
}

// SubTableKey identifies an EIT sub_table; all its sections share a
// version_number.
type SubTableKey struct {
	TableID uint8
	ONID    uint16
	TSID    uint16
	SID     uint16
}

// VersionStore assigns version numbers to sub_tables. Implementations must
// return the same version for the same content hash and a new version when
// the hash changes.
type VersionStore interface {
	Version(key SubTableKey, hash uint64) uint8
}

// Section is a finished section including its CRC.
type Section struct {
	Key    SubTableKey
	Number uint8
	Data   []byte
}

// EITResult is the output of BuildEIT.
type EITResult struct {
	PF       []Section
	Schedule []Section
	// Events is the number of events signalled in schedule tables.
	Events int
	// Truncated counts events dropped because a segment overflowed.
	Truncated int
}

type encodedEvent struct {
	start time.Time
	data  []byte
}

// eventIDs assigns stable event ids derived from start minutes. Collisions
// within a service are resolved by incrementing.
func eventIDs(events []Event) []uint16 {
	ids := make([]uint16, len(events))
	used := make(map[uint16]bool, len(events))
	for i, ev := range events {
		id := uint16(ev.Start.Unix() / 60)
		for used[id] {
			id++
		}
		used[id] = true
		ids[i] = id
	}
	return ids
}

func encodeEvent(id uint16, ev Event, running uint8, cfg EITConfig, descBudget int) []byte {
	short := ShortEventDescriptor(cfg.Language, ev.Title, ev.Subtitle, cfg.Encoding)
	budget := maxEventLoop - eventHeaderSize - len(short)
	if descBudget >= 0 && descBudget < budget {
		budget = descBudget
	}
	ext := ExtendedEventDescriptors(cfg.Language, ev.Description, cfg.Encoding, budget)
	loop := len(short) + len(ext)
	b := make([]byte, 0, eventHeaderSize+loop)
	b = binary.BigEndian.AppendUint16(b, id)
	start := EncodeTime(ev.Start)
	b = append(b, start[:]...)
	dur := EncodeDuration(ev.Stop.Sub(ev.Start))
	b = append(b, dur[:]...)
	// running_status(3) free_CA_mode(1)=0 descriptors_loop_length(12)
	b = append(b, running<<5|byte(loop>>8&0x0F), byte(loop))
	b = append(b, short...)
	return append(b, ext...)
}

// buildSection assembles a section without CRC and version. The version byte
// is patched in by finalize.
func buildSection(key SubTableKey, number, last, segmentLast, lastTable uint8, events [][]byte) []byte {
	length := 11 + 4
	for _, e := range events {
		length += len(e)
	}
	b := make([]byte, 0, 3+length)
	b = append(b, key.TableID, 0xF0|byte(length>>8&0x0F), byte(length))
	b = binary.BigEndian.AppendUint16(b, key.SID)
	b = append(b, 0xC1) // reserved, version 0, current_next_indicator 1
	b = append(b, number, last)
	b = binary.BigEndian.AppendUint16(b, key.TSID)
	b = binary.BigEndian.AppendUint16(b, key.ONID)
	b = append(b, segmentLast, lastTable)
	for _, e := range events {
		b = append(b, e...)
	}
	return b
}

type draftSection struct {
	number uint8
	data   []byte
}

func finalize(key SubTableKey, drafts []draftSection, versions VersionStore) []Section {
	h := fnv.New64a()
	for _, d := range drafts {
		h.Write(d.data)
	}
	version := uint8(0)
	if versions != nil {
		version = versions.Version(key, h.Sum64()) & 0x1F
	}
	out := make([]Section, len(drafts))
	for i, d := range drafts {
		data := append([]byte(nil), d.data...)
		data[5] = 0xC0 | version<<1 | 0x01
		out[i] = Section{Key: key, Number: d.number, Data: appendCRC(data)}
	}
	return out
}

func (cfg EITConfig) isActual(s Service) bool {
	return cfg.Mode != ModeActualOther || s.TSID == cfg.HomeTSID
}

// ScheduleStart returns the start of segment 0 of the first schedule table:
// midnight UTC of now's day.
func ScheduleStart(now time.Time) time.Time {
	u := now.UTC()
	return time.Date(u.Year(), u.Month(), u.Day(), 0, 0, 0, 0, time.UTC)
}

// BuildEIT generates present/following and schedule sections for services.
// Events must not overlap within a service; they are sorted by start.
func BuildEIT(cfg EITConfig, services []Service, versions VersionStore) EITResult {
	if cfg.DaysAhead < 1 {
		cfg.DaysAhead = 1
	}
	if cfg.DaysAhead > MaxDaysAhead {
		cfg.DaysAhead = MaxDaysAhead
	}
	if cfg.Encoding == "" {
		cfg.Encoding = EncodingUTF8
	}
	var res EITResult
	for _, svc := range services {
		events := append([]Event(nil), svc.Events...)
		sort.SliceStable(events, func(i, j int) bool { return events[i].Start.Before(events[j].Start) })
		ids := eventIDs(events)
		actual := cfg.isActual(svc)
		res.PF = append(res.PF, buildPF(cfg, svc, events, ids, actual, versions)...)
		sections, n, dropped := buildSchedule(cfg, svc, events, ids, actual, versions)
		res.Schedule = append(res.Schedule, sections...)
		res.Events += n
		res.Truncated += dropped
	}
	return res
}

func buildPF(cfg EITConfig, svc Service, events []Event, ids []uint16, actual bool, versions VersionStore) []Section {
	table := uint8(tablePFActual)
	if !actual {
		table = tablePFOther
	}
	key := SubTableKey{TableID: table, ONID: svc.ONID, TSID: svc.TSID, SID: svc.SID}
	present, following := -1, -1
	for i, ev := range events {
		if !ev.Stop.After(cfg.Now) {
			continue
		}
		if !ev.Start.After(cfg.Now) {
			if present < 0 {
				present = i
			}
			continue
		}
		following = i
		break
	}
	var drafts []draftSection
	for n, idx := range []int{present, following} {
		var evs [][]byte
		if idx >= 0 {
			running := uint8(1)
			if n == 0 {
				running = 4
			}
			evs = append(evs, encodeEvent(ids[idx], events[idx], running, cfg, -1))
		}
		drafts = append(drafts, draftSection{
			number: uint8(n),
			data:   buildSection(key, uint8(n), 1, 1, table, evs),
		})
	}
	return finalize(key, drafts, versions)
}

func buildSchedule(cfg EITConfig, svc Service, events []Event, ids []uint16, actual bool, versions VersionStore) ([]Section, int, int) {
	base := uint8(tableScheduleActual)
	if !actual {
		base = tableScheduleOther
	}
	start := ScheduleStart(cfg.Now)
	end := start.Add(time.Duration(cfg.DaysAhead) * 24 * time.Hour)
	totalSegments := cfg.DaysAhead * 24 / 3
	tables := (totalSegments + segmentsPerTable - 1) / segmentsPerTable
	lastTable := base + uint8(tables-1)

	// Group events by absolute segment index. Events still running at the
	// window start belong to segment 0. Today's finished events are kept so
	// the schedule (and its version) only changes when data or day changes.
	segments := make([][]int, totalSegments)
	for i, ev := range events {
		if !ev.Stop.After(start) || !ev.Start.Before(end) {
			continue
		}
		seg := 0
		if ev.Start.After(start) {
			seg = int(ev.Start.Sub(start) / segmentDuration)
		}
		if seg >= totalSegments {
			continue
		}
		segments[seg] = append(segments[seg], i)
	}

	var out []Section
	count, dropped := 0, 0
	for t := 0; t < tables; t++ {
		table := base + uint8(t)
		key := SubTableKey{TableID: table, ONID: svc.ONID, TSID: svc.TSID, SID: svc.SID}
		first := t * segmentsPerTable
		last := min(first+segmentsPerTable, totalSegments)
		packed := make([][][][]byte, last-first)
		for s := first; s < last; s++ {
			p, n, d := packSegment(cfg, events, ids, segments[s])
			packed[s-first] = p
			count += n
			dropped += d
		}
		lastSegment := last - first - 1
		lastSection := uint8(lastSegment*sectionsPerSegment + max(len(packed[lastSegment]), 1) - 1)
		var drafts []draftSection
		for s, secs := range packed {
			if len(secs) == 0 {
				secs = [][][]byte{nil}
			}
			segLast := uint8(s*sectionsPerSegment + len(secs) - 1)
			for n, evs := range secs {
				number := uint8(s*sectionsPerSegment + n)
				drafts = append(drafts, draftSection{
					number: number,
					data:   buildSection(key, number, lastSection, segLast, lastTable, evs),
				})
			}
		}
		out = append(out, finalize(key, drafts, versions)...)
	}
	return out, count, dropped
}

// packSegment packs a segment's events into at most eight sections. When
// they do not fit, extended descriptions are shortened step by step and,
// as a last resort, events are dropped from the end.
func packSegment(cfg EITConfig, events []Event, ids []uint16, idx []int) ([][][]byte, int, int) {
	if len(idx) == 0 {
		return nil, 0, 0
	}
	for _, budget := range []int{-1, 2000, 1000, 500, 250, 0} {
		encoded := make([][]byte, len(idx))
		for i, e := range idx {
			encoded[i] = encodeEvent(ids[e], events[e], 0, cfg, budget)
		}
		if secs, ok := packSections(encoded); ok {
			return secs, len(idx), 0
		}
	}
	encoded := make([][]byte, len(idx))
	for i, e := range idx {
		encoded[i] = encodeEvent(ids[e], events[e], 0, cfg, 0)
	}
	for n := len(encoded) - 1; n > 0; n-- {
		if secs, ok := packSections(encoded[:n]); ok {
			return secs, n, len(idx) - n
		}
	}
	return nil, 0, len(idx)
}

func packSections(encoded [][]byte) ([][][]byte, bool) {
	var secs [][][]byte
	var cur [][]byte
	size := 0
	for _, e := range encoded {
		if size+len(e) > maxEventLoop && len(cur) > 0 {
			secs = append(secs, cur)
			cur, size = nil, 0
		}
		cur = append(cur, e)
		size += len(e)
	}
	if len(cur) > 0 {
		secs = append(secs, cur)
	}
	return secs, len(secs) <= sectionsPerSegment
}

// MemoryVersions is an in-memory VersionStore. It increments a sub_table's
// version modulo 32 whenever its content hash changes.
type MemoryVersions struct {
	entries map[SubTableKey]VersionEntry
	dirty   map[SubTableKey]bool
}

// VersionEntry is a persisted version record.
type VersionEntry struct {
	Version uint8
	Hash    uint64
}

// NewMemoryVersions returns a store seeded with previously persisted entries.
func NewMemoryVersions(seed map[SubTableKey]VersionEntry) *MemoryVersions {
	m := &MemoryVersions{entries: make(map[SubTableKey]VersionEntry, len(seed)), dirty: map[SubTableKey]bool{}}
	for k, v := range seed {
		m.entries[k] = v
	}
	return m
}

// Version implements VersionStore.
func (m *MemoryVersions) Version(key SubTableKey, hash uint64) uint8 {
	entry, ok := m.entries[key]
	if ok && entry.Hash == hash {
		return entry.Version
	}
	if ok {
		entry.Version = (entry.Version + 1) & 0x1F
	}
	entry.Hash = hash
	m.entries[key] = entry
	m.dirty[key] = true
	return entry.Version
}

// TakeDirty returns entries changed since the last call and clears the
// dirty set.
func (m *MemoryVersions) TakeDirty() map[SubTableKey]VersionEntry {
	out := make(map[SubTableKey]VersionEntry, len(m.dirty))
	for k := range m.dirty {
		out[k] = m.entries[k]
	}
	m.dirty = map[SubTableKey]bool{}
	return out
}
