import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import type { Stakeholder } from '@pds/shared-types';
import { loadAdminOverview, type AdminOverview } from '@/admin-api.js';
import { loadStakeholders, probeApi } from '@/api.js';
import { AdminShell } from '@/components/layout/AdminShell';
import type { AdminOutletContext } from '@/hooks/use-admin-context.js';

export function AdminLayout() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [apiOnline, setApiOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const online = await probeApi();
    setApiOnline(online);

    if (!online) {
      setOverview(null);
      setError('API is offline. Start the backend to load the admin dashboard.');
      setLoading(false);
      return;
    }

    try {
      const [payload, stakeholderList] = await Promise.all([loadAdminOverview(), loadStakeholders(online)]);
      setOverview(payload);
      setStakeholders(stakeholderList);
    } catch (caught) {
      setOverview(null);
      setError(caught instanceof Error ? caught.message : 'Failed to load admin overview');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const context: AdminOutletContext = { overview, stakeholders, apiOnline, loading, error, refresh };

  return (
    <AdminShell apiOnline={apiOnline}>
      <Outlet context={context} />
    </AdminShell>
  );
}
