import { Outlet, NavLink } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { LlmModeBanner } from './LlmModeBanner';
import { useNotifications } from '../hooks/useNotifications';

const MIDDAY_REFRESH_KEY = 'atlas_midday_refresh_opt_in';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '□' },
  { to: '/triage', label: 'Triage Queue', icon: '▤' },
  { to: '/cases', label: 'Cases', icon: '◫' },
  { to: '/queue', label: 'My Queue', icon: '▦' },
  { to: '/team-queue', label: 'Team Queue', icon: '▦' },
  { to: '/vendors', label: 'Vendor Scorecard', icon: '⊞' },
  { to: '/disbursal-readiness', label: 'Disbursal Readiness', icon: '◐' },
  { to: '/collateral-risk', label: 'Collateral Risk', icon: '◑' },
  { to: '/masters', label: 'Masters', icon: '⊟' },
  { to: '/reports', label: 'Reports', icon: '◧' },
  { to: '/compliance/audit', label: 'Audit Logs', icon: '◉' },
  { to: '/compliance/dsr', label: 'DSR Tracking', icon: '◈' },
  { to: '/compliance/consent', label: 'Consent', icon: '◇' },
  { to: '/compliance/evidence', label: 'Evidence Pack', icon: '◆' },
  { to: '/admin', label: 'Admin', icon: '⚙' },
];

export function Layout() {
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('atlas_dark_mode') === 'true'; } catch { return false; }
  });

  // Midday refresh opt-in (FR-071.A2) — stored in localStorage
  const [middayRefresh, setMiddayRefresh] = useState(() => {
    return localStorage.getItem(MIDDAY_REFRESH_KEY) === 'true';
  });

  useEffect(() => {
    localStorage.setItem(MIDDAY_REFRESH_KEY, String(middayRefresh));
  }, [middayRefresh]);

  // FR-057.A3: Persist dark mode preference to localStorage
  useEffect(() => {
    try { localStorage.setItem('atlas_dark_mode', String(darkMode)); } catch {}
  }, [darkMode]);

  // Browser notifications hook (FR-057.A4)
  useNotifications();

  return (
    <div className={`app-layout ${darkMode ? 'dark' : 'light'}`}>
      {/* Skip to main content link (WCAG 2.1 AA) */}
      <a
        href="#main-content"
        className="skip-to-main"
        data-testid="skip-to-main"
        style={{
          position: 'absolute',
          left: '-9999px',
          top: '0',
          zIndex: 9999,
          padding: '0.75rem 1.5rem',
          backgroundColor: 'var(--color-accent, #3b82f6)',
          color: '#fff',
          fontWeight: 600,
          textDecoration: 'none',
          borderRadius: '0 0 6px 0',
        }}
        onFocus={(e) => { e.currentTarget.style.left = '0'; }}
        onBlur={(e) => { e.currentTarget.style.left = '-9999px'; }}
      >
        Skip to main content
      </a>
      <nav className="sidebar" aria-label="Main navigation" role="navigation">
        <div className="sidebar-header">
          <h1>Atlas</h1>
        </div>
        <ul className="nav-list">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                end={item.to === '/dashboard' || item.to === '/triage'}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="main-area">
        <LlmModeBanner />
        <header className="top-bar">
          <div className="search-container">
            <input type="search" placeholder="Search cases..." aria-label="Global search" />
          </div>
          <div className="top-bar-actions">
            <label
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: '#64748b', cursor: 'pointer' }}
              data-testid="midday-refresh-toggle"
            >
              <input
                type="checkbox"
                checked={middayRefresh}
                onChange={(e) => setMiddayRefresh(e.target.checked)}
                data-testid="midday-refresh-checkbox"
              />
              Midday refresh
            </label>
            <span className="env-badge">DEV</span>
            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              aria-label="Toggle dark mode"
              className="theme-toggle"
            >
              {darkMode ? '☀' : '☾'}
            </button>
            <button type="button" className="notifications-btn" aria-label="Notifications">
              🔔
            </button>
            <span className="user-avatar">U</span>
          </div>
        </header>

        <main className="content" id="main-content" role="main" aria-label="Main content">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
