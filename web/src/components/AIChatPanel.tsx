/**
 * G6 — AI Chat Panel (Phase 3: docked right rail, citations, spend meter)
 * Always-on right rail: sets --ai-w on <html> so content shifts rather than
 * being covered. Backdrop removed. Close button collapses.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useQueryClient } from '@tanstack/react-query';
import {
  useConversations,
  useCreateConversation,
  useConversationMessages,
  useApproveToolCall,
  useRejectToolCall,
  useProjectAutonomy,
  useAIUsage,
  aiKeys,
} from '@/hooks/useAIQueries';
import type { AIMessage, AIToolCall, AIConversation } from '@/hooks/useAIQueries';
import { readSSEStream } from '@/api/sseParser';
import type { SSEEvent } from '@/api/sseParser';
import { ApiError, apiFetchRaw } from '@/api/client';

const PANEL_WIDTH = 380;

// ─── Types for streaming state ────────────────────────────────────────────────

interface StreamingMessage {
  role: 'assistant';
  content: string;
  toolCalls: StreamingToolCall[];
  warnings: string[];
}

interface StreamingToolCall {
  id: string;
  name: string;
  arguments: unknown;
  status?: string;
  result?: unknown;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatToolArgs(args: unknown): string {
  let obj: unknown = args;
  if (typeof obj === 'string') {
    const str = obj;
    try { obj = JSON.parse(str); } catch { return str.trim() ? `(${str})` : '()'; }
  }
  if (obj == null || typeof obj !== 'object') return '()';
  const entries = Object.entries(obj as Record<string, unknown>);
  if (entries.length === 0) return '()';
  const inner = entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ');
  return `(${inner})`;
}

function formatToolResult(result: unknown): string {
  if (result == null) return '';
  if (typeof result === 'string') return result.slice(0, 120);
  if (typeof result === 'object') {
    const s = JSON.stringify(result);
    return s.length > 120 ? s.slice(0, 120) + '…' : s;
  }
  return String(result);
}

function isProposedToolCall(tc: AIToolCall | StreamingToolCall): boolean {
  return tc.status === 'proposed';
}

// Pretty-print a tool-result payload (string or JSON) for the expanded view.
function formatResultBody(content: string): string {
  const trimmed = content.trim();
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return trimmed;
  }
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

// Assistant messages arrive as markdown (headings, lists, tables, code). Render
// them with GFM support; scoped `.md` styles keep it readable in the narrow rail.
function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

// ─── Tool-result message (collapsed) ──────────────────────────────────────────

// Persisted 'tool' role messages hold a raw result payload. Render them as a
// compact, collapsed-by-default disclosure so the conversation stays readable.
function ToolResultMessage({ msg }: { msg: AIMessage }) {
  const [expanded, setExpanded] = useState(false);
  const label = msg.name ? `${msg.name} result` : 'tool result';
  return (
    <div style={{ width: '100%', maxWidth: '88%', margin: '0 0 8px' }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
          fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--muted-2)',
          padding: '2px 6px', border: '1px solid var(--line)', borderRadius: 6,
          background: 'var(--paper-2)',
        }}
      >
        <span>{expanded ? '▾' : '▸'}</span>
        <span>{label}</span>
      </div>
      {expanded && (
        <pre style={{
          margin: '4px 0 0', padding: '8px 10px', background: 'var(--paper-2)',
          border: '1px solid var(--line)', borderRadius: 6, fontSize: 11,
          fontFamily: 'var(--mono)', color: 'var(--muted)', whiteSpace: 'pre-wrap',
          wordBreak: 'break-word', maxHeight: 220, overflow: 'auto',
        }}>
          {formatResultBody(msg.content)}
        </pre>
      )}
    </div>
  );
}

// ─── Tool-call card ───────────────────────────────────────────────────────────

interface ToolCallCardProps {
  tc: AIToolCall | StreamingToolCall;
  convId: string;
  onApprove?: () => void;
  onReject?: () => void;
}

function ToolCallCard({ tc, convId, onApprove, onReject }: ToolCallCardProps) {
  const approve = useApproveToolCall(convId);
  const reject = useRejectToolCall(convId);
  const proposed = isProposedToolCall(tc);
  // Collapsed by default to keep the conversation readable; click to expand.
  const [expanded, setExpanded] = useState(false);

  const handleApprove = async () => { await approve.mutateAsync(tc.id); onApprove?.(); };
  const handleReject = async () => { await reject.mutateAsync(tc.id); onReject?.(); };

  return (
    <div style={{
      margin: '6px 0', padding: '8px 10px',
      background: proposed ? 'var(--ember-tint)' : 'var(--paper-2)',
      border: `1px solid ${proposed ? 'var(--ember-soft)' : 'var(--line)'}`,
      borderRadius: 6, fontSize: 11.5, fontFamily: 'var(--mono)',
    }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap', cursor: 'pointer' }}
      >
        <span style={{ color: 'var(--muted-2)', fontSize: 10 }}>{expanded ? '▾' : '▸'}</span>
        <span style={{ color: 'var(--ember)', fontWeight: 600 }}>{tc.name}</span>
        {expanded && <span style={{ color: 'var(--muted)' }}>{formatToolArgs(tc.arguments)}</span>}
      </div>
      {expanded && tc.result != null && (
        <div style={{ color: 'var(--muted)', marginTop: 3 }}>→ {formatToolResult(tc.result)}</div>
      )}
      {proposed && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button style={{ padding: '3px 9px', borderRadius: 4, background: 'var(--ink)', color: 'var(--paper)', fontSize: 11, fontFamily: 'var(--sans)', cursor: 'default' }}
            onClick={() => void handleApprove()} disabled={approve.isPending}>
            {approve.isPending ? 'Approving…' : 'Approve'}
          </button>
          <button style={{ padding: '3px 9px', borderRadius: 4, background: 'transparent', color: 'var(--muted)', fontSize: 11, fontFamily: 'var(--sans)', border: '1px solid var(--line)', cursor: 'default' }}
            onClick={() => void handleReject()} disabled={reject.isPending}>
            {reject.isPending ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Citations ────────────────────────────────────────────────────────────────

interface CitationChipsProps {
  toolCalls: AIToolCall[];
}

function CitationChips({ toolCalls }: CitationChipsProps) {
  const executed = toolCalls.filter(tc => tc.result != null);
  if (executed.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
      {executed.map((tc, i) => (
        <span
          key={tc.id}
          title={`${tc.name}: ${formatToolResult(tc.result)}`}
          style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '1px 6px', borderRadius: 99,
            background: 'var(--ember-tint)', border: '1px solid var(--ember-soft)',
            color: 'var(--ember)', fontSize: 10, fontFamily: 'var(--mono)',
            cursor: 'default', userSelect: 'none',
          }}
        >
          [{i + 1}] {tc.name}
        </span>
      ))}
    </div>
  );
}

// ─── Single message bubble ────────────────────────────────────────────────────

interface MessageBubbleProps { msg: AIMessage; convId: string; }

function MessageBubble({ msg, convId }: MessageBubbleProps) {
  // Tool-result messages render as a collapsed disclosure, not a chat bubble.
  if (msg.role === 'tool') return <ToolResultMessage msg={msg} />;

  const isUser = msg.role === 'user';
  const isAssistant = msg.role === 'assistant';
  const hasContent = msg.content.trim().length > 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
      <div style={{ fontSize: 10.5, fontFamily: 'var(--mono)', color: 'var(--muted-2)', marginBottom: 3, textAlign: isUser ? 'right' : 'left' }}>
        {isUser ? 'you' : 'assistant'}{' · '}
        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
      {hasContent && (
        <div style={{
          maxWidth: '88%', padding: '8px 12px',
          borderRadius: isUser ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
          background: isUser ? 'var(--ink)' : 'var(--paper-2)',
          color: isUser ? 'var(--paper)' : 'var(--ink)',
          fontSize: 13, lineHeight: 1.55, wordBreak: 'break-word',
          ...(isUser ? { whiteSpace: 'pre-wrap' } : {}),
        }}>
          {isUser ? msg.content : <Markdown text={msg.content} />}
        </div>
      )}
      {isAssistant && msg.tool_calls && msg.tool_calls.length > 0 && (
        <div style={{ marginTop: 4, width: '100%', maxWidth: '88%' }}>
          {msg.tool_calls.map(tc => <ToolCallCard key={tc.id} tc={tc} convId={convId} />)}
          <CitationChips toolCalls={msg.tool_calls} />
        </div>
      )}
    </div>
  );
}

// ─── Streaming bubble ─────────────────────────────────────────────────────────

interface StreamingBubbleProps { msg: StreamingMessage; convId: string; }

function StreamingBubble({ msg, convId }: StreamingBubbleProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginBottom: 12 }}>
      <div style={{ fontSize: 10.5, fontFamily: 'var(--mono)', color: 'var(--muted-2)', marginBottom: 3 }}>
        assistant · streaming…
      </div>
      {msg.warnings.map((w, i) => (
        <div key={i} style={{ background: '#fff8e6', border: '1px solid var(--warn)', color: 'var(--warn)', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontFamily: 'var(--mono)', marginBottom: 6, width: '100%' }}>
          Warning: {w}
        </div>
      ))}
      {msg.content && (
        <div style={{ maxWidth: '88%', padding: '8px 12px', borderRadius: '10px 10px 10px 2px', background: 'var(--paper-2)', color: 'var(--ink)', fontSize: 13, lineHeight: 1.55, wordBreak: 'break-word' }}>
          <Markdown text={msg.content} />
          <span style={{ display: 'inline-block', width: 8, height: 14, background: 'var(--ember)', marginLeft: 2, borderRadius: 1, verticalAlign: 'text-bottom', animation: 'blink 1s step-start infinite' }} />
        </div>
      )}
      {msg.toolCalls.map((tc, i) => (
        <div key={i} style={{ marginTop: 4, width: '88%' }}>
          <ToolCallCard tc={tc as AIToolCall} convId={convId} />
        </div>
      ))}
    </div>
  );
}

// ─── Conversation picker ──────────────────────────────────────────────────────

interface ConvPickerProps {
  projectId: string;
  conversations: AIConversation[];
  selected: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  creating: boolean;
}

function ConvPicker({ conversations, selected, onSelect, onNew, creating }: ConvPickerProps) {
  return (
    <div style={{ borderBottom: '1px solid var(--line)', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <select className="field-input" value={selected ?? ''} onChange={e => onSelect(e.target.value)}
        style={{ fontSize: 12, flex: 1, padding: '3px 6px', height: 28 }}>
        <option value="" disabled>{conversations.length === 0 ? 'No conversations yet' : 'Select conversation…'}</option>
        {conversations.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select>
      <button className="top-btn primary" style={{ fontSize: 11, whiteSpace: 'nowrap', padding: '3px 8px' }} onClick={onNew} disabled={creating}>
        {creating ? '…' : '+ New'}
      </button>
    </div>
  );
}

// ─── Autonomy + Spend Strip ───────────────────────────────────────────────────

interface StatusStripProps {
  projectId: string;
  workspaceId: string | undefined;
}

function StatusStrip({ projectId, workspaceId }: StatusStripProps) {
  const { data: autonomy } = useProjectAutonomy(projectId);
  const { data: usage } = useAIUsage(workspaceId);

  const modeLabel = autonomy?.mode
    ? autonomy.mode.replace(/_/g, ' ')
    : null;

  return (
    <div style={{
      padding: '7px 12px',
      borderBottom: '1px solid var(--line)',
      background: 'var(--paper-2)',
      display: 'flex',
      flexDirection: 'column',
      gap: 5,
      fontSize: 11,
      fontFamily: 'var(--mono)',
      color: 'var(--muted)',
    }}>
      {modeLabel && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--muted-2)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>mode</span>
          <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{modeLabel}</span>
        </div>
      )}
      {usage && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span>
              {usage.model ? `${usage.model} · ` : ''}
              ${usage.spent_today.toFixed(4)} today
            </span>
            <span style={{ color: usage.pct >= 0.8 ? 'var(--warn)' : 'var(--muted-2)' }}>
              {Math.round(usage.pct * 100)}% of ${usage.monthly_cap}/mo
            </span>
          </div>
          <div style={{ height: 3, borderRadius: 99, background: 'var(--line)', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(usage.pct * 100, 100)}%`,
              background: usage.pct >= 0.8 ? 'var(--warn)' : 'var(--ember)',
              borderRadius: 99,
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export interface AIChatPanelSeed {
  skill?: string;
  message?: string;
}

interface AIChatPanelProps {
  projectId: string;
  onClose: () => void;
  workspaceId?: string;
  seed?: AIChatPanelSeed;
}

export function AIChatPanel({ projectId, onClose, workspaceId, seed }: AIChatPanelProps) {
  const qc = useQueryClient();
  const { data: conversations = [], isLoading: convLoading } = useConversations(projectId);
  const createConv = useCreateConversation(projectId);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const { data: messages = [], isLoading: msgsLoading } = useConversationMessages(selectedConvId ?? undefined);

  const [streaming, setStreaming] = useState<StreamingMessage | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Guard: auto-send the seed message exactly once after the seeded conversation
  // is selected. A ref prevents re-firing on re-renders.
  const didSeedSend = useRef(false);

  // Set/clear --ai-w on <html> so the main content area shifts.
  useEffect(() => {
    document.documentElement.style.setProperty('--ai-w', `${PANEL_WIDTH}px`);
    return () => {
      document.documentElement.style.setProperty('--ai-w', '0px');
    };
  }, []);

  useEffect(() => {
    if (convLoading) return;
    if (conversations.length > 0 && !selectedConvId) setSelectedConvId(conversations[0].id);
  }, [conversations, selectedConvId, convLoading]);

  const didAutoCreate = useRef(false);
  useEffect(() => {
    if (convLoading || didAutoCreate.current) return;
    if (conversations.length === 0 && !createConv.isPending) {
      didAutoCreate.current = true;
      if (seed?.skill) {
        // Seeded flow: create a "Risk Assessment" conversation with the skill.
        createConv.mutate(
          { title: 'Risk Assessment', skill: seed.skill },
          {
            onSuccess: conv => setSelectedConvId(conv.id),
            onError: () => { didAutoCreate.current = false; },
          },
        );
      } else {
        // Normal flow: create a generic "General" conversation.
        createConv.mutate('General', {
          onSuccess: conv => setSelectedConvId(conv.id),
          onError: () => { didAutoCreate.current = false; },
        });
      }
    }
  }, [conversations, convLoading, createConv, seed]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  // Auto-send the seed kickoff message exactly once after the seeded conversation
  // is selected and the message list has loaded empty (freshly created conv).
  // didSeedSend guards against re-firing on re-renders.
  useEffect(() => {
    if (!seed?.message) return;
    if (!selectedConvId) return;
    if (sending) return;
    if (didSeedSend.current) return;
    if (msgsLoading) return;
    if (messages.length > 0) return; // conv already has messages — don't re-seed

    didSeedSend.current = true;
    void handleSend(seed.message);
    // handleSend is stable via useCallback; seed/selectedConvId/sending are captured above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, selectedConvId, sending, msgsLoading, messages.length]);

  const handleNewConversation = async () => {
    const title = `Chat ${new Date().toLocaleDateString()}`;
    const conv = await createConv.mutateAsync(title);
    setSelectedConvId(conv.id);
  };

  const handleSend = useCallback(async (overrideContent?: string) => {
    const content = (overrideContent ?? draft).trim();
    if (!content || !selectedConvId || sending) return;

    if (!overrideContent) setDraft('');
    setSendError(null);
    setSending(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const streamMsg: StreamingMessage = { role: 'assistant', content: '', toolCalls: [], warnings: [] };
    setStreaming(streamMsg);

    try {
      const response = await apiFetchRaw(`/v1/ai/conversations/${selectedConvId}/messages`, {
        method: 'POST',
        headers: { Accept: 'text/event-stream' },
        body: JSON.stringify({ content }),
        signal: controller.signal,
      });

      if (response.status === 503) {
        setAiUnavailable(true); setStreaming(null); setSending(false); return;
      }
      if (!response.ok) {
        let msg = response.statusText;
        try {
          const body = await response.json() as { message?: string; detail?: string };
          msg = body.message ?? body.detail ?? msg;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      setAiUnavailable(false);

      await readSSEStream(response, (ev: SSEEvent) => {
        setStreaming(prev => {
          if (!prev) return prev;
          if (ev.type === 'token') return { ...prev, content: prev.content + ev.delta };
          if (ev.type === 'tool_call') {
            const existing = prev.toolCalls.find(tc => tc.id === ev.id);
            if (existing) return { ...prev, toolCalls: prev.toolCalls.map(tc => tc.id === ev.id ? { ...tc, status: ev.status } : tc) };
            return { ...prev, toolCalls: [...prev.toolCalls, { id: ev.id, name: ev.name, arguments: ev.arguments, status: ev.status }] };
          }
          if (ev.type === 'tool_result') return { ...prev, toolCalls: prev.toolCalls.map(tc => tc.id === ev.id ? { ...tc, result: ev.result } : tc) };
          if (ev.type === 'warn') return { ...prev, warnings: [...prev.warnings, ev.message] };
          return prev;
        });
        if (ev.type === 'done' || ev.type === 'error') {
          if (ev.type === 'error') setSendError(ev.message);
          void qc.invalidateQueries({ queryKey: aiKeys.conversationMessages(selectedConvId) });
          setStreaming(null); setSending(false);
        }
      }, controller.signal);
    } catch (err) {
      if ((err as Error).name === 'AbortError') { /* cancelled */ }
      else if (err instanceof ApiError && err.status === 503) setAiUnavailable(true);
      else setSendError((err as Error).message ?? 'Failed to send message');
      setStreaming(null); setSending(false);
    }
  }, [draft, selectedConvId, sending, qc]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); }
  };

  return (
    <>
      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        .ai-panel { position: fixed; top: 0; right: 0; bottom: 0; width: ${PANEL_WIDTH}px; max-width: 90vw; background: var(--surface); border-left: 1px solid var(--line); display: flex; flex-direction: column; z-index: 100; box-shadow: -4px 0 24px rgba(20,18,14,0.10); }
        .ai-panel-head { padding: 14px 16px; border-bottom: 1px solid var(--line); display: flex; align-items: center; gap: 10px; background: var(--paper); flex-shrink: 0; }
        .ai-orb { width: 10px; height: 10px; border-radius: 50%; background: var(--ember); flex-shrink: 0; }
        .ai-messages { flex: 1; overflow-y: auto; padding: 16px 14px; display: flex; flex-direction: column; }
        .ai-composer { border-top: 1px solid var(--line); padding: 10px 12px; background: var(--paper); flex-shrink: 0; }
        .md > *:first-child { margin-top: 0; }
        .md > *:last-child { margin-bottom: 0; }
        .md p { margin: 0 0 8px; }
        .md h1, .md h2, .md h3, .md h4 { margin: 12px 0 6px; line-height: 1.3; font-weight: 650; }
        .md h1 { font-size: 16px; } .md h2 { font-size: 14.5px; } .md h3 { font-size: 13.5px; } .md h4 { font-size: 13px; }
        .md ul, .md ol { margin: 0 0 8px; padding-left: 18px; }
        .md li { margin: 2px 0; }
        .md li > p { margin: 0; }
        .md a { color: var(--ember); text-decoration: underline; }
        .md code { font-family: var(--mono); font-size: 11.5px; background: var(--paper); border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; }
        .md pre { margin: 0 0 8px; padding: 8px 10px; background: var(--paper); border: 1px solid var(--line); border-radius: 6px; overflow-x: auto; }
        .md pre code { background: none; border: 0; padding: 0; font-size: 11.5px; }
        .md blockquote { margin: 0 0 8px; padding: 2px 0 2px 10px; border-left: 3px solid var(--line); color: var(--muted); }
        .md table { border-collapse: collapse; margin: 0 0 8px; display: block; overflow-x: auto; font-size: 12px; }
        .md th, .md td { border: 1px solid var(--line); padding: 3px 7px; text-align: left; vertical-align: top; }
        .md th { background: var(--paper); font-weight: 600; }
        .md hr { border: 0; border-top: 1px solid var(--line); margin: 10px 0; }
      `}</style>

      <aside className="ai-panel">
        <div className="ai-panel-head">
          <div className="ai-orb" />
          <div style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>LLM Assistant</div>
          <button className="icon-btn" onClick={onClose} style={{ fontSize: 16 }}>✕</button>
        </div>

        {/* Autonomy + spend strip */}
        <StatusStrip projectId={projectId} workspaceId={workspaceId} />

        {aiUnavailable && (
          <div style={{ padding: '10px 14px', background: 'var(--pill-blocked-bg)', color: 'var(--bad)', borderBottom: '1px solid var(--pill-blocked-bd)', fontSize: 12.5, fontFamily: 'var(--mono)' }}>
            LLM is not configured. Contact your workspace admin.
          </div>
        )}

        <ConvPicker
          projectId={projectId}
          conversations={conversations}
          selected={selectedConvId}
          onSelect={setSelectedConvId}
          onNew={() => void handleNewConversation()}
          creating={createConv.isPending}
        />

        <div className="ai-messages">
          {msgsLoading && <div style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', padding: 20 }}>Loading…</div>}
          {!msgsLoading && messages.length === 0 && !streaming && (
            <div style={{ color: 'var(--muted)', fontSize: 12.5, textAlign: 'center', padding: 32 }}>
              Start a conversation. Ask about project status, risks, or request drafts.
            </div>
          )}
          {messages.map(msg => <MessageBubble key={msg.seq} msg={msg} convId={selectedConvId ?? ''} />)}
          {streaming && <StreamingBubble msg={streaming} convId={selectedConvId ?? ''} />}
          {sendError && (
            <div style={{ padding: '8px 12px', background: 'var(--pill-blocked-bg)', color: 'var(--bad)', borderRadius: 6, fontSize: 12, fontFamily: 'var(--mono)', marginBottom: 8 }}>
              Error: {sendError}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="ai-composer">
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)', padding: '6px 8px' }}>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={selectedConvId ? 'Ask, summarize, or draft a page…' : 'Select a conversation first'}
              disabled={!selectedConvId || sending}
              rows={2}
              style={{ flex: 1, border: 0, background: 'transparent', resize: 'none', fontSize: 13, fontFamily: 'var(--sans)', color: 'var(--ink)', outline: 'none', lineHeight: 1.5 }}
            />
            <button className="top-btn primary" style={{ fontSize: 11.5, padding: '5px 10px', flexShrink: 0 }}
              onClick={() => void handleSend()} disabled={!draft.trim() || !selectedConvId || sending}>
              {sending ? '…' : 'Send'}
            </button>
          </div>
          <div style={{ fontSize: 10.5, fontFamily: 'var(--mono)', color: 'var(--muted-2)', marginTop: 5, display: 'flex', gap: 6 }}>
            <span>Enter to send · Shift+Enter for newline</span>
          </div>
        </div>
      </aside>
    </>
  );
}
