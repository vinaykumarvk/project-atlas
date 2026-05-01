import { useState } from 'react';
import { useConsent, type ConsentFilters } from '../../hooks/useConsent';

export function ConsentLedger() {
  const [filters, setFilters] = useState<ConsentFilters>({ page: 1, limit: 20 });
  const { data, isLoading, error } = useConsent(filters);

  const handleFilterChange = (key: keyof ConsentFilters, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value || undefined,
      page: 1,
    }));
  };

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ margin: '0 0 1.5rem 0' }}>Consent Ledger</h2>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Subject ID"
          value={filters.subjectId ?? ''}
          onChange={(e) => handleFilterChange('subjectId', e.target.value)}
          style={inputStyle}
        />
        <input
          type="text"
          placeholder="Purpose"
          value={filters.purpose ?? ''}
          onChange={(e) => handleFilterChange('purpose', e.target.value)}
          style={inputStyle}
        />
      </div>

      {isLoading && <p>Loading consent records...</p>}
      {error && (
        <p style={{ color: '#dc2626' }}>
          Error: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      )}

      {data && (
        <>
          <p style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.75rem' }}>
            {data.total} consent record(s)
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Subject</th>
                  <th style={thStyle}>Purpose</th>
                  <th style={thStyle}>Consent</th>
                  <th style={thStyle}>Consent Date</th>
                  <th style={thStyle}>Expiry</th>
                  <th style={thStyle}>Source</th>
                  <th style={thStyle}>Version</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((record) => (
                  <tr key={record.id}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 500 }}>{record.subjectId}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        {record.subjectEmail}
                      </div>
                    </td>
                    <td style={tdStyle}>{record.purpose}</td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.125rem 0.5rem',
                          borderRadius: '999px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: '#fff',
                          backgroundColor: record.consentGiven ? '#10b981' : '#ef4444',
                        }}
                      >
                        {record.consentGiven ? 'GRANTED' : 'WITHDRAWN'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {new Date(record.consentDate).toLocaleDateString()}
                    </td>
                    <td style={tdStyle}>
                      {record.expiryDate
                        ? new Date(record.expiryDate).toLocaleDateString()
                        : 'No expiry'}
                    </td>
                    <td style={tdStyle}>{record.source}</td>
                    <td style={tdStyle}>{record.version}</td>
                  </tr>
                ))}
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

export default ConsentLedger;

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
