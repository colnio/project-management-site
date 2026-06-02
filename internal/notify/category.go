package notify

// Email notification categories (user_notification_prefs.category).
const (
	CategoryPIFlag      = "pi_flag"
	CategoryAIProposal  = "ai_proposal"
	CategoryApproval    = "approval"
	CategoryMention     = "mention"
	CategoryMeeting     = "meeting"
	CategoryDigest      = "digest"
	CategoryAccount     = "account"
	CategorySecurity    = "security"
	CategoryAdminBroadcast = "admin_broadcast"
)

// Template keys (email_outbox.template_key).
const (
	TemplateWorkspaceInvite        = "workspace_invite"
	TemplateApprovalRequestPending = "approval_request_pending"
	TemplateApprovalComment        = "approval_comment"
	TemplatePIFlagReview             = "pi_flag_review"
	TemplateAccountApproved          = "account_approved"
	TemplateAccountSuspended         = "account_suspended"
	TemplateDailyDigest              = "daily_digest"
	TemplateAdminBroadcast           = "admin_broadcast"
)

// mandatoryCategories cannot be disabled via the preferences API.
var mandatoryCategories = map[string]bool{
	CategoryAccount:        true,
	CategorySecurity:       true,
	CategoryAdminBroadcast: true,
}

// defaultEnabled is used when no row exists in user_notification_prefs.
var defaultEnabled = map[string]bool{
	CategoryPIFlag:     true,
	CategoryAIProposal: true,
	CategoryApproval:   true,
	CategoryMention:    true,
	CategoryMeeting:    true,
	CategoryDigest:     true,
}

// AllPreferenceCategories lists categories exposed in the settings UI.
func AllPreferenceCategories() []prefDef {
	return []prefDef{
		{Key: CategoryPIFlag, Label: "PI review flags", Description: "Notify when a risk is flagged for PI review"},
		{Key: CategoryAIProposal, Label: "LLM proposals", Description: "Notify when an LLM action awaits approval"},
		{Key: CategoryApproval, Label: "Approval requests", Description: "Notify when you are asked to approve a risk assessment"},
		{Key: CategoryMention, Label: "Mentions", Description: "Notify when you are mentioned"},
		{Key: CategoryMeeting, Label: "Meeting reminders", Description: "Notify before scheduled meetings"},
		{Key: CategoryDigest, Label: "Daily digest", Description: "Daily summary of inbox items"},
	}
}

type prefDef struct {
	Key         string
	Label       string
	Description string
}

func isMandatory(category string) bool {
	return mandatoryCategories[category]
}
