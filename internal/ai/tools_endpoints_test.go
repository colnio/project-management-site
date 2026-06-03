package ai

// tools_endpoints_test.go — table-driven tests for dispatchTool and the
// scope-coverage guard for internalAIScopes.
//
// All tests are in-package (package ai) so they can call unexported helpers
// (dispatchTool, allTools, internalAIScopes) directly, matching the style
// established in web_search_test.go and chat_test.go.

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/colnio/project-management-site/internal/platform"
)

// ─── recording fakes ─────────────────────────────────────────────────────────

// callRecord captures a single REST call.
type callRecord struct {
	method string
	path   string
	body   map[string]any
}

// recordingRest returns a restCallFn that appends each call to *calls and
// responds with 200 + the given canned JSON body.
func recordingRest(calls *[]callRecord, cannedBody string) restCallFn {
	return func(method, path string, body any) ([]byte, int, error) {
		rec := callRecord{method: method, path: path}
		if body != nil {
			b, _ := json.Marshal(body)
			_ = json.Unmarshal(b, &rec.body)
		}
		*calls = append(*calls, rec)
		return []byte(cannedBody), http.StatusOK, nil
	}
}

// recordingRestWithHeaders returns a restCallWithHeadersFn that appends each
// call to *calls and responds with 200, the given body, and optional response
// headers. Used for update_page which does a GET then a PUT.
func recordingRestWithHeaders(calls *[]callRecord, cannedBody string, respHeaders http.Header) restCallWithHeadersFn {
	return func(method, path string, body any, extraHeaders map[string]string) ([]byte, int, http.Header, error) {
		rec := callRecord{method: method, path: path}
		if body != nil {
			b, _ := json.Marshal(body)
			_ = json.Unmarshal(b, &rec.body)
		}
		*calls = append(*calls, rec)
		return []byte(cannedBody), http.StatusOK, respHeaders, nil
	}
}

// ─── Part 2: endpoint dispatch tests ─────────────────────────────────────────

func TestToolEndpoints(t *testing.T) {
	const projID = "proj-aaa"
	const wsID = "ws-bbb"

	// canned 200 JSON responses sufficient to satisfy each handler's checks.
	okList := `{"items":[]}`
	okItem := `{"id":"x"}`
	okCreated := `{"id":"new"}`
	okDeleted := `{}`

	tests := []struct {
		name         string
		toolName     string
		argsJSON     string
		wantMethod   string
		wantPathSub  string // substring that must appear in the captured path
		wantBodyKeys []string
		canned       string
	}{
		// ── Read tools injected with projectID ──────────────────────────────
		{
			name:        "list_iterations uses injected project",
			toolName:    "list_iterations",
			argsJSON:    `{}`,
			wantMethod:  "GET",
			wantPathSub: "/v1/projects/" + projID + "/iterations",
			canned:      okList,
		},
		{
			name:        "read_project uses injected project",
			toolName:    "read_project",
			argsJSON:    `{}`,
			wantMethod:  "GET",
			wantPathSub: "/v1/projects/" + projID,
			canned:      okItem,
		},
		{
			name:        "list_risks uses injected project",
			toolName:    "list_risks",
			argsJSON:    `{}`,
			wantMethod:  "GET",
			wantPathSub: "/v1/projects/" + projID + "/risks",
			canned:      okList,
		},
		{
			name:        "list_pages uses injected project",
			toolName:    "list_pages",
			argsJSON:    `{}`,
			wantMethod:  "GET",
			wantPathSub: "/v1/projects/" + projID + "/pages",
			canned:      okList,
		},
		{
			name:        "list_events uses injected project",
			toolName:    "list_events",
			argsJSON:    `{}`,
			wantMethod:  "GET",
			wantPathSub: "/v1/projects/" + projID + "/events",
			canned:      okList,
		},
		{
			name:        "list_approvals uses injected project",
			toolName:    "list_approvals",
			argsJSON:    `{}`,
			wantMethod:  "GET",
			wantPathSub: "/v1/projects/" + projID + "/approval-requests",
			canned:      okList,
		},
		{
			name:        "list_experiment_tags uses injected project",
			toolName:    "list_experiment_tags",
			argsJSON:    `{}`,
			wantMethod:  "GET",
			wantPathSub: "/v1/projects/" + projID + "/experiment-tags",
			canned:      okList,
		},
		{
			name:        "list_sample_tags uses injected project",
			toolName:    "list_sample_tags",
			argsJSON:    `{}`,
			wantMethod:  "GET",
			wantPathSub: "/v1/projects/" + projID + "/sample-tags",
			canned:      okList,
		},
		// ── Read tools with explicit arg ────────────────────────────────────
		{
			name:        "read_iteration by iteration_id",
			toolName:    "read_iteration",
			argsJSON:    `{"iteration_id":"iter-1"}`,
			wantMethod:  "GET",
			wantPathSub: "/v1/iterations/iter-1",
			canned:      okItem,
		},
		{
			name:        "list_iteration_samples by iteration_id",
			toolName:    "list_iteration_samples",
			argsJSON:    `{"iteration_id":"iter-1"}`,
			wantMethod:  "GET",
			wantPathSub: "/v1/iterations/iter-1/samples",
			canned:      okList,
		},
		{
			name:        "list_iteration_risks by iteration_id",
			toolName:    "list_iteration_risks",
			argsJSON:    `{"iteration_id":"iter-1"}`,
			wantMethod:  "GET",
			wantPathSub: "/v1/iterations/iter-1/risks",
			canned:      okList,
		},
		// ── Write tools ─────────────────────────────────────────────────────
		{
			name:         "create_iteration posts to project and forwards title",
			toolName:     "create_iteration",
			argsJSON:     `{"title":"Sprint 1"}`,
			wantMethod:   "POST",
			wantPathSub:  "/v1/projects/" + projID + "/iterations",
			wantBodyKeys: []string{"title"},
			canned:       okCreated,
		},
		{
			name:         "update_iteration patches by id and forwards status",
			toolName:     "update_iteration",
			argsJSON:     `{"iteration_id":"iter-1","status":"active"}`,
			wantMethod:   "PATCH",
			wantPathSub:  "/v1/iterations/iter-1",
			wantBodyKeys: []string{"status"},
			canned:       okItem,
		},
		{
			name:         "link_iteration_sample posts to iteration samples",
			toolName:     "link_iteration_sample",
			argsJSON:     `{"iteration_id":"iter-1","sample_id":"samp-1"}`,
			wantMethod:   "POST",
			wantPathSub:  "/v1/iterations/iter-1/samples",
			wantBodyKeys: []string{"sample_id"},
			canned:       okCreated,
		},
		{
			name:        "unlink_iteration_sample deletes",
			toolName:    "unlink_iteration_sample",
			argsJSON:    `{"iteration_id":"iter-1","sample_id":"samp-1"}`,
			wantMethod:  "DELETE",
			wantPathSub: "/v1/iterations/iter-1/samples/samp-1",
			canned:      okDeleted,
		},
		{
			name:         "create_experiment posts to project",
			toolName:     "create_experiment",
			argsJSON:     `{"method":"EIS"}`,
			wantMethod:   "POST",
			wantPathSub:  "/v1/projects/" + projID + "/experiments",
			wantBodyKeys: []string{"method"},
			canned:       okCreated,
		},
		{
			name:         "update_experiment patches by id",
			toolName:     "update_experiment",
			argsJSON:     `{"experiment_id":"exp-1","status":"completed"}`,
			wantMethod:   "PATCH",
			wantPathSub:  "/v1/experiments/exp-1",
			wantBodyKeys: []string{"status"},
			canned:       okItem,
		},
		{
			name:         "link_experiment_sample posts to experiment samples",
			toolName:     "link_experiment_sample",
			argsJSON:     `{"experiment_id":"exp-1","sample_id":"samp-1"}`,
			wantMethod:   "POST",
			wantPathSub:  "/v1/experiments/exp-1/samples",
			wantBodyKeys: []string{"sample_id"},
			canned:       okCreated,
		},
		{
			name:        "unlink_experiment_sample deletes",
			toolName:    "unlink_experiment_sample",
			argsJSON:    `{"experiment_id":"exp-1","sample_id":"samp-1"}`,
			wantMethod:  "DELETE",
			wantPathSub: "/v1/experiments/exp-1/samples/samp-1",
			canned:      okDeleted,
		},
		{
			name:         "create_sample posts to project and forwards identifier",
			toolName:     "create_sample",
			argsJSON:     `{"identifier":"EL-001"}`,
			wantMethod:   "POST",
			wantPathSub:  "/v1/projects/" + projID + "/samples",
			wantBodyKeys: []string{"identifier"},
			canned:       okCreated,
		},
		{
			name:         "update_sample patches by id",
			toolName:     "update_sample",
			argsJSON:     `{"sample_id":"samp-1","status":"consumed"}`,
			wantMethod:   "PATCH",
			wantPathSub:  "/v1/samples/samp-1",
			wantBodyKeys: []string{"status"},
			canned:       okItem,
		},
		{
			name:         "add_sample_relation posts to parent sample",
			toolName:     "add_sample_relation",
			argsJSON:     `{"parent_sample_id":"samp-1","child_sample_id":"samp-2","relation_type":"derived_from"}`,
			wantMethod:   "POST",
			wantPathSub:  "/v1/samples/samp-1/relations",
			wantBodyKeys: []string{"child_sample_id", "relation_type"},
			canned:       okCreated,
		},
		{
			name:         "create_risk posts to project and forwards title",
			toolName:     "create_risk",
			argsJSON:     `{"title":"Supply risk"}`,
			wantMethod:   "POST",
			wantPathSub:  "/v1/projects/" + projID + "/risks",
			wantBodyKeys: []string{"title"},
			canned:       okCreated,
		},
		{
			name:         "update_risk patches by id",
			toolName:     "update_risk",
			argsJSON:     `{"risk_id":"risk-1","likelihood":"low"}`,
			wantMethod:   "PATCH",
			wantPathSub:  "/v1/risks/risk-1",
			wantBodyKeys: []string{"likelihood"},
			canned:       okItem,
		},
		{
			name:         "create_approval_request posts to project",
			toolName:     "create_approval_request",
			argsJSON:     `{"description":"Please review"}`,
			wantMethod:   "POST",
			wantPathSub:  "/v1/projects/" + projID + "/approval-requests",
			wantBodyKeys: []string{"description"},
			canned:       okCreated,
		},
	}

	for _, tc := range tests {
		tc := tc // capture
		t.Run(tc.name, func(t *testing.T) {
			var calls []callRecord
			rest := recordingRest(&calls, tc.canned)

			_, _, err := dispatchTool(context.Background(), tc.toolName, tc.argsJSON, projID, wsID, rest)
			if err != nil {
				t.Fatalf("dispatchTool(%q) error: %v", tc.toolName, err)
			}
			if len(calls) == 0 {
				t.Fatalf("dispatchTool(%q): no REST call recorded", tc.toolName)
			}
			got := calls[len(calls)-1] // for multi-call tools (e.g. search_project_content), check last relevant

			// For tools with an injection path, use the first call.
			if tc.wantMethod != "" && got.method != tc.wantMethod {
				// Some tools (like search_project_content) emit multiple calls;
				// check the first one that has the right method.
				found := false
				for _, c := range calls {
					if c.method == tc.wantMethod && strings.Contains(c.path, tc.wantPathSub) {
						got = c
						found = true
						break
					}
				}
				if !found {
					t.Errorf("want method=%s, got first call method=%s (all calls: %+v)", tc.wantMethod, calls[0].method, calls)
				}
			}

			if tc.wantMethod != "" && got.method != tc.wantMethod {
				t.Errorf("method: want %s, got %s", tc.wantMethod, got.method)
			}
			if tc.wantPathSub != "" && !strings.Contains(got.path, tc.wantPathSub) {
				t.Errorf("path: want substring %q, got %q", tc.wantPathSub, got.path)
			}
			for _, key := range tc.wantBodyKeys {
				if _, ok := got.body[key]; !ok {
					t.Errorf("body: expected key %q to be present, body=%v", key, got.body)
				}
			}
		})
	}
}

// TestSaveRiskAssessmentTwoCalls verifies that save_risk_assessment issues two
// POSTs in order: first the RA report page, then the risk-register upsert
// carrying the failure modes and iteration scope.
func TestSaveRiskAssessmentTwoCalls(t *testing.T) {
	const projID = "proj-aaa"
	const wsID = "ws-bbb"

	var calls []callRecord
	rest := recordingRest(&calls, `{"id":"new"}`)

	args := `{
		"report_markdown":"# Risk Assessment\n\nSummary.",
		"report_title":"Risk Assessment — XPS",
		"risk_level":"RED",
		"expertise":"Novice",
		"iteration_id":"iter-1",
		"failure_modes":[
			{"title":"Beam heating","likelihood":"high","mitigation":"Reduce flux","flag_pi_review":true}
		]
	}`

	_, isWrite, err := dispatchTool(context.Background(), "save_risk_assessment", args, projID, wsID, rest)
	if err != nil {
		t.Fatalf("dispatchTool(save_risk_assessment) error: %v", err)
	}
	if !isWrite {
		t.Errorf("save_risk_assessment should be a write tool")
	}
	if len(calls) != 2 {
		t.Fatalf("expected 2 REST calls (page + risk-assessment), got %d: %+v", len(calls), calls)
	}

	page := calls[0]
	if page.method != "POST" || !strings.Contains(page.path, "/v1/projects/"+projID+"/pages") {
		t.Errorf("first call: want POST /v1/projects/%s/pages, got %s %s", projID, page.method, page.path)
	}

	ra := calls[1]
	if ra.method != "POST" || !strings.Contains(ra.path, "/v1/projects/"+projID+"/risk-assessment") {
		t.Errorf("second call: want POST /v1/projects/%s/risk-assessment, got %s %s", projID, ra.method, ra.path)
	}
	if ra.body["iteration_id"] != "iter-1" {
		t.Errorf("risk-assessment body: want iteration_id=iter-1, got %v", ra.body["iteration_id"])
	}
	fms, ok := ra.body["failure_modes"].([]any)
	if !ok || len(fms) != 1 {
		t.Fatalf("risk-assessment body: want 1 failure_mode, got %v", ra.body["failure_modes"])
	}
}

// TestUpdatePageETAGRoundTrip verifies that update_page:
//  1. Issues a GET to /v1/pages/{id} first.
//  2. Issues a PUT to /v1/pages/{id} with an If-Match header equal to the ETag
//     returned by the GET.
func TestUpdatePageETagRoundTrip(t *testing.T) {
	const pageID = "page-xyz"
	const etag = `"revision-abc"`
	const projID = "proj-aaa"
	const wsID = "ws-bbb"

	var calls []callRecord
	var capturedIfMatch string

	rhFn := func(method, path string, body any, extraHeaders map[string]string) ([]byte, int, http.Header, error) {
		rec := callRecord{method: method, path: path}
		if body != nil {
			b, _ := json.Marshal(body)
			_ = json.Unmarshal(b, &rec.body)
		}
		calls = append(calls, rec)

		respHdrs := http.Header{}
		if method == "GET" {
			// Simulate server returning an ETag on GET.
			respHdrs.Set("ETag", etag)
		}
		if method == "PUT" {
			capturedIfMatch = extraHeaders["If-Match"]
		}
		return []byte(`{"id":"page-xyz"}`), http.StatusOK, respHdrs, nil
	}

	argsJSON := `{"page_id":"` + pageID + `","blocks":[{"type":"paragraph"}]}`
	// dispatchTool accepts restHdrs as variadic. Use a no-op restCallFn;
	// update_page ignores it and uses restHdrs exclusively.
	noopRest := func(method, path string, body any) ([]byte, int, error) {
		return nil, 0, nil
	}

	_, _, err := dispatchTool(context.Background(), "update_page", argsJSON, projID, wsID, noopRest, rhFn)
	if err != nil {
		t.Fatalf("dispatchTool(update_page) error: %v", err)
	}

	// Must have exactly 2 calls: GET then PUT.
	if len(calls) != 2 {
		t.Fatalf("expected 2 REST calls (GET + PUT), got %d: %+v", len(calls), calls)
	}

	getCall := calls[0]
	if getCall.method != "GET" {
		t.Errorf("first call: want GET, got %s", getCall.method)
	}
	if !strings.HasSuffix(getCall.path, "/v1/pages/"+pageID) {
		t.Errorf("GET path: want suffix /v1/pages/%s, got %q", pageID, getCall.path)
	}

	putCall := calls[1]
	if putCall.method != "PUT" {
		t.Errorf("second call: want PUT, got %s", putCall.method)
	}
	if !strings.HasSuffix(putCall.path, "/v1/pages/"+pageID) {
		t.Errorf("PUT path: want suffix /v1/pages/%s, got %q", pageID, putCall.path)
	}

	if capturedIfMatch != etag {
		t.Errorf("PUT If-Match: want %q, got %q", etag, capturedIfMatch)
	}
}

// ─── Part 3: scope-coverage guard ────────────────────────────────────────────

// toolScopeMap maps each tool name to the scopes required by the REST
// endpoints it calls. This is the explicit, hand-maintained registry that
// prevents regressions (e.g. list_iterations returning 403 because
// read:iterations was not in internalAIScopes).
//
// Every tool returned by allTools() must have an entry here, so new tools
// cannot be silently forgotten: the test asserts that the map is complete.
var toolScopeMap = map[string][]string{
	// ── scopes are validated at the project/workspace level ──────────────
	"list_projects":          {platform.ScopeReadProjects},
	"read_sample":            {platform.ScopeReadSamples},
	"get_sample_lineage":     {platform.ScopeReadSamples},
	"list_samples":           {platform.ScopeReadSamples},
	"read_experiment":        {platform.ScopeReadExperiments},
	"list_experiments":       {platform.ScopeReadExperiments},
	"read_page":              {platform.ScopeReadPages},
	"list_artifacts":         {platform.ScopeReadArtifacts},
	"search_project_content": {platform.ScopeReadSamples, platform.ScopeReadExperiments, platform.ScopeReadArtifacts},
	"web_search":             {}, // calls Brave API, not the platform REST API
	// ── new read tools ────────────────────────────────────────────────────
	"read_project":           {platform.ScopeReadProjects},
	"list_iterations":        {platform.ScopeReadIterations},
	"read_iteration":         {platform.ScopeReadIterations},
	"list_iteration_samples": {platform.ScopeReadSamples, platform.ScopeReadIterations},
	"list_risks":             {platform.ScopeReadRisks},
	"list_iteration_risks":   {platform.ScopeReadRisks, platform.ScopeReadIterations},
	"list_pages":             {platform.ScopeReadPages},
	"list_events":            {platform.ScopeReadCalendar},
	"list_approvals":         {platform.ScopeReadApprovals},
	"list_experiment_tags":   {platform.ScopeReadExperiments},
	"list_sample_tags":       {platform.ScopeReadSamples},
	// ── write tools ───────────────────────────────────────────────────────
	"draft_page":               {platform.ScopeWritePages},
	"update_iteration_status":  {platform.ScopeWriteIterations},
	"create_reminder":          {platform.ScopeWriteCalendar},
	"create_iteration":         {platform.ScopeWriteIterations},
	"update_iteration":         {platform.ScopeWriteIterations},
	"link_iteration_sample":    {platform.ScopeWriteIterations},
	"unlink_iteration_sample":  {platform.ScopeWriteIterations},
	"create_experiment":        {platform.ScopeWriteExperiments},
	"update_experiment":        {platform.ScopeWriteExperiments},
	"link_experiment_sample":   {platform.ScopeWriteExperiments},
	"unlink_experiment_sample": {platform.ScopeWriteExperiments},
	"create_sample":            {platform.ScopeWriteSamples},
	"update_sample":            {platform.ScopeWriteSamples},
	"add_sample_relation":      {platform.ScopeWriteSamples},
	"create_risk":              {platform.ScopeWriteRisks},
	"update_risk":              {platform.ScopeWriteRisks},
	"save_risk_assessment":     {platform.ScopeWritePages, platform.ScopeWriteRisks},
	"create_approval_request":  {platform.ScopeWriteApprovals},
	"update_page":              {platform.ScopeReadPages, platform.ScopeWritePages},
}

// TestScopeCoverageGuard asserts that every scope required by any tool is
// present in internalAIScopes, and that every tool in allTools() has an entry
// in toolScopeMap so newly added tools cannot be silently forgotten.
func TestScopeCoverageGuard(t *testing.T) {
	// Build a quick-lookup set from internalAIScopes.
	minted := make(map[string]bool, len(internalAIScopes))
	for _, s := range internalAIScopes {
		minted[s] = true
	}

	// ── 1. Assert every scope in toolScopeMap is in internalAIScopes ──────
	for tool, scopes := range toolScopeMap {
		for _, scope := range scopes {
			if !minted[scope] {
				t.Errorf("tool %q requires scope %q but it is absent from internalAIScopes", tool, scope)
			}
		}
	}

	// ── 2. Assert every tool in allTools() has an entry in toolScopeMap ───
	const dummyProject = "00000000-0000-0000-0000-000000000001"
	const dummyWS = "00000000-0000-0000-0000-000000000002"
	for _, td := range allTools(dummyProject, dummyWS) {
		name := td.Tool.Function.Name
		if _, ok := toolScopeMap[name]; !ok {
			t.Errorf("tool %q is registered in allTools() but has no entry in toolScopeMap — add it", name)
		}
	}
}
