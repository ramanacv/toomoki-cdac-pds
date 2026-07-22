import { useEffect, useState } from 'react';
import type { LedgerProofStatusResponse } from '@pds/shared-types';
import { loadLedgerProofStatus } from '@/api.js';
import { Badge } from '@/components/ui/badge.js';

export function ProofStatusBadges({ eventId }: { eventId: string }) {
  const [proof, setProof] = useState<LedgerProofStatusResponse | null>(null);
  const [lookupFailed, setLookupFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const value = await loadLedgerProofStatus(eventId);
        if (!active) return;
        setProof(value);
        setLookupFailed(false);
        if (!['COMMITTED', 'DEAD_LETTER'].includes(value.status)) timer = setTimeout(refresh, 2000);
      } catch {
        if (active) setLookupFailed(true);
      }
    };
    void refresh();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [eventId]);

  const proofLabel = proof?.status === 'COMMITTED'
    ? proof.fabricTxId
      ? `Blockchain proof committed · ${proof.fabricTxId}`
      : 'Demo proof recorded · no Fabric transaction ID'
    : proof?.status === 'FAILED'
      ? 'Blockchain proof retryable failure'
      : proof?.status === 'DEAD_LETTER'
        ? 'Blockchain proof dead letter — intervention required'
        : proof?.status === 'SUBMITTING'
          ? 'Blockchain proof submitting'
          : 'Blockchain proof pending';

  return <div className="mt-3 flex flex-wrap gap-2" aria-label="Commit status">
    <Badge variant="secondary">Operational transaction committed</Badge>
    <Badge variant={proof?.status === 'DEAD_LETTER' || proof?.status === 'FAILED' || lookupFailed ? 'destructive' : 'secondary'}>
      {lookupFailed ? 'Proof status temporarily unavailable' : proofLabel}
    </Badge>
  </div>;
}
