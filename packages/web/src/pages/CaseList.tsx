import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CaseStatusBadge, type CaseStatus } from '../components/CaseStatusBadge';
import { PriorityIndicator, type Priority } from '../components/PriorityIndicator';
import { ConfidenceBadge, type ConfidenceBand } from '../components/ConfidenceBadge';
import { KeyboardShortcutsModal } from '../components/KeyboardShortcutsModal';
import { isDemoMode } from '../config/flags';
import { useCases, useBulkAction } from '../hooks/useCases';
import { useHotkeys } from '../hooks/useHotkeys';
import { useDebounce } from '../hooks/useDebounce';
import { useAuth } from '../auth';
import { LlmModeBanner } from '../components/LlmModeBanner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Save,
  RefreshCw,
  AlertCircle,
  Inbox,
} from 'lucide-react';

/** Saved filter view stored in localStorage */
interface SavedView {
  name: string;
  filters: {
    search?: string;
    status?: string;
    type?: string;
    priority?: string;
    fpr?: string;
    location?: string;
    vendor?: string;
    tatState?: string;
    senderDomain?: string;
  };
}

const SAVED_VIEWS_KEY = 'atlas_saved_views';

interface CaseRow {
  id: string;
  caseNumber: string;
  subject: string;
  type: string;
  status: CaseStatus;
  priority: Priority;
  confidenceBand?: ConfidenceBand;
  assignedFpr: string;
  tatDue: string;
  created: string;
}

type SortField = 'caseNumber' | 'subject' | 'type' | 'status' | 'priority' | 'assignedFpr' | 'tatDue' | 'created';
type SortOrder = 'asc' | 'desc';
type SortMode = 'fifo' | 'criticality';

const TAT_STATE_OPTIONS = ['on_track', 'at_risk', 'breached'];

/** Priority sort order for criticality sorting (lower index = higher priority). */
const PRIORITY_RANK: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };

/**
 * Determine whether a case row is overdue (TAT breached).
 */
function isOverdue(c: CaseRow): boolean {
  const now = Date.now();
  const dueDate = new Date(c.tatDue).getTime();
  return dueDate < now;
}

const MOCK_CASES: CaseRow[] = [
  { id: '1', caseNumber: 'CASE-1042', subject: 'Valuation Request - 123 Main St', type: 'Valuation', status: 'NEW', priority: 'P2', confidenceBand: 'GREEN', assignedFpr: 'John Smith', tatDue: '2026-04-28', created: '2026-04-27' },
  { id: '2', caseNumber: 'CASE-1041', subject: 'Title Search - Unit 45 Tower', type: 'Title Search', status: 'IN_PROGRESS', priority: 'P1', confidenceBand: 'GREEN', assignedFpr: 'Jane Doe', tatDue: '2026-04-27', created: '2026-04-26' },
  { id: '3', caseNumber: 'CASE-1040', subject: 'Insurance Renewal - 789 Oak Ave', type: 'Insurance', status: 'PENDING_VENDOR', priority: 'P3', confidenceBand: 'AMBER', assignedFpr: 'Mike Wilson', tatDue: '2026-04-30', created: '2026-04-26' },
  { id: '4', caseNumber: 'CASE-1039', subject: 'Property Inspection - 456 Elm Rd', type: 'Inspection', status: 'RESOLVED', priority: 'P2', confidenceBand: 'GREEN', assignedFpr: 'Sarah Chen', tatDue: '2026-04-25', created: '2026-04-24' },
  { id: '5', caseNumber: 'CASE-1038', subject: 'Discharge Request - Lot 12', type: 'Discharge', status: 'TRIAGED', priority: 'P4', confidenceBand: 'RED', assignedFpr: 'Tom Brown', tatDue: '2026-05-01', created: '2026-04-25' },
  { id: '6', caseNumber: 'CASE-1037', subject: 'Valuation Review - 22 Park Lane', type: 'Valuation', status: 'IN_PROGRESS', priority: 'P2', confidenceBand: 'AMBER', assignedFpr: 'John Smith', tatDue: '2026-04-29', created: '2026-04-25' },
  { id: '7', caseNumber: 'CASE-1036', subject: 'Title Insurance Claim', type: 'Insurance', status: 'PENDING_INFO', priority: 'P1', confidenceBand: 'RED_MANUAL', assignedFpr: 'Jane Doe', tatDue: '2026-04-27', created: '2026-04-24' },
  { id: '8', caseNumber: 'CASE-1035', subject: 'Settlement Coordination', type: 'Settlement', status: 'IN_PROGRESS', priority: 'P3', confidenceBand: 'GREEN', assignedFpr: 'Mike Wilson', tatDue: '2026-04-30', created: '2026-04-23' },
  { id: '9', caseNumber: 'CASE-1034', subject: 'Vendor Report Follow-up', type: 'Inspection', status: 'CLOSED', priority: 'P4', confidenceBand: 'GREEN', assignedFpr: 'Sarah Chen', tatDue: '2026-04-22', created: '2026-04-20' },
  { id: '10', caseNumber: 'CASE-1033', subject: 'New Loan Collateral Setup', type: 'Valuation', status: 'NEW', priority: 'P2', confidenceBand: 'AMBER', assignedFpr: 'Tom Brown', tatDue: '2026-04-29', created: '2026-04-26' },
  { id: '11', caseNumber: 'CASE-1032', subject: 'Annual Review - Portfolio A', type: 'Valuation', status: 'TRIAGED', priority: 'P3', confidenceBand: 'GREEN', assignedFpr: 'John Smith', tatDue: '2026-05-02', created: '2026-04-25' },
  { id: '12', caseNumber: 'CASE-1031', subject: 'Urgent Title Defect', type: 'Title Search', status: 'IN_PROGRESS', priority: 'P1', confidenceBand: 'RED', assignedFpr: 'Jane Doe', tatDue: '2026-04-27', created: '2026-04-24' },
];

const STATUS_OPTIONS: CaseStatus[] = ['NEW', 'TRIAGED', 'IN_PROGRESS', 'PENDING_VENDOR', 'PENDING_INFO', 'RESOLVED', 'CLOSED', 'REOPENED'];
const PRIORITY_OPTIONS: Priority[] = ['P1', 'P2', 'P3', 'P4'];
const TYPE_OPTIONS = ['Valuation', 'Title Search', 'Insurance', 'Inspection', 'Discharge', 'Settlement'];
const FPR_OPTIONS = ['John Smith', 'Jane Doe', 'Mike Wilson', 'Sarah Chen', 'Tom Brown'];

const PAGE_SIZE_OPTIONS = [5, 10, 20];

/**
 * Compute the TAT SLA remaining percentage and return a color.
 * Green: > 50% remaining, Amber: 20-50% remaining, Red: < 20% remaining.
 */
function getTatColor(tatDue: string, created: string): string {
  const now = Date.now();
  const dueDate = new Date(tatDue).getTime();
  const createdDate = new Date(created).getTime();

  // If total window is zero or negative, treat as breached
  const totalWindow = dueDate - createdDate;
  if (totalWindow <= 0) return '#dc2626'; // red

  const remaining = dueDate - now;
  const remainingPercent = (remaining / totalWindow) * 100;

  if (remainingPercent > 50) return '#16a34a'; // green
  if (remainingPercent > 20) return '#d97706'; // amber
  return '#dc2626'; // red
}

const tatColorBorderClass: Record<string, string> = {
  '#16a34a': 'border-l-[3px] border-l-green-600',
  '#d97706': 'border-l-[3px] border-l-amber-500',
  '#dc2626': 'border-l-[3px] border-l-red-600',
};

/** A single sort field entry for multi-sort support (FR-050.A4). */
interface SortFieldEntry {
  field: SortField;
  order: SortOrder;
}

/**
 * Sort comparator for CaseRow fields.
 * Overdue cases (TAT breached) are always pinned to the top.
 */
function compareCases(a: CaseRow, b: CaseRow, field: SortField, order: SortOrder): number {
  // Pin overdue cases to the top regardless of sort field
  const aOverdue = isOverdue(a);
  const bOverdue = isOverdue(b);
  if (aOverdue && !bOverdue) return -1;
  if (!aOverdue && bOverdue) return 1;

  const valA = a[field] ?? '';
  const valB = b[field] ?? '';
  const cmp = String(valA).localeCompare(String(valB));
  return order === 'asc' ? cmp : -cmp;
}

/**
 * Multi-sort comparator for CaseRow fields (FR-050.A4).
 * Applies sort fields in priority order, falling through to the next
 * field when the current comparison is equal.
 * Overdue cases are always pinned to the top.
 */
function compareCasesMulti(a: CaseRow, b: CaseRow, sortFields: SortFieldEntry[]): number {
  // Pin overdue cases to the top
  const aOverdue = isOverdue(a);
  const bOverdue = isOverdue(b);
  if (aOverdue && !bOverdue) return -1;
  if (!aOverdue && bOverdue) return 1;

  for (const { field, order } of sortFields) {
    const valA = a[field] ?? '';
    const valB = b[field] ?? '';
    const cmp = String(valA).localeCompare(String(valB));
    if (cmp !== 0) return order === 'asc' ? cmp : -cmp;
  }
  return 0;
}

/**
 * Sort comparator for criticality mode.
 * Priority (P1 > P2 > P3 > P4) then by TAT remaining ascending.
 * Overdue cases are still pinned to the top.
 */
function compareCasesCriticality(a: CaseRow, b: CaseRow): number {
  // Pin overdue cases to the top
  const aOverdue = isOverdue(a);
  const bOverdue = isOverdue(b);
  if (aOverdue && !bOverdue) return -1;
  if (!aOverdue && bOverdue) return 1;

  // Sort by priority rank ascending (P1=0 < P2=1 < P3=2 < P4=3)
  const rankA = PRIORITY_RANK[a.priority] ?? 99;
  const rankB = PRIORITY_RANK[b.priority] ?? 99;
  if (rankA !== rankB) return rankA - rankB;

  // Then by TAT remaining ascending (earliest due first)
  const tatA = new Date(a.tatDue).getTime();
  const tatB = new Date(b.tatDue).getTime();
  return tatA - tatB;
}

/** Helper: convert empty string to sentinel "__all__" for Radix Select, and vice versa */
const toSelectValue = (v: string) => v || '__all__';
const fromSelectValue = (v: string) => (v === '__all__' ? '' : v);

const CaseListPage = () => {
  const navigate = useNavigate();
  const demo = isDemoMode();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize filters from URL search params
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || '');
  const [typeFilter, setTypeFilter] = useState<string>(searchParams.get('type') || '');
  const [priorityFilter, setPriorityFilter] = useState<string>(searchParams.get('priority') || '');
  const [fprFilter, setFprFilter] = useState<string>(searchParams.get('fpr') || '');
  const [locationFilter, setLocationFilter] = useState<string>(searchParams.get('location') || '');
  const [vendorFilter, setVendorFilter] = useState<string>(searchParams.get('vendor') || '');
  const [tatStateFilter, setTatStateFilter] = useState<string>(searchParams.get('tatState') || '');
  const [senderDomainFilter, setSenderDomainFilter] = useState<string>(searchParams.get('senderDomain') || '');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Debounce search input (300ms) for API search
  const debouncedSearch = useDebounce(search, 300);

  // Serialize filters to URL params whenever they change
  useEffect(() => {
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;
    if (typeFilter) params.type = typeFilter;
    if (priorityFilter) params.priority = priorityFilter;
    if (fprFilter) params.fpr = fprFilter;
    if (locationFilter) params.location = locationFilter;
    if (vendorFilter) params.vendor = vendorFilter;
    if (tatStateFilter) params.tatState = tatStateFilter;
    if (senderDomainFilter) params.senderDomain = senderDomainFilter;
    setSearchParams(params, { replace: true });
  }, [search, statusFilter, typeFilter, priorityFilter, fprFilter, locationFilter, vendorFilter, tatStateFilter, senderDomainFilter, setSearchParams]);

  // Saved views state
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => {
    try {
      const stored = localStorage.getItem(SAVED_VIEWS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // FR-050.A3 + FR-162: Server-side saved views with localStorage fallback
  const [serverViews, setServerViews] = useState<Array<{ id: string; name: string; filters: Record<string, string> }>>([]);
  useEffect(() => {
    fetch('/api/cases/saved-views')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(views => setServerViews(views))
      .catch(() => {
        // Fallback to localStorage
        try {
          const local = localStorage.getItem(SAVED_VIEWS_KEY);
          if (local) setServerViews(JSON.parse(local));
        } catch {}
      });
  }, []);

  // FR-057.A4: Browser notifications for CRITICAL cases
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const notifyCriticalCase = useCallback((caseItem: { id: string; subject?: string; type: string; priority: string }) => {
    if ('Notification' in window && Notification.permission === 'granted' && caseItem.priority === 'CRITICAL') {
      new Notification('Critical Case Alert', {
        body: `Case ${caseItem.id}: ${caseItem.subject || caseItem.type}`,
        icon: '/favicon.ico',
      });
    }
  }, []);

  const handleSaveView = () => {
    const name = window.prompt('Enter a name for this view:');
    if (!name) return;
    const newView: SavedView = {
      name,
      filters: {
        search: search || undefined,
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        priority: priorityFilter || undefined,
        fpr: fprFilter || undefined,
        location: locationFilter || undefined,
        vendor: vendorFilter || undefined,
        tatState: tatStateFilter || undefined,
        senderDomain: senderDomainFilter || undefined,
      },
    };
    const updated = [...savedViews, newView];
    setSavedViews(updated);
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(updated));
  };

  const handleLoadView = (viewName: string) => {
    const view = savedViews.find((v) => v.name === viewName);
    if (!view) return;
    setSearch(view.filters.search || '');
    setStatusFilter(view.filters.status || '');
    setTypeFilter(view.filters.type || '');
    setPriorityFilter(view.filters.priority || '');
    setFprFilter(view.filters.fpr || '');
    setLocationFilter(view.filters.location || '');
    setVendorFilter(view.filters.vendor || '');
    setTatStateFilter(view.filters.tatState || '');
    setSenderDomainFilter(view.filters.senderDomain || '');
    setPage(1);
  };

  // Sort state — FR-050.A4: multi-sort support
  const [sortFields, setSortFields] = useState<SortFieldEntry[]>([
    { field: 'created', order: 'desc' },
  ]);
  const [sortMode, setSortMode] = useState<SortMode>('fifo');

  // Convenience accessors for the primary sort (used by API query)
  const sortBy = sortFields.length > 0 ? sortFields[0].field : 'created';
  const sortOrder = sortFields.length > 0 ? sortFields[0].order : ('desc' as SortOrder);

  // Bulk select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk action mutation
  const bulkActionMutation = useBulkAction();

  // Keyboard navigation state
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Live data hook — only active when NOT in demo mode
  const {
    data: liveData,
    isLoading,
    isFetching,
    isError,
    error,
  } = useCases(
    demo
      ? {} // won't be used -- hook still called but we ignore results in demo
      : {
          search: debouncedSearch || undefined,
          status: statusFilter || undefined,
          type: typeFilter || undefined,
          priority: priorityFilter || undefined,
          assignedFpr: fprFilter || undefined,
          location: locationFilter || undefined,
          vendor: vendorFilter || undefined,
          tatState: tatStateFilter || undefined,
          senderDomain: senderDomainFilter || undefined,
          page,
          limit: pageSize,
          sortBy: sortFields.map((s) => s.field === 'created' ? 'created_at' : s.field).join(','),
          sortOrder: sortFields.map((s) => s.order).join(','),
        },
  );

  // Toggle sort when a column header is clicked (FR-050.A4)
  // Plain click: set as sole sort field (toggle order if already primary).
  // Shift+click: add/toggle as secondary sort field.
  const handleSort = useCallback((field: SortField, shiftKey: boolean) => {
    setSortFields((prev) => {
      const existingIdx = prev.findIndex((s) => s.field === field);

      if (shiftKey) {
        // Shift+click: add or toggle secondary sort
        if (existingIdx >= 0) {
          // Toggle order of existing field
          const updated = [...prev];
          updated[existingIdx] = {
            ...updated[existingIdx],
            order: updated[existingIdx].order === 'asc' ? 'desc' : 'asc',
          };
          return updated;
        }
        // Add as new secondary sort field
        return [...prev, { field, order: 'asc' }];
      }

      // Plain click: set as sole sort field
      if (existingIdx === 0 && prev.length === 1) {
        // Already the only sort field: toggle order
        return [{ field, order: prev[0].order === 'asc' ? 'desc' : 'asc' }];
      }
      return [{ field, order: 'asc' }];
    });
  }, []);

  // Render sort indicator with position number for multi-sort (FR-050.A4)
  const sortIndicator = (field: SortField) => {
    const idx = sortFields.findIndex((s) => s.field === field);
    if (idx < 0) return '';
    const arrow = sortFields[idx].order === 'asc' ? ' \u2191' : ' \u2193';
    // Show position number only when multiple sort fields are active
    const position = sortFields.length > 1 ? `${idx + 1}` : '';
    return `${arrow}${position}`;
  };

  // Demo mode filtering and sorting
  const filteredCases = useMemo(() => {
    if (!demo) return [];
    let result = MOCK_CASES.filter((c) => {
      if (search && !c.subject.toLowerCase().includes(search.toLowerCase()) && !c.caseNumber.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (statusFilter && c.status !== statusFilter) return false;
      if (typeFilter && c.type !== typeFilter) return false;
      if (priorityFilter && c.priority !== priorityFilter) return false;
      if (fprFilter && c.assignedFpr !== fprFilter) return false;
      // New filters — in demo mode these operate on available fields
      if (locationFilter && !c.subject.toLowerCase().includes(locationFilter.toLowerCase())) return false;
      if (vendorFilter && !c.assignedFpr.toLowerCase().includes(vendorFilter.toLowerCase())) return false;
      if (tatStateFilter) {
        const tatColor = getTatColor(c.tatDue, c.created);
        const state = tatColor === '#16a34a' ? 'on_track' : tatColor === '#d97706' ? 'at_risk' : 'breached';
        if (state !== tatStateFilter) return false;
      }
      if (senderDomainFilter && !c.subject.toLowerCase().includes(senderDomainFilter.toLowerCase())) return false;
      return true;
    });
    // Apply sort based on sort mode
    if (sortMode === 'criticality') {
      result = [...result].sort((a, b) => compareCasesCriticality(a, b));
    } else if (sortFields.length > 1) {
      // FR-050.A4: Multi-sort
      result = [...result].sort((a, b) => compareCasesMulti(a, b, sortFields));
    } else {
      result = [...result].sort((a, b) => compareCases(a, b, sortBy, sortOrder));
    }
    return result;
  }, [demo, search, statusFilter, typeFilter, priorityFilter, fprFilter, locationFilter, vendorFilter, tatStateFilter, senderDomainFilter, sortFields, sortBy, sortOrder, sortMode]);

  // Determine data source
  const displayCases: CaseRow[] = demo
    ? filteredCases.slice((page - 1) * pageSize, page * pageSize)
    : (liveData?.data ?? []);
  const totalCount = demo ? filteredCases.length : (liveData?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // FR-057.A4: Notify on newly loaded CRITICAL cases
  useEffect(() => {
    displayCases.forEach((c) => {
      if (c.priority === 'P1') notifyCriticalCase(c);
    });
  }, [displayCases, notifyCriticalCase]);

  const handleRowClick = (caseId: string) => {
    navigate(`/cases/${caseId}`);
  };

  // Keyboard shortcuts (FR-057.A1) — j/k nav, Enter to open, / to focus search, ? for help
  const hotkeyMap = useMemo(
    () => ({
      j: () =>
        setFocusedIndex((prev) => Math.min(prev + 1, displayCases.length - 1)),
      k: () => setFocusedIndex((prev) => Math.max(prev - 1, 0)),
      Enter: () => {
        const target = displayCases[focusedIndex];
        if (target) navigate(`/cases/${target.id}`);
      },
      '/': () => {
        searchInputRef.current?.focus();
      },
      '?': () => setShowShortcutsModal((v) => !v),
      Escape: () => setShowShortcutsModal(false),
    }),
    [displayCases, focusedIndex, navigate],
  );
  useHotkeys(hotkeyMap);

  // Bulk select handlers
  const allOnPageSelected = displayCases.length > 0 && displayCases.every((c) => selectedIds.has(c.id));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        displayCases.forEach((c) => next.delete(c.id));
      } else {
        displayCases.forEach((c) => next.add(c.id));
      }
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBulkReassign = () => {
    const assigneeId = window.prompt('Enter the FPR ID to reassign to:');
    if (!assigneeId) return;
    bulkActionMutation.mutate({
      action: 'REASSIGN',
      case_ids: Array.from(selectedIds),
      payload: { assigneeId },
    });
    setSelectedIds(new Set());
  };

  const handleBulkChangePriority = () => {
    const priority = window.prompt('Enter the new priority (e.g. P1, P2, P3, P4):');
    if (!priority) return;
    bulkActionMutation.mutate({
      action: 'CHANGE_PRIORITY',
      case_ids: Array.from(selectedIds),
      payload: { priority },
    });
    setSelectedIds(new Set());
  };

  const handleBulkClose = () => {
    const resolution_code = window.prompt('Enter resolution code:');
    if (!resolution_code) return;
    const resolution_summary = window.prompt('Enter resolution summary:');
    if (!resolution_summary) return;
    bulkActionMutation.mutate({
      action: 'CLOSE',
      case_ids: Array.from(selectedIds),
      payload: { resolution_code, resolution_summary },
    });
    setSelectedIds(new Set());
  };

  // Loading state (live mode only)
  if (!demo && isLoading) {
    return (
      <div>
        <h2 className="mb-4 text-2xl font-bold">Cases</h2>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading cases...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state (live mode only)
  if (!demo && isError) {
    return (
      <div>
        <h2 className="mb-4 text-2xl font-bold">Cases</h2>
        <Card className="border-destructive border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <AlertCircle className="mb-3 h-8 w-8 text-destructive" />
            <h3 className="mb-2 text-lg font-semibold text-destructive">
              Failed to load cases
            </h3>
            <p className="mb-4 max-w-md text-sm text-muted-foreground">
              {error instanceof Error ? error.message : 'An unexpected error occurred.'}
            </p>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Empty state (live mode only, no results and no filters applied)
  if (!demo && displayCases.length === 0 && !search && !statusFilter && !typeFilter && !priorityFilter && !fprFilter) {
    return (
      <div>
        <h2 className="mb-4 text-2xl font-bold">Cases</h2>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Inbox className="mb-3 h-8 w-8 text-muted-foreground/50" />
            <h3 className="mb-2 text-lg font-semibold text-slate-600">No cases yet</h3>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              Cases will appear here once emails are ingested and classified by
              the system.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Merge all saved view names for the load-view select
  const allViewNames = [
    ...savedViews.map((v) => ({ name: v.name, label: v.name })),
    ...serverViews
      .filter((sv) => !savedViews.some((lv) => lv.name === sv.name))
      .map((sv) => ({ name: sv.name, label: `${sv.name} (server)` })),
  ];

  return (
    <div>
      {/* FR-128.A5: LLM mode degradation banner */}
      <LlmModeBanner />

      <h2 className="mb-4 text-2xl font-bold">Cases</h2>

      {/* FR-050.A2: Role-based case filtering indicator */}
      {user && user.roles && user.roles.length > 0 && (
        <Badge
          data-testid="role-filter-chip"
          variant="secondary"
          className="mb-3 bg-blue-50 text-blue-800 border-blue-200"
        >
          Showing cases for: {user.roles.join(', ')}
        </Badge>
      )}

      {/* Debounced search indicator */}
      {!demo && isFetching && debouncedSearch && (
        <div data-testid="search-loading" aria-live="polite" className="mb-2 flex items-center gap-1.5 text-sm text-blue-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Searching...
        </div>
      )}

      {/* Search and Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3" role="search" aria-label="Case filters">
        <div className="relative w-[220px]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            type="search"
            placeholder="Search cases..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-8"
            data-testid="case-search-input"
            aria-label="Search cases"
          />
        </div>

        <Select value={toSelectValue(statusFilter)} onValueChange={(v) => { setStatusFilter(fromSelectValue(v)); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={toSelectValue(typeFilter)} onValueChange={(v) => { setTypeFilter(fromSelectValue(v)); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Types</SelectItem>
            {TYPE_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={toSelectValue(priorityFilter)} onValueChange={(v) => { setPriorityFilter(fromSelectValue(v)); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Priorities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Priorities</SelectItem>
            {PRIORITY_OPTIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={toSelectValue(fprFilter)} onValueChange={(v) => { setFprFilter(fromSelectValue(v)); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All FPRs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All FPRs</SelectItem>
            {FPR_OPTIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent>
        </Select>

        <Input
          type="text"
          placeholder="Location (city)..."
          value={locationFilter}
          onChange={(e) => { setLocationFilter(e.target.value); setPage(1); }}
          className="w-[220px]"
          data-testid="filter-location"
        />
        <Input
          type="text"
          placeholder="Vendor..."
          value={vendorFilter}
          onChange={(e) => { setVendorFilter(e.target.value); setPage(1); }}
          className="w-[220px]"
          data-testid="filter-vendor"
        />

        <Select
          value={toSelectValue(tatStateFilter)}
          onValueChange={(v) => { setTatStateFilter(fromSelectValue(v)); setPage(1); }}
        >
          <SelectTrigger className="w-[180px]" data-testid="filter-tat-state">
            <SelectValue placeholder="All TAT States" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All TAT States</SelectItem>
            {TAT_STATE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ').toUpperCase()}</SelectItem>)}
          </SelectContent>
        </Select>

        <Input
          type="text"
          placeholder="Sender domain..."
          value={senderDomainFilter}
          onChange={(e) => { setSenderDomainFilter(e.target.value); setPage(1); }}
          className="w-[220px]"
          data-testid="filter-sender-domain"
        />
      </div>

      {/* Save / Load Views (FR-050.A3) */}
      <div className="mb-3 flex items-center gap-2" data-testid="saved-views-bar">
        <Button variant="outline" size="sm" onClick={handleSaveView} data-testid="save-view-btn">
          <Save className="mr-1.5 h-3.5 w-3.5" />
          Save View
        </Button>
        {allViewNames.length > 0 && (
          <Select
            value="__load__"
            onValueChange={(v) => { if (v !== '__load__') handleLoadView(v); }}
          >
            <SelectTrigger className="w-[180px]" data-testid="load-view-select">
              <SelectValue placeholder="Load View..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__load__" disabled>Load View...</SelectItem>
              {allViewNames.map((v) => (
                <SelectItem key={v.name} value={v.name}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Sort Mode Toggle */}
      <div className="mb-3 flex items-center gap-2" data-testid="sort-mode-toggle">
        <span className="text-sm font-semibold text-slate-600">
          <ArrowUpDown className="mr-1 inline-block h-3.5 w-3.5" />
          Sort by:
        </span>
        <Button
          variant={sortMode === 'fifo' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSortMode('fifo')}
          data-testid="sort-mode-fifo"
        >
          FIFO
        </Button>
        <Button
          variant={sortMode === 'criticality' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSortMode('criticality')}
          data-testid="sort-mode-criticality"
        >
          Criticality
        </Button>
      </div>

      {/* Bulk Action Toolbar */}
      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3" data-testid="bulk-toolbar">
          <span className="text-sm font-semibold text-blue-800">{selectedIds.size} selected</span>
          <Button variant="outline" size="sm" onClick={handleBulkReassign}>Reassign</Button>
          <Button variant="outline" size="sm" onClick={handleBulkChangePriority}>Change Priority</Button>
          <Button variant="outline" size="sm" onClick={handleBulkClose} className="bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 border-red-200">Close</Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Clear Selection</Button>
        </div>
      )}

      {/* Table */}
      <Card role="region" aria-label="Cases table" aria-live="polite">
        <Table role="table">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allOnPageSelected}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all cases on this page"
                />
              </TableHead>
              <TableHead className="cursor-pointer select-none whitespace-nowrap text-xs uppercase" tabIndex={0} role="button" onClick={(e) => handleSort('caseNumber', e.shiftKey)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('caseNumber', e.shiftKey); } }}>
                Case #{sortIndicator('caseNumber')}
              </TableHead>
              <TableHead className="cursor-pointer select-none whitespace-nowrap text-xs uppercase" tabIndex={0} role="button" onClick={(e) => handleSort('subject', e.shiftKey)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('subject', e.shiftKey); } }}>
                Subject{sortIndicator('subject')}
              </TableHead>
              <TableHead className="cursor-pointer select-none whitespace-nowrap text-xs uppercase" tabIndex={0} role="button" onClick={(e) => handleSort('type', e.shiftKey)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('type', e.shiftKey); } }}>
                Type{sortIndicator('type')}
              </TableHead>
              <TableHead className="cursor-pointer select-none whitespace-nowrap text-xs uppercase" tabIndex={0} role="button" onClick={(e) => handleSort('status', e.shiftKey)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('status', e.shiftKey); } }}>
                Status{sortIndicator('status')}
              </TableHead>
              <TableHead className="cursor-pointer select-none whitespace-nowrap text-xs uppercase" tabIndex={0} role="button" onClick={(e) => handleSort('priority', e.shiftKey)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('priority', e.shiftKey); } }}>
                Priority{sortIndicator('priority')}
              </TableHead>
              <TableHead className="whitespace-nowrap text-xs uppercase">
                Confidence
              </TableHead>
              <TableHead className="cursor-pointer select-none whitespace-nowrap text-xs uppercase" tabIndex={0} role="button" onClick={(e) => handleSort('assignedFpr', e.shiftKey)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('assignedFpr', e.shiftKey); } }}>
                Assigned FPR{sortIndicator('assignedFpr')}
              </TableHead>
              <TableHead className="cursor-pointer select-none whitespace-nowrap text-xs uppercase" tabIndex={0} role="button" onClick={(e) => handleSort('tatDue', e.shiftKey)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('tatDue', e.shiftKey); } }}>
                TAT Due{sortIndicator('tatDue')}
              </TableHead>
              <TableHead className="cursor-pointer select-none whitespace-nowrap text-xs uppercase" tabIndex={0} role="button" onClick={(e) => handleSort('created', e.shiftKey)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('created', e.shiftKey); } }}>
                Created{sortIndicator('created')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayCases.map((c, rowIdx) => {
              const tatColor = getTatColor(c.tatDue, c.created);
              const overdue = isOverdue(c);
              const isFocused = rowIdx === focusedIndex;
              return (
                <TableRow
                  key={c.id}
                  className={cn(
                    'cursor-pointer',
                    overdue && 'border-l-4 border-l-red-500',
                    isFocused && 'ring-2 ring-blue-500 ring-inset',
                  )}
                  data-testid={overdue ? 'overdue-row' : 'case-row'}
                >
                  <TableCell className="whitespace-nowrap">
                    <Checkbox
                      checked={selectedIds.has(c.id)}
                      onCheckedChange={() => toggleSelect(c.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select case ${c.caseNumber}`}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-medium" onClick={() => handleRowClick(c.id)}>{c.caseNumber}</TableCell>
                  <TableCell className="whitespace-nowrap" onClick={() => handleRowClick(c.id)}>{c.subject}</TableCell>
                  <TableCell className="whitespace-nowrap" onClick={() => handleRowClick(c.id)}>{c.type}</TableCell>
                  <TableCell className="whitespace-nowrap" onClick={() => handleRowClick(c.id)}><CaseStatusBadge status={c.status} /></TableCell>
                  <TableCell className="whitespace-nowrap" onClick={() => handleRowClick(c.id)}><PriorityIndicator priority={c.priority} /></TableCell>
                  <TableCell className="whitespace-nowrap" onClick={() => handleRowClick(c.id)}>
                    {c.confidenceBand ? <ConfidenceBadge band={c.confidenceBand} /> : '--'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap" onClick={() => handleRowClick(c.id)}>{c.assignedFpr}</TableCell>
                  <TableCell className={cn('whitespace-nowrap', tatColorBorderClass[tatColor])} onClick={() => handleRowClick(c.id)}>
                    {c.tatDue}
                  </TableCell>
                  <TableCell className="whitespace-nowrap" onClick={() => handleRowClick(c.id)}>{c.created}</TableCell>
                </TableRow>
              );
            })}
            {displayCases.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground">
                  No cases found matching filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Show:</span>
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
            <SelectTrigger className="w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>{size}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({totalCount} total)
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        open={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />
    </div>
  );
};

export default CaseListPage;
