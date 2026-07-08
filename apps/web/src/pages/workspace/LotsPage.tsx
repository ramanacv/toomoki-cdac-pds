import { useState } from 'react';
import { getTraceCards } from '@/demo-model.js';
import { LotsPanel } from '@/components/DataPanels.js';
import { TraceExplorer } from '@/components/TraceExplorer.js';
import { useWorkspaceContext } from '@/hooks/use-workspace-context.js';

export function LotsPage() {
  const { scenario, workspace } = useWorkspaceContext();
  const [selectedLotId, setSelectedLotId] = useState('LOT-RICE-2026-001');
  const [selectedDistributionId, setSelectedDistributionId] = useState('DIST-2026-001');

  return (
    <div className="flex flex-col gap-6">
      <LotsPanel lots={workspace.lots} onSelectLot={setSelectedLotId} />
      <TraceExplorer
        lots={workspace.lots}
        transfers={workspace.transfers}
        distributions={workspace.distributions}
        traceCards={getTraceCards(scenario)}
        selectedLotId={selectedLotId}
        selectedDistributionId={selectedDistributionId}
        onLotChange={setSelectedLotId}
        onDistributionChange={setSelectedDistributionId}
      />
    </div>
  );
}
