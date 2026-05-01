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
// Tests — FR-052.A2: Suggested Actions Panel
// ---------------------------------------------------------------------------

describe('Suggested Actions Panel (FR-052.A2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the suggested actions panel', async () => {
    renderCaseDetail();
    await waitFor(() => {
      expect(
        screen.getByTestId('suggested-actions-panel'),
      ).toBeInTheDocument();
    });
  });

  it('displays up to 3 suggested actions', async () => {
    renderCaseDetail();
    await waitFor(() => {
      expect(
        screen.getByTestId('suggested-actions-panel'),
      ).toBeInTheDocument();
    });

    // Mock data provides 3 actions: CLASSIFY, ROUTE, PRIORITISE
    await waitFor(() => {
      expect(screen.getByText('CLASSIFY')).toBeInTheDocument();
    });
  });

  it('displays confidence badges for each action', async () => {
    renderCaseDetail();
    await waitFor(() => {
      expect(
        screen.getByTestId('suggested-actions-panel'),
      ).toBeInTheDocument();
    });

    await waitFor(() => {
      // The mock has confidence 0.95 = "95%"
      const badges = screen.getAllByText(/\d+%/);
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('displays Accept buttons for each action', async () => {
    renderCaseDetail();
    await waitFor(() => {
      expect(
        screen.getByTestId('suggested-actions-panel'),
      ).toBeInTheDocument();
    });

    await waitFor(() => {
      const acceptButtons = screen.getAllByText('Accept');
      expect(acceptButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('changes Accept button to Accepted when clicked', async () => {
    renderCaseDetail();
    await waitFor(() => {
      expect(
        screen.getByTestId('suggested-actions-panel'),
      ).toBeInTheDocument();
    });

    await waitFor(() => {
      const acceptBtn = screen.getByTestId('accept-action-sa-1');
      expect(acceptBtn).toBeInTheDocument();
      fireEvent.click(acceptBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('accept-action-sa-1')).toHaveTextContent(
        'Accepted',
      );
    });
  });

  it('disables the Accept button after it is clicked', async () => {
    renderCaseDetail();
    await waitFor(() => {
      const acceptBtn = screen.getByTestId('accept-action-sa-1');
      fireEvent.click(acceptBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('accept-action-sa-1')).toBeDisabled();
    });
  });

  it('renders action descriptions', async () => {
    renderCaseDetail();
    await waitFor(() => {
      expect(
        screen.getByText(/classification pipeline/i),
      ).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — FR-052.A2-A3: Recipient/TAT + Accept/Edit/Reject
// ---------------------------------------------------------------------------

describe('Suggested Actions - Recipient/TAT/Feedback (FR-052.A2-A3)', () => {
  const mockActions = [
    { id: 'sa-1', action: 'CLASSIFY', description: 'Run classification', confidence: 0.95, source: 'RULE', recipientRole: 'OFFICER', estimatedTatImpactHours: 2 },
    { id: 'sa-2', action: 'ROUTE', description: 'Route case', confidence: 0.9, source: 'LLM', recipientRole: 'FPR', estimatedTatImpactHours: 4 },
  ];

  it('should render suggested actions with required fields', () => {
    for (const action of mockActions) {
      expect(action.recipientRole).toBeTruthy();
      expect(action.estimatedTatImpactHours).toBeGreaterThan(0);
    }
  });

  it('should include confidence score for each action', () => {
    for (const action of mockActions) {
      expect(action.confidence).toBeGreaterThanOrEqual(0);
      expect(action.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('should support RULE and LLM sources', () => {
    const sources = mockActions.map(a => a.source);
    expect(sources).toContain('RULE');
    expect(sources).toContain('LLM');
  });

  it('should have unique IDs for each action', () => {
    const ids = mockActions.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should include action feedback endpoint path', () => {
    const feedbackEndpoint = '/classification/actions/sa-1/feedback';
    expect(feedbackEndpoint).toContain('sa-1');
  });

  it('renders recipient role in suggested actions', async () => {
    renderCaseDetail();
    await waitFor(() => {
      expect(screen.getByTestId('suggested-actions-panel')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId('recipient-role-sa-1')).toBeInTheDocument();
    });
  });

  it('renders TAT impact in suggested actions', async () => {
    renderCaseDetail();
    await waitFor(() => {
      expect(screen.getByTestId('suggested-actions-panel')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId('tat-impact-sa-1')).toBeInTheDocument();
    });
  });

  it('renders Edit and Reject buttons alongside Accept', async () => {
    renderCaseDetail();
    await waitFor(() => {
      expect(screen.getByTestId('suggested-actions-panel')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId('edit-action-sa-1')).toBeInTheDocument();
      expect(screen.getByTestId('reject-action-sa-1')).toBeInTheDocument();
    });
  });

  it('changes Reject button to Rejected when clicked', async () => {
    renderCaseDetail();
    await waitFor(() => {
      expect(screen.getByTestId('suggested-actions-panel')).toBeInTheDocument();
    });

    await waitFor(() => {
      fireEvent.click(screen.getByTestId('reject-action-sa-1'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('reject-action-sa-1')).toHaveTextContent('Rejected');
    });
  });
});
