// Package skills embeds all skill definition Markdown files and exposes
// them as an io/fs.FS. Import this package from internal/ai to load skill prompts.
package skills

import (
	"embed"
	"fmt"
	"io/fs"
)

//go:embed *.md
var skillsEmbed embed.FS

// FS returns the embedded skill definitions filesystem.
func FS() fs.FS {
	return skillsEmbed
}

// LoadSkill reads the named skill's Markdown body from the embedded FS.
// name should be the bare filename without the .md extension.
func LoadSkill(name string) (string, error) {
	data, err := fs.ReadFile(skillsEmbed, name+".md")
	if err != nil {
		return "", fmt.Errorf("skills: load %q: %w", name, err)
	}
	return string(data), nil
}
