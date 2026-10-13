import { Badge } from '../common/Badge';
import { formatClock } from '../../utils/format';
import type { TranscriptOut } from '../../types';

export function JobsTable({ jobs }: { jobs: TranscriptOut[] }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>File</th>
            <th>Status</th>
            <th>Duration</th>
            <th>Created</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id}>
              <td>{j.original_name}</td>
              <td>
                <Badge status={j.status} />
              </td>
              <td>{j.duration_seconds ? formatClock(j.duration_seconds) : ''}</td>
              <td>{new Date(j.created_at).toLocaleString()}</td>
              <td className="muted">{j.error_message || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
