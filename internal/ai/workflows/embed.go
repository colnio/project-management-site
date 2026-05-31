// Package workflows embeds all workflow definition JSON files and exposes
// them as an io/fs.FS. Import this package from internal/ai to load definitions.
package workflows

import (
	"embed"
	"io/fs"
)

//go:embed *.json
var workflowsEmbed embed.FS

// FS returns the embedded workflow definitions filesystem.
func FS() fs.FS {
	return workflowsEmbed
}
