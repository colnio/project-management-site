package sample

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

func marshalTags(tags []string) ([]byte, error) {
	if tags == nil {
		tags = []string{}
	}
	b, err := json.Marshal(tags)
	if err != nil {
		return nil, fmt.Errorf("sample: marshal tags: %w", err)
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
	defs, err := s.projects.ListSampleTags(ctx, projectID)
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
			return nil, platform.BadRequest("sample.invalid_tag", fmt.Sprintf("unknown tag %q for this project", l))
		}
		out = append(out, canon)
	}
	return out, nil
}

const sampleSelectCols = `id, project_id, identifier, name, description,
	        properties, status, description_page_id, tags, created_by, created_at, updated_at`

func scanSample(scanner interface {
	Scan(dest ...any) error
}, sm *Sample) error {
	var tagsRaw []byte
	err := scanner.Scan(
		&sm.ID, &sm.ProjectID, &sm.Identifier, &sm.Name, &sm.Description,
		&sm.Properties, &sm.Status, &sm.DescriptionPageID, &tagsRaw,
		&sm.CreatedBy, &sm.CreatedAt, &sm.UpdatedAt,
	)
	if err != nil {
		return err
	}
	sm.Tags = parseTags(tagsRaw)
	return nil
}
