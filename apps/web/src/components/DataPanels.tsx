import { useState } from 'react';
import type {
  AuditAlert,
  AuthTransaction,
  CommodityLot,
  CommodityName,
  DistributionTransaction,
  FPSAllocation,
  MonthlyEntitlement,
  Stakeholder,
  TransferOrder
} from '@pds/shared-types';
import { COMMODITIES, LotStatus } from '@pds/shared-types';
import { Panel } from '@/components/Panel';
import { CardTopline, DefinitionList, EntityCard } from '@/components/Entity';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { formatDateTime, stakeholderParticipation } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { ProvenanceBadges } from '@/components/ProvenanceBadges.js';
import { ParticipationBadge, participationCardClass } from '@/components/ParticipationIndicator';

const alertTone: Record<AuditAlert['riskLevel'], 'low' | 'medium' | 'high'> = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
};

export function StakeholdersPanel({ stakeholders }: { stakeholders: Stakeholder[] }) {
  const sortedStakeholders = [...stakeholders].sort((left, right) => {
    const leftActive = stakeholderParticipation(left.stakeholderType) === 'active' ? 0 : 1;
    const rightActive = stakeholderParticipation(right.stakeholderType) === 'active' ? 0 : 1;
    return leftActive - rightActive || left.name.localeCompare(right.name);
  });
  const activeCount = stakeholders.filter(
    (stakeholder) => stakeholderParticipation(stakeholder.stakeholderType) === 'active'
  ).length;

  return (
    <Panel
      eyebrow="Stakeholders"
      title="Demo operating network"
      pill={`${stakeholders.length} parties`}
      lead={`${activeCount} workbench operators and ${stakeholders.length - activeCount} oversight or supporting parties.`}
    >
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <ParticipationBadge mode="active" />
          <span>Custody chain actions</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <ParticipationBadge mode="passive" />
          <span>Policy, audit, or supporting role</span>
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
        {sortedStakeholders.map((stakeholder) => {
          const mode = stakeholderParticipation(stakeholder.stakeholderType);
          return (
            <EntityCard
              key={stakeholder.stakeholderId}
              className={cn('space-y-3 rounded-lg', participationCardClass[mode])}
            >
              <div className="flex justify-end">
                <ParticipationBadge mode={mode} />
              </div>
              <strong className="block min-w-0 break-words text-lg leading-snug">
                {stakeholder.name}
              </strong>
              <span className="block min-w-0 break-all text-sm text-muted-foreground">
                {stakeholder.stakeholderType}
              </span>
              <p className="text-sm text-muted-foreground">{stakeholder.district}</p>
              {(stakeholder.blockName || stakeholder.tehsilName) && (
                <p className="text-sm text-muted-foreground">
                  {[stakeholder.blockName && `Block ${stakeholder.blockName}`, stakeholder.tehsilName && `Tehsil ${stakeholder.tehsilName}`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
              {stakeholder.dealerName && (
                <p className="text-sm">
                  Dealer {stakeholder.dealerName}
                  {stakeholder.dealerId ? ` · ${stakeholder.dealerId}` : ''}
                </p>
              )}
              {stakeholder.shopNo && <p className="text-sm text-muted-foreground">Shop {stakeholder.shopNo}</p>}
              {stakeholder.location && <p className="text-sm text-muted-foreground">{stakeholder.location}</p>}
              <code className="mt-1 block break-all text-secondary">{stakeholder.stakeholderId}</code>
            </EntityCard>
          );
        })}
      </div>
    </Panel>
  );
}

type LotStatusFilter = 'ALL' | 'PENDING' | 'RECEIVED' | 'SHORTAGE';
type CommodityFilter = CommodityName | 'ALL';

const commodityFilterCounts = <T,>(items: T[], getCommodity: (item: T) => string | undefined) => {
  const counts = new Map<CommodityFilter, number>([['ALL', items.length]]);
  for (const def of COMMODITIES) {
    counts.set(def.name, items.filter((item) => getCommodity(item) === def.name).length);
  }
  return counts;
};

const CommodityFilterTabs = ({
  value,
  onChange,
  counts
}: {
  value: CommodityFilter;
  onChange: (value: CommodityFilter) => void;
  counts: Map<CommodityFilter, number>;
}) => (
  <Tabs value={value} onValueChange={(next) => onChange(next as CommodityFilter)} className="mb-4">
    <TabsList className="h-auto flex-wrap">
      <TabsTrigger value="ALL">All ({counts.get('ALL') ?? 0})</TabsTrigger>
      {COMMODITIES.map((commodity) => (
        <TabsTrigger key={commodity.slug} value={commodity.name}>
          {commodity.name} ({counts.get(commodity.name) ?? 0})
        </TabsTrigger>
      ))}
    </TabsList>
  </Tabs>
);

const isPendingLot = (lot: CommodityLot) => lot.status === LotStatus.CREATED || lot.status === LotStatus.DISPATCHED;
const isShortageLot = (lot: CommodityLot) => lot.status === LotStatus.RECEIVED_WITH_SHORTAGE;
const isReceivedLot = (lot: CommodityLot) => lot.status === LotStatus.RECEIVED || isShortageLot(lot);

export function LotsPanel({
  lots,
  onSelectLot
}: {
  lots: CommodityLot[];
  onSelectLot?: (lotId: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<LotStatusFilter>('ALL');
  const [commodityFilter, setCommodityFilter] = useState<CommodityFilter>('ALL');

  const commodityCounts = commodityFilterCounts(lots, (lot) => lot.commodity);

  const counts = {
    ALL: lots.length,
    PENDING: lots.filter(isPendingLot).length,
    RECEIVED: lots.filter(isReceivedLot).length,
    SHORTAGE: lots.filter(isShortageLot).length
  };

  const visibleLots = lots.filter((lot) => {
    if (commodityFilter !== 'ALL' && lot.commodity !== commodityFilter) return false;
    if (statusFilter === 'PENDING') return isPendingLot(lot);
    if (statusFilter === 'RECEIVED') return isReceivedLot(lot);
    if (statusFilter === 'SHORTAGE') return isShortageLot(lot);
    return true;
  });

  return (
    <Panel eyebrow="Lots" title="Commodity lots overview" pill={`${lots.length} lots`}>
      <CommodityFilterTabs value={commodityFilter} onChange={setCommodityFilter} counts={commodityCounts} />
      <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as LotStatusFilter)} className="mb-4">
        <TabsList>
          <TabsTrigger value="ALL">All ({counts.ALL})</TabsTrigger>
          <TabsTrigger value="PENDING">Pending ({counts.PENDING})</TabsTrigger>
          <TabsTrigger value="RECEIVED">Received ({counts.RECEIVED})</TabsTrigger>
          <TabsTrigger value="SHORTAGE">Shortage ({counts.SHORTAGE})</TabsTrigger>
        </TabsList>
      </Tabs>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Lot ID</TableHead>
            <TableHead scope="col">Commodity</TableHead>
            <TableHead scope="col">Status</TableHead>
            <TableHead scope="col">Quantity</TableHead>
            <TableHead scope="col">Current owner</TableHead>
            <TableHead scope="col">Current location</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleLots.map((lot) => (
            <TableRow
              key={lot.lotId}
              onClick={onSelectLot ? () => onSelectLot(lot.lotId) : undefined}
              className={onSelectLot ? 'cursor-pointer' : undefined}
            >
              <TableCell className="font-semibold">{lot.lotId}</TableCell>
              <TableCell>{lot.commodity}</TableCell>
              <TableCell>
                <Badge variant={isShortageLot(lot) ? 'warning' : 'secondary'}>{lot.status}</Badge>
              </TableCell>
              <TableCell>{lot.quantityKg} kg</TableCell>
              <TableCell>{lot.currentOwner}</TableCell>
              <TableCell>{lot.currentLocation}</TableCell>
            </TableRow>
          ))}
          {visibleLots.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No lots match this filter.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Panel>
  );
}

export function TransfersPanel({
  transfers,
  lots = []
}: {
  transfers: TransferOrder[];
  lots?: CommodityLot[];
}) {
  const commodityByLotId = new Map(lots.map((lot) => [lot.lotId, lot.commodity]));
  const [commodityFilter, setCommodityFilter] = useState<CommodityFilter>('ALL');
  const transferCommodity = (transfer: TransferOrder) => commodityByLotId.get(transfer.lotId);
  const commodityCounts = commodityFilterCounts(transfers, transferCommodity);
  const visibleTransfers =
    commodityFilter === 'ALL' ? transfers : transfers.filter((transfer) => transferCommodity(transfer) === commodityFilter);

  return (
    <Panel eyebrow="Transfers" title="Operational movement log" pill={`${transfers.length} records`}>
      <CommodityFilterTabs value={commodityFilter} onChange={setCommodityFilter} counts={commodityCounts} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Transfer ID</TableHead>
            <TableHead scope="col">Commodity</TableHead>
            <TableHead scope="col">Route</TableHead>
            <TableHead scope="col">Transporter</TableHead>
            <TableHead scope="col">Vehicle</TableHead>
            <TableHead scope="col">Dispatched</TableHead>
            <TableHead scope="col">Received</TableHead>
            <TableHead scope="col">Shortage</TableHead>
            <TableHead scope="col">Dispatch time</TableHead>
            <TableHead scope="col">Receive time</TableHead>
            <TableHead scope="col">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleTransfers.map((transfer) => (
            <TableRow key={transfer.transferId}>
              <TableCell className="font-semibold">{transfer.transferId}</TableCell>
              <TableCell>{commodityByLotId.get(transfer.lotId) ?? '—'}</TableCell>
              <TableCell className="text-muted-foreground">
                {transfer.fromOrg} → {transfer.toOrg}
              </TableCell>
              <TableCell>
                <div className="font-medium">{transfer.transporterName}</div>
                <div className="text-xs text-muted-foreground">{transfer.transporterId}</div>
              </TableCell>
              <TableCell>{transfer.vehicleNo}</TableCell>
              <TableCell>{transfer.dispatchedQtyKg} kg</TableCell>
              <TableCell>
                {transfer.receivedQtyKg == null ? 'Pending' : `${transfer.receivedQtyKg} kg`}
              </TableCell>
              <TableCell>
                {transfer.shortageQtyKg == null || transfer.shortageQtyKg === 0
                  ? '—'
                  : `${transfer.shortageQtyKg} kg`}
              </TableCell>
              <TableCell>{formatDateTime(transfer.dispatchTimestamp)}</TableCell>
              <TableCell>{formatDateTime(transfer.receiveTimestamp)}</TableCell>
              <TableCell>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-semibold',
                    transfer.status === 'RECEIVED_WITH_SHORTAGE'
                      ? 'bg-warning/15 text-warning'
                      : 'bg-secondary/10 text-secondary'
                  )}
                >
                  {transfer.status}
                </span>
              </TableCell>
            </TableRow>
          ))}
          {visibleTransfers.length === 0 && (
            <TableRow>
              <TableCell colSpan={11} className="text-center text-muted-foreground">
                No transfers match this filter.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Panel>
  );
}

export function AuthLedgerPanel({ authTransactions }: { authTransactions: AuthTransaction[] }) {
  return (
    <Panel
      eyebrow="Auth ledger"
      title="Beneficiary authentication"
      pill={`${authTransactions.length} records`}
    >
      <div className="grid gap-3 md:grid-cols-2">
        {authTransactions.map((auth) => (
          <EntityCard key={auth.authTxnId}>
            <CardTopline left={auth.authTxnId} right={auth.authResult} />
            <p className="text-muted-foreground">{auth.authMode}</p>
            <DefinitionList
              entries={[
                { label: 'Beneficiary', value: auth.beneficiaryRefHash },
                { label: 'Auth ref', value: auth.authTxnRefHash },
                { label: 'Auth time', value: formatDateTime(auth.timestamp) }
              ]}
            />
            <ProvenanceBadges provenance={auth.provenance} eventId={auth.ledgerTxId} />
          </EntityCard>
        ))}
      </div>
    </Panel>
  );
}

export function AllocationPanel({ allocations }: { allocations: FPSAllocation[] }) {
  return (
    <Panel
      eyebrow="Allocation desk"
      title="FPS allocation register"
      pill={`${allocations.length} allocations`}
    >
      <div className="grid gap-3 md:grid-cols-2">
        {allocations.map((allocation) => (
          <EntityCard key={allocation.allocationId}>
            <CardTopline left={allocation.allocationId} right={allocation.status} />
            <p className="text-muted-foreground">
              {allocation.commodity} routed to {allocation.fpsId} from {allocation.sourceGodownId}
            </p>
            <DefinitionList
              entries={[
                { label: 'Shipped', value: `${allocation.allocatedQtyKg} kg` },
                { label: 'Received', value: `${allocation.receivedQtyKg ?? 'Pending'} kg` },
                {
                  label: 'Shortage',
                  value:
                    allocation.shortageQtyKg == null || allocation.shortageQtyKg === 0
                      ? '—'
                      : `${allocation.shortageQtyKg} kg`
                },
                {
                  label: 'Transporter',
                  value: `${allocation.transporterName} (${allocation.transporterId})`
                },
                { label: 'Vehicle', value: allocation.vehicleNo },
                { label: 'Dispatch time', value: formatDateTime(allocation.dispatchTimestamp) },
                { label: 'Receive time', value: formatDateTime(allocation.receiveTimestamp) }
              ]}
            />
            <ProvenanceBadges provenance={allocation.provenance} eventId={allocation.ledgerTxId} />
          </EntityCard>
        ))}
      </div>
    </Panel>
  );
}

export function EntitlementsPanel({ entitlements }: { entitlements: MonthlyEntitlement[] }) {
  return (
    <Panel
      eyebrow="Entitlements"
      title="Monthly balance ledger"
      pill={`${entitlements.length} entries`}
    >
      <div className="grid gap-3 md:grid-cols-2">
        {entitlements.map((entitlement) => (
          <EntityCard
            key={`${entitlement.rationCardHash}:${entitlement.month}:${entitlement.commodity}`}
          >
            <CardTopline left={entitlement.rationCardHash} right={entitlement.month} />
            <p className="text-muted-foreground">{entitlement.commodity}</p>
            <DefinitionList
              entries={[
                { label: 'Monthly quota', value: `${entitlement.monthlyEntitlementKg} kg` },
                { label: 'Balance', value: `${entitlement.availableBalanceKg} kg` }
              ]}
            />
            <ProvenanceBadges provenance={entitlement.provenance} eventId={entitlement.ledgerTxId} />
          </EntityCard>
        ))}
      </div>
    </Panel>
  );
}

export function DistributionPanel({ distributions }: { distributions: DistributionTransaction[] }) {
  return (
    <Panel
      eyebrow="Distribution"
      title="Citizen receipt proof"
      pill={`${distributions.length} receipts`}
    >
      <div className="grid gap-3 md:grid-cols-2">
        {distributions.map((distribution) => (
          <EntityCard key={distribution.distributionId} tone="low">
            <CardTopline left={distribution.distributionId} right={distribution.authResult} />
            <p className="text-muted-foreground">
              {distribution.deliveredKg} kg of {distribution.commodity} issued at {distribution.fpsId}
            </p>
            <DefinitionList
              entries={[
                { label: 'Auth ref', value: distribution.authTxnRefHash },
                { label: 'Operational event ID', value: distribution.ledgerTxId ?? 'Pending' },
                { label: 'Issued at', value: formatDateTime(distribution.timestamp) }
              ]}
            />
            <ProvenanceBadges provenance={distribution.provenance} eventId={distribution.ledgerTxId} />
          </EntityCard>
        ))}
      </div>
    </Panel>
  );
}

export function AlertsPanel({ alerts }: { alerts: AuditAlert[] }) {
  return (
    <Panel eyebrow="Alert inbox" title="Audit signals and evidence" pill={`${alerts.length} open`}>
      <div className="grid gap-3 md:grid-cols-2">
        {alerts.map((alert) => (
          <EntityCard key={alert.alertId} tone={alertTone[alert.riskLevel]}>
            <CardTopline
              left={alert.alertType}
              right={alert.riskLevel}
              tone={alertTone[alert.riskLevel]}
            />
            <p className="text-muted-foreground">{alert.message}</p>
            <DefinitionList
              entries={[
                { label: 'Entity', value: alert.entityId },
                { label: 'Status', value: alert.status },
                { label: 'Created', value: formatDateTime(alert.createdAt) },
                ...(alert.resolvedAt ? [{ label: 'Resolved', value: formatDateTime(alert.resolvedAt) }] : [])
              ]}
            />
          </EntityCard>
        ))}
      </div>
    </Panel>
  );
}
