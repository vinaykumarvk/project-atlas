import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import RegulatoryEvidence from '../pages/compliance/RegulatoryEvidence';

vi.mock('../config/flags', () => ({
  isDemoMode: () => true,
  isDebugMode: () => false,
  isAiAssistEnabled: () => false,
}));

vi.mock('../api/client', () => ({
  apiGet: vi.fn().mockResolvedValue({ data: {} }),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RegulatoryEvidence />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RegulatoryEvidence Page (FR-165)', () => {
  it('should render the page heading', () => {
    renderPage();
    expect(screen.getByText('Regulatory Evidence Center')).toBeDefined();
  });

  it('should render date range inputs', () => {
    renderPage();
    expect(screen.getByText(/From:/)).toBeDefined();
    expect(screen.getByText(/To:/)).toBeDefined();
  });

  it('should render expandable sections', () => {
    renderPage();
    expect(screen.getByTestId('evidence-audit')).toBeDefined();
    expect(screen.getByTestId('evidence-consent')).toBeDefined();
    expect(screen.getByTestId('evidence-dsr')).toBeDefined();
  });

  it('should expand a section on click', () => {
    renderPage();
    const auditHeader = screen.getByText('Audit Log Summary');
    fireEvent.click(auditHeader);
    expect(screen.getByText(/Total Entries/)).toBeDefined();
  });

  it('should render ASVS section', () => {
    renderPage();
    expect(screen.getByTestId('evidence-asvs')).toBeDefined();
  });

  it('should render model risk section', () => {
    renderPage();
    expect(screen.getByTestId('evidence-model-risk')).toBeDefined();
  });
});
