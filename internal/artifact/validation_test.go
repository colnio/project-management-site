package artifact_test

import (
	"strings"
	"testing"

	"github.com/colnio/project-management-site/internal/artifact"
	"github.com/colnio/project-management-site/internal/platform"
)

func TestSanitizeFilename(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in    string
		want  string
		isErr bool
	}{
		{"report.pdf", "report.pdf", false},
		{"/etc/passwd", "passwd", false},
		{"../../evil.pdf", "evil.pdf", false},
		{"my file (1).pdf", "", true},
		{strings.Repeat("a", 256) + ".pdf", "", true},
		{"", "", true},
	}
	for _, tc := range cases {
		got, err := artifact.ExportSanitizeFilename(tc.in)
		if tc.isErr {
			if err == nil {
				t.Errorf("sanitizeFilename(%q): want error", tc.in)
			}
			continue
		}
		if err != nil {
			t.Errorf("sanitizeFilename(%q): %v", tc.in, err)
			continue
		}
		if got != tc.want {
			t.Errorf("sanitizeFilename(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestValidateContentType(t *testing.T) {
	t.Parallel()
	allowed := []string{
		"application/pdf",
		"image/png",
		"application/x-ipynb+json",
		"application/octet-stream",
		"text/csv",
	}
	for _, ct := range allowed {
		if err := artifact.ExportValidateContentType(ct); err != nil {
			t.Errorf("expected %q allowed, got %v", ct, err)
		}
	}
	blocked := []string{
		"text/html",
		"image/svg+xml",
		"application/javascript",
		"text/javascript",
	}
	for _, ct := range blocked {
		err := artifact.ExportValidateContentType(ct)
		if err == nil {
			t.Errorf("expected %q blocked", ct)
			continue
		}
		em, ok := err.(*platform.ErrorModel)
		if !ok || em.GetStatus() != 400 {
			t.Errorf("expected 400 for %q, got %v", ct, err)
		}
	}
}
