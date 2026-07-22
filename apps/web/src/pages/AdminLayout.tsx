import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import type { Stakeholder } from '@pds/shared-types';
import { loadAdminOverview, type AdminOverview } from '@/admin-api.js';
import { fetchApiHealth, loadStakeholders, type LedgerMode } from '@/api.js';
import { AdminShell } from '@/components/layout/AdminShell';
import type { AdminOutletContext } from '@/hooks/use-admin-context.js';
import { getCurrentIdentity, hasOperationalRole, signIn, signOut } from '@/auth-token.js';
import { Button } from '@/components/ui/button.js';

export function AdminLayout() {
  const identity = getCurrentIdentity();
  const canReadOperationalData = hasOperationalRole(identity?.roles ?? []);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [apiOnline, setApiOnline] = useState(false);
  const [ledgerMode, setLedgerMode] = useState<LedgerMode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const health = await fetchApiHealth();
    const online = health.ok;
    setApiOnline(online);
    setLedgerMode(null);

    if (!online) {
      setOverview(null);
      setStakeholders([]);
      setError('API is offline. Start the backend to load the admin dashboard.');
      setLoading(false);
      return;
    }

    try {
      const [payload, stakeholderList] = await Promise.all([
        loadAdminOverview(),
        canReadOperationalData ? loadStakeholders(online) : Promise.resolve([])
      ]);
      setOverview(payload);
      setStakeholders(stakeholderList);
    } catch (caught) {
      setOverview(null);
      setStakeholders([]);
      setError(caught instanceof Error ? caught.message : 'Failed to load admin overview');
    } finally {
      setLoading(false);
    }
  }, [canReadOperationalData]);

  useEffect(() => {
    if (identity?.roles.includes('platform-admin')) void refresh();
    else setLoading(false);
  }, [identity?.subject, refresh]);

  if (!identity) {
    return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Admin sign in</h1><p className="my-4 text-muted-foreground">A platform-admin role is required.</p><Button onClick={() => { void signIn('/admin/overview'); }}>Sign in with Keycloak</Button></main>;
  }

  if (!identity.roles.includes('platform-admin')) {
    return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Forbidden</h1><p className="my-4 text-muted-foreground">Your authenticated account does not have the platform-admin role.</p><Button variant="secondary" onClick={() => { void signOut(); }}>Log out</Button></main>;
  }

  const context: AdminOutletContext = { overview, stakeholders, apiOnline, loading, error, refresh };

  return (
    <AdminShell apiOnline={apiOnline} ledgerMode={ledgerMode} onLogout={() => { void signOut(); }}>
      <Outlet context={context} />
    </AdminShell>
  );
}
