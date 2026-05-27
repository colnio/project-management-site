/**
 * G6 — AI Chat Panel
 * Slide-over panel per project: pick/create conversation, stream messages,
 * render tool calls/results, citations, warnings, approve/reject proposed writes.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useConversations,
  useCreateConversation,
  useConversationMessages,
  useApproveToolCall,
  useRejectToolCall,
  aiKeys,
} from '@/hooks/useAIQueries';
import type { AIMessage, AIToolCall, AIConversation } from '@/hooks/useAIQueries';
import { readSSEStream } from '@/api/sseParser';
import type { SSEEvent } from '@/api/sseParser';
import { ApiError, getAccessToken } from '@/api/client';

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
  // Args may arrive as null/undefined (history with no args), a JSON string
  // (OpenAI-style function.arguments), or an object. Normalize all cases.
  let obj: unknown = args;
  if (typeof obj === 'string') {
    const str = obj;
    try {
      obj = JSON.parse(str);
    } catch {
      return str.trim() ? `(${str})` : '()';
    }
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

  const handleApprove = async () => {
    await approve.mutateAsync(tc.id);
    onApprove?.();
  };
  const handleReject = async () => {
    await reject.mutateAsync(tc.id);
    onReject?.();
  };

  return (
    <div
      style={{
        margin: '6px 0',
        padding: '8px 10px',
        background: proposed ? 'var(--ember-tint)' : 'var(--paper-2)',
        border: `1px solid ${proposed ? 'var(--ember-soft)' : 'var(--line)'}`,
        borderRadius: 6,
        fontSize: 11.5,
        fontFamily: 'var(--mono)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--ember)', fontWeight: 600 }}>{tc.name}</span>
        <span style={{ color: 'var(--muted)' }}>{formatToolArgs(tc.arguments)}</span>
      </div>
      {tc.result != null && (
        <div style={{ color: 'var(--muted)', marginTop: 3 }}>
          → {formatToolResult(tc.result)}
        </div>
      )}
      {proposed && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button
            style={{
              padding: '3px 9px',
              borderRadius: 4,
              background: 'var(--ink)',
              color: 'var(--paper)',
              fontSize: 11,
              fontFamily: 'var(--sans)',
              cursor: 'default',
            }}
            onClick={() => void handleApprove()}
            disabled={approve.isPending}
          >
            {approve.isPending ? 'Approving…' : 'Approve'}
          </button>
          <button
            style={{
              padding: '3px 9px',
              borderRadius: 4,
              background: 'transparent',
              color: 'var(--muted)',
              fontSize: 11,
              fontFamily: 'var(--sans)',
              border: '1px solid var(--line)',
              cursor: 'default',
            }}
            onClick={() => void handleReject()}
            disabled={reject.isPending}
          >
            {reject.isPending ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Single message bubble ────────────────────────────────────────────────────

interface MessageBubbleProps {
  msg: AIMessage;
  convId: string;
}

function MessageBubble({ msg, convId }: MessageBubbleProps) {
  const isUser = msg.role === 'user';
  const isAssistant = msg.role === 'assistant';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 12,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontFamily: 'var(--mono)',
          color: 'var(--muted-2)',
          marginBottom: 3,
          textAlign: isUser ? 'right' : 'left',
        }}
      >
        {isUser ? 'you' : 'assistant'}
        {' · '}
        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
      <div
        style={{
          maxWidth: '88%',
          padding: '8px 12px',
          borderRadius: isUser ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
          background: isUser ? 'var(--ink)' : 'var(--paper-2)',
          color: isUser ? 'var(--paper)' : 'var(--ink)',
          fontSize: 13,
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {msg.content}
      </div>
      {/* Tool calls from history */}
      {isAssistant && msg.tool_calls && msg.tool_calls.length > 0 && (
        <div style={{ marginTop: 4, width: '100%', maxWidth: '88%' }}>
          {msg.tool_calls.map(tc => (
            <ToolCallCard key={tc.id} tc={tc} convId={convId} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Streaming bubble ─────────────────────────────────────────────────────────

interface StreamingBubbleProps {
  msg: StreamingMessage;
  convId: string;
}

function StreamingBubble({ msg, convId }: StreamingBubbleProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginBottom: 12 }}>
      <div style={{ fontSize: 10.5, fontFamily: 'var(--mono)', color: 'var(--muted-2)', marginBottom: 3 }}>
        assistant · streaming…
      </div>
      {msg.warnings.map((w, i) => (
        <div
          key={i}
          style={{
            background: '#fff8e6',
            border: '1px solid var(--warn)',
            color: 'var(--warn)',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 12,
            fontFamily: 'var(--mono)',
            marginBottom: 6,
            width: '100%',
          }}
        >
          Warning: {w}
        </div>
      ))}
      {msg.content && (
        <div
          style={{
            maxWidth: '88%',
            padding: '8px 12px',
            borderRadius: '10px 10px 10px 2px',
            background: 'var(--paper-2)',
            color: 'var(--ink)',
            fontSize: 13,
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {msg.content}
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 14,
              background: 'var(--ember)',
              marginLeft: 2,
              borderRadius: 1,
              verticalAlign: 'text-bottom',
              animation: 'blink 1s step-start infinite',
            }}
          />
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
    <div
      style={{
        borderBottom: '1px solid var(--line)',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <select
        className="field-input"
        value={selected ?? ''}
        onChange={e => onSelect(e.target.value)}
        style={{ fontSize: 12, flex: 1, padding: '3px 6px', height: 28 }}
      >
        <option value="" disabled>
          {conversations.length === 0 ? 'No conversations yet' : 'Select conversation…'}
        </option>
        {conversations.map(c => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>
      <button
        className="top-btn primary"
        style={{ fontSize: 11, whiteSpace: 'nowrap', padding: '3px 8px' }}
        onClick={onNew}
        disabled={creating}
      >
        {creating ? '…' : '+ New'}
      </button>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface AIChatPanelProps {
  projectId: string;
  onClose: () => void;
}

export function AIChatPanel({ projectId, onClose }: AIChatPanelProps) {
  const qc = useQueryClient();
  const { data: conversations = [], isLoading: convLoading } = useConversations(projectId);
  const createConv = useCreateConversation(projectId);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const { data: messages = [], isLoading: msgsLoading } = useConversationMessages(selectedConvId ?? undefined);

  // Streaming state
  const [streaming, setStreaming] = useState<StreamingMessage | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Composer
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-select first conversation or auto-create if none
  useEffect(() => {
    if (convLoading) return;
    if (conversations.length > 0 && !selectedConvId) {
      setSelectedConvId(conversations[0].id);
    }
  }, [conversations, selectedConvId, convLoading]);

  // Auto-create default conversation when project has none
  const didAutoCreate = useRef(false);
  useEffect(() => {
    if (convLoading || didAutoCreate.current) return;
    if (conversations.length === 0 && !createConv.isPending) {
      didAutoCreate.current = true;
      createConv.mutate('General', {
        onSuccess: conv => setSelectedConvId(conv.id),
        onError: () => { didAutoCreate.current = false; },
      });
    }
  }, [conversations, convLoading, createConv]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  const handleNewConversation = async () => {
    const title = `Chat ${new Date().toLocaleDateString()}`;
    const conv = await createConv.mutateAsync(title);
    setSelectedConvId(conv.id);
  };

  const handleSend = useCallback(async () => {
    const content = draft.trim();
    if (!content || !selectedConvId || sending) return;

    setDraft('');
    setSendError(null);
    setSending(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const streamMsg: StreamingMessage = {
      role: 'assistant',
      content: '',
      toolCalls: [],
      warnings: [],
    };
    setStreaming(streamMsg);

    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`/v1/ai/conversations/${selectedConvId}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ content }),
        signal: controller.signal,
      });

      if (response.status === 503) {
        setAiUnavailable(true);
        setStreaming(null);
        setSending(false);
        return;
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

      await readSSEStream(
        response,
        (ev: SSEEvent) => {
          setStreaming(prev => {
            if (!prev) return prev;
            if (ev.type === 'token') {
              return { ...prev, content: prev.content + ev.delta };
            }
            if (ev.type === 'tool_call') {
              const existing = prev.toolCalls.find(tc => tc.id === ev.id);
              if (existing) {
                return {
                  ...prev,
                  toolCalls: prev.toolCalls.map(tc =>
                    tc.id === ev.id ? { ...tc, status: ev.status } : tc
                  ),
                };
              }
              return {
                ...prev,
                toolCalls: [
                  ...prev.toolCalls,
                  { id: ev.id, name: ev.name, arguments: ev.arguments, status: ev.status },
                ],
              };
            }
            if (ev.type === 'tool_result') {
              return {
                ...prev,
                toolCalls: prev.toolCalls.map(tc =>
                  tc.id === ev.id ? { ...tc, result: ev.result } : tc
                ),
              };
            }
            if (ev.type === 'warn') {
              return { ...prev, warnings: [...prev.warnings, ev.message] };
            }
            return prev;
          });

          if (ev.type === 'done' || ev.type === 'error') {
            if (ev.type === 'error') {
              setSendError(ev.message);
            }
            // Refresh message history from server
            void qc.invalidateQueries({ queryKey: aiKeys.conversationMessages(selectedConvId) });
            setStreaming(null);
            setSending(false);
          }
        },
        controller.signal
      );
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // User cancelled
      } else if (err instanceof ApiError && err.status === 503) {
        setAiUnavailable(true);
      } else {
        setSendError((err as Error).message ?? 'Failed to send message');
      }
      setStreaming(null);
      setSending(false);
    }

    // Refresh messages after stream ends
    void qc.invalidateQueries({ queryKey: aiKeys.conversationMessages(selectedConvId) });
    setSending(false);
  }, [draft, selectedConvId, sending, qc]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <>
      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        .ai-panel-overlay { position: fixed; inset: 0; z-index: 200; pointer-events: none; }
        .ai-panel { position: fixed; top: 0; right: 0; bottom: 0; width: 380px; max-width: 90vw; background: var(--surface); border-left: 1px solid var(--line); display: flex; flex-direction: column; z-index: 201; box-shadow: -4px 0 24px rgba(20,18,14,0.10); }
        .ai-panel-head { padding: 14px 16px; border-bottom: 1px solid var(--line); display: flex; align-items: center; gap: 10px; background: var(--paper); flex-shrink: 0; }
        .ai-orb { width: 10px; height: 10px; border-radius: 50%; background: var(--ember); flex-shrink: 0; }
        .ai-messages { flex: 1; overflow-y: auto; padding: 16px 14px; display: flex; flex-direction: column; }
        .ai-composer { border-top: 1px solid var(--line); padding: 10px 12px; background: var(--paper); flex-shrink: 0; }
      `}</style>

      {/* backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 200 }}
        onClick={onClose}
      />

      <aside className="ai-panel">
        {/* Header */}
        <div className="ai-panel-head">
          <div className="ai-orb" />
          <div style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>AI Assistant</div>
          <button className="icon-btn" onClick={onClose} style={{ fontSize: 16 }}>✕</button>
        </div>

        {/* AI Unavailable banner */}
        {aiUnavailable && (
          <div
            style={{
              padding: '10px 14px',
              background: 'var(--pill-blocked-bg)',
              color: 'var(--bad)',
              borderBottom: '1px solid var(--pill-blocked-bd)',
              fontSize: 12.5,
              fontFamily: 'var(--mono)',
            }}
          >
            AI is not configured. Contact your workspace admin.
          </div>
        )}

        {/* Conversation picker */}
        <ConvPicker
          projectId={projectId}
          conversations={conversations}
          selected={selectedConvId}
          onSelect={setSelectedConvId}
          onNew={() => void handleNewConversation()}
          creating={createConv.isPending}
        />

        {/* Messages */}
        <div className="ai-messages">
          {msgsLoading && (
            <div style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', padding: 20 }}>
              Loading…
            </div>
          )}
          {!msgsLoading && messages.length === 0 && !streaming && (
            <div style={{ color: 'var(--muted)', fontSize: 12.5, textAlign: 'center', padding: 32 }}>
              Start a conversation. Ask about project status, risks, or request drafts.
            </div>
          )}
          {messages.map(msg => (
            <MessageBubble key={msg.seq} msg={msg} convId={selectedConvId ?? ''} />
          ))}
          {streaming && (
            <StreamingBubble msg={streaming} convId={selectedConvId ?? ''} />
          )}
          {sendError && (
            <div
              style={{
                padding: '8px 12px',
                background: 'var(--pill-blocked-bg)',
                color: 'var(--bad)',
                borderRadius: 6,
                fontSize: 12,
                fontFamily: 'var(--mono)',
                marginBottom: 8,
              }}
            >
              Error: {sendError}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Composer */}
        <div className="ai-composer">
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'flex-end',
              border: '1px solid var(--line)',
              borderRadius: 8,
              background: 'var(--surface)',
              padding: '6px 8px',
            }}
          >
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={selectedConvId ? 'Ask, summarize, or draft a page…' : 'Select a conversation first'}
              disabled={!selectedConvId || sending}
              rows={2}
              style={{
                flex: 1,
                border: 0,
                background: 'transparent',
                resize: 'none',
                fontSize: 13,
                fontFamily: 'var(--sans)',
                color: 'var(--ink)',
                outline: 'none',
                lineHeight: 1.5,
              }}
            />
            <button
              className="top-btn primary"
              style={{ fontSize: 11.5, padding: '5px 10px', flexShrink: 0 }}
              onClick={() => void handleSend()}
              disabled={!draft.trim() || !selectedConvId || sending}
            >
              {sending ? '…' : 'Send'}
            </button>
          </div>
          <div
            style={{
              fontSize: 10.5,
              fontFamily: 'var(--mono)',
              color: 'var(--muted-2)',
              marginTop: 5,
              display: 'flex',
              gap: 6,
            }}
          >
            <span>Enter to send · Shift+Enter for newline</span>
          </div>
        </div>
      </aside>
    </>
  );
}
