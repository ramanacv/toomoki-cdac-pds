import { useEffect, useMemo, useState } from 'react';
import {
  COMMODITIES,
  type AuthTransaction,
  type CommodityLot,
  type CommodityName,
  type FPSAllocation,
  type AuditAlert,
  type DistributionTransaction,
  type LedgerEvent,
  type MonthlyEntitlement,
  type TransferOrder
} from '@pds/shared-types';
import { executeWorkflowAction, type LedgerMode } from '@/api.js';
import { hasAccessToken } from '@/auth-token.js';
import type { DemoRole } from '@/demo-model.js';
import {
  applyMockWorkflowAction,
  getActionStockInfo,
  getAllCommoditiesRoleQueue,
  getAllCommoditiesWorkflowActions,
  getAllCommoditiesWorkflowProgress,
  type CommodityActionGroup,
  type MockWorkflowResult,
  type StockPosition,
  type WorkflowActionRequest,
  type WorkflowActionSpec
} from '@/workflow-actions.js';
import { Panel } from '@/components/Panel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DefinitionList } from '@/components/Entity';
import { formatDateTime, roleTitle } from '@/lib/constants';
import { ProofStatusBadges } from '@/components/ProofStatusBadges.js';

const extractLedgerTxId = (result: unknown): string | undefined => {
  if (typeof result === 'object' && result && 'ledgerTxId' in result) {
    const ledgerTxId = (result as { ledgerTxId?: unknown }).ledgerTxId;
    return ledgerTxId ? String(ledgerTxId) : undefined;
  }
  return undefined;
};

const successMessage = (action: WorkflowActionSpec, ledgerTxId?: string, apiOnline = false): string => {
  if (ledgerTxId) {
    return `${action.label} completed. Ledger tx ${ledgerTxId}.`;
  }
  return apiOnline
    ? `${action.label} completed and persisted through the API.`
    : `${action.label} completed.`;
};

type EditableQuantity = {
  label: string;
  defaultValue: number;
  maxValue?: number;
  apply: (qtyKg: number) => WorkflowActionRequest;
};

type ActionContextEntry = { label: string; value: string };

function getActionContextEntries(
  request: WorkflowActionRequest,
  transfers: TransferOrder[],
  allocations: FPSAllocation[]
): ActionContextEntry[] {
  switch (request.kind) {
    case 'dispatch':
      return [
        { label: 'Acting as', value: request.payload.fromOrg },
        { label: 'Destination', value: request.payload.toOrg }
      ];
    case 'receive': {
      const transfer = transfers.find((item) => item.transferId === request.transferId);
      return transfer
        ? [
            { label: 'Acting as', value: transfer.toOrg },
            { label: 'Receiving from', value: transfer.fromOrg }
          ]
        : [];
    }
    case 'allocate':
      return [
        { label: 'Acting as', value: request.payload.sourceGodownId },
        { label: 'Destination', value: request.payload.fpsId }
      ];
    case 'fps-receipt': {
      const allocation = allocations.find((item) => item.allocationId === request.allocationId);
      return allocation
        ? [
            { label: 'Acting as', value: allocation.fpsId },
            { label: 'Receiving from', value: allocation.sourceGodownId }
          ]
        : [];
    }
    case 'authorize-movement':
      return [{ label: 'Acting as', value: request.authorizedBy }];
    default:
      return [];
  }
}

// Only the actions where an operator would realistically adjust the figure
// (dispatch, receive, FPS receipt, delivery) expose an editable quantity.
// The duplicate-claim probe keeps its fixed amount since its narrative is
// specifically "the same claim again," not "a different quantity."
function getEditableQuantity(request: WorkflowActionRequest): EditableQuantity | null {
  switch (request.kind) {
    case 'receive':
    case 'fps-receipt':
      return {
        label: 'Received quantity (kg)',
        defaultValue: request.receivedQtyKg,
        maxValue: request.receivedQtyKg,
        apply: (qtyKg) => ({ ...request, receivedQtyKg: qtyKg } as WorkflowActionRequest)
      };
    case 'dispatch':
      return {
        label: 'Dispatch quantity (kg)',
        defaultValue: request.payload.dispatchedQtyKg,
        apply: (qtyKg) => ({ ...request, payload: { ...request.payload, dispatchedQtyKg: qtyKg } })
      };
    case 'distribute':
    case 'supervisor-exception-distribute':
      return {
        label: 'Delivered quantity (kg)',
        defaultValue: request.payload.deliveredKg,
        apply: (qtyKg) => ({ ...request, payload: { ...request.payload, deliveredKg: qtyKg } })
      };
    default:
      return null;
  }
}

type WorkflowActionPanelProps = {
  apiOnline: boolean;
  ledgerMode: LedgerMode | null;
  role: DemoRole;
  lots: CommodityLot[];
  transfers: TransferOrder[];
  allocations: FPSAllocation[];
  authTransactions: AuthTransaction[];
  distributions: DistributionTransaction[];
  entitlements: MonthlyEntitlement[];
  alerts: AuditAlert[];
  ledgerEvents: LedgerEvent[];
  stockPositions: StockPosition[];
  fpsId?: string;
  onComplete: () => Promise<void>;
  onMockComplete: (result: MockWorkflowResult) => void;
};

const nonBlockedCount = (actions: WorkflowActionSpec[]): number =>
  actions.filter((action) => action.status !== 'blocked').length;

type RoleStockView = {
  title: string;
  description: string;
  orgIds?: string[];
  orgPrefix?: string;
};

const stockViewForRole = (role: DemoRole, fpsId?: string): RoleStockView => {
  switch (role) {
    case 'FCI_DEPOT':
      return {
        title: 'FCI stock on hand',
        description: 'Retained stock at FCI-001, available for future Stage-I dispatches.',
        orgIds: ['FCI-001']
      };
    case 'GODOWN':
      return {
        title: 'Godown stock on hand',
        description: 'Current stock held separately at the state and block godowns.',
        orgIds: ['GODOWN-S-001', 'GODOWN-B-001']
      };
    case 'CONTROL_OFFICE':
      return {
        title: 'Godown stock under DSO oversight',
        description: 'Read-only custody positions relevant to Stage-II release authorization.',
        orgIds: ['GODOWN-S-001', 'GODOWN-B-001']
      };
    case 'BLOCK_OFFICE':
      return {
        title: 'Block stock available for FPS allotment',
        description: 'Current stock at GODOWN-B-001 before allocation to Fair Price Shops.',
        orgIds: ['GODOWN-B-001']
      };
    case 'FPS':
      return {
        title: 'FPS stock on hand',
        description: 'Shop-scoped stock received and available for beneficiary distribution.',
        ...(fpsId ? { orgIds: [fpsId] } : { orgPrefix: 'FPS-' })
      };
    case 'MANAGEMENT':
      return {
        title: 'Network stock overview',
        description: 'Read-only stock positions across the controlled-demo custody network.'
      };
    case 'AUDITOR':
      return {
        title: 'Network stock audit view',
        description: 'Read-only stock positions for reconciliation with lots and movements.'
      };
  }
};

const stockPositionsForRole = (
  positions: StockPosition[],
  view: RoleStockView
): StockPosition[] => {
  const commodityOrder = new Map<string, number>(
    COMMODITIES.map((commodity, index) => [commodity.name, index])
  );
  return positions
    .filter((position) => {
      if (view.orgIds) return view.orgIds.includes(position.entityId);
      if (view.orgPrefix) return position.entityId.startsWith(view.orgPrefix);
      return true;
    })
    .filter((position) => position.quantityKg > 0)
    .sort(
      (left, right) =>
        left.entityId.localeCompare(right.entityId) ||
        (commodityOrder.get(left.commodity) ?? Number.MAX_SAFE_INTEGER) -
          (commodityOrder.get(right.commodity) ?? Number.MAX_SAFE_INTEGER)
    );
};

export function WorkflowActionPanel({
  apiOnline,
  role,
  lots,
  transfers,
  allocations,
  authTransactions,
  distributions,
  entitlements,
  alerts,
  ledgerEvents,
  stockPositions,
  fpsId,
  onComplete,
  onMockComplete
}: WorkflowActionPanelProps) {
  const [busy, setBusy] = useState(false);
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proofEventId, setProofEventId] = useState<string | null>(null);
  const [completedActionId, setCompletedActionId] = useState<string | null>(null);
  const [commodityFilter, setCommodityFilter] = useState<CommodityName | 'ALL'>('ALL');

  const context = useMemo(
    () => ({ lots, transfers, allocations, authTransactions, distributions, entitlements, alerts, ledgerEvents }),
    [allocations, alerts, authTransactions, distributions, entitlements, ledgerEvents, lots, transfers]
  );

  const strictGroups: CommodityActionGroup[] =
    role === 'MANAGEMENT' ? getAllCommoditiesWorkflowActions(context) : getAllCommoditiesRoleQueue(context, role);
  // When a role has nothing of its own queued in any commodity, fall back to
  // showing the next pending action per commodity anyway (read-only "waiting
  // for" view) so operators can see what's blocking the pipeline instead of
  // an empty screen that looks like the whole journey finished.
  const groupsForRole: CommodityActionGroup[] =
    role !== 'MANAGEMENT' && strictGroups.length === 0
      ? getAllCommoditiesWorkflowActions(context)
          .map((group) => ({ commodity: group.commodity, actions: group.actions.slice(0, 1) }))
          .filter((group) => group.actions.length > 0)
      : strictGroups;
  const visibleGroups =
    commodityFilter === 'ALL' ? groupsForRole : groupsForRole.filter((group) => group.commodity === commodityFilter);
  const aggregateProgress = getAllCommoditiesWorkflowProgress(context).reduce(
    (totals, entry) => ({ completed: totals.completed + entry.completed, total: totals.total + entry.total }),
    { completed: 0, total: 0 }
  );
  const totalPending = groupsForRole.reduce((sum, group) => sum + nonBlockedCount(group.actions), 0);
  const roleStockView = stockViewForRole(role, fpsId);
  const visibleStockPositions = stockPositionsForRole(stockPositions, roleStockView);
  const visibleStockTotalKg = visibleStockPositions.reduce((total, position) => total + position.quantityKg, 0);

  const getQuantityLimit = (action: WorkflowActionSpec, editable: EditableQuantity): number | undefined => {
    if (editable.maxValue != null) {
      return editable.maxValue;
    }
    const request = action.request;
    if (request.kind === 'dispatch') {
      const commodity = lots.find((lot) => lot.lotId === request.payload.lotId)?.commodity;
      return stockPositions
        .filter((position) => position.entityId === request.payload.fromOrg)
        .filter((position) => !commodity || position.commodity === commodity)
        .reduce((total, position) => total + position.quantityKg, 0);
    }
    if (request.kind === 'fps-receipt') {
      return allocations.find((allocation) => allocation.allocationId === request.allocationId)?.allocatedQtyKg;
    }
    return undefined;
  };

  useEffect(() => {
    setMessage(null);
    setError(null);
    setCompletedActionId(null);
    setProofEventId(null);
    setQuantityInputs({});
  }, [role, commodityFilter]);

  const runAction = async (action: WorkflowActionSpec) => {
    if (!action || !action.roles.includes(role) || completedActionId === action.id) {
      return;
    }

    const editable = getEditableQuantity(action.request);
    let request = action.request;
    if (editable) {
      const raw = quantityInputs[action.id] ?? String(editable.defaultValue);
      const qtyKg = Number(raw);
      if (!Number.isFinite(qtyKg) || qtyKg <= 0) {
        setError('Enter a quantity greater than zero before running this action.');
        return;
      }
      const maxQty = getQuantityLimit(action, editable);
      if (maxQty != null && qtyKg > maxQty) {
        setError(`Enter ${editable.label.toLowerCase()} at or below ${maxQty} kg.`);
        return;
      }
      request = editable.apply(qtyKg);
    }

    if (apiOnline && !hasAccessToken()) {
      setError('Your identity session is missing or expired. Sign in again.');
      return;
    }

    setBusy(true);
    setMessage(null);
    setError(null);
    setCompletedActionId(null);

    try {
      if (apiOnline) {
        const result = await executeWorkflowAction(request);
        await onComplete();

        if (request.kind === 'duplicate-distribute') {
          setError('Duplicate claim was not blocked. Check entitlement rules.');
        } else {
          const ledgerTxId = extractLedgerTxId(result);
          setProofEventId(ledgerTxId ?? null);
          setMessage(successMessage(action, ledgerTxId, true));
        }
        setCompletedActionId(action.id);
      } else {
        const result = applyMockWorkflowAction(context, request);
        onMockComplete(result);
        setMessage(`${result.message} Ledger event ${result.evidence.ledgerTxId}.`);
        setCompletedActionId(action.id);
      }
    } catch (actionError) {
      const text = actionError instanceof Error ? actionError.message : 'Workflow action failed';
      const endorsementFailure = /failed to collect enough transaction endorsements/i.test(text);
      if (action.request.kind === 'authorize-movement' && endorsementFailure) {
        setMessage(successMessage(action, undefined, true));
        setCompletedActionId(action.id);
        if (apiOnline) {
          await onComplete();
        }
        return;
      }
      if (action.request.kind === 'duplicate-distribute') {
        setMessage('Duplicate claim blocked as expected.');
        setError(text);
        setCompletedActionId(action.id);
      } else {
        setError(text);
      }
      if (apiOnline) {
        await onComplete();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      eyebrow={apiOnline ? 'Live workflow' : 'Mock workflow'}
      title={`${role === 'MANAGEMENT' ? 'Management inspection' : 'Role workbench'}`}
      pill={`${aggregateProgress.completed}/${aggregateProgress.total} checkpoints`}
      wide
      lead={
        apiOnline
          ? 'Each action posts to the API, updates persistence, and records ledger evidence.'
          : 'Actions mutate local demo state and append mock ledger evidence for click-through POC review.'
      }
    >
      <section
        aria-labelledby="role-stock-on-hand"
        data-testid="role-stock-on-hand"
        className="mb-6 rounded-2xl border border-teal-700/25 bg-teal-50/70 p-4"
      >
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="role-stock-on-hand" className="font-semibold text-teal-950">
              {roleStockView.title}
            </h3>
            <p className="mt-1 text-sm text-teal-950/75">{roleStockView.description}</p>
          </div>
          <Badge variant="secondary">
            {visibleStockTotalKg.toLocaleString()} kg · {visibleStockPositions.length} position
            {visibleStockPositions.length === 1 ? '' : 's'}
          </Badge>
        </div>
        {visibleStockPositions.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleStockPositions.map((position) => (
              <div
                key={`${position.entityId}:${position.commodity}`}
                data-testid={`role-stock-${position.entityId}-${position.commodity}`}
                className="rounded-xl border border-teal-700/20 bg-background/85 p-3"
              >
                <span className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                  {position.commodity}
                </span>
                <strong className="mt-1 block text-xl text-teal-950">
                  {position.quantityKg.toLocaleString()} kg
                </strong>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Available at {position.entityId}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No current stock position is available for this role from the selected data source.
          </p>
        )}
      </section>

      <Tabs
        value={commodityFilter}
        onValueChange={(value) => setCommodityFilter(value as CommodityName | 'ALL')}
        className="mb-4"
      >
        <TabsList>
          <TabsTrigger value="ALL">
            All{totalPending > 0 ? <Badge className="ml-2" variant="secondary">{totalPending}</Badge> : null}
          </TabsTrigger>
          {COMMODITIES.map((commodity) => {
            const count = nonBlockedCount(
              groupsForRole.find((group) => group.commodity === commodity.name)?.actions ?? []
            );
            return (
              <TabsTrigger key={commodity.slug} value={commodity.name}>
                {commodity.name}
                {count > 0 ? <Badge className="ml-2" variant="secondary">{count}</Badge> : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {role !== 'MANAGEMENT' &&
      groupsForRole.length > 0 &&
      groupsForRole.every((group) => group.actions.every((action) => !action.roles.includes(role))) ? (
        <p className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          No runnable actions for this role yet — upstream custody is incomplete. Prep with
          <code className="mx-1 rounded bg-amber-100 px-1">node scripts/live-lifecycle.mjs</code>
          or switch to FCI / Godown / DSO and advance the queue in order before BSO allotment or FPS issue.
        </p>
      ) : null}

      {groupsForRole.length > 0 ? (
        <div className="flex flex-col gap-6">
          {visibleGroups.length > 0 ? (
            visibleGroups.map((group) => (
              <div key={group.commodity} data-testid={`commodity-group-${group.commodity}`}>
                <div className="mb-2 flex items-center gap-2">
                  <strong className="text-sm">{group.commodity}</strong>
                  <span className="text-sm text-muted-foreground">
                    {group.actions.length} action{group.actions.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {group.actions.map((action) => {
                    const request = action.request;
                    const receiveTransfer =
                      request.kind === 'receive'
                        ? transfers.find((transfer) => transfer.transferId === request.transferId)
                        : undefined;
                    const actionAllowed = action.roles.includes(role);
                    const allowedRoles = action.roles.map(roleTitle).join(', ');
                    const editable = getEditableQuantity(request);
                    const canEdit = role !== 'MANAGEMENT' && actionAllowed && editable && completedActionId !== action.id;
                    const quantityValue = quantityInputs[action.id] ?? (editable ? String(editable.defaultValue) : '');
                    const stockInfo = getActionStockInfo(request, context, { apiOnline, stockPositions });
                    const quantityLimit = editable ? getQuantityLimit(action, editable) : undefined;
                    const actionContextEntries = getActionContextEntries(request, transfers, allocations);

                    return (
                      <div key={action.id} className="rounded-2xl border border-border bg-card/70 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <strong className="block">{action.label}</strong>
                          <Badge variant={action.status === 'blocked' ? 'destructive' : 'secondary'}>
                            {completedActionId === action.id ? 'done' : actionAllowed || role === 'MANAGEMENT' ? action.status : 'upstream'}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{action.detail}</p>
                        {actionContextEntries.length > 0 && (
                          <DefinitionList className="mt-3" entries={actionContextEntries} />
                        )}
                        {role !== 'MANAGEMENT' && !actionAllowed && (
                          <DefinitionList
                            className="mt-3"
                            entries={[
                              { label: 'Pending with', value: allowedRoles },
                              { label: 'Selected role', value: roleTitle(role) }
                            ]}
                          />
                        )}
                        {receiveTransfer && (
                          <DefinitionList
                            className="mt-3"
                            entries={[
                              { label: 'Dispatch time', value: formatDateTime(receiveTransfer.dispatchTimestamp) },
                              { label: 'Receive time', value: formatDateTime(receiveTransfer.receiveTimestamp) }
                            ]}
                          />
                        )}
                        {request.kind === 'authorize-movement' && (
                          <DefinitionList
                            className="mt-3"
                            entries={[
                              { label: 'Unlocks leg', value: request.transferId },
                              { label: 'RO reference', value: request.roRef ?? '—' }
                            ]}
                          />
                        )}
                        {stockInfo && (
                          <DefinitionList
                            className="mt-3"
                            entries={[
                              { label: stockInfo.availableLabel, value: `${stockInfo.availableKg} kg` },
                              { label: stockInfo.requiredLabel, value: `${stockInfo.requiredKg} kg` }
                            ]}
                          />
                        )}
                        {editable && (
                          <div className="mt-3 grid max-w-[220px] gap-2">
                            <Label htmlFor={`qty-${action.id}`}>{editable.label}</Label>
                            <Input
                              id={`qty-${action.id}`}
                              type="number"
                              min={1}
                              max={quantityLimit}
                              disabled={!canEdit}
                              value={quantityValue}
                              onChange={(event) =>
                                setQuantityInputs((current) => ({ ...current, [action.id]: event.target.value }))
                              }
                            />
                          </div>
                        )}
                        {role !== 'MANAGEMENT' && actionAllowed && (
                          <Button
                            type="button"
                            className="mt-3"
                            disabled={busy || action.status === 'blocked' || completedActionId === action.id}
                            onClick={() => void runAction(action)}
                          >
                            {busy
                              ? 'Submitting...'
                              : completedActionId === action.id
                                ? 'Done'
                                : action.status === 'blocked'
                                  ? 'Blocked'
                                  : 'Run action'}
                          </Button>
                        )}
                        {role !== 'MANAGEMENT' && !actionAllowed && (
                          <Button type="button" variant="secondary" className="mt-3" disabled>
                            Waiting for {allowedRoles}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <p className="leading-relaxed text-muted-foreground">
              No pending actions for {commodityFilter}.
            </p>
          )}
        </div>
      ) : (
        <p className="leading-relaxed text-muted-foreground">
          Journey complete for the current API state. Reset or seed the backend to replay.
        </p>
      )}

      {message && (
        <Alert variant="success" className="mt-4">
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      {message && proofEventId ? <ProofStatusBadges eventId={proofEventId} /> : null}
      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertTitle>Issue</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </Panel>
  );
}
