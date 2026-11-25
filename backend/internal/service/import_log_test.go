package service

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"xmltv-merge/internal/parser"
)

func TestImportRunCapsStoredIssuesButCountsAll(t *testing.T) {
	run := &importRun{}
	for i := 0; i < maxLoggedIssues+25; i++ {
		run.issue("issue %d", i)
	}
	if run.entry.IssueCount != maxLoggedIssues+25 {
		t.Fatalf("issue count = %d, want %d", run.entry.IssueCount, maxLoggedIssues+25)
	}
	if len(run.entry.Issues) != maxLoggedIssues {
		t.Fatalf("stored issues = %d, want %d", len(run.entry.Issues), maxLoggedIssues)
	}
}

func TestImportRunProblemsMarkPartialImport(t *testing.T) {
	run := &importRun{}
	run.entry.ProgrammesInvalid = 1
	run.entry.ProgrammesUnknownChannel = 2
	run.entry.ProgrammesFailed = 3
	run.entry.DetailErrors = 4
	run.entry.ProgrammesPast = 50 // past programmes are expected, not problems
	if got := run.problems(); got != 10 {
		t.Fatalf("problems = %d, want 10", got)
	}
}

func TestDescribeImportErrorNamesTimeoutAndStage(t *testing.T) {
	err := fmt.Errorf("stopped after storing 12 programmes: %w", context.DeadlineExceeded)
	got := describeImportError(err, StageProgrammes)
	if !strings.Contains(got, "timed out") || !strings.Contains(got, "programmes stage") || !strings.Contains(got, "12 programmes") {
		t.Fatalf("unexpected description: %q", got)
	}
}

func TestParserReportsInvalidProgrammes(t *testing.T) {
	xml := `<tv>
<channel id="a"><display-name>A</display-name></channel>
<programme channel="a" start="20260101100000 +0000" stop="20260101110000 +0000"><title>Ok</title></programme>
<programme channel="a" start="not-a-time" stop="20260101120000 +0000"><title>Bad</title></programme>
</tv>`
	result, err := parser.ParseXML([]byte(xml))
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Programmes) != 1 || len(result.Invalid) != 1 {
		t.Fatalf("programmes=%d invalid=%d, want 1 and 1", len(result.Programmes), len(result.Invalid))
	}
	bad := result.Invalid[0]
	if bad.Channel != "a" || bad.Start != "not-a-time" || !strings.Contains(bad.Reason, "start time") {
		t.Fatalf("unexpected invalid programme: %+v", bad)
	}
}
