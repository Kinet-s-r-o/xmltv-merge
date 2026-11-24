package auth

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strings"
)

const sealedPrefix = "enc:v1:"

// SecretBox encrypts secrets that must be recoverable (RADIUS shared secrets,
// TOTP seeds) with AES-256-GCM. Without a key it stores values unchanged so
// existing deployments keep working; Open always accepts both forms.
type SecretBox struct {
	aead cipher.AEAD
}

// NewSecretBox derives the AES key from passphrase with SHA-256. An empty
// passphrase returns a box that does not encrypt.
func NewSecretBox(passphrase string) (*SecretBox, error) {
	if passphrase == "" {
		return &SecretBox{}, nil
	}
	key := sha256.Sum256([]byte(passphrase))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &SecretBox{aead: aead}, nil
}

// Encrypting reports whether values are sealed at rest.
func (b *SecretBox) Encrypting() bool { return b != nil && b.aead != nil }

// Seal returns the stored form of plaintext.
func (b *SecretBox) Seal(plaintext string) (string, error) {
	if plaintext == "" || !b.Encrypting() {
		return plaintext, nil
	}
	nonce := make([]byte, b.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	out := b.aead.Seal(nonce, nonce, []byte(plaintext), nil)
	return sealedPrefix + base64.RawStdEncoding.EncodeToString(out), nil
}

// Open returns the plaintext of a stored value.
func (b *SecretBox) Open(stored string) (string, error) {
	if !strings.HasPrefix(stored, sealedPrefix) {
		return stored, nil
	}
	if !b.Encrypting() {
		return "", errors.New("value is encrypted but AUTH_SECRET_KEY is not set")
	}
	raw, err := base64.RawStdEncoding.DecodeString(strings.TrimPrefix(stored, sealedPrefix))
	if err != nil {
		return "", err
	}
	n := b.aead.NonceSize()
	if len(raw) < n {
		return "", errors.New("encrypted value is truncated")
	}
	plain, err := b.aead.Open(nil, raw[:n], raw[n:], nil)
	if err != nil {
		return "", errors.New("encrypted value cannot be decrypted with the configured AUTH_SECRET_KEY")
	}
	return string(plain), nil
}
