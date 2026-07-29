import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { WorkspaceLayout } from '@/pages/WorkspaceLayout.js';
import { AdminLayout } from '@/pages/AdminLayout.js';
import { DefaultScreenRedirect, ScreenGuard } from '@/pages/workspace/ScreenGuard.js';
import { ModuleGuard } from '@/pages/workspace/ModuleGuard.js';
import { ModuleHomePage } from '@/pages/workspace/ModuleHomePage.js';
import { OverviewPage } from '@/pages/workspace/OverviewPage.js';
import { WorkbenchPage } from '@/pages/workspace/WorkbenchPage.js';
import { StakeholdersPage } from '@/pages/workspace/StakeholdersPage.js';
import { LotsPage } from '@/pages/workspace/LotsPage.js';
import { TransfersPage } from '@/pages/workspace/TransfersPage.js';
import { AllocationsPage } from '@/pages/workspace/AllocationsPage.js';
import { DistributionPage } from '@/pages/workspace/DistributionPage.js';
import { AuditAlertsPage } from '@/pages/workspace/AuditAlertsPage.js';
import { VerifyPage } from '@/pages/workspace/VerifyPage.js';
import { EligibilityReviewPage } from '@/pages/workspace/EligibilityReviewPage.js';
import { AdminOverviewPage } from '@/pages/admin/AdminOverviewPage.js';
import { AdminNetworkPage } from '@/pages/admin/AdminNetworkPage.js';
import { AdminStakeholdersPage } from '@/pages/admin/AdminStakeholdersPage.js';
import { AdminLedgerPage } from '@/pages/admin/AdminLedgerPage.js';
import { AdminAlertsPage } from '@/pages/admin/AdminAlertsPage.js';
import { AdminToolsPage } from '@/pages/admin/AdminToolsPage.js';
import { RoleLoginPage } from '@/pages/RoleLoginPage.js';
import { CitizenPortalPage } from '@/pages/citizen/CitizenPortalPage.js';
import { Toaster } from '@/components/ui/sonner.js';
import { TooltipProvider } from '@/components/ui/tooltip.js';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/role-login" element={<RoleLoginPage />} />
      <Route path="/citizen" element={<CitizenPortalPage />} />
      <Route path="/" element={<WorkspaceLayout />}>
        <Route index element={<DefaultScreenRedirect />} />
        <Route
          path="m/supply-chain"
          element={
            <ModuleGuard moduleId="supply-chain">
              <ModuleHomePage moduleId="supply-chain" />
            </ModuleGuard>
          }
        />
        <Route
          path="m/eligibility"
          element={
            <ModuleGuard moduleId="eligibility">
              <ModuleHomePage moduleId="eligibility" />
            </ModuleGuard>
          }
        />
        <Route
          path="m/fps"
          element={
            <ModuleGuard moduleId="fps">
              <ModuleHomePage moduleId="fps" />
            </ModuleGuard>
          }
        />
        <Route
          path="m/trust"
          element={
            <ModuleGuard moduleId="trust">
              <ModuleHomePage moduleId="trust" />
            </ModuleGuard>
          }
        />
        <Route
          path="eligibility"
          element={
            <ScreenGuard screen="eligibility-review">
              <EligibilityReviewPage />
            </ScreenGuard>
          }
        />
        <Route
          path="dashboard"
          element={
            <ScreenGuard screen="dashboard">
              <OverviewPage />
            </ScreenGuard>
          }
        />
        <Route
          path="workbench"
          element={
            <ScreenGuard screen="workbench">
              <WorkbenchPage />
            </ScreenGuard>
          }
        />
        <Route
          path="stakeholders"
          element={
            <ScreenGuard screen="stakeholders">
              <StakeholdersPage />
            </ScreenGuard>
          }
        />
        <Route
          path="lots"
          element={
            <ScreenGuard screen="lots">
              <LotsPage />
            </ScreenGuard>
          }
        />
        <Route
          path="transfers"
          element={
            <ScreenGuard screen="transfers">
              <TransfersPage />
            </ScreenGuard>
          }
        />
        <Route
          path="allocations"
          element={
            <ScreenGuard screen="allocations">
              <AllocationsPage />
            </ScreenGuard>
          }
        />
        <Route
          path="distribution"
          element={
            <ScreenGuard screen="distribution">
              <DistributionPage />
            </ScreenGuard>
          }
        />
        <Route
          path="audit"
          element={
            <ScreenGuard screen="audit-alerts">
              <AuditAlertsPage />
            </ScreenGuard>
          }
        />
        <Route
          path="verify"
          element={
            <ScreenGuard screen="verify">
              <VerifyPage />
            </ScreenGuard>
          }
        />
      </Route>
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="/admin/overview" replace />} />
        <Route path="overview" element={<AdminOverviewPage />} />
        <Route path="network" element={<AdminNetworkPage />} />
        <Route path="stakeholders" element={<AdminStakeholdersPage />} />
        <Route path="ledger" element={<AdminLedgerPage />} />
        <Route path="alerts" element={<AdminAlertsPage />} />
        <Route path="tools" element={<AdminToolsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <TooltipProvider delayDuration={200}>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <AppRoutes />
        <Toaster />
      </TooltipProvider>
    </BrowserRouter>
  );
}
