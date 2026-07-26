import { useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useWorkspace, useLiveScenarioView } from '@/hooks/use-workspace.js';
import { parseRole, parseScenario } from '@/lib/url-state.js';
import type { WorkspaceOutletContext } from '@/hooks/use-workspace-context.js';
import { LoginPage } from '@/pages/LoginPage.js';
import { AppShell } from '@/components/layout/AppShell';
import { getCurrentIdentity, signIn, signOut } from '@/auth-token.js';
import { getDataSourceMode } from '@/data-source.js';
import { oidcRoleToDemoRole, type DemoRole } from '@/demo-model.js';
import { getDefaultPath } from '@/lib/modules.js';
import { Button } from '@/components/ui/button.js';

export function WorkspaceLayout() {
  const [params, setParams] = useSearchParams();
  const [authenticated, setAuthenticated] = useState(false);
  const [operatorName, setOperatorName] = useState('Demo Officer');
  const offlineMode = getDataSourceMode() === 'mock';
  const identity = getCurrentIdentity();
  const selectedRole = parseRole(params.get('role'));
  const role = offlineMode ? selectedRole : (oidcRoleToDemoRole(identity?.roles ?? []) ?? 'MANAGEMENT');
  const scenario = parseScenario(params.get('scenario'));
  const location = useLocation();
  const navigate = useNavigate();

  const workspace = useWorkspace(scenario, offlineMode || Boolean(identity));
  const { liveSummary, visibleAlerts } = useLiveScenarioView(scenario, workspace);

  const updateParam = (key: 'role' | 'scenario', value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  const handleRoleChange = (nextRole: DemoRole) => {
    const next = new URLSearchParams(params);
    next.set('role', nextRole);
    navigate(
      { pathname: getDefaultPath(nextRole), search: `?${next.toString()}` },
      { replace: true }
    );
  };

  if ((!offlineMode && !identity) || (offlineMode && !authenticated)) {
    return (
      <LoginPage
        apiOnline={workspace.apiOnline}
        ledgerMode={workspace.ledgerMode}
        operatorName={operatorName}
        role={role}
        onOperatorNameChange={setOperatorName}
        onRoleChange={(next) => updateParam('role', next)}
        onSignIn={() => setAuthenticated(true)}
        adminHref="/admin"
        offlineMode={offlineMode}
        onOidcSignIn={() => { void signIn(location.pathname); }}
      />
    );
  }

  if (!offlineMode && identity?.roles.includes('platform-admin') && !oidcRoleToDemoRole(identity.roles)) {
    return <Navigate to="/admin/overview" replace />;
  }

  if (!offlineMode && !oidcRoleToDemoRole(identity?.roles ?? [])) {
    return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Forbidden</h1><p className="mt-3 text-muted-foreground">Your token has no operational ViksitPDS role.</p></main>;
  }

  if (!offlineMode && workspace.error) {
    const accessDenied = workspace.error.startsWith('Access denied while loading ');
    const identityExpired = workspace.error.startsWith('Your identity session is missing or expired.');
    return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">{identityExpired ? 'Identity session expired' : accessDenied ? 'Workspace access incomplete' : 'Online service unavailable'}</h1><p className="mt-3 text-muted-foreground">{workspace.error}</p><p className="mt-2 text-sm">{accessDenied ? 'Sign out and sign in again after the identity administrator repairs the role or scope assignment.' : identityExpired ? 'Start a fresh Keycloak session to continue.' : 'Fixture data was not substituted. Choose the explicitly labelled offline build for a backup demonstration.'}</p>{(accessDenied || identityExpired) && <Button className="mt-5" onClick={() => { void signOut(); }}>Sign out and sign in again</Button>}</main>;
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
      operatorName={identity?.displayName ?? operatorName}
      apiOnline={workspace.apiOnline}
      ledgerMode={workspace.ledgerMode}
      onRoleChange={handleRoleChange}
      onScenarioChange={(next) => updateParam('scenario', next)}
      offlineMode={offlineMode}
      onLogout={() => offlineMode ? setAuthenticated(false) : void signOut()}
    >
      <Outlet context={context} />
    </AppShell>
  );
}
