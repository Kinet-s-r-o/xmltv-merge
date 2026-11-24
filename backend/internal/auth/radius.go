package auth

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/md5"
	"crypto/rand"
	"crypto/subtle"
	"encoding/binary"
	"errors"
	"fmt"
	"net"
	"strconv"
	"time"
)

// RADIUS packet codes and attribute types (RFC 2865, RFC 3579).
const (
	radiusAccessRequest   = 1
	radiusAccessAccept    = 2
	radiusAccessReject    = 3
	radiusAccessChallenge = 11

	attrUserName             = 1
	attrUserPassword         = 2
	attrServiceType          = 6
	attrReplyMessage         = 18
	attrNASIdentifier        = 32
	attrNASPortType          = 61
	attrMessageAuthenticator = 80

	serviceTypeAuthenticateOnly = 8
	nasPortTypeVirtual          = 5

	radiusMaxPacket = 4096
)

// RadiusServer is the client-side view of one configured server.
type RadiusServer struct {
	Name                        string
	Host                        string
	Port                        int
	Secret                      string
	Timeout                     time.Duration
	Retries                     int
	NASIdentifier               string
	RequireMessageAuthenticator bool
}

// RadiusResult is the outcome of one authentication attempt.
type RadiusResult struct {
	Accepted bool
	// Server is the name of the server that answered.
	Server string
	// ReplyMessage is the server's Reply-Message text, for logs and the admin
	// test action only; it is never shown on the login page.
	ReplyMessage string
}

// ErrRadiusUnavailable means no configured server produced a valid answer.
var ErrRadiusUnavailable = errors.New("no RADIUS server answered")

// RadiusAuthenticate tries the servers in order. A valid Access-Accept or
// Access-Reject from a server ends the attempt; timeouts, network errors and
// responses that fail validation move on to the next server.
func RadiusAuthenticate(ctx context.Context, servers []RadiusServer, username, password string) (RadiusResult, error) {
	if len(servers) == 0 {
		return RadiusResult{}, errors.New("no RADIUS servers are enabled")
	}
	var lastErr error
	for _, server := range servers {
		res, err := radiusExchange(ctx, server, username, password)
		if err == nil {
			return res, nil
		}
		lastErr = fmt.Errorf("%s: %w", server.Name, err)
		if ctx.Err() != nil {
			break
		}
	}
	return RadiusResult{}, fmt.Errorf("%w (%v)", ErrRadiusUnavailable, lastErr)
}

func radiusExchange(ctx context.Context, server RadiusServer, username, password string) (RadiusResult, error) {
	if server.Secret == "" {
		return RadiusResult{}, errors.New("shared secret is empty")
	}
	packet, requestAuth, err := buildAccessRequest(server, username, password)
	if err != nil {
		return RadiusResult{}, err
	}
	timeout := server.Timeout
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	attempts := server.Retries + 1
	if attempts < 1 {
		attempts = 1
	}
	var dialer net.Dialer
	conn, err := dialer.DialContext(ctx, "udp", net.JoinHostPort(server.Host, strconv.Itoa(server.Port)))
	if err != nil {
		return RadiusResult{}, err
	}
	defer conn.Close()

	buf := make([]byte, radiusMaxPacket)
	var lastErr error = errors.New("timeout")
	for attempt := 0; attempt < attempts; attempt++ {
		if ctx.Err() != nil {
			return RadiusResult{}, ctx.Err()
		}
		if _, err := conn.Write(packet); err != nil {
			lastErr = err
			continue
		}
		deadline := time.Now().Add(timeout)
		if d, ok := ctx.Deadline(); ok && d.Before(deadline) {
			deadline = d
		}
		_ = conn.SetReadDeadline(deadline)
		for {
			n, err := conn.Read(buf)
			if err != nil {
				lastErr = err
				break
			}
			res, err := parseAccessResponse(buf[:n], packet[1], requestAuth, server)
			if err != nil {
				// Ignore stray or forged packets and keep waiting until the deadline.
				lastErr = err
				continue
			}
			res.Server = server.Name
			return res, nil
		}
	}
	return RadiusResult{}, lastErr
}

func buildAccessRequest(server RadiusServer, username, password string) ([]byte, [16]byte, error) {
	var requestAuth [16]byte
	if _, err := rand.Read(requestAuth[:]); err != nil {
		return nil, requestAuth, err
	}
	var id [1]byte
	if _, err := rand.Read(id[:]); err != nil {
		return nil, requestAuth, err
	}
	if len(username) == 0 || len(username) > 253 {
		return nil, requestAuth, errors.New("user name must have 1-253 bytes")
	}
	if len(password) == 0 || len(password) > 128 {
		return nil, requestAuth, errors.New("password must have 1-128 bytes for RADIUS")
	}

	var attrs bytes.Buffer
	// Message-Authenticator first (BlastRADIUS / CVE-2024-3596 mitigation), zeroed for now.
	attrs.Write([]byte{attrMessageAuthenticator, 18})
	attrs.Write(make([]byte, 16))
	writeAttr(&attrs, attrUserName, []byte(username))
	writeAttr(&attrs, attrUserPassword, encryptRadiusPassword(password, server.Secret, requestAuth))
	nas := server.NASIdentifier
	if nas == "" {
		nas = "xmltv-epg"
	}
	writeAttr(&attrs, attrNASIdentifier, []byte(nas))
	writeAttr(&attrs, attrServiceType, uint32Bytes(serviceTypeAuthenticateOnly))
	writeAttr(&attrs, attrNASPortType, uint32Bytes(nasPortTypeVirtual))

	length := 20 + attrs.Len()
	packet := make([]byte, length)
	packet[0] = radiusAccessRequest
	packet[1] = id[0]
	binary.BigEndian.PutUint16(packet[2:4], uint16(length))
	copy(packet[4:20], requestAuth[:])
	copy(packet[20:], attrs.Bytes())

	mac := hmac.New(md5.New, []byte(server.Secret))
	mac.Write(packet)
	copy(packet[22:38], mac.Sum(nil))
	return packet, requestAuth, nil
}

func parseAccessResponse(resp []byte, id byte, requestAuth [16]byte, server RadiusServer) (RadiusResult, error) {
	if len(resp) < 20 {
		return RadiusResult{}, errors.New("short response")
	}
	length := int(binary.BigEndian.Uint16(resp[2:4]))
	if length < 20 || length > len(resp) {
		return RadiusResult{}, errors.New("invalid response length")
	}
	resp = resp[:length]
	if resp[1] != id {
		return RadiusResult{}, errors.New("response identifier mismatch")
	}

	// Response Authenticator = MD5(Code+ID+Length+RequestAuth+Attributes+Secret).
	h := md5.New()
	h.Write(resp[:4])
	h.Write(requestAuth[:])
	h.Write(resp[20:])
	h.Write([]byte(server.Secret))
	if subtle.ConstantTimeCompare(h.Sum(nil), resp[4:20]) != 1 {
		return RadiusResult{}, errors.New("invalid response authenticator (check the shared secret)")
	}

	var result RadiusResult
	maOffset := -1
	for offset := 20; offset < len(resp); {
		if offset+2 > len(resp) {
			return RadiusResult{}, errors.New("truncated attribute")
		}
		typ, l := resp[offset], int(resp[offset+1])
		if l < 2 || offset+l > len(resp) {
			return RadiusResult{}, errors.New("invalid attribute length")
		}
		value := resp[offset+2 : offset+l]
		switch typ {
		case attrMessageAuthenticator:
			if l != 18 {
				return RadiusResult{}, errors.New("invalid Message-Authenticator")
			}
			maOffset = offset + 2
		case attrReplyMessage:
			if result.ReplyMessage != "" {
				result.ReplyMessage += " "
			}
			result.ReplyMessage += string(value)
		}
		offset += l
	}

	if maOffset >= 0 {
		check := append([]byte(nil), resp...)
		copy(check[4:20], requestAuth[:])
		copy(check[maOffset:maOffset+16], make([]byte, 16))
		mac := hmac.New(md5.New, []byte(server.Secret))
		mac.Write(check)
		if subtle.ConstantTimeCompare(mac.Sum(nil), resp[maOffset:maOffset+16]) != 1 {
			return RadiusResult{}, errors.New("invalid Message-Authenticator")
		}
	} else if server.RequireMessageAuthenticator {
		return RadiusResult{}, errors.New("response has no Message-Authenticator (required for this server)")
	}

	switch resp[0] {
	case radiusAccessAccept:
		result.Accepted = true
	case radiusAccessReject:
		result.Accepted = false
	case radiusAccessChallenge:
		// Challenge/response (e.g. RADIUS-side OTP) is not supported; treat as rejection.
		result.Accepted = false
		if result.ReplyMessage == "" {
			result.ReplyMessage = "server sent Access-Challenge, which is not supported"
		}
	default:
		return RadiusResult{}, fmt.Errorf("unexpected response code %d", resp[0])
	}
	return result, nil
}

func encryptRadiusPassword(password, secret string, requestAuth [16]byte) []byte {
	padded := make([]byte, (len(password)+15)/16*16)
	copy(padded, password)
	out := make([]byte, len(padded))
	prev := requestAuth[:]
	for i := 0; i < len(padded); i += 16 {
		h := md5.New()
		h.Write([]byte(secret))
		h.Write(prev)
		b := h.Sum(nil)
		for j := 0; j < 16; j++ {
			out[i+j] = padded[i+j] ^ b[j]
		}
		prev = out[i : i+16]
	}
	return out
}

func writeAttr(buf *bytes.Buffer, typ byte, value []byte) {
	buf.WriteByte(typ)
	buf.WriteByte(byte(len(value) + 2))
	buf.Write(value)
}

func uint32Bytes(v uint32) []byte {
	var b [4]byte
	binary.BigEndian.PutUint32(b[:], v)
	return b[:]
}
