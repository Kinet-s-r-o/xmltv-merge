package config

import (
	"os"
	"strings"
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
}

func Load() *Config {
	return &Config{
		DatabaseURL: getEnv("DATABASE_URL", "postgres://xmltv:xmltv_secret@localhost:5432/xmltv?sslmode=disable"),
		Port:        getEnv("PORT", "8080"),

		MulticastEnabled:   getBool("MULTICAST_ENABLED"),
		MulticastInterface: strings.TrimSpace(os.Getenv("MULTICAST_INTERFACE")),
		MulticastLoopback:  getBool("MULTICAST_LOOPBACK"),
	}
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
