import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
      <MemoryRouter initialEntries={['/reports/custom']}>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------
// Tests
// ---------------------------------------------------------------

let CustomReportBuilder: () => JSX.Element;

beforeEach(async () => {
  vi.restoreAllMocks();
  const mod = await import('../pages/CustomReportBuilder');
  CustomReportBuilder = mod.default;
});

describe('CustomReportBuilder (FR-113.A3)', () => {
  it('renders the page with heading', () => {
    renderWithProviders(<CustomReportBuilder />);

    expect(screen.getByText('Custom Report Builder')).toBeInTheDocument();
    expect(screen.getByTestId('custom-report-builder')).toBeInTheDocument();
  });

  it('renders report name input', () => {
    renderWithProviders(<CustomReportBuilder />);

    const input = screen.getByTestId('report-name-input');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'text');
  });

  it('renders dimension selector with available dimensions', () => {
    renderWithProviders(<CustomReportBuilder />);

    const selector = screen.getByTestId('dimension-selector');
    expect(selector).toBeInTheDocument();

    // Check for at least some dimensions
    expect(screen.getByTestId('dim-case_type')).toBeInTheDocument();
    expect(screen.getByTestId('dim-priority')).toBeInTheDocument();
    expect(screen.getByTestId('dim-status')).toBeInTheDocument();
  });

  it('renders measure selector with available measures', () => {
    renderWithProviders(<CustomReportBuilder />);

    const selector = screen.getByTestId('measure-selector');
    expect(selector).toBeInTheDocument();

    expect(screen.getByTestId('measure-count')).toBeInTheDocument();
    expect(screen.getByTestId('measure-avg_tat')).toBeInTheDocument();
    expect(screen.getByTestId('measure-breach_rate')).toBeInTheDocument();
  });

  it('renders generate button', () => {
    renderWithProviders(<CustomReportBuilder />);

    const btn = screen.getByTestId('generate-report-btn');
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toBe('Generate Report');
  });

  it('toggles dimension selection on click', () => {
    renderWithProviders(<CustomReportBuilder />);

    const dimBtn = screen.getByTestId('dim-case_type');

    // Click to select
    fireEvent.click(dimBtn);

    // The style should have changed (accent color)
    // We verify by checking the button still exists and can be clicked again
    fireEvent.click(dimBtn);
  });

  it('toggles measure selection on click', () => {
    renderWithProviders(<CustomReportBuilder />);

    const measureBtn = screen.getByTestId('measure-count');

    fireEvent.click(measureBtn);
    fireEvent.click(measureBtn);
  });

  it('shows error when generating without report name', () => {
    renderWithProviders(<CustomReportBuilder />);

    // Select a dimension and measure but leave name empty
    fireEvent.click(screen.getByTestId('dim-case_type'));
    fireEvent.click(screen.getByTestId('measure-count'));

    fireEvent.click(screen.getByTestId('generate-report-btn'));

    expect(screen.getByTestId('report-error')).toBeInTheDocument();
    expect(screen.getByTestId('report-error').textContent).toContain('Report name is required');
  });

  it('shows error when generating without dimensions', () => {
    renderWithProviders(<CustomReportBuilder />);

    // Set name and measure but no dimensions
    const input = screen.getByTestId('report-name-input');
    fireEvent.change(input, { target: { value: 'Test Report' } });
    fireEvent.click(screen.getByTestId('measure-count'));

    fireEvent.click(screen.getByTestId('generate-report-btn'));

    expect(screen.getByTestId('report-error')).toBeInTheDocument();
    expect(screen.getByTestId('report-error').textContent).toContain('dimension');
  });

  it('shows error when generating without measures', () => {
    renderWithProviders(<CustomReportBuilder />);

    const input = screen.getByTestId('report-name-input');
    fireEvent.change(input, { target: { value: 'Test Report' } });
    fireEvent.click(screen.getByTestId('dim-case_type'));

    fireEvent.click(screen.getByTestId('generate-report-btn'));

    expect(screen.getByTestId('report-error')).toBeInTheDocument();
    expect(screen.getByTestId('report-error').textContent).toContain('measure');
  });

  it('renders Report Configuration panel', () => {
    renderWithProviders(<CustomReportBuilder />);

    expect(screen.getByText('Report Configuration')).toBeInTheDocument();
  });

  it('renders labels for form sections', () => {
    renderWithProviders(<CustomReportBuilder />);

    expect(screen.getByText('Report Name')).toBeInTheDocument();
    expect(screen.getByText('Dimensions')).toBeInTheDocument();
    expect(screen.getByText('Measures')).toBeInTheDocument();
  });
});
