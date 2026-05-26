/**
 * Tests for:
 * 1. SSE frame parser (parseSSEChunk) — splits event:/data: frames and accumulates token deltas
 * 2. Autonomy mode logic — mode permissiveness ordering
 */
import { describe, it, expect } from 'vitest';
import { parseSSEChunk } from '../api/sseParser';
import type { SSEEvent } from '../api/sseParser';

// ─── SSE Parser Tests ─────────────────────────────────────────────────────────

describe('parseSSEChunk', () => {
  it('parses a single token event', () => {
    const text = 'event: token\ndata: {"delta":"Hello"}\n\n';
    const events = parseSSEChunk(text);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'token', delta: 'Hello' });
  });

  it('parses multiple frames separated by blank lines', () => {
    const text =
      'event: token\ndata: {"delta":"Hello"}\n\n' +
      'event: token\ndata: {"delta":" world"}\n\n';
    const events = parseSSEChunk(text);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'token', delta: 'Hello' });
    expect(events[1]).toEqual({ type: 'token', delta: ' world' });
  });

  it('accumulates token deltas into full text', () => {
    const text =
      'event: token\ndata: {"delta":"The "}\n\n' +
      'event: token\ndata: {"delta":"quick "}\n\n' +
      'event: token\ndata: {"delta":"fox"}\n\n';
    const events = parseSSEChunk(text);
    const fullText = events
      .filter(e => e.type === 'token')
      .map(e => (e as { type: 'token'; delta: string }).delta)
      .join('');
    expect(fullText).toBe('The quick fox');
  });

  it('parses a tool_call event', () => {
    const payload = {
      id: 'tc_001',
      name: 'search_project_content',
      arguments: { q: 'cycling failures' },
      status: 'proposed',
    };
    const text = `event: tool_call\ndata: ${JSON.stringify(payload)}\n\n`;
    const events = parseSSEChunk(text);
    expect(events).toHaveLength(1);
    const ev = events[0] as Extract<SSEEvent, { type: 'tool_call' }>;
    expect(ev.type).toBe('tool_call');
    expect(ev.id).toBe('tc_001');
    expect(ev.name).toBe('search_project_content');
    expect(ev.arguments).toEqual({ q: 'cycling failures' });
    expect(ev.status).toBe('proposed');
  });

  it('parses a tool_result event', () => {
    const payload = { id: 'tc_001', name: 'search_project_content', result: ['match1', 'match2'] };
    const text = `event: tool_result\ndata: ${JSON.stringify(payload)}\n\n`;
    const events = parseSSEChunk(text);
    expect(events).toHaveLength(1);
    const ev = events[0] as Extract<SSEEvent, { type: 'tool_result' }>;
    expect(ev.type).toBe('tool_result');
    expect(ev.result).toEqual(['match1', 'match2']);
  });

  it('parses a warn event', () => {
    const text = 'event: warn\ndata: {"message":"80% spend cap reached"}\n\n';
    const events = parseSSEChunk(text);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'warn', message: '80% spend cap reached' });
  });

  it('parses a done event', () => {
    const text = 'event: done\ndata: {"conversation_id":"conv_abc"}\n\n';
    const events = parseSSEChunk(text);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'done', conversation_id: 'conv_abc' });
  });

  it('parses an error event', () => {
    const text = 'event: error\ndata: {"code":"ai.unavailable","message":"AI not configured"}\n\n';
    const events = parseSSEChunk(text);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'error', code: 'ai.unavailable', message: 'AI not configured' });
  });

  it('skips frames with unparseable JSON', () => {
    const text =
      'event: token\ndata: not-valid-json\n\n' +
      'event: done\ndata: {"conversation_id":"conv_x"}\n\n';
    const events = parseSSEChunk(text);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('done');
  });

  it('skips frames with unknown event types', () => {
    const text = 'event: custom_unknown\ndata: {"foo":"bar"}\n\n';
    const events = parseSSEChunk(text);
    expect(events).toHaveLength(0);
  });

  it('handles frames with missing event or data lines', () => {
    const text = 'data: {"delta":"no event line"}\n\n';
    const events = parseSSEChunk(text);
    expect(events).toHaveLength(0);
  });

  it('handles empty input', () => {
    expect(parseSSEChunk('')).toHaveLength(0);
    expect(parseSSEChunk('\n\n')).toHaveLength(0);
  });

  it('parses mixed event types in one chunk', () => {
    const text =
      'event: token\ndata: {"delta":"Starting "}\n\n' +
      'event: tool_call\ndata: {"id":"tc_1","name":"search_project_content","arguments":{}}\n\n' +
      'event: token\ndata: {"delta":"result"}\n\n' +
      'event: warn\ndata: {"message":"rate limit"}\n\n' +
      'event: done\ndata: {"conversation_id":"conv_1"}\n\n';
    const events = parseSSEChunk(text);
    expect(events).toHaveLength(5);
    expect(events.map(e => e.type)).toEqual(['token', 'tool_call', 'token', 'warn', 'done']);
  });
});

// ─── Autonomy Mode Logic Tests ─────────────────────────────────────────────────

type AutonomyMode = 'read_only' | 'suggest_writes' | 'auto_routine' | 'full';

const MODE_PERMISSIVENESS: Record<AutonomyMode, number> = {
  read_only: 0,
  suggest_writes: 1,
  auto_routine: 2,
  full: 3,
};

function modeMorePermissive(a: AutonomyMode, b: AutonomyMode): boolean {
  return MODE_PERMISSIVENESS[a] > MODE_PERMISSIVENESS[b];
}

describe('autonomy mode permissiveness', () => {
  it('full is more permissive than read_only', () => {
    expect(modeMorePermissive('full', 'read_only')).toBe(true);
  });

  it('read_only is not more permissive than suggest_writes', () => {
    expect(modeMorePermissive('read_only', 'suggest_writes')).toBe(false);
  });

  it('equal modes are not more permissive', () => {
    expect(modeMorePermissive('suggest_writes', 'suggest_writes')).toBe(false);
  });

  it('auto_routine is more permissive than suggest_writes', () => {
    expect(modeMorePermissive('auto_routine', 'suggest_writes')).toBe(true);
  });

  it('modes are correctly ordered: read_only < suggest_writes < auto_routine < full', () => {
    const modes: AutonomyMode[] = ['read_only', 'suggest_writes', 'auto_routine', 'full'];
    for (let i = 0; i < modes.length - 1; i++) {
      expect(modeMorePermissive(modes[i + 1], modes[i])).toBe(true);
      expect(modeMorePermissive(modes[i], modes[i + 1])).toBe(false);
    }
  });

  it('project cannot exceed workspace cap (example: ws=suggest_writes blocks auto_routine)', () => {
    const wsCap: AutonomyMode = 'suggest_writes';
    const projectModes: AutonomyMode[] = ['read_only', 'suggest_writes', 'auto_routine', 'full'];
    const blocked = projectModes.filter(m => modeMorePermissive(m, wsCap));
    expect(blocked).toEqual(['auto_routine', 'full']);
  });
});
