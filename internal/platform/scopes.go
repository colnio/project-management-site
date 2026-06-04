package platform

import "fmt"

// Scope constants define the capability taxonomy used by PATs and internal-LLM
// tokens. JWT browser sessions bypass scope enforcement (HasScope always true).
// PAT and internal-LLM callers are limited to their Scopes list.
const (
	ScopeReadProjects  = "read:projects"
	ScopeWriteProjects = "write:projects"

	ScopeReadSamples  = "read:samples"
	ScopeWriteSamples = "write:samples"

	ScopeReadExperiments  = "read:experiments"
	ScopeWriteExperiments = "write:experiments"

	ScopeReadIterations  = "read:iterations"
	ScopeWriteIterations = "write:iterations"

	ScopeReadRisks  = "read:risks"
	ScopeWriteRisks = "write:risks"

	ScopeReadTasks  = "read:tasks"
	ScopeWriteTasks = "write:tasks"

	ScopeReadArtifacts  = "read:artifacts"
	ScopeWriteArtifacts = "write:artifacts"

	ScopeReadPages  = "read:pages"
	ScopeWritePages = "write:pages"

	ScopeReadMeetings  = "read:meetings"
	ScopeWriteMeetings = "write:meetings"

	ScopeReadCalendar  = "read:calendar"
	ScopeWriteCalendar = "write:calendar"

	ScopeReadAI  = "read:ai"
	ScopeWriteAI = "write:ai"

	ScopeReadInbox    = "read:inbox"
	ScopeReadActivity = "read:activity"
	ScopeReadNotify = "read:notify"
	ScopeWriteNotify = "write:notify"
	ScopeReadAudit = "read:audit"

	ScopeReadApprovals  = "read:approvals"
	ScopeWriteApprovals = "write:approvals"

	ScopeAdminOrg = "admin:org"

	ScopeReadAdmin  = "read:admin"
	ScopeWriteAdmin = "write:admin"

	ScopeManageTokens = "manage:tokens"
	ScopeWriteProfile = "write:profile"
)

// allScopes is the PAT scope allowlist (every Scope* constant above).
var allScopes = []string{
	ScopeReadProjects, ScopeWriteProjects,
	ScopeReadSamples, ScopeWriteSamples,
	ScopeReadExperiments, ScopeWriteExperiments,
	ScopeReadIterations, ScopeWriteIterations,
	ScopeReadRisks, ScopeWriteRisks,
	ScopeReadTasks, ScopeWriteTasks,
	ScopeReadArtifacts, ScopeWriteArtifacts,
	ScopeReadPages, ScopeWritePages,
	ScopeReadMeetings, ScopeWriteMeetings,
	ScopeReadCalendar, ScopeWriteCalendar,
	ScopeReadAI, ScopeWriteAI,
	ScopeReadInbox, ScopeReadActivity, ScopeReadNotify, ScopeWriteNotify,
	ScopeReadAudit,
	ScopeReadApprovals, ScopeWriteApprovals,
	ScopeAdminOrg,
	ScopeReadAdmin, ScopeWriteAdmin,
	ScopeManageTokens, ScopeWriteProfile,
}

var allowedScopeSet map[string]struct{}

func init() {
	allowedScopeSet = make(map[string]struct{}, len(allScopes))
	for _, s := range allScopes {
		allowedScopeSet[s] = struct{}{}
	}
}

// IsAllowedScope reports whether s is a known PAT scope string.
func IsAllowedScope(s string) bool {
	_, ok := allowedScopeSet[s]
	return ok
}

// ValidatePATScopes ensures every scope is on the allowlist and at least one is present.
func ValidatePATScopes(scopes []string) error {
	if len(scopes) == 0 {
		return BadRequest("token.scopes_required", "at least one scope is required")
	}
	for _, s := range scopes {
		if !IsAllowedScope(s) {
			return BadRequest("token.invalid_scope", fmt.Sprintf("unknown scope %q", s))
		}
	}
	return nil
}

// RequireScope returns a Forbidden error if the principal does not carry the
// given scope. It delegates to Principal.HasScope.
func RequireScope(p *Principal, scope string) error {
	if !p.HasScope(scope) {
		return Forbidden("token missing scope " + scope)
	}
	return nil
}
