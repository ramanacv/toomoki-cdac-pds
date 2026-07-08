import type {
  AuditAlert,
  AuthTransaction,
  CommodityLot,
  DistributionTransaction,
  FPSAllocation,
  MonthlyEntitlement,
  Stakeholder,
  TransferOrder
} from '@pds/shared-types';
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
import { formatDateTime } from '@/lib/constants';
import { cn } from '@/lib/utils';

const alertTone: Record<AuditAlert['riskLevel'], 'low' | 'medium' | 'high'> = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
};

export function StakeholdersPanel({ stakeholders }: { stakeholders: Stakeholder[] }) {
  return (
    <Panel
      eyebrow="Stakeholders"
      title="Demo operating network"
      pill={`${stakeholders.length} parties`}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {stakeholders.map((stakeholder) => (
          <EntityCard key={stakeholder.stakeholderId} className="space-y-1">
            <strong className="block">{stakeholder.name}</strong>
            <span className="block text-sm text-muted-foreground">{stakeholder.stakeholderType}</span>
            <p className="text-sm text-muted-foreground">{stakeholder.district}</p>
            <code className="mt-3 block text-secondary">{stakeholder.stakeholderId}</code>
          </EntityCard>
        ))}
      </div>
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

  return (
    <Panel eyebrow="Transfers" title="Operational movement log" pill={`${transfers.length} records`}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Transfer ID</TableHead>
            <TableHead scope="col">Commodity</TableHead>
            <TableHead scope="col">Route</TableHead>
            <TableHead scope="col">Dispatched</TableHead>
            <TableHead scope="col">Received</TableHead>
            <TableHead scope="col">Dispatch time</TableHead>
            <TableHead scope="col">Receive time</TableHead>
            <TableHead scope="col">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transfers.map((transfer) => (
            <TableRow key={transfer.transferId}>
              <TableCell className="font-semibold">{transfer.transferId}</TableCell>
              <TableCell>{commodityByLotId.get(transfer.lotId) ?? '—'}</TableCell>
              <TableCell className="text-muted-foreground">
                {transfer.fromOrg} → {transfer.toOrg}
              </TableCell>
              <TableCell>{transfer.dispatchedQtyKg} kg</TableCell>
              <TableCell>
                {transfer.receivedQtyKg == null ? 'Pending' : `${transfer.receivedQtyKg} kg`}
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
                { label: 'Allocated', value: `${allocation.allocatedQtyKg} kg` },
                { label: 'Received', value: `${allocation.receivedQtyKg ?? 'Pending'} kg` }
              ]}
            />
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
                { label: 'Ledger tx', value: distribution.ledgerTxId ?? 'Pending' },
                { label: 'Issued at', value: formatDateTime(distribution.timestamp) }
              ]}
            />
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
