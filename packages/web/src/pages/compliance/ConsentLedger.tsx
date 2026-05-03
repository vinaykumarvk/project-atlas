import { useState } from 'react';
import { useConsent, type ConsentFilters } from '../../hooks/useConsent';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
    <div className="p-6">
      <h2 className="mb-6">Consent Ledger</h2>

      {/* Filters */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <Input
          type="text"
          placeholder="Subject ID"
          value={filters.subjectId ?? ''}
          onChange={(e) => handleFilterChange('subjectId', e.target.value)}
          className="min-w-[140px] w-auto"
        />
        <Input
          type="text"
          placeholder="Purpose"
          value={filters.purpose ?? ''}
          onChange={(e) => handleFilterChange('purpose', e.target.value)}
          className="min-w-[140px] w-auto"
        />
      </div>

      {isLoading && <p>Loading consent records...</p>}
      {error && (
        <p className="text-destructive">
          Error: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      )}

      {data && (
        <>
          <p className="text-sm text-muted-foreground mb-3">
            {data.total} consent record(s)
          </p>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Consent</TableHead>
                <TableHead>Consent Date</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Version</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>
                    <div className="font-medium">{record.subjectId}</div>
                    <div className="text-xs text-muted-foreground">
                      {record.subjectEmail}
                    </div>
                  </TableCell>
                  <TableCell>{record.purpose}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        record.consentGiven
                          ? 'border-transparent bg-emerald-500 text-white hover:bg-emerald-500/80'
                          : 'border-transparent bg-red-500 text-white hover:bg-red-500/80'
                      }
                    >
                      {record.consentGiven ? 'GRANTED' : 'WITHDRAWN'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(record.consentDate).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {record.expiryDate
                      ? new Date(record.expiryDate).toLocaleDateString()
                      : 'No expiry'}
                  </TableCell>
                  <TableCell>{record.source}</TableCell>
                  <TableCell>{record.version}</TableCell>
                </TableRow>
              ))}
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

export default ConsentLedger;
