// Package dvb builds DVB SI tables (EIT, TDT, TOT) and packs them into
// MPEG-2 transport stream packets according to ETSI EN 300 468 and
// ISO/IEC 13818-1. It has no database or network dependencies.
package dvb

var crcTable = func() [256]uint32 {
	var table [256]uint32
	for i := range table {
		c := uint32(i) << 24
		for j := 0; j < 8; j++ {
			if c&0x80000000 != 0 {
				c = c<<1 ^ 0x04C11DB7
			} else {
				c <<= 1
			}
		}
		table[i] = c
	}
	return table
}()

// CRC32 returns the CRC-32/MPEG-2 checksum used by PSI/SI sections.
func CRC32(data []byte) uint32 {
	c := uint32(0xFFFFFFFF)
	for _, b := range data {
		c = c<<8 ^ crcTable[byte(c>>24)^b]
	}
	return c
}

// appendCRC appends the big-endian CRC32 of section to section.
func appendCRC(section []byte) []byte {
	c := CRC32(section)
	return append(section, byte(c>>24), byte(c>>16), byte(c>>8), byte(c))
}
