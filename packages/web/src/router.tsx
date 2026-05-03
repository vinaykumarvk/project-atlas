import { lazy, Suspense } from 'react';
import { Navigate, Link, type RouteObject } from 'react-router-dom';
import { AuthGuard } from './auth/AuthGuard';
import { LoginPage } from './auth/LoginPage';
import { Layout } from './components/Layout';
import DashboardPage from './pages/Dashboard';
import { Loader2, FileQuestion } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function PageLoader() {
  return (
    <div className="flex items-center justify-center p-24">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

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
        element: <Suspense fallback={<PageLoader />}><CaseListPage /></Suspense>,
      },
      {
        path: 'cases/:caseId',
        element: <Suspense fallback={<PageLoader />}><CaseDetailPage /></Suspense>,
      },
      {
        path: 'triage',
        element: <Suspense fallback={<PageLoader />}><TriageQueuePage /></Suspense>,
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
        element: <Suspense fallback={<PageLoader />}><VendorScorecardPage /></Suspense>,
      },
      {
        path: 'disbursal-readiness',
        element: <Suspense fallback={<PageLoader />}><DisbursalReadinessPage /></Suspense>,
      },
      {
        path: 'collateral-risk',
        element: <Suspense fallback={<PageLoader />}><CollateralRiskPage /></Suspense>,
      },
      {
        path: 'masters',
        element: <Suspense fallback={<PageLoader />}><MasterManagement /></Suspense>,
      },
      {
        path: 'reports',
        element: <div>Reports — Coming Soon</div>,
      },
      {
        path: 'reports/custom',
        element: <Suspense fallback={<PageLoader />}><CustomReportBuilder /></Suspense>,
      },
      {
        path: 'admin',
        element: <Suspense fallback={<PageLoader />}><AdminConsole /></Suspense>,
      },
      // ── Vendor Portal ──────────────────────────────────
      {
        path: 'vendor-portal',
        element: <Suspense fallback={<PageLoader />}><VendorPortalPage /></Suspense>,
      },
      // ── Compliance routes ──────────────────────────────
      {
        path: 'compliance/audit',
        element: <Suspense fallback={<PageLoader />}><AuditSearch /></Suspense>,
      },
      {
        path: 'compliance/dsr',
        element: <Suspense fallback={<PageLoader />}><DsrTracking /></Suspense>,
      },
      {
        path: 'compliance/consent',
        element: <Suspense fallback={<PageLoader />}><ConsentLedger /></Suspense>,
      },
      {
        path: 'compliance/evidence',
        element: <Suspense fallback={<PageLoader />}><EvidencePack /></Suspense>,
      },
      {
        path: 'compliance/regulatory-evidence',
        element: <Suspense fallback={<PageLoader />}><RegulatoryEvidence /></Suspense>,
      },
      {
        path: 'compliance/dpo',
        element: <Suspense fallback={<PageLoader />}><DpoConsole /></Suspense>,
      },
      {
        path: '*',
        element: (
          <Card className="mx-auto mt-24 max-w-md border-dashed">
            <CardContent className="flex flex-col items-center py-16 text-center">
              <FileQuestion className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <h2 className="mb-2 text-xl font-semibold">404 — Page Not Found</h2>
              <p className="mb-6 text-sm text-muted-foreground">The page you are looking for does not exist.</p>
              <Button asChild variant="outline"><Link to="/dashboard">Return to Dashboard</Link></Button>
            </CardContent>
          </Card>
        ),
      },
    ],
  },
];
