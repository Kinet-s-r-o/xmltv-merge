package dvb

import (
	"strings"
	"time"
)

// TDT builds a time and date section (table_id 0x70) for now.
func TDT(now time.Time) []byte {
	t := EncodeTime(now)
	return append([]byte{0x70, 0x70, 0x05}, t[:]...)
}

// TOT builds a time offset section (table_id 0x73) with a
// local_time_offset_descriptor derived from loc.
func TOT(now time.Time, loc *time.Location, country string) []byte {
	if loc == nil {
		loc = time.UTC
	}
	local := now.In(loc)
	_, offset := local.Zone()
	_, end := local.ZoneBounds()
	change := end
	nextOffset := offset
	if !end.IsZero() {
		_, nextOffset = end.In(loc).Zone()
	} else {
		change = now
	}
	cur, polarity := encodeOffset(offset)
	next, _ := encodeOffset(nextOffset)
	changeTime := EncodeTime(change)

	desc := []byte{tagLocalTimeOffset, 13}
	desc = append(desc, countryCode(country)...)
	desc = append(desc, 0x02|polarity) // country_region_id 0, reserved 1, polarity
	desc = append(desc, cur[:]...)
	desc = append(desc, changeTime[:]...)
	desc = append(desc, next[:]...)

	t := EncodeTime(now)
	length := 5 + 2 + len(desc) + 4
	b := []byte{0x73, 0x70 | byte(length>>8&0x0F), byte(length)}
	b = append(b, t[:]...)
	b = append(b, 0xF0|byte(len(desc)>>8&0x0F), byte(len(desc)))
	b = append(b, desc...)
	return appendCRC(b)
}

func countryCode(c string) []byte {
	c = strings.ToUpper(strings.TrimSpace(c))
	b := []byte(c)
	for len(b) < 3 {
		b = append(b, ' ')
	}
	return b[:3]
}

// CountryForZone returns an ISO 3166 alpha-3 code for common European IANA
// zones, defaulting to SVK.
func CountryForZone(zone string) string {
	switch zone {
	case "Europe/Prague":
		return "CZE"
	case "Europe/Vienna":
		return "AUT"
	case "Europe/Budapest":
		return "HUN"
	case "Europe/Warsaw":
		return "POL"
	case "Europe/Berlin":
		return "DEU"
	case "UTC", "Etc/UTC":
		return "SVK"
	}
	return "SVK"
}
