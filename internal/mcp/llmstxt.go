// Package mcp implements the MCP (Model Context Protocol) server and the
// /llms.txt generator for the lab platform. The MCP server wraps the existing
// REST API over SSE transport; the llms.txt document is generated from the
// live OpenAPI spec so it always reflects the current endpoints.
package mcp

import (
	"fmt"
	"sort"
	"strings"

	"github.com/danielgtaylor/huma/v2"
)

// LLMSText generates a /llms.txt document from the live OpenAPI spec.
// It groups every operation by tag, lists the HTTP method, path, and summary,
// and includes auth instructions and pointers to the machine-readable spec.
//
// Pass api.OpenAPI() to get the *huma.OpenAPI value from a huma.API.
func LLMSText(oapi *huma.OpenAPI) string {
	var sb strings.Builder

	title := "Lab Project Management Platform"
	if oapi.Info != nil && oapi.Info.Title != "" {
		title = oapi.Info.Title
	}
	version := ""
	if oapi.Info != nil {
		version = oapi.Info.Version
	}

	sb.WriteString(fmt.Sprintf("# %s\n\n", title))
	sb.WriteString("> Agent-friendly research data API.\n")
	if oapi.Info != nil && oapi.Info.Description != "" {
		sb.WriteString("> ")
		sb.WriteString(oapi.Info.Description)
		sb.WriteString("\n")
	}
	sb.WriteString("\n")

	// Auth section.
	sb.WriteString("## Auth\n\n")
	sb.WriteString("Use a Personal Access Token (PAT) for every request:\n\n")
	sb.WriteString("```\nAuthorization: Bearer pat_<your-token>\n```\n\n")
	sb.WriteString("Create a PAT via `POST /v1/auth/pats`. Tokens carry scopes; ")
	sb.WriteString("read-only access requires at minimum the relevant `read:*` scopes.\n\n")

	// Discovery section.
	sb.WriteString("## Discovery\n\n")
	sb.WriteString("- **OpenAPI 3.1 spec**: `/openapi.json`\n")
	sb.WriteString("- **Interactive docs**: `/docs`\n")
	sb.WriteString("- **MCP server (SSE)**: `/mcp` — mount an MCP client here with the same PAT\n")
	if version != "" {
		sb.WriteString(fmt.Sprintf("- **API version**: %s\n", version))
	}
	sb.WriteString("\n")

	// Collect operations grouped by tag.
	type op struct {
		method  string
		path    string
		summary string
		tags    []string
	}

	byTag := map[string][]op{}
	tagOrder := []string{}
	seen := map[string]bool{}

	// Sort paths for deterministic output.
	paths := make([]string, 0, len(oapi.Paths))
	for p := range oapi.Paths {
		paths = append(paths, p)
	}
	sort.Strings(paths)

	methods := []struct {
		name string
		get  func(*huma.PathItem) *huma.Operation
	}{
		{"GET", func(pi *huma.PathItem) *huma.Operation { return pi.Get }},
		{"POST", func(pi *huma.PathItem) *huma.Operation { return pi.Post }},
		{"PUT", func(pi *huma.PathItem) *huma.Operation { return pi.Put }},
		{"PATCH", func(pi *huma.PathItem) *huma.Operation { return pi.Patch }},
		{"DELETE", func(pi *huma.PathItem) *huma.Operation { return pi.Delete }},
	}

	for _, p := range paths {
		item := oapi.Paths[p]
		if item == nil {
			continue
		}
		for _, m := range methods {
			oper := m.get(item)
			if oper == nil {
				continue
			}
			tags := oper.Tags
			if len(tags) == 0 {
				tags = []string{"other"}
			}
			o := op{
				method:  m.name,
				path:    p,
				summary: oper.Summary,
				tags:    tags,
			}
			for _, tag := range tags {
				if !seen[tag] {
					tagOrder = append(tagOrder, tag)
					seen[tag] = true
				}
				byTag[tag] = append(byTag[tag], o)
			}
		}
	}

	sort.Strings(tagOrder)

	sb.WriteString("## Endpoints\n\n")
	for _, tag := range tagOrder {
		sb.WriteString(fmt.Sprintf("### %s\n\n", tag))
		for _, o := range byTag[tag] {
			summary := o.summary
			if summary == "" {
				summary = "(no summary)"
			}
			sb.WriteString(fmt.Sprintf("- `%s %s` — %s\n", o.method, o.path, summary))
		}
		sb.WriteString("\n")
	}

	return sb.String()
}
