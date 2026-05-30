package artifact

import (
	"path/filepath"
	"strings"
	"unicode"

	"github.com/colnio/project-management-site/internal/platform"
)

// MaxArtifactBytes is the maximum allowed upload size (presigned PUT and worker reads).
const MaxArtifactBytes int64 = 100 << 20 // 100 MiB

// validateContentType returns an error if contentType is not on the server allowlist.
func validateContentType(contentType string) error {
	ct := strings.ToLower(strings.TrimSpace(contentType))
	if ct == "" {
		return platform.BadRequest("artifact.invalid_content_type", "content type is required")
	}
	// Strip parameters (e.g. "image/png; charset=binary").
	if i := strings.Index(ct, ";"); i >= 0 {
		ct = strings.TrimSpace(ct[:i])
	}

	blocked := []string{
		"text/html",
		"image/svg+xml",
		"application/javascript",
		"text/javascript",
		"application/x-javascript",
		"application/ecmascript",
		"text/ecmascript",
	}
	for _, b := range blocked {
		if ct == b {
			return platform.BadRequest("artifact.content_type_not_allowed", "content type is not allowed")
		}
	}

	switch ct {
	case "application/pdf",
		"application/x-ipynb+json",
		"application/json",
		"text/csv",
		"text/plain",
		"application/csv",
		"application/octet-stream",
		"application/zip",
		"application/x-zip-compressed":
		return nil
	}

	if strings.HasPrefix(ct, "image/") {
		if strings.HasPrefix(ct, "image/svg") {
			return platform.BadRequest("artifact.content_type_not_allowed", "content type is not allowed")
		}
		return nil
	}

	return platform.BadRequest("artifact.content_type_not_allowed", "content type is not allowed")
}

// sanitizeFilename returns a safe leaf filename for use in storage keys.
func sanitizeFilename(filename string) (string, error) {
	name := filepath.Base(strings.TrimSpace(filename))
	if name == "" || name == "." || name == ".." {
		return "", platform.BadRequest("artifact.invalid_filename", "filename is required")
	}
	if len(name) > 255 {
		return "", platform.BadRequest("artifact.invalid_filename", "filename exceeds 255 characters")
	}
	for _, r := range name {
		if r < 32 || r == 127 {
			return "", platform.BadRequest("artifact.invalid_filename", "filename contains invalid characters")
		}
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '.' || r == '-' || r == '_' {
			continue
		}
		return "", platform.BadRequest("artifact.invalid_filename", "filename contains invalid characters")
	}
	if strings.Contains(name, "/") || strings.Contains(name, "\\") {
		return "", platform.BadRequest("artifact.invalid_filename", "filename must not contain path separators")
	}
	return name, nil
}
