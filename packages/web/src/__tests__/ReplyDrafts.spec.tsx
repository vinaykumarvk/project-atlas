import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
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
  useTransitionStatus: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  }),
  useAddNote: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  }),
  usePauseSla: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  }),
  useResumeSla: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  }),
  useUpdateCase: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  }),
}));

vi.mock('../hooks/useTriageQueue', () => ({
  useConfirmTriage: () => ({ mutate: vi.fn(), isPending: false }),
  useCorrectTriage: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  }),
}));

vi.mock('../config/flags', () => ({
  isDemoMode: () => true,
}));

vi.mock('../api/client', () => ({
  apiGet: vi.fn().mockRejectedValue(new Error('demo mode')),
  apiPost: vi.fn().mockRejectedValue(new Error('demo mode')),
}));

vi.mock('../auth', () => ({
  useAuth: () => ({ user: { id: 'test', email: 'test@test.com', roles: ['SYS_ADMIN'] }, isAuthenticated: true, isLoading: false, accessToken: null, login: vi.fn(), logout: vi.fn(), refreshToken: vi.fn() }),
}));

import CaseDetailPage from '../pages/CaseDetail';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderCaseDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/cases/1']}>
        <Routes>
          <Route path="/cases/:caseId" element={<CaseDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests — FR-053.A2: Reply Drafts Tab
// ---------------------------------------------------------------------------

describe('Reply Drafts Tab (FR-053.A2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Reply Drafts tab button', () => {
    renderCaseDetail();
    expect(screen.getByText('Reply Drafts')).toBeInTheDocument();
  });

  it('shows reply drafts content when Reply Drafts tab is clicked', async () => {
    renderCaseDetail();
    const replyDraftsTab = screen.getByText('Reply Drafts');
    fireEvent.click(replyDraftsTab);

    await waitFor(() => {
      expect(screen.getByTestId('reply-drafts-tab')).toBeInTheDocument();
    });
  });

  it('displays draft subjects from mock data', async () => {
    renderCaseDetail();
    fireEvent.click(screen.getByText('Reply Drafts'));

    await waitFor(() => {
      expect(
        screen.getAllByText(/Re: Valuation Request/i).length,
      ).toBeGreaterThanOrEqual(1);
    });
  });

  it('displays status badges for each draft', async () => {
    renderCaseDetail();
    fireEvent.click(screen.getByText('Reply Drafts'));

    await waitFor(() => {
      expect(screen.getByText('PROPOSED')).toBeInTheDocument();
      expect(screen.getByText('APPROVED')).toBeInTheDocument();
    });
  });

  it('displays Approve and Reject buttons for PROPOSED drafts', async () => {
    renderCaseDetail();
    fireEvent.click(screen.getByText('Reply Drafts'));

    await waitFor(() => {
      expect(
        screen.getByTestId('approve-draft-rd-1'),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('reject-draft-rd-1'),
      ).toBeInTheDocument();
    });
  });

  it('displays Edit button for PROPOSED drafts', async () => {
    renderCaseDetail();
    fireEvent.click(screen.getByText('Reply Drafts'));

    await waitFor(() => {
      expect(screen.getByTestId('edit-draft-rd-1')).toBeInTheDocument();
    });
  });

  it('changes status to APPROVED when Approve button is clicked', async () => {
    renderCaseDetail();
    fireEvent.click(screen.getByText('Reply Drafts'));

    await waitFor(() => {
      expect(
        screen.getByTestId('approve-draft-rd-1'),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('approve-draft-rd-1'));

    await waitFor(() => {
      const statusBadge = screen.getByTestId('draft-status-rd-1');
      expect(statusBadge).toHaveTextContent('APPROVED');
    });
  });

  it('changes status to REJECTED when Reject button is clicked', async () => {
    renderCaseDetail();
    fireEvent.click(screen.getByText('Reply Drafts'));

    await waitFor(() => {
      expect(
        screen.getByTestId('reject-draft-rd-1'),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('reject-draft-rd-1'));

    await waitFor(() => {
      const statusBadge = screen.getByTestId('draft-status-rd-1');
      expect(statusBadge).toHaveTextContent('REJECTED');
    });
  });

  it('hides Approve/Reject buttons after action is taken', async () => {
    renderCaseDetail();
    fireEvent.click(screen.getByText('Reply Drafts'));

    await waitFor(() => {
      expect(
        screen.getByTestId('approve-draft-rd-1'),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('approve-draft-rd-1'));

    await waitFor(() => {
      expect(
        screen.queryByTestId('approve-draft-rd-1'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('reject-draft-rd-1'),
      ).not.toBeInTheDocument();
    });
  });

  it('displays draft body text', async () => {
    renderCaseDetail();
    fireEvent.click(screen.getByText('Reply Drafts'));

    await waitFor(() => {
      expect(
        screen.getByText(/Thank you for your valuation request/i),
      ).toBeInTheDocument();
    });
  });

  it('shows approved-by info for approved drafts', async () => {
    renderCaseDetail();
    fireEvent.click(screen.getByText('Reply Drafts'));

    await waitFor(() => {
      expect(
        screen.getByText(/Approved by John Smith/i),
      ).toBeInTheDocument();
    });
  });
});
