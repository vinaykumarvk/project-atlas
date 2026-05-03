import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect, useCallback, type ElementType } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { LlmModeBanner } from './LlmModeBanner';
import { useNotifications } from '../hooks/useNotifications';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { Toaster } from 'sonner';
import {
  LayoutDashboard,
  ListChecks,
  FileText,
  Inbox,
  Users,
  Building2,
  CircleDollarSign,
  ShieldAlert,
  Database,
  BarChart3,
  FileSearch,
  UserCog,
  ScrollText,
  FolderCheck,
  Settings,
  Sun,
  Moon,
  Bell,
  Search,
  Menu,
  X,
} from 'lucide-react';

const MIDDAY_REFRESH_KEY = 'atlas_midday_refresh_opt_in';

interface NavItem {
  to: string;
  label: string;
  icon: ElementType;
}

const navItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/triage', label: 'Triage Queue', icon: ListChecks },
  { to: '/cases', label: 'Cases', icon: FileText },
  { to: '/queue', label: 'My Queue', icon: Inbox },
  { to: '/team-queue', label: 'Team Queue', icon: Users },
  { to: '/vendors', label: 'Vendor Scorecard', icon: Building2 },
  { to: '/disbursal-readiness', label: 'Disbursal Readiness', icon: CircleDollarSign },
  { to: '/collateral-risk', label: 'Collateral Risk', icon: ShieldAlert },
  { to: '/masters', label: 'Masters', icon: Database },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/compliance/audit', label: 'Audit Logs', icon: FileSearch },
  { to: '/compliance/dsr', label: 'DSR Tracking', icon: UserCog },
  { to: '/compliance/consent', label: 'Consent', icon: ScrollText },
  { to: '/compliance/evidence', label: 'Evidence Pack', icon: FolderCheck },
  { to: '/admin', label: 'Admin', icon: Settings },
];

export function Layout() {
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('atlas_dark_mode') === 'true'; } catch { return false; }
  });

  const [middayRefresh, setMiddayRefresh] = useState(() => {
    return localStorage.getItem(MIDDAY_REFRESH_KEY) === 'true';
  });

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Close sidebar on Escape key
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setSidebarOpen(false);
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [handleEscape]);

  // Body scroll lock when sidebar open on mobile
  useEffect(() => {
    if (sidebarOpen) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }
    return () => document.body.classList.remove('overflow-hidden');
  }, [sidebarOpen]);

  useEffect(() => {
    localStorage.setItem(MIDDAY_REFRESH_KEY, String(middayRefresh));
  }, [middayRefresh]);

  useEffect(() => {
    try { localStorage.setItem('atlas_dark_mode', String(darkMode)); } catch { /* noop */ }
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  useNotifications();

  return (
    <div className={cn('flex min-h-screen', darkMode ? 'dark' : '')}>
      {/* Skip to main content link (WCAG 2.1 AA) */}
      <a
        href="#main-content"
        data-testid="skip-to-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-0 focus:top-0 focus:z-[9999] focus:rounded-br-md focus:bg-accent focus:px-6 focus:py-3 focus:font-semibold focus:text-accent-foreground"
      >
        Skip to main content
      </a>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-[99] bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <nav
        aria-label="Main navigation"
        role="navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-[100] w-[var(--sidebar-width)] overflow-y-auto bg-sidebar text-sidebar-foreground',
          'transform transition-transform duration-200 ease-in-out',
          '-translate-x-full md:translate-x-0',
          sidebarOpen && 'translate-x-0',
        )}
      >
        <div className="border-b border-white/10 px-6 py-4">
          <h1 className="text-xl font-bold">Atlas</h1>
        </div>
        <ul className="list-none py-2">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-6 py-3 text-sm text-white/70 no-underline transition-colors hover:bg-white/[0.08] hover:text-white',
                    isActive && 'border-l-[3px] border-accent bg-white/[0.12] text-white',
                  )
                }
                end={item.to === '/dashboard' || item.to === '/triage'}
              >
                <item.icon className="h-[1.1rem] w-[1.1rem] shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Main area */}
      <div className="md:ml-[var(--sidebar-width)] flex flex-1 flex-col">
        <LlmModeBanner />

        {/* Top bar */}
        <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-border bg-card px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="md:hidden text-foreground hover:text-accent transition-colors"
              aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search cases..."
                aria-label="Global search"
                className="w-80 pl-9"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label
              className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"
              data-testid="midday-refresh-toggle"
            >
              <Checkbox
                checked={middayRefresh}
                onCheckedChange={(checked) => setMiddayRefresh(checked === true)}
                data-testid="midday-refresh-checkbox"
              />
              Midday refresh
            </label>

            <Badge variant="outline" className="bg-amber-400 text-black font-bold text-[0.7rem]">
              DEV
            </Badge>

            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              aria-label="Toggle dark mode"
              className="text-foreground hover:text-accent transition-colors"
            >
              {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            <button
              type="button"
              aria-label="Notifications"
              className="text-foreground hover:text-accent transition-colors"
            >
              <Bell className="h-5 w-5" />
            </button>

            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
              U
            </span>
          </div>
        </header>

        <main className="flex-1 p-6" id="main-content" role="main" aria-label="Main content">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      <Toaster richColors position="top-right" />
    </div>
  );
}
