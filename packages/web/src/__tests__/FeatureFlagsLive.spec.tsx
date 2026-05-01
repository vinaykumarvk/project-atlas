import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Mock API client
// ---------------------------------------------------------------------------
const mockApiGet = vi.fn();
const mockApiPatch = vi.fn();

vi.mock('../api/client', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPatch: (...args: unknown[]) => mockApiPatch(...args),
}));

import { FeatureFlags } from '../pages/admin/feature-flags/FeatureFlags';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderFeatureFlags() {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <FeatureFlags />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FeatureFlags with live API data (FR-151.A1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state while fetching flags', () => {
    mockApiGet.mockReturnValue(new Promise(() => {})); // never resolves
    renderFeatureFlags();
    expect(screen.getByTestId('flags-loading')).toBeInTheDocument();
    expect(screen.getByText('Loading feature flags...')).toBeInTheDocument();
  });

  it('renders flags from API when fetch succeeds', async () => {
    mockApiGet.mockResolvedValue({
      llm_classification: { enabled: true, rolloutPercent: 100, description: 'LLM classification' },
      dark_mode: { enabled: false, rolloutPercent: 50, description: 'Dark mode toggle' },
    });

    renderFeatureFlags();

    await waitFor(() => {
      expect(screen.getByTestId('feature-flags')).toBeInTheDocument();
    });

    expect(screen.getByText('llm_classification')).toBeInTheDocument();
    expect(screen.getByText('dark_mode')).toBeInTheDocument();
  });

  it('falls back to mock data when API fails', async () => {
    mockApiGet.mockRejectedValue(new Error('API unavailable'));
    renderFeatureFlags();

    await waitFor(() => {
      expect(screen.getByTestId('feature-flags')).toBeInTheDocument();
    });

    // Should show fallback mock flags
    expect(screen.getByText('llm_classification')).toBeInTheDocument();
    expect(screen.getByTestId('flags-api-fallback')).toBeInTheDocument();
  });

  it('shows rollout percentage for each flag', async () => {
    mockApiGet.mockResolvedValue({
      suggested_replies: { enabled: true, rolloutPercent: 50, description: 'Suggestions' },
    });

    renderFeatureFlags();

    await waitFor(() => {
      expect(screen.getByTestId('rollout-suggested_replies')).toBeInTheDocument();
    });
    expect(screen.getByTestId('rollout-suggested_replies')).toHaveTextContent('Rollout: 50%');
  });

  it('calls API to toggle a flag', async () => {
    mockApiGet.mockResolvedValue({
      test_flag: { enabled: false, rolloutPercent: 100, description: 'Test flag' },
    });
    mockApiPatch.mockResolvedValue({ name: 'test_flag', enabled: true, rolloutPercent: 100 });

    renderFeatureFlags();

    await waitFor(() => {
      expect(screen.getByTestId('toggle-test_flag')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('toggle-test_flag'));

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith(
        '/admin/feature-flags/test_flag',
        { enabled: true, rolloutPercent: 100 },
      );
    });
  });

  it('renders enabled/disabled count in header', async () => {
    mockApiGet.mockResolvedValue({
      flag_a: { enabled: true, rolloutPercent: 100, description: 'A' },
      flag_b: { enabled: false, rolloutPercent: 0, description: 'B' },
      flag_c: { enabled: true, rolloutPercent: 100, description: 'C' },
    });

    renderFeatureFlags();

    await waitFor(() => {
      expect(screen.getByText('2 / 3 enabled')).toBeInTheDocument();
    });
  });

  it('calls apiGet with correct endpoint', async () => {
    mockApiGet.mockResolvedValue({});
    renderFeatureFlags();

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/admin/feature-flags');
    });
  });
});
