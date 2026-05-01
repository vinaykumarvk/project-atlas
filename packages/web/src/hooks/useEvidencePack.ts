import { useMutation, useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from '../api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EvidencePack {
  id: string;
  name: string;
  status: 'GENERATING' | 'READY' | 'FAILED';
  generatedBy: string;
  auditLogCount: number;
  fromDate: string;
  toDate: string;
  downloadUrl: string | null;
  createdAt: string;
}

export interface PaginatedEvidencePacks {
  data: EvidencePack[];
  total: number;
  page: number;
  limit: number;
}

export interface EvidencePackFilters {
  page?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const evidencePackKeys = {
  all: ['evidence-packs'] as const,
  lists: () => [...evidencePackKeys.all, 'list'] as const,
  list: (filters: EvidencePackFilters) =>
    [...evidencePackKeys.lists(), filters] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** GET /compliance/evidence-packs — list generated evidence packs */
export function useEvidencePacks(filters: EvidencePackFilters = {}) {
  return useQuery({
    queryKey: evidencePackKeys.list(filters),
    queryFn: () =>
      apiGet<PaginatedEvidencePacks>('/compliance/evidence-packs', {
        page: filters.page,
        limit: filters.limit,
      }),
  });
}

/** POST /compliance/evidence-packs — generate a new evidence pack */
export function useGenerateEvidencePack() {
  return useMutation({
    mutationFn: (payload: {
      name: string;
      fromDate: string;
      toDate: string;
    }) => apiPost<EvidencePack>('/compliance/evidence-packs', payload),
  });
}
