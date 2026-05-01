import { useState, useEffect } from 'react';
import { apiGet } from '../../api/client';

interface DsrRequest {
  id: string;
  type: string;
  status: string;
  requestedAt: string;
  subject: string;
}

const MOCK_DSR_REQUESTS: DsrRequest[] = [
  { id: 'dsr-1', type: 'ERASURE', status: 'PENDING', requestedAt: '2026-04-28T10:00:00Z', subject: 'John Doe' },
  { id: 'dsr-2', type: 'ACCESS', status: 'IN_PROGRESS', requestedAt: '2026-04-27T09:00:00Z', subject: 'Jane Smith' },
  { id: 'dsr-3', type: 'RECTIFICATION', status: 'COMPLETED', requestedAt: '2026-04-25T08:00:00Z', subject: 'Bob Wilson' },
];

export default function DpoConsole() {
  const [dsrRequests, setDsrRequests] = useState<DsrRequest[]>(MOCK_DSR_REQUESTS);
  const [activeTab, setActiveTab] = useState<'dsr' | 'consent' | 'evidence'>('dsr');

  useEffect(() => {
    apiGet<{ data: DsrRequest[] }>('/compliance/dsr/requests')
      .then(res => setDsrRequests(res.data || MOCK_DSR_REQUESTS))
      .catch(() => setDsrRequests(MOCK_DSR_REQUESTS));
  }, []);

  const tabs = [
    { id: 'dsr' as const, label: 'DSR Requests' },
    { id: 'consent' as const, label: 'Consent Management' },
    { id: 'evidence' as const, label: 'Evidence Generation' },
  ];

  const statusColors: Record<string, string> = {
    PENDING: '#f59e0b',
    IN_PROGRESS: '#3b82f6',
    COMPLETED: '#10b981',
  };

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 24 }}>DPO Console</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            data-testid={`tab-${tab.id}`}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: '1px solid #e5e7eb',
              backgroundColor: activeTab === tab.id ? '#3b82f6' : '#fff',
              color: activeTab === tab.id ? '#fff' : '#374151',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'dsr' && (
        <div data-testid="dsr-panel">
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Data Subject Requests</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: 8 }}>ID</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Type</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Subject</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Status</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Requested At</th>
              </tr>
            </thead>
            <tbody>
              {dsrRequests.map(req => (
                <tr key={req.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 8 }}>{req.id}</td>
                  <td style={{ padding: 8 }}>{req.type}</td>
                  <td style={{ padding: 8 }}>{req.subject}</td>
                  <td style={{ padding: 8 }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 12,
                      fontSize: 12,
                      backgroundColor: statusColors[req.status] || '#6b7280',
                      color: '#fff',
                    }}>
                      {req.status}
                    </span>
                  </td>
                  <td style={{ padding: 8 }}>{new Date(req.requestedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'consent' && (
        <div data-testid="consent-panel">
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Consent Management</h2>
          <p style={{ color: '#6b7280' }}>Consent ledger integration — view and manage data processing consents.</p>
        </div>
      )}

      {activeTab === 'evidence' && (
        <div data-testid="evidence-panel">
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Evidence Generation</h2>
          <button
            onClick={() => alert('Evidence generation triggered')}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              backgroundColor: '#3b82f6',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Generate Regulatory Evidence Pack
          </button>
        </div>
      )}
    </div>
  );
}
