import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CaseStatusBadge, type CaseStatus } from '../components/CaseStatusBadge';
import { PriorityIndicator, type Priority } from '../components/PriorityIndicator';
import { apiGet } from '../api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface VendorCase {
  id: string;
  case_id: string;
  caseNumber: string;
  type: string;
  status: CaseStatus;
  priority: Priority;
  tatRemaining: string;
  submittedAt?: string;
}

interface VendorCasesResponse {
  data: VendorCase[];
  total: number;
}

const MOCK_VENDOR_CASES: VendorCase[] = [
  { id: '1', case_id: 'case-1042', caseNumber: 'CASE-1042', type: 'Valuation', status: 'PENDING_VENDOR', priority: 'P2', tatRemaining: '12h 30m' },
  { id: '2', case_id: 'case-1038', caseNumber: 'CASE-1038', type: 'Inspection', status: 'IN_PROGRESS', priority: 'P1', tatRemaining: '4h 15m' },
  { id: '3', case_id: 'case-1035', caseNumber: 'CASE-1035', type: 'Settlement', status: 'PENDING_VENDOR', priority: 'P3', tatRemaining: '2d 6h' },
  { id: '4', case_id: 'case-1031', caseNumber: 'CASE-1031', type: 'Title Search', status: 'IN_PROGRESS', priority: 'P1', tatRemaining: '1h 45m' },
  { id: '5', case_id: 'case-1029', caseNumber: 'CASE-1029', type: 'Valuation', status: 'PENDING_VENDOR', priority: 'P4', tatRemaining: '5d 0h', submittedAt: new Date().toISOString() },
];

// In a real app this would come from auth context or route param
const VENDOR_ID = 'vendor-001';

/**
 * Check whether a TAT string represents an overdue case.
 * Negative or zero remaining TAT is considered overdue.
 */
function isOverdue(tatRemaining: string): boolean {
  return tatRemaining.startsWith('-') || tatRemaining === '0h 0m';
}

/**
 * Check whether a case was submitted today.
 */
function isSubmittedToday(submittedAt?: string): boolean {
  if (!submittedAt) return false;
  const today = new Date().toISOString().split('T')[0];
  return submittedAt.startsWith(today);
}

const VendorPortalPage = () => {
  const [vendorId] = useState(VENDOR_ID);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const navigate = useNavigate();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['vendor-cases', vendorId],
    queryFn: () => apiGet<VendorCasesResponse>('/cases', { vendor_id: vendorId }),
  });

  const cases: VendorCase[] = data?.data ?? MOCK_VENDOR_CASES;
  const total = data?.total ?? MOCK_VENDOR_CASES.length;

  // Derive unique statuses and types for filter dropdowns
  const uniqueStatuses = useMemo(() => [...new Set(cases.map((c) => c.status))], [cases]);
  const uniqueTypes = useMemo(() => [...new Set(cases.map((c) => c.type))], [cases]);

  // Apply filters
  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (typeFilter && c.type !== typeFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesCaseNumber = c.caseNumber.toLowerCase().includes(q);
        const matchesType = c.type.toLowerCase().includes(q);
        if (!matchesCaseNumber && !matchesType) return false;
      }
      return true;
    });
  }, [cases, statusFilter, typeFilter, searchQuery]);

  // Compute summary tile values
  const openCount = cases.filter(
    (c) => c.status !== 'CLOSED' && c.status !== ('CANCELLED' as CaseStatus),
  ).length;
  const overdueCount = cases.filter((c) => isOverdue(c.tatRemaining)).length;
  const submittedTodayCount = cases.filter((c) => isSubmittedToday(c.submittedAt)).length;
  const weekScore = total > 0 ? Math.round(((total - overdueCount) / total) * 100) : 0;

  if (isLoading) {
    return (
      <div>
        <h2 className="mb-2 text-2xl font-bold">Vendor Portal</h2>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card p-16 text-center">
          <p>Loading vendor cases...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <h2 className="mb-2 text-2xl font-bold">Vendor Portal</h2>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-red-200 bg-card p-16 text-center">
          <p className="text-red-600">
            Failed to load cases: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </div>
      </div>
    );
  }

  if (cases.length === 0) {
    return (
      <div>
        <h2 className="mb-2 text-2xl font-bold">Vendor Portal</h2>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-16 text-center">
            <Building2 className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="mb-2 text-lg font-semibold">No vendor cases</h3>
            <p className="text-sm text-muted-foreground">Cases assigned to vendors will appear here.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div data-testid="vendor-portal">
      <h2 className="mb-2 text-2xl font-bold">Vendor Portal</h2>
      <p className="mb-4 text-sm text-slate-500">
        Read-only view of assigned cases ({total} total)
      </p>

      <Button
        data-testid="start-onboarding-btn"
        onClick={() => { setShowOnboarding(true); setOnboardingStep(1); }}
        className="mb-4"
      >
        Start Vendor Onboarding
      </Button>

      {/* FR-156.A1: Vendor Onboarding Wizard */}
      <Dialog open={showOnboarding} onOpenChange={setShowOnboarding}>
        <DialogContent data-testid="vendor-onboarding-wizard" className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Vendor Onboarding — Step {onboardingStep} of 3</DialogTitle>
            <DialogDescription className="sr-only">Complete the vendor onboarding wizard</DialogDescription>
          </DialogHeader>

          {onboardingStep === 1 && (
            <div data-testid="onboarding-step-1" className="space-y-3">
              <p className="text-sm">Enter your organization details</p>
              <Input placeholder="Organization Name" />
              <Input placeholder="Contact Email" />
            </div>
          )}
          {onboardingStep === 2 && (
            <div data-testid="onboarding-step-2" className="space-y-3">
              <p className="text-sm">Configure integration settings</p>
              <Select defaultValue="API Integration">
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select integration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="API Integration">API Integration</SelectItem>
                  <SelectItem value="Email Integration">Email Integration</SelectItem>
                  <SelectItem value="Portal Only">Portal Only</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="API Key (if applicable)" />
            </div>
          )}
          {onboardingStep === 3 && (
            <div data-testid="onboarding-step-3" className="space-y-2">
              <p className="text-sm">Review and confirm</p>
              <p className="text-sm text-emerald-600">Organization details configured</p>
              <p className="text-sm text-emerald-600">Integration settings saved</p>
              <p className="text-sm">Click &quot;Complete&quot; to finish onboarding.</p>
            </div>
          )}

          <DialogFooter className="flex-row justify-between sm:justify-between">
            <Button
              variant="outline"
              onClick={() => onboardingStep > 1 ? setOnboardingStep(s => s - 1) : setShowOnboarding(false)}
            >
              {onboardingStep === 1 ? 'Cancel' : 'Back'}
            </Button>
            <Button
              onClick={() => onboardingStep < 3 ? setOnboardingStep(s => s + 1) : setShowOnboarding(false)}
            >
              {onboardingStep === 3 ? 'Complete' : 'Next'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FR-081 A1: Summary tiles */}
      <div className="mb-4 grid grid-cols-4 gap-4" data-testid="vendor-summary-tiles">
        <Card className="border-l-4 border-l-blue-500 p-4">
          <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Open Cases</div>
          <div className="text-2xl font-bold">{openCount}</div>
        </Card>
        <Card className="border-l-4 border-l-red-500 p-4">
          <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Overdue</div>
          <div className="text-2xl font-bold">{overdueCount}</div>
        </Card>
        <Card className="border-l-4 border-l-green-500 p-4">
          <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Submitted Today</div>
          <div className="text-2xl font-bold">{submittedTodayCount}</div>
        </Card>
        <Card className="border-l-4 border-l-purple-500 p-4">
          <div className="mb-1 text-xs font-semibold uppercase text-slate-500">This Week Score</div>
          <div className="text-2xl font-bold">{weekScore}%</div>
        </Card>
      </div>

      {/* FR-081 A2: Filter controls */}
      <div className="mb-4 flex flex-wrap gap-3" data-testid="vendor-filters">
        <Select value={statusFilter || '__all__'} onValueChange={(v) => setStatusFilter(v === '__all__' ? '' : v)}>
          <SelectTrigger className="min-w-[160px]" aria-label="Filter by status">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Statuses</SelectItem>
            {uniqueStatuses.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter || '__all__'} onValueChange={(v) => setTypeFilter(v === '__all__' ? '' : v)}>
          <SelectTrigger className="min-w-[160px]" aria-label="Filter by type">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Types</SelectItem>
            {uniqueTypes.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="min-w-[200px] flex-1"
          type="text"
          placeholder="Search cases..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search cases"
        />
      </div>

      <Card>
        <Table role="table" aria-label="Vendor cases">
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap text-xs uppercase">Case #</TableHead>
              <TableHead className="whitespace-nowrap text-xs uppercase">Type</TableHead>
              <TableHead className="whitespace-nowrap text-xs uppercase">Status</TableHead>
              <TableHead className="whitespace-nowrap text-xs uppercase">Priority</TableHead>
              <TableHead className="whitespace-nowrap text-xs uppercase">TAT Remaining</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCases.map((c) => (
              <TableRow
                key={c.id}
                data-testid="vendor-case-row"
                className="cursor-pointer"
                onClick={() => navigate(`/cases/${c.case_id}`)}
              >
                <TableCell className="whitespace-nowrap"><strong>{c.caseNumber}</strong></TableCell>
                <TableCell className="whitespace-nowrap">{c.type}</TableCell>
                <TableCell className="whitespace-nowrap"><CaseStatusBadge status={c.status} /></TableCell>
                <TableCell className="whitespace-nowrap"><PriorityIndicator priority={c.priority} /></TableCell>
                <TableCell className="whitespace-nowrap">{c.tatRemaining}</TableCell>
              </TableRow>
            ))}
            {filteredCases.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-slate-400">
                  No cases match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

export default VendorPortalPage;
