import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

describe('CaseDetail three-pane flex layout (FR-051.A1)', () => {
  it('renders the three-pane layout container', () => {
    renderCaseDetail();
    expect(screen.getByTestId('three-pane-layout')).toBeInTheDocument();
  });

  it('renders a left pane', () => {
    renderCaseDetail();
    const leftPane = screen.getByTestId('left-pane');
    expect(leftPane).toBeInTheDocument();
  });

  it('renders a center pane', () => {
    renderCaseDetail();
    const centerPane = screen.getByTestId('center-pane');
    expect(centerPane).toBeInTheDocument();
  });

  it('renders a right pane', () => {
    renderCaseDetail();
    const rightPane = screen.getByTestId('right-pane');
    expect(rightPane).toBeInTheDocument();
  });

  it('left pane has sidebar navigation role', () => {
    renderCaseDetail();
    const leftPane = screen.getByTestId('left-pane');
    expect(leftPane).toHaveAttribute('aria-label', 'Case navigation sidebar');
  });

  it('right pane has activity timeline role', () => {
    renderCaseDetail();
    const rightPane = screen.getByTestId('right-pane');
    expect(rightPane).toHaveAttribute('aria-label', 'Activity timeline');
  });

  it('left pane displays related cases', () => {
    renderCaseDetail();
    const leftPane = screen.getByTestId('left-pane');
    expect(leftPane).toHaveTextContent('Related Cases');
    expect(leftPane).toHaveTextContent('CASE-1039');
    expect(leftPane).toHaveTextContent('CASE-1035');
  });

  it('right pane displays activity timeline', () => {
    renderCaseDetail();
    const rightPane = screen.getByTestId('right-pane');
    expect(rightPane).toHaveTextContent('Activity Timeline');
    expect(rightPane).toHaveTextContent('Case Created');
  });

  it('right pane displays linked cases section', () => {
    renderCaseDetail();
    const rightPane = screen.getByTestId('right-pane');
    expect(rightPane).toHaveTextContent('Linked Cases');
    expect(rightPane).toHaveTextContent('CASE-1039');
  });

  it('center pane contains the main case content', () => {
    renderCaseDetail();
    const centerPane = screen.getByTestId('center-pane');
    expect(centerPane).toHaveTextContent('CASE-1042');
    expect(centerPane).toHaveTextContent('Overview');
  });

  it('three-pane layout uses flexbox via Tailwind class', () => {
    renderCaseDetail();
    const layout = screen.getByTestId('three-pane-layout');
    expect(layout.className).toContain('flex');
  });
});
