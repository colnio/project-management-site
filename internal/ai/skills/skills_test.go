package skills

import (
	"strings"
	"testing"
)

// TestLoadSkill_RiskAssessment pins the skill-name contract that the frontend
// relies on: RiskRegister's "Review with LLM" seeds a conversation with the
// skill name "risk_assessment_skill", which must resolve to a real embedded
// file. A typo here (the historical "risk_assesment_skill") silently falls back
// to the generic prompt, dropping the risk-assessment instructions.
func TestLoadSkill_RiskAssessment(t *testing.T) {
	body, err := LoadSkill("risk_assessment_skill")
	if err != nil {
		t.Fatalf("LoadSkill(%q) failed: %v — the frontend seeds exactly this name", "risk_assessment_skill", err)
	}
	if strings.TrimSpace(body) == "" {
		t.Fatalf("LoadSkill(%q) returned empty body", "risk_assessment_skill")
	}

	// The previously-shipped misspelling must NOT resolve, so a regression to it
	// is caught here rather than silently degrading to the generic prompt.
	if _, err := LoadSkill("risk_assesment_skill"); err == nil {
		t.Errorf("LoadSkill(%q) unexpectedly succeeded; the misspelled name must not resolve", "risk_assesment_skill")
	}
}
