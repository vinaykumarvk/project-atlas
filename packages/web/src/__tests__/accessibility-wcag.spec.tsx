import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks for CaseList
// ---------------------------------------------------------------------------
vi.mock('../hooks/useCases', () => ({
  useCases: () => ({
    data: null,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
  }),
  useBulkAction: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useCase: () => ({
    data: null,
    isLoading: false,
    isError: false,
    error: null,
  }),
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
}));

vi.mock('../hooks/useDashboard', () => ({
  useDashboardMetrics: () => ({ data: null, isLoading: false, isError: false }),
  useExtendedDashboard: () => ({ data: null }),
  useComplianceByDimension: () => ({ data: null }),
  useTrendData: () => ({ data: null }),
}));

vi.mock('../hooks/useNotifications', () => ({
  useNotifications: () => ({ permission: 'default', notify: vi.fn() }),
}));

vi.mock('../auth', () => ({
  useAuth: () => ({ user: { id: 'test', email: 'test@test.com', roles: ['FPR'] }, isAuthenticated: true, isLoading: false, accessToken: null, login: vi.fn(), logout: vi.fn(), refreshToken: vi.fn() }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import CaseListPage from '../pages/CaseList';
import CaseDetailPage from '../pages/CaseDetail';
import DashboardPage from '../pages/Dashboard';
import { Layout } from '../components/Layout';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderCaseList() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <CaseListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderCaseDetail() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={['/cases/1']}>
        <Routes>
          <Route path="/cases/:caseId" element={<CaseDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderDashboard() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderLayout() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WCAG 2.1 AA - Skip to Main Content (FR-057.A2)', () => {
  it('Layout renders a skip-to-main-content link', () => {
    renderLayout();
    const skipLink = screen.getByTestId('skip-to-main');
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveTextContent('Skip to main content');
    expect(skipLink).toHaveAttribute('href', '#main-content');
  });

  it('Layout has a main content area with id="main-content"', () => {
    renderLayout();
    const mainContent = document.getElementById('main-content');
    expect(mainContent).not.toBeNull();
  });

  it('main element has role="main"', () => {
    renderLayout();
    const mainContent = document.getElementById('main-content');
    expect(mainContent).toHaveAttribute('role', 'main');
  });

  it('nav element has role="navigation"', () => {
    renderLayout();
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
  });
});

describe('WCAG 2.1 AA - CaseList Accessibility', () => {
  it('search input has aria-label', () => {
    renderCaseList();
    const searchInput = screen.getByTestId('case-search-input');
    expect(searchInput).toHaveAttribute('aria-label', 'Search cases');
  });

  it('filter bar has role="search"', () => {
    renderCaseList();
    const searchRegion = screen.getByRole('search');
    expect(searchRegion).toBeInTheDocument();
  });

  it('table region has aria-live for dynamic updates', () => {
    renderCaseList();
    const tableRegion = screen.getByRole('region', { name: /cases table/i });
    expect(tableRegion).toHaveAttribute('aria-live', 'polite');
  });

  it('select-all checkbox has aria-label', () => {
    renderCaseList();
    const selectAll = screen.getByLabelText('Select all cases on this page');
    expect(selectAll).toBeInTheDocument();
  });
});

describe('WCAG 2.1 AA - CaseDetail Accessibility', () => {
  it('three-pane layout renders accessible landmarks', () => {
    renderCaseDetail();
    const leftPane = screen.getByTestId('left-pane');
    expect(leftPane).toHaveAttribute('aria-label', 'Case navigation sidebar');

    const rightPane = screen.getByTestId('right-pane');
    expect(rightPane).toHaveAttribute('aria-label', 'Activity timeline');
  });

  it('center pane has role="main"', () => {
    renderCaseDetail();
    const centerPane = screen.getByTestId('center-pane');
    expect(centerPane).toHaveAttribute('role', 'main');
  });

  it('sidebar items are keyboard navigable', () => {
    renderCaseDetail();
    const leftPane = screen.getByTestId('left-pane');
    const buttons = leftPane.querySelectorAll('[role="button"]');
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((btn) => {
      expect(btn).toHaveAttribute('tabindex', '0');
    });
  });
});

describe('WCAG 2.1 AA - Dashboard Accessibility', () => {
  it('dashboard has role="region"', () => {
    renderDashboard();
    const dashboard = screen.getByRole('region', { name: /dashboard/i });
    expect(dashboard).toBeInTheDocument();
  });

  it('summary cards have role="list"', () => {
    renderDashboard();
    const cardsList = screen.getByRole('list', { name: /summary metrics/i });
    expect(cardsList).toBeInTheDocument();
  });
});
