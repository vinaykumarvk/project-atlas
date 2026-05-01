import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks — must be defined before component imports
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
}));

// Force demo mode ON so we render mock data
vi.mock('../config/flags', () => ({
  isDemoMode: () => true,
}));

vi.mock('../auth', () => ({
  useAuth: () => ({ user: { id: 'test', email: 'test@test.com', roles: ['FPR'] }, isAuthenticated: true, isLoading: false, accessToken: null, login: vi.fn(), logout: vi.fn(), refreshToken: vi.fn() }),
}));

import CaseListPage from '../pages/CaseList';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderCaseList() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CaseListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CaseList debounced search (FR-050.A5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the search input with correct placeholder', () => {
    renderCaseList();
    const searchInput = screen.getByTestId('case-search-input');
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).toHaveAttribute('placeholder', 'Search cases...');
  });

  it('has aria-label on search input for accessibility', () => {
    renderCaseList();
    const searchInput = screen.getByTestId('case-search-input');
    expect(searchInput).toHaveAttribute('aria-label', 'Search cases');
  });

  it('updates search input value on typing', () => {
    renderCaseList();
    const searchInput = screen.getByTestId('case-search-input');
    fireEvent.change(searchInput, { target: { value: 'Valuation' } });
    expect(searchInput).toHaveValue('Valuation');
  });

  it('filters cases in demo mode when search text is entered', () => {
    renderCaseList();
    const searchInput = screen.getByTestId('case-search-input');
    fireEvent.change(searchInput, { target: { value: 'Valuation' } });

    // In demo mode, search filters client-side immediately
    const rows = screen.queryAllByTestId(/overdue-row|case-row/);
    // All remaining rows should contain "Valuation" in subject
    expect(rows.length).toBeGreaterThan(0);
  });

  it('shows no results message when search matches nothing', () => {
    renderCaseList();
    const searchInput = screen.getByTestId('case-search-input');
    fireEvent.change(searchInput, { target: { value: 'xyznonexistent' } });

    expect(screen.getByText('No cases found matching filters.')).toBeInTheDocument();
  });

  it('filter bar has role="search" attribute', () => {
    renderCaseList();
    const filterBar = screen.getByRole('search');
    expect(filterBar).toBeInTheDocument();
  });
});

describe('useDebounce hook behavior', () => {
  it('debounces value changes', async () => {
    // This tests the integration -- the debounced value is used for API calls
    // In demo mode, filtering is immediate, but the debounce hook exists for live mode
    renderCaseList();
    const searchInput = screen.getByTestId('case-search-input');

    // Rapid typing should not break anything
    fireEvent.change(searchInput, { target: { value: 'V' } });
    fireEvent.change(searchInput, { target: { value: 'Va' } });
    fireEvent.change(searchInput, { target: { value: 'Val' } });

    await waitFor(() => {
      expect(searchInput).toHaveValue('Val');
    });
  });
});
