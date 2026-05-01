import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch } from '../api/client';
import type { CaseStatus } from '../components/CaseStatusBadge';
import type { Priority } from '../components/PriorityIndicator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CaseRow {
  id: string;
  caseNumber: string;
  subject: string;
  type: string;
  status: CaseStatus;
  priority: Priority;
  assignedFpr: string;
  tatDue: string;
  created: string;
}

export interface CaseDetail {
  id: string;
  caseNumber: string;
  subject: string;
  status: CaseStatus;
  priority: Priority;
  type: string;
  assignedFpr: string;
  createdAt: string;
  tatDue: string;
  slaRemainingPercent: number;
  classification: {
    category: string;
    subCategory: string;
    confidence: number;
    confidenceBand: string;
    modelVersion?: string;
    llmMode?: string;
  };
  entities: Array<{ type: string; value: string }>;
  customer: {
    name: string;
    accountNumber: string;
    segment: string;
  };
  property: {
    address: string;
    type: string;
    state: string;
    valuationAmount: string;
  };
  notes?: Array<{
    id: string;
    text: string;
    createdBy: string;
    createdAt: string;
  }>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface CaseFilters {
  search?: string;
  status?: string;
  type?: string;
  priority?: string;
  assignedFpr?: string;
  location?: string;
  vendor?: string;
  tatState?: string;
  senderDomain?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: string;
}

export interface BulkActionPayload {
  assigneeId?: string;
  reason?: string;
  priority?: string;
  note?: string;
  resolution_code?: string;
  resolution_summary?: string;
}

export interface BulkActionRequest {
  action: 'REASSIGN' | 'CHANGE_PRIORITY' | 'ADD_NOTE' | 'CLOSE';
  case_ids: string[];
  payload: BulkActionPayload;
}

export interface BulkActionResult {
  data: Array<{ caseId: string; success: boolean; error?: string }>;
  meta: { total: number; succeeded: number; failed: number };
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const caseKeys = {
  all: ['cases'] as const,
  lists: () => [...caseKeys.all, 'list'] as const,
  list: (filters: CaseFilters) => [...caseKeys.lists(), filters] as const,
  details: () => [...caseKeys.all, 'detail'] as const,
  detail: (id: string) => [...caseKeys.details(), id] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** GET /cases — paginated list with optional filters */
export function useCases(filters: CaseFilters = {}) {
  return useQuery({
    queryKey: caseKeys.list(filters),
    queryFn: () =>
      apiGet<PaginatedResponse<CaseRow>>('/cases', {
        search: filters.search,
        status: filters.status,
        type: filters.type,
        priority: filters.priority,
        assignedFpr: filters.assignedFpr,
        location: filters.location,
        vendor: filters.vendor,
        tatState: filters.tatState,
        senderDomain: filters.senderDomain,
        page: filters.page,
        limit: filters.limit,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
      }),
  });
}

/** GET /cases/:id — single case detail */
export function useCase(id: string) {
  return useQuery({
    queryKey: caseKeys.detail(id),
    queryFn: () => apiGet<CaseDetail>(`/cases/${id}`),
    enabled: !!id,
  });
}

/** POST /cases — create a new case */
export function useCreateCase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { subject: string; type: string; priority: Priority }) =>
      apiPost<CaseDetail>('/cases', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: caseKeys.lists() });
    },
  });
}

/** PATCH /cases/:id/status — transition case status */
export function useTransitionStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      caseId,
      status,
      reason,
    }: {
      caseId: string;
      status: CaseStatus;
      reason?: string;
    }) => apiPatch<CaseDetail>(`/cases/${caseId}/status`, { status, reason }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: caseKeys.detail(variables.caseId),
      });
      void queryClient.invalidateQueries({ queryKey: caseKeys.lists() });
    },
  });
}

/** POST /cases/:id/notes — add a note to a case */
export function useAddNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ caseId, text }: { caseId: string; text: string }) =>
      apiPost<{ id: string; text: string; createdAt: string }>(
        `/cases/${caseId}/notes`,
        { text },
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: caseKeys.detail(variables.caseId),
      });
    },
  });
}

/** POST /cases/bulk — perform bulk operations on multiple cases */
export function useBulkAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: BulkActionRequest) =>
      apiPost<BulkActionResult>('/cases/bulk', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: caseKeys.lists() });
    },
  });
}

/** POST /sla/:caseId/pause — pause SLA clock */
export function usePauseSla() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ caseId, reason }: { caseId: string; reason: string }) =>
      apiPost<{ message: string }>(`/sla/${caseId}/pause`, { reason }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: caseKeys.detail(variables.caseId),
      });
      void queryClient.invalidateQueries({ queryKey: caseKeys.lists() });
    },
  });
}

/** POST /sla/:caseId/resume — resume SLA clock */
export function useResumeSla() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ caseId }: { caseId: string }) =>
      apiPost<{ message: string }>(`/sla/${caseId}/resume`, {}),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: caseKeys.detail(variables.caseId),
      });
      void queryClient.invalidateQueries({ queryKey: caseKeys.lists() });
    },
  });
}

/** PATCH /cases/:id — update case fields (reassign, set priority, etc.) */
export function useUpdateCase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ caseId, ...data }: { caseId: string; assigned_fpr_id?: string; priority?: string }) =>
      apiPatch<CaseDetail>(`/cases/${caseId}`, data),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: caseKeys.detail(variables.caseId),
      });
      void queryClient.invalidateQueries({ queryKey: caseKeys.lists() });
    },
  });
}
