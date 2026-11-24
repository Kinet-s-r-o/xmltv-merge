package dvb

import "time"

func bcd(v int) byte {
	return byte((v/10)<<4 | v%10)
}

// MJD returns the Modified Julian Date of t's UTC calendar day.
func MJD(t time.Time) uint16 {
	u := t.UTC()
	day := time.Date(u.Year(), u.Month(), u.Day(), 0, 0, 0, 0, time.UTC)
	return uint16(day.Unix()/86400 + 40587)
}

// EncodeTime returns the 40-bit DVB UTC time: 16-bit MJD and BCD hhmmss.
func EncodeTime(t time.Time) [5]byte {
	u := t.UTC()
	mjd := MJD(u)
	return [5]byte{byte(mjd >> 8), byte(mjd), bcd(u.Hour()), bcd(u.Minute()), bcd(u.Second())}
}

// EncodeDuration returns a 24-bit BCD hhmmss duration, clamped to 99:59:59.
func EncodeDuration(d time.Duration) [3]byte {
	if d < 0 {
		d = 0
	}
	s := int(d / time.Second)
	if s > 99*3600+59*60+59 {
		s = 99*3600 + 59*60 + 59
	}
	return [3]byte{bcd(s / 3600), bcd(s / 60 % 60), bcd(s % 60)}
}

// encodeOffset returns a BCD hhmm offset magnitude and the polarity bit
// (1 for negative offsets).
func encodeOffset(seconds int) ([2]byte, byte) {
	var polarity byte
	if seconds < 0 {
		polarity = 1
		seconds = -seconds
	}
	minutes := seconds / 60
	return [2]byte{bcd(minutes / 60 % 100), bcd(minutes % 60)}, polarity
}
