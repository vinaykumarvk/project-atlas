import { useState } from 'react';
import { UserManagement } from './users/UserManagement';
import { FeatureFlags } from './feature-flags/FeatureFlags';
import { HealthDashboard } from './health/HealthDashboard';

type AdminTab = 'users' | 'feature-flags' | 'health' | 'mailbox';

export function AdminConsole() {
  const [tab, setTab] = useState<AdminTab>('users');

  return (
    <div className="admin-console">
      <div className="page-header">
        <h2>Admin Console</h2>
      </div>

      <div className="admin-tabs" role="tablist">
        <button role="tab" type="button" aria-selected={tab === 'users'} className={`tab-btn ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>
          Users & Roles
        </button>
        <button role="tab" type="button" aria-selected={tab === 'feature-flags'} className={`tab-btn ${tab === 'feature-flags' ? 'active' : ''}`} onClick={() => setTab('feature-flags')}>
          Feature Flags
        </button>
        <button role="tab" type="button" aria-selected={tab === 'health'} className={`tab-btn ${tab === 'health' ? 'active' : ''}`} onClick={() => setTab('health')}>
          System Health
        </button>
        <button role="tab" type="button" aria-selected={tab === 'mailbox'} className={`tab-btn ${tab === 'mailbox' ? 'active' : ''}`} onClick={() => setTab('mailbox')}>
          Mailbox Config
        </button>
      </div>

      <div className="admin-content">
        {tab === 'users' && <UserManagement />}
        {tab === 'feature-flags' && <FeatureFlags />}
        {tab === 'health' && <HealthDashboard />}
        {tab === 'mailbox' && <MailboxConfig />}
      </div>
    </div>
  );
}

function MailboxConfig() {
  return (
    <div className="mailbox-config">
      <h3>Mailbox Configuration</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>Mailbox</th>
            <th>Provider</th>
            <th>Status</th>
            <th>Last Polled</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>collateral-ops@bank.com</td>
            <td>Microsoft Graph</td>
            <td><span className="status-badge status-active">Active</span></td>
            <td>2 min ago</td>
            <td><button type="button" className="btn-sm">Edit</button></td>
          </tr>
          <tr>
            <td>collateral-backup@bank.com</td>
            <td>Gmail API</td>
            <td><span className="status-badge status-active">Active</span></td>
            <td>5 min ago</td>
            <td><button type="button" className="btn-sm">Edit</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
