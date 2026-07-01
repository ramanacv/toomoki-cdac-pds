import type { CommodityLot, DistributionTransaction, TransferOrder } from '@pds/shared-types';
import type { TraceCard } from '@/demo-model.js';
import { Panel } from '@/components/Panel';
import { buildApiUrl } from '@/api.js';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const accentClass: Record<TraceCard['accent'], string> = {
  emerald: 'bg-gradient-to-b from-primary/12 to-card/84',
  amber: 'bg-gradient-to-b from-warning/12 to-card/84',
  slate: 'bg-gradient-to-b from-secondary/8 to-card/84'
};

type TraceExplorerProps = {
  lots: CommodityLot[];
  transfers: TransferOrder[];
  distributions: DistributionTransaction[];
  traceCards: TraceCard[];
  selectedLotId: string;
  selectedDistributionId: string;
  onLotChange: (id: string) => void;
  onDistributionChange: (id: string) => void;
};

export function TraceExplorer({
  lots,
  transfers,
  distributions,
  traceCards,
  selectedLotId,
  selectedDistributionId,
  onLotChange,
  onDistributionChange
}: TraceExplorerProps) {
  const traceLot = lots.find((lot) => lot.lotId === selectedLotId) ?? lots[0];
  const visibleDistribution =
    distributions.find((item) => item.distributionId === selectedDistributionId) ?? distributions[0];
  const relatedLotIds = new Set([
    selectedLotId,
    ...(traceLot?.transformedFromLotId ? [traceLot.transformedFromLotId] : []),
    ...lots.filter((lot) => lot.transformedFromLotId === selectedLotId).map((lot) => lot.lotId)
  ]);
  const visibleTransfers = transfers.filter((transfer) => relatedLotIds.has(transfer.lotId));

  return (
    <Panel
      eyebrow="Trace explorer"
      title="Lot and receipt evidence"
      pill={selectedLotId}
    >
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="trace-lot">Lot ID</Label>
          <Select value={selectedLotId} onValueChange={onLotChange}>
            <SelectTrigger id="trace-lot">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {lots.map((lot) => (
                <SelectItem key={lot.lotId} value={lot.lotId}>
                  {lot.lotId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="trace-dist">Distribution ID</Label>
          <Select
            value={selectedDistributionId}
            onValueChange={onDistributionChange}
          >
            <SelectTrigger id="trace-dist">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {distributions.map((distribution) => (
                <SelectItem key={distribution.distributionId} value={distribution.distributionId}>
                  {distribution.distributionId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {traceCards.map((card) => (
          <article
            key={card.title}
            className={cn(
              'rounded-3xl border border-border p-4',
              accentClass[card.accent]
            )}
          >
            <p className="text-sm text-muted-foreground">{card.title}</p>
            <strong className="block text-2xl font-semibold tracking-tight">{card.value}</strong>
            <span className="mt-2.5 block leading-relaxed text-muted-foreground">{card.detail}</span>
          </article>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-secondary/4 p-4">
          <span className="mb-2 block text-sm font-bold">Lot trace endpoint</span>
          <code className="text-sm break-all">{buildApiUrl(`/trace/lots/${selectedLotId}`)}</code>
        </div>
        <div className="rounded-2xl border border-border bg-secondary/4 p-4">
          <span className="mb-2 block text-sm font-bold">Distribution receipt endpoint</span>
          <code className="text-sm break-all">
            {buildApiUrl(`/distributions/${selectedDistributionId}`)}
          </code>
        </div>
      </div>

      <div className="mt-4 grid gap-2 rounded-3xl border border-dashed border-primary/20 bg-primary/5 p-4">
        <p className="leading-relaxed">
          Selected lot: <strong>{traceLot?.commodity ?? 'Rice'}</strong> in{' '}
          {traceLot?.currentLocation ?? 'Block Godown 01'}.
        </p>
        <p className="leading-relaxed">
          Selected receipt: <strong>{visibleDistribution?.deliveredKg ?? 25} kg</strong> for ration
          card hash {visibleDistribution?.rationCardHash ?? 'demo-ration-card-hash'}.
        </p>
      </div>

      <div className="mt-4 rounded-3xl border border-border bg-card/70 p-4">
        <span className="mb-3 block text-sm font-bold">Custody timeline</span>
        <div className="grid gap-2">
          {visibleTransfers.map((transfer) => (
            <div
              key={transfer.transferId}
              className="grid gap-2 rounded-2xl border border-border bg-background/70 p-3 md:grid-cols-[1fr_auto]"
            >
              <div>
                <strong className="block text-sm">{transfer.fromOrg} to {transfer.toOrg}</strong>
                <span className="text-sm text-muted-foreground">
                  {transfer.transferId} · {transfer.dispatchedQtyKg} kg · {transfer.stage ? `Stage-${transfer.stage}` : 'custody'}
                  {transfer.roRef ? ` · ${transfer.roRef}` : ''}
                </span>
              </div>
              <span className="text-sm font-semibold text-muted-foreground">{transfer.status}</span>
            </div>
          ))}
          {visibleTransfers.length === 0 && (
            <p className="text-sm text-muted-foreground">No custody transfers found for the selected lot.</p>
          )}
        </div>
      </div>
    </Panel>
  );
}
