import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Mock API client
// ---------------------------------------------------------------------------
const mockApiGet = vi.fn();

vi.mock('../api/client', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
}));

import { HealthDashboard } from '../pages/admin/health/HealthDashboard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderHealthDashboard() {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <HealthDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HealthDashboard with live data (FR-153.A1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    mockApiGet.mockReturnValue(new Promise(() => {})); // never resolves
    renderHealthDashboard();
    expect(screen.getByTestId('health-loading')).toBeInTheDocument();
    expect(screen.getByText('Loading health metrics...')).toBeInTheDocument();
  });

  it('shows error state when API fails', async () => {
    mockApiGet.mockRejectedValue(new Error('Network error'));
    renderHealthDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('health-error')).toBeInTheDocument();
    });
    expect(screen.getByText(/Failed to load health data/)).toBeInTheDocument();
    expect(screen.getByText(/Network error/)).toBeInTheDocument();
  });

  it('renders live data when API succeeds', async () => {
    mockApiGet.mockResolvedValue({
      metrics: [
        { name: 'API Server', status: 'healthy', value: '99.99%', detail: 'Uptime last 24h' },
        { name: 'Database', status: 'healthy', value: '8ms', detail: 'Avg latency' },
      ],
      queues: [
        { name: 'email-ingest', pending: 0, processing: 1, failed: 0 },
      ],
      errors: [
        { time: '12:00:00', source: 'test', message: 'Test error message' },
      ],
      lastUpdated: '2 seconds ago',
    });

    renderHealthDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('health-dashboard')).toBeInTheDocument();
    });

    expect(screen.getByText('99.99%')).toBeInTheDocument();
    expect(screen.getByText('8ms')).toBeInTheDocument();
    expect(screen.getByText(/2 seconds ago/)).toBeInTheDocument();
  });

  it('calls apiGet with correct endpoint', async () => {
    mockApiGet.mockResolvedValue({
      metrics: [],
      queues: [],
      errors: [],
      lastUpdated: 'now',
    });

    renderHealthDashboard();

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/health/detailed');
    });
  });

  it('renders queue status table with live data', async () => {
    mockApiGet.mockResolvedValue({
      metrics: [],
      queues: [
        { name: 'live-queue', pending: 10, processing: 5, failed: 2 },
      ],
      errors: [],
      lastUpdated: 'now',
    });

    renderHealthDashboard();

    await waitFor(() => {
      expect(screen.getByText('live-queue')).toBeInTheDocument();
    });
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('renders error log with live data', async () => {
    mockApiGet.mockResolvedValue({
      metrics: [],
      queues: [],
      errors: [
        { time: '14:30:00', source: 'api', message: 'Custom live error' },
      ],
      lastUpdated: 'now',
    });

    renderHealthDashboard();

    await waitFor(() => {
      expect(screen.getByText('Custom live error')).toBeInTheDocument();
    });
  });

  it('renders "System Health" heading', async () => {
    mockApiGet.mockResolvedValue({
      metrics: [],
      queues: [],
      errors: [],
      lastUpdated: 'now',
    });

    renderHealthDashboard();

    await waitFor(() => {
      expect(screen.getByText('System Health')).toBeInTheDocument();
    });
  });
});
