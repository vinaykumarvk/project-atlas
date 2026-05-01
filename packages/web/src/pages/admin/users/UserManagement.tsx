import { useState } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
  roles: string[];
  status: 'active' | 'inactive';
  lastLogin: string;
}

const MOCK_USERS: User[] = [
  { id: '1', name: 'Rajesh Kumar', email: 'rajesh@bank.com', roles: ['SYS_ADMIN'], status: 'active', lastLogin: '2026-04-27 09:15' },
  { id: '2', name: 'Amit Sharma', email: 'amit@bank.com', roles: ['COLLATERAL_OFFICER'], status: 'active', lastLogin: '2026-04-27 10:30' },
  { id: '3', name: 'Priya Patel', email: 'priya@bank.com', roles: ['COLLATERAL_OFFICER', 'TEAM_LEAD'], status: 'active', lastLogin: '2026-04-27 08:45' },
  { id: '4', name: 'Meena Desai', email: 'meena@bank.com', roles: ['REGIONAL_HEAD'], status: 'active', lastLogin: '2026-04-26 17:30' },
  { id: '5', name: 'Vendor Account', email: 'vendor@external.com', roles: ['VENDOR'], status: 'inactive', lastLogin: '2026-04-20 11:00' },
];

const ALL_ROLES = [
  'SYS_ADMIN', 'COLLATERAL_OFFICER', 'TEAM_LEAD', 'REGIONAL_HEAD',
  'COMPLIANCE_OFFICER', 'VENDOR', 'MASTER_DATA_ADMIN', 'MASTER_DATA_APPROVER',
];

export function UserManagement() {
  const [users] = useState(MOCK_USERS);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [search, setSearch] = useState('');

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="user-management">
      <div className="section-header">
        <h3>Users & Roles</h3>
        <button className="btn-primary">+ Add User</button>
      </div>

      <input
        type="search"
        placeholder="Search users..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="table-search"
      />

      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Roles</th>
            <th>Status</th>
            <th>Last Login</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((user) => (
            <tr key={user.id}>
              <td>{user.name}</td>
              <td>{user.email}</td>
              <td>
                {user.roles.map((role) => (
                  <span key={role} className="role-chip">{role}</span>
                ))}
              </td>
              <td>
                <span className={`status-badge status-${user.status}`}>{user.status}</span>
              </td>
              <td>{user.lastLogin}</td>
              <td>
                <button className="btn-sm" onClick={() => setEditingUser(user)}>Edit</button>
                <button className="btn-sm btn-ghost">
                  {user.status === 'active' ? 'Deactivate' : 'Activate'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editingUser && (
        <div className="drawer-overlay" onClick={() => setEditingUser(null)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h3>Edit User: {editingUser.name}</h3>
              <button className="drawer-close" onClick={() => setEditingUser(null)}>X</button>
            </div>
            <div className="drawer-body">
              <div className="form-field">
                <label>Name</label>
                <input type="text" defaultValue={editingUser.name} />
              </div>
              <div className="form-field">
                <label>Email</label>
                <input type="email" defaultValue={editingUser.email} />
              </div>
              <div className="form-field">
                <label>Roles</label>
                <div className="checkbox-group">
                  {ALL_ROLES.map((role) => (
                    <label key={role} className="checkbox-label">
                      <input
                        type="checkbox"
                        defaultChecked={editingUser.roles.includes(role)}
                      />
                      {role}
                    </label>
                  ))}
                </div>
              </div>
              <div className="drawer-footer">
                <button className="btn-secondary" onClick={() => setEditingUser(null)}>Cancel</button>
                <button className="btn-primary" onClick={() => setEditingUser(null)}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
