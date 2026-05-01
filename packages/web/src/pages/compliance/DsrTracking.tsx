import { useState, useMemo, useCallback } from 'react';
import {
  useDsrRequests,
  useUpdateDsrStatus,
  type DsrFilters,
  type DsrStatus,
  type DsrType,
  type DsrRequest,
} from '../../hooks/useDsrRequests';

const STATUS_OPTIONS: DsrStatus[] = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED'];
const TYPE_OPTIONS: DsrType[] = ['ACCESS', 'RECTIFICATION', 'ERASURE', 'PORTABILITY'];

const statusColor: Record<DsrStatus, string> = {
  PENDING: '#f59e0b',
  IN_PROGRESS: '#3b82f6',
  COMPLETED: '#10b981',
  REJECTED: '#ef4444',
};

/**
 * Calculate the SLA time remaining for a DSR request.
 * Returns a human-readable string and urgency level.
 */
function getSlaInfo(dsr: DsrRequest): { text: string; urgent: boolean; overdue: boolean } {
  const dueDate = new Date(dsr.dueDate);
  const now = new Date();
  const diffMs = dueDate.getTime() - now.getTime();

  if (dsr.status === 'COMPLETED' || dsr.status === 'REJECTED') {
    return { text: '--', urgent: false, overdue: false };
  }

  if (diffMs < 0) {
    const overdueDays = Math.ceil(Math.abs(diffMs) / (1000 * 60 * 60 * 24));
    return { text: `${overdueDays}d overdue`, urgent: true, overdue: true };
  }

  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const hoursLeft = Math.ceil(diffMs / (1000 * 60 * 60));

  if (daysLeft <= 0) {
    return { text: `${hoursLeft}h remaining`, urgent: true, overdue: false };
  }
  if (daysLeft <= 3) {
    return { text: `${daysLeft}d remaining`, urgent: true, overdue: false };
  }
  return { text: `${daysLeft}d remaining`, urgent: false, overdue: false };
}

export function DsrTracking() {
  const [filters, setFilters] = useState<DsrFilters>({ page: 1, limit: 20 });
  const { data, isLoading, error } = useDsrRequests(filters);
  const updateStatus = useUpdateDsrStatus();

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleStatusChange = (id: string, newStatus: DsrStatus) => {
    updateStatus.mutate({ id, status: newStatus });
  };

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (!data) return;
    setSelectedIds((prev) => {
      if (prev.size === data.data.length) {
        return new Set();
      }
      return new Set(data.data.map((d) => d.id));
    });
  }, [data]);

  const handleBulkApprove = useCallback(() => {
    for (const id of selectedIds) {
      updateStatus.mutate({ id, status: 'COMPLETED' });
    }
    setSelectedIds(new Set());
  }, [selectedIds, updateStatus]);

  const handleBulkReject = useCallback(() => {
    for (const id of selectedIds) {
      updateStatus.mutate({ id, status: 'REJECTED' });
    }
    setSelectedIds(new Set());
  }, [selectedIds, updateStatus]);

  // Compliance summary calculations
  const complianceSummary = useMemo(() => {
    if (!data) return null;

    const total = data.total;
    const byStatus: Record<string, number> = {};
    let totalResolutionMs = 0;
    let resolvedCount = 0;

    for (const dsr of data.data) {
      byStatus[dsr.status] = (byStatus[dsr.status] || 0) + 1;
      if (dsr.status === 'COMPLETED' || dsr.status === 'REJECTED') {
        const created = new Date(dsr.createdAt).getTime();
        const updated = new Date(dsr.updatedAt).getTime();
        totalResolutionMs += updated - created;
        resolvedCount++;
      }
    }

    const avgResolutionDays =
      resolvedCount > 0
        ? Math.round(totalResolutionMs / resolvedCount / (1000 * 60 * 60 * 24) * 10) / 10
        : 0;

    return { total, byStatus, avgResolutionDays, resolvedCount };
  }, [data]);

  const allSelected = data ? selectedIds.size === data.data.length && data.data.length > 0 : false;

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ margin: '0 0 1.5rem 0' }}>Data Subject Request (DSR) Tracking</h2>

      {/* Compliance Summary Card */}
      {complianceSummary && (
        <div
          data-testid="compliance-summary"
          style={{
            display: 'flex',
            gap: '1.5rem',
            marginBottom: '1.5rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={summaryCardStyle}>
            <div style={summaryLabelStyle}>Total Requests</div>
            <div style={summaryValueStyle}>{complianceSummary.total}</div>
          </div>
          {STATUS_OPTIONS.map((status) => (
            <div key={status} style={summaryCardStyle}>
              <div style={summaryLabelStyle}>{status}</div>
              <div style={{ ...summaryValueStyle, color: statusColor[status] }}>
                {complianceSummary.byStatus[status] || 0}
              </div>
            </div>
          ))}
          <div style={summaryCardStyle}>
            <div style={summaryLabelStyle}>Avg Resolution</div>
            <div style={summaryValueStyle}>
              {complianceSummary.avgResolutionDays}d
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <select
          value={filters.status ?? ''}
          onChange={(e) =>
            setFilters((prev) => ({
              ...prev,
              status: (e.target.value as DsrStatus) || undefined,
              page: 1,
            }))
          }
          style={selectStyle}
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          value={filters.type ?? ''}
          onChange={(e) =>
            setFilters((prev) => ({
              ...prev,
              type: (e.target.value as DsrType) || undefined,
              page: 1,
            }))
          }
          style={selectStyle}
        >
          <option value="">All Types</option>
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div
          data-testid="bulk-actions"
          style={{
            display: 'flex',
            gap: '0.75rem',
            marginBottom: '1rem',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '0.875rem', color: '#475569' }}>
            {selectedIds.size} selected
          </span>
          <button
            onClick={handleBulkApprove}
            style={{ ...btnStyle, backgroundColor: '#10b981', color: '#fff', border: 'none' }}
            data-testid="bulk-approve-btn"
          >
            Bulk Approve
          </button>
          <button
            onClick={handleBulkReject}
            style={{ ...btnStyle, backgroundColor: '#ef4444', color: '#fff', border: 'none' }}
            data-testid="bulk-reject-btn"
          >
            Bulk Reject
          </button>
        </div>
      )}

      {isLoading && <p>Loading DSR requests...</p>}
      {error && (
        <p style={{ color: '#dc2626' }}>
          Error: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      )}

      {data && (
        <>
          <p style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.75rem' }}>
            {data.total} request(s) found
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      data-testid="select-all-checkbox"
                    />
                  </th>
                  <th style={thStyle}>Subject</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Description</th>
                  <th style={thStyle}>SLA</th>
                  <th style={thStyle}>Due Date</th>
                  <th style={thStyle}>Created</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((dsr) => {
                  const sla = getSlaInfo(dsr);
                  return (
                    <tr key={dsr.id}>
                      <td style={tdStyle}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(dsr.id)}
                          onChange={() => toggleSelect(dsr.id)}
                          data-testid={`select-${dsr.id}`}
                        />
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 500 }}>{dsr.subjectName}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          {dsr.subjectEmail}
                        </div>
                      </td>
                      <td style={tdStyle}>{dsr.type}</td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.125rem 0.5rem',
                            borderRadius: '999px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: '#fff',
                            backgroundColor: statusColor[dsr.status],
                          }}
                        >
                          {dsr.status}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {dsr.description}
                      </td>
                      <td style={tdStyle}>
                        <span
                          data-testid={`sla-${dsr.id}`}
                          style={{
                            color: sla.overdue ? '#dc2626' : sla.urgent ? '#f59e0b' : '#10b981',
                            fontWeight: sla.urgent ? 600 : 400,
                          }}
                        >
                          {sla.text}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {new Date(dsr.dueDate).toLocaleDateString()}
                      </td>
                      <td style={tdStyle}>
                        {new Date(dsr.createdAt).toLocaleDateString()}
                      </td>
                      <td style={tdStyle}>
                        <select
                          value={dsr.status}
                          onChange={(e) =>
                            handleStatusChange(dsr.id, e.target.value as DsrStatus)
                          }
                          style={{ ...selectStyle, minWidth: '100px', fontSize: '0.8rem' }}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button
              disabled={filters.page === 1}
              onClick={() =>
                setFilters((prev) => ({ ...prev, page: (prev.page ?? 1) - 1 }))
              }
              style={btnStyle}
            >
              Previous
            </button>
            <button
              disabled={data.data.length < (filters.limit ?? 20)}
              onClick={() =>
                setFilters((prev) => ({ ...prev, page: (prev.page ?? 1) + 1 }))
              }
              style={btnStyle}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default DsrTracking;

const selectStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  border: '1px solid #ddd',
  borderRadius: '4px',
  fontSize: '0.875rem',
  backgroundColor: '#fff',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.875rem',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.625rem 0.75rem',
  borderBottom: '2px solid #e2e8f0',
  fontWeight: 600,
  color: '#475569',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  borderBottom: '1px solid #f1f5f9',
  color: '#334155',
};

const btnStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  border: '1px solid #ddd',
  borderRadius: '4px',
  backgroundColor: '#fff',
  cursor: 'pointer',
  fontSize: '0.85rem',
};

const summaryCardStyle: React.CSSProperties = {
  padding: '1rem 1.25rem',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  backgroundColor: '#fff',
  minWidth: '120px',
  textAlign: 'center',
};

const summaryLabelStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#64748b',
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: '0.25rem',
};

const summaryValueStyle: React.CSSProperties = {
  fontSize: '1.5rem',
  fontWeight: 700,
  color: '#1e293b',
};
