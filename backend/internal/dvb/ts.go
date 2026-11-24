package dvb

const (
	// PacketSize is the MPEG-2 transport stream packet size.
	PacketSize = 188
	// PacketsPerDatagram is the usual number of TS packets per UDP datagram
	// (7 x 188 = 1316 bytes).
	PacketsPerDatagram = 7
	// NullPID is the PID of stuffing packets.
	NullPID = 0x1FFF
	// TDTPID carries TDT and TOT.
	TDTPID = 0x14

	syncByte = 0x47
)

// Packetize packs sections back to back into TS packets on pid. A packet
// in which a section starts has payload_unit_start_indicator set and a
// pointer_field; unused payload is filled with 0xFF. Continuity counters
// are left at zero and must be set when the packets are played out.
func Packetize(pid uint16, sections [][]byte) []byte {
	var out []byte
	i, off := 0, 0
	for i < len(sections) {
		if len(sections[i]) == 0 {
			i++
			continue
		}
		p := make([]byte, PacketSize)
		for k := range p {
			p[k] = 0xFF
		}
		p[0] = syncByte
		p[1] = byte(pid>>8) & 0x1F
		p[2] = byte(pid)
		p[3] = 0x10 // payload only, continuity counter 0
		w := 4
		startsHere := off == 0
		if !startsHere {
			remaining := len(sections[i]) - off
			startsHere = remaining <= PacketSize-5-1 && i+1 < len(sections)
		}
		if startsHere {
			pointer := 0
			if off != 0 {
				pointer = len(sections[i]) - off
			}
			p[1] |= 0x40
			p[4] = byte(pointer)
			w = 5
		}
		for w < PacketSize && i < len(sections) {
			n := copy(p[w:], sections[i][off:])
			w += n
			off += n
			if off < len(sections[i]) {
				break
			}
			i, off = i+1, 0
			if !startsHere {
				break
			}
		}
		out = append(out, p...)
	}
	return out
}

// NullPacket returns a stuffing packet.
func NullPacket() []byte {
	p := make([]byte, PacketSize)
	for k := range p {
		p[k] = 0xFF
	}
	p[0], p[1], p[2], p[3] = syncByte, byte(NullPID>>8), byte(NullPID&0xFF), 0x10
	return p
}

// PacketPID returns the PID of a TS packet.
func PacketPID(p []byte) uint16 {
	return uint16(p[1]&0x1F)<<8 | uint16(p[2])
}

// ContinuityCounters rewrites the continuity_counter of packets in place,
// keeping one counter per PID across calls. Null packets are not counted.
type ContinuityCounters map[uint16]uint8

// Apply sets continuity counters for every packet in data.
func (cc ContinuityCounters) Apply(data []byte) {
	for off := 0; off+PacketSize <= len(data); off += PacketSize {
		pid := PacketPID(data[off:])
		if pid == NullPID {
			continue
		}
		c := cc[pid]
		data[off+3] = data[off+3]&0xF0 | c&0x0F
		cc[pid] = (c + 1) & 0x0F
	}
}

// PadToDatagrams appends null packets so len(data) is a multiple of seven
// packets.
func PadToDatagrams(data []byte) []byte {
	for (len(data)/PacketSize)%PacketsPerDatagram != 0 {
		data = append(data, NullPacket()...)
	}
	return data
}
