import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type CaseStatus =
  | 'NEW'
  | 'CLASSIFIED'
  | 'TRIAGED'
  | 'ROUTED'
  | 'IN_PROGRESS'
  | 'AWAITING_FPR'
  | 'PENDING_VENDOR'
  | 'PENDING_INFO'
  | 'ON_HOLD'
  | 'REVIEW'
  | 'RESOLVED'
  | 'CLOSED'
  | 'REOPENED'
  | 'CANCELLED';

const STATUS_STYLES: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  CLASSIFIED: 'bg-indigo-100 text-indigo-800 hover:bg-indigo-100',
  TRIAGED: 'bg-indigo-100 text-indigo-800 hover:bg-indigo-100',
  ROUTED: 'bg-violet-100 text-violet-800 hover:bg-violet-100',
  IN_PROGRESS: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  AWAITING_FPR: 'bg-pink-100 text-pink-800 hover:bg-pink-100',
  PENDING_VENDOR: 'bg-pink-100 text-pink-800 hover:bg-pink-100',
  PENDING_INFO: 'bg-purple-100 text-purple-800 hover:bg-purple-100',
  ON_HOLD: 'bg-slate-100 text-slate-600 hover:bg-slate-100',
  REVIEW: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
  RESOLVED: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
  CLOSED: 'bg-slate-100 text-slate-600 hover:bg-slate-100',
  REOPENED: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
  CANCELLED: 'bg-red-100 text-red-800 hover:bg-red-100',
};

const STATUS_LABELS: Record<string, string> = {
  NEW: 'New',
  CLASSIFIED: 'Classified',
  TRIAGED: 'Triaged',
  ROUTED: 'Routed',
  IN_PROGRESS: 'In Progress',
  AWAITING_FPR: 'Awaiting FPR',
  PENDING_VENDOR: 'Pending Vendor',
  PENDING_INFO: 'Pending Info',
  ON_HOLD: 'On Hold',
  REVIEW: 'Review',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
  CANCELLED: 'Cancelled',
};

interface CaseStatusBadgeProps {
  status: CaseStatus;
}

export function CaseStatusBadge({ status }: CaseStatusBadgeProps) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.NEW;
  const label = STATUS_LABELS[status] || status;

  return (
    <Badge variant="secondary" className={cn('uppercase tracking-wide font-semibold', style)}>
      {label}
    </Badge>
  );
}
