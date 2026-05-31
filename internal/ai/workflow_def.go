package ai

import (
	"encoding/json"
	"fmt"
	"io/fs"

	"github.com/colnio/project-management-site/internal/ai/workflows"
)

// WorkflowStep represents a single step in a workflow.
type WorkflowStep struct {
	ID           string            `json:"id"`
	Type         string            `json:"type"` // "gather_context" | "ai_question" | "ai_synthesis"
	Sources      []string          `json:"sources,omitempty"`
	Prompt       string            `json:"prompt,omitempty"`
	Expects      map[string]string `json:"expects,omitempty"` // field -> type hint
	OutputFormat string            `json:"output_format,omitempty"`
}

// Workflow is a loaded risk-assessment workflow definition.
type Workflow struct {
	Key          string            `json:"key"`
	Title        string            `json:"title"`
	Description  string            `json:"description"`
	Scope        string            `json:"scope"`
	Steps        []WorkflowStep    `json:"steps"`
	OutputSchema map[string]string `json:"outputSchema"`
}

// WorkflowSummary is the version returned by the list endpoint. It includes
// the step definitions and output schema so the Templates UI can render the
// step accordion (with prompt text) and the output schema as JSON.
type WorkflowSummary struct {
	Key          string            `json:"key"`
	Title        string            `json:"title"`
	Description  string            `json:"description"`
	Scope        string            `json:"scope"`
	Steps        []WorkflowStep    `json:"steps"`
	OutputSchema map[string]string `json:"outputSchema"`
}

// LoadWorkflows parses all *.json files in the embedded workflows/ directory
// and returns them indexed by key. It is called once at boot.
func LoadWorkflows() (map[string]*Workflow, error) {
	return loadWorkflowsFromFS(workflows.FS())
}

// loadWorkflowsFromFS is the testable inner implementation.
func loadWorkflowsFromFS(fsys fs.FS) (map[string]*Workflow, error) {
	out := make(map[string]*Workflow)
	err := fs.WalkDir(fsys, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		if len(path) < 5 || path[len(path)-5:] != ".json" {
			return nil
		}
		data, err := fs.ReadFile(fsys, path)
		if err != nil {
			return fmt.Errorf("ai: read workflow %s: %w", path, err)
		}
		var wf Workflow
		if err := json.Unmarshal(data, &wf); err != nil {
			return fmt.Errorf("ai: parse workflow %s: %w", path, err)
		}
		if wf.Key == "" {
			return fmt.Errorf("ai: workflow %s has no key", path)
		}
		out[wf.Key] = &wf
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}
