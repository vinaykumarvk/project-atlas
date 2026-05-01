import { lazy, Suspense } from 'react';
import { Navigate, type RouteObject } from 'react-router-dom';
import { AuthGuard } from './auth/AuthGuard';
import { LoginPage } from './auth/LoginPage';
import { Layout } from './components/Layout';
import DashboardPage from './pages/Dashboard';

const CaseListPage = lazy(() => import('./pages/CaseList'));
const CaseDetailPage = lazy(() => import('./pages/CaseDetail'));
const TriageQueuePage = lazy(() => import('./pages/TriageQueue'));
const MasterManagement = lazy(() => import('./pages/masters/MasterManagement').then(m => ({ default: m.MasterManagement })));
const AdminConsole = lazy(() => import('./pages/admin/AdminConsole').then(m => ({ default: m.AdminConsole })));

// Collateral Operations Intelligence pages
const VendorScorecardPage = lazy(() => import('./pages/VendorScorecard'));
const DisbursalReadinessPage = lazy(() => import('./pages/DisbursalReadiness'));
const CollateralRiskPage = lazy(() => import('./pages/CollateralRisk'));

// Vendor Portal
const VendorPortalPage = lazy(() => import('./pages/VendorPortal'));

// Analytics pages
const CustomReportBuilder = lazy(() => import('./pages/CustomReportBuilder'));

// Compliance pages
const AuditSearch = lazy(() => import('./pages/compliance/AuditSearch'));
const DsrTracking = lazy(() => import('./pages/compliance/DsrTracking'));
const ConsentLedger = lazy(() => import('./pages/compliance/ConsentLedger'));
const EvidencePack = lazy(() => import('./pages/compliance/EvidencePack'));
const RegulatoryEvidence = lazy(() => import('./pages/compliance/RegulatoryEvidence'));
const DpoConsole = lazy(() => import('./pages/compliance/DpoConsole'));

export const routes: RouteObject[] = [
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: (
      <AuthGuard>
        <Layout />
      </AuthGuard>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: 'dashboard',
        element: <DashboardPage />,
      },
      {
        path: 'cases',
        element: <Suspense fallback={<div>Loading...</div>}><CaseListPage /></Suspense>,
      },
      {
        path: 'cases/:caseId',
        element: <Suspense fallback={<div>Loading...</div>}><CaseDetailPage /></Suspense>,
      },
      {
        path: 'triage',
        element: <Suspense fallback={<div>Loading...</div>}><TriageQueuePage /></Suspense>,
      },
      {
        path: 'queue',
        element: <div>My Queue — Coming Soon</div>,
      },
      {
        path: 'team-queue',
        element: <div>Team Queue — Coming Soon</div>,
      },
      {
        path: 'vendors',
        element: <Suspense fallback={<div>Loading...</div>}><VendorScorecardPage /></Suspense>,
      },
      {
        path: 'disbursal-readiness',
        element: <Suspense fallback={<div>Loading...</div>}><DisbursalReadinessPage /></Suspense>,
      },
      {
        path: 'collateral-risk',
        element: <Suspense fallback={<div>Loading...</div>}><CollateralRiskPage /></Suspense>,
      },
      {
        path: 'masters',
        element: <Suspense fallback={<div>Loading...</div>}><MasterManagement /></Suspense>,
      },
      {
        path: 'reports',
        element: <div>Reports — Coming Soon</div>,
      },
      {
        path: 'reports/custom',
        element: <Suspense fallback={<div>Loading...</div>}><CustomReportBuilder /></Suspense>,
      },
      {
        path: 'admin',
        element: <Suspense fallback={<div>Loading...</div>}><AdminConsole /></Suspense>,
      },
      // ── Vendor Portal ──────────────────────────────────
      {
        path: 'vendor-portal',
        element: <Suspense fallback={<div>Loading...</div>}><VendorPortalPage /></Suspense>,
      },
      // ── Compliance routes ──────────────────────────────
      {
        path: 'compliance/audit',
        element: <Suspense fallback={<div>Loading...</div>}><AuditSearch /></Suspense>,
      },
      {
        path: 'compliance/dsr',
        element: <Suspense fallback={<div>Loading...</div>}><DsrTracking /></Suspense>,
      },
      {
        path: 'compliance/consent',
        element: <Suspense fallback={<div>Loading...</div>}><ConsentLedger /></Suspense>,
      },
      {
        path: 'compliance/evidence',
        element: <Suspense fallback={<div>Loading...</div>}><EvidencePack /></Suspense>,
      },
      {
        path: 'compliance/regulatory-evidence',
        element: <Suspense fallback={<div>Loading...</div>}><RegulatoryEvidence /></Suspense>,
      },
      {
        path: 'compliance/dpo',
        element: <Suspense fallback={<div>Loading...</div>}><DpoConsole /></Suspense>,
      },
      {
        path: '*',
        element: (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <h2>404 — Page Not Found</h2>
            <p>The page you are looking for does not exist.</p>
            <a href="/dashboard">Return to Dashboard</a>
          </div>
        ),
      },
    ],
  },
];
