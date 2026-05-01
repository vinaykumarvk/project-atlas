import { useState } from 'react';

interface PendingChange {
  id: string;
  masterTable: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  proposedBy: string;
  proposedAt: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

interface ApproverInboxProps {
  onClose: () => void;
}

const MOCK_PENDING: PendingChange[] = [
  {
    id: 'ch-1',
    masterTable: 'property_location',
    action: 'CREATE',
    proposedBy: 'Amit Sharma',
    proposedAt: '2026-04-27T10:30:00Z',
    before: null,
    after: { canonical_form: 'Nagpur', zone: 'East', state: 'Maharashtra', pin_prefix: '440' },
    status: 'PENDING',
  },
  {
    id: 'ch-2',
    masterTable: 'tat',
    action: 'UPDATE',
    proposedBy: 'Priya Patel',
    proposedAt: '2026-04-27T09:15:00Z',
    before: { case_type: 'VALUATION_REQUEST', hours: 48, warn_at: 75 },
    after: { case_type: 'VALUATION_REQUEST', hours: 36, warn_at: 80 },
    status: 'PENDING',
  },
  {
    id: 'ch-3',
    masterTable: 'vendor',
    action: 'UPDATE',
    proposedBy: 'Amit Sharma',
    proposedAt: '2026-04-26T16:00:00Z',
    before: { name: 'QuickVal Services', avg_tat: 3, rating: 4.2 },
    after: { name: 'QuickVal Services', avg_tat: 2.5, rating: 4.4 },
    status: 'PENDING',
  },
];

export function ApproverInbox({ onClose }: ApproverInboxProps) {
  const [changes, setChanges] = useState(MOCK_PENDING);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const handleApprove = (id: string) => {
    setChanges((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: 'APPROVED' as const } : c)),
    );
  };

  const handleReject = (id: string) => {
    if (!rejectReason.trim()) return;
    setChanges((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: 'REJECTED' as const } : c)),
    );
    setRejectingId(null);
    setRejectReason('');
  };

  const pending = changes.filter((c) => c.status === 'PENDING');

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer drawer-wide" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h3>Approver Inbox</h3>
          <span className="drawer-subtitle">{pending.length} pending changes</span>
          <button className="drawer-close" onClick={onClose}>X</button>
        </div>

        <div className="drawer-body">
          {pending.length === 0 && <p className="empty-state">No pending changes.</p>}

          {pending.map((change) => (
            <div key={change.id} className="change-card">
              <div className="change-header">
                <span className={`badge badge-${change.action.toLowerCase()}`}>
                  {change.action}
                </span>
                <span className="change-master">{change.masterTable.replace(/_/g, ' ')}</span>
                <span className="change-meta">
                  by {change.proposedBy} on {new Date(change.proposedAt).toLocaleDateString()}
                </span>
              </div>

              <div className="change-diff">
                {change.before && (
                  <div className="diff-section">
                    <h5>Before</h5>
                    <pre>{JSON.stringify(change.before, null, 2)}</pre>
                  </div>
                )}
                <div className="diff-section">
                  <h5>{change.before ? 'After' : 'New Record'}</h5>
                  <pre>{JSON.stringify(change.after, null, 2)}</pre>
                </div>
              </div>

              <div className="change-actions">
                {rejectingId === change.id ? (
                  <div className="reject-form">
                    <input
                      type="text"
                      placeholder="Reason for rejection..."
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                    <button
                      className="btn-danger btn-sm"
                      onClick={() => handleReject(change.id)}
                    >
                      Confirm Reject
                    </button>
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() => setRejectingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      className="btn-primary btn-sm"
                      onClick={() => handleApprove(change.id)}
                    >
                      Approve
                    </button>
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => setRejectingId(change.id)}
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
