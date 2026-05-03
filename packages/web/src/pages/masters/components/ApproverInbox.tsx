import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';

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
  open: boolean;
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

const ACTION_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  CREATE: 'default',
  UPDATE: 'secondary',
  DELETE: 'destructive',
};

export function ApproverInbox({ open, onClose }: ApproverInboxProps) {
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
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Approver Inbox</SheetTitle>
          <SheetDescription>{pending.length} pending changes</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-6">
          {pending.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">
              No pending changes.
            </p>
          )}

          {pending.map((change) => (
            <Card key={change.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge variant={ACTION_BADGE_VARIANT[change.action]}>
                    {change.action}
                  </Badge>
                  <span className="font-medium capitalize">
                    {change.masterTable.replace(/_/g, ' ')}
                  </span>
                  <span className="text-sm text-muted-foreground ml-auto">
                    by {change.proposedBy} on {new Date(change.proposedAt).toLocaleDateString()}
                  </span>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  {change.before && (
                    <div className="rounded-md bg-muted p-3">
                      <h5 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                        Before
                      </h5>
                      <pre className="whitespace-pre-wrap text-xs">
                        {JSON.stringify(change.before, null, 2)}
                      </pre>
                    </div>
                  )}
                  <div className="rounded-md bg-muted p-3">
                    <h5 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                      {change.before ? 'After' : 'New Record'}
                    </h5>
                    <pre className="whitespace-pre-wrap text-xs">
                      {JSON.stringify(change.after, null, 2)}
                    </pre>
                  </div>
                </div>
              </CardContent>

              <CardFooter className="gap-2">
                {rejectingId === change.id ? (
                  <div className="flex w-full items-center gap-2">
                    <Input
                      placeholder="Reason for rejection..."
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleReject(change.id)}
                    >
                      Confirm Reject
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRejectingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <Button
                      size="sm"
                      onClick={() => handleApprove(change.id)}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setRejectingId(change.id)}
                    >
                      Reject
                    </Button>
                  </>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
