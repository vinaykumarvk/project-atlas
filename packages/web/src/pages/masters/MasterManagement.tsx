import { useState } from 'react';
import { MasterTable } from './components/MasterTable';
import { ProposeChangeDrawer } from './components/ProposeChangeDrawer';
import { ApproverInbox } from './components/ApproverInbox';
import { BulkImportWizard } from './components/BulkImportWizard';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

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
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Master Data Management</h2>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowInbox(true)}>
            Approver Inbox (3)
          </Button>
          <Button variant="secondary" onClick={() => setShowImport(true)}>
            Bulk Import
          </Button>
          <Button onClick={() => { setSelectedRow(null); setShowPropose(true); }}>
            + Propose Change
          </Button>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as MasterKey)}
      >
        <TabsList className="flex h-auto flex-wrap gap-1">
          {MASTER_TABS.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {MASTER_TABS.map((tab) => (
          <TabsContent key={tab.key} value={tab.key}>
            <MasterTable
              masterKey={tab.key}
              onEdit={(row) => { setSelectedRow(row); setShowPropose(true); }}
            />
          </TabsContent>
        ))}
      </Tabs>

      <ProposeChangeDrawer
        open={showPropose}
        masterKey={activeTab}
        existingData={selectedRow}
        onClose={() => setShowPropose(false)}
        onSubmit={() => { setShowPropose(false); }}
      />

      <ApproverInbox
        open={showInbox}
        onClose={() => setShowInbox(false)}
      />

      <BulkImportWizard
        open={showImport}
        masterKey={activeTab}
        onClose={() => setShowImport(false)}
      />
    </div>
  );
}
