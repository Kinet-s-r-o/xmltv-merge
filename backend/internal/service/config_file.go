package service

import (
	"bytes"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"strings"
)

// Shared helpers for the versioned XML configuration files (sources, outputs).

// ConfigFileError reports why a configuration file cannot be imported.
// Details lists every problem found, one line each.
type ConfigFileError struct {
	Message string
	Details []string
}

func (e *ConfigFileError) Error() string {
	if len(e.Details) == 0 {
		return e.Message
	}
	return e.Message + ": " + strings.Join(e.Details, "; ")
}

// IsConfigFileError reports whether err is a validation problem with the file.
func IsConfigFileError(err error) (*ConfigFileError, bool) {
	var cfgErr *ConfigFileError
	ok := errors.As(err, &cfgErr)
	return cfgErr, ok
}

// ReadConfigFile reads at most limit bytes from r.
func ReadConfigFile(r io.Reader, limit int64) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(r, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, &ConfigFileError{Message: fmt.Sprintf("the file exceeds the %d MB limit for this configuration", limit>>20)}
	}
	return data, nil
}

// decodeConfigFile checks that data is well-formed XML with the expected root
// element and a supported version attribute, then decodes it into v.
// It returns the trimmed version found in the file.
func decodeConfigFile(data []byte, root, version string, v interface{}, versionOf func() string) error {
	data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
	if len(bytes.TrimSpace(data)) == 0 {
		return &ConfigFileError{Message: "the file is empty"}
	}
	var probe struct{ XMLName xml.Name }
	if err := xml.Unmarshal(data, &probe); err != nil {
		detail := err.Error()
		if errors.Is(err, io.EOF) {
			detail = "no XML element found"
		}
		return &ConfigFileError{Message: "the file is not well-formed XML", Details: []string{detail}}
	}
	if probe.XMLName.Local != root {
		return &ConfigFileError{Message: fmt.Sprintf("root element must be <%s>, found <%s>", root, probe.XMLName.Local)}
	}
	if err := xml.Unmarshal(data, v); err != nil {
		return &ConfigFileError{Message: fmt.Sprintf("the file is not a valid <%s> configuration", root), Details: []string{err.Error()}}
	}
	found := strings.TrimSpace(versionOf())
	if found == "" {
		return &ConfigFileError{Message: fmt.Sprintf("<%s> is missing the version attribute (expected version=\"%s\")", root, version)}
	}
	if found != version {
		return &ConfigFileError{Message: fmt.Sprintf("unsupported file version %q (supported: %s)", found, version)}
	}
	return nil
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// parseConfigBool accepts true/false/1/0 (case-insensitive); nil yields def.
func parseConfigBool(raw *string, def bool) (bool, bool) {
	if raw == nil {
		return def, true
	}
	switch strings.ToLower(strings.TrimSpace(*raw)) {
	case "true", "1":
		return true, true
	case "false", "0":
		return false, true
	}
	return false, false
}
