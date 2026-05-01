import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------
// Mock useNavigate
// ---------------------------------------------------------------
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

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

// ---------------------------------------------------------------
// Tests
// ---------------------------------------------------------------

let DashboardPage: () => JSX.Element;

beforeEach(async () => {
  vi.restoreAllMocks();
  mockNavigate.mockClear();
  const mod = await import('../pages/Dashboard');
  DashboardPage = mod.default;
});

describe('Dashboard At-Risk Predictions (FR-062.A3)', () => {
  it('renders At-Risk Predictions section in demo mode', () => {
    withEnv('VITE_DEMO_MODE', 'true', () => {
      renderWithProviders(<DashboardPage />);

      expect(screen.getByText('At-Risk Predictions')).toBeInTheDocument();
      expect(screen.getByTestId('at-risk-predictions')).toBeInTheDocument();
    });
  });

  it('shows case IDs in at-risk table', () => {
    withEnv('VITE_DEMO_MODE', 'true', () => {
      renderWithProviders(<DashboardPage />);

      expect(screen.getByText('ATL-2026-001042')).toBeInTheDocument();
      expect(screen.getByText('ATL-2026-001038')).toBeInTheDocument();
    });
  });

  it('shows breach probability as percentage', () => {
    withEnv('VITE_DEMO_MODE', 'true', () => {
      renderWithProviders(<DashboardPage />);

      expect(screen.getByText('92%')).toBeInTheDocument();
      expect(screen.getByText('78%')).toBeInTheDocument();
    });
  });

  it('shows risk factors for each prediction', () => {
    withEnv('VITE_DEMO_MODE', 'true', () => {
      renderWithProviders(<DashboardPage />);

      // The first case has all three risk factors
      expect(
        screen.getByText('HIGH_TIME_CONSUMED, CRITICAL_PRIORITY, HIGH_WORKLOAD'),
      ).toBeInTheDocument();
    });
  });

  it('renders table headers for at-risk section', () => {
    withEnv('VITE_DEMO_MODE', 'true', () => {
      renderWithProviders(<DashboardPage />);

      const section = screen.getByTestId('at-risk-predictions');
      expect(section).toHaveTextContent('Case ID');
      expect(section).toHaveTextContent('Breach Probability');
      expect(section).toHaveTextContent('Risk Factors');
    });
  });
});
