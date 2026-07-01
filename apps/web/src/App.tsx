import { useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import type { DemoRole, DemoScenario } from '@/demo-model.js';
import { LoginPage } from '@/pages/LoginPage.js';
import { DashboardPage } from '@/pages/DashboardPage.js';
import { AdminDashboard } from '@/pages/AdminDashboard.js';
import { Toaster } from '@/components/ui/sonner.js';
import { TooltipProvider } from '@/components/ui/tooltip.js';

const VALID_ROLES: DemoRole[] = [
  'MANAGEMENT',
  'CONTROL_OFFICE',
  'FCI_DEPOT',
  'DEPOT',
  'FPS',
  'WELFARE_INSTITUTE',
  'SHIV_BHOJAN_OPERATOR',
  'AUDITOR',
  'DEPARTMENT',
  'PROCUREMENT',
  'GODOWN'
];
const VALID_SCENARIOS: DemoScenario[] = ['happy-path', 'short-receipt', 'duplicate-claim'];

function parseRole(value: string | null): DemoRole {
  return VALID_ROLES.includes(value as DemoRole) ? (value as DemoRole) : 'MANAGEMENT';
}

function parseScenario(value: string | null): DemoScenario {
  return VALID_SCENARIOS.includes(value as DemoScenario) ? (value as DemoScenario) : 'happy-path';
}

function WorkspaceRoute() {
  const [params, setParams] = useSearchParams();
  const [authenticated, setAuthenticated] = useState(false);
  const [operatorName, setOperatorName] = useState('Demo Officer');
  const role = parseRole(params.get('role'));
  const scenario = parseScenario(params.get('scenario'));

  const updateParam = (key: 'role' | 'scenario', value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  if (!authenticated) {
    return (
      <LoginPage
        apiOnline={false}
        operatorName={operatorName}
        role={role}
        onOperatorNameChange={setOperatorName}
        onRoleChange={(next) => updateParam('role', next)}
        onSignIn={() => setAuthenticated(true)}
        adminHref="/admin"
      />
    );
  }

  return (
    <DashboardPage
      initialRole={role}
      initialScenario={scenario}
      operatorName={operatorName}
      onLogout={() => setAuthenticated(false)}
      adminHref="/admin"
    />
  );
}

export function App() {
  return (
    <BrowserRouter>
      <TooltipProvider delayDuration={200}>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Routes>
          <Route path="/" element={<WorkspaceRoute />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster />
      </TooltipProvider>
    </BrowserRouter>
  );
};
