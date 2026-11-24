package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	DatabaseURL string
	Port        string
	// MulticastEnabled allows the backend to send multicast EIT streams.
	MulticastEnabled bool
	// MulticastInterface is the default outgoing interface (name or IPv4).
	MulticastInterface string
	// MulticastLoopback delivers sent multicast to local listeners too.
	MulticastLoopback bool

	// AuthSecretKey encrypts RADIUS shared secrets and TOTP seeds at rest.
	AuthSecretKey string
	// AuthCookieSecure is auto (HTTPS detection), true or false.
	AuthCookieSecure string
	// AuthTrustProxyHeaders takes the client address from X-Real-IP / X-Forwarded-For.
	AuthTrustProxyHeaders bool
	AuthSessionIdle       time.Duration
	AuthSessionMax        time.Duration
	AuthLockAfter         int
	AuthLockFor           time.Duration
	// AdminUsername/AdminPassword create the first administrator when no user exists.
	AdminUsername string
	AdminPassword string
	// CORSAllowedOrigins lists extra origins allowed to call the API with
	// credentials; empty means same-origin only.
	CORSAllowedOrigins []string
}

func Load() *Config {
	return &Config{
		DatabaseURL: getEnv("DATABASE_URL", "postgres://xmltv:xmltv_secret@localhost:5432/xmltv?sslmode=disable"),
		Port:        getEnv("PORT", "8080"),

		MulticastEnabled:   getBool("MULTICAST_ENABLED"),
		MulticastInterface: strings.TrimSpace(os.Getenv("MULTICAST_INTERFACE")),
		MulticastLoopback:  getBool("MULTICAST_LOOPBACK"),

		AuthSecretKey:         os.Getenv("AUTH_SECRET_KEY"),
		AuthCookieSecure:      getEnv("AUTH_COOKIE_SECURE", "auto"),
		AuthTrustProxyHeaders: getEnv("AUTH_TRUST_PROXY_HEADERS", "true") != "false",
		AuthSessionIdle:       time.Duration(getInt("AUTH_SESSION_IDLE_MINUTES", 480)) * time.Minute,
		AuthSessionMax:        time.Duration(getInt("AUTH_SESSION_MAX_HOURS", 168)) * time.Hour,
		AuthLockAfter:         getInt("AUTH_LOCKOUT_THRESHOLD", 5),
		AuthLockFor:           time.Duration(getInt("AUTH_LOCKOUT_MINUTES", 15)) * time.Minute,
		AdminUsername:         strings.TrimSpace(os.Getenv("ADMIN_USERNAME")),
		AdminPassword:         os.Getenv("ADMIN_PASSWORD"),
		CORSAllowedOrigins:    getList("CORS_ALLOWED_ORIGINS"),
	}
}

func getInt(key string, defaultVal int) int {
	if v, err := strconv.Atoi(strings.TrimSpace(os.Getenv(key))); err == nil && v > 0 {
		return v
	}
	return defaultVal
}

func getList(key string) []string {
	var out []string
	for _, part := range strings.Split(os.Getenv(key), ",") {
		if part = strings.TrimSpace(part); part != "" {
			out = append(out, part)
		}
	}
	return out
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func getBool(key string) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(key))) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}
