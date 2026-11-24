package dvb

import "time"

// PFInterval is the target repetition interval of present/following
// sections.
const PFInterval = 2 * time.Second

// TDTInterval is the repetition interval of TDT/TOT when enabled.
const TDTInterval = 5 * time.Second

// Slot is a self-contained group of TS packets (every section in it starts
// and ends inside the slot) to be played out evenly during Duration.
type Slot struct {
	Duration time.Duration
	// Packets holds whole TS packets on the EIT PID, padded with null
	// packets to a multiple of seven.
	Packets []byte
}

// Carousel is one playout cycle of EIT data.
type Carousel struct {
	Cycle    time.Duration
	Slots    []Slot
	Sections int
	Events   int
	// Truncated counts events dropped because a schedule segment overflowed.
	Truncated int
	// Bytes is the number of bytes played per cycle including padding.
	Bytes int
}

// Kbps returns the average bitrate of the carousel in kbit/s.
func (c *Carousel) Kbps() float64 {
	if c == nil || c.Cycle <= 0 {
		return 0
	}
	return float64(c.Bytes) * 8 / c.Cycle.Seconds() / 1000
}

// BuildCarousel spreads schedule sections evenly over cycle and repeats
// present/following sections about every PFInterval.
func BuildCarousel(pid uint16, cycle time.Duration, eit EITResult) *Carousel {
	if cycle < PFInterval {
		cycle = PFInterval
	}
	slots := int(cycle / PFInterval)
	if slots < 1 {
		slots = 1
	}
	pf := make([][]byte, len(eit.PF))
	for i, s := range eit.PF {
		pf[i] = s.Data
	}
	total := 0
	for _, s := range eit.Schedule {
		total += len(s.Data)
	}
	groups := make([][][]byte, slots)
	acc := 0
	for _, s := range eit.Schedule {
		g := 0
		if total > 0 {
			g = acc * slots / total
		}
		if g >= slots {
			g = slots - 1
		}
		groups[g] = append(groups[g], s.Data)
		acc += len(s.Data)
	}
	c := &Carousel{
		Cycle:     cycle,
		Sections:  len(eit.Schedule) + len(eit.PF)*slots,
		Events:    eit.Events,
		Truncated: eit.Truncated,
	}
	slotDuration := cycle / time.Duration(slots)
	for _, g := range groups {
		sections := append(append([][]byte(nil), pf...), g...)
		packets := PadToDatagrams(Packetize(pid, sections))
		c.Slots = append(c.Slots, Slot{Duration: slotDuration, Packets: packets})
		c.Bytes += len(packets)
	}
	return c
}

// TimePackets returns TDT and TOT packets on PID 0x14 for now.
func TimePackets(now time.Time, loc *time.Location, country string) []byte {
	return Packetize(TDTPID, [][]byte{TDT(now), TOT(now, loc, country)})
}

// Dump renders cycles of the carousel as a contiguous transport stream with
// continuity counters set, inserting TDT/TOT every TDTInterval when loc is
// not nil. It is intended for offline analysis.
func Dump(c *Carousel, cycles int, start time.Time, loc *time.Location, country string) []byte {
	if c == nil {
		return nil
	}
	if cycles < 1 {
		cycles = 1
	}
	cc := ContinuityCounters{}
	var out []byte
	elapsed := time.Duration(0)
	nextTime := time.Duration(0)
	for n := 0; n < cycles; n++ {
		for _, slot := range c.Slots {
			var chunk []byte
			if loc != nil && elapsed >= nextTime {
				chunk = append(chunk, TimePackets(start.Add(elapsed), loc, country)...)
				nextTime += TDTInterval
			}
			chunk = append(chunk, slot.Packets...)
			chunk = PadToDatagrams(chunk)
			cc.Apply(chunk)
			out = append(out, chunk...)
			elapsed += slot.Duration
		}
	}
	return out
}
