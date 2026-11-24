package service

import (
	"strings"
	"testing"
	"time"

	"xmltv-merge/internal/models"
	"xmltv-merge/internal/repository"
)

func intp(v int) *int { return &v }

func sampleMulticastOutput() models.MulticastOutput {
	return models.MulticastOutput{
		Name:             "Kablovka_new",
		Description:      "EPG pre CATV",
		MulticastAddress: "233.11.22.241",
		MulticastPort:    1234,
		Services: []models.MulticastService{
			{ChannelID: intp(1), SourceName: "EPG - kinet.sk", ExternalID: "Jednotka", DisplayName: "Jednotka HD", Frequency: intp(306), TransportStreamID: 1001, OriginalNetworkID: 1, ServiceID: 20, Enabled: true},
			{ChannelID: intp(2), SourceName: "EPG - kinet.sk", ExternalID: "Markiza", DisplayName: "Markiza HD", Frequency: intp(314), TransportStreamID: 1002, OriginalNetworkID: 1, ServiceID: 100, Enabled: true},
		},
	}
}

func TestValidateMulticastOutputDefaults(t *testing.T) {
	o := sampleMulticastOutput()
	if err := ValidateMulticastOutput(&o); err != nil {
		t.Fatal(err)
	}
	if o.PID != 18 || o.ChunkSeconds != 30 || o.DaysAhead != 4 || o.Timezone != "Europe/Bratislava" ||
		o.TextEncoding != "utf8" || o.LanguageCode != "slk" || o.TableMode != "actual" || o.TTL != 16 {
		t.Fatalf("defaults not applied: %+v", o)
	}
}

func TestValidateMulticastOutputErrors(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(*models.MulticastOutput)
		want   string
	}{
		{"name", func(o *models.MulticastOutput) { o.Name = " " }, "name is required"},
		{"unicast", func(o *models.MulticastOutput) { o.MulticastAddress = "10.0.0.1" }, "224.0.0.0/4"},
		{"link-local", func(o *models.MulticastOutput) { o.MulticastAddress = "224.0.0.5" }, "reserved"},
		{"port", func(o *models.MulticastOutput) { o.MulticastPort = 70000 }, "port"},
		{"pid", func(o *models.MulticastOutput) { o.PID = 8191 }, "PID"},
		{"pid tdt", func(o *models.MulticastOutput) { o.PID = 20; o.IncludeTDTTOT = true }, "TDT/TOT"},
		{"chunk", func(o *models.MulticastOutput) { o.ChunkSeconds = 1 }, "chunk"},
		{"days", func(o *models.MulticastOutput) { o.DaysAhead = 17 }, "days ahead"},
		{"encoding", func(o *models.MulticastOutput) { o.TextEncoding = "latin1" }, "encoding"},
		{"language", func(o *models.MulticastOutput) { o.LanguageCode = "sk" }, "language"},
		{"timezone", func(o *models.MulticastOutput) { o.Timezone = "Mars/Base" }, "timezone"},
		{"mode", func(o *models.MulticastOutput) { o.TableMode = "actual_other" }, "home transport"},
		{"sid", func(o *models.MulticastOutput) { o.Services[0].ServiceID = 0 }, "service id"},
		{"tsid", func(o *models.MulticastOutput) { o.Services[0].TransportStreamID = 70000 }, "transport stream id"},
		{"duplicate", func(o *models.MulticastOutput) { o.Services[1].TransportStreamID = 1001; o.Services[1].ServiceID = 20 }, "same network"},
		{"no channel", func(o *models.MulticastOutput) { o.Services[0].ChannelID = nil; o.Services[0].ExternalID = "" }, "no channel"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			o := sampleMulticastOutput()
			tc.mutate(&o)
			err := ValidateMulticastOutput(&o)
			if err == nil || !IsValidation(err) || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("err = %v, want validation error containing %q", err, tc.want)
			}
		})
	}
}

func TestMulticastConfigRoundTrip(t *testing.T) {
	o := sampleMulticastOutput()
	if err := ValidateMulticastOutput(&o); err != nil {
		t.Fatal(err)
	}
	o.IncludeTDTTOT = true
	o.TableMode = "actual_other"
	o.HomeTransportStreamID = intp(1001)
	data, err := MarshalMulticastConfigs([]models.MulticastOutput{o}, time.Date(2026, 11, 24, 10, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "enabled=\"true\" ") && strings.Contains(string(data), "<output enabled") {
		t.Fatal("output on/off state must not be exported")
	}
	parsed, err := ParseMulticastConfigs(data)
	if err != nil {
		t.Fatal(err)
	}
	got := parsed[0]
	if changes := multicastChanges(o, got); len(changes) != 0 {
		t.Fatalf("round trip changed %v\n%s", changes, data)
	}
	if got.Services[0].ChannelID != nil {
		t.Fatal("parsed services must not carry database ids")
	}
}

func TestParseMulticastConfigsErrors(t *testing.T) {
	cases := map[string]string{
		"wrong root":   `<multicast version="1"/>`,
		"version":      `<multicast-outputs version="2"><output/></multicast-outputs>`,
		"empty":        `<multicast-outputs version="1"></multicast-outputs>`,
		"no multicast": `<multicast-outputs version="1"><output><name>A</name></output></multicast-outputs>`,
		"bad sid":      `<multicast-outputs version="1"><output><name>A</name><multicast address="233.1.1.1" port="1234"/><service source="S" id="x" tsid="1" sid="abc"/></output></multicast-outputs>`,
		"duplicate": `<multicast-outputs version="1"><output><name>A</name><multicast address="233.1.1.1" port="1234"/></output>` +
			`<output><name>a</name><multicast address="233.1.1.2" port="1234"/></output></multicast-outputs>`,
	}
	for name, doc := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := ParseMulticastConfigs([]byte(doc)); err == nil {
				t.Fatal("expected error")
			} else if _, ok := IsConfigFileError(err); !ok {
				t.Fatalf("err = %T %v, want ConfigFileError", err, err)
			}
		})
	}
}

func TestPlanMulticastImport(t *testing.T) {
	existing := sampleMulticastOutput()
	if err := ValidateMulticastOutput(&existing); err != nil {
		t.Fatal(err)
	}
	existing.ID = 7
	existing.Enabled = true
	other := sampleMulticastOutput()
	other.ID, other.Name, other.Enabled, other.MulticastPort = 8, "Other", true, 5000
	ValidateMulticastOutput(&other)

	refs := map[repository.ChannelRef]int{{Source: "epg - kinet.sk", ExternalID: "Jednotka"}: 1}
	same := existing
	same.ID, same.Enabled = 0, false
	same.Services = append([]models.MulticastService(nil), existing.Services...)
	for i := range same.Services {
		same.Services[i].ChannelID = nil
	}
	created := sampleMulticastOutput()
	created.Name = "New"
	created.Enabled = true
	ValidateMulticastOutput(&created)
	for i := range created.Services {
		created.Services[i].ChannelID = nil
	}

	plan, err := PlanMulticastImport([]models.MulticastOutput{existing, other}, refs, []models.MulticastOutput{same, created})
	if err != nil {
		t.Fatal(err)
	}
	if plan.Items[0].Action != OutputImportUnchanged || plan.Items[0].output.Enabled != true || plan.Items[0].ExistingID != 7 {
		t.Fatalf("existing item = %+v", plan.Items[0])
	}
	if plan.Items[1].Action != OutputImportCreate || plan.Items[1].output.Enabled {
		t.Fatalf("new outputs must be created disabled: %+v", plan.Items[1])
	}
	if plan.Summary.MissingChannels != 2 || plan.Items[1].output.Services[0].ChannelID == nil {
		t.Fatalf("missing channels = %d", plan.Summary.MissingChannels)
	}

	// Moving an enabled output onto another enabled output's group conflicts.
	moved := same
	moved.MulticastPort = 5000
	if _, err := PlanMulticastImport([]models.MulticastOutput{existing, other}, refs, []models.MulticastOutput{moved}); err == nil {
		t.Fatal("expected address conflict")
	}
}
