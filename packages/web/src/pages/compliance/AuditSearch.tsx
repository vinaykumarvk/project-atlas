import { useState } from 'react';
import { useAuditLogs, type AuditLogFilters } from '../../hooks/useAuditLogs';

export function AuditSearch() {
  const [filters, setFilters] = useState<AuditLogFilters>({
    page: 1,
    limit: 20,
  });

  const { data, isLoading, error } = useAuditLogs(filters);

  const handleFilterChange = (key: keyof AuditLogFilters, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value || undefined,
      page: 1, // reset page on filter change
    }));
  };

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ margin: '0 0 1.5rem 0' }}>Audit Log Search</h2>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Event code"
          value={filters.event_code ?? ''}
          onChange={(e) => handleFilterChange('event_code', e.target.value)}
          style={inputStyle}
        />
        <input
          type="text"
          placeholder="Actor ID"
          value={filters.actor_id ?? ''}
          onChange={(e) => handleFilterChange('actor_id', e.target.value)}
          style={inputStyle}
        />
        <input
          type="text"
          placeholder="Resource type"
          value={filters.resource_type ?? ''}
          onChange={(e) => handleFilterChange('resource_type', e.target.value)}
          style={inputStyle}
        />
        <input
          type="date"
          placeholder="From date"
          value={filters.from_date ?? ''}
          onChange={(e) => handleFilterChange('from_date', e.target.value)}
          style={inputStyle}
        />
        <input
          type="date"
          placeholder="To date"
          value={filters.to_date ?? ''}
          onChange={(e) => handleFilterChange('to_date', e.target.value)}
          style={inputStyle}
        />
      </div>

      {/* Status */}
      {isLoading && <p>Loading audit logs...</p>}
      {error && (
        <p style={{ color: '#dc2626' }}>
          Error loading audit logs: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      )}

      {/* Results table */}
      {data && (
        <>
          <p style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.75rem' }}>
            Showing {data.data.length} of {data.total} results (page {data.page})
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Timestamp</th>
                  <th style={thStyle}>Event Code</th>
                  <th style={thStyle}>Action</th>
                  <th style={thStyle}>Actor</th>
                  <th style={thStyle}>Resource</th>
                  <th style={thStyle}>IP Address</th>
                  <th style={thStyle}>Hash</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((log) => (
                  <tr key={log.id}>
                    <td style={tdStyle}>
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td style={tdStyle}>{log.event_code}</td>
                    <td style={tdStyle}>{log.action}</td>
                    <td style={tdStyle}>{log.actor_id ?? '-'}</td>
                    <td style={tdStyle}>
                      {log.resource_type}
                      {log.resource_id ? ` #${log.resource_id}` : ''}
                    </td>
                    <td style={tdStyle}>{log.ip_address ?? '-'}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {log.row_hash.substring(0, 12)}...
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
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

export default AuditSearch;

// ---------------------------------------------------------------------------
// Inline styles
// ---------------------------------------------------------------------------

const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  border: '1px solid #ddd',
  borderRadius: '4px',
  fontSize: '0.875rem',
  minWidth: '140px',
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
