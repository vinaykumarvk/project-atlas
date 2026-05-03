import { useState, useMemo, useCallback } from 'react';
import {
  useDsrRequests,
  useUpdateDsrStatus,
  type DsrFilters,
  type DsrStatus,
  type DsrType,
  type DsrRequest,
} from '../../hooks/useDsrRequests';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';

const STATUS_OPTIONS: DsrStatus[] = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED'];
const TYPE_OPTIONS: DsrType[] = ['ACCESS', 'RECTIFICATION', 'ERASURE', 'PORTABILITY'];

const statusBadgeClass: Record<DsrStatus, string> = {
  PENDING: 'bg-amber-500 text-white hover:bg-amber-500',
  IN_PROGRESS: 'bg-blue-500 text-white hover:bg-blue-500',
  COMPLETED: 'bg-emerald-500 text-white hover:bg-emerald-500',
  REJECTED: 'bg-red-500 text-white hover:bg-red-500',
};

const statusSummaryColor: Record<DsrStatus, string> = {
  PENDING: 'text-amber-500',
  IN_PROGRESS: 'text-blue-500',
  COMPLETED: 'text-emerald-500',
  REJECTED: 'text-red-500',
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
    <div className="p-6">
      <h2 className="mb-6">Data Subject Request (DSR) Tracking</h2>

      {/* Compliance Summary Card */}
      {complianceSummary && (
        <div
          data-testid="compliance-summary"
          className="flex gap-6 mb-6 flex-wrap"
        >
          <Card className="min-w-[120px] text-center">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Total Requests</div>
              <div className="text-2xl font-bold text-slate-800">{complianceSummary.total}</div>
            </CardContent>
          </Card>
          {STATUS_OPTIONS.map((status) => (
            <Card key={status} className="min-w-[120px] text-center">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">{status}</div>
                <div className={cn('text-2xl font-bold', statusSummaryColor[status])}>
                  {complianceSummary.byStatus[status] || 0}
                </div>
              </CardContent>
            </Card>
          ))}
          <Card className="min-w-[120px] text-center">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Avg Resolution</div>
              <div className="text-2xl font-bold text-slate-800">
                {complianceSummary.avgResolutionDays}d
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <select
          value={filters.status ?? ''}
          onChange={(e) =>
            setFilters((prev) => ({
              ...prev,
              status: (e.target.value as DsrStatus) || undefined,
              page: 1,
            }))
          }
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
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
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
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
          className="flex gap-3 mb-4 items-center"
        >
          <span className="text-sm text-slate-600">
            {selectedIds.size} selected
          </span>
          <Button
            onClick={handleBulkApprove}
            className="bg-emerald-500 hover:bg-emerald-600"
            size="sm"
            data-testid="bulk-approve-btn"
          >
            Bulk Approve
          </Button>
          <Button
            onClick={handleBulkReject}
            variant="destructive"
            size="sm"
            data-testid="bulk-reject-btn"
          >
            Bulk Reject
          </Button>
        </div>
      )}

      {isLoading && <p>Loading DSR requests...</p>}
      {error && (
        <p className="text-red-600">
          Error: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      )}

      {data && (
        <>
          <p className="text-sm text-muted-foreground mb-3">
            {data.total} request(s) found
          </p>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    data-testid="select-all-checkbox"
                  />
                </TableHead>
                <TableHead className="whitespace-nowrap">Subject</TableHead>
                <TableHead className="whitespace-nowrap">Type</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="whitespace-nowrap">Description</TableHead>
                <TableHead className="whitespace-nowrap">SLA</TableHead>
                <TableHead className="whitespace-nowrap">Due Date</TableHead>
                <TableHead className="whitespace-nowrap">Created</TableHead>
                <TableHead className="whitespace-nowrap">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((dsr) => {
                const sla = getSlaInfo(dsr);
                return (
                  <TableRow key={dsr.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(dsr.id)}
                        onChange={() => toggleSelect(dsr.id)}
                        data-testid={`select-${dsr.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{dsr.subjectName}</div>
                      <div className="text-xs text-slate-400">
                        {dsr.subjectEmail}
                      </div>
                    </TableCell>
                    <TableCell>{dsr.type}</TableCell>
                    <TableCell>
                      <Badge
                        className={statusBadgeClass[dsr.status]}
                      >
                        {dsr.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] overflow-hidden text-ellipsis">
                      {dsr.description}
                    </TableCell>
                    <TableCell>
                      <span
                        data-testid={`sla-${dsr.id}`}
                        className={cn(
                          sla.overdue ? 'text-red-600' : sla.urgent ? 'text-amber-500' : 'text-emerald-500',
                          sla.urgent && 'font-semibold'
                        )}
                      >
                        {sla.text}
                      </span>
                    </TableCell>
                    <TableCell>
                      {new Date(dsr.dueDate).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {new Date(dsr.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <select
                        value={dsr.status}
                        onChange={(e) =>
                          handleStatusChange(dsr.id, e.target.value as DsrStatus)
                        }
                        className="h-8 min-w-[100px] rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page === 1}
              onClick={() =>
                setFilters((prev) => ({ ...prev, page: (prev.page ?? 1) - 1 }))
              }
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={data.data.length < (filters.limit ?? 20)}
              onClick={() =>
                setFilters((prev) => ({ ...prev, page: (prev.page ?? 1) + 1 }))
              }
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default DsrTracking;
