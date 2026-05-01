import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../api/client';
import type { Priority } from '../components/PriorityIndicator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TriageCaseDto {
  id: string;
  caseNumber: string;
  subject: string;
  suggestedCategory: string;
  suggestedSubCategory: string;
  confidence: number;
  confidenceBand: 'GREEN' | 'AMBER' | 'RED';
  priority: Priority;
  receivedAt: string;
  emailSnippet: string;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const triageKeys = {
  all: ['triage'] as const,
  queue: () => [...triageKeys.all, 'queue'] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** GET /triage — list of cases awaiting manual triage */
export function useTriageQueue() {
  return useQuery({
    queryKey: triageKeys.queue(),
    queryFn: () => apiGet<TriageCaseDto[]>('/triage'),
  });
}

/** POST /triage/:caseId/confirm — confirm AI classification */
export function useConfirmTriage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (caseId: string) =>
      apiPost<{ success: boolean }>(`/triage/${caseId}/confirm`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: triageKeys.queue() });
    },
  });
}

/** POST /triage/:caseId/correct — override/correct AI classification */
export function useCorrectTriage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      caseId,
      category,
      subCategory,
    }: {
      caseId: string;
      category: string;
      subCategory: string;
    }) =>
      apiPost<{ success: boolean }>(`/triage/${caseId}/correct`, {
        category,
        subCategory,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: triageKeys.queue() });
    },
  });
}
