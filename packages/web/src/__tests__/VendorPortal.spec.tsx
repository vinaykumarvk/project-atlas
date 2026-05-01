import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mock API client
// ---------------------------------------------------------------------------
const mockApiGet = vi.fn();

vi.mock('../api/client', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
}));

import VendorPortalPage from '../pages/VendorPortal';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderVendorPortal() {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <VendorPortalPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VendorPortal (FR-156.A2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Vendor Portal heading', async () => {
    mockApiGet.mockRejectedValue(new Error('not connected'));
    renderVendorPortal();

    await waitFor(() => {
      expect(screen.getByText('Vendor Portal')).toBeInTheDocument();
    });
  });

  it('renders vendor-portal testid', async () => {
    mockApiGet.mockResolvedValue(null);
    renderVendorPortal();

    await waitFor(() => {
      expect(screen.getByTestId('vendor-portal')).toBeInTheDocument();
    });
  });

  it('shows case rows with fallback mock data when API returns no data', async () => {
    mockApiGet.mockResolvedValue(null);
    renderVendorPortal();

    await waitFor(() => {
      const rows = screen.getAllByTestId('vendor-case-row');
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  it('renders case numbers in the table', async () => {
    mockApiGet.mockResolvedValue(null);
    renderVendorPortal();

    await waitFor(() => {
      expect(screen.getByText('CASE-1042')).toBeInTheDocument();
      expect(screen.getByText('CASE-1038')).toBeInTheDocument();
    });
  });

  it('renders TAT Remaining column', async () => {
    mockApiGet.mockResolvedValue(null);
    renderVendorPortal();

    await waitFor(() => {
      expect(screen.getByText('TAT Remaining')).toBeInTheDocument();
      expect(screen.getByText('12h 30m')).toBeInTheDocument();
    });
  });

  it('renders live data when API succeeds', async () => {
    mockApiGet.mockResolvedValue({
      data: [
        { id: '100', caseNumber: 'CASE-9999', type: 'Live Valuation', status: 'IN_PROGRESS', priority: 'P1', tatRemaining: '6h 0m' },
      ],
      total: 1,
    });

    renderVendorPortal();

    await waitFor(() => {
      expect(screen.getByText('CASE-9999')).toBeInTheDocument();
    });
    const liveValuationElements = screen.getAllByText('Live Valuation');
    expect(liveValuationElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('6h 0m')).toBeInTheDocument();
  });

  it('shows total count in subtitle', async () => {
    mockApiGet.mockResolvedValue({
      data: [
        { id: '1', caseNumber: 'CASE-001', type: 'Test', status: 'NEW', priority: 'P2', tatRemaining: '1d' },
        { id: '2', caseNumber: 'CASE-002', type: 'Test', status: 'NEW', priority: 'P3', tatRemaining: '2d' },
      ],
      total: 2,
    });

    renderVendorPortal();

    await waitFor(() => {
      expect(screen.getByText(/2 total/)).toBeInTheDocument();
    });
  });

  it('calls apiGet with vendor_id query parameter', async () => {
    mockApiGet.mockResolvedValue({ data: [], total: 0 });
    renderVendorPortal();

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/cases', { vendor_id: 'vendor-001' });
    });
  });

  it('table has proper ARIA label', async () => {
    mockApiGet.mockResolvedValue(null);
    renderVendorPortal();

    await waitFor(() => {
      const table = screen.getByRole('table', { name: /vendor cases/i });
      expect(table).toBeInTheDocument();
    });
  });

  it('renders all expected column headers', async () => {
    mockApiGet.mockResolvedValue(null);
    renderVendorPortal();

    await waitFor(() => {
      expect(screen.getByText('Case #')).toBeInTheDocument();
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Priority')).toBeInTheDocument();
      expect(screen.getByText('TAT Remaining')).toBeInTheDocument();
    });
  });
});
