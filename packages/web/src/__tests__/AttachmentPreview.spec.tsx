import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock('../hooks/useCases', () => ({
  useCase: () => ({
    data: null,
    isLoading: false,
    isError: false,
    error: null,
  }),
  useCases: () => ({
    data: null,
    isLoading: false,
    isError: false,
    error: null,
  }),
  useBulkAction: () => ({ mutate: vi.fn(), isPending: false }),
  useTransitionStatus: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useAddNote: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  usePauseSla: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useResumeSla: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useUpdateCase: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));

vi.mock('../hooks/useTriageQueue', () => ({
  useConfirmTriage: () => ({ mutate: vi.fn(), isPending: false }),
  useCorrectTriage: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));

vi.mock('../config/flags', () => ({
  isDemoMode: () => true,
}));

vi.mock('../api/client', () => ({
  apiGet: vi.fn().mockRejectedValue(new Error('demo mode')),
  apiPost: vi.fn().mockRejectedValue(new Error('demo mode')),
}));

vi.mock('../auth', () => ({
  useAuth: () => ({ user: { id: 'test', email: 'test@test.com', roles: ['SYS_ADMIN'] }, isAuthenticated: true, isLoading: false, accessToken: null, login: vi.fn(), logout: vi.fn(), refreshToken: vi.fn() }),
}));

import CaseDetailPage from '../pages/CaseDetail';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderCaseDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/cases/1']}>
        <Routes>
          <Route path="/cases/:caseId" element={<CaseDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Radix Tabs triggers require mouseDown + click in jsdom (no PointerEvent). */
function clickTab(name: string) {
  const trigger = screen.getByRole('tab', { name });
  fireEvent.mouseDown(trigger, { button: 0 });
  fireEvent.click(trigger, { button: 0 });
}

/** Open the Attachments tab and click the preview button for attachment 2. */
async function openPreviewModal() {
  clickTab('Attachments');
  const previewBtn = screen.getByTestId('preview-btn-2');
  fireEvent.click(previewBtn);
  await waitFor(() => {
    expect(screen.getByTestId('attachment-preview-modal')).toBeInTheDocument();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Attachment Preview Modal (FR-051.A3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not show preview modal by default', () => {
    renderCaseDetail();
    expect(screen.queryByTestId('attachment-preview-modal')).not.toBeInTheDocument();
  });

  it('shows preview buttons in attachment list', () => {
    renderCaseDetail();
    // Navigate to Attachments tab (Radix Tabs need mouseDown)
    clickTab('Attachments');

    // Attachment 2 (PDF) should have a preview button
    expect(screen.getByTestId('preview-btn-2')).toBeInTheDocument();
  });

  it('opens preview modal when preview button is clicked for PDF', async () => {
    renderCaseDetail();
    clickTab('Attachments');

    const previewBtn = screen.getByTestId('preview-btn-2');
    fireEvent.click(previewBtn);

    await waitFor(() => {
      expect(screen.getByTestId('attachment-preview-modal')).toBeInTheDocument();
    });
  });

  it('shows filename in modal header', async () => {
    renderCaseDetail();
    await openPreviewModal();

    expect(screen.getByTestId('attachment-preview-modal')).toHaveTextContent('property-title-search.pdf');
  });

  it('renders iframe for PDF attachments', async () => {
    renderCaseDetail();
    await openPreviewModal();

    expect(screen.getByTestId('attachment-preview-pdf')).toBeInTheDocument();
  });

  it('shows close button in modal', async () => {
    renderCaseDetail();
    await openPreviewModal();

    // shadcn Dialog renders a close button with sr-only "Close" text
    const modal = screen.getByTestId('attachment-preview-modal');
    const closeBtn = modal.querySelector('button');
    expect(closeBtn).toBeInTheDocument();
  });

  it('closes modal when close button is clicked', async () => {
    renderCaseDetail();
    await openPreviewModal();

    // shadcn Dialog close button is inside DialogContent
    const modal = screen.getByTestId('attachment-preview-modal');
    const closeBtn = modal.querySelector('button')!;
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('attachment-preview-modal')).not.toBeInTheDocument();
    });
  });

  it('closes modal when Escape key is pressed', async () => {
    renderCaseDetail();
    await openPreviewModal();

    // Radix Dialog closes on Escape key
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByTestId('attachment-preview-modal')).not.toBeInTheDocument();
    });
  });

  it('modal has correct aria attributes', async () => {
    renderCaseDetail();
    await openPreviewModal();

    const modal = screen.getByTestId('attachment-preview-modal');
    expect(modal).toHaveAttribute('role', 'dialog');
  });
});
