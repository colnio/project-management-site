package page

import (
	"net/http"

	"github.com/danielgtaylor/huma/v2"
)

// Register wires page HTTP endpoints onto the huma API.
//
// Content-addressable model: every write upserts into page_blobs (hash →
// blocks) and inserts an immutable page_revisions row. The page's
// current_revision_id advances on non-candidate writes. Concurrent writers
// must send If-Match (ETag from GET); a mismatch returns 412.
//
// Candidate revisions: PUT /v1/pages/{id}?candidate=true (or "candidate":true
// in the body) inserts a revision with status="candidate" WITHOUT advancing
// current_revision_id. Use POST .../candidates/{id}/approve to promote or
// .../candidates/{id}/reject to close.
func Register(api huma.API, svc *Service) {
	// Pages under a project.
	huma.Register(api, huma.Operation{
		OperationID: "page-list",
		Method:      http.MethodGet,
		Path:        "/v1/projects/{id}/pages",
		Summary:     "List pages for a project",
		Description: "Returns a list of page summaries (including derived title) for a project. Optionally filter by `parent_type` and `parent_id`. Results are ordered by updated_at descending. Requires viewer role on the project.",
		Tags:        []string{"pages"},
	}, svc.handleListPages)

	huma.Register(api, huma.Operation{
		OperationID: "page-create",
		Method:      http.MethodPost,
		Path:        "/v1/projects/{id}/pages",
		Summary:     "Create a page",
		Description: "Creates a new content-addressable page attached to a parent entity (project, iteration, sample, or experiment). Returns the page and its initial blocks along with an ETag. Requires editor role on the project.",
		Tags:        []string{"pages"},
	}, svc.handleCreatePage)

	// Single page.
	huma.Register(api, huma.Operation{
		OperationID: "page-get",
		Method:      http.MethodGet,
		Path:        "/v1/pages/{id}",
		Summary:     "Get a page with current blocks",
		Description: "Returns the page metadata, the current revision's blocks (JSON array), and a markdown export. The ETag in the response must be sent as `If-Match` on subsequent writes. Requires viewer role on the page's project.",
		Tags:        []string{"pages"},
	}, svc.handleGetPage)

	huma.Register(api, huma.Operation{
		OperationID: "page-update",
		Method:      http.MethodPut,
		Path:        "/v1/pages/{id}",
		Summary:     "Update page blocks (requires If-Match)",
		Description: "Writes a new revision for the page. Send the ETag from a prior GET as the `If-Match` header; a mismatch returns 412. Set `candidate=true` to stage an LLM-generated draft for approval instead of advancing the current revision. Requires editor role on the project.",
		Tags:        []string{"pages"},
	}, svc.handleUpdatePage)

	// Revisions.
	huma.Register(api, huma.Operation{
		OperationID: "page-revisions-list",
		Method:      http.MethodGet,
		Path:        "/v1/pages/{id}/revisions",
		Summary:     "List page revisions (newest-first)",
		Description: "Returns a cursor-paginated list of revisions for a page, newest first. Pass `before=<revision_id>` and `limit` (default 50, max 100) to paginate. Requires viewer role on the project.",
		Tags:        []string{"pages"},
	}, svc.handleListRevisions)

	huma.Register(api, huma.Operation{
		OperationID: "revision-get",
		Method:      http.MethodGet,
		Path:        "/v1/revisions/{id}",
		Summary:     "Get a revision with full content",
		Description: "Returns a specific revision including its content blocks and markdown export. Requires viewer role on the revision's page's project.",
		Tags:        []string{"pages"},
	}, svc.handleGetRevision)

	huma.Register(api, huma.Operation{
		OperationID: "revision-diff",
		Method:      http.MethodGet,
		Path:        "/v1/revisions/{id}/diff",
		Summary:     "Line diff between two revisions' markdown exports",
		Description: "Returns a line-based LCS diff between the markdown exports of two revisions on the same page. Pass the other revision's ID as `against`. Requires viewer role on the project.",
		Tags:        []string{"pages"},
	}, svc.handleDiffRevisions)

	// Restore.
	huma.Register(api, huma.Operation{
		OperationID: "page-restore",
		Method:      http.MethodPost,
		Path:        "/v1/pages/{id}/restore",
		Summary:     "Restore a page to a previous revision",
		Description: "Creates a new revision whose content matches a previous one, advancing `current_revision_id` to the restored snapshot. Requires editor role on the project.",
		Tags:        []string{"pages"},
	}, svc.handleRestore)

	// Candidates.
	huma.Register(api, huma.Operation{
		OperationID: "page-candidate-approve",
		Method:      http.MethodPost,
		Path:        "/v1/pages/{id}/candidates/{cand_id}/approve",
		Summary:     "Approve a candidate revision",
		Description: "Promotes a candidate revision to the current revision, superseding the previous current. Used in the LLM-assisted editing workflow. Requires editor role on the project.",
		Tags:        []string{"pages"},
	}, svc.handleApproveCandidate)

	huma.Register(api, huma.Operation{
		OperationID: "page-candidate-reject",
		Method:      http.MethodPost,
		Path:        "/v1/pages/{id}/candidates/{cand_id}/reject",
		Summary:     "Reject a candidate revision",
		Description: "Marks a candidate revision as rejected without changing the current revision. Requires editor role on the project.",
		Tags:        []string{"pages"},
	}, svc.handleRejectCandidate)

	// Presence.
	huma.Register(api, huma.Operation{
		OperationID: "page-presence-heartbeat",
		Method:      http.MethodPost,
		Path:        "/v1/pages/{id}/presence/heartbeat",
		Summary:     "Update presence heartbeat",
		Description: "Records or refreshes a client's active editing presence for a page. Presence entries expire after 30 seconds without a heartbeat. Requires viewer role on the project.",
		Tags:        []string{"pages"},
	}, svc.handlePresenceHeartbeat)

	huma.Register(api, huma.Operation{
		OperationID: "page-presence-list",
		Method:      http.MethodGet,
		Path:        "/v1/pages/{id}/presence",
		Summary:     "List active page presence (within 30 s)",
		Description: "Returns users who have sent a heartbeat for this page in the last 30 seconds, useful for showing concurrent editors. Requires viewer role on the project.",
		Tags:        []string{"pages"},
	}, svc.handlePresenceList)
}
