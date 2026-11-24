package dvb

const (
	tagShortEvent      = 0x4D
	tagExtendedEvent   = 0x4E
	tagLocalTimeOffset = 0x58

	maxDescriptorBody = 255
	// extended_event_descriptor body: number(1) + language(3) +
	// length_of_items(1) + text_length(1) + text.
	extendedHeader      = 6
	maxExtendedText     = maxDescriptorBody - extendedHeader
	maxExtendedDescript = 16
)

func languageBytes(lang string) []byte {
	b := []byte(lang)
	for len(b) < 3 {
		b = append(b, ' ')
	}
	return b[:3]
}

// ShortEventDescriptor builds descriptor 0x4D with the event name and a
// short text (sub-title). The text is shortened first, then the name, so the
// descriptor body never exceeds 255 bytes.
func ShortEventDescriptor(lang, name, text string, e TextEncoding) []byte {
	const budget = maxDescriptorBody - 3 - 1 - 1
	nameBytes := EncodeText(name, e, budget)
	textBytes := EncodeText(text, e, budget-len(nameBytes))
	body := make([]byte, 0, 5+len(nameBytes)+len(textBytes))
	body = append(body, languageBytes(lang)...)
	body = append(body, byte(len(nameBytes)))
	body = append(body, nameBytes...)
	body = append(body, byte(len(textBytes)))
	body = append(body, textBytes...)
	return append([]byte{tagShortEvent, byte(len(body))}, body...)
}

// ExtendedEventDescriptors splits text into consecutive 0x4E descriptors
// whose total encoded size does not exceed maxBytes (and at most 16
// descriptors). It returns nil when there is no text or no room.
func ExtendedEventDescriptors(lang, text string, e TextEncoding, maxBytes int) []byte {
	if maxBytes <= 2+extendedHeader+len(e.prefix()) {
		return nil
	}
	maxChunks := maxExtendedDescript
	if fit := maxBytes / (2 + maxDescriptorBody); fit < maxChunks {
		// Leave room for a final partial descriptor.
		maxChunks = fit + 1
	}
	chunks := EncodeTextChunks(text, e, maxExtendedText, maxChunks)
	for len(chunks) > 0 {
		total := 0
		for _, c := range chunks {
			total += 2 + extendedHeader + len(c)
		}
		if total <= maxBytes {
			break
		}
		// Trim the last chunk to fit, or drop it when no room is left.
		last := chunks[len(chunks)-1]
		over := total - maxBytes
		if len(last)-over > len(e.prefix()) {
			chunks[len(chunks)-1] = trimEncoded(last, len(last)-over, e)
			continue
		}
		chunks = chunks[:len(chunks)-1]
	}
	if len(chunks) == 0 {
		return nil
	}
	lastNumber := byte(len(chunks) - 1)
	var out []byte
	for i, c := range chunks {
		body := []byte{byte(i)<<4 | lastNumber}
		body = append(body, languageBytes(lang)...)
		body = append(body, 0) // length_of_items
		body = append(body, byte(len(c)))
		body = append(body, c...)
		out = append(out, tagExtendedEvent, byte(len(body)))
		out = append(out, body...)
	}
	return out
}

// trimEncoded shortens an encoded chunk to at most n bytes without cutting a
// multi-byte character in half.
func trimEncoded(b []byte, n int, e TextEncoding) []byte {
	if n >= len(b) {
		return b
	}
	p := len(e.prefix())
	switch e {
	case EncodingUTF8:
		for n > p && b[n]&0xC0 == 0x80 {
			n--
		}
	case EncodingISO6937:
		// A diacritical mark (0xC1-0xCF) belongs to the following letter.
		if n > p && b[n-1] >= 0xC1 && b[n-1] <= 0xCF {
			n--
		}
	}
	return b[:n]
}
