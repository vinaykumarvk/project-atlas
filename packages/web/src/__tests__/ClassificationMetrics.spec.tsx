import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock the api client
vi.mock('../api/client', () => ({
  apiGet: vi.fn().mockResolvedValue({ data: [] }),
  apiPost: vi.fn(),
}));

vi.mock('../auth', () => ({
  useAuth: () => ({ user: { id: 'test', email: 'test@test.com', roles: ['SYS_ADMIN'] }, isAuthenticated: true, isLoading: false, accessToken: null, login: vi.fn(), logout: vi.fn(), refreshToken: vi.fn() }),
}));

function withEnv(key: string, value: string, fn: () => void) {
  const original = import.meta.env[key];
  import.meta.env[key] = value;
  try {
    fn();
  } finally {
    if (original === undefined) {
      delete import.meta.env[key];
    } else {
      import.meta.env[key] = original;
    }
  }
}

function renderDashboard(DashboardPage: () => JSX.Element) {
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

let DashboardPage: () => JSX.Element;

beforeEach(async () => {
  vi.restoreAllMocks();
  mockNavigate.mockClear();
  const mod = await import('../pages/Dashboard');
  DashboardPage = mod.default;
});

describe('Classification Metrics Dashboard Panels (FR-161)', () => {
  it('should render Entity F1 Metrics panel', () => {
    withEnv('VITE_DEMO_MODE', 'true', () => {
      renderDashboard(DashboardPage);
      expect(screen.getByTestId('entity-f1-metrics')).toBeDefined();
      expect(screen.getByText('Entity F1 Metrics')).toBeDefined();
    });
  });

  it('should render entity F1 table with demo data', () => {
    withEnv('VITE_DEMO_MODE', 'true', () => {
      renderDashboard(DashboardPage);
      expect(screen.getByText('property_city')).toBeDefined();
      expect(screen.getByText('loan_account_no')).toBeDefined();
    });
  });

  it('should render Override Rate panel', () => {
    withEnv('VITE_DEMO_MODE', 'true', () => {
      renderDashboard(DashboardPage);
      const panel = screen.getByTestId('override-rate');
      expect(panel).toBeDefined();
      // "Override Rate" appears as both panel title and card title
      expect(screen.getAllByText('Override Rate').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('should render override rate value', () => {
    withEnv('VITE_DEMO_MODE', 'true', () => {
      renderDashboard(DashboardPage);
      expect(screen.getByText('2.67%')).toBeDefined();
    });
  });

  it('should render Low-Confidence Volume panel', () => {
    withEnv('VITE_DEMO_MODE', 'true', () => {
      renderDashboard(DashboardPage);
      expect(screen.getByTestId('low-confidence-volume')).toBeDefined();
      expect(screen.getByText('Low-Confidence Volume')).toBeDefined();
    });
  });

  it('should render low-confidence weekly data', () => {
    withEnv('VITE_DEMO_MODE', 'true', () => {
      renderDashboard(DashboardPage);
      const panel = screen.getByTestId('low-confidence-volume');
      // "2026-W13" may appear in both accuracy trend and low-confidence tables
      expect(screen.getAllByText('2026-W13').length).toBeGreaterThanOrEqual(1);
      // Verify the low-confidence panel specifically contains week data
      expect(panel).toHaveTextContent('2026-W13');
    });
  });
});
