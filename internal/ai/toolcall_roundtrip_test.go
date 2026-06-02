package ai

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/colnio/project-management-site/internal/testsupport"
)

// TestGetToolCall_PreservesInputJSON is a regression test for a bug where
// getToolCall scanned input_json/output_json into local byte slices but never
// assigned them to the returned record. As a result ToolCallRecord.InputJSON
// stayed nil and ApproveToolCall re-dispatched proposed write tools with
// "null" arguments — e.g. an approved create_iteration failed with
// "title required" despite the proposal carrying a title.
func TestGetToolCall_PreservesInputJSON(t *testing.T) {
	pool := testsupport.NewPool(t)
	stub := NewStubClient(nil)
	svc, sd := newTestService(t, pool, stub)
	ctx := context.Background()

	conv, err := svc.CreateConversation(ctx, sd.Principal, sd.ProjectID, "conv", nil)
	if err != nil {
		t.Fatalf("create conv: %v", err)
	}

	want := `{"title":"E2E Smoke Test Iteration","status":"planned"}`
	rec, err := recordToolCall(ctx, pool, &conv.ID, "create_iteration", json.RawMessage(want), "proposed")
	if err != nil {
		t.Fatalf("record tool call: %v", err)
	}

	got, err := getToolCall(ctx, pool, rec.ID)
	if err != nil {
		t.Fatalf("get tool call: %v", err)
	}
	if got == nil {
		t.Fatal("getToolCall returned nil record")
	}
	if got.InputJSON == nil {
		t.Fatal("InputJSON was dropped (nil) — the stored arguments are lost")
	}

	// ApproveToolCall re-marshals InputJSON before dispatching the tool. The
	// result must equal the originally stored object, not "null".
	marshaled, err := json.Marshal(got.InputJSON)
	if err != nil {
		t.Fatalf("marshal InputJSON: %v", err)
	}
	if string(marshaled) == "null" {
		t.Fatal("InputJSON marshaled to \"null\" — arguments would be lost on approval")
	}

	var gotMap, wantMap map[string]any
	if err := json.Unmarshal(marshaled, &gotMap); err != nil {
		t.Fatalf("unmarshal round-tripped InputJSON: %v", err)
	}
	if err := json.Unmarshal([]byte(want), &wantMap); err != nil {
		t.Fatalf("unmarshal want: %v", err)
	}
	if gotMap["title"] != wantMap["title"] || gotMap["status"] != wantMap["status"] {
		t.Errorf("round-tripped args mismatch: got %s, want %s", marshaled, want)
	}
}
