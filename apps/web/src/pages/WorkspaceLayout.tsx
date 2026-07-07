import { useState } from 'react';
import { Outlet, useSearchParams } from 'react-router-dom';
import { useWorkspace, useLiveScenarioView } from '@/hooks/use-workspace.js';
import { parseRole, parseScenario } from '@/lib/url-state.js';
import type { WorkspaceOutletContext } from '@/hooks/use-workspace-context.js';
import { LoginPage } from '@/pages/LoginPage.js';
import { AppShell } from '@/components/layout/AppShell';

export function WorkspaceLayout() {
  const [params, setParams] = useSearchParams();
  const [authenticated, setAuthenticated] = useState(false);
  const [operatorName, setOperatorName] = useState('Demo Officer');
  const role = parseRole(params.get('role'));
  const scenario = parseScenario(params.get('scenario'));

  const workspace = useWorkspace(scenario);
  const { liveSummary, visibleAlerts } = useLiveScenarioView(scenario, workspace);

  const updateParam = (key: 'role' | 'scenario', value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  if (!authenticated) {
    return (
      <LoginPage
        apiOnline={workspace.apiOnline}
        operatorName={operatorName}
        role={role}
        onOperatorNameChange={setOperatorName}
        onRoleChange={(next) => updateParam('role', next)}
        onSignIn={() => setAuthenticated(true)}
        adminHref="/admin"
      />
    );
  }

  const context: WorkspaceOutletContext = {
    role,
    scenario,
    workspace,
    liveSummary,
    visibleAlerts
  };

  return (
    <AppShell
      role={role}
      scenario={scenario}
      operatorName={operatorName}
      apiOnline={workspace.apiOnline}
      onRoleChange={(next) => updateParam('role', next)}
      onScenarioChange={(next) => updateParam('scenario', next)}
      onLogout={() => setAuthenticated(false)}
    >
      <Outlet context={context} />
    </AppShell>
  );
}
