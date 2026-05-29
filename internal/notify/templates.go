package notify

import (
	"bytes"
	"embed"
	"fmt"
	"strings"
	"text/template"
)

//go:embed templates/*.txt
var templateFS embed.FS

type tplPair struct {
	subject *template.Template
	body    *template.Template
}

var parsedTemplates map[string]tplPair

func init() {
	parsedTemplates = make(map[string]tplPair)
	entries, err := templateFS.ReadDir("templates")
	if err != nil {
		panic("notify: read templates dir: " + err.Error())
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".txt") {
			continue
		}
		key := strings.TrimSuffix(e.Name(), ".txt")
		raw, err := templateFS.ReadFile("templates/" + e.Name())
		if err != nil {
			panic("notify: read template " + e.Name() + ": " + err.Error())
		}
		parts := strings.SplitN(string(raw), "---\n", 2)
		if len(parts) != 2 {
			panic("notify: template " + e.Name() + " must have subject---body format")
		}
		subjectT, err := template.New(key + "_subject").Parse(strings.TrimSpace(parts[0]))
		if err != nil {
			panic("notify: parse subject " + e.Name() + ": " + err.Error())
		}
		bodyT, err := template.New(key + "_body").Parse(strings.TrimSpace(parts[1]))
		if err != nil {
			panic("notify: parse body " + e.Name() + ": " + err.Error())
		}
		parsedTemplates[key] = tplPair{subject: subjectT, body: bodyT}
	}
}

type renderedEmail struct {
	Subject string
	Body    string
}

func renderTemplate(key string, data map[string]any) (renderedEmail, error) {
	pair, ok := parsedTemplates[key]
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
