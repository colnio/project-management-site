package ai

import (
	"encoding/json"
	"testing"
)

// helper: marshal v to JSON and back into any so we can do deep comparison
// without worrying about concrete types from map[string]any vs interface{}.
func roundtrip(t *testing.T, v any) any {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("roundtrip marshal: %v", err)
	}
	var out any
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatalf("roundtrip unmarshal: %v", err)
	}
	return out
}

// get digs into a JSON-decoded interface{} tree using a chain of string keys.
func get(v any, keys ...string) any {
	for _, k := range keys {
		m, ok := v.(map[string]interface{})
		if !ok {
			return nil
		}
		v = m[k]
	}
	return v
}

func TestMarkdownHeading(t *testing.T) {
	blocks := markdownToBlockNoteBlocks("## My Section\n\nSome paragraph text.\n")
	if len(blocks) < 2 {
		t.Fatalf("expected at least 2 blocks, got %d", len(blocks))
	}

	rt := roundtrip(t, blocks).([]interface{})

	// First block: heading level 2.
	h := rt[0]
	if got := get(h, "type"); got != "heading" {
		t.Errorf("block[0].type: want heading, got %v", got)
	}
	if got := get(h, "props", "level"); got != float64(2) {
		t.Errorf("block[0].props.level: want 2, got %v", got)
	}
	content := get(h, "content").([]interface{})
	if len(content) == 0 {
		t.Error("heading content is empty")
	}
	if got := get(content[0], "text"); got != "My Section" {
		t.Errorf("heading text: want 'My Section', got %v", got)
	}

	// Second block: paragraph.
	p := rt[1]
	if got := get(p, "type"); got != "paragraph" {
		t.Errorf("block[1].type: want paragraph, got %v", got)
	}
}

func TestMarkdownBoldAndLink(t *testing.T) {
	blocks := markdownToBlockNoteBlocks("This has **bold text** and a [link](http://x.example.com) here.\n")
	if len(blocks) == 0 {
		t.Fatal("expected at least 1 block")
	}

	rt := roundtrip(t, blocks).([]interface{})
	p := rt[0]
	if got := get(p, "type"); got != "paragraph" {
		t.Fatalf("block[0].type: want paragraph, got %v", got)
	}

	content := get(p, "content").([]interface{})

	// Find the bold run.
	foundBold := false
	foundLink := false
	for _, run := range content {
		rm, ok := run.(map[string]interface{})
		if !ok {
			continue
		}
		if rm["type"] == "text" {
			styles, _ := rm["styles"].(map[string]interface{})
			if styles["bold"] == true {
				foundBold = true
			}
		}
		if rm["type"] == "link" {
			if href, _ := rm["href"].(string); href == "http://x.example.com" {
				foundLink = true
			}
		}
	}

	if !foundBold {
		b, _ := json.MarshalIndent(content, "", "  ")
		t.Errorf("no bold text run found in paragraph content:\n%s", b)
	}
	if !foundLink {
		b, _ := json.MarshalIndent(content, "", "  ")
		t.Errorf("no link run with href http://x.example.com found:\n%s", b)
	}
}

func TestMarkdownNumberedList(t *testing.T) {
	md := "1. First item\n2. Second item\n3. Third item\n"
	blocks := markdownToBlockNoteBlocks(md)
	if len(blocks) != 3 {
		t.Fatalf("expected 3 list item blocks, got %d", len(blocks))
	}

	rt := roundtrip(t, blocks).([]interface{})
	for i, blk := range rt {
		if got := get(blk, "type"); got != "numberedListItem" {
			t.Errorf("block[%d].type: want numberedListItem, got %v", i, got)
		}
	}

	// Verify text of first item.
	first := rt[0]
	content := get(first, "content").([]interface{})
	if len(content) == 0 {
		t.Fatal("first list item content is empty")
	}
	if got := get(content[0], "text"); got != "First item" {
		t.Errorf("first item text: want 'First item', got %v", got)
	}
}

func TestMarkdownFencedCodeBlock(t *testing.T) {
	md := "```go\nfunc hello() {\n\tfmt.Println(\"world\")\n}\n```\n"
	blocks := markdownToBlockNoteBlocks(md)
	if len(blocks) == 0 {
		t.Fatal("expected at least 1 block")
	}

	rt := roundtrip(t, blocks).([]interface{})
	cb := rt[0]

	if got := get(cb, "type"); got != "codeBlock" {
		t.Fatalf("block[0].type: want codeBlock, got %v", got)
	}
	if got := get(cb, "props", "language"); got != "go" {
		t.Errorf("codeBlock language: want 'go', got %v", got)
	}

	content := get(cb, "content").([]interface{})
	if len(content) == 0 {
		t.Fatal("codeBlock content is empty")
	}
	raw := get(content[0], "text").(string)
	if raw == "" {
		t.Error("codeBlock text is empty")
	}
	if !contains(raw, "fmt.Println") {
		t.Errorf("codeBlock text should contain 'fmt.Println', got: %q", raw)
	}
}

func TestMarkdownGFMTable(t *testing.T) {
	md := "| Name    | Score |\n|---------|-------|\n| Alice   | 95    |\n| Bob     | 87    |\n"
	blocks := markdownToBlockNoteBlocks(md)
	if len(blocks) == 0 {
		t.Fatal("expected at least 1 block")
	}

	rt := roundtrip(t, blocks).([]interface{})
	tableBlk := rt[0]

	if got := get(tableBlk, "type"); got != "table" {
		t.Fatalf("block[0].type: want table, got %v", got)
	}

	content := get(tableBlk, "content")
	if content == nil {
		t.Fatal("table block has no content")
	}
	cm, ok := content.(map[string]interface{})
	if !ok {
		t.Fatalf("table content is not an object, got %T", content)
	}
	if cm["type"] != "tableContent" {
		t.Errorf("table content type: want tableContent, got %v", cm["type"])
	}

	rows, ok := cm["rows"].([]interface{})
	if !ok || len(rows) < 3 {
		// header + 2 data rows
		t.Fatalf("expected at least 3 rows (header + 2 data), got %v", cm["rows"])
	}

	// Inspect header row: should have 2 cells.
	headerRow := rows[0].(map[string]interface{})
	cells := headerRow["cells"].([]interface{})
	if len(cells) != 2 {
		t.Errorf("header row: want 2 cells, got %d", len(cells))
	}

	// Each cell is an array of inline runs. First cell should contain "Name".
	firstCell, ok := cells[0].([]interface{})
	if !ok || len(firstCell) == 0 {
		t.Fatal("first header cell is empty or wrong type")
	}
	nameText := get(firstCell[0], "text")
	if nameText != "Name" {
		t.Errorf("first header cell text: want 'Name', got %v", nameText)
	}

	// Data row 1 (rows[1]): first cell = "Alice", second cell = "95".
	dataRow1 := rows[1].(map[string]interface{})
	dataCells := dataRow1["cells"].([]interface{})
	if len(dataCells) != 2 {
		t.Errorf("data row 1: want 2 cells, got %d", len(dataCells))
	}
	aliceCell := dataCells[0].([]interface{})
	if text := get(aliceCell[0], "text").(string); text != "Alice" {
		t.Errorf("data row 1 cell 0: want 'Alice', got %q", text)
	}
}

func TestMarkdownEmptyInput(t *testing.T) {
	blocks := markdownToBlockNoteBlocks("")
	if len(blocks) != 1 {
		t.Fatalf("empty input: expected 1 paragraph block, got %d", len(blocks))
	}
	rt := roundtrip(t, blocks).([]interface{})
	if got := get(rt[0], "type"); got != "paragraph" {
		t.Errorf("empty input block type: want paragraph, got %v", got)
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(s) > 0 && containsHelper(s, sub))
}

func containsHelper(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
