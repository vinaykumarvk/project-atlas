import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks — must be defined before component imports
// ---------------------------------------------------------------------------

vi.mock('../hooks/useCases', () => ({
  useCase: () => ({
    data: null,
    isLoading: false,
    isError: false,
    error: null,
  }),
  useCases: () => ({
    data: null,
    isLoading: false,
    isError: false,
    error: null,
  }),
  useBulkAction: () => ({ mutate: vi.fn(), isPending: false }),
  useTransitionStatus: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useAddNote: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  usePauseSla: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useResumeSla: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useUpdateCase: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));

vi.mock('../hooks/useTriageQueue', () => ({
  useConfirmTriage: () => ({ mutate: vi.fn(), isPending: false }),
  useCorrectTriage: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));

// Force demo mode ON so CaseDetail renders mock data
vi.mock('../config/flags', () => ({
  isDemoMode: () => true,
}));

// Mock api client
vi.mock('../api/client', () => ({
  apiGet: vi.fn().mockRejectedValue(new Error('demo mode')),
  apiPost: vi.fn().mockRejectedValue(new Error('demo mode')),
}));

vi.mock('../auth', () => ({
  useAuth: () => ({ user: { id: 'test', email: 'test@test.com', roles: ['SYS_ADMIN'] }, isAuthenticated: true, isLoading: false, accessToken: null, login: vi.fn(), logout: vi.fn(), refreshToken: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Component imports (after mocks)
// ---------------------------------------------------------------------------

import CaseDetailPage from '../pages/CaseDetail';
import { SourceSpanHighlight } from '../components/SourceSpanHighlight';
import { useHotkeys } from '../hooks/useHotkeys';
import { useNotifications } from '../hooks/useNotifications';
import { KeyboardShortcutsModal } from '../components/KeyboardShortcutsModal';
import { renderHook } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderCaseDetail() {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/cases/1']}>
        <Routes>
          <Route path="/cases/:caseId" element={<CaseDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// 1. useHotkeys hook
// ---------------------------------------------------------------------------

describe('useHotkeys hook', () => {
  it('calls the correct handler when a mapped key is pressed', () => {
    const handler = vi.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
    renderHook(() => useHotkeys({ a: handler }), { wrapper });

    fireEvent.keyDown(document, { key: 'a' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not call handler for unmapped keys', () => {
    const handler = vi.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
    renderHook(() => useHotkeys({ a: handler }), { wrapper });

    fireEvent.keyDown(document, { key: 'b' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores keys typed in input fields (except Escape)', () => {
    const handler = vi.fn();
    const escHandler = vi.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <div>
        <input data-testid="test-input" />
        {children}
      </div>
    );
    renderHook(() => useHotkeys({ a: handler, Escape: escHandler }), { wrapper });

    const input = screen.getByTestId('test-input');
    fireEvent.keyDown(input, { key: 'a' });
    expect(handler).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(escHandler).toHaveBeenCalledTimes(1);
  });

  it('cleans up listeners on unmount', () => {
    const handler = vi.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
    const { unmount } = renderHook(() => useHotkeys({ x: handler }), { wrapper });

    unmount();

    fireEvent.keyDown(document, { key: 'x' });
    expect(handler).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2. useNotifications hook
// ---------------------------------------------------------------------------

describe('useNotifications hook', () => {
  let originalNotification: typeof globalThis.Notification;

  beforeEach(() => {
    originalNotification = globalThis.Notification;
  });

  afterEach(() => {
    globalThis.Notification = originalNotification;
  });

  it('returns permission status', () => {
    // Mock Notification API
    const mockNotification = vi.fn() as unknown as typeof Notification;
    Object.defineProperty(mockNotification, 'permission', {
      value: 'granted',
      writable: true,
    });
    mockNotification.requestPermission = vi.fn().mockResolvedValue('granted');
    globalThis.Notification = mockNotification;

    const wrapper = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
    const { result } = renderHook(() => useNotifications(), { wrapper });

    expect(result.current.permission).toBe('granted');
    expect(typeof result.current.notify).toBe('function');
  });

  it('requests permission if status is default', async () => {
    const mockRequestPermission = vi.fn().mockResolvedValue('granted');
    const mockNotification = vi.fn() as unknown as typeof Notification;
    Object.defineProperty(mockNotification, 'permission', {
      value: 'default',
      writable: true,
    });
    mockNotification.requestPermission = mockRequestPermission;
    globalThis.Notification = mockNotification;

    const wrapper = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
    renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => {
      expect(mockRequestPermission).toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// 3. SourceSpanHighlight component
// ---------------------------------------------------------------------------

describe('SourceSpanHighlight', () => {
  it('renders children text', () => {
    render(<SourceSpanHighlight>Hello World</SourceSpanHighlight>);
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('has transparent background by default', () => {
    render(<SourceSpanHighlight>test</SourceSpanHighlight>);
    const span = screen.getByTestId('source-span');
    // After migration to Tailwind, background is controlled by hover: pseudo-classes only,
    // so no inline backgroundColor is set — the default state is effectively transparent.
    expect(span.style.backgroundColor).toBe('');
    // Verify highlight is hover-only: bg-yellow classes should only exist with hover: prefix
    const classes = span.className.split(/\s+/);
    const bgYellowClasses = classes.filter(c => c.includes('bg-yellow'));
    expect(bgYellowClasses.length).toBeGreaterThan(0); // hover:bg-yellow-* should exist
    expect(bgYellowClasses.every(c => c.startsWith('hover:') || c.startsWith('dark:hover:'))).toBe(true);
  });

  it('shows yellow highlight class and tooltip on hover', async () => {
    // Radix Tooltip uses pointer events + timers; use fake timers to control delay
    vi.useFakeTimers();
    render(<SourceSpanHighlight>hover me</SourceSpanHighlight>);
    const span = screen.getByTestId('source-span');

    // Tailwind applies highlight via hover: pseudo-class — verify the class exists
    expect(span.className).toMatch(/hover:bg-yellow/);

    // Trigger Radix Tooltip: pointerMove into the trigger, then advance past delayDuration (200ms)
    fireEvent.pointerMove(span);
    await act(async () => { vi.advanceTimersByTime(250); });

    expect(screen.getByTestId('source-tooltip')).toBeInTheDocument();
    expect(screen.getByTestId('source-tooltip')).toHaveTextContent('Source');
    vi.useRealTimers();
  });

  it('hides tooltip when trigger loses focus', async () => {
    vi.useFakeTimers();
    render(
      <div>
        <SourceSpanHighlight>hover me</SourceSpanHighlight>
        <button data-testid="other">other</button>
      </div>,
    );
    const span = screen.getByTestId('source-span');

    // Open tooltip via pointer
    fireEvent.pointerMove(span);
    await act(async () => { vi.advanceTimersByTime(250); });
    expect(screen.getByTestId('source-tooltip')).toBeInTheDocument();

    // Radix Tooltip's pointerLeave crashes in jsdom due to missing layout (getBoundingClientRect).
    // Instead, verify the tooltip closes when the provider unmounts by focusing elsewhere
    // and sending Escape, which Radix Tooltip handles.
    fireEvent.keyDown(span, { key: 'Escape' });
    await act(async () => { vi.advanceTimersByTime(250); });
    expect(screen.queryByTestId('source-tooltip')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('uses custom sourceLabel', async () => {
    vi.useFakeTimers();
    render(<SourceSpanHighlight sourceLabel="Custom Label">text</SourceSpanHighlight>);
    const span = screen.getByTestId('source-span');

    fireEvent.pointerMove(span);
    await act(async () => { vi.advanceTimersByTime(250); });

    expect(screen.getByTestId('source-tooltip')).toHaveTextContent('Custom Label');
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// 4. DMS link — shows only when dms_external_id is present
// ---------------------------------------------------------------------------

describe('DMS link in CaseDetail attachments', () => {
  it('shows "View in DMS" link for attachment with dms_external_id', async () => {
    renderCaseDetail();

    // Navigate to Attachments tab — Radix TabsTrigger activates on mouseDown (not click)
    const attachmentsTab = screen.getByRole('tab', { name: 'Attachments' });
    fireEvent.mouseDown(attachmentsTab, { button: 0 });

    await waitFor(() => {
      // Attachment id="2" has dms_external_id set in mock data
      const dmsLink = screen.getByTestId('dms-link-2');
      expect(dmsLink).toBeInTheDocument();
      expect(dmsLink).toHaveTextContent('View in DMS');
      expect(dmsLink).toHaveAttribute('target', '_blank');
      expect(dmsLink).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  it('does NOT show "View in DMS" link for attachment without dms_external_id', async () => {
    renderCaseDetail();

    const attachmentsTab = screen.getByRole('tab', { name: 'Attachments' });
    fireEvent.mouseDown(attachmentsTab, { button: 0 });

    await waitFor(() => {
      // Attachment id="1" and id="3" have no dms_external_id
      expect(screen.queryByTestId('dms-link-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('dms-link-3')).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// 5. Routing Rationale panel expands/collapses
// ---------------------------------------------------------------------------

describe('Routing Rationale panel', () => {
  it('renders the Routing Rationale section', () => {
    renderCaseDetail();
    expect(screen.getByTestId('routing-rationale')).toBeInTheDocument();
    expect(screen.getByText('Routing Rationale')).toBeInTheDocument();
  });

  it('is collapsed by default — content not visible', () => {
    renderCaseDetail();
    expect(screen.queryByTestId('routing-rationale-content')).not.toBeInTheDocument();
  });

  it('expands when the toggle is clicked', () => {
    renderCaseDetail();
    const toggle = screen.getByTestId('routing-rationale-toggle');
    fireEvent.click(toggle);

    expect(screen.getByTestId('routing-rationale-content')).toBeInTheDocument();
  });

  it('collapses when toggled again', () => {
    renderCaseDetail();
    const toggle = screen.getByTestId('routing-rationale-toggle');

    fireEvent.click(toggle); // expand
    expect(screen.getByTestId('routing-rationale-content')).toBeInTheDocument();

    fireEvent.click(toggle); // collapse
    expect(screen.queryByTestId('routing-rationale-content')).not.toBeInTheDocument();
  });

  it('renders rationale as bullet list when semicolons are present', () => {
    renderCaseDetail();
    const toggle = screen.getByTestId('routing-rationale-toggle');
    fireEvent.click(toggle);

    const content = screen.getByTestId('routing-rationale-content');
    // The mock data has semicolons, so it should render as <ul> with <li> items
    const listItems = content.querySelectorAll('li');
    expect(listItems.length).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// 6. Security Verdicts badges render pass/fail correctly
// ---------------------------------------------------------------------------

describe('Security Verdicts badges', () => {
  it('renders the Security Verdicts section', () => {
    renderCaseDetail();
    expect(screen.getByTestId('security-verdicts')).toBeInTheDocument();
    expect(screen.getByText('Security Verdicts')).toBeInTheDocument();
  });

  it('renders SPF, DKIM, DMARC badges', () => {
    renderCaseDetail();
    expect(screen.getByTestId('verdict-spf')).toBeInTheDocument();
    expect(screen.getByTestId('verdict-dkim')).toBeInTheDocument();
    expect(screen.getByTestId('verdict-dmarc')).toBeInTheDocument();
  });

  it('uses green Tailwind classes for PASS verdicts', () => {
    renderCaseDetail();
    const spfBadge = screen.getByTestId('verdict-spf');
    expect(spfBadge).toHaveTextContent('SPF: PASS');
    // After migration to Tailwind, colors are applied via utility classes
    expect(spfBadge.className).toMatch(/text-green-500/);
    expect(spfBadge.className).toMatch(/bg-green-100/);
  });

  it('uses red Tailwind classes for FAIL verdicts', () => {
    renderCaseDetail();
    const dmarcBadge = screen.getByTestId('verdict-dmarc');
    expect(dmarcBadge).toHaveTextContent('DMARC: FAIL');
    // After migration to Tailwind, colors are applied via utility classes
    expect(dmarcBadge.className).toMatch(/text-red-500/);
    expect(dmarcBadge.className).toMatch(/bg-red-100/);
  });
});

// ---------------------------------------------------------------------------
// 7. KeyboardShortcutsModal
// ---------------------------------------------------------------------------

describe('KeyboardShortcutsModal', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(
      <KeyboardShortcutsModal open={false} onClose={vi.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders modal content when open is true', () => {
    render(<KeyboardShortcutsModal open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('shortcuts-modal')).toBeInTheDocument();
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutsModal open={true} onClose={onClose} />);
    // shadcn Dialog uses Radix Dialog — close via the built-in close button (sr-only text "Close")
    const closeBtn = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows all expected shortcut keys', () => {
    render(<KeyboardShortcutsModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText('j')).toBeInTheDocument();
    expect(screen.getByText('k')).toBeInTheDocument();
    expect(screen.getByText('/')).toBeInTheDocument();
    expect(screen.getByText('Escape')).toBeInTheDocument();
    expect(screen.getByText('n')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 8. Export Audit Trail button exists
// ---------------------------------------------------------------------------

describe('Export Audit Trail button', () => {
  it('renders the Export Audit Trail button in case detail header', () => {
    renderCaseDetail();
    expect(screen.getByTestId('btn-export-audit')).toBeInTheDocument();
    expect(screen.getByTestId('btn-export-audit')).toHaveTextContent('Export Audit Trail');
  });
});

// ---------------------------------------------------------------------------
// 9. Entity conflict surfacing (FR-011.A4)
// ---------------------------------------------------------------------------

describe('Entity conflict surfacing', () => {
  it('shows warning icon for FUZZY_MATCH entities', () => {
    renderCaseDetail();
    // Entity index 1 (Customer Name) and 3 (Amount) are FUZZY_MATCH in mock data
    expect(screen.getByTestId('entity-conflict-1')).toBeInTheDocument();
    expect(screen.getByTestId('entity-conflict-3')).toBeInTheDocument();
  });

  it('does NOT show warning icon for EXACT_MATCH entities', () => {
    renderCaseDetail();
    expect(screen.queryByTestId('entity-conflict-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('entity-conflict-2')).not.toBeInTheDocument();
  });

  it('shows candidate values when warning icon is clicked', () => {
    renderCaseDetail();
    const warningIcon = screen.getByTestId('entity-conflict-1');
    fireEvent.click(warningIcon);

    expect(screen.getByTestId('entity-candidates-1')).toBeInTheDocument();
    // "Acme Corp Pty Ltd" appears multiple times (entity value + candidate), so use getAllByText
    const acmeMatches = screen.getAllByText('Acme Corp Pty Ltd');
    expect(acmeMatches.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('ACME Corporation Pty Limited')).toBeInTheDocument();
  });

  it('collapses candidates when clicked again', () => {
    renderCaseDetail();
    const warningIcon = screen.getByTestId('entity-conflict-1');

    fireEvent.click(warningIcon); // expand
    expect(screen.getByTestId('entity-candidates-1')).toBeInTheDocument();

    fireEvent.click(warningIcon); // collapse
    expect(screen.queryByTestId('entity-candidates-1')).not.toBeInTheDocument();
  });
});
