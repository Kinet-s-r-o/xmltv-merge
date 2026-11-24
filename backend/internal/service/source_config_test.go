package service

import (
	"strings"
	"testing"
	"time"

	"xmltv-merge/internal/models"
)

func mustConfigError(t *testing.T, err error) *SourceConfigError {
	t.Helper()
	if err == nil {
		t.Fatal("expected an error, got nil")
	}
	cfgErr, ok := IsSourceConfigError(err)
	if !ok {
		t.Fatalf("expected *SourceConfigError, got %T: %v", err, err)
	}
	return cfgErr
}

func TestParseSourceConfigsValid(t *testing.T) {
	data := "\xef\xbb\xbf" + `<?xml version="1.0" encoding="UTF-8"?>
<xmltv-sources version="1">
  <source enabled="false">
    <name>  Provider SK  </name>
    <url>https://provider.example/epg.xml.gz</url>
    <refresh-interval-hours>6</refresh-interval-hours>
    <history-days>7</history-days>
  </source>
  <source>
    <name>Second</name>
    <url>http://other.example/guide.xml</url>
    <refresh-interval-hours>168</refresh-interval-hours>
    <history-days>3650</history-days>
    <unknown-element>ignored</unknown-element>
  </source>
</xmltv-sources>`
	configs, err := ParseSourceConfigs([]byte(data))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := []SourceConfig{
		{Name: "Provider SK", URL: "https://provider.example/epg.xml.gz", Enabled: false, RefreshIntervalHours: 6, HistoryDays: 7},
		{Name: "Second", URL: "http://other.example/guide.xml", Enabled: true, RefreshIntervalHours: 168, HistoryDays: 3650},
	}
	if len(configs) != len(want) {
		t.Fatalf("got %d configs, want %d", len(configs), len(want))
	}
	for i := range want {
		if configs[i] != want[i] {
			t.Errorf("config %d = %+v, want %+v", i, configs[i], want[i])
		}
	}
}

func TestParseSourceConfigsFileErrors(t *testing.T) {
	cases := []struct {
		name, data, want string
	}{
		{"empty", "   ", "empty"},
		{"malformed", "<xmltv-sources version=\"1\"><source>", "not well-formed"},
		{"plain text", "nope", "no XML element found"},
		{"wrong root", `<tv><channel id="a"/></tv>`, "root element must be <xmltv-sources>"},
		{"missing version", `<xmltv-sources><source/></xmltv-sources>`, "missing the version"},
		{"unsupported version", `<xmltv-sources version="2"><source/></xmltv-sources>`, "unsupported file version"},
		{"no sources", `<xmltv-sources version="1"></xmltv-sources>`, "no <source> entries"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := ParseSourceConfigs([]byte(tc.data))
			cfgErr := mustConfigError(t, err)
			if !strings.Contains(cfgErr.Error(), tc.want) {
				t.Errorf("error %q does not contain %q", cfgErr.Error(), tc.want)
			}
		})
	}
}

func TestParseSourceConfigsEntryErrors(t *testing.T) {
	data := `<xmltv-sources version="1">
  <source>
    <url>https://ok.example/a.xml</url>
    <refresh-interval-hours>6</refresh-interval-hours>
    <history-days>7</history-days>
  </source>
  <source enabled="maybe">
    <name>Bad values</name>
    <url>ftp://files.example/epg.xml</url>
    <refresh-interval-hours>0</refresh-interval-hours>
    <history-days>3651</history-days>
  </source>
  <source>
    <name>Not numbers</name>
    <url>not a url</url>
    <refresh-interval-hours>six</refresh-interval-hours>
  </source>
  <source>
    <name>Dup</name>
    <url>https://a.example/x.xml</url>
    <refresh-interval-hours>1</refresh-interval-hours>
    <history-days>1</history-days>
  </source>
  <source>
    <name>dup</name>
    <url>https://b.example/x.xml</url>
    <refresh-interval-hours>169</refresh-interval-hours>
    <history-days>1</history-days>
  </source>
</xmltv-sources>`
	_, err := ParseSourceConfigs([]byte(data))
	cfgErr := mustConfigError(t, err)
	joined := strings.Join(cfgErr.Details, "\n")
	for _, want := range []string{
		"source 1: <name> is required",
		`source 2 ("Bad values"): enabled attribute must be true or false`,
		`source 2 ("Bad values"): <url> must be a valid HTTP or HTTPS URL`,
		`source 2 ("Bad values"): <refresh-interval-hours> must be between 1 and 168 hours, got 0`,
		`source 2 ("Bad values"): <history-days> must be between 1 and 3650 days, got 3651`,
		`source 3 ("Not numbers"): <url> must be a valid HTTP or HTTPS URL`,
		`source 3 ("Not numbers"): <refresh-interval-hours> must be a whole number`,
		`source 3 ("Not numbers"): <history-days> is required`,
		`source 5 ("dup"): duplicate name; already used by source 4`,
		`source 5 ("dup"): <refresh-interval-hours> must be between 1 and 168 hours, got 169`,
	} {
		if !strings.Contains(joined, want) {
			t.Errorf("details missing %q\n got:\n%s", want, joined)
		}
	}
	if !strings.Contains(cfgErr.Message, "nothing was imported") {
		t.Errorf("message %q should say nothing was imported", cfgErr.Message)
	}
}

func TestMarshalParseRoundTrip(t *testing.T) {
	in := []SourceConfig{
		{Name: "A & B <SK>", URL: "https://a.example/epg.xml?x=1&y=2", Enabled: true, RefreshIntervalHours: 12, HistoryDays: 30},
		{Name: "Č TV", URL: "http://c.example/c.xml", Enabled: false, RefreshIntervalHours: 1, HistoryDays: 1},
	}
	data, err := MarshalSourceConfigs(in, time.Date(2026, 11, 24, 10, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	if !strings.HasPrefix(text, "<?xml") || !strings.Contains(text, `<xmltv-sources version="1" exported-at="2026-11-24T10:00:00Z">`) {
		t.Fatalf("unexpected header:\n%s", text)
	}
	out, err := ParseSourceConfigs(data)
	if err != nil {
		t.Fatalf("round trip parse failed: %v\n%s", err, text)
	}
	for i := range in {
		if out[i] != in[i] {
			t.Errorf("round trip %d = %+v, want %+v", i, out[i], in[i])
		}
	}
}

func TestMarshalEmptyExportIsParsableShape(t *testing.T) {
	data, err := MarshalSourceConfigs(nil, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), `<xmltv-sources version="1"`) {
		t.Fatalf("unexpected empty export: %s", data)
	}
}

func TestSourceToConfigRoundsInterval(t *testing.T) {
	cases := map[int]int{360: 6, 90: 2, 5: 1, 20000: 168}
	for minutes, wantHours := range cases {
		got := SourceToConfig(models.Source{RefreshIntervalMinutes: minutes}).RefreshIntervalHours
		if got != wantHours {
			t.Errorf("%d minutes -> %d hours, want %d", minutes, got, wantHours)
		}
	}
}

func TestPlanSourceImport(t *testing.T) {
	existing := []models.Source{
		{ID: 1, Name: "Same", SourceURL: "https://same.example/x.xml", Enabled: true, RefreshIntervalMinutes: 360, HistoryDays: 7},
		{ID: 2, Name: "Changed", SourceURL: "https://old.example/x.xml", Enabled: true, RefreshIntervalMinutes: 360, HistoryDays: 7},
		{ID: 3, Name: "Untouched", SourceURL: "https://keep.example/x.xml", Enabled: true, RefreshIntervalMinutes: 60, HistoryDays: 1},
	}
	configs := []SourceConfig{
		{Name: "Same", URL: "https://same.example/x.xml", Enabled: true, RefreshIntervalHours: 6, HistoryDays: 7},
		{Name: "changed", URL: "https://new.example/x.xml", Enabled: false, RefreshIntervalHours: 6, HistoryDays: 14},
		{Name: "Brand new", URL: "https://new.example/n.xml", Enabled: true, RefreshIntervalHours: 24, HistoryDays: 7},
	}
	plan := PlanSourceImport(existing, configs)
	if plan.Summary != (SourceImportSummary{Create: 1, Update: 1, Unchanged: 1}) {
		t.Fatalf("summary = %+v", plan.Summary)
	}
	if len(plan.Items) != 3 {
		t.Fatalf("got %d items; existing sources absent from the file must not be planned", len(plan.Items))
	}
	if plan.Items[0].Action != SourceImportUnchanged || plan.Items[0].ExistingID != 1 || len(plan.Items[0].Changes) != 0 {
		t.Errorf("item 0 = %+v", plan.Items[0])
	}
	updated := plan.Items[1]
	if updated.Action != SourceImportUpdate || updated.ExistingID != 2 {
		t.Errorf("item 1 = %+v", updated)
	}
	if got := strings.Join(updated.Changes, ","); got != "name,url,enabled,history_days" {
		t.Errorf("changes = %s", got)
	}
	if plan.Items[2].Action != SourceImportCreate || plan.Items[2].ExistingID != 0 || plan.Items[2].RefreshIntervalMinutes != 1440 {
		t.Errorf("item 2 = %+v", plan.Items[2])
	}

	repoItems := toRepoItems(plan.Items)
	if len(repoItems) != 2 {
		t.Fatalf("unchanged items must not be written; got %d repo items", len(repoItems))
	}
	if !repoItems[0].ConfigChanged || !repoItems[0].EnabledChanged {
		t.Errorf("update flags = %+v", repoItems[0])
	}
}

func TestPlanEnabledOnlyChangeKeepsImportStatus(t *testing.T) {
	existing := []models.Source{{ID: 9, Name: "S", SourceURL: "https://s.example/x.xml", Enabled: true, RefreshIntervalMinutes: 60, HistoryDays: 7}}
	plan := PlanSourceImport(existing, []SourceConfig{{Name: "S", URL: "https://s.example/x.xml", Enabled: false, RefreshIntervalHours: 1, HistoryDays: 7}})
	items := toRepoItems(plan.Items)
	if len(items) != 1 || items[0].ConfigChanged || !items[0].EnabledChanged {
		t.Fatalf("enabled-only change must not reset import status: %+v", items)
	}
}
