package notify

import (
	"bytes"
	"embed"
	"fmt"
	"strings"
	"sync"
	"text/template"
)

//go:embed templates/*.txt
var templateFS embed.FS

type tplPair struct {
	subject *template.Template
	body    *template.Template
}

var (
	templatesOnce   sync.Once
	parsedTemplates map[string]tplPair
	templatesErr    error
)

// loadTemplates parses the embedded email templates exactly once and caches the
// result (or the parse error). It never panics, so a malformed template surfaces
// as a regular error instead of crashing the process at import time.
func loadTemplates() (map[string]tplPair, error) {
	templatesOnce.Do(func() {
		parsed := make(map[string]tplPair)
		entries, err := templateFS.ReadDir("templates")
		if err != nil {
			templatesErr = fmt.Errorf("notify: read templates dir: %w", err)
			return
		}
		for _, e := range entries {
			if e.IsDir() || !strings.HasSuffix(e.Name(), ".txt") {
				continue
			}
			key := strings.TrimSuffix(e.Name(), ".txt")
			raw, err := templateFS.ReadFile("templates/" + e.Name())
			if err != nil {
				templatesErr = fmt.Errorf("notify: read template %s: %w", e.Name(), err)
				return
			}
			parts := strings.SplitN(string(raw), "---\n", 2)
			if len(parts) != 2 {
				templatesErr = fmt.Errorf("notify: template %s must have subject---body format", e.Name())
				return
			}
			subjectT, err := template.New(key + "_subject").Parse(strings.TrimSpace(parts[0]))
			if err != nil {
				templatesErr = fmt.Errorf("notify: parse subject %s: %w", e.Name(), err)
				return
			}
			bodyT, err := template.New(key + "_body").Parse(strings.TrimSpace(parts[1]))
			if err != nil {
				templatesErr = fmt.Errorf("notify: parse body %s: %w", e.Name(), err)
				return
			}
			parsed[key] = tplPair{subject: subjectT, body: bodyT}
		}
		parsedTemplates = parsed
	})
	return parsedTemplates, templatesErr
}

// LoadTemplates eagerly parses the embedded email templates and returns any
// parse error. Call it during startup to fail fast on a malformed template
// rather than discovering the problem on the first send.
func LoadTemplates() error {
	_, err := loadTemplates()
	return err
}

type renderedEmail struct {
	Subject string
	Body    string
}

func renderTemplate(key string, data map[string]any) (renderedEmail, error) {
	templates, err := loadTemplates()
	if err != nil {
		return renderedEmail{}, err
	}
	pair, ok := templates[key]
	if !ok {
		return renderedEmail{}, fmt.Errorf("notify: unknown template %q", key)
	}
	var subjBuf, bodyBuf bytes.Buffer
	if err := pair.subject.Execute(&subjBuf, data); err != nil {
		return renderedEmail{}, fmt.Errorf("notify: render subject: %w", err)
	}
	if err := pair.body.Execute(&bodyBuf, data); err != nil {
		return renderedEmail{}, fmt.Errorf("notify: render body: %w", err)
	}
	return renderedEmail{
		Subject: strings.TrimSpace(subjBuf.String()),
		Body:    strings.TrimSpace(bodyBuf.String()),
	}, nil
}

// absURL joins WebOrigin with a path (absolute if path already has scheme).
func absURL(webOrigin, path string) string {
	if path == "" {
		return webOrigin
	}
	if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
		return path
	}
	origin := strings.TrimRight(webOrigin, "/")
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return origin + path
}
