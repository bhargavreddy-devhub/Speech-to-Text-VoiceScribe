// Pure, UI/WebSocket-free logic extracted from useLiveRecording so the
// trickiest correctness rules — stale messages after Clear/reconnect, and
// reconnect backoff pacing — can be unit tested directly.

export interface LiveTranscriptState {
  confirmedText: string;
  tentativeText: string;
}

export type LiveStreamMessage =
  | { type: 'partial'; text?: string; tentative?: string }
  | { type: 'final'; text?: string }
  | { type: 'error'; message?: string };

export interface ApplyMessageResult {
  // null means "no transcript state change" (message ignored or error-only),
  // so the caller can skip setState entirely rather than re-apply stale text.
  state: LiveTranscriptState | null;
  error?: string;
  finalReceived?: boolean;
}

/**
 * Fold one incoming stream message into transcript state. Deliberately takes
 * no prior state — it only ever needs the message itself — so callers never
 * need to close over render state in the socket's message handler, which
 * would reintroduce a stale-closure bug (the handler is bound once per
 * socket, not per render).
 *
 * `discardNext` is set while a Clear (or a fresh restart) is in flight for a
 * session whose socket hasn't closed yet: any partial/final that was already
 * on the wire from the *old* session must not repopulate the transcript. A
 * discarded `final` still resolves (so the caller can stop waiting on it),
 * it just forces the visible transcript back to empty instead of applying
 * the server's text.
 */
export function applyLiveMessage(msg: LiveStreamMessage, discardNext: boolean): ApplyMessageResult {
  if (msg.type === 'error') {
    return { state: null, error: msg.message || 'A transcription error occurred.' };
  }

  if (discardNext) {
    if (msg.type === 'final') {
      return { state: { confirmedText: '', tentativeText: '' }, finalReceived: true };
    }
    return { state: null };
  }

  if (msg.type === 'partial') {
    return { state: { confirmedText: msg.text || '', tentativeText: msg.tentative || '' } };
  }

  return { state: { confirmedText: msg.text || '', tentativeText: '' }, finalReceived: true };
}

export const MAX_RECONNECT_ATTEMPTS = 3;

/** Exponential backoff (1s, 2s, 4s, capped) for `attempt` (1-based). */
export function nextReconnectDelayMs(attempt: number): number {
  return Math.min(4000, 1000 * 2 ** Math.max(0, attempt - 1));
}
