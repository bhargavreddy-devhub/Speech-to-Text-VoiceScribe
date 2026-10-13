import { useRecentTranscripts } from '../hooks/useTranscripts';
import { StatTile } from '../components/common/StatTile';
import { HistoryItem } from '../components/history/HistoryItem';

export default function DashboardPage() {
  const { data: items, isLoading, isError, error } = useRecentTranscripts(200);

  const totalMinutes = (items || []).reduce((sum, t) => sum + (t.duration_seconds || 0), 0) / 60;
  const completed = (items || []).filter((t) => t.status === 'completed').length;
  const favorites = (items || []).filter((t) => t.is_favorite).length;
  const processing = (items || []).filter(
    (t) => t.status === 'pending' || t.status === 'processing',
  ).length;

  return (
    <section className="page">
      <h2>Dashboard</h2>

      {isLoading && <p className="muted">Loading…</p>}
      {isError && <p className="muted">Could not load dashboard: {(error as Error).message}</p>}

      {items && (
        <div className="stat-grid">
          <StatTile label="Total transcripts" value={items.length} />
          <StatTile label="Minutes transcribed" value={totalMinutes.toFixed(1)} />
          <StatTile label="Completed" value={completed} />
          <StatTile label="In progress" value={processing} />
          <StatTile label="Favorites" value={favorites} />
        </div>
      )}

      <div className="quick-actions">
        <a href="#/workspace" className="btn btn-primary">
          🎙️ New recording
        </a>
        <a href="#/workspace" className="btn btn-ghost">
          📁 Upload a file
        </a>
        <a href="#/history" className="btn btn-ghost">
          🕘 View all history
        </a>
      </div>

      <div className="card">
        <h2>Recent transcripts</h2>
        {items && items.length === 0 && (
          <p className="muted">Nothing yet — go to Workspace to record or upload your first file.</p>
        )}
        {items &&
          items.slice(0, 6).map((item) => <HistoryItem key={item.id} item={item} compact />)}
      </div>
    </section>
  );
}
