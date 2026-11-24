package dvb

import (
	"strings"
	"unicode"
	"unicode/utf8"

	"golang.org/x/text/encoding/charmap"
	"golang.org/x/text/unicode/norm"
)

// TextEncoding selects the EN 300 468 Annex A character table used for
// event names and descriptions.
type TextEncoding string

const (
	// EncodingUTF8 marks text with selector 0x15 (ISO/IEC 10646 UTF-8).
	EncodingUTF8 TextEncoding = "utf8"
	// EncodingISO88592 marks text with selector 0x10 0x00 0x02.
	EncodingISO88592 TextEncoding = "iso8859-2"
	// EncodingISO6937 uses the default table (no selector byte).
	EncodingISO6937 TextEncoding = "iso6937"
)

// ValidEncoding reports whether s names a supported text encoding.
func ValidEncoding(s string) bool {
	switch TextEncoding(s) {
	case EncodingUTF8, EncodingISO88592, EncodingISO6937:
		return true
	}
	return false
}

func (e TextEncoding) prefix() []byte {
	switch e {
	case EncodingUTF8:
		return []byte{0x15}
	case EncodingISO88592:
		return []byte{0x10, 0x00, 0x02}
	}
	return nil
}

// ISO 6937 non-spacing diacritical marks keyed by Unicode combining mark.
var iso6937Marks = map[rune]byte{
	0x0300: 0xC1, // grave
	0x0301: 0xC2, // acute
	0x0302: 0xC3, // circumflex
	0x0303: 0xC4, // tilde
	0x0304: 0xC5, // macron
	0x0306: 0xC6, // breve
	0x0307: 0xC7, // dot above
	0x0308: 0xC8, // diaeresis
	0x030A: 0xCA, // ring above
	0x0327: 0xCB, // cedilla
	0x030B: 0xCD, // double acute
	0x0328: 0xCE, // ogonek
	0x030C: 0xCF, // caron
}

// encodeRune returns the bytes for r in encoding e. Unmappable characters
// become '?'.
func (e TextEncoding) encodeRune(r rune) []byte {
	switch e {
	case EncodingUTF8:
		return utf8.AppendRune(nil, r)
	case EncodingISO88592:
		if r < 0x80 {
			return []byte{byte(r)}
		}
		if b, ok := charmap.ISO8859_2.EncodeRune(r); ok {
			return []byte{b}
		}
		return []byte{'?'}
	default:
		if r >= 0x20 && r < 0x7F {
			return []byte{byte(r)}
		}
		decomposed := []rune(norm.NFD.String(string(r)))
		if len(decomposed) == 2 && decomposed[0] < 0x7F {
			if mark, ok := iso6937Marks[decomposed[1]]; ok {
				return []byte{mark, byte(decomposed[0])}
			}
		}
		return []byte{'?'}
	}
}

// cleanText collapses control characters and whitespace runs into single
// spaces.
func cleanText(s string) string {
	s = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || unicode.IsSpace(r) {
			return ' '
		}
		return r
	}, s)
	return strings.Join(strings.Fields(s), " ")
}

// EncodeText encodes s with the table selector of e, truncated on a
// character boundary so the result never exceeds max bytes. Empty text
// yields an empty slice without a selector.
func EncodeText(s string, e TextEncoding, max int) []byte {
	chunks := EncodeTextChunks(s, e, max, 1)
	if len(chunks) == 0 {
		return nil
	}
	return chunks[0]
}

// EncodeTextChunks splits s into at most maxChunks pieces of at most
// chunkMax bytes each. Every piece starts with the table selector so each
// descriptor is self-describing. Text beyond the last chunk is dropped.
func EncodeTextChunks(s string, e TextEncoding, chunkMax, maxChunks int) [][]byte {
	s = cleanText(s)
	prefix := e.prefix()
	if s == "" || chunkMax <= len(prefix) || maxChunks <= 0 {
		return nil
	}
	var chunks [][]byte
	current := append([]byte(nil), prefix...)
	for _, r := range s {
		b := e.encodeRune(r)
		if len(current)+len(b) > chunkMax {
			chunks = append(chunks, current)
			if len(chunks) == maxChunks {
				return chunks
			}
			current = append([]byte(nil), prefix...)
		}
		current = append(current, b...)
	}
	if len(current) > len(prefix) {
		chunks = append(chunks, current)
	}
	return chunks
}
