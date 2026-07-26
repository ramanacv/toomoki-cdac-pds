import { useEffect, useState } from 'react';
import { getCurrentIdentity } from '@/auth-token.js';
import { fetchAssignedFpsId } from '@/api.js';

/**
 * Resolve the authenticated FPS shop id for UI scoping.
 * Prefer JWT `pds_stakeholder_id`; otherwise ask the API (DB scope assignment).
 * Never invent a default shop (e.g. FPS-101) — that mislabels other dealers.
 */
export function useAssignedFpsId(role: string, apiOnline: boolean): string | undefined {
  const identity = getCurrentIdentity();
  const fromToken = identity?.stakeholderId;
  const [resolved, setResolved] = useState<string | undefined>(fromToken);

  useEffect(() => {
    if (fromToken) {
      setResolved(fromToken);
      return;
    }
    if (role !== 'FPS' || !apiOnline) {
      setResolved(undefined);
      return;
    }
    let cancelled = false;
    void fetchAssignedFpsId()
      .then((fpsId) => {
        if (!cancelled) setResolved(fpsId);
      })
      .catch(() => {
        if (!cancelled) setResolved(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [fromToken, role, apiOnline]);

  return resolved;
}
