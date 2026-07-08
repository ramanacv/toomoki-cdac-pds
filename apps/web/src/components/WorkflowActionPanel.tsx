import { useEffect, useMemo, useState } from 'react';
import type {
  AuthTransaction,
  CommodityLot,
  DistributionTransaction,
  FPSAllocation,
  AuditAlert,
  LedgerEvent,
  MonthlyEntitlement,
  TransferOrder
} from '@pds/shared-types';
import { executeWorkflowAction } from '@/api.js';
import type { DemoRole } from '@/demo-model.js';
import {
  applyMockWorkflowAction,
  getRoleQueue,
  getWorkflowActions,
  getWorkflowProgress,
  type MockWorkflowResult,
  type WorkflowActionRequest,
  type WorkflowActionSpec
} from '@/workflow-actions.js';
import { Panel } from '@/components/Panel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DefinitionList } from '@/components/Entity';
import { formatDateTime, roleTitle } from '@/lib/constants';

type EditableQuantity = {
  label: string;
  defaultValue: number;
  apply: (qtyKg: number) => WorkflowActionRequest;
};

// Only the actions where an operator would realistically adjust the figure
// (dispatch, receive, milling yield, delivery) expose an editable quantity.
// The duplicate-claim probe keeps its fixed amount since its narrative is
// specifically "the same claim again," not "a different quantity."
function getEditableQuantity(request: WorkflowActionRequest): EditableQuantity | null {
  switch (request.kind) {
    case 'receive':
      return {
        label: 'Received quantity (kg)',
        defaultValue: request.receivedQtyKg,
        apply: (qtyKg) => ({ ...request, receivedQtyKg: qtyKg })
      };
    case 'dispatch':
      return {
        label: 'Dispatch quantity (kg)',
        defaultValue: request.payload.dispatchedQtyKg,
        apply: (qtyKg) => ({ ...request, payload: { ...request.payload, dispatchedQtyKg: qtyKg } })
      };
    case 'transform-lot':
      return {
        label: 'Milled quantity (kg)',
        defaultValue: request.payload.quantityKg,
        apply: (qtyKg) => ({ ...request, payload: { ...request.payload, quantityKg: qtyKg } })
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
  role: DemoRole;
  lots: CommodityLot[];
  transfers: TransferOrder[];
  allocations: FPSAllocation[];
  authTransactions: AuthTransaction[];
  distributions: DistributionTransaction[];
  entitlements: MonthlyEntitlement[];
  alerts: AuditAlert[];
  ledgerEvents: LedgerEvent[];
  onComplete: () => Promise<void>;
  onMockComplete: (result: MockWorkflowResult) => void;
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
  onComplete,
  onMockComplete
}: WorkflowActionPanelProps) {
  const [busy, setBusy] = useState(false);
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completedActionId, setCompletedActionId] = useState<string | null>(null);

  const context = useMemo(
    () => ({ lots, transfers, allocations, authTransactions, distributions, entitlements, alerts, ledgerEvents }),
    [allocations, alerts, authTransactions, distributions, entitlements, ledgerEvents, lots, transfers]
  );

  const progress = getWorkflowProgress(context);
  const allActions = getWorkflowActions(context);
  const roleQueue = getRoleQueue(context, role);
  const nextAction = roleQueue.find((action) => action.status !== 'blocked') ?? roleQueue[0] ?? allActions[0] ?? null;
  const displayedActions = role === 'MANAGEMENT' ? allActions : roleQueue.length > 0 ? roleQueue : nextAction ? [nextAction] : [];
  const nextActionAllowed = nextAction ? nextAction.roles.includes(role) : false;

  useEffect(() => {
    setMessage(null);
    setError(null);
    setCompletedActionId(null);
    setQuantityInputs({});
  }, [role]);

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
        } else if (request.kind === 'distribute' || request.kind === 'receive') {
          const ledgerTxId =
            typeof result === 'object' && result && 'ledgerTxId' in result
              ? String((result as DistributionTransaction).ledgerTxId ?? '')
              : '';
          setMessage(
            ledgerTxId
              ? `${action.label} completed. Ledger tx ${ledgerTxId}.`
              : `${action.label} completed and persisted through the API.`
          );
        } else {
          setMessage(`${action.label} completed and persisted through the API.`);
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
      pill={`${progress.completed}/${progress.total} checkpoints`}
      wide
      lead={
        apiOnline
          ? 'Each action posts to the API, updates persistence, and records ledger evidence.'
          : 'Actions mutate local demo state and append mock ledger evidence for click-through POC review.'
      }
    >
      {nextAction ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            {displayedActions.map((action) => {
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

          {!nextActionAllowed && role !== 'MANAGEMENT' && <Badge variant="secondary">Allowed: {nextAction.roles.map(roleTitle).join(', ')}</Badge>}
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
