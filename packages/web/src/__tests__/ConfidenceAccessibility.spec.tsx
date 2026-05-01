import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from '../App';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_USER = {
  id: 'user-1',
  email: 'test@atlas.dev',
  roles: ['admin'],
  region: 'AU',
};

function seedAuth() {
  localStorage.setItem('atlas_user', JSON.stringify(TEST_USER));
}

function renderApp(initialPath = '/') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests for FR-015.A6: Accessibility attributes on confidence chips
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('Confidence chip accessibility (FR-015.A6)', () => {
  it('renders confidence badges with aria-label on the Triage Queue page in demo mode', async () => {
    seedAuth();
    import.meta.env.VITE_DEMO_MODE = 'true';

    try {
      renderApp('/triage');

      await waitFor(
        () => {
          // Look for elements with aria-label containing "Confidence:"
          const badges = screen.getAllByRole('status');
          expect(badges.length).toBeGreaterThan(0);

          // Each badge should have an aria-label
          for (const badge of badges) {
            const ariaLabel = badge.getAttribute('aria-label');
            // Status badges may include non-confidence badges; filter for confidence ones
            if (ariaLabel && ariaLabel.startsWith('Confidence:')) {
              expect(ariaLabel).toMatch(/Confidence: (GREEN|AMBER|RED) \((high|medium|low)\)/);
            }
          }
        },
        { timeout: 5000 },
      );
    } finally {
      delete import.meta.env.VITE_DEMO_MODE;
    }
  });

  it('renders color-blind safety icons alongside confidence band text', async () => {
    seedAuth();
    import.meta.env.VITE_DEMO_MODE = 'true';

    try {
      renderApp('/triage');

      await waitFor(
        () => {
          // AMBER badges should contain warning icon (Unicode \u26A0)
          const badges = screen.getAllByRole('status');
          const confidenceBadges = badges.filter((b) => {
            const ariaLabel = b.getAttribute('aria-label');
            return ariaLabel && ariaLabel.startsWith('Confidence:');
          });
          expect(confidenceBadges.length).toBeGreaterThan(0);

          // Check that each badge contains an icon character
          for (const badge of confidenceBadges) {
            const text = badge.textContent || '';
            // Should contain one of: check mark, warning, or cross
            const hasIcon = text.includes('\u2714') || text.includes('\u26A0') || text.includes('\u2716');
            expect(hasIcon).toBe(true);
          }
        },
        { timeout: 5000 },
      );
    } finally {
      delete import.meta.env.VITE_DEMO_MODE;
    }
  });
});
