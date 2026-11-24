package models

import (
	"time"

	"xmltv-merge/internal/auth"
)

// User auth types.
const (
	AuthTypeLocal  = "local"
	AuthTypeRemote = "remote"
)

// User is an application account. Local users authenticate with a stored
// password hash; remote users are verified against the RADIUS servers.
type User struct {
	ID           int        `json:"id"`
	Username     string     `json:"username"`
	DisplayName  string     `json:"display_name"`
	Email        string     `json:"email"`
	AuthType     string     `json:"auth_type"`
	RoleID       int        `json:"role_id"`
	RoleName     string     `json:"role_name"`
	Enabled      bool       `json:"enabled"`
	TOTPRequired bool       `json:"totp_required"`
	TOTPEnabled  bool       `json:"totp_enabled"`
	LockedUntil  *time.Time `json:"locked_until,omitempty"`
	LastLoginAt  *time.Time `json:"last_login_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`

	PasswordHash string `json:"-"`
	TOTPSecret   string `json:"-"`
	TOTPLastStep int64  `json:"-"`
	FailedLogins int    `json:"-"`
}

// Role is a named set of section permissions.
type Role struct {
	ID          int              `json:"id"`
	Name        string           `json:"name"`
	Description string           `json:"description"`
	Builtin     bool             `json:"builtin"`
	UserCount   int              `json:"user_count"`
	Permissions auth.Permissions `json:"permissions"`
	CreatedAt   time.Time        `json:"created_at"`
	UpdatedAt   time.Time        `json:"updated_at"`
}

// RadiusServer is a configured RADIUS authentication server. The shared
// secret is never serialized; HasSecret tells the UI whether one is stored.
type RadiusServer struct {
	ID                          int       `json:"id"`
	Name                        string    `json:"name"`
	Host                        string    `json:"host"`
	Port                        int       `json:"port"`
	HasSecret                   bool      `json:"has_secret"`
	TimeoutSeconds              int       `json:"timeout_seconds"`
	Retries                     int       `json:"retries"`
	NASIdentifier               string    `json:"nas_identifier"`
	Priority                    int       `json:"priority"`
	RequireMessageAuthenticator bool      `json:"require_message_authenticator"`
	Enabled                     bool      `json:"enabled"`
	CreatedAt                   time.Time `json:"created_at"`
	UpdatedAt                   time.Time `json:"updated_at"`

	Secret string `json:"-"`
}

// Session is a signed-in browser session; only the token hash is stored.
type Session struct {
	TokenHash  string
	UserID     int
	CSRFToken  string
	CreatedAt  time.Time
	LastSeenAt time.Time
	ExpiresAt  time.Time
}
