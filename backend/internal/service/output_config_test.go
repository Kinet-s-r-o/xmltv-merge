package service

import (
	"strings"
	"testing"
	"time"

	"xmltv-merge/internal/models"
	"xmltv-merge/internal/repository"
)

func TestParseOutputConfigsValid(t *testing.T) {
	data := `<?xml version="1.0" encoding="UTF-8"?>
<xmltv-outputs version="1">
  <output>
    <name> Customer A </name>
    <channel source="Provider SK" id="joj.sk">
      <display-name> JOJ </display-name>
      <fields title="true" subtitle="false" description="1" credits="0" categories="false"
              country="false" year="false" episode-num="false" icon="true"/>
    </channel>
    <channel source="Provider CZ" id="ct1.cz"/>
  </output>
  <output>
    <name>Empty feed</name>
  </output>
</xmltv-outputs>`
	configs, err := ParseOutputConfigs([]byte(data))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(configs) != 2 || configs[0].Name != "Customer A" || len(configs[1].Channels) != 0 {
		t.Fatalf("configs = %+v", configs)
	}
	first := configs[0].Channels[0]
	want := OutputChannelConfig{Source: "Provider SK", ChannelID: "joj.sk", DisplayName: "JOJ",
		Fields: OutputFields{Title: true, Description: true, Icon: true}}
	if first != want {
		t.Errorf("channel 1 = %+v, want %+v", first, want)
	}
	if second := configs[0].Channels[1]; second.Fields != AllOutputFields || second.DisplayName != "" {
		t.Errorf("omitted <fields> must default to all fields: %+v", second)
	}
}

func TestParseOutputConfigsFileErrors(t *testing.T) {
	cases := []struct{ name, data, want string }{
		{"empty", "", "empty"},
		{"wrong root", `<xmltv-sources version="1"/>`, "root element must be <xmltv-outputs>"},
		{"missing version", `<xmltv-outputs><output/></xmltv-outputs>`, "missing the version"},
		{"unsupported version", `<xmltv-outputs version="9"><output/></xmltv-outputs>`, "unsupported file version"},
		{"no outputs", `<xmltv-outputs version="1"/>`, "no <output> entries"},
		{"malformed", `<xmltv-outputs version="1"><output>`, "not well-formed"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := ParseOutputConfigs([]byte(tc.data))
			cfgErr := mustConfigError(t, err)
			if !strings.Contains(cfgErr.Error(), tc.want) {
				t.Errorf("error %q does not contain %q", cfgErr.Error(), tc.want)
			}
		})
	}
}

func TestParseOutputConfigsEntryErrors(t *testing.T) {
	data := `<xmltv-outputs version="1">
  <output>
    <channel id="a"/>
  </output>
  <output>
    <name>Feed</name>
    <channel source="S"/>
    <channel source="S" id="x"><fields year="maybe"/></channel>
    <channel source="s" id="x"/>
  </output>
  <output><name>feed</name></output>
  <output><name>Feed!</name></output>
  <output><name>---</name></output>
</xmltv-outputs>`
	_, err := ParseOutputConfigs([]byte(data))
	cfgErr := mustConfigError(t, err)
	joined := strings.Join(cfgErr.Details, "\n")
	for _, want := range []string{
		"output 1: <name> is required",
		`output 1: channel 1 ("a"): source attribute is required`,
		`output 2 ("Feed"): channel 1: id attribute is required`,
		`output 2 ("Feed"): channel 2 ("x"): <fields year> must be true or false, got "maybe"`,
		`output 2 ("Feed"): channel 3 ("x"): listed twice; already used by channel 2`,
		`output 3 ("feed"): duplicate name; already used by output 2`,
		`output 4 ("Feed!"): feed slug "feed" is already used by output 2`,
		`output 5 ("---"): <name> must contain at least one letter or digit`,
	} {
		if !strings.Contains(joined, want) {
			t.Errorf("details missing %q\n got:\n%s", want, joined)
		}
	}
}

func TestMarshalParseOutputRoundTrip(t *testing.T) {
	in := []OutputConfig{
		{Name: "A & B <feed>", Channels: []OutputChannelConfig{
			{Source: "Provider & Co", ChannelID: "joj.sk", DisplayName: "JOJ \"HD\"", Fields: OutputFields{Title: true, Icon: true}},
			{Source: "Č Provider", ChannelID: "ct1", DisplayName: "", Fields: AllOutputFields},
		}},
		{Name: "Empty", Channels: []OutputChannelConfig{}},
	}
	data, err := MarshalOutputConfigs(in, time.Date(2026, 11, 24, 10, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	if !strings.Contains(text, `<xmltv-outputs version="1" exported-at="2026-11-24T10:00:00Z">`) {
		t.Fatalf("unexpected header:\n%s", text)
	}
	if strings.Contains(strings.ToLower(text), "token") {
		t.Fatalf("export must not contain tokens:\n%s", text)
	}
	out, err := ParseOutputConfigs(data)
	if err != nil {
		t.Fatalf("round trip parse failed: %v\n%s", err, text)
	}
	if len(out) != len(in) {
		t.Fatalf("got %d outputs", len(out))
	}
	for i := range in {
		if out[i].Name != in[i].Name || len(out[i].Channels) != len(in[i].Channels) {
			t.Fatalf("output %d = %+v", i, out[i])
		}
		for j := range in[i].Channels {
			if out[i].Channels[j] != in[i].Channels[j] {
				t.Errorf("output %d channel %d = %+v, want %+v", i, j, out[i].Channels[j], in[i].Channels[j])
			}
		}
	}
}

func rec(channelID int, source, ext, display string, f OutputFields) repository.OutputChannelRecord {
	return repository.OutputChannelRecord{OutputChannel: ruleFromConfig(channelID, OutputChannelConfig{DisplayName: display, Fields: f}), SourceName: source, ExternalID: ext}
}

func TestPlanOutputImport(t *testing.T) {
	channelIDs := map[repository.ChannelRef]int{
		{Source: "provider sk", ExternalID: "joj"}:  1,
		{Source: "provider sk", ExternalID: "mark"}: 2,
		{Source: "provider cz", ExternalID: "ct1"}:  3,
	}
	existing := []repository.OutputConfigRecord{
		{ID: 10, Name: "Same", Slug: "same", Channels: []repository.OutputChannelRecord{rec(1, "Provider SK", "joj", "JOJ", AllOutputFields)}},
		{ID: 11, Name: "Changed", Slug: "changed", Channels: []repository.OutputChannelRecord{
			rec(1, "Provider SK", "joj", "JOJ", AllOutputFields),
			rec(2, "Provider SK", "mark", "Markíza", AllOutputFields),
		}},
		{ID: 12, Name: "Reordered", Slug: "reordered", Channels: []repository.OutputChannelRecord{
			rec(1, "Provider SK", "joj", "JOJ", AllOutputFields),
			rec(3, "Provider CZ", "ct1", "ČT1", AllOutputFields),
		}},
		{ID: 13, Name: "Not in file", Slug: "not-in-file"},
	}
	configs := []OutputConfig{
		{Name: "Same", Channels: []OutputChannelConfig{{Source: "PROVIDER SK", ChannelID: "joj", DisplayName: "JOJ", Fields: AllOutputFields}}},
		{Name: "changed", Channels: []OutputChannelConfig{
			{Source: "Provider SK", ChannelID: "joj", DisplayName: "JOJ HD", Fields: AllOutputFields},
			{Source: "Provider CZ", ChannelID: "ct1", DisplayName: "ČT1", Fields: AllOutputFields},
			{Source: "Gone", ChannelID: "x", DisplayName: "X", Fields: AllOutputFields},
		}},
		{Name: "Reordered", Channels: []OutputChannelConfig{
			{Source: "Provider CZ", ChannelID: "ct1", DisplayName: "ČT1", Fields: AllOutputFields},
			{Source: "Provider SK", ChannelID: "joj", DisplayName: "JOJ", Fields: AllOutputFields},
		}},
		{Name: "Brand new", Channels: []OutputChannelConfig{
			{Source: "Provider SK", ChannelID: "mark", DisplayName: "Markíza", Fields: OutputFields{Title: true}},
			{Source: "Provider SK", ChannelID: "missing", DisplayName: "M", Fields: AllOutputFields},
		}},
	}
	plan, err := PlanOutputImport(existing, channelIDs, configs)
	if err != nil {
		t.Fatal(err)
	}
	if plan.Summary != (OutputImportSummary{Create: 1, Update: 2, Unchanged: 1, MissingChannels: 2}) {
		t.Fatalf("summary = %+v", plan.Summary)
	}
	if len(plan.Items) != 4 {
		t.Fatalf("outputs absent from the file must not be planned; got %d items", len(plan.Items))
	}
	same, changed, reordered, created := plan.Items[0], plan.Items[1], plan.Items[2], plan.Items[3]
	if same.Action != OutputImportUnchanged || same.ExistingID != 10 {
		t.Errorf("same = %+v", same)
	}
	if changed.Action != OutputImportUpdate || strings.Join(changed.Changes, ",") != "name,channels,rules" ||
		changed.ChannelsAdded != 1 || changed.ChannelsRemoved != 1 || changed.ChannelsChanged != 1 || changed.ChannelCount != 2 {
		t.Errorf("changed = %+v", changed)
	}
	if len(changed.MissingChannels) != 1 || changed.MissingChannels[0] != (MissingChannel{Source: "Gone", ID: "x"}) {
		t.Errorf("missing = %+v", changed.MissingChannels)
	}
	if reordered.Action != OutputImportUpdate || strings.Join(reordered.Changes, ",") != "order" {
		t.Errorf("reordered = %+v", reordered)
	}
	if created.Action != OutputImportCreate || created.Slug != "brand-new" || created.ChannelCount != 1 || created.ChannelsAdded != 1 {
		t.Errorf("created = %+v", created)
	}

	writes := outputWrites(plan.Items)
	if len(writes) != 3 {
		t.Fatalf("unchanged outputs must not be written; got %d writes", len(writes))
	}
	if !writes[0].Rename || !writes[0].ReplaceChannels || writes[0].ExistingID != 11 || len(writes[0].Channels) != 2 {
		t.Errorf("update write = %+v", writes[0])
	}
	if writes[1].Rename || !writes[1].ReplaceChannels || writes[1].Channels[0].ChannelID != 3 {
		t.Errorf("reorder write = %+v", writes[1])
	}
	if writes[2].ExistingID != 0 || writes[2].Channels[0] != (models.OutputChannel{ChannelID: 2, DisplayName: "Markíza", IncludeTitle: true}) {
		t.Errorf("create write = %+v", writes[2])
	}
}

func TestPlanOutputImportSlugConflict(t *testing.T) {
	existing := []repository.OutputConfigRecord{{ID: 1, Name: "Customer-A", Slug: "customer-a"}}
	_, err := PlanOutputImport(existing, nil, []OutputConfig{{Name: "Customer A"}})
	cfgErr := mustConfigError(t, err)
	if !strings.Contains(strings.Join(cfgErr.Details, "\n"), `feed slug "customer-a" is already used by existing output "Customer-A"`) {
		t.Errorf("details = %v", cfgErr.Details)
	}
}
