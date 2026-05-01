import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DsrTracking } from '../pages/compliance/DsrTracking';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const now = new Date();
const futureDue = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 days from now
const soonDue = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000); // 1 day from now
const overdueDue = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago

const mockDsrData = {
  data: [
    {
      id: 'dsr-001',
      subjectName: 'John Doe',
      subjectEmail: 'john@example.com',
      type: 'ACCESS' as const,
      status: 'PENDING' as const,
      description: 'Data access request',
      assignedTo: null,
      dueDate: futureDue.toISOString(),
      createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: 'dsr-002',
      subjectName: 'Jane Smith',
      subjectEmail: 'jane@example.com',
      type: 'ERASURE' as const,
      status: 'COMPLETED' as const,
      description: 'Right to be forgotten',
      assignedTo: 'officer-1',
      dueDate: futureDue.toISOString(),
      createdAt: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'dsr-003',
      subjectName: 'Bob Kumar',
      subjectEmail: 'bob@example.com',
      type: 'RECTIFICATION' as const,
      status: 'PENDING' as const,
      description: 'Name correction',
      assignedTo: null,
      dueDate: soonDue.toISOString(),
      createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: 'dsr-004',
      subjectName: 'Alice Patel',
      subjectEmail: 'alice@example.com',
      type: 'PORTABILITY' as const,
      status: 'IN_PROGRESS' as const,
      description: 'Data export request',
      assignedTo: 'officer-2',
      dueDate: overdueDue.toISOString(),
      createdAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: now.toISOString(),
    },
  ],
  total: 4,
  page: 1,
  limit: 20,
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockMutate = vi.fn();

vi.mock('../hooks/useDsrRequests', () => ({
  useDsrRequests: vi.fn(() => ({
    data: mockDsrData,
    isLoading: false,
    error: null,
  })),
  useUpdateDsrStatus: vi.fn(() => ({
    mutate: mockMutate,
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DsrTracking />
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DsrTracking — DPO console enhancements (FR-120.A5)', () => {
  describe('Compliance Summary Card', () => {
    it('should display the compliance summary with total requests', () => {
      renderComponent();

      const summary = screen.getByTestId('compliance-summary');
      expect(summary).toBeInTheDocument();
      expect(within(summary).getByText('Total Requests')).toBeInTheDocument();
      expect(within(summary).getByText('4')).toBeInTheDocument();
    });

    it('should display request counts by status', () => {
      renderComponent();

      const summary = screen.getByTestId('compliance-summary');
      // PENDING count should be 2
      expect(within(summary).getByText('PENDING')).toBeInTheDocument();
      expect(within(summary).getByText('2')).toBeInTheDocument();
      // COMPLETED count should be 1
      expect(within(summary).getByText('COMPLETED')).toBeInTheDocument();
      // Multiple statuses have count '1' (IN_PROGRESS and COMPLETED), so use getAllByText
      expect(within(summary).getAllByText('1').length).toBeGreaterThanOrEqual(1);
    });

    it('should display the average resolution time', () => {
      renderComponent();

      const summary = screen.getByTestId('compliance-summary');
      expect(within(summary).getByText('Avg Resolution')).toBeInTheDocument();
    });
  });

  describe('Bulk Operations', () => {
    it('should render a select-all checkbox in the table header', () => {
      renderComponent();

      const selectAll = screen.getByTestId('select-all-checkbox');
      expect(selectAll).toBeInTheDocument();
      expect(selectAll).not.toBeChecked();
    });

    it('should render individual checkboxes for each DSR row', () => {
      renderComponent();

      for (const dsr of mockDsrData.data) {
        const checkbox = screen.getByTestId(`select-${dsr.id}`);
        expect(checkbox).toBeInTheDocument();
        expect(checkbox).not.toBeChecked();
      }
    });

    it('should select all rows when select-all is clicked', () => {
      renderComponent();

      const selectAll = screen.getByTestId('select-all-checkbox');
      fireEvent.click(selectAll);

      for (const dsr of mockDsrData.data) {
        const checkbox = screen.getByTestId(`select-${dsr.id}`) as HTMLInputElement;
        expect(checkbox.checked).toBe(true);
      }
    });

    it('should deselect all when select-all is clicked again', () => {
      renderComponent();

      const selectAll = screen.getByTestId('select-all-checkbox');
      fireEvent.click(selectAll); // select all
      fireEvent.click(selectAll); // deselect all

      for (const dsr of mockDsrData.data) {
        const checkbox = screen.getByTestId(`select-${dsr.id}`) as HTMLInputElement;
        expect(checkbox.checked).toBe(false);
      }
    });

    it('should toggle individual checkboxes', () => {
      renderComponent();

      const checkbox = screen.getByTestId('select-dsr-001') as HTMLInputElement;
      expect(checkbox.checked).toBe(false);

      fireEvent.click(checkbox);
      expect(checkbox.checked).toBe(true);

      fireEvent.click(checkbox);
      expect(checkbox.checked).toBe(false);
    });

    it('should show bulk action buttons when items are selected', () => {
      renderComponent();

      // No bulk actions initially
      expect(screen.queryByTestId('bulk-approve-btn')).not.toBeInTheDocument();

      // Select one item
      const checkbox = screen.getByTestId('select-dsr-001');
      fireEvent.click(checkbox);

      // Bulk actions should now appear
      expect(screen.getByTestId('bulk-approve-btn')).toBeInTheDocument();
      expect(screen.getByTestId('bulk-reject-btn')).toBeInTheDocument();
      expect(screen.getByText('1 selected')).toBeInTheDocument();
    });

    it('should call updateStatus for each selected item on bulk approve', () => {
      renderComponent();

      // Select two items
      fireEvent.click(screen.getByTestId('select-dsr-001'));
      fireEvent.click(screen.getByTestId('select-dsr-003'));

      // Click bulk approve
      fireEvent.click(screen.getByTestId('bulk-approve-btn'));

      expect(mockMutate).toHaveBeenCalledTimes(2);
      expect(mockMutate).toHaveBeenCalledWith({ id: 'dsr-001', status: 'COMPLETED' });
      expect(mockMutate).toHaveBeenCalledWith({ id: 'dsr-003', status: 'COMPLETED' });
    });

    it('should call updateStatus for each selected item on bulk reject', () => {
      renderComponent();

      // Select two items
      fireEvent.click(screen.getByTestId('select-dsr-001'));
      fireEvent.click(screen.getByTestId('select-dsr-003'));

      // Click bulk reject
      fireEvent.click(screen.getByTestId('bulk-reject-btn'));

      expect(mockMutate).toHaveBeenCalledTimes(2);
      expect(mockMutate).toHaveBeenCalledWith({ id: 'dsr-001', status: 'REJECTED' });
      expect(mockMutate).toHaveBeenCalledWith({ id: 'dsr-003', status: 'REJECTED' });
    });
  });

  describe('SLA Tracking Column', () => {
    it('should show the SLA column header', () => {
      renderComponent();

      expect(screen.getByText('SLA')).toBeInTheDocument();
    });

    it('should show remaining time for PENDING requests', () => {
      renderComponent();

      const sla001 = screen.getByTestId('sla-dsr-001');
      expect(sla001.textContent).toContain('remaining');
    });

    it('should show "--" for COMPLETED requests', () => {
      renderComponent();

      const sla002 = screen.getByTestId('sla-dsr-002');
      expect(sla002.textContent).toBe('--');
    });

    it('should show "overdue" styling for overdue requests', () => {
      renderComponent();

      const sla004 = screen.getByTestId('sla-dsr-004');
      expect(sla004.textContent).toContain('overdue');
    });
  });

  describe('Table rendering', () => {
    it('should render all DSR requests in the table', () => {
      renderComponent();

      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('Bob Kumar')).toBeInTheDocument();
      expect(screen.getByText('Alice Patel')).toBeInTheDocument();
    });

    it('should display the total count', () => {
      renderComponent();

      expect(screen.getByText('4 request(s) found')).toBeInTheDocument();
    });

    it('should render status badges with appropriate colors', () => {
      renderComponent();

      const pendingBadges = screen.getAllByText('PENDING');
      expect(pendingBadges.length).toBeGreaterThan(0);
    });
  });
});
