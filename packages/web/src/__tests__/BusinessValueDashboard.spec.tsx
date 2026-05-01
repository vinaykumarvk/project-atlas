import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from '../pages/Dashboard';

vi.mock('../config/flags', () => ({
  isDemoMode: () => true,
  isDebugMode: () => false,
  isAiAssistEnabled: () => false,
}));

vi.mock('../api/client', () => ({
  apiGet: vi.fn().mockResolvedValue({ data: [] }),
  apiPost: vi.fn(),
}));

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Business Value Dashboard (FR-158)', () => {
  it('should render Business Value Command Center panel', () => {
    renderDashboard();
    expect(screen.getByTestId('business-value')).toBeDefined();
    expect(screen.getByText('Business Value Command Center')).toBeDefined();
  });

  it('should render disbursal blockers table', () => {
    renderDashboard();
    expect(screen.getByText('Disbursal Blockers')).toBeDefined();
    expect(screen.getByText('VALUATION_PENDING')).toBeDefined();
  });

  it('should render vendor capacity section', () => {
    renderDashboard();
    expect(screen.getByText('Vendor Capacity')).toBeDefined();
    // PropertyCheck Ltd appears in both the extended dashboard and the business value panel
    expect(screen.getAllByText('PropertyCheck Ltd').length).toBeGreaterThanOrEqual(1);
  });

  it('should render SLA leakage by region', () => {
    renderDashboard();
    expect(screen.getByText('SLA Compliance by Region')).toBeDefined();
  });

  it('should display vendor utilization percentages', () => {
    renderDashboard();
    expect(screen.getByText('72%')).toBeDefined();
  });
});
