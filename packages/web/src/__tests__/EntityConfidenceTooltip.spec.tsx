import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
// Tests
// ---------------------------------------------------------------------------

describe('Per-entity confidence tooltip (FR-133.A2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders entity badges in the overview tab', () => {
    renderCaseDetail();
    // Overview tab is active by default
    expect(screen.getByTestId('entity-badge-0')).toBeInTheDocument();
    expect(screen.getByTestId('entity-badge-1')).toBeInTheDocument();
    expect(screen.getByTestId('entity-badge-2')).toBeInTheDocument();
    expect(screen.getByTestId('entity-badge-3')).toBeInTheDocument();
  });

  it('does not show tooltip by default', () => {
    renderCaseDetail();
    expect(screen.queryByTestId('entity-confidence-tooltip-0')).not.toBeInTheDocument();
  });

  it('shows confidence tooltip on entity badge hover', () => {
    renderCaseDetail();
    const badge = screen.getByTestId('entity-badge-0');
    fireEvent.mouseEnter(badge);

    const tooltip = screen.getByTestId('entity-confidence-tooltip-0');
    expect(tooltip).toBeInTheDocument();
  });

  it('tooltip shows entity type', () => {
    renderCaseDetail();
    fireEvent.mouseEnter(screen.getByTestId('entity-badge-0'));

    const tooltip = screen.getByTestId('entity-confidence-tooltip-0');
    expect(tooltip).toHaveTextContent('Type: Property Address');
  });

  it('tooltip shows extracted value', () => {
    renderCaseDetail();
    fireEvent.mouseEnter(screen.getByTestId('entity-badge-0'));

    const tooltip = screen.getByTestId('entity-confidence-tooltip-0');
    expect(tooltip).toHaveTextContent('Value: 123 Main St, Sydney NSW 2000');
  });

  it('tooltip shows confidence score', () => {
    renderCaseDetail();
    fireEvent.mouseEnter(screen.getByTestId('entity-badge-0'));

    const tooltip = screen.getByTestId('entity-confidence-tooltip-0');
    expect(tooltip).toHaveTextContent('Confidence: 97%');
  });

  it('tooltip shows validation outcome', () => {
    renderCaseDetail();
    fireEvent.mouseEnter(screen.getByTestId('entity-badge-0'));

    const tooltip = screen.getByTestId('entity-confidence-tooltip-0');
    expect(tooltip).toHaveTextContent('Validation: EXACT_MATCH');
  });

  it('hides tooltip on mouse leave', () => {
    renderCaseDetail();
    const badge = screen.getByTestId('entity-badge-0');

    fireEvent.mouseEnter(badge);
    expect(screen.getByTestId('entity-confidence-tooltip-0')).toBeInTheDocument();

    fireEvent.mouseLeave(badge);
    expect(screen.queryByTestId('entity-confidence-tooltip-0')).not.toBeInTheDocument();
  });

  it('shows correct confidence for FUZZY_MATCH entity', () => {
    renderCaseDetail();
    fireEvent.mouseEnter(screen.getByTestId('entity-badge-1'));

    const tooltip = screen.getByTestId('entity-confidence-tooltip-1');
    expect(tooltip).toHaveTextContent('Confidence: 78%');
    expect(tooltip).toHaveTextContent('Validation: FUZZY_MATCH');
  });

  it('tooltip has role="tooltip" attribute', () => {
    renderCaseDetail();
    fireEvent.mouseEnter(screen.getByTestId('entity-badge-0'));

    const tooltip = screen.getByTestId('entity-confidence-tooltip-0');
    expect(tooltip).toHaveAttribute('role', 'tooltip');
  });
});
