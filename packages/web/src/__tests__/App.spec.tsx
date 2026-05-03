import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from '../App';
import { AuthProvider } from '../auth/AuthContext';
import { LoginPage } from '../auth/LoginPage';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_USER = {
  id: 'user-1',
  email: 'test@atlas.dev',
  roles: ['admin'],
  region: 'AU',
};

/**
 * Seed localStorage with the non-sensitive user snapshot so AuthContext treats the session as
 * authenticated on mount.
 */
function seedAuth() {
  localStorage.setItem('atlas_user', JSON.stringify(TEST_USER));
}

/** Render <App /> inside a MemoryRouter at the given path. */
function renderApp(initialPath = '/') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Temporarily set an import.meta.env variable, restoring it after the callback. */
function withEnv(key: string, value: string, fn: () => void | Promise<void>) {
  const original = import.meta.env[key];
  import.meta.env[key] = value;
  try {
    const result = fn();
    if (result && typeof (result as Promise<void>).then === 'function') {
      return (result as Promise<void>).finally(() => {
        if (original === undefined) {
          delete import.meta.env[key];
        } else {
          import.meta.env[key] = original;
        }
      });
    }
  } finally {
    // Synchronous path — only restore if fn didn't return a promise
    if (original === undefined) {
      delete import.meta.env[key];
    } else {
      import.meta.env[key] = original;
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

// ---- 1. Route rendering (App renders without crash) -----------------------

describe('App smoke test', () => {
  it('renders the App component without crashing', () => {
    // Even without auth the component tree should mount (redirecting to login)
    expect(() => renderApp()).not.toThrow();
  });
});

// ---- 2. Auth guard redirect -----------------------------------------------

describe('AuthGuard redirect', () => {
  it('redirects unauthenticated users to /login when visiting a protected route', () => {
    renderApp('/dashboard');

    // The login page title and sign-in card should be visible
    expect(screen.getAllByText('Project Atlas').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Sign in')).toBeInTheDocument();
  });

  it('redirects unauthenticated users to /login when visiting /cases', () => {
    renderApp('/cases');

    expect(screen.getAllByText('Project Atlas').length).toBeGreaterThanOrEqual(1);
  });

  it('redirects unauthenticated users to /login when visiting the root path /', () => {
    renderApp('/');

    expect(screen.getByText('Enter your credentials to access the platform')).toBeInTheDocument();
  });

  it('does NOT redirect authenticated users away from protected routes', () => {
    seedAuth();
    renderApp('/dashboard');

    // Authenticated users should see the Layout sidebar header, not the login page
    expect(screen.getByText('Atlas')).toBeInTheDocument();
    expect(screen.queryByText('Sign in to continue')).not.toBeInTheDocument();
  });
});

// ---- 3. Page-level render tests -------------------------------------------

describe('LoginPage', () => {
  it('renders the login form with email and password fields', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows dev credentials hint', () => {
    return withEnv('VITE_SHOW_DEV_CREDENTIALS', 'true', () => {
      render(
        <MemoryRouter>
          <AuthProvider>
            <LoginPage />
          </AuthProvider>
        </MemoryRouter>,
      );

      expect(screen.getByText(/admin@atlas\.dev/)).toBeInTheDocument();
    });
  });
});

describe('Dashboard page', () => {
  it('renders the dashboard heading when authenticated (non-demo mode)', () => {
    seedAuth();
    renderApp('/dashboard');

    // "Dashboard" appears both in the sidebar nav and the page heading, so we
    // target the h2 specifically.
    expect(screen.getByRole('heading', { level: 2, name: 'Dashboard' })).toBeInTheDocument();
  });

  it('renders summary cards when authenticated in demo mode', () => {
    seedAuth();

    return withEnv('VITE_DEMO_MODE', 'true', () => {
      renderApp('/dashboard');

      expect(screen.getByText('Total Cases')).toBeInTheDocument();
      expect(screen.getByText('On Track')).toBeInTheDocument();
      expect(screen.getByText('At Risk')).toBeInTheDocument();
      // "Breached" appears in both the summary card and the trends table header
      const breachedItems = screen.getAllByText('Breached');
      expect(breachedItems.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('CaseList page', () => {
  it('renders the cases heading when authenticated (non-demo mode)', async () => {
    seedAuth();
    renderApp('/cases');

    // CaseList is lazy-loaded via React.lazy, so we must wait for the
    // Suspense boundary to resolve before the actual component renders.
    await waitFor(
      () => {
        expect(screen.getByRole('heading', { level: 2, name: 'Cases' })).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });

  it('renders the case table with mock data when demo mode is enabled', async () => {
    seedAuth();
    import.meta.env.VITE_DEMO_MODE = 'true';

    try {
      renderApp('/cases');

      await waitFor(
        () => {
          expect(screen.getByText('CASE-1042')).toBeInTheDocument();
        },
        { timeout: 5000 },
      );
    } finally {
      delete import.meta.env.VITE_DEMO_MODE;
    }
  });
});
