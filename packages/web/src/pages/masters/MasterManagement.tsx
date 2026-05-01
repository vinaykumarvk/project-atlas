import { useState } from 'react';
import { MasterTable } from './components/MasterTable';
import { ProposeChangeDrawer } from './components/ProposeChangeDrawer';
import { ApproverInbox } from './components/ApproverInbox';
import { BulkImportWizard } from './components/BulkImportWizard';

const MASTER_TABS = [
  { key: 'property_location', label: 'Property Locations' },
  { key: 'case_type', label: 'Case Types' },
  { key: 'fpr', label: 'FPR Assignments' },
  { key: 'vendor', label: 'Vendors' },
  { key: 'tat', label: 'TAT Rules' },
  { key: 'escalation', label: 'Escalation Hierarchy' },
  { key: 'holiday', label: 'Holiday Calendar' },
  { key: 'business_hours', label: 'Business Hours' },
] as const;

type MasterKey = (typeof MASTER_TABS)[number]['key'];

export function MasterManagement() {
  const [activeTab, setActiveTab] = useState<MasterKey>('property_location');
  const [showPropose, setShowPropose] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(null);

  return (
    <div className="master-management">
      <div className="page-header">
        <h2>Master Data Management</h2>
        <div className="header-actions">
          <button type="button" className="btn-secondary" onClick={() => setShowInbox(true)}>
            Approver Inbox (3)
          </button>
          <button type="button" className="btn-secondary" onClick={() => setShowImport(true)}>
            Bulk Import
          </button>
          <button type="button" className="btn-primary" onClick={() => { setSelectedRow(null); setShowPropose(true); }}>
            + Propose Change
          </button>
        </div>
      </div>

      <div className="master-tabs" role="tablist">
        {MASTER_TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={activeTab === tab.key}
            className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        <MasterTable
          masterKey={activeTab}
          onEdit={(row) => { setSelectedRow(row); setShowPropose(true); }}
        />
      </div>

      {showPropose && (
        <ProposeChangeDrawer
          masterKey={activeTab}
          existingData={selectedRow}
          onClose={() => setShowPropose(false)}
          onSubmit={() => { setShowPropose(false); }}
        />
      )}

      {showInbox && (
        <ApproverInbox onClose={() => setShowInbox(false)} />
      )}

      {showImport && (
        <BulkImportWizard
          masterKey={activeTab}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
