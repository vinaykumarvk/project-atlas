import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isDemoMode } from '../config/flags';
import { useCollateralRisk } from '../hooks/useCollateralOps';
import type { CollateralRiskSummary, RiskSummaryCase } from '../hooks/useCollateralOps';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldAlert } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// ---------------------------------------------------------------------------
// Mock data for demo mode
// ---------------------------------------------------------------------------

const MOCK_DATA: CollateralRiskSummary = {
  totalCases: 45,
  low: 18,
  medium: 14,
  high: 9,
  critical: 4,
  cases: [
    { id: 'c1', caseNumber: 'ATL-2026-000101', caseType: 'VALUATION_REQUEST', riskScore: 88, riskTier: 'CRITICAL', propertyCity: 'Delhi', status: 'NEW', documentCompleteness: 20, valuationVariance: true },
    { id: 'c2', caseNumber: 'ATL-2026-000102', caseType: 'TITLE_SEARCH', riskScore: 85, riskTier: 'CRITICAL', propertyCity: null, status: 'AWAITING_VENDOR', documentCompleteness: 0, valuationVariance: true },
    { id: 'c3', caseNumber: 'ATL-2026-000103', caseType: 'LEGAL_OPINION', riskScore: 82, riskTier: 'CRITICAL', propertyCity: 'Kolkata', status: 'NEW', documentCompleteness: 25, valuationVariance: false },
    { id: 'c4', caseNumber: 'ATL-2026-000104', caseType: 'SITE_VISIT', riskScore: 78, riskTier: 'CRITICAL', propertyCity: 'Mumbai', status: 'AWAITING_VENDOR', documentCompleteness: 37, valuationVariance: true },
    { id: 'c5', caseNumber: 'ATL-2026-000105', caseType: 'VALUATION_REQUEST', riskScore: 68, riskTier: 'HIGH', propertyCity: 'Pune', status: 'IN_PROGRESS', documentCompleteness: 40, valuationVariance: false },
    { id: 'c6', caseNumber: 'ATL-2026-000106', caseType: 'LEGAL_OPINION', riskScore: 62, riskTier: 'HIGH', propertyCity: 'Delhi', status: 'IN_PROGRESS', documentCompleteness: 50, valuationVariance: false },
    { id: 'c7', caseNumber: 'ATL-2026-000107', caseType: 'TITLE_SEARCH', riskScore: 58, riskTier: 'HIGH', propertyCity: 'Mumbai', status: 'IN_PROGRESS', documentCompleteness: 60, valuationVariance: true },
    { id: 'c8', caseNumber: 'ATL-2026-000108', caseType: 'VALUATION_REQUEST', riskScore: 55, riskTier: 'HIGH', propertyCity: 'Nashik', status: 'AWAITING_VENDOR', documentCompleteness: 40, valuationVariance: false },
    { id: 'c9', caseNumber: 'ATL-2026-000109', caseType: 'SITE_VISIT', riskScore: 52, riskTier: 'HIGH', propertyCity: 'Chennai', status: 'IN_PROGRESS', documentCompleteness: 50, valuationVariance: false },
    { id: 'c10', caseNumber: 'ATL-2026-000110', caseType: 'INSURANCE_RENEWAL', riskScore: 45, riskTier: 'MEDIUM', propertyCity: 'Bangalore', status: 'IN_PROGRESS', documentCompleteness: 75, valuationVariance: false },
    { id: 'c11', caseNumber: 'ATL-2026-000111', caseType: 'VALUATION_REQUEST', riskScore: 38, riskTier: 'MEDIUM', propertyCity: 'Mumbai', status: 'IN_PROGRESS', documentCompleteness: 80, valuationVariance: false },
    { id: 'c12', caseNumber: 'ATL-2026-000112', caseType: 'LEGAL_OPINION', riskScore: 32, riskTier: 'MEDIUM', propertyCity: 'Hyderabad', status: 'REVIEW', documentCompleteness: 100, valuationVariance: false },
    { id: 'c13', caseNumber: 'ATL-2026-000113', caseType: 'VALUATION_REQUEST', riskScore: 20, riskTier: 'LOW', propertyCity: 'Mumbai', status: 'REVIEW', documentCompleteness: 100, valuationVariance: false },
    { id: 'c14', caseNumber: 'ATL-2026-000114', caseType: 'DISCHARGE', riskScore: 12, riskTier: 'LOW', propertyCity: 'Pune', status: 'REVIEW', documentCompleteness: 100, valuationVariance: false },
    { id: 'c15', caseNumber: 'ATL-2026-000115', caseType: 'SETTLEMENT', riskScore: 8, riskTier: 'LOW', propertyCity: 'Delhi', status: 'VENDOR_COMPLETED', documentCompleteness: 100, valuationVariance: false },
  ],
};

const RISK_TIER_CONFIG: Record<string, { label: string; color: string; bgColor: string; tw: string; twBg: string; twBorder: string }> = {
  LOW: { label: 'Low', color: '#16a34a', bgColor: '#dcfce7', tw: 'text-green-600', twBg: 'bg-green-100', twBorder: 'border-green-600' },
  MEDIUM: { label: 'Medium', color: '#ca8a04', bgColor: '#fef9c3', tw: 'text-yellow-600', twBg: 'bg-yellow-100', twBorder: 'border-yellow-600' },
  HIGH: { label: 'High', color: '#ea580c', bgColor: '#fed7aa', tw: 'text-orange-600', twBg: 'bg-orange-200', twBorder: 'border-orange-600' },
  CRITICAL: { label: 'Critical', color: '#dc2626', bgColor: '#fecaca', tw: 'text-red-600', twBg: 'bg-red-200', twBorder: 'border-red-600' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CollateralRiskPage = () => {
  const demo = isDemoMode();
  const navigate = useNavigate();
  const [tierFilter, setTierFilter] = useState<string>('');

  // Live hook (called unconditionally)
  const { data: liveData, isLoading, isError, error } = useCollateralRisk();

  const data: CollateralRiskSummary = demo
    ? MOCK_DATA
    : (liveData ?? { totalCases: 0, low: 0, medium: 0, high: 0, critical: 0, cases: [] });

  // Filter cases
  const filteredCases = tierFilter
    ? data.cases.filter((c: RiskSummaryCase) => c.riskTier === tierFilter)
    : data.cases;

  // Loading
  if (!demo && isLoading) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold">Collateral Risk Portfolio</h2>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card p-16 text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-[3px] border-border border-t-blue-500" />
          <p className="max-w-[480px] text-sm leading-relaxed text-slate-400">Loading collateral risk data...</p>
        </div>
      </div>
    );
  }

  // Error
  if (!demo && isError) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold">Collateral Risk Portfolio</h2>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-red-200 bg-card p-16 text-center">
          <p className="max-w-[480px] text-sm leading-relaxed text-red-600">
            {error instanceof Error ? error.message : 'Failed to load collateral risk data'}
          </p>
        </div>
      </div>
    );
  }

  // Empty state
  if (!demo && data.totalCases === 0 && data.cases.length === 0) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold">Collateral Risk Portfolio</h2>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-16 text-center">
            <ShieldAlert className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="mb-2 text-lg font-semibold">No risk data</h3>
            <p className="text-sm text-muted-foreground">Risk portfolio data will appear once cases are assessed.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold">Collateral Risk Portfolio</h2>

      {/* Risk Tier Summary */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((tier) => {
          const config = RISK_TIER_CONFIG[tier];
          const count = data[tier.toLowerCase() as 'low' | 'medium' | 'high' | 'critical'];
          const isActive = tierFilter === tier;

          return (
            <button
              key={tier}
              onClick={() => setTierFilter(isActive ? '' : tier)}
              className={cn(
                'flex cursor-pointer flex-col items-center gap-1 rounded-lg border bg-card p-5 transition-colors',
                isActive && cn(config.twBorder, config.twBg, 'border-2'),
                !isActive && 'border-border',
              )}
              type="button"
            >
              <span className={cn('text-xs font-semibold uppercase', config.tw)}>{config.label}</span>
              <span className={cn('text-3xl font-bold', config.tw)}>{count}</span>
              <span className="text-sm text-slate-400">
                {data.totalCases > 0 ? `${Math.round((count / data.totalCases) * 100)}%` : '0%'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Visual Bar Chart */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Risk Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((tier) => {
              const config = RISK_TIER_CONFIG[tier];
              const count = data[tier.toLowerCase() as 'low' | 'medium' | 'high' | 'critical'];
              const maxCount = Math.max(data.low, data.medium, data.high, data.critical, 1);

              return (
                <div key={tier} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-sm font-medium">{config.label}</span>
                  <div className="h-6 flex-1 overflow-hidden rounded bg-slate-100">
                    <div
                      className="h-full rounded transition-[width] duration-300 ease-in-out"
                      style={{
                        width: `${(count / maxCount) * 100}%`,
                        backgroundColor: config.color,
                      }}
                    />
                  </div>
                  <span className="w-10 text-right text-sm font-semibold">{count}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Document Completeness Trends */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Document Completeness Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            {([
              { label: 'Complete (100%)', min: 100, max: 100, color: '#16a34a', twBg: 'bg-green-600' },
              { label: 'Near Complete (75-99%)', min: 75, max: 99, color: '#ca8a04', twBg: 'bg-yellow-600' },
              { label: 'Partial (25-74%)', min: 25, max: 74, color: '#ea580c', twBg: 'bg-orange-600' },
              { label: 'Low (0-24%)', min: 0, max: 24, color: '#dc2626', twBg: 'bg-red-600' },
            ] as const).map((band) => {
              const count = data.cases.filter(
                (c: RiskSummaryCase) => c.documentCompleteness >= band.min && c.documentCompleteness <= band.max,
              ).length;

              return (
                <div key={band.label} className="flex items-center gap-3 rounded-md border p-3">
                  <div className={cn('h-10 w-2 shrink-0 rounded', band.twBg)} />
                  <div>
                    <span className="block text-sm font-medium">{band.label}</span>
                    <span className="block text-lg font-bold" style={{ color: band.color }}>{count} cases</span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Risk Breakdown Table */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-base font-semibold">
            {tierFilter ? `${RISK_TIER_CONFIG[tierFilter].label} Risk Cases` : 'All Cases'} ({filteredCases.length})
          </h3>
          {tierFilter && (
            <Button variant="outline" size="sm" onClick={() => setTierFilter('')}>
              Clear filter
            </Button>
          )}
        </div>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap text-xs uppercase">Case #</TableHead>
                <TableHead className="whitespace-nowrap text-xs uppercase">Type</TableHead>
                <TableHead className="whitespace-nowrap text-xs uppercase">Risk Score</TableHead>
                <TableHead className="whitespace-nowrap text-xs uppercase">Tier</TableHead>
                <TableHead className="whitespace-nowrap text-xs uppercase">Location</TableHead>
                <TableHead className="whitespace-nowrap text-xs uppercase">Status</TableHead>
                <TableHead className="whitespace-nowrap text-xs uppercase">Doc Completeness</TableHead>
                <TableHead className="whitespace-nowrap text-xs uppercase">Valuation Variance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCases.map((c: RiskSummaryCase) => {
                const tierConfig = RISK_TIER_CONFIG[c.riskTier] ?? RISK_TIER_CONFIG['LOW'];
                return (
                  <TableRow
                    key={c.id}
                    onClick={() => navigate(`/cases/${c.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell className="whitespace-nowrap"><strong>{c.caseNumber}</strong></TableCell>
                    <TableCell className="whitespace-nowrap">{c.caseType.replace(/_/g, ' ')}</TableCell>
                    <TableCell className="whitespace-nowrap">{c.riskScore}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge
                        variant="secondary"
                        className={cn(
                          'rounded-full text-[0.7rem]',
                          tierConfig.twBg,
                          tierConfig.tw,
                          'border-transparent',
                        )}
                      >
                        {tierConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{c.propertyCity ?? 'N/A'}</TableCell>
                    <TableCell className="whitespace-nowrap">{c.status.replace(/_/g, ' ')}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="mr-2 inline-block h-2 w-[60px] overflow-hidden rounded bg-slate-100 align-middle">
                        <div
                          className="h-full rounded"
                          style={{
                            width: `${c.documentCompleteness}%`,
                            backgroundColor: c.documentCompleteness === 100 ? '#16a34a' : c.documentCompleteness >= 75 ? '#ca8a04' : '#dc2626',
                          }}
                        />
                      </div>
                      <span className="text-sm text-slate-500">{c.documentCompleteness}%</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {c.valuationVariance ? (
                        <span className="text-sm font-semibold text-red-600">FLAGGED</span>
                      ) : (
                        <span className="text-sm text-slate-400">--</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredCases.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-slate-400">
                    No cases found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
};

export default CollateralRiskPage;
