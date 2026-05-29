package experiment

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/platform"
)

func normalizeTagLabels(labels []string) []string {
	seen := make(map[string]struct{}, len(labels))
	out := make([]string, 0, len(labels))
	for _, raw := range labels {
		l := strings.TrimSpace(raw)
		if l == "" {
			continue
		}
		key := strings.ToLower(l)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, l)
	}
	return out
}

func primaryMethod(tags []string) string {
	if len(tags) == 0 {
		return "custom"
	}
	return tags[0]
}

func marshalTags(tags []string) ([]byte, error) {
	if tags == nil {
		tags = []string{}
	}
	b, err := json.Marshal(tags)
	if err != nil {
		return nil, fmt.Errorf("experiment: marshal tags: %w", err)
	}
	return b, nil
}

func parseTags(raw []byte) []string {
	if len(raw) == 0 {
		return []string{}
	}
	var tags []string
	if err := json.Unmarshal(raw, &tags); err != nil {
		return []string{}
	}
	return tags
}

func (s *Service) canonicalizeTagLabels(ctx context.Context, projectID uuid.UUID, labels []string) ([]string, error) {
	labels = normalizeTagLabels(labels)
	if len(labels) == 0 {
		return labels, nil
	}
	defs, err := s.projects.ListExperimentTags(ctx, projectID)
	if err != nil {
		return nil, err
	}
	allowed := make(map[string]string, len(defs))
	for _, t := range defs {
		allowed[strings.ToLower(t.Label)] = t.Label
	}
	out := make([]string, 0, len(labels))
	for _, l := range labels {
		canon, ok := allowed[strings.ToLower(l)]
		if !ok {
			return nil, platform.BadRequest("experiment.invalid_tag", fmt.Sprintf("unknown tag %q for this project", l))
		}
		out = append(out, canon)
	}
	return out, nil
}

const experimentSelectCols = `id, project_id, iteration_id, method, tags, parameters, result_summary,
		        notes_page_id, performed_by, performed_at, status,
		        COALESCE(seq, 0), COALESCE(code, ''),
		        created_by, created_at, updated_at`

func scanExperiment(scanner interface {
	Scan(dest ...any) error
}, e *Experiment) error {
	var tagsRaw []byte
	err := scanner.Scan(
		&e.ID, &e.ProjectID, &e.IterationID, &e.Method, &tagsRaw, &e.Parameters,
		&e.ResultSummary, &e.NotesPageID, &e.PerformedBy, &e.PerformedAt,
		&e.Status, &e.Seq, &e.Code,
		&e.CreatedBy, &e.CreatedAt, &e.UpdatedAt,
	)
	if err != nil {
		return err
	}
	e.Tags = parseTags(tagsRaw)
	if len(e.Tags) == 0 && e.Method != "" && e.Method != "custom" {
		e.Tags = []string{e.Method}
	}
	return nil
}
