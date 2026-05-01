import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import DpoConsole from '../pages/compliance/DpoConsole';

vi.mock('../api/client', () => ({
  apiGet: vi.fn().mockResolvedValue({ data: [] }),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DpoConsole />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DpoConsole Page (FR-120.A5)', () => {
  it('should render the page heading', () => {
    renderPage();
    expect(screen.getByText('DPO Console')).toBeDefined();
  });

  it('should render three tabs', () => {
    renderPage();
    expect(screen.getByText('DSR Requests')).toBeDefined();
    expect(screen.getByText('Consent Management')).toBeDefined();
    expect(screen.getByText('Evidence Generation')).toBeDefined();
  });

  it('should show DSR table by default', () => {
    renderPage();
    expect(screen.getByTestId('dsr-panel')).toBeDefined();
    expect(screen.getByText('Data Subject Requests')).toBeDefined();
  });

  it('should switch to consent tab on click', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('tab-consent'));
    expect(screen.getByTestId('consent-panel')).toBeDefined();
    expect(screen.getAllByText('Consent Management').length).toBeGreaterThanOrEqual(1);
  });

  it('should switch to evidence tab on click', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('tab-evidence'));
    expect(screen.getByTestId('evidence-panel')).toBeDefined();
    expect(screen.getByText('Generate Regulatory Evidence Pack')).toBeDefined();
  });
});
