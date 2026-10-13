import { describe, expect, it } from 'vitest';
import { applyLiveMessage, MAX_RECONNECT_ATTEMPTS, nextReconnectDelayMs } from './liveStreamReducer';

describe('applyLiveMessage', () => {
  it('applies a normal partial message', () => {
    const result = applyLiveMessage({ type: 'partial', text: 'hello', tentative: 'wor' }, false);
    expect(result.state).toEqual({ confirmedText: 'hello', tentativeText: 'wor' });
    expect(result.error).toBeUndefined();
  });

  it('treats missing text/tentative fields as empty strings, not undefined', () => {
    const result = applyLiveMessage({ type: 'partial' }, false);
    expect(result.state).toEqual({ confirmedText: '', tentativeText: '' });
  });

  it('applies a final message and flags it for the caller', () => {
    const result = applyLiveMessage({ type: 'final', text: 'all done' }, false);
    expect(result.state).toEqual({ confirmedText: 'all done', tentativeText: '' });
    expect(result.finalReceived).toBe(true);
  });

  it('surfaces an error message without touching transcript state', () => {
    const result = applyLiveMessage({ type: 'error', message: 'ASR hiccup' }, false);
    expect(result.state).toBeNull();
    expect(result.error).toBe('ASR hiccup');
  });

  it('falls back to a generic message when an error has none', () => {
    const result = applyLiveMessage({ type: 'error' }, false);
    expect(result.error).toBe('A transcription error occurred.');
  });

  describe('while discarding (Clear/restart in flight for a stale session)', () => {
    it('ignores a stale partial entirely — no state change at all', () => {
      const result = applyLiveMessage({ type: 'partial', text: 'leftover', tentative: 'x' }, true);
      expect(result.state).toBeNull();
    });

    it('forces an empty transcript on a stale final instead of applying its text', () => {
      const result = applyLiveMessage({ type: 'final', text: 'leftover full text' }, true);
      expect(result.state).toEqual({ confirmedText: '', tentativeText: '' });
      expect(result.finalReceived).toBe(true);
    });

    it('still surfaces errors while discarding', () => {
      const result = applyLiveMessage({ type: 'error', message: 'still broken' }, true);
      expect(result.error).toBe('still broken');
      expect(result.state).toBeNull();
    });
  });
});

describe('nextReconnectDelayMs', () => {
  it('backs off exponentially starting at 1s', () => {
    expect(nextReconnectDelayMs(1)).toBe(1000);
    expect(nextReconnectDelayMs(2)).toBe(2000);
    expect(nextReconnectDelayMs(3)).toBe(4000);
  });

  it('caps the delay instead of growing unbounded', () => {
    expect(nextReconnectDelayMs(10)).toBe(4000);
  });

  it('never returns less than the first-attempt delay for attempt 0 or below', () => {
    expect(nextReconnectDelayMs(0)).toBe(1000);
    expect(nextReconnectDelayMs(-5)).toBe(1000);
  });
});

describe('MAX_RECONNECT_ATTEMPTS', () => {
  it('is a small bounded number so a dead connection eventually gives up', () => {
    expect(MAX_RECONNECT_ATTEMPTS).toBeGreaterThan(0);
    expect(MAX_RECONNECT_ATTEMPTS).toBeLessThanOrEqual(5);
  });
});
