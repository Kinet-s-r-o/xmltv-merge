package auth

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/md5"
	"encoding/binary"
	"net"
	"strings"
	"testing"
	"time"
)

func TestPasswordHashRoundTrip(t *testing.T) {
	hash, err := HashPassword("correct horse battery")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(hash, "pbkdf2-sha256$") {
		t.Fatalf("unexpected hash format %q", hash)
	}
	if !VerifyPassword(hash, "correct horse battery") {
		t.Fatal("expected password to verify")
	}
	if VerifyPassword(hash, "correct horse batterY") {
		t.Fatal("wrong password verified")
	}
	if VerifyPassword("", "anything") || VerifyPassword("garbage", "anything") {
		t.Fatal("empty or malformed hash must not verify")
	}
}

func TestValidatePassword(t *testing.T) {
	if ValidatePassword("short") == nil {
		t.Fatal("short password accepted")
	}
	if ValidatePassword("long enough password") != nil {
		t.Fatal("valid password rejected")
	}
}

// RFC 6238 Appendix B (SHA-1), truncated to 6 digits.
func TestTOTPVectors(t *testing.T) {
	secret := b32.EncodeToString([]byte("12345678901234567890"))
	cases := map[int64]string{59: "287082", 1111111109: "081804", 1234567890: "005924", 2000000000: "279037"}
	for unix, want := range cases {
		got, err := TOTPCode(secret, unix/TOTPPeriod)
		if err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Errorf("t=%d: got %s want %s", unix, got, want)
		}
	}
}

func TestVerifyTOTPWindowAndReplay(t *testing.T) {
	secret, err := NewTOTPSecret()
	if err != nil {
		t.Fatal(err)
	}
	now := time.Unix(1_700_000_000, 0)
	code, _ := TOTPCode(secret, TOTPStep(now)-1)
	step, ok := VerifyTOTP(secret, code, now, 0)
	if !ok || step != TOTPStep(now)-1 {
		t.Fatal("previous-step code should be accepted")
	}
	if _, ok := VerifyTOTP(secret, code, now, step); ok {
		t.Fatal("replayed code accepted")
	}
	old, _ := TOTPCode(secret, TOTPStep(now)-3)
	if _, ok := VerifyTOTP(secret, old, now, 0); ok {
		t.Fatal("code outside the window accepted")
	}
}

func TestSecretBox(t *testing.T) {
	box, err := NewSecretBox("test-key")
	if err != nil {
		t.Fatal(err)
	}
	sealed, err := box.Seal("radius-secret")
	if err != nil || !strings.HasPrefix(sealed, sealedPrefix) {
		t.Fatalf("seal: %q %v", sealed, err)
	}
	plain, err := box.Open(sealed)
	if err != nil || plain != "radius-secret" {
		t.Fatalf("open: %q %v", plain, err)
	}
	if plain, _ := box.Open("legacy-plain"); plain != "legacy-plain" {
		t.Fatal("plaintext values must pass through")
	}
	other, _ := NewSecretBox("")
	if _, err := other.Open(sealed); err == nil {
		t.Fatal("sealed value opened without key")
	}
}

func TestPermissionNormalize(t *testing.T) {
	p := Permission{Edit: true}.Normalize()
	if !p.Read || p.Full || p.Delete {
		t.Fatalf("edit should imply read only: %+v", p)
	}
	f := Permission{Full: true}.Normalize()
	if !f.Allows(ActionDelete) || !f.Allows(ActionExport) {
		t.Fatal("full should allow everything")
	}
	all := Permission{Read: true, Edit: true, Delete: true, Import: true, Export: true}.Normalize()
	if !all.Full {
		t.Fatal("all actions should become full")
	}
}

// fakeRadius answers one request, checking the request's Message-Authenticator
// and decrypted password like a real server would.
func fakeRadius(t *testing.T, secret, wantPassword string, withMA bool) (string, int) {
	t.Helper()
	conn, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	go func() {
		buf := make([]byte, 4096)
		n, addr, err := conn.ReadFrom(buf)
		if err != nil {
			return
		}
		req := append([]byte(nil), buf[:n]...)
		var reqAuth [16]byte
		copy(reqAuth[:], req[4:20])

		code := byte(radiusAccessReject)
		var password []byte
		maValid := false
		for off := 20; off < len(req); {
			typ, l := req[off], int(req[off+1])
			val := req[off+2 : off+l]
			switch typ {
			case attrUserPassword:
				password = decryptForTest(val, secret, reqAuth)
			case attrMessageAuthenticator:
				check := append([]byte(nil), req...)
				copy(check[off+2:off+18], make([]byte, 16))
				mac := hmac.New(md5.New, []byte(secret))
				mac.Write(check)
				maValid = hmac.Equal(mac.Sum(nil), val)
			}
			off += l
		}
		if maValid && string(password) == wantPassword {
			code = radiusAccessAccept
		}

		var attrs bytes.Buffer
		maPos := -1
		if withMA {
			maPos = 20 + attrs.Len() + 2
			attrs.Write([]byte{attrMessageAuthenticator, 18})
			attrs.Write(make([]byte, 16))
		}
		writeAttr(&attrs, attrReplyMessage, []byte("hello"))
		resp := make([]byte, 20+attrs.Len())
		resp[0], resp[1] = code, req[1]
		binary.BigEndian.PutUint16(resp[2:4], uint16(len(resp)))
		copy(resp[4:20], reqAuth[:])
		copy(resp[20:], attrs.Bytes())
		if withMA {
			mac := hmac.New(md5.New, []byte(secret))
			mac.Write(resp)
			copy(resp[maPos:maPos+16], mac.Sum(nil))
		}
		h := md5.New()
		h.Write(resp[:4])
		h.Write(reqAuth[:])
		h.Write(resp[20:])
		h.Write([]byte(secret))
		copy(resp[4:20], h.Sum(nil))
		conn.WriteTo(resp, addr)
	}()
	udp := conn.LocalAddr().(*net.UDPAddr)
	return udp.IP.String(), udp.Port
}

func decryptForTest(enc []byte, secret string, reqAuth [16]byte) []byte {
	out := make([]byte, len(enc))
	prev := reqAuth[:]
	for i := 0; i < len(enc); i += 16 {
		h := md5.New()
		h.Write([]byte(secret))
		h.Write(prev)
		b := h.Sum(nil)
		for j := 0; j < 16; j++ {
			out[i+j] = enc[i+j] ^ b[j]
		}
		prev = enc[i : i+16]
	}
	return bytes.TrimRight(out, "\x00")
}

func TestRadiusAccept(t *testing.T) {
	host, port := fakeRadius(t, "s3cret", "a-long-password-over-16-bytes", true)
	res, err := RadiusAuthenticate(context.Background(), []RadiusServer{{Name: "test", Host: host, Port: port, Secret: "s3cret", Timeout: 2 * time.Second, RequireMessageAuthenticator: true}}, "alice", "a-long-password-over-16-bytes")
	if err != nil {
		t.Fatal(err)
	}
	if !res.Accepted || res.ReplyMessage != "hello" {
		t.Fatalf("unexpected result %+v", res)
	}
}

func TestRadiusReject(t *testing.T) {
	host, port := fakeRadius(t, "s3cret", "right", true)
	res, err := RadiusAuthenticate(context.Background(), []RadiusServer{{Name: "test", Host: host, Port: port, Secret: "s3cret", Timeout: 2 * time.Second}}, "alice", "wrong")
	if err != nil {
		t.Fatal(err)
	}
	if res.Accepted {
		t.Fatal("expected reject")
	}
}

func TestRadiusWrongSecretAndMissingMA(t *testing.T) {
	host, port := fakeRadius(t, "server-secret", "pw", true)
	_, err := RadiusAuthenticate(context.Background(), []RadiusServer{{Name: "test", Host: host, Port: port, Secret: "client-secret", Timeout: 300 * time.Millisecond}}, "alice", "pw")
	if err == nil {
		t.Fatal("response signed with another secret must be rejected")
	}

	host, port = fakeRadius(t, "s", "pw", false)
	_, err = RadiusAuthenticate(context.Background(), []RadiusServer{{Name: "test", Host: host, Port: port, Secret: "s", Timeout: 300 * time.Millisecond, RequireMessageAuthenticator: true}}, "alice", "pw")
	if err == nil {
		t.Fatal("response without Message-Authenticator must be rejected when required")
	}
}
