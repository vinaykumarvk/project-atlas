import { useState } from 'react';

interface MasterTableProps {
  masterKey: string;
  onEdit: (row: Record<string, unknown>) => void;
}

// Mock data per master type
const MOCK_DATA: Record<string, Record<string, unknown>[]> = {
  property_location: [
    { id: '1', canonical_form: 'Mumbai', zone: 'West', state: 'Maharashtra', pin_prefix: '400', is_active: true },
    { id: '2', canonical_form: 'Pune', zone: 'West', state: 'Maharashtra', pin_prefix: '411', is_active: true },
    { id: '3', canonical_form: 'Nashik', zone: 'North', state: 'Maharashtra', pin_prefix: '422', is_active: true },
  ],
  case_type: [
    { id: '1', code: 'VALUATION_REQUEST', label: 'Property Valuation', tat_hours: 48, is_active: true },
    { id: '2', code: 'LEGAL_OPINION', label: 'Legal Opinion', tat_hours: 72, is_active: true },
    { id: '3', code: 'TITLE_SEARCH', label: 'Title Search', tat_hours: 48, is_active: true },
    { id: '4', code: 'INSURANCE_RENEWAL', label: 'Insurance Renewal', tat_hours: 24, is_active: true },
  ],
  fpr: [
    { id: '1', name: 'Amit Sharma', email: 'amit@bank.com', zone: 'Mumbai', capacity: 10, open_cases: 3 },
    { id: '2', name: 'Priya Patel', email: 'priya@bank.com', zone: 'Mumbai', capacity: 8, open_cases: 7 },
  ],
  vendor: [
    { id: '1', name: 'QuickVal Services', geography: 'Mumbai,Pune', avg_tat: 3, rating: 4.2 },
    { id: '2', name: 'PremiumVal India', geography: 'Mumbai,Nashik', avg_tat: 2, rating: 4.8 },
  ],
  tat: [
    { id: '1', case_type: 'VALUATION_REQUEST', hours: 48, warn_at: 75 },
    { id: '2', case_type: 'LEGAL_OPINION', hours: 72, warn_at: 75 },
  ],
  escalation: [
    { id: '1', level: 1, role: 'Team Lead', delay_hours: 0, channel: 'EMAIL' },
    { id: '2', level: 2, role: 'Regional Head', delay_hours: 4, channel: 'EMAIL,TEAMS' },
  ],
  holiday: [
    { id: '1', date: '2026-01-26', name: 'Republic Day', region: 'ALL' },
    { id: '2', date: '2026-08-15', name: 'Independence Day', region: 'ALL' },
  ],
  business_hours: [
    { id: '1', day: 'MON', open: '09:30', close: '18:30', is_working: true },
    { id: '2', day: 'SAT', open: '-', close: '-', is_working: false },
  ],
};

export function MasterTable({ masterKey, onEdit }: MasterTableProps) {
  const [search, setSearch] = useState('');
  const data = MOCK_DATA[masterKey] || [];
  const columns = data.length > 0 ? Object.keys(data[0]) : [];

  const filtered = data.filter((row) =>
    Object.values(row).some((v) =>
      String(v).toLowerCase().includes(search.toLowerCase()),
    ),
  );

  return (
    <div className="master-table-container">
      <div className="table-toolbar">
        <input
          type="search"
          placeholder="Search records..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="table-search"
        />
        <span className="record-count">{filtered.length} records</span>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col}>{col.replace(/_/g, ' ').toUpperCase()}</th>
            ))}
            <th>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((row, idx) => (
            <tr key={idx}>
              {columns.map((col) => (
                <td key={col}>
                  {typeof row[col] === 'boolean'
                    ? row[col] ? 'Yes' : 'No'
                    : String(row[col])}
                </td>
              ))}
              <td>
                <button className="btn-sm" onClick={() => onEdit(row)}>Edit</button>
                <button className="btn-sm btn-ghost">History</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
