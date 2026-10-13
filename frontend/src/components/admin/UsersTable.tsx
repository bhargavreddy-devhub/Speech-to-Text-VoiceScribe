import { useDeleteUser } from '../../hooks/useAdmin';
import type { AdminUserOut } from '../../types';

export function UsersTable({ users }: { users: AdminUserOut[] }) {
  const deleteUser = useDeleteUser();

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Name</th>
            <th>Joined</th>
            <th>Transcripts</th>
            <th>Minutes</th>
            <th>Admin</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.name || ''}</td>
              <td>{new Date(u.created_at).toLocaleDateString()}</td>
              <td>{u.transcript_count}</td>
              <td>{u.total_minutes}</td>
              <td>{u.is_admin ? 'Yes' : ''}</td>
              <td>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    if (!confirm('Delete this user and all of their transcripts?')) return;
                    deleteUser.mutate(u.id, { onError: (err) => alert((err as Error).message) });
                  }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
