import { useState, useMemo, useCallback, useRef, useEffect, type CSSProperties } from 'react';
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
        <h2 style={styles.heading}>Cases</h2>
        <div style={styles.placeholder}>
          <div style={styles.spinner} />
          <p style={styles.placeholderText}>Loading cases...</p>
        </div>
      </div>
    );
  }

  // Error state (live mode only)
  if (!demo && isError) {
    return (
      <div>
        <h2 style={styles.heading}>Cases</h2>
        <div style={{ ...styles.placeholder, borderColor: '#fecaca' }}>
          <h3 style={{ ...styles.placeholderTitle, color: '#dc2626' }}>
            Failed to load cases
          </h3>
          <p style={styles.placeholderText}>
            {error instanceof Error ? error.message : 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={styles.retryButton}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state (live mode only, no results and no filters applied)
  if (!demo && displayCases.length === 0 && !search && !statusFilter && !typeFilter && !priorityFilter && !fprFilter) {
    return (
      <div>
        <h2 style={styles.heading}>Cases</h2>
        <div style={styles.placeholder}>
          <h3 style={styles.placeholderTitle}>No cases yet</h3>
          <p style={styles.placeholderText}>
            Cases will appear here once emails are ingested and classified by
            the system.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* FR-128.A5: LLM mode degradation banner */}
      <LlmModeBanner />

      <h2 style={styles.heading}>Cases</h2>

      {/* FR-050.A2: Role-based case filtering indicator */}
      {user && user.roles && user.roles.length > 0 && (
        <span
          data-testid="role-filter-chip"
          style={styles.roleChip}
        >
          Showing cases for: {user.roles.join(', ')}
        </span>
      )}

      {/* Debounced search indicator */}
      {!demo && isFetching && debouncedSearch && (
        <div data-testid="search-loading" aria-live="polite" style={{ fontSize: '0.85rem', color: '#3b82f6', marginBottom: '0.5rem' }}>
          Searching...
        </div>
      )}

      {/* Search and Filters */}
      <div style={styles.filterBar} role="search" aria-label="Case filters">
        <input
          ref={searchInputRef}
          type="search"
          placeholder="Search cases..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={styles.searchInput}
          data-testid="case-search-input"
          aria-label="Search cases"
        />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} style={styles.select}>
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} style={styles.select}>
          <option value="">All Types</option>
          {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }} style={styles.select}>
          <option value="">All Priorities</option>
          {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={fprFilter} onChange={(e) => { setFprFilter(e.target.value); setPage(1); }} style={styles.select}>
          <option value="">All FPRs</option>
          {FPR_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <input
          type="text"
          placeholder="Location (city)..."
          value={locationFilter}
          onChange={(e) => { setLocationFilter(e.target.value); setPage(1); }}
          style={styles.searchInput}
          data-testid="filter-location"
        />
        <input
          type="text"
          placeholder="Vendor..."
          value={vendorFilter}
          onChange={(e) => { setVendorFilter(e.target.value); setPage(1); }}
          style={styles.searchInput}
          data-testid="filter-vendor"
        />
        <select
          value={tatStateFilter}
          onChange={(e) => { setTatStateFilter(e.target.value); setPage(1); }}
          style={styles.select}
          data-testid="filter-tat-state"
        >
          <option value="">All TAT States</option>
          {TAT_STATE_OPTIONS.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ').toUpperCase()}</option>)}
        </select>
        <input
          type="text"
          placeholder="Sender domain..."
          value={senderDomainFilter}
          onChange={(e) => { setSenderDomainFilter(e.target.value); setPage(1); }}
          style={styles.searchInput}
          data-testid="filter-sender-domain"
        />
      </div>

      {/* Save / Load Views (FR-050.A3) */}
      <div style={styles.viewBar} data-testid="saved-views-bar">
        <button onClick={handleSaveView} style={styles.viewButton} data-testid="save-view-btn">
          Save View
        </button>
        {(savedViews.length > 0 || serverViews.length > 0) && (
          <select
            onChange={(e) => { if (e.target.value) handleLoadView(e.target.value); e.target.value = ''; }}
            style={styles.select}
            data-testid="load-view-select"
            defaultValue=""
          >
            <option value="" disabled>Load View...</option>
            {savedViews.map((v) => (
              <option key={v.name} value={v.name}>{v.name}</option>
            ))}
            {serverViews.filter((sv: any) => !savedViews.some(lv => lv.name === sv.name)).map((sv: any) => (
              <option key={sv.name || sv.id} value={sv.name}>{sv.name} (server)</option>
            ))}
          </select>
        )}
      </div>

      {/* Sort Mode Toggle */}
      <div style={styles.sortModeBar} data-testid="sort-mode-toggle">
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Sort by:</span>
        <button
          onClick={() => setSortMode('fifo')}
          style={sortMode === 'fifo' ? { ...styles.sortModeButton, ...styles.sortModeButtonActive } : styles.sortModeButton}
          data-testid="sort-mode-fifo"
        >
          FIFO
        </button>
        <button
          onClick={() => setSortMode('criticality')}
          style={sortMode === 'criticality' ? { ...styles.sortModeButton, ...styles.sortModeButtonActive } : styles.sortModeButton}
          data-testid="sort-mode-criticality"
        >
          Criticality
        </button>
      </div>

      {/* Bulk Action Toolbar */}
      {selectedIds.size > 0 && (
        <div style={styles.bulkToolbar} data-testid="bulk-toolbar">
          <span style={styles.bulkCount}>{selectedIds.size} selected</span>
          <button onClick={handleBulkReassign} style={styles.bulkButton}>Reassign</button>
          <button onClick={handleBulkChangePriority} style={styles.bulkButton}>Change Priority</button>
          <button onClick={handleBulkClose} style={{ ...styles.bulkButton, backgroundColor: '#fee2e2', color: '#dc2626' }}>Close</button>
          <button onClick={() => setSelectedIds(new Set())} style={styles.bulkButton}>Clear Selection</button>
        </div>
      )}

      {/* Table */}
      <div style={styles.tableContainer} role="region" aria-label="Cases table" aria-live="polite">
        <table style={styles.table} role="table">
          <thead>
            <tr>
              <th style={styles.th}>
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleSelectAll}
                  aria-label="Select all cases on this page"
                />
              </th>
              <th style={styles.thSortable} onClick={(e) => handleSort('caseNumber', e.shiftKey)}>
                Case #{sortIndicator('caseNumber')}
              </th>
              <th style={styles.thSortable} onClick={(e) => handleSort('subject', e.shiftKey)}>
                Subject{sortIndicator('subject')}
              </th>
              <th style={styles.thSortable} onClick={(e) => handleSort('type', e.shiftKey)}>
                Type{sortIndicator('type')}
              </th>
              <th style={styles.thSortable} onClick={(e) => handleSort('status', e.shiftKey)}>
                Status{sortIndicator('status')}
              </th>
              <th style={styles.thSortable} onClick={(e) => handleSort('priority', e.shiftKey)}>
                Priority{sortIndicator('priority')}
              </th>
              <th style={styles.th}>
                Confidence
              </th>
              <th style={styles.thSortable} onClick={(e) => handleSort('assignedFpr', e.shiftKey)}>
                Assigned FPR{sortIndicator('assignedFpr')}
              </th>
              <th style={styles.thSortable} onClick={(e) => handleSort('tatDue', e.shiftKey)}>
                TAT Due{sortIndicator('tatDue')}
              </th>
              <th style={styles.thSortable} onClick={(e) => handleSort('created', e.shiftKey)}>
                Created{sortIndicator('created')}
              </th>
            </tr>
          </thead>
          <tbody>
            {displayCases.map((c, rowIdx) => {
              const tatColor = getTatColor(c.tatDue, c.created);
              const overdue = isOverdue(c);
              const isFocused = rowIdx === focusedIndex;
              const rowStyle: CSSProperties = {
                ...styles.tr,
                ...(overdue ? { borderLeft: '4px solid #dc3545' } : {}),
                ...(isFocused ? { outline: '2px solid #3b82f6', outlineOffset: '-2px' } : {}),
              };
              return (
                <tr
                  key={c.id}
                  style={rowStyle}
                  data-testid={overdue ? 'overdue-row' : 'case-row'}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#f1f5f9'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
                >
                  <td style={styles.td}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleSelect(c.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select case ${c.caseNumber}`}
                    />
                  </td>
                  <td style={styles.td} onClick={() => handleRowClick(c.id)}><strong>{c.caseNumber}</strong></td>
                  <td style={styles.td} onClick={() => handleRowClick(c.id)}>{c.subject}</td>
                  <td style={styles.td} onClick={() => handleRowClick(c.id)}>{c.type}</td>
                  <td style={styles.td} onClick={() => handleRowClick(c.id)}><CaseStatusBadge status={c.status} /></td>
                  <td style={styles.td} onClick={() => handleRowClick(c.id)}><PriorityIndicator priority={c.priority} /></td>
                  <td style={styles.td} onClick={() => handleRowClick(c.id)}>
                    {c.confidenceBand ? <ConfidenceBadge band={c.confidenceBand} /> : '--'}
                  </td>
                  <td style={styles.td} onClick={() => handleRowClick(c.id)}>{c.assignedFpr}</td>
                  <td style={{ ...styles.td, borderLeft: `3px solid ${tatColor}` }} onClick={() => handleRowClick(c.id)}>
                    {c.tatDue}
                  </td>
                  <td style={styles.td} onClick={() => handleRowClick(c.id)}>{c.created}</td>
                </tr>
              );
            })}
            {displayCases.length === 0 && (
              <tr>
                <td colSpan={10} style={{ ...styles.td, textAlign: 'center', color: '#94a3b8' }}>
                  No cases found matching filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={styles.pagination}>
        <div style={styles.pageSizeControl}>
          <span style={styles.paginationLabel}>Show:</span>
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} style={styles.select}>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>
        <div style={styles.pageControls}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={styles.pageButton}
          >
            Previous
          </button>
          <span style={styles.pageInfo}>
            Page {page} of {totalPages} ({totalCount} total)
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={styles.pageButton}
          >
            Next
          </button>
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

const styles: Record<string, CSSProperties> = {
  heading: {
    margin: '0 0 1rem 0',
    fontSize: '1.5rem',
    fontWeight: 700,
  },
  filterBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.75rem',
    marginBottom: '1rem',
    alignItems: 'center',
  },
  searchInput: {
    padding: '0.5rem 0.75rem',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    fontSize: '0.875rem',
    width: '220px',
  },
  select: {
    padding: '0.5rem 0.75rem',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    fontSize: '0.875rem',
    backgroundColor: 'var(--color-bg)',
  },
  bulkToolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    marginBottom: '0.75rem',
    backgroundColor: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: '8px',
  },
  bulkCount: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#1e40af',
  },
  bulkButton: {
    padding: '0.375rem 0.75rem',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    fontSize: '0.8rem',
    cursor: 'pointer',
    backgroundColor: 'var(--color-bg)',
    fontWeight: 500,
  },
  tableContainer: {
    overflowX: 'auto',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    backgroundColor: 'var(--color-surface)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.875rem',
  },
  th: {
    textAlign: 'left',
    padding: '0.75rem 1rem',
    borderBottom: '2px solid var(--color-border)',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    fontWeight: 600,
    color: '#64748b',
    whiteSpace: 'nowrap',
  },
  thSortable: {
    textAlign: 'left',
    padding: '0.75rem 1rem',
    borderBottom: '2px solid var(--color-border)',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    fontWeight: 600,
    color: '#64748b',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    userSelect: 'none',
  },
  tr: {
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  td: {
    padding: '0.75rem 1rem',
    borderBottom: '1px solid var(--color-border)',
    whiteSpace: 'nowrap',
  },
  pagination: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '1rem',
    padding: '0.5rem 0',
  },
  pageSizeControl: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  paginationLabel: {
    fontSize: '0.85rem',
    color: '#64748b',
  },
  pageControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  pageButton: {
    padding: '0.375rem 0.75rem',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    fontSize: '0.85rem',
    cursor: 'pointer',
    backgroundColor: 'var(--color-bg)',
  },
  pageInfo: {
    fontSize: '0.85rem',
    color: '#64748b',
  },
  placeholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4rem 2rem',
    border: '1px dashed var(--color-border)',
    borderRadius: '8px',
    backgroundColor: 'var(--color-surface)',
    textAlign: 'center',
  },
  placeholderIcon: {
    fontSize: '2.5rem',
    marginBottom: '0.75rem',
    opacity: 0.5,
  },
  placeholderTitle: {
    margin: '0 0 0.5rem 0',
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#475569',
  },
  placeholderText: {
    margin: 0,
    fontSize: '0.875rem',
    color: '#94a3b8',
    maxWidth: '480px',
    lineHeight: 1.5,
  },
  code: {
    backgroundColor: '#f1f5f9',
    padding: '0.15rem 0.4rem',
    borderRadius: '4px',
    fontSize: '0.8rem',
    fontFamily: 'monospace',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid var(--color-border)',
    borderTop: '3px solid var(--color-accent, #3b82f6)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    marginBottom: '1rem',
  },
  retryButton: {
    marginTop: '1rem',
    padding: '0.5rem 1.25rem',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    backgroundColor: 'var(--color-bg)',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 500,
  },
  viewBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.75rem',
  },
  viewButton: {
    padding: '0.375rem 0.75rem',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    fontSize: '0.8rem',
    cursor: 'pointer',
    backgroundColor: 'var(--color-bg)',
    fontWeight: 500,
  },
  sortModeBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.75rem',
  },
  sortModeButton: {
    padding: '0.375rem 0.75rem',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    fontSize: '0.8rem',
    cursor: 'pointer',
    backgroundColor: 'var(--color-bg)',
    fontWeight: 500,
  },
  sortModeButtonActive: {
    backgroundColor: '#3b82f6',
    color: '#fff',
    borderColor: '#3b82f6',
  },
  roleChip: {
    display: 'inline-block',
    padding: '0.25rem 0.75rem',
    marginBottom: '0.75rem',
    backgroundColor: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: '9999px',
    fontSize: '0.8rem',
    fontWeight: 500,
    color: '#1e40af',
  },
};

export default CaseListPage;
