import { useUiStore } from '../../store/uiStore';
import { useTranscriptMutations } from '../../hooks/useTranscripts';
import { Badge } from '../common/Badge';
import { formatClock } from '../../utils/format';
import type { TranscriptOut } from '../../types';

export function HistoryListRow({ item }: { item: TranscriptOut }) {
  const openDetail = useUiStore((s) => s.openDetail);
  const { updateMeta, retry, cancel } = useTranscriptMutations();

  const canRetry = item.status === 'failed' || item.status === 'cancelled';
  const canCancel = item.status === 'pending' || item.status === 'processing';

  return (
    <div className="history-item">
      <button
        className={`fav-star${item.is_favorite ? ' active' : ''}`}
        aria-label={item.is_favorite ? 'Unfavorite' : 'Favorite'}
        onClick={(e) => {
          e.stopPropagation();
          updateMeta.mutate(
            { id: item.id, patch: { is_favorite: !item.is_favorite } },
            { onError: (err) => alert((err as Error).message) },
          );
        }}
      >
        {item.is_favorite ? '★' : '☆'}
      </button>
      <div className="history-item-main" onClick={() => openDetail(item.id)}>
        <div className="history-item-top">
          <span>
            {item.original_name} · {new Date(item.created_at).toLocaleString()}
            {item.duration_seconds ? ` · ${formatClock(item.duration_seconds)}` : ''}
          </span>
          <Badge status={item.status} />
        </div>
        <div className="history-item-text">{item.text || item.error_message || '(no text yet)'}</div>
        <div className="history-item-tags">
          {item.folder && <span className="folder-chip">📁 {item.folder}</span>}
          {(item.tags || []).map((t) => (
            <span className="tag-chip" key={t}>
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="item-actions">
        {canRetry && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              retry.mutate(item.id, { onError: (err) => alert((err as Error).message) });
            }}
          >
            ↻ Retry
          </button>
        )}
        {canCancel && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              cancel.mutate(item.id, { onError: (err) => alert((err as Error).message) });
            }}
          >
            ✕ Cancel
          </button>
        )}
      </div>
    </div>
  );
}
