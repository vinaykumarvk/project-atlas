import { useState } from 'react';
import { useAuditLogs, type AuditLogFilters } from '../../hooks/useAuditLogs';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';

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
    <div className="p-6">
      <h2 className="mb-6">Audit Log Search</h2>

      {/* Filters */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <Input
          type="text"
          placeholder="Event code"
          value={filters.event_code ?? ''}
          onChange={(e) => handleFilterChange('event_code', e.target.value)}
          className="min-w-[140px] w-auto"
        />
        <Input
          type="text"
          placeholder="Actor ID"
          value={filters.actor_id ?? ''}
          onChange={(e) => handleFilterChange('actor_id', e.target.value)}
          className="min-w-[140px] w-auto"
        />
        <Input
          type="text"
          placeholder="Resource type"
          value={filters.resource_type ?? ''}
          onChange={(e) => handleFilterChange('resource_type', e.target.value)}
          className="min-w-[140px] w-auto"
        />
        <Input
          type="date"
          placeholder="From date"
          value={filters.from_date ?? ''}
          onChange={(e) => handleFilterChange('from_date', e.target.value)}
          className="min-w-[140px] w-auto"
        />
        <Input
          type="date"
          placeholder="To date"
          value={filters.to_date ?? ''}
          onChange={(e) => handleFilterChange('to_date', e.target.value)}
          className="min-w-[140px] w-auto"
        />
      </div>

      {/* Status */}
      {isLoading && <p>Loading audit logs...</p>}
      {error && (
        <p className="text-destructive">
          Error loading audit logs: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      )}

      {/* Results table */}
      {data && (
        <>
          <p className="text-sm text-muted-foreground mb-3">
            Showing {data.data.length} of {data.total} results (page {data.page})
          </p>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Event Code</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Hash</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    {new Date(log.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell>{log.event_code}</TableCell>
                  <TableCell>{log.action}</TableCell>
                  <TableCell>{log.actor_id ?? '-'}</TableCell>
                  <TableCell>
                    {log.resource_type}
                    {log.resource_id ? ` #${log.resource_id}` : ''}
                  </TableCell>
                  <TableCell>{log.ip_address ?? '-'}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {log.row_hash.substring(0, 12)}...
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
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

export default AuditSearch;
