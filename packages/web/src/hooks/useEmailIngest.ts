import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmailIngest {
  id: string;
  from: string;
  subject: string;
  receivedAt: string;
  status: string;
  caseId?: string;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const emailIngestKeys = {
  all: ['email-ingest'] as const,
  list: () => [...emailIngestKeys.all, 'list'] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** GET /email-ingest — list ingested emails */
export function useEmailIngests() {
  return useQuery({
    queryKey: emailIngestKeys.list(),
    queryFn: () => apiGet<EmailIngest[]>('/email-ingest'),
  });
}

/** POST /email-ingest/fixtures — ingest fixture/test emails */
export function useIngestFixture() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiPost<{ count: number }>('/email-ingest/fixtures'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: emailIngestKeys.list() });
    },
  });
}
