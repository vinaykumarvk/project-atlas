import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConsentRecord {
  id: string;
  subjectId: string;
  subjectEmail: string;
  purpose: string;
  consentGiven: boolean;
  consentDate: string;
  expiryDate: string | null;
  source: string;
  version: string;
  createdAt: string;
}

export interface PaginatedConsent {
  data: ConsentRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface ConsentFilters {
  subjectId?: string;
  purpose?: string;
  page?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const consentKeys = {
  all: ['consent'] as const,
  lists: () => [...consentKeys.all, 'list'] as const,
  list: (filters: ConsentFilters) => [...consentKeys.lists(), filters] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** GET /compliance/consent — paginated consent ledger */
export function useConsent(filters: ConsentFilters = {}) {
  return useQuery({
    queryKey: consentKeys.list(filters),
    queryFn: () =>
      apiGet<PaginatedConsent>('/compliance/consent', {
        subjectId: filters.subjectId,
        purpose: filters.purpose,
        page: filters.page,
        limit: filters.limit,
      }),
  });
}
