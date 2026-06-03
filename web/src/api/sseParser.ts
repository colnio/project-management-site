/**
 * SSE frame parser for AI streaming responses.
 *
 * The backend sends SSE frames over a regular fetch response body (not EventSource),
 * since EventSource doesn't support POST. We read the body with a streaming reader
 * and parse frames ourselves.
 *
 * Frame format (per SSE spec):
 *   event: <type>\n
 *   data: <json>\n
 *   \n
 *
 * Supported event types:
 *   token       { delta: string }
 *   tool_call   { id, name, arguments, status }
 *   tool_result { id, name, result }
 *   warn        { message: string }
 *   done        { conversation_id: string }
 *   error       { code: string, message: string }
 */

export type SSETokenEvent = { type: 'token'; delta: string };
export type SSEToolCallEvent = {
  type: 'tool_call';
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status?: string;
};
export type SSEToolResultEvent = {
  type: 'tool_result';
  id: string;
  name?: string;
  result?: unknown;
  status?: string;
};
export type SSEWarnEvent = { type: 'warn'; message: string };
export type SSEDoneEvent = { type: 'done'; conversation_id: string };
export type SSEErrorEvent = { type: 'error'; code: string; message: string };

/** Maximum bytes retained while parsing an SSE stream without a frame terminator. */
export const maxSSEBufferBytes = 5 * 1024 * 1024;

export type SSEEvent =
  | SSETokenEvent
  | SSEToolCallEvent
  | SSEToolResultEvent
  | SSEWarnEvent
  | SSEDoneEvent
  | SSEErrorEvent;

/**
 * Parse raw SSE text into individual event objects.
 * A "frame" is separated by a blank line (\n\n).
 * Returns an array of parsed events (skips malformed frames).
 */
export function parseSSEChunk(text: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  // Split on blank lines — each block is one SSE frame
  const frames = text.split(/\n\n/);

  for (const frame of frames) {
    const lines = frame.split('\n').filter(l => l.length > 0);
    if (lines.length === 0) continue;

    let eventType = '';
    let dataStr = '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.slice('event:'.length).trim();
      } else if (line.startsWith('data:')) {
        dataStr = line.slice('data:'.length).trim();
      }
    }

    if (!eventType || !dataStr) continue;

    try {
      const payload = JSON.parse(dataStr) as Record<string, unknown>;
      const ev = buildSSEEvent(eventType, payload);
      if (ev) events.push(ev);
    } catch {
      // skip unparseable frames
    }
  }

  return events;
}

function buildSSEEvent(
  eventType: string,
  payload: Record<string, unknown>
): SSEEvent | null {
  switch (eventType) {
    case 'token':
      return { type: 'token', delta: String(payload.delta ?? '') };
    case 'tool_call':
      return {
        type: 'tool_call',
        id: String(payload.tool_call_id ?? payload.id ?? ''),
        name: String(payload.name ?? ''),
        arguments: (payload.arguments ?? {}) as Record<string, unknown>,
        status: payload.status as string | undefined,
      };
    case 'tool_result':
      return {
        type: 'tool_result',
        id: String(payload.tool_call_id ?? payload.id ?? ''),
        name: payload.name as string | undefined,
        result: payload.result,
        status: payload.status as string | undefined,
      };
    case 'warn':
      return { type: 'warn', message: String(payload.message ?? '') };
    case 'done':
      return { type: 'done', conversation_id: String(payload.conversation_id ?? '') };
    case 'error':
      return {
        type: 'error',
        code: String(payload.code ?? 'unknown'),
        message: String(payload.message ?? 'Unknown error'),
      };
    default:
      return null;
  }
}

/**
 * Read an SSE stream from a fetch Response and invoke callbacks for each event.
 * Uses TextDecoder + ReadableStream reader.
 * Resolves when the stream ends (done/error event or body closed).
 */
export async function readSSEStream(
  response: Response,
  onEvent: (ev: SSEEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > maxSSEBufferBytes) {
        throw new Error('SSE buffer exceeded maximum size');
      }

      // Process complete frames (ending with \n\n)
      // Keep the trailing partial frame in the buffer
      const lastDouble = buffer.lastIndexOf('\n\n');
      if (lastDouble !== -1) {
        const complete = buffer.slice(0, lastDouble + 2);
        buffer = buffer.slice(lastDouble + 2);

        const events = parseSSEChunk(complete);
        for (const ev of events) {
          onEvent(ev);
          if (ev.type === 'done' || ev.type === 'error') {
            return;
          }
        }
      }
    }

    // Flush any remaining buffer
    if (buffer.trim()) {
      const events = parseSSEChunk(buffer + '\n\n');
      for (const ev of events) {
        onEvent(ev);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
