// Package auth holds the self-contained security primitives used by user
// authentication: password hashing, TOTP, secret encryption, the RADIUS
// client and the permission model. It has no database or HTTP dependencies.
package auth

import (
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"unicode/utf8"
)

const (
	passwordScheme     = "pbkdf2-sha256"
	passwordIterations = 600_000
	passwordSaltBytes  = 16
	passwordKeyBytes   = 32

	MinPasswordLength = 10
	MaxPasswordLength = 256
)

// ValidatePassword enforces the local password policy.
func ValidatePassword(password string) error {
	n := utf8.RuneCountInString(password)
	if n < MinPasswordLength {
		return fmt.Errorf("password must have at least %d characters", MinPasswordLength)
	}
	if len(password) > MaxPasswordLength {
		return fmt.Errorf("password must have at most %d bytes", MaxPasswordLength)
	}
	if strings.TrimSpace(password) == "" {
		return errors.New("password must not be blank")
	}
	return nil
}

// HashPassword returns an encoded PBKDF2-HMAC-SHA256 hash with a random salt:
// "pbkdf2-sha256$<iterations>$<salt>$<key>" (raw URL-safe base64).
func HashPassword(password string) (string, error) {
	salt := make([]byte, passwordSaltBytes)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key, err := pbkdf2.Key(sha256.New, password, salt, passwordIterations, passwordKeyBytes)
	if err != nil {
		return "", err
	}
	enc := base64.RawURLEncoding
	return fmt.Sprintf("%s$%d$%s$%s", passwordScheme, passwordIterations, enc.EncodeToString(salt), enc.EncodeToString(key)), nil
}

// dummyHash is verified against for unknown users so that response time does
// not reveal whether an account exists.
var dummyHash = func() string {
	h, _ := HashPassword("dummy-password-for-timing")
	return h
}()

// VerifyPassword reports whether password matches the encoded hash. An empty
// or malformed hash never matches, but still costs one key derivation.
func VerifyPassword(encoded, password string) bool {
	ok, wellFormed := verifyEncoded(encoded, password)
	if !wellFormed {
		verifyEncoded(dummyHash, password)
		return false
	}
	return ok
}

func verifyEncoded(encoded, password string) (ok, wellFormed bool) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 4 || parts[0] != passwordScheme {
		return false, false
	}
	iterations, err := strconv.Atoi(parts[1])
	if err != nil || iterations < 1 || iterations > 10_000_000 {
		return false, false
	}
	enc := base64.RawURLEncoding
	salt, err := enc.DecodeString(parts[2])
	if err != nil {
		return false, false
	}
	want, err := enc.DecodeString(parts[3])
	if err != nil || len(want) == 0 {
		return false, false
	}
	got, err := pbkdf2.Key(sha256.New, password, salt, iterations, len(want))
	if err != nil {
		return false, false
	}
	return subtle.ConstantTimeCompare(got, want) == 1, true
}

// BurnPasswordCheck spends the same time as a failed password verification.
func BurnPasswordCheck(password string) {
	_ = VerifyPassword("", password)
}

// RandomToken returns n random bytes encoded as lowercase hex.
func RandomToken(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	const hexdigits = "0123456789abcdef"
	out := make([]byte, n*2)
	for i, v := range b {
		out[i*2] = hexdigits[v>>4]
		out[i*2+1] = hexdigits[v&0x0f]
	}
	return string(out), nil
}

// HashToken returns the hex SHA-256 of a session token; only hashes are stored.
func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	const hexdigits = "0123456789abcdef"
	out := make([]byte, len(sum)*2)
	for i, v := range sum {
		out[i*2] = hexdigits[v>>4]
		out[i*2+1] = hexdigits[v&0x0f]
	}
	return string(out)
}
