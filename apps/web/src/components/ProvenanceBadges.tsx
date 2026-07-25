import type { SourceProvenance } from '@pds/shared-types';
import { Badge } from '@/components/ui/badge.js';
import { ProofStatusBadges } from '@/components/ProofStatusBadges.js';

const sourceLabels: Record<SourceProvenance['sourceSystem'], string> = {
  SMARTPDS_RCMS: 'SMART-PDS/RCMS reference',
  STATE_SCM: 'IAeSCM/state SCM event',
  AEPDS_EPOS: 'AePDS/ePoS event',
  VIKSITPDS_DEMO: 'ViksitPDS demo simulation'
};

export function ProvenanceBadges({
  provenance,
  eventId
}: {
  provenance?: SourceProvenance | undefined;
  eventId?: string | undefined;
}) {
  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2" aria-label="Source and operational status">
        <Badge variant="secondary">
          {provenance ? sourceLabels[provenance.sourceSystem] : 'ViksitPDS demo simulation'}
        </Badge>
        <Badge variant="secondary">Operational: {provenance?.status ?? 'ACCEPTED'}</Badge>
        {!eventId && <Badge variant="secondary">Fabric proof: not linked</Badge>}
      </div>
      {eventId && <ProofStatusBadges eventId={eventId} />}
    </>
  );
}
