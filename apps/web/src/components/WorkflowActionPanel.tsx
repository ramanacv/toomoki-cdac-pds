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
import { hasSavedDevAuthToken } from '@/auth-token.js';
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
  apply: (qtyKg: number) => WorkflowActionRequest;
};

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
  onComplete: () => Promise<void>;
  onMockComplete: (result: MockWorkflowResult) => void;
};

const nonBlockedCount = (actions: WorkflowActionSpec[]): number =>
  actions.filter((action) => action.status !== 'blocked').length;

export function WorkflowActionPanel({
  apiOnline,
  ledgerMode,
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
  onComplete,
  onMockComplete
}: WorkflowActionPanelProps) {
  const [busy, setBusy] = useState(false);
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    setMessage(null);
    setError(null);
    setCompletedActionId(null);
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
      request = editable.apply(qtyKg);
    }

    if (apiOnline && ledgerMode === 'fabric' && !hasSavedDevAuthToken()) {
      setError(
        'Fabric mode requires a saved API bearer token. Enter dev-mvp-token in the banner at the top and click Save token.'
      );
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

                    return (
                      <div key={action.id} className="rounded-2xl border border-border bg-card/70 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <strong className="block">{action.label}</strong>
                          <Badge variant={action.status === 'blocked' ? 'destructive' : 'secondary'}>
                            {completedActionId === action.id ? 'done' : actionAllowed || role === 'MANAGEMENT' ? action.status : 'upstream'}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{action.detail}</p>
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
                              { label: 'From', value: receiveTransfer.fromOrg },
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
                              { label: 'Available', value: `${stockInfo.availableKg} kg` },
                              { label: 'Required', value: `${stockInfo.requiredKg} kg` }
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
      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertTitle>Issue</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </Panel>
  );
}
