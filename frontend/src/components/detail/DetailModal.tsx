import { useEffect, useRef, useState } from 'react';
import { useUiStore } from '../../store/uiStore';
import { useTranscriptDetail } from '../../hooks/useTranscriptDetail';
import { useTranscriptMutations } from '../../hooks/useTranscripts';
import { useHealth } from '../../hooks/useHealth';
import { apiFetch, fetchAudioObjectUrl } from '../../lib/apiClient';
import { useEditorHistory } from '../../hooks/useEditorHistory';
import { Editor } from './Editor';
import { SegmentsList } from './SegmentsList';
import { AiPanel } from './AiPanel';
import { OrganizePanel } from './OrganizePanel';
import { languageName } from '../../constants/languages';
import { formatClock } from '../../utils/format';
import type { TranscriptDetail as TranscriptDetailType } from '../../types';

const EXPORT_FORMATS = ['txt', 'md', 'srt', 'vtt', 'docx', 'pdf'];

export function DetailModal() {
  const openDetailId = useUiStore((s) => s.openDetailId);
  if (!openDetailId) return null;
  return <DetailModalInner key={openDetailId} id={openDetailId} />;
}

function DetailModalInner({ id }: { id: string }) {
  const closeDetail = useUiStore((s) => s.closeDetail);
  const { data, isLoading, isError, error } = useTranscriptDetail(id);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeDetail();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closeDetail]);

  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modalTitle"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeDetail();
      }}
    >
      <div className="modal-content">
        <button className="modal-close" aria-label="Close" onClick={closeDetail}>
          &times;
        </button>
        {isLoading && <p className="muted">Loading…</p>}
        {isError && <p className="muted">{(error as Error).message}</p>}
        {data && <DetailModalBody data={data} onClose={closeDetail} />}
      </div>
    </div>
  );
}

function DetailModalBody({
  data,
  onClose,
}: {
  data: TranscriptDetailType;
  onClose: () => void;
}) {
  const { saveText, updateMeta, remove } = useTranscriptMutations();
  const { data: health } = useHealth();
  const editor = useEditorHistory(data.text || '');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(data.is_favorite);
  const [title, setTitle] = useState(data.original_name);
  const [autosaveNote, setAutosaveNote] = useState('');
  const audioRef = useRef<HTMLAudioElement>(null);
  const skipAutosaveRef = useRef(true);

  useEffect(() => {
    let active = true;
    let url: string | null = null;
    fetchAudioObjectUrl(data.id).then((u) => {
      if (active) {
        url = u;
        setAudioUrl(u);
      }
    });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [data.id]);

  useEffect(() => {
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return;
    }
    setAutosaveNote('Editing…');
    const timer = setTimeout(() => {
      saveText.mutate(
        { id: data.id, text: editor.text },
        {
          onSuccess: () => setAutosaveNote(`Autosaved at ${new Date().toLocaleTimeString()}`),
          onError: (err) => setAutosaveNote(`Autosave failed: ${(err as Error).message}`),
        },
      );
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.text]);

  function handleSaveNow() {
    saveText.mutate(
      { id: data.id, text: editor.text },
      {
        onSuccess: () => setAutosaveNote(`Saved at ${new Date().toLocaleTimeString()}`),
        onError: (err) => alert((err as Error).message),
      },
    );
  }

  function toggleFavorite() {
    updateMeta.mutate(
      { id: data.id, patch: { is_favorite: !isFavorite } },
      {
        onSuccess: (updated) => setIsFavorite(updated.is_favorite),
        onError: (err) => alert((err as Error).message),
      },
    );
  }

  function rename() {
    const next = prompt('Rename transcript', title);
    if (!next) return;
    updateMeta.mutate(
      { id: data.id, patch: { original_name: next } },
      {
        onSuccess: (updated) => setTitle(updated.original_name),
        onError: (err) => alert((err as Error).message),
      },
    );
  }

  function deleteTranscript() {
    if (!confirm('Delete this transcript permanently?')) return;
    remove.mutate(data.id, {
      onSuccess: onClose,
      onError: (err) => alert((err as Error).message),
    });
  }

  async function exportAs(fmt: string) {
    try {
      const res = await apiFetch(`/transcripts/${data.id}/export?fmt=${fmt}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}) as { detail?: string });
        throw new Error(err.detail || 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transcript.${fmt}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert((err as Error).message);
    }
  }

  function seekTo(start: number) {
    if (audioRef.current) {
      audioRef.current.currentTime = start;
      audioRef.current.play().catch(() => {});
    }
  }

  return (
    <>
      <h3 id="modalTitle">{title}</h3>
      <p className="muted">
        {data.status} · language: {data.language ? languageName(data.language) : 'n/a'}{' '}
        {data.duration_seconds ? `· ${formatClock(data.duration_seconds)}` : ''}
      </p>
      {audioUrl && <audio id="modalAudioPlayer" ref={audioRef} controls src={audioUrl} />}

      <Editor
        text={editor.text}
        setText={editor.setText}
        undo={editor.undo}
        redo={editor.redo}
        autosaveNote={autosaveNote}
      />

      <SegmentsList segments={data.segments || []} speakers={data.speakers || []} onSeek={seekTo} />

      {data.translated_text && (
        <div className="result-block">
          <h3>Translated ({languageName(data.translated_language)})</h3>
          <div className="transcript-box">{data.translated_text}</div>
        </div>
      )}

      <div className="modal-actions">
        <button className="btn btn-primary" onClick={handleSaveNow}>
          Save Changes
        </button>
        <button className="btn btn-ghost" onClick={toggleFavorite}>
          {isFavorite ? '★ Favorite' : '☆ Favorite'}
        </button>
        <button className="btn btn-ghost" onClick={rename}>
          ✏️ Rename
        </button>
        <div className="export-group">
          {EXPORT_FORMATS.map((fmt) => (
            <button className="btn btn-ghost btn-sm" key={fmt} onClick={() => exportAs(fmt)}>
              {fmt.toUpperCase()}
            </button>
          ))}
        </div>
        <button className="btn btn-danger" onClick={deleteTranscript}>
          Delete
        </button>
      </div>

      <AiPanel
        transcriptId={data.id}
        aiEnabled={health?.ai_enabled ?? true}
        onApplyRewrite={editor.setText}
      />

      <OrganizePanel
        transcriptId={data.id}
        initialFolder={data.folder || ''}
        initialTags={data.tags || []}
      />
    </>
  );
}
