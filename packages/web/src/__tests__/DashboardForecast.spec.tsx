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

describe('Dashboard Workload Forecast (FR-112.A3)', () => {
  it('renders Workload Forecast section in demo mode', () => {
    withEnv('VITE_DEMO_MODE', 'true', () => {
      renderWithProviders(<DashboardPage />);

      expect(screen.getByText('Workload Forecast')).toBeInTheDocument();
      expect(screen.getByTestId('workload-forecast')).toBeInTheDocument();
    });
  });

  it('shows trend indicator', () => {
    withEnv('VITE_DEMO_MODE', 'true', () => {
      renderWithProviders(<DashboardPage />);

      const trendIndicator = screen.getByTestId('forecast-trend');
      expect(trendIndicator).toBeInTheDocument();
      expect(trendIndicator.textContent).toContain('Trend');
    });
  });

  it('shows current load in trend indicator', () => {
    withEnv('VITE_DEMO_MODE', 'true', () => {
      renderWithProviders(<DashboardPage />);

      const trendIndicator = screen.getByTestId('forecast-trend');
      expect(trendIndicator.textContent).toContain('Current: 18');
    });
  });

  it('renders forecast table headers', () => {
    withEnv('VITE_DEMO_MODE', 'true', () => {
      renderWithProviders(<DashboardPage />);

      const section = screen.getByTestId('workload-forecast');
      expect(section).toHaveTextContent('Predicted Volume');
      expect(section).toHaveTextContent('Confidence (Low-High)');
    });
  });

  it('renders forecast data points in the table', () => {
    withEnv('VITE_DEMO_MODE', 'true', () => {
      renderWithProviders(<DashboardPage />);

      const section = screen.getByTestId('workload-forecast');
      // The table should have 7 rows (7 forecast days)
      const tbody = section.querySelector('tbody');
      expect(tbody).not.toBeNull();
      const rows = tbody!.querySelectorAll('tr');
      expect(rows.length).toBe(7);
    });
  });

  it('applies correct color for INCREASING trend', () => {
    withEnv('VITE_DEMO_MODE', 'true', () => {
      renderWithProviders(<DashboardPage />);

      const trendIndicator = screen.getByTestId('forecast-trend');
      // INCREASING trend should be red (#dc2626)
      expect(trendIndicator.style.color).toBe('rgb(220, 38, 38)');
    });
  });
});
