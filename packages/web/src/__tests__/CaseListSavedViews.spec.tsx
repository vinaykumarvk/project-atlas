import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
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

function renderCaseList(initialEntries = ['/cases']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <CaseListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CaseList filter URL serialization (FR-050.A3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the saved views bar', () => {
    renderCaseList();
    expect(screen.getByTestId('saved-views-bar')).toBeInTheDocument();
  });

  it('renders the Save View button', () => {
    renderCaseList();
    expect(screen.getByTestId('save-view-btn')).toBeInTheDocument();
    expect(screen.getByTestId('save-view-btn')).toHaveTextContent('Save View');
  });

  it('does not show Load View dropdown when no views are saved', () => {
    renderCaseList();
    expect(screen.queryByTestId('load-view-select')).not.toBeInTheDocument();
  });

  it('saves a view to localStorage when Save View is clicked', () => {
    // Mock window.prompt to return a view name
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('My Test View');

    renderCaseList();

    // Set some filters first
    const searchInput = screen.getByTestId('case-search-input');
    fireEvent.change(searchInput, { target: { value: 'Valuation' } });

    // Click save view
    fireEvent.click(screen.getByTestId('save-view-btn'));

    expect(promptSpy).toHaveBeenCalledWith('Enter a name for this view:');

    // Check localStorage
    const stored = JSON.parse(localStorage.getItem('atlas_saved_views') || '[]');
    expect(stored.length).toBe(1);
    expect(stored[0].name).toBe('My Test View');
    expect(stored[0].filters.search).toBe('Valuation');

    promptSpy.mockRestore();
  });

  it('shows Load View dropdown after a view is saved', () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Saved View 1');

    renderCaseList();

    fireEvent.click(screen.getByTestId('save-view-btn'));

    expect(screen.getByTestId('load-view-select')).toBeInTheDocument();

    promptSpy.mockRestore();
  });

  it('loads saved view when selected from dropdown', async () => {
    // Pre-populate localStorage with a saved view
    localStorage.setItem('atlas_saved_views', JSON.stringify([
      { name: 'P1 Only', filters: { priority: 'P1', search: 'Urgent' } },
    ]));

    renderCaseList();

    const loadSelect = screen.getByTestId('load-view-select');
    expect(loadSelect).toBeInTheDocument();

    // The Load View dropdown is now a Radix Select (shadcn/ui).
    // Click the trigger to open the popover, then select the option.
    fireEvent.click(loadSelect);

    // Radix renders options in a portal; find the option by role
    await waitFor(() => {
      const option = screen.getByRole('option', { name: 'P1 Only' });
      fireEvent.click(option);
    });

    // The search input should now have "Urgent"
    const searchInput = screen.getByTestId('case-search-input');
    expect(searchInput).toHaveValue('Urgent');
  });

  it('does not save view if prompt is cancelled', () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);

    renderCaseList();
    fireEvent.click(screen.getByTestId('save-view-btn'));

    const stored = JSON.parse(localStorage.getItem('atlas_saved_views') || '[]');
    expect(stored.length).toBe(0);

    promptSpy.mockRestore();
  });
});
