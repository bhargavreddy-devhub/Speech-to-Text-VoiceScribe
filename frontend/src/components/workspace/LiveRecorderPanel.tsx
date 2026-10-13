import { useEffect, useState } from 'react';
import { useLiveRecording } from '../../hooks/useLiveRecording';
import { LangSelect } from '../common/LangSelect';
import { NoiseMeter } from './NoiseMeter';
import { formatClock } from '../../utils/format';

async function copyToClipboard(text: string) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // clipboard API may be unavailable (insecure context / permissions) — fail silently in the UI
  }
}

const PHASE_LABEL: Record<string, string> = {
  starting: 'Requesting microphone…',
  recording: 'Listening…',
  paused: 'Paused',
  reconnecting: 'Reconnecting…',
  finalizing: 'Finalizing transcript…',
};

export function LiveRecorderPanel() {
  const [language, setLanguage] = useState('');
  const {
    phase,
    confirmedText,
    tentativeText,
    error,
    duration,
    secondsSinceUpdate,
    noiseMeterElRef,
    start,
    pause,
    resume,
    stop,
    clear,
  } = useLiveRecording(language);

  // Distinguish "actively transcribing" from "stalled" without a new timer —
  // secondsSinceUpdate already ticks alongside duration.
  const isStalled =
    phase === 'recording' && secondsSinceUpdate !== null && secondsSinceUpdate > 4;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        if (phase === 'idle') start();
        else stop();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [phase, start, stop]);

  return (
    <div className="card">
      <h2>Live Transcription</h2>
      <p className="muted">
        Record from your microphone and see partial transcripts appear in near real time. Shortcut:{' '}
        <kbd>Ctrl+Shift+R</kbd> to start/stop.
      </p>
      <div className="live-controls">
        {phase === 'idle' && (
          <button className="btn btn-primary" onClick={start}>
            ● Start Recording
          </button>
        )}
        {phase === 'starting' && (
          <button className="btn btn-primary" disabled>
            ● Starting…
          </button>
        )}
        {phase === 'recording' && (
          <button className="btn btn-ghost" onClick={pause}>
            ❙❙ Pause
          </button>
        )}
        {phase === 'paused' && (
          <button className="btn btn-ghost" onClick={resume}>
            ▶ Resume
          </button>
        )}
        {(phase === 'recording' || phase === 'paused' || phase === 'reconnecting') && (
          <button className="btn btn-danger" onClick={stop}>
            ■ Stop
          </button>
        )}
        {phase === 'finalizing' && (
          <button className="btn btn-danger" disabled>
            ■ Stop
          </button>
        )}
        <button className="btn btn-ghost" onClick={clear}>
          Clear
        </button>
        {phase !== 'idle' && (
          <span className={`status-pill${phase === 'reconnecting' ? ' status-pill-warn' : ''}`}>
            {isStalled ? 'Processing…' : PHASE_LABEL[phase]}
          </span>
        )}
        {phase !== 'idle' && phase !== 'starting' && <span className="muted">{formatClock(duration)}</span>}
        <NoiseMeter ref={noiseMeterElRef} visible={phase !== 'idle' && phase !== 'starting'} />
      </div>
      <div className="transcript-box">
        {confirmedText}
        {tentativeText && <span className="tentative"> {tentativeText}</span>}
      </div>
      <div className="live-controls" style={{ marginTop: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => copyToClipboard(confirmedText)}>
          📋 Copy
        </button>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <LangSelect
            value={language}
            onChange={setLanguage}
            leadingOptionLabel="Auto-detect language"
            style={{ fontSize: '0.85rem', padding: '6px 8px' }}
          />
        </label>
      </div>
      <p className="form-msg" role="alert">
        {error}
      </p>
    </div>
  );
}
