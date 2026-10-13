import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiJson, jsonBody } from '../../lib/apiClient';
import { formatClock } from '../../utils/format';
import type { AskResponse, MeetingNotesOut, SpeakerAnalyticsOut, TextResult } from '../../types';

interface AiPanelProps {
  transcriptId: string;
  aiEnabled: boolean;
  onApplyRewrite: (text: string) => void;
}

type AiResult =
  | { kind: 'text'; text: string }
  | { kind: 'rewrite'; text: string }
  | { kind: 'meeting-notes'; notes: MeetingNotesOut }
  | { kind: 'speaker-analytics'; rows: SpeakerAnalyticsOut[] }
  | { kind: 'ask'; question: string; answer: string }
  | { kind: 'error'; message: string };

function renderWithBreaks(text: string) {
  return text.split('\n').map((line, i) => (
    <span key={i}>
      {line}
      <br />
    </span>
  ));
}

function MeetingNotesView({ notes }: { notes: MeetingNotesOut }) {
  const list = (items: string[]) =>
    items.length ? (
      <ul>
        {items.map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </ul>
    ) : (
      <p className="muted">None found.</p>
    );
  return (
    <>
      <p>
        <strong>Summary</strong>
        <br />
        {notes.summary}
      </p>
      <p>
        <strong>Decisions</strong>
      </p>
      {list(notes.decisions)}
      <p>
        <strong>Action items</strong>
      </p>
      {list(notes.action_items)}
      <p>
        <strong>Key points</strong>
      </p>
      {list(notes.key_points)}
    </>
  );
}

function SpeakerAnalyticsView({ rows }: { rows: SpeakerAnalyticsOut[] }) {
  if (!rows.length) return <p className="muted">No speaker data for this transcript.</p>;
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Speaker</th>
          <th>Speaking time</th>
          <th>Turns</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{r.speaker}</td>
            <td>{formatClock(r.speaking_seconds)}</td>
            <td>{r.turns}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AiPanel({ transcriptId, aiEnabled, onApplyRewrite }: AiPanelProps) {
  const [result, setResult] = useState<AiResult | null>(null);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const [question, setQuestion] = useState('');

  const run = useMutation({
    mutationFn: async (action: string): Promise<AiResult> => {
      if (action.startsWith('summarize-')) {
        const mode = action.replace('summarize-', '');
        setLoadingLabel('Summarizing');
        const data = await apiJson<TextResult>(`/ai/transcripts/${transcriptId}/summarize`, {
          method: 'POST',
          ...jsonBody({ mode }),
        });
        return { kind: 'text', text: data.result };
      }
      if (action === 'meeting-notes') {
        setLoadingLabel('Extracting meeting notes');
        const notes = await apiJson<MeetingNotesOut>(`/ai/transcripts/${transcriptId}/meeting-notes`, {
          method: 'POST',
        });
        return { kind: 'meeting-notes', notes };
      }
      if (action.startsWith('rewrite-')) {
        const style = action.replace('rewrite-', '');
        setLoadingLabel('Rewriting');
        const data = await apiJson<TextResult>(`/ai/transcripts/${transcriptId}/rewrite`, {
          method: 'POST',
          ...jsonBody({ style }),
        });
        return { kind: 'rewrite', text: data.result };
      }
      setLoadingLabel('Computing speaker analytics');
      const rows = await apiJson<SpeakerAnalyticsOut[]>(
        `/ai/transcripts/${transcriptId}/speaker-analytics`,
      );
      return { kind: 'speaker-analytics', rows };
    },
    onSuccess: (data) => {
      setLoadingLabel(null);
      setResult(data);
    },
    onError: (err) => {
      setLoadingLabel(null);
      setResult({ kind: 'error', message: (err as Error).message });
    },
  });

  const ask = useMutation({
    mutationFn: async (q: string): Promise<AiResult> => {
      setLoadingLabel('Thinking');
      const data = await apiJson<AskResponse>(`/ai/transcripts/${transcriptId}/ask`, {
        method: 'POST',
        ...jsonBody({ question: q }),
      });
      return { kind: 'ask', question: q, answer: data.answer };
    },
    onSuccess: (data) => {
      setLoadingLabel(null);
      setResult(data);
    },
    onError: (err) => {
      setLoadingLabel(null);
      setResult({ kind: 'error', message: (err as Error).message });
    },
  });

  function submitQuestion() {
    const q = question.trim();
    if (!q) return;
    ask.mutate(q);
  }

  if (!aiEnabled) {
    return (
      <div className="ai-panel">
        <h3>AI Tools</h3>
        <div className="ai-disabled-note">
          AI features aren't configured on this server (missing ANTHROPIC_API_KEY). See Help for
          setup.
        </div>
      </div>
    );
  }

  return (
    <div className="ai-panel">
      <h3>AI Tools</h3>
      <div>
        <div className="ai-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => run.mutate('summarize-short')}>
            Quick summary
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => run.mutate('summarize-detailed')}>
            Detailed summary
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => run.mutate('summarize-bullet')}>
            Bullet summary
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => run.mutate('meeting-notes')}>
            Meeting notes &amp; action items
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => run.mutate('rewrite-formal')}>
            Rewrite: formal
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => run.mutate('rewrite-simple')}>
            Rewrite: simple
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => run.mutate('rewrite-grammar')}>
            Fix grammar
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => run.mutate('speaker-analytics')}>
            Speaker analytics
          </button>
        </div>
        <div className="ai-ask-row">
          <input
            type="text"
            placeholder="Ask a question about this transcript…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitQuestion();
              }
            }}
          />
          <button className="btn btn-primary btn-sm" onClick={submitQuestion}>
            Ask
          </button>
        </div>

        {loadingLabel && <div className="ai-output">{loadingLabel}…</div>}

        {!loadingLabel && result && (
          <div className="ai-output" aria-live="polite">
            {result.kind === 'error' && (
              <span style={{ color: 'var(--danger)' }}>{result.message}</span>
            )}
            {result.kind === 'text' && <span>{renderWithBreaks(result.text)}</span>}
            {result.kind === 'rewrite' && (
              <>
                <span>{renderWithBreaks(result.text)}</span>
                <div style={{ marginTop: 10 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => onApplyRewrite(result.text)}
                  >
                    Apply to editor
                  </button>
                </div>
              </>
            )}
            {result.kind === 'meeting-notes' && <MeetingNotesView notes={result.notes} />}
            {result.kind === 'speaker-analytics' && <SpeakerAnalyticsView rows={result.rows} />}
            {result.kind === 'ask' && (
              <>
                <p>
                  <strong>Q:</strong> {result.question}
                </p>
                <p>
                  <strong>A:</strong> {result.answer}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
