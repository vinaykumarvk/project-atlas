import { useState } from 'react';
import { isDemoMode } from '../config/flags';
import { useVendorScorecard, useVendorList } from '../hooks/useCollateralOps';
import type { VendorScorecard as VendorScorecardType, VendorSummary } from '../hooks/useCollateralOps';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2 } from 'lucide-react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';

// ---------------------------------------------------------------------------
// Mock data for demo mode
// ---------------------------------------------------------------------------

const MOCK_VENDORS: VendorSummary[] = [
  { vendorId: 'v-1', vendorName: 'QuickVal Services', vendorCode: 'QVS', category: 'VALUER', qualityScore: 4.2, tatCompliancePercent: 0.85, isActive: true },
  { vendorId: 'v-2', vendorName: 'PremiumVal India', vendorCode: 'PVI', category: 'VALUER', qualityScore: 4.8, tatCompliancePercent: 0.92, isActive: true },
  { vendorId: 'v-3', vendorName: 'LegalEase Partners', vendorCode: 'LEP', category: 'ADVOCATE', qualityScore: 4.5, tatCompliancePercent: 0.88, isActive: true },
  { vendorId: 'v-4', vendorName: 'SafeGuard Surveyors', vendorCode: 'SGS', category: 'SURVEYOR', qualityScore: 3.9, tatCompliancePercent: 0.78, isActive: true },
  { vendorId: 'v-5', vendorName: 'TitleCheck Pro', vendorCode: 'TCP', category: 'ADVOCATE', qualityScore: 4.1, tatCompliancePercent: 0.82, isActive: true },
];

const MOCK_SCORECARDS: Record<string, VendorScorecardType> = {
  'v-1': {
    vendorId: 'v-1', vendorName: 'QuickVal Services', vendorCode: 'QVS', category: 'VALUER',
    tatCompliancePercent: 85, qualityScore: 4.2, reworkRate: 1.6, varianceFromEstimates: 0.15,
    totalCasesHandled: 187, activeCases: 12, serviceGeographies: ['Mumbai', 'Pune'], serviceCaseTypes: ['VALUATION_REQUEST', 'SITE_VISIT'],
  },
  'v-2': {
    vendorId: 'v-2', vendorName: 'PremiumVal India', vendorCode: 'PVI', category: 'VALUER',
    tatCompliancePercent: 92, qualityScore: 4.8, reworkRate: 0.4, varianceFromEstimates: 0.08,
    totalCasesHandled: 312, activeCases: 5, serviceGeographies: ['Mumbai', 'Nashik'], serviceCaseTypes: ['VALUATION_REQUEST'],
  },
  'v-3': {
    vendorId: 'v-3', vendorName: 'LegalEase Partners', vendorCode: 'LEP', category: 'ADVOCATE',
    tatCompliancePercent: 88, qualityScore: 4.5, reworkRate: 1.0, varianceFromEstimates: 0.12,
    totalCasesHandled: 245, activeCases: 8, serviceGeographies: ['Mumbai', 'Pune', 'Nashik'], serviceCaseTypes: ['LEGAL_OPINION', 'TITLE_SEARCH'],
  },
  'v-4': {
    vendorId: 'v-4', vendorName: 'SafeGuard Surveyors', vendorCode: 'SGS', category: 'SURVEYOR',
    tatCompliancePercent: 78, qualityScore: 3.9, reworkRate: 2.2, varianceFromEstimates: 0.22,
    totalCasesHandled: 98, activeCases: 6, serviceGeographies: ['Delhi', 'Kolkata'], serviceCaseTypes: ['SITE_VISIT'],
  },
  'v-5': {
    vendorId: 'v-5', vendorName: 'TitleCheck Pro', vendorCode: 'TCP', category: 'ADVOCATE',
    tatCompliancePercent: 82, qualityScore: 4.1, reworkRate: 1.8, varianceFromEstimates: 0.18,
    totalCasesHandled: 156, activeCases: 9, serviceGeographies: ['Chennai', 'Hyderabad'], serviceCaseTypes: ['TITLE_SEARCH'],
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const VendorScorecardPage = () => {
  const demo = isDemoMode();
  const [selectedVendorId, setSelectedVendorId] = useState('');

  // Live hooks (called unconditionally per rules of hooks)
  const { data: liveVendors, isLoading: vendorsLoading } = useVendorList();
  const { data: liveScorecard, isLoading: scorecardLoading, isError, error } = useVendorScorecard(selectedVendorId);

  const vendors: VendorSummary[] = demo ? MOCK_VENDORS : (liveVendors ?? []);
  const scorecard: VendorScorecardType | null = demo
    ? (MOCK_SCORECARDS[selectedVendorId] ?? null)
    : (liveScorecard ?? null);

  const isLoading = !demo && (vendorsLoading || (selectedVendorId && scorecardLoading));

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold">Vendor Scorecard</h2>

      {/* Vendor Selection */}
      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm font-semibold">Select Vendor:</label>
        <Select value={selectedVendorId} onValueChange={setSelectedVendorId}>
          <SelectTrigger className="min-w-[300px]">
            <SelectValue placeholder="-- Choose a vendor --" />
          </SelectTrigger>
          <SelectContent>
            {vendors.map((v) => (
              <SelectItem key={v.vendorId} value={v.vendorId}>
                {v.vendorName} ({v.vendorCode}) - {v.category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center p-16 border border-dashed rounded-lg bg-card text-center">
          <div className="w-8 h-8 border-3 border-border border-t-blue-500 rounded-full animate-spin mb-4" />
          <p className="text-sm text-muted-foreground max-w-[480px] leading-relaxed">Loading scorecard...</p>
        </div>
      )}

      {/* Error */}
      {!demo && isError && selectedVendorId && (
        <div className="flex flex-col items-center justify-center p-16 border border-dashed border-red-200 rounded-lg bg-card text-center">
          <p className="text-sm text-red-600 max-w-[480px] leading-relaxed">
            {error instanceof Error ? error.message : 'Failed to load scorecard'}
          </p>
        </div>
      )}

      {/* Empty — no vendors */}
      {!isLoading && vendors.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-16 text-center">
            <Building2 className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="mb-2 text-lg font-semibold">No vendors found</h3>
            <p className="text-sm text-muted-foreground">Vendor data will appear once vendors are configured.</p>
          </CardContent>
        </Card>
      )}

      {/* No selection */}
      {!selectedVendorId && !isLoading && vendors.length > 0 && (
        <div className="flex flex-col items-center justify-center p-16 border border-dashed rounded-lg bg-card text-center">
          <p className="text-sm text-muted-foreground max-w-[480px] leading-relaxed">Select a vendor above to view their performance scorecard.</p>
        </div>
      )}

      {/* Scorecard Display */}
      {scorecard && !isLoading && (
        <div>
          {/* Header */}
          <div className="mb-6">
            <div>
              <h3 className="mb-1 text-xl font-bold">{scorecard.vendorName}</h3>
              <span className="text-sm text-slate-500">{scorecard.vendorCode} | {scorecard.category}</span>
            </div>
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-6">
            <MetricCard
              title="TAT Compliance"
              value={`${typeof scorecard.tatCompliancePercent === 'number' && scorecard.tatCompliancePercent <= 1 ? Math.round(scorecard.tatCompliancePercent * 100) : Math.round(scorecard.tatCompliancePercent)}%`}
              colorClass={scorecard.tatCompliancePercent >= 0.85 || scorecard.tatCompliancePercent >= 85 ? 'text-green-600' : scorecard.tatCompliancePercent >= 0.7 || scorecard.tatCompliancePercent >= 70 ? 'text-yellow-600' : 'text-red-600'}
            />
            <MetricCard
              title="Quality Score"
              value={`${scorecard.qualityScore.toFixed(1)} / 5.0`}
              colorClass={scorecard.qualityScore >= 4.0 ? 'text-green-600' : scorecard.qualityScore >= 3.0 ? 'text-yellow-600' : 'text-red-600'}
            />
            <MetricCard
              title="Rework Rate"
              value={`${scorecard.reworkRate.toFixed(1)}%`}
              colorClass={scorecard.reworkRate <= 1.0 ? 'text-green-600' : scorecard.reworkRate <= 2.0 ? 'text-yellow-600' : 'text-red-600'}
            />
            <MetricCard
              title="Variance from Estimates"
              value={`${(scorecard.varianceFromEstimates * 100).toFixed(0)}%`}
              colorClass={scorecard.varianceFromEstimates <= 0.1 ? 'text-green-600' : scorecard.varianceFromEstimates <= 0.2 ? 'text-yellow-600' : 'text-red-600'}
            />
          </div>

          {/* Detail Info */}
          <div className="grid grid-cols-2 gap-5 mb-6">
            <Card>
              <CardContent className="p-5">
                <h4 className="text-[0.95rem] font-semibold mb-4">Operations Summary</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[0.7rem] uppercase text-muted-foreground font-semibold">Total Cases Handled</span>
                    <span className="text-sm">{scorecard.totalCasesHandled}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[0.7rem] uppercase text-muted-foreground font-semibold">Active Cases</span>
                    <span className="text-sm">{scorecard.activeCases}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <h4 className="text-[0.95rem] font-semibold mb-4">Service Coverage</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[0.7rem] uppercase text-muted-foreground font-semibold">Geographies</span>
                    <span className="text-sm">{scorecard.serviceGeographies.join(', ') || 'None'}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[0.7rem] uppercase text-muted-foreground font-semibold">Case Types</span>
                    <span className="text-sm">{scorecard.serviceCaseTypes.map((t) => t.replace(/_/g, ' ')).join(', ') || 'None'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Vendor Summary Table */}
      {vendors.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-4 text-lg font-semibold">All Vendors Overview</h3>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs uppercase whitespace-nowrap">Vendor</TableHead>
                  <TableHead className="text-xs uppercase whitespace-nowrap">Code</TableHead>
                  <TableHead className="text-xs uppercase whitespace-nowrap">Category</TableHead>
                  <TableHead className="text-xs uppercase whitespace-nowrap">Quality Score</TableHead>
                  <TableHead className="text-xs uppercase whitespace-nowrap">TAT Compliance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.map((v) => (
                  <TableRow
                    key={v.vendorId}
                    onClick={() => setSelectedVendorId(v.vendorId)}
                    className={cn(
                      'cursor-pointer transition-colors',
                      v.vendorId === selectedVendorId && 'bg-blue-50'
                    )}
                  >
                    <TableCell className="whitespace-nowrap"><strong>{v.vendorName}</strong></TableCell>
                    <TableCell className="whitespace-nowrap">{v.vendorCode}</TableCell>
                    <TableCell className="whitespace-nowrap">{v.category}</TableCell>
                    <TableCell className="whitespace-nowrap">{v.qualityScore.toFixed(1)}</TableCell>
                    <TableCell className="whitespace-nowrap">{typeof v.tatCompliancePercent === 'number' && v.tatCompliancePercent <= 1 ? `${Math.round(v.tatCompliancePercent * 100)}%` : `${Math.round(v.tatCompliancePercent)}%`}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  );
};

function MetricCard({ title, value, colorClass }: { title: string; value: string; colorClass: string }) {
  return (
    <Card>
      <CardContent className="p-5 flex flex-col gap-2">
        <span className="text-xs uppercase text-muted-foreground font-semibold">{title}</span>
        <span className={cn('text-3xl font-bold', colorClass)}>{value}</span>
      </CardContent>
    </Card>
  );
}

export default VendorScorecardPage;
