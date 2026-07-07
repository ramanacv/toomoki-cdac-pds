import { useState } from 'react';
import { getTraceCards } from '@/demo-model.js';
import { TraceExplorer } from '@/components/TraceExplorer.js';
import { useWorkspaceContext } from '@/hooks/use-workspace-context.js';

export function TraceSection() {
  const { scenario, workspace } = useWorkspaceContext();
  const [selectedLotId, setSelectedLotId] = useState('LOT-RICE-2026-001');
  const [selectedDistributionId, setSelectedDistributionId] = useState('DIST-2026-001');

  return (
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
  );
}
