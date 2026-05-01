import type { CSSProperties } from 'react';

export type CaseStatus =
  | 'NEW'
  | 'TRIAGED'
  | 'IN_PROGRESS'
  | 'PENDING_VENDOR'
  | 'PENDING_INFO'
  | 'RESOLVED'
  | 'CLOSED'
  | 'REOPENED';

const STATUS_COLORS: Record<CaseStatus, { bg: string; text: string }> = {
  NEW: { bg: '#dbeafe', text: '#1e40af' },
  TRIAGED: { bg: '#e0e7ff', text: '#3730a3' },
  IN_PROGRESS: { bg: '#fef3c7', text: '#92400e' },
  PENDING_VENDOR: { bg: '#fce7f3', text: '#9d174d' },
  PENDING_INFO: { bg: '#f3e8ff', text: '#6b21a8' },
  RESOLVED: { bg: '#d1fae5', text: '#065f46' },
  CLOSED: { bg: '#f1f5f9', text: '#475569' },
  REOPENED: { bg: '#fef9c3', text: '#854d0e' },
};

const STATUS_LABELS: Record<CaseStatus, string> = {
  NEW: 'New',
  TRIAGED: 'Triaged',
  IN_PROGRESS: 'In Progress',
  PENDING_VENDOR: 'Pending Vendor',
  PENDING_INFO: 'Pending Info',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
};

interface CaseStatusBadgeProps {
  status: CaseStatus;
}

export function CaseStatusBadge({ status }: CaseStatusBadgeProps) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.NEW;
  const label = STATUS_LABELS[status] || status;

  const style: CSSProperties = {
    display: 'inline-block',
    padding: '0.25rem 0.625rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: 600,
    backgroundColor: colors.bg,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: '0.025em',
  };

  return <span style={style}>{label}</span>;
}
