import { useMemo, useState } from 'react';
import type {
  AuthTransaction,
  CommodityLot,
  DistributionTransaction,
  FPSAllocation,
  AuditAlert,
  LedgerEvent,
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
  type WorkflowActionSpec
} from '@/workflow-actions.js';
import { Panel } from '@/components/Panel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type WorkflowActionPanelProps = {
  apiOnline: boolean;
  role: DemoRole;
  lots: CommodityLot[];
  transfers: TransferOrder[];
  allocations: FPSAllocation[];
  authTransactions: AuthTransaction[];
  distributions: DistributionTransaction[];
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
  alerts,
  ledgerEvents,
  onComplete,
  onMockComplete
}: WorkflowActionPanelProps) {
  const [busy, setBusy] = useState(false);
  const [receiveQtyKg, setReceiveQtyKg] = useState(1000);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const context = useMemo(
    () => ({ lots, transfers, allocations, authTransactions, distributions, alerts, ledgerEvents }),
    [allocations, alerts, authTransactions, distributions, ledgerEvents, lots, transfers]
  );

  const progress = getWorkflowProgress(context);
  const allActions = getWorkflowActions(context);
  const roleQueue = getRoleQueue(context, role);
  const nextAction = roleQueue.find((action) => action.status !== 'blocked') ?? roleQueue[0] ?? allActions[0] ?? null;
  const roleAllowed = nextAction ? nextAction.roles.includes(role) : false;

  const runAction = async (action: WorkflowActionSpec) => {
    if (!action || !roleAllowed) {
      return;
    }

    setBusy(true);
    setMessage(null);
    setError(null);

    try {
      const request =
        action.request.kind === 'receive'
          ? { ...action.request, receivedQtyKg: receiveQtyKg }
          : action.request;

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
      } else {
        const result = applyMockWorkflowAction(context, request);
        onMockComplete(result);
        setMessage(`${result.message} Ledger event ${result.evidence.ledgerTxId}.`);
      }
    } catch (actionError) {
      const text = actionError instanceof Error ? actionError.message : 'Workflow action failed';
      if (action.request.kind === 'duplicate-distribute') {
        setMessage('Duplicate claim blocked as expected.');
        setError(text);
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
            {(role === 'MANAGEMENT' ? allActions : roleQueue.length > 0 ? roleQueue : [nextAction]).map((action) => (
              <div key={action.id} className="rounded-2xl border border-border bg-card/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <strong className="block">{action.label}</strong>
                  <Badge variant={action.status === 'blocked' ? 'destructive' : 'secondary'}>
                    {action.status}
                  </Badge>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{action.detail}</p>
                {role !== 'MANAGEMENT' && action.roles.includes(role) && (
                  <Button
                    type="button"
                    className="mt-3"
                    disabled={busy || action.status === 'blocked'}
                    onClick={() => void runAction(action)}
                  >
                    {busy ? 'Submitting...' : action.status === 'blocked' ? 'Blocked' : 'Run action'}
                  </Button>
                )}
              </div>
            ))}
          </div>

          {nextAction.request.kind === 'receive' && (
            <div className="grid max-w-sm gap-2">
              <Label htmlFor="receive-qty">Received quantity (kg)</Label>
              <Input
                id="receive-qty"
                type="number"
                min={1}
                value={receiveQtyKg}
                onChange={(event) => setReceiveQtyKg(Number(event.target.value))}
              />
            </div>
          )}

          {!roleAllowed && role !== 'MANAGEMENT' && <Badge variant="secondary">Allowed: {nextAction.roles.join(', ')}</Badge>}
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
