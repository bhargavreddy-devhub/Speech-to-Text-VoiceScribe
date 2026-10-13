import { useUiStore } from '../../store/uiStore';
import { Badge } from '../common/Badge';
import { formatClock } from '../../utils/format';
import type { TranscriptOut } from '../../types';

export function HistoryItem({ item, compact = false }: { item: TranscriptOut; compact?: boolean }) {
  const openDetail = useUiStore((s) => s.openDetail);
  const date = compact
    ? new Date(item.created_at).toLocaleDateString()
    : new Date(item.created_at).toLocaleString();

  return (
    <div className="history-item">
      <div
        className="history-item-main"
        style={compact ? { cursor: 'pointer' } : undefined}
        onClick={() => openDetail(item.id)}
      >
        <div className="history-item-top">
          <span>
            {item.original_name} · {date}
            {!compact && item.duration_seconds ? ` · ${formatClock(item.duration_seconds)}` : ''}
          </span>
          <Badge status={item.status} />
        </div>
        <div className="history-item-text">{item.text || item.error_message || '(no text yet)'}</div>
        {!compact && (
          <div className="history-item-tags">
            {item.folder && <span className="folder-chip">📁 {item.folder}</span>}
            {(item.tags || []).map((t) => (
              <span className="tag-chip" key={t}>
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
