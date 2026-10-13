import { useAdminJobs, useAdminStats, useAdminUsers } from '../hooks/useAdmin';
import { StatTile } from '../components/common/StatTile';
import { UsersTable } from '../components/admin/UsersTable';
import { JobsTable } from '../components/admin/JobsTable';

export default function AdminPage() {
  const stats = useAdminStats(true);
  const users = useAdminUsers(true);
  const jobs = useAdminJobs(true, 50);

  return (
    <section className="page">
      <h2>Admin Dashboard</h2>

      {stats.isError && <p className="muted">{(stats.error as Error).message}</p>}
      {stats.data && (
        <div className="stat-grid">
          <StatTile label="Users" value={stats.data.total_users} />
          <StatTile label="Transcripts" value={stats.data.total_transcripts} />
          <StatTile label="Minutes processed" value={stats.data.total_minutes_processed} />
          <StatTile label="Pending" value={stats.data.jobs_pending} />
          <StatTile label="Processing" value={stats.data.jobs_processing} />
          <StatTile label="Failed" value={stats.data.jobs_failed} />
          <StatTile label="Completed" value={stats.data.jobs_completed} />
        </div>
      )}

      <div className="card">
        <h2>Users</h2>
        {users.isError && <p className="muted">{(users.error as Error).message}</p>}
        {users.data && <UsersTable users={users.data} />}
      </div>

      <div className="card">
        <h2>Recent jobs</h2>
        {jobs.isError && <p className="muted">{(jobs.error as Error).message}</p>}
        {jobs.data && <JobsTable jobs={jobs.data} />}
      </div>
    </section>
  );
}
