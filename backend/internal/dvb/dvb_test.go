package dvb

import (
	"bytes"
	"encoding/binary"
	"testing"
	"time"
	"unicode/utf8"
)

func TestCRC32(t *testing.T) {
	if got := CRC32([]byte("123456789")); got != 0x0376E6E7 {
		t.Fatalf("CRC32 check value = %#08x, want 0x0376e6e7", got)
	}
	// Standard PAT: transport_stream_id 1, program 1 on PMT PID 0x1000.
	pat := []byte{0x00, 0xB0, 0x0D, 0x00, 0x01, 0xC1, 0x00, 0x00, 0x00, 0x01, 0xF0, 0x00}
	if got := CRC32(pat); got != 0x2AB104B2 {
		t.Fatalf("PAT CRC = %#08x, want 0x2ab104b2", got)
	}
	// A section with its CRC appended has a zero residual.
	if got := CRC32(appendCRC(pat)); got != 0 {
		t.Fatalf("residual = %#08x, want 0", got)
	}
}

func TestEncodeTime(t *testing.T) {
	// EN 300 468 Annex C example: 93/10/13 12:45:00 is MJD 0xC079.
	got := EncodeTime(time.Date(1993, 10, 13, 12, 45, 0, 0, time.UTC))
	want := [5]byte{0xC0, 0x79, 0x12, 0x45, 0x00}
	if got != want {
		t.Fatalf("EncodeTime = % x, want % x", got, want)
	}
	// Local times are converted to UTC.
	loc := time.FixedZone("CEST", 2*3600)
	got = EncodeTime(time.Date(1993, 10, 13, 14, 45, 0, 0, loc))
	if got != want {
		t.Fatalf("EncodeTime(local) = % x, want % x", got, want)
	}
	if d := EncodeDuration(90*time.Minute + 5*time.Second); d != [3]byte{0x01, 0x30, 0x05} {
		t.Fatalf("EncodeDuration = % x", d)
	}
}

func TestEncodeText(t *testing.T) {
	const slovak = "ľščťžýáíéúäôň"
	utf := EncodeText(slovak, EncodingUTF8, 255)
	if utf[0] != 0x15 || !bytes.Equal(utf[1:], []byte(slovak)) {
		t.Fatalf("utf8 = % x", utf)
	}
	latin2 := EncodeText(slovak, EncodingISO88592, 255)
	want := append([]byte{0x10, 0x00, 0x02}, 0xB5, 0xB9, 0xE8, 0xBB, 0xBE, 0xFD, 0xE1, 0xED, 0xE9, 0xFA, 0xE4, 0xF4, 0xF2)
	if !bytes.Equal(latin2, want) {
		t.Fatalf("latin2 = % x, want % x", latin2, want)
	}
	iso := EncodeText("Čas é", EncodingISO6937, 255)
	if !bytes.Equal(iso, []byte{0xCF, 'C', 'a', 's', ' ', 0xC2, 'e'}) {
		t.Fatalf("iso6937 = % x", iso)
	}
	if got := EncodeText("", EncodingUTF8, 255); len(got) != 0 {
		t.Fatalf("empty text = % x", got)
	}
	// Truncation never splits a UTF-8 character.
	short := EncodeText("žžžž", EncodingUTF8, 6)
	if len(short) != 5 || !utf8.Valid(short[1:]) {
		t.Fatalf("truncated = % x", short)
	}
	if got := string(EncodeText("a\n\tb  c", EncodingISO88592, 255)[3:]); got != "a b c" {
		t.Fatalf("cleaned = %q", got)
	}
}

func TestShortEventDescriptor(t *testing.T) {
	d := ShortEventDescriptor("slk", "Správy", "", EncodingUTF8)
	if d[0] != 0x4D || int(d[1]) != len(d)-2 || string(d[2:5]) != "slk" {
		t.Fatalf("header = % x", d[:5])
	}
	if int(d[5]) != len("Správy")+1 {
		t.Fatalf("name length = %d", d[5])
	}
	long := ShortEventDescriptor("slk", string(bytes.Repeat([]byte("x"), 300)), string(bytes.Repeat([]byte("y"), 300)), EncodingUTF8)
	if len(long)-2 > 255 {
		t.Fatalf("descriptor body %d > 255", len(long)-2)
	}
}

func TestExtendedEventDescriptors(t *testing.T) {
	text := string(bytes.Repeat([]byte("abcdefghij "), 100)) // 1100 bytes
	out := ExtendedEventDescriptors("slk", text, EncodingUTF8, 4000)
	var numbers []byte
	total := 0
	for off := 0; off < len(out); {
		if out[off] != 0x4E {
			t.Fatalf("tag at %d = %#x", off, out[off])
		}
		l := int(out[off+1])
		if l > 255 {
			t.Fatalf("length %d", l)
		}
		numbers = append(numbers, out[off+2])
		total += int(out[off+7]) - 1 // minus selector
		off += 2 + l
	}
	if len(numbers) != 5 {
		t.Fatalf("descriptors = %d, want 5", len(numbers))
	}
	for i, n := range numbers {
		if int(n>>4) != i || n&0x0F != 4 {
			t.Fatalf("descriptor %d number byte = %#x", i, n)
		}
	}
	if total != len("abcdefghij")*100+99 {
		t.Fatalf("text bytes = %d", total)
	}
	limited := ExtendedEventDescriptors("slk", text, EncodingUTF8, 300)
	if len(limited) > 300 || len(limited) == 0 {
		t.Fatalf("limited length = %d", len(limited))
	}
	if ExtendedEventDescriptors("slk", "", EncodingUTF8, 4000) != nil {
		t.Fatal("empty text should produce no descriptor")
	}
}

type sectionHeader struct {
	tableID, version, number, last, segmentLast, lastTable uint8
	length, sid, tsid, onid                                uint16
	events                                                 int
}

func parseSection(t *testing.T, b []byte) sectionHeader {
	t.Helper()
	h := sectionHeader{
		tableID:     b[0],
		length:      binary.BigEndian.Uint16(b[1:3]) & 0x0FFF,
		sid:         binary.BigEndian.Uint16(b[3:5]),
		version:     b[5] >> 1 & 0x1F,
		number:      b[6],
		last:        b[7],
		tsid:        binary.BigEndian.Uint16(b[8:10]),
		onid:        binary.BigEndian.Uint16(b[10:12]),
		segmentLast: b[12],
		lastTable:   b[13],
	}
	if int(h.length)+3 != len(b) {
		t.Fatalf("section_length %d does not match %d bytes", h.length, len(b))
	}
	if len(b) > maxSectionBytes {
		t.Fatalf("section is %d bytes", len(b))
	}
	if CRC32(b) != 0 {
		t.Fatalf("bad CRC in table %#x section %d", h.tableID, h.number)
	}
	for off := 14; off < len(b)-4; {
		loop := int(binary.BigEndian.Uint16(b[off+10:off+12]) & 0x0FFF)
		off += 12 + loop
		h.events++
	}
	return h
}

func sampleService(now time.Time) Service {
	start := ScheduleStart(now)
	var events []Event
	for t := start.Add(-30 * time.Minute); t.Before(start.Add(10 * 24 * time.Hour)); t = t.Add(90 * time.Minute) {
		events = append(events, Event{Start: t, Stop: t.Add(90 * time.Minute), Title: "Správy", Subtitle: "Diel", Description: "Popis relácie"})
	}
	return Service{ONID: 1, TSID: 1001, SID: 20, Events: events}
}

func TestBuildEITPresentFollowing(t *testing.T) {
	now := time.Date(2026, 11, 24, 10, 0, 0, 0, time.UTC)
	svc := sampleService(now)
	res := BuildEIT(EITConfig{Now: now, DaysAhead: 4, Encoding: EncodingUTF8, Language: "slk"}, []Service{svc}, nil)
	if len(res.PF) != 2 {
		t.Fatalf("pf sections = %d", len(res.PF))
	}
	for i, s := range res.PF {
		h := parseSection(t, s.Data)
		if h.tableID != 0x4E || h.number != uint8(i) || h.last != 1 || h.sid != 20 || h.tsid != 1001 || h.onid != 1 || h.events != 1 {
			t.Fatalf("pf section %d = %+v", i, h)
		}
	}
	// Present event is running.
	if rs := res.PF[0].Data[14+10] >> 5; rs != 4 {
		t.Fatalf("present running_status = %d", rs)
	}

	// No current event: empty present, following still signalled.
	gap := Service{ONID: 1, TSID: 1001, SID: 40, Events: []Event{{Start: now.Add(time.Hour), Stop: now.Add(2 * time.Hour), Title: "Later"}}}
	res = BuildEIT(EITConfig{Now: now, DaysAhead: 1}, []Service{gap}, nil)
	if h := parseSection(t, res.PF[0].Data); h.events != 0 {
		t.Fatalf("present events = %d, want 0", h.events)
	}
	if h := parseSection(t, res.PF[1].Data); h.events != 1 {
		t.Fatalf("following events = %d, want 1", h.events)
	}
}

func TestBuildEITSchedule(t *testing.T) {
	now := time.Date(2026, 11, 24, 10, 0, 0, 0, time.UTC)
	svc := sampleService(now)
	for _, tc := range []struct {
		days       int
		tables     int
		lastNumber uint8
	}{
		{days: 4, tables: 1, lastNumber: 31 * 8},
		{days: 8, tables: 2, lastNumber: 31 * 8},
		{days: 6, tables: 2, lastNumber: 15 * 8},
	} {
		res := BuildEIT(EITConfig{Now: now, DaysAhead: tc.days, Language: "slk"}, []Service{svc}, nil)
		byTable := map[uint8][]sectionHeader{}
		for _, s := range res.Schedule {
			h := parseSection(t, s.Data)
			byTable[h.tableID] = append(byTable[h.tableID], h)
		}
		if len(byTable) != tc.tables {
			t.Fatalf("days %d: tables = %d", tc.days, len(byTable))
		}
		lastTable := uint8(0x50 + tc.tables - 1)
		events := 0
		for table, hs := range byTable {
			for _, h := range hs {
				if h.lastTable != lastTable {
					t.Fatalf("days %d: last_table_id = %#x", tc.days, h.lastTable)
				}
				if h.number/8 != h.segmentLast/8 || h.number > h.segmentLast {
					t.Fatalf("days %d: section %d segment_last %d", tc.days, h.number, h.segmentLast)
				}
				events += h.events
			}
			if table == lastTable && hs[len(hs)-1].last != tc.lastNumber {
				t.Fatalf("days %d: last_section_number = %d, want %d", tc.days, hs[len(hs)-1].last, tc.lastNumber)
			}
		}
		// Every 3h segment holds two 90-minute events; the event running
		// at midnight joins segment 0.
		if want := tc.days*16 + 1; events != want || res.Events != want {
			t.Fatalf("days %d: events = %d/%d, want %d", tc.days, events, res.Events, want)
		}
	}
}

func TestBuildEITModesAndVersions(t *testing.T) {
	now := time.Date(2026, 11, 24, 10, 0, 0, 0, time.UTC)
	a := sampleService(now)
	b := sampleService(now)
	b.TSID, b.SID = 1002, 100
	cfg := EITConfig{Now: now, DaysAhead: 4, Mode: ModeActualOther, HomeTSID: 1001}
	res := BuildEIT(cfg, []Service{a, b}, nil)
	if res.PF[0].Key.TableID != 0x4E || res.PF[2].Key.TableID != 0x4F {
		t.Fatalf("pf tables = %#x %#x", res.PF[0].Key.TableID, res.PF[2].Key.TableID)
	}
	if res.Schedule[len(res.Schedule)-1].Key.TableID != 0x60 {
		t.Fatalf("other schedule table = %#x", res.Schedule[len(res.Schedule)-1].Key.TableID)
	}

	versions := NewMemoryVersions(nil)
	first := BuildEIT(EITConfig{Now: now, DaysAhead: 4}, []Service{a}, versions)
	again := BuildEIT(EITConfig{Now: now.Add(time.Minute), DaysAhead: 4}, []Service{a}, versions)
	if !bytes.Equal(first.Schedule[0].Data, again.Schedule[0].Data) {
		t.Fatal("unchanged schedule produced different section")
	}
	a.Events[3].Title = "Zmena"
	changed := BuildEIT(EITConfig{Now: now, DaysAhead: 4}, []Service{a}, versions)
	if v := changed.Schedule[0].Data[5] >> 1 & 0x1F; v != 1 {
		t.Fatalf("version after change = %d, want 1", v)
	}
	if len(versions.TakeDirty()) == 0 || len(versions.TakeDirty()) != 0 {
		t.Fatal("dirty tracking")
	}
}

func TestEventIDsStable(t *testing.T) {
	start := time.Date(2026, 11, 24, 10, 0, 0, 0, time.UTC)
	ids := eventIDs([]Event{{Start: start}, {Start: start.Add(30 * time.Second)}, {Start: start.Add(time.Hour)}})
	if ids[0] == ids[1] || ids[1] != ids[0]+1 || ids[2] != uint16(start.Add(time.Hour).Unix()/60) {
		t.Fatalf("ids = %v", ids)
	}
}

func TestSegmentOverflowTruncates(t *testing.T) {
	now := time.Date(2026, 11, 24, 0, 0, 0, 0, time.UTC)
	long := string(bytes.Repeat([]byte("dlhý popis "), 400))
	var events []Event
	for i := 0; i < 60; i++ {
		s := now.Add(time.Duration(i) * 3 * time.Minute)
		events = append(events, Event{Start: s, Stop: s.Add(3 * time.Minute), Title: "T", Description: long})
	}
	res := BuildEIT(EITConfig{Now: now, DaysAhead: 1}, []Service{{ONID: 1, TSID: 1, SID: 1, Events: events}}, nil)
	sections := 0
	for _, s := range res.Schedule {
		h := parseSection(t, s.Data)
		if h.number < 8 {
			sections++
		}
	}
	if sections > 8 || res.Events != 60 {
		t.Fatalf("segment 0 sections = %d events = %d truncated = %d", sections, res.Events, res.Truncated)
	}
}

func TestPacketize(t *testing.T) {
	a := bytes.Repeat([]byte{0xAA}, 300)
	b := bytes.Repeat([]byte{0xBB}, 20)
	c := bytes.Repeat([]byte{0xCC}, 10)
	data := Packetize(18, [][]byte{a, b, c})
	if len(data)%PacketSize != 0 || len(data)/PacketSize != 2 {
		t.Fatalf("packets = %d", len(data)/PacketSize)
	}
	p1, p2 := data[:PacketSize], data[PacketSize:]
	if p1[0] != 0x47 || p1[1]&0x40 == 0 || PacketPID(p1) != 18 || p1[4] != 0 {
		t.Fatalf("first header = % x", p1[:5])
	}
	// 300-183 = 117 bytes of a remain; b starts at pointer 117.
	if p2[1]&0x40 == 0 || p2[4] != 117 {
		t.Fatalf("second header = % x", p2[:5])
	}
	payload := p2[5:]
	if payload[116] != 0xAA || payload[117] != 0xBB || payload[137] != 0xCC || payload[147] != 0xFF {
		t.Fatalf("payload layout wrong")
	}

	padded := PadToDatagrams(data)
	if len(padded)/PacketSize != 7 || PacketPID(padded[2*PacketSize:]) != NullPID {
		t.Fatalf("padding = %d packets", len(padded)/PacketSize)
	}
	cc := ContinuityCounters{}
	cc.Apply(padded)
	cc.Apply(padded)
	if padded[3]&0x0F != 2 || padded[PacketSize+3]&0x0F != 3 {
		t.Fatalf("cc = %d %d", padded[3]&0x0F, padded[PacketSize+3]&0x0F)
	}
}

func TestTDTAndTOT(t *testing.T) {
	loc, err := time.LoadLocation("Europe/Bratislava")
	if err != nil {
		t.Skip("tzdata not available")
	}
	now := time.Date(2026, 7, 1, 12, 0, 0, 0, time.UTC)
	tdt := TDT(now)
	if len(tdt) != 8 || tdt[0] != 0x70 {
		t.Fatalf("tdt = % x", tdt)
	}
	tot := TOT(now, loc, "SVK")
	if tot[0] != 0x73 || CRC32(tot) != 0 {
		t.Fatalf("tot = % x", tot)
	}
	desc := tot[10:]
	if desc[0] != 0x58 || string(desc[2:5]) != "SVK" || desc[5]&1 != 0 {
		t.Fatalf("descriptor = % x", desc[:6])
	}
	if desc[6] != 0x02 || desc[7] != 0x00 || desc[13] != 0x01 || desc[14] != 0x00 {
		t.Fatalf("offsets = % x / % x", desc[6:8], desc[13:15])
	}
	// Summer time ends on 25 October 2026 at 01:00 UTC.
	if change := desc[8:13]; !bytes.Equal(change, func() []byte { e := EncodeTime(time.Date(2026, 10, 25, 1, 0, 0, 0, time.UTC)); return e[:] }()) {
		t.Fatalf("time_of_change = % x", change)
	}
}

func TestCarouselAndDump(t *testing.T) {
	now := time.Date(2026, 11, 24, 10, 0, 0, 0, time.UTC)
	res := BuildEIT(EITConfig{Now: now, DaysAhead: 4}, []Service{sampleService(now)}, nil)
	c := BuildCarousel(18, 30*time.Second, res)
	if len(c.Slots) != 15 {
		t.Fatalf("slots = %d", len(c.Slots))
	}
	for _, s := range c.Slots {
		if (len(s.Packets)/PacketSize)%7 != 0 || s.Packets[1]&0x40 == 0 {
			t.Fatal("slot not aligned or does not start a section")
		}
	}
	if c.Kbps() <= 0 {
		t.Fatal("bitrate not computed")
	}
	dump := Dump(c, 1, now, time.UTC, "SVK")
	cc := map[uint16]int{}
	for off := 0; off < len(dump); off += PacketSize {
		pid := PacketPID(dump[off:])
		if pid == NullPID {
			continue
		}
		got := int(dump[off+3] & 0x0F)
		if want, ok := cc[pid]; ok && got != want {
			t.Fatalf("pid %d cc %d, want %d", pid, got, want)
		}
		cc[pid] = (got + 1) & 0x0F
	}
	if _, ok := cc[TDTPID]; !ok {
		t.Fatal("dump has no TDT/TOT packets")
	}
}
