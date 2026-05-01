import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  id: string;
  event_code: string;
  actor_id: string | null;
  actor_type: string;
  resource_type: string | null;
  resource_id: string | null;
  action: string;
  payload_json: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  prev_hash: string | null;
  row_hash: string;
  ai_confidence: number | null;
  created_at: string;
}

export interface PaginatedAuditLogs {
  data: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}

export interface AuditLogFilters {
  event_code?: string;
  actor_id?: string;
  resource_type?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const auditLogKeys = {
  all: ['audit-logs'] as const,
  lists: () => [...auditLogKeys.all, 'list'] as const,
  list: (filters: AuditLogFilters) => [...auditLogKeys.lists(), filters] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** GET /compliance/audit-logs — paginated, filterable audit log search */
export function useAuditLogs(filters: AuditLogFilters = {}) {
  return useQuery({
    queryKey: auditLogKeys.list(filters),
    queryFn: () =>
      apiGet<PaginatedAuditLogs>('/compliance/audit-logs', {
        event_code: filters.event_code,
        actor_id: filters.actor_id,
        resource_type: filters.resource_type,
        from_date: filters.from_date,
        to_date: filters.to_date,
        page: filters.page,
        limit: filters.limit,
      }),
  });
}
