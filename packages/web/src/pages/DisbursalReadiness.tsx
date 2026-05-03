import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isDemoMode } from '../config/flags';
import { useDisbursalReadiness } from '../hooks/useCollateralOps';
import type { DisbursalReadinessData, DisbursalReadinessGroup } from '../hooks/useCollateralOps';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, CircleDollarSign } from 'lucide-react';

// ---------------------------------------------------------------------------
// Mock data for demo mode
// ---------------------------------------------------------------------------

const MOCK_DATA: DisbursalReadinessData = {
  totalBlocked: 18,
  totalReady: 7,
  groups: [
    {
      category: 'VALUATION_PENDING',
      count: 6,
      cases: [
        { id: 'c1', caseNumber: 'ATL-2026-000101', caseType: 'VALUATION_REQUEST', status: 'AWAITING_VENDOR', riskScore: 72, propertyCity: 'Mumbai', assignedFprId: 'fpr-1' },
        { id: 'c2', caseNumber: 'ATL-2026-000105', caseType: 'SITE_VISIT', status: 'NEW', riskScore: 65, propertyCity: 'Pune', assignedFprId: 'fpr-2' },
        { id: 'c3', caseNumber: 'ATL-2026-000112', caseType: 'VALUATION_REQUEST', status: 'AWAITING_VENDOR', riskScore: 58, propertyCity: 'Delhi', assignedFprId: 'fpr-1' },
        { id: 'c4', caseNumber: 'ATL-2026-000118', caseType: 'VALUATION_REQUEST', status: 'NEW', riskScore: 48, propertyCity: 'Bangalore', assignedFprId: null },
        { id: 'c5', caseNumber: 'ATL-2026-000125', caseType: 'SITE_VISIT', status: 'AWAITING_VENDOR', riskScore: 42, propertyCity: 'Chennai', assignedFprId: 'fpr-3' },
        { id: 'c6', caseNumber: 'ATL-2026-000130', caseType: 'VALUATION_REQUEST', status: 'NEW', riskScore: 35, propertyCity: 'Hyderabad', assignedFprId: 'fpr-4' },
      ],
    },
    {
      category: 'LEGAL_PENDING',
      count: 4,
      cases: [
        { id: 'c7', caseNumber: 'ATL-2026-000102', caseType: 'LEGAL_OPINION', status: 'IN_PROGRESS', riskScore: 68, propertyCity: 'Mumbai', assignedFprId: 'fpr-1' },
        { id: 'c8', caseNumber: 'ATL-2026-000109', caseType: 'LEGAL_OPINION', status: 'AWAITING_VENDOR', riskScore: 55, propertyCity: 'Delhi', assignedFprId: 'fpr-2' },
        { id: 'c9', caseNumber: 'ATL-2026-000115', caseType: 'LEGAL_OPINION', status: 'IN_PROGRESS', riskScore: 45, propertyCity: 'Pune', assignedFprId: 'fpr-3' },
        { id: 'c10', caseNumber: 'ATL-2026-000122', caseType: 'LEGAL_OPINION', status: 'IN_PROGRESS', riskScore: 38, propertyCity: 'Bangalore', assignedFprId: 'fpr-4' },
      ],
    },
    {
      category: 'TITLE_CLEAR_PENDING',
      count: 3,
      cases: [
        { id: 'c11', caseNumber: 'ATL-2026-000103', caseType: 'TITLE_SEARCH', status: 'IN_PROGRESS', riskScore: 62, propertyCity: 'Mumbai', assignedFprId: 'fpr-1' },
        { id: 'c12', caseNumber: 'ATL-2026-000110', caseType: 'TITLE_SEARCH', status: 'AWAITING_VENDOR', riskScore: 50, propertyCity: 'Nashik', assignedFprId: 'fpr-2' },
        { id: 'c13', caseNumber: 'ATL-2026-000120', caseType: 'TITLE_SEARCH', status: 'IN_PROGRESS', riskScore: 40, propertyCity: 'Chennai', assignedFprId: 'fpr-3' },
      ],
    },
    {
      category: 'DOCUMENT_MISSING',
      count: 5,
      cases: [
        { id: 'c14', caseNumber: 'ATL-2026-000104', caseType: 'VALUATION_REQUEST', status: 'IN_PROGRESS', riskScore: 78, propertyCity: 'Delhi', assignedFprId: 'fpr-1' },
        { id: 'c15', caseNumber: 'ATL-2026-000108', caseType: 'SITE_VISIT', status: 'IN_PROGRESS', riskScore: 70, propertyCity: 'Kolkata', assignedFprId: 'fpr-2' },
        { id: 'c16', caseNumber: 'ATL-2026-000113', caseType: 'INSURANCE_RENEWAL', status: 'IN_PROGRESS', riskScore: 55, propertyCity: 'Mumbai', assignedFprId: 'fpr-3' },
        { id: 'c17', caseNumber: 'ATL-2026-000119', caseType: 'LEGAL_OPINION', status: 'IN_PROGRESS', riskScore: 45, propertyCity: 'Pune', assignedFprId: 'fpr-4' },
        { id: 'c18', caseNumber: 'ATL-2026-000126', caseType: 'VALUATION_REQUEST', status: 'NEW', riskScore: 38, propertyCity: 'Hyderabad', assignedFprId: null },
      ],
    },
    {
      category: 'NONE',
      count: 7,
      cases: [
        { id: 'c19', caseNumber: 'ATL-2026-000106', caseType: 'VALUATION_REQUEST', status: 'REVIEW', riskScore: 15, propertyCity: 'Mumbai', assignedFprId: 'fpr-1' },
        { id: 'c20', caseNumber: 'ATL-2026-000107', caseType: 'INSURANCE_RENEWAL', status: 'REVIEW', riskScore: 10, propertyCity: 'Delhi', assignedFprId: 'fpr-2' },
        { id: 'c21', caseNumber: 'ATL-2026-000111', caseType: 'DISCHARGE', status: 'REVIEW', riskScore: 8, propertyCity: 'Pune', assignedFprId: 'fpr-3' },
        { id: 'c22', caseNumber: 'ATL-2026-000114', caseType: 'SETTLEMENT', status: 'REVIEW', riskScore: 12, propertyCity: 'Chennai', assignedFprId: 'fpr-4' },
        { id: 'c23', caseNumber: 'ATL-2026-000116', caseType: 'VALUATION_REQUEST', status: 'VENDOR_COMPLETED', riskScore: 18, propertyCity: 'Bangalore', assignedFprId: 'fpr-1' },
        { id: 'c24', caseNumber: 'ATL-2026-000121', caseType: 'LEGAL_OPINION', status: 'REVIEW', riskScore: 5, propertyCity: 'Mumbai', assignedFprId: 'fpr-2' },
        { id: 'c25', caseNumber: 'ATL-2026-000123', caseType: 'TITLE_SEARCH', status: 'VENDOR_COMPLETED', riskScore: 14, propertyCity: 'Hyderabad', assignedFprId: 'fpr-3' },
      ],
    },
  ],
};

const CATEGORY_LABELS: Record<string, string> = {
  VALUATION_PENDING: 'Valuation Pending',
  LEGAL_PENDING: 'Legal Pending',
  TITLE_CLEAR_PENDING: 'Title Clear Pending',
  DOCUMENT_MISSING: 'Documents Missing',
  NONE: 'Ready for Disbursal',
};

const CATEGORY_COLORS: Record<string, string> = {
  VALUATION_PENDING: 'bg-amber-500',
  LEGAL_PENDING: 'bg-violet-500',
  TITLE_CLEAR_PENDING: 'bg-pink-500',
  DOCUMENT_MISSING: 'bg-red-600',
  NONE: 'bg-green-600',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DisbursalReadinessPage = () => {
  const demo = isDemoMode();
  const navigate = useNavigate();
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Live hook (called unconditionally)
  const { data: liveData, isLoading, isError, error } = useDisbursalReadiness();

  const data: DisbursalReadinessData = demo ? MOCK_DATA : (liveData ?? { groups: [], totalBlocked: 0, totalReady: 0 });

  // Loading
  if (!demo && isLoading) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold">Disbursal Readiness</h2>
        <div className="flex flex-col items-center justify-center p-16 border border-dashed rounded-lg bg-card text-center">
          <div className="w-8 h-8 border-3 border-border border-t-blue-500 rounded-full animate-spin mb-4" />
          <p className="text-sm text-muted-foreground max-w-[480px] leading-relaxed">Loading disbursal readiness data...</p>
        </div>
      </div>
    );
  }

  // Error
  if (!demo && isError) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold">Disbursal Readiness</h2>
        <div className="flex flex-col items-center justify-center p-16 border border-dashed border-red-200 rounded-lg bg-card text-center">
          <p className="text-sm text-red-600 max-w-[480px] leading-relaxed">
            {error instanceof Error ? error.message : 'Failed to load disbursal readiness data'}
          </p>
        </div>
      </div>
    );
  }

  const totalCases = data.totalBlocked + data.totalReady;

  // Empty state
  if (!demo && totalCases === 0 && data.groups.length === 0) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold">Disbursal Readiness</h2>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-16 text-center">
            <CircleDollarSign className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="mb-2 text-lg font-semibold">No disbursal data</h3>
            <p className="text-sm text-muted-foreground">Readiness data will appear once cases are in pipeline.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold">Disbursal Readiness Command Center</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 mb-6">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-5 flex flex-col gap-2">
            <span className="text-xs uppercase text-muted-foreground font-semibold">Total Active</span>
            <span className="text-3xl font-bold text-blue-500">{totalCases}</span>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-600">
          <CardContent className="p-5 flex flex-col gap-2">
            <span className="text-xs uppercase text-muted-foreground font-semibold">Blocked</span>
            <span className="text-3xl font-bold text-red-600">{data.totalBlocked}</span>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-600">
          <CardContent className="p-5 flex flex-col gap-2">
            <span className="text-xs uppercase text-muted-foreground font-semibold">Ready</span>
            <span className="text-3xl font-bold text-green-600">{data.totalReady}</span>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-5 flex flex-col gap-2">
            <span className="text-xs uppercase text-muted-foreground font-semibold">Readiness Rate</span>
            <span className="text-3xl font-bold text-amber-500">
              {totalCases > 0 ? `${Math.round((data.totalReady / totalCases) * 100)}%` : '0%'}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Category Groups */}
      <div className="flex flex-col gap-3">
        {data.groups.map((group: DisbursalReadinessGroup) => {
          const isExpanded = expandedCategory === group.category;
          const label = CATEGORY_LABELS[group.category] ?? group.category;
          const colorClass = CATEGORY_COLORS[group.category] ?? 'bg-slate-500';

          return (
            <Card key={group.category} className="overflow-hidden">
              <Collapsible
                open={isExpanded}
                onOpenChange={(open) => setExpandedCategory(open ? group.category : null)}
              >
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full flex justify-between items-center p-4 px-5 h-auto text-[0.9rem] hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn('w-3 h-3 rounded-full', colorClass)} />
                      <span className="font-semibold text-[0.95rem]">{label}</span>
                      <Badge className={cn('text-white', colorClass, `hover:${colorClass}`)}>
                        {group.count}
                      </Badge>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 text-slate-500" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-slate-500" />
                    )}
                  </Button>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  {group.cases.length > 0 ? (
                    <div className="border-t">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[0.7rem] uppercase">Case #</TableHead>
                            <TableHead className="text-[0.7rem] uppercase">Type</TableHead>
                            <TableHead className="text-[0.7rem] uppercase">Status</TableHead>
                            <TableHead className="text-[0.7rem] uppercase">Risk Score</TableHead>
                            <TableHead className="text-[0.7rem] uppercase">Location</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.cases.map((c) => (
                            <TableRow
                              key={c.id}
                              onClick={() => navigate(`/cases/${c.id}`)}
                              className="cursor-pointer transition-colors hover:bg-slate-100"
                            >
                              <TableCell><strong>{c.caseNumber}</strong></TableCell>
                              <TableCell>{c.caseType.replace(/_/g, ' ')}</TableCell>
                              <TableCell>{c.status.replace(/_/g, ' ')}</TableCell>
                              <TableCell>
                                <Badge
                                  className={cn(
                                    'text-white',
                                    getRiskColorClass(c.riskScore)
                                  )}
                                >
                                  {c.riskScore}
                                </Badge>
                              </TableCell>
                              <TableCell>{c.propertyCity ?? 'N/A'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="p-4 text-muted-foreground text-sm">
                      No cases in this category.
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

function getRiskColorClass(score: number): string {
  if (score <= 25) return 'bg-green-600 hover:bg-green-600';
  if (score <= 50) return 'bg-amber-500 hover:bg-amber-500';
  if (score <= 75) return 'bg-orange-600 hover:bg-orange-600';
  return 'bg-red-600 hover:bg-red-600';
}

export default DisbursalReadinessPage;
