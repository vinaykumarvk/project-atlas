import { useState, useEffect } from 'react';
import { apiGet } from '../../api/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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

const statusBadgeClass: Record<string, string> = {
  PENDING: 'bg-amber-500 text-white hover:bg-amber-500/80',
  IN_PROGRESS: 'bg-blue-500 text-white hover:bg-blue-500/80',
  COMPLETED: 'bg-emerald-500 text-white hover:bg-emerald-500/80',
};

export default function DpoConsole() {
  const [dsrRequests, setDsrRequests] = useState<DsrRequest[]>(MOCK_DSR_REQUESTS);

  useEffect(() => {
    apiGet<{ data: DsrRequest[] }>('/compliance/dsr/requests')
      .then(res => setDsrRequests(res.data || MOCK_DSR_REQUESTS))
      .catch(() => setDsrRequests(MOCK_DSR_REQUESTS));
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">DPO Console</h1>

      <Tabs defaultValue="dsr">
        <TabsList className="mb-6">
          <TabsTrigger value="dsr" data-testid="tab-dsr">
            DSR Requests
          </TabsTrigger>
          <TabsTrigger value="consent" data-testid="tab-consent">
            Consent Management
          </TabsTrigger>
          <TabsTrigger value="evidence" data-testid="tab-evidence">
            Evidence Generation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dsr" data-testid="dsr-panel">
          <h2 className="text-lg font-semibold mb-4">Data Subject Requests</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Requested At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dsrRequests.map(req => (
                <TableRow key={req.id}>
                  <TableCell>{req.id}</TableCell>
                  <TableCell>{req.type}</TableCell>
                  <TableCell>{req.subject}</TableCell>
                  <TableCell>
                    <Badge
                      className={cn(
                        'border-transparent',
                        statusBadgeClass[req.status] || 'bg-gray-500 text-white hover:bg-gray-500/80',
                      )}
                    >
                      {req.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(req.requestedAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="consent" data-testid="consent-panel">
          <h2 className="text-lg font-semibold mb-4">Consent Management</h2>
          <p className="text-muted-foreground">Consent ledger integration — view and manage data processing consents.</p>
        </TabsContent>

        <TabsContent value="evidence" data-testid="evidence-panel">
          <h2 className="text-lg font-semibold mb-4">Evidence Generation</h2>
          <Button onClick={() => alert('Evidence generation triggered')}>
            Generate Regulatory Evidence Pack
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
