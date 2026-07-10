import { useEffect, useState } from 'react';
import { getTraceCards } from '@/demo-model.js';
import { LotsPanel } from '@/components/DataPanels.js';
import { TraceExplorer } from '@/components/TraceExplorer.js';
import { useWorkspaceContext } from '@/hooks/use-workspace-context.js';

export function LotsPage() {
  const { scenario, workspace } = useWorkspaceContext();
  const defaultLotId =
    workspace.lots.find((lot) => lot.commodity === 'Rice')?.lotId ??
    workspace.lots[0]?.lotId ??
    '';
  const defaultDistributionId = workspace.distributions[0]?.distributionId ?? '';
  const [selectedLotId, setSelectedLotId] = useState(defaultLotId);
  const [selectedDistributionId, setSelectedDistributionId] = useState(defaultDistributionId);

  useEffect(() => {
    if (!selectedLotId && defaultLotId) {
      setSelectedLotId(defaultLotId);
    }
    if (!selectedDistributionId && defaultDistributionId) {
      setSelectedDistributionId(defaultDistributionId);
    }
  }, [defaultDistributionId, defaultLotId, selectedDistributionId, selectedLotId]);

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
