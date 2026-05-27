package platform

// Scope constants define the capability taxonomy used by PATs and internal-AI
// tokens. JWT browser sessions bypass scope enforcement entirely (HasScope
// always returns true for them). A PAT scoped to a non-empty list is only
// allowed to call endpoints whose required scope is in that list.
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

	ScopeReadInbox = "read:inbox"
	ScopeReadAudit = "read:audit"

	ScopeReadApprovals  = "read:approvals"
	ScopeWriteApprovals = "write:approvals"

	ScopeAdminOrg = "admin:org"
)

// RequireScope returns a Forbidden error if the principal does not carry the
// given scope. It delegates to Principal.HasScope so all backward-compat rules
// (JWT sessions unrestricted, legacy empty-scope tokens unrestricted) are
// respected in one place.
func RequireScope(p *Principal, scope string) error {
	if !p.HasScope(scope) {
		return Forbidden("token missing scope " + scope)
	}
	return nil
}
