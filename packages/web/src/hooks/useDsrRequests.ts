import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch } from '../api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DsrStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';
export type DsrType = 'ACCESS' | 'RECTIFICATION' | 'ERASURE' | 'PORTABILITY';

export interface DsrRequest {
  id: string;
  subjectName: string;
  subjectEmail: string;
  type: DsrType;
  status: DsrStatus;
  description: string;
  assignedTo: string | null;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedDsrRequests {
  data: DsrRequest[];
  total: number;
  page: number;
  limit: number;
}

export interface DsrFilters {
  status?: DsrStatus;
  type?: DsrType;
  page?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const dsrKeys = {
  all: ['dsr-requests'] as const,
  lists: () => [...dsrKeys.all, 'list'] as const,
  list: (filters: DsrFilters) => [...dsrKeys.lists(), filters] as const,
  detail: (id: string) => [...dsrKeys.all, 'detail', id] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** GET /compliance/dsr — paginated DSR requests */
export function useDsrRequests(filters: DsrFilters = {}) {
  return useQuery({
    queryKey: dsrKeys.list(filters),
    queryFn: () =>
      apiGet<PaginatedDsrRequests>('/compliance/dsr', {
        status: filters.status,
        type: filters.type,
        page: filters.page,
        limit: filters.limit,
      }),
  });
}

/** POST /compliance/dsr — create a new DSR request */
export function useCreateDsr() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      subjectName: string;
      subjectEmail: string;
      type: DsrType;
      description: string;
    }) => apiPost<DsrRequest>('/compliance/dsr', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: dsrKeys.lists() });
    },
  });
}

/** PATCH /compliance/dsr/:id/status — update DSR status */
export function useUpdateDsrStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: DsrStatus;
    }) => apiPatch<DsrRequest>(`/compliance/dsr/${id}/status`, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: dsrKeys.lists() });
    },
  });
}
