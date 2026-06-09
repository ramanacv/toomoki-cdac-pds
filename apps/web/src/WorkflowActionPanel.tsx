import { useMemo, useState } from 'react';
import type { AuthTransaction, DistributionTransaction, FPSAllocation, TransferOrder, CommodityLot } from '@pds/shared-types';
import { executeWorkflowAction } from './api.js';
import type { DemoRole } from './demo-model.js';
import { getNextWorkflowAction, getWorkflowProgress } from './workflow-actions.js';

type WorkflowActionPanelProps = {
  apiOnline: boolean;
  role: DemoRole;
  lots: CommodityLot[];
  transfers: TransferOrder[];
  allocations: FPSAllocation[];
  authTransactions: AuthTransaction[];
  distributions: DistributionTransaction[];
  allowDuplicateClaim?: boolean;
  onComplete: () => Promise<void>;
};

export function WorkflowActionPanel({
  apiOnline,
  role,
  lots,
  transfers,
  allocations,
  authTransactions,
  distributions,
  allowDuplicateClaim = false,
  onComplete
}: WorkflowActionPanelProps) {
  const [busy, setBusy] = useState(false);
  const [receiveQtyKg, setReceiveQtyKg] = useState(1000);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const context = useMemo(
    () => ({ lots, transfers, allocations, authTransactions, distributions }),
    [allocations, authTransactions, distributions, lots, transfers]
  );

  const progress = getWorkflowProgress(context);
  const nextAction = getNextWorkflowAction(context, { receiveQtyKg, allowDuplicateClaim });
  const roleAllowed = nextAction ? nextAction.roles.includes(role) : false;

  const runAction = async () => {
    if (!nextAction || !apiOnline) {
      return;
    }

    setBusy(true);
    setMessage(null);
    setError(null);

    try {
      const result = await executeWorkflowAction(nextAction.request);
      await onComplete();

      if (nextAction.request.kind === 'duplicate-distribute') {
        setError('Duplicate claim was not blocked. Check entitlement rules.');
      } else if (nextAction.request.kind === 'distribute' || nextAction.request.kind === 'receive') {
        const ledgerTxId =
          typeof result === 'object' && result && 'ledgerTxId' in result
            ? String((result as DistributionTransaction).ledgerTxId ?? '')
            : '';
        setMessage(
          ledgerTxId
            ? `${nextAction.label} completed. Ledger tx ${ledgerTxId}.`
            : `${nextAction.label} completed and persisted through the API.`
        );
      } else {
        setMessage(`${nextAction.label} completed and persisted through the API.`);
      }
    } catch (actionError) {
      const text = actionError instanceof Error ? actionError.message : 'Workflow action failed';
      if (nextAction.request.kind === 'duplicate-distribute') {
        setMessage('Duplicate claim blocked as expected.');
        setError(text);
      } else {
        setError(text);
      }
      await onComplete();
    } finally {
      setBusy(false);
    }
  };

  if (!apiOnline) {
    return (
      <article className="panel panel-wide workflow-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow compact">Live workflow</p>
            <h2>API required for mutations</h2>
          </div>
        </div>
        <p className="panel-lead">
          Start the backend API to drive dispatch, receipt, allocation, authentication, and distribution through the
          database plus ledger write path.
        </p>
      </article>
    );
  }

  return (
    <article className="panel panel-wide workflow-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow compact">Live workflow</p>
          <h2>Drive the chain from the UI</h2>
        </div>
        <span className="pill pill-soft">
          {progress.completed}/{progress.total} checkpoints
        </span>
      </div>

      <p className="panel-lead">
        Each action posts to the API, updates PostgreSQL, and records a ledger event. Reads still come from the database.
      </p>

      {nextAction ? (
        <>
          <div className="workflow-next">
            <strong>{nextAction.label}</strong>
            <p>{nextAction.detail}</p>
          </div>

          {nextAction.request.kind === 'receive' && (
            <div className="field-row">
              <label>
                Received quantity (kg)
                <input
                  type="number"
                  min={1}
                  value={receiveQtyKg}
                  onChange={(event) => setReceiveQtyKg(Number(event.target.value))}
                />
              </label>
            </div>
          )}

          <div className="login-actions">
            <button type="button" className="primary" disabled={busy || !roleAllowed} onClick={() => void runAction()}>
              {busy ? 'Submitting…' : roleAllowed ? 'Run next step' : 'Switch role to run this step'}
            </button>
            {!roleAllowed && <span className="pill pill-soft">Allowed: {nextAction.roles.join(', ')}</span>}
          </div>
        </>
      ) : (
        <p className="panel-lead">Journey complete for the current API state. Reset or seed the backend to replay.</p>
      )}

      {message && <p className="workflow-message success">{message}</p>}
      {error && <p className="workflow-message error">{error}</p>}
    </article>
  );
}
