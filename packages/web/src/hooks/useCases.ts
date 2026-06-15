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
  emailSubject?: string;
  emailFrom?: string;
  emailBody?: string;
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
    queryFn: async () => {
      const response = await apiGet<{ data: CaseRecord[]; meta: { total: number; page: number; limit: number } }>('/cases', {
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
      });
      // Transform API response to PaginatedResponse shape expected by CaseList
      return {
        data: response.data.map((r) => mapRecordToRow(r)),
        total: response.meta.total,
        page: response.meta.page,
        limit: response.meta.limit,
      } as PaginatedResponse<CaseRow>;
    },
  });
}

/** Transform raw API record to the CaseRow shape for the list view */
function mapRecordToRow(r: CaseRecord): CaseRow {
  return {
    id: r.id,
    caseNumber: r.caseNumber,
    subject: r.subject || 'No subject',
    type: r.caseType || 'UNKNOWN',
    status: (r.status || 'NEW') as CaseStatus,
    priority: mapPriority(r.priority),
    assignedFpr: r.assignedFprName || r.assignedFprId || 'Unassigned',
    tatDue: r.tatTargetAt || '',
    created: r.createdAt,
  };
}

/** GET /cases/:id — single case detail */
export function useCase(id: string) {
  return useQuery({
    queryKey: caseKeys.detail(id),
    queryFn: async () => {
      const response = await apiGet<{ data: CaseRecord }>(`/cases/${id}`);
      return mapRecordToDetail(response.data);
    },
    enabled: !!id,
  });
}

/** Raw case record shape from the API */
interface CaseRecord {
  id: string;
  caseNumber: string;
  emailIngestId?: string;
  subject: string;
  from?: string;
  emailSubject?: string;
  emailFrom?: string;
  bodyText?: string;
  bodyHtml?: string;
  status: string;
  caseType: string;
  priority: string;
  confidenceBand?: string;
  languageDetected?: string;
  assignedFprId?: string;
  assignedFprName?: string;
  assignedVendorId?: string;
  loanAccountNo?: string;
  customerName?: string;
  propertyCity?: string;
  propertyPin?: string;
  tatTargetAt?: string;
  createdAt: string;
  updatedAt?: string;
  closedAt?: string;
  activityLog?: Array<{
    id: string;
    timestamp: string;
    action: string;
    performedBy: string;
    details?: string;
    fromStatus?: string;
    toStatus?: string;
  }>;
  linkedCaseIds?: string[];
}

/** Transform raw API record to the CaseDetail shape the UI expects */
function mapRecordToDetail(r: CaseRecord): CaseDetail {
  return {
    id: r.id,
    caseNumber: r.caseNumber,
    subject: r.subject || 'No subject',
    emailSubject: r.emailSubject,
    emailFrom: r.emailFrom || r.from,
    emailBody: r.bodyText,
    status: (r.status || 'NEW') as CaseDetail['status'],
    priority: mapPriority(r.priority),
    type: r.caseType || 'UNKNOWN',
    assignedFpr: r.assignedFprName || r.assignedFprId || 'Unassigned',
    createdAt: r.createdAt,
    tatDue: r.tatTargetAt || '',
    slaRemainingPercent: computeSlaPercent(r.tatTargetAt),
    classification: {
      category: r.caseType || 'UNKNOWN',
      subCategory: '',
      confidence: confidenceBandToScore(r.confidenceBand),
      confidenceBand: r.confidenceBand || 'GREEN',
    },
    entities: buildEntities(r),
    customer: {
      name: r.customerName || 'Unknown',
      accountNumber: r.loanAccountNo || 'N/A',
      segment: 'Retail',
    },
    property: {
      address: r.propertyCity ? `${r.propertyCity}${r.propertyPin ? ' - ' + r.propertyPin : ''}` : 'N/A',
      type: 'Residential',
      state: r.propertyCity || 'N/A',
      valuationAmount: 'Pending',
    },
    notes: [],
  };
}

function mapPriority(p?: string): Priority {
  const map: Record<string, Priority> = { LOW: 'P4', NORMAL: 'P3', HIGH: 'P2', CRITICAL: 'P1' };
  return map[p || 'NORMAL'] || 'P3';
}

function confidenceBandToScore(band?: string): number {
  switch (band) {
    case 'GREEN': return 0.92;
    case 'AMBER': return 0.75;
    case 'RED': return 0.55;
    case 'RED_MANUAL': return 0.3;
    default: return 0.8;
  }
}

function computeSlaPercent(tatTargetAt?: string): number {
  if (!tatTargetAt) return 100;
  const target = new Date(tatTargetAt).getTime();
  const now = Date.now();
  if (now >= target) return 0;
  // Assume 7 days total window
  const totalWindow = 7 * 24 * 60 * 60 * 1000;
  const remaining = target - now;
  return Math.min(100, Math.round((remaining / totalWindow) * 100));
}

function buildEntities(r: CaseRecord): Array<{ type: string; value: string }> {
  const entities: Array<{ type: string; value: string }> = [];
  if (r.loanAccountNo) entities.push({ type: 'Loan Account', value: r.loanAccountNo });
  if (r.customerName) entities.push({ type: 'Customer', value: r.customerName });
  if (r.propertyCity) entities.push({ type: 'City', value: r.propertyCity });
  if (r.propertyPin) entities.push({ type: 'PIN', value: r.propertyPin });
  return entities;
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
