package ai

// markdownToBlockNoteBlocks converts a Markdown string into a slice of
// BlockNote v0.51-compatible block descriptors suitable for JSON marshaling
// and posting to the pages API.
//
// Supported constructs:
//   - ATX headings (#/##/###) → heading block with level prop
//   - Paragraphs with inline markup → paragraph block with content array
//   - Bullet list items (- / *) → bulletListItem block
//   - Ordered list items (1. / 1)) → numberedListItem block
//   - Fenced code blocks (```lang) → codeBlock block with language prop
//   - Blockquotes (> …) → rendered as plain paragraphs (no native blockquote)
//   - GFM tables → table block with tableContent rows/cells
//
// Inline runs inside content arrays follow the shape:
//
//	{"type":"text","text":"…","styles":{}}            – plain text
//	{"type":"text","text":"…","styles":{"bold":true}} – bold/italic/code
//	{"type":"link","href":"…","content":[…]}          – link wrapper

import (
	"bytes"
	"strings"

	gast "github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	east "github.com/yuin/goldmark/extension/ast"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/text"

	"github.com/yuin/goldmark"
)

// inlineStyles tracks accumulated emphasis/code state while walking inline nodes.
type inlineStyles struct {
	bold   bool
	italic bool
	code   bool
}

func markdownToBlockNoteBlocks(md string) []map[string]any {
	if strings.TrimSpace(md) == "" {
		return []map[string]any{emptyParagraph()}
	}

	src := []byte(md)

	gm := goldmark.New(
		goldmark.WithExtensions(extension.GFM),
		goldmark.WithParserOptions(parser.WithAutoHeadingID()),
	)

	reader := text.NewReader(src)
	doc := gm.Parser().Parse(reader)

	var blocks []map[string]any
	walkTopLevel(doc, src, &blocks)

	if len(blocks) == 0 {
		return []map[string]any{emptyParagraph()}
	}
	return blocks
}

// walkTopLevel iterates over direct children of a container node and converts
// each recognized block node to a BlockNote block map.
func walkTopLevel(parent gast.Node, src []byte, out *[]map[string]any) {
	for node := parent.FirstChild(); node != nil; node = node.NextSibling() {
		convertBlock(node, src, out)
	}
}

func convertBlock(node gast.Node, src []byte, out *[]map[string]any) {
	switch n := node.(type) {
	case *gast.Heading:
		level := n.Level
		if level > 3 {
			level = 3
		}
		*out = append(*out, map[string]any{
			"type":    "heading",
			"props":   map[string]any{"level": level},
			"content": collectInlineContent(n, src, inlineStyles{}),
		})

	case *gast.Paragraph:
		*out = append(*out, map[string]any{
			"type":    "paragraph",
			"content": collectInlineContent(n, src, inlineStyles{}),
		})

	case *gast.List:
		convertList(n, src, out)

	case *gast.FencedCodeBlock:
		lang := ""
		if l := n.Language(src); l != nil {
			lang = string(l)
		}
		// Gather raw lines of the code block.
		var sb strings.Builder
		lines := n.Lines()
		for i := range lines.Len() {
			seg := lines.At(i)
			sb.Write(seg.Value(src))
		}
		raw := sb.String()
		// Trim trailing newline added by goldmark.
		raw = strings.TrimRight(raw, "\n")
		*out = append(*out, map[string]any{
			"type":  "codeBlock",
			"props": map[string]any{"language": lang},
			"content": []any{
				map[string]any{
					"type":   "text",
					"text":   raw,
					"styles": map[string]any{},
				},
			},
		})

	case *gast.CodeBlock:
		// Indented code block (no language).
		var sb strings.Builder
		lines := n.Lines()
		for i := range lines.Len() {
			seg := lines.At(i)
			sb.Write(seg.Value(src))
		}
		raw := strings.TrimRight(sb.String(), "\n")
		*out = append(*out, map[string]any{
			"type":  "codeBlock",
			"props": map[string]any{"language": ""},
			"content": []any{
				map[string]any{
					"type":   "text",
					"text":   raw,
					"styles": map[string]any{},
				},
			},
		})

	case *gast.Blockquote:
		// No native blockquote in default BlockNote schema; render children inline.
		walkTopLevel(n, src, out)

	case *east.Table:
		*out = append(*out, convertTable(n, src))

	default:
		// Ignore unknown block types (ThematicBreak, HTMLBlock, etc.).
	}
}

// convertList converts a goldmark List node into bulletListItem or
// numberedListItem blocks, handling nested lists as children arrays.
func convertList(list *gast.List, src []byte, out *[]map[string]any) {
	blockType := "bulletListItem"
	if list.IsOrdered() {
		blockType = "numberedListItem"
	}

	for item := list.FirstChild(); item != nil; item = item.NextSibling() {
		li, ok := item.(*gast.ListItem)
		if !ok {
			continue
		}

		// The first child of a list item is typically a TextBlock (tight) or
		// Paragraph (loose). Subsequent children may be nested lists.
		var inlineContent []any
		var children []any

		for child := li.FirstChild(); child != nil; child = child.NextSibling() {
			switch c := child.(type) {
			case *gast.TextBlock:
				inlineContent = collectInlineContent(c, src, inlineStyles{})
			case *gast.Paragraph:
				inlineContent = collectInlineContent(c, src, inlineStyles{})
			case *gast.List:
				var nested []map[string]any
				convertList(c, src, &nested)
				for _, nb := range nested {
					children = append(children, nb)
				}
			default:
				// Other nested blocks (code, etc.) – skip inline merge.
			}
		}

		blk := map[string]any{
			"type":    blockType,
			"content": inlineContent,
		}
		if len(children) > 0 {
			blk["children"] = children
		}
		*out = append(*out, blk)
	}
}

// convertTable converts a goldmark GFM Table node into a BlockNote table block.
//
// BlockNote table shape (v0.51 default schema):
//
//	{
//	  "type": "table",
//	  "content": {
//	    "type": "tableContent",
//	    "rows": [
//	      {"cells": [<inline-content-array>, ...]},
//	      ...
//	    ]
//	  }
//	}
func convertTable(table *east.Table, src []byte) map[string]any {
	var rows []any

	for row := table.FirstChild(); row != nil; row = row.NextSibling() {
		var cells []any

		switch r := row.(type) {
		case *east.TableHeader:
			for cell := r.FirstChild(); cell != nil; cell = cell.NextSibling() {
				if c, ok := cell.(*east.TableCell); ok {
					cells = append(cells, collectInlineContent(c, src, inlineStyles{}))
				}
			}
		case *east.TableRow:
			for cell := r.FirstChild(); cell != nil; cell = cell.NextSibling() {
				if c, ok := cell.(*east.TableCell); ok {
					cells = append(cells, collectInlineContent(c, src, inlineStyles{}))
				}
			}
		}

		if len(cells) > 0 {
			rows = append(rows, map[string]any{"cells": cells})
		}
	}

	return map[string]any{
		"type": "table",
		"content": map[string]any{
			"type": "tableContent",
			"rows": rows,
		},
	}
}

// collectInlineContent walks the inline children of a block node and produces
// the BlockNote inline content array.
func collectInlineContent(parent gast.Node, src []byte, styles inlineStyles) []any {
	var runs []any
	collectInlineNodes(parent, src, styles, &runs)
	return runs
}

func collectInlineNodes(parent gast.Node, src []byte, styles inlineStyles, out *[]any) {
	for node := parent.FirstChild(); node != nil; node = node.NextSibling() {
		switch n := node.(type) {
		case *gast.Text:
			txt := string(n.Value(src))
			if txt == "" {
				continue
			}
			appendTextRun(out, txt, styles)
			if n.SoftLineBreak() {
				// Soft line breaks become a space between words.
				appendTextRun(out, " ", styles)
			}

		case *gast.String:
			txt := string(n.Value)
			if txt != "" {
				appendTextRun(out, txt, styles)
			}

		case *gast.CodeSpan:
			// Collect raw text inside the code span.
			var buf bytes.Buffer
			for c := n.FirstChild(); c != nil; c = c.NextSibling() {
				if t, ok := c.(*gast.Text); ok {
					buf.Write(t.Value(src))
				}
			}
			appendTextRun(out, buf.String(), inlineStyles{code: true})

		case *gast.Emphasis:
			childStyles := styles
			if n.Level == 1 {
				childStyles.italic = true
			} else {
				childStyles.bold = true
			}
			collectInlineNodes(n, src, childStyles, out)

		case *gast.Link:
			href := string(n.Destination)
			var linkContent []any
			collectInlineNodes(n, src, styles, &linkContent)
			*out = append(*out, map[string]any{
				"type":    "link",
				"href":    href,
				"content": linkContent,
			})

		case *gast.AutoLink:
			url := string(n.URL(src))
			label := string(n.Label(src))
			*out = append(*out, map[string]any{
				"type": "link",
				"href": url,
				"content": []any{
					map[string]any{
						"type":   "text",
						"text":   label,
						"styles": map[string]any{},
					},
				},
			})

		case *gast.Image:
			// Render alt text as plain text (images not supported as inline in BlockNote).
			var buf bytes.Buffer
			for c := n.FirstChild(); c != nil; c = c.NextSibling() {
				if t, ok := c.(*gast.Text); ok {
					buf.Write(t.Value(src))
				}
			}
			if buf.Len() > 0 {
				appendTextRun(out, buf.String(), styles)
			}

		default:
			// Recurse into unrecognized inline wrappers (e.g. Strikethrough).
			collectInlineNodes(n, src, styles, out)
		}
	}
}

// appendTextRun appends a {"type":"text","text":"…","styles":{…}} run to out.
// Consecutive runs with identical styles are merged to keep the output compact.
func appendTextRun(out *[]any, text string, styles inlineStyles) {
	styleMap := buildStyleMap(styles)

	// Merge with previous run when styles are identical.
	if len(*out) > 0 {
		if prev, ok := (*out)[len(*out)-1].(map[string]any); ok {
			if prev["type"] == "text" {
				if prevStyles, ok2 := prev["styles"].(map[string]any); ok2 && stylesEqual(prevStyles, styleMap) {
					prev["text"] = prev["text"].(string) + text
					(*out)[len(*out)-1] = prev
					return
				}
			}
		}
	}

	*out = append(*out, map[string]any{
		"type":   "text",
		"text":   text,
		"styles": styleMap,
	})
}

func buildStyleMap(s inlineStyles) map[string]any {
	m := map[string]any{}
	if s.bold {
		m["bold"] = true
	}
	if s.italic {
		m["italic"] = true
	}
	if s.code {
		m["code"] = true
	}
	return m
}

// stylesEqual compares two style maps for equality.
// Both are expected to be map[string]any with bool values.
func stylesEqual(a, b map[string]any) bool {
	if len(a) != len(b) {
		return false
	}
	for k, v := range a {
		if bv, ok := b[k]; !ok || bv != v {
			return false
		}
	}
	return true
}

func emptyParagraph() map[string]any {
	return map[string]any{
		"type":    "paragraph",
		"content": []any{},
	}
}
