import { Inject, Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import type { EligibilityCase, EligibilityCaseAction, EligibilityScreeningResponse } from '@pds/shared-types';
import { createHash } from 'node:crypto';

const sha256 = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const ELIGIBILITY_DB_POOL = Symbol('ELIGIBILITY_DB_POOL');

/** Authorized adjudication checkpoints that enqueue privacy-safe Fabric proofs. */
export const ELIGIBILITY_PROOF_ACTIONS = new Set<EligibilityCaseAction['action']>([
  'NOTICE',
  'VERIFICATION',
  'RECOMMENDATION',
  'DECISION',
  'APPEAL',
  'REINSTATEMENT'
]);

const ELIGIBILITY_ACTION_EVENT_TYPES: Partial<Record<EligibilityCaseAction['action'], string>> = {
  NOTICE: 'EligibilityNoticeIssued',
  VERIFICATION: 'EligibilityVerificationRecorded',
  RECOMMENDATION: 'EligibilityRecommendationRecorded',
  DECISION: 'EligibilityDecisionAuthorized',
  APPEAL: 'EligibilityAppealOpened',
  REINSTATEMENT: 'EligibilityDecisionReversed'
};

type EligibilityPool = Pick<Pool, 'connect' | 'end'>;
type ScreeningResult = {
  screening: EligibilityScreeningResponse;
  case: EligibilityCase | null;
  entitlementPreserved: boolean;
};
export type LoadedEligibilityState = {
  cases: EligibilityCase[];
  actions: Array<{ idempotencyKey: string; requestHash: string; result: EligibilityCase }>;
  screenings: Array<{ screeningRequestId: string; requestHash: string; result: ScreeningResult }>;
};

@Injectable()
export class EligibilityRepository implements OnModuleDestroy {
  private readonly pool: EligibilityPool | undefined;

  constructor(@Optional() @Inject(ELIGIBILITY_DB_POOL) injectedPool?: EligibilityPool) {
    this.pool = injectedPool ??
      (process.env.PDS_PERSISTENCE_BACKEND === 'postgres' && process.env.PDS_POSTGRES_DSN
        ? new Pool({ connectionString: process.env.PDS_POSTGRES_DSN, max: 2 })
        : undefined);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  async loadState(): Promise<LoadedEligibilityState> {
    if (!this.pool) return { cases: [], actions: [], screenings: [] };
    const client = await this.pool.connect();
    try {
      const [caseRows, actionRows, screeningRows] = await Promise.all([
        client.query('SELECT * FROM eligibility_cases WHERE screening IS NOT NULL ORDER BY updated_at, case_id'),
        client.query('SELECT idempotency_key, request_hash, case_snapshot FROM eligibility_case_actions WHERE case_snapshot IS NOT NULL ORDER BY occurred_at, action_id'),
        client.query('SELECT screening_request_id, request_hash, response FROM eligibility_screenings ORDER BY created_at, screening_request_id')
      ]);
      const actionsByCase = new Map<string, EligibilityCaseAction[]>();
      for (const row of actionRows.rows) {
        const snapshot = row.case_snapshot as EligibilityCase;
        actionsByCase.set(snapshot.caseId, snapshot.history);
      }
      return {
        cases: caseRows.rows.map((row) => this.mapCase(row, actionsByCase.get(String(row.case_id)) ?? [])),
        actions: actionRows.rows.map((row) => ({
          idempotencyKey: String(row.idempotency_key),
          requestHash: String(row.request_hash),
          result: row.case_snapshot as EligibilityCase
        })),
        screenings: screeningRows.rows.map((row) => ({
          screeningRequestId: String(row.screening_request_id),
          requestHash: String(row.request_hash),
          result: row.response as ScreeningResult
        }))
      };
    } finally {
      client.release();
    }
  }

  async loadProofStatuses(eventIds: string[]): Promise<Map<string, EligibilityCase['proofStatus']>> {
    if (!this.pool || eventIds.length === 0) return new Map();
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT event_id, status FROM ledger_outbox WHERE event_id = ANY($1::text[])',
        [eventIds]
      );
      return new Map(result.rows.map((row) => [
        String(row.event_id),
        (String(row.status) === 'SUBMITTING' ? 'PENDING' : String(row.status)) as EligibilityCase['proofStatus']
      ]));
    } finally {
      client.release();
    }
  }

  /** Write refreshed outbox-derived proof status back to eligibility_cases. */
  async syncProofStatuses(
    updates: Array<{ caseId: string; proofEventId: string; proofStatus: EligibilityCase['proofStatus'] }>
  ): Promise<void> {
    if (!this.pool || updates.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const update of updates) {
        await client.query(
          `UPDATE eligibility_cases
           SET proof_status = $2, updated_at = NOW()
           WHERE case_id = $1 AND proof_event_id = $3 AND proof_status IS DISTINCT FROM $2`,
          [update.caseId, update.proofStatus, update.proofEventId]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async persistScreening(
    requestHash: string,
    result: ScreeningResult,
    caseToPersist?: EligibilityCase,
    demoBeneficiaryId?: string
  ): Promise<void> {
    if (!this.pool) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (caseToPersist) {
        await this.lockAndWriteCase(client, caseToPersist);
        const action = caseToPersist.history.at(-1);
        if (action?.action === 'SCREENING') {
          await this.writeAction(client, caseToPersist, `screening:${result.screening.screeningRequestId}`, requestHash);
        }
      }
      await client.query(
        `INSERT INTO eligibility_screenings
          (screening_request_id, request_hash, demo_beneficiary_id, response, case_id, entitlement_preserved)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6)
         ON CONFLICT (screening_request_id) DO NOTHING`,
        [
          result.screening.screeningRequestId, requestHash,
          caseToPersist?.demoBeneficiaryId ?? result.case?.demoBeneficiaryId ?? demoBeneficiaryId ?? 'CLEAR-RESULT',
          JSON.stringify(result), caseToPersist?.caseId ?? null, result.entitlementPreserved
        ]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async persistCaseAction(item: EligibilityCase, idempotencyKey: string, requestHash: string): Promise<void> {
    if (!this.pool) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.lockAndWriteCase(client, item);
      await this.writeAction(client, item, idempotencyKey, requestHash);
      const action = item.history.at(-1)?.action;
      if (action && ELIGIBILITY_PROOF_ACTIONS.has(action)) {
        if (!item.proofEventId) throw new Error(`Eligibility ${action} requires a proof event ID`);
        await this.insertProof(client, item, idempotencyKey);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async persistFinalDecision(item: EligibilityCase, idempotencyKey: string, requestHash?: string): Promise<void> {
    if (!this.pool) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.lockAndWriteCase(client, item);
      await this.writeAction(client, item, idempotencyKey, requestHash ?? sha256({
        caseId: item.caseId, action: item.history.at(-1)?.action,
        expectedVersion: item.version - 1,
        outcomeCode: item.history.at(-1)?.outcomeCode,
        reasonCode: item.history.at(-1)?.reasonCode,
        decision: item.decision
      }));
      const cardUpdate = await client.query(
        `UPDATE ration_cards_mock SET status = $1, household_size = $2 WHERE ration_card_hash = $3 RETURNING ration_card_hash`,
        [item.rcmsStatus, item.householdSize, item.rationCardHash]
      );
      if (cardUpdate.rowCount !== 1) throw new Error(`Eligibility ration card ${item.rationCardHash} was not found`);
      const entitlementUpdate = await client.query(
        `UPDATE monthly_entitlements
         SET monthly_entitlement_kg = CASE WHEN commodity = 'Rice' THEN $1 ELSE monthly_entitlement_kg END,
             available_balance_kg = CASE
               WHEN commodity = 'Rice' THEN GREATEST(0, $1 - already_lifted_kg)
               ELSE available_balance_kg
             END,
             active = $2
         WHERE ration_card_hash = $3
         RETURNING monthly_entitlement_id`,
        [item.monthlyRiceEntitlementKg, !item.entitlementBlocked, item.rationCardHash]
      );
      if (entitlementUpdate.rowCount === 0) throw new Error(`Eligibility entitlement ${item.rationCardHash} was not found`);
      if (!item.proofEventId) throw new Error('Final eligibility decision requires a proof event ID');
      await this.insertProof(client, item, idempotencyKey);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertProof(client: PoolClient, item: EligibilityCase, idempotencyKey: string): Promise<void> {
    const event = this.proofEvent(item);
    await client.query(
      `INSERT INTO ledger_events (ledger_tx_id, entity_type, entity_id, event_type, payload, timestamp)
       VALUES ($1, 'eligibility-case', $2, $3, $4::jsonb, $5)
       ON CONFLICT (ledger_tx_id) DO NOTHING`,
      [event.ledgerTxId, item.caseId, event.eventType, JSON.stringify(event.payload), event.timestamp]
    );
    await client.query(
      `INSERT INTO ledger_outbox
        (event_id, operation_id, idempotency_key, schema_version, event_payload, status)
       VALUES ($1,$1,$2,1,$3::jsonb,'PENDING')
       ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING`,
      [item.proofEventId, idempotencyKey, JSON.stringify(event)]
    );
  }

  private async ensureRationCardParent(client: PoolClient, item: EligibilityCase): Promise<void> {
    await client.query(
      `INSERT INTO ration_cards_mock (ration_card_hash, household_size, district, status)
       VALUES ($1, GREATEST($2, 1), $3, $4)
       ON CONFLICT (ration_card_hash) DO NOTHING`,
      [
        item.rationCardHash,
        item.householdSize,
        'DEMO',
        item.rcmsStatus === 'CANCELLED' || item.rcmsStatus === 'SUSPENDED' ? item.rcmsStatus : 'ACTIVE'
      ]
    );
  }

  private async lockAndWriteCase(client: PoolClient, item: EligibilityCase): Promise<void> {
    await this.ensureRationCardParent(client, item);
    const current = await client.query<{ version: number }>(
      'SELECT version FROM eligibility_cases WHERE case_id = $1 FOR UPDATE',
      [item.caseId]
    );
    if (current.rows[0] && current.rows[0].version !== item.version - 1) {
      throw new Error(`Eligibility case ${item.caseId} changed concurrently`);
    }
    const written = await client.query(
      `INSERT INTO eligibility_cases
        (case_id, demo_beneficiary_id, subject_ref_hash, ration_card_hash, screening_status,
         evidence_digest, policy_id, rule_ids, state, decision, rcms_status, entitlement_blocked,
         household_size, monthly_rice_entitlement_kg, version, proof_status, proof_event_id, updated_at,
         screening, already_lifted_kg)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20)
       ON CONFLICT (case_id) DO UPDATE SET
         state=EXCLUDED.state, decision=EXCLUDED.decision, rcms_status=EXCLUDED.rcms_status,
         entitlement_blocked=EXCLUDED.entitlement_blocked, household_size=EXCLUDED.household_size,
         monthly_rice_entitlement_kg=EXCLUDED.monthly_rice_entitlement_kg, version=EXCLUDED.version,
         proof_status=EXCLUDED.proof_status, proof_event_id=EXCLUDED.proof_event_id,
         updated_at=EXCLUDED.updated_at, screening=EXCLUDED.screening,
         already_lifted_kg=EXCLUDED.already_lifted_kg
       WHERE eligibility_cases.version = EXCLUDED.version - 1
       RETURNING version`,
      [
        item.caseId, item.demoBeneficiaryId, item.subjectRefHash, item.rationCardHash,
        item.screening.status, item.screening.evidenceDigest, item.screening.policy.policyId,
        JSON.stringify(item.screening.policy.ruleIds), item.state, item.decision ?? null,
        item.rcmsStatus, item.entitlementBlocked, item.householdSize, item.monthlyRiceEntitlementKg,
        item.version, item.proofStatus, item.proofEventId ?? null, item.updatedAt,
        JSON.stringify(item.screening), item.alreadyLiftedKg
      ]
    );
    if (written.rowCount !== 1) throw new Error(`Eligibility case ${item.caseId} changed concurrently`);
  }

  private async writeAction(
    client: PoolClient,
    item: EligibilityCase,
    idempotencyKey: string,
    requestHash: string
  ): Promise<void> {
    const action = item.history.at(-1);
    if (!action) throw new Error('Eligibility case action is missing');
    const written = await client.query(
      `INSERT INTO eligibility_case_actions
        (action_id, case_id, idempotency_key, action_type, request_hash, outcome_code, reason_code,
         actor_ref, prior_state, new_state, case_version, occurred_at, case_snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING action_id`,
      [
        action.actionId, item.caseId, idempotencyKey, action.action, requestHash,
        action.outcomeCode, action.reasonCode, action.actorRef, action.priorState,
        action.newState, item.version, action.occurredAt, JSON.stringify(item)
      ]
    );
    if (written.rowCount !== 1) {
      const existing = await client.query(
        'SELECT request_hash FROM eligibility_case_actions WHERE idempotency_key = $1',
        [idempotencyKey]
      );
      if (String(existing.rows[0]?.request_hash) !== requestHash) {
        throw new Error('Eligibility idempotency key conflicts with persisted action content');
      }
    }
  }

  private mapCase(row: Record<string, unknown>, history: EligibilityCaseAction[]): EligibilityCase {
    const item: EligibilityCase = {
      caseId: String(row.case_id),
      demoBeneficiaryId: String(row.demo_beneficiary_id),
      subjectRefHash: String(row.subject_ref_hash),
      rationCardHash: String(row.ration_card_hash),
      screening: row.screening as EligibilityScreeningResponse,
      state: String(row.state) as EligibilityCase['state'],
      version: Number(row.version),
      rcmsStatus: String(row.rcms_status) as EligibilityCase['rcmsStatus'],
      entitlementBlocked: Boolean(row.entitlement_blocked),
      householdSize: Number(row.household_size),
      monthlyRiceEntitlementKg: Number(row.monthly_rice_entitlement_kg),
      alreadyLiftedKg: Number(row.already_lifted_kg),
      proofStatus: String(row.proof_status) as EligibilityCase['proofStatus'],
      history,
      updatedAt: new Date(String(row.updated_at)).toISOString()
    };
    if (row.decision) item.decision = String(row.decision) as NonNullable<EligibilityCase['decision']>;
    if (row.proof_event_id) item.proofEventId = String(row.proof_event_id);
    return item;
  }

  private proofEvent(item: EligibilityCase) {
    const action = item.history.at(-1);
    const eventType = action
      ? ELIGIBILITY_ACTION_EVENT_TYPES[action.action]
      : undefined;
    if (!eventType) {
      throw new Error(`Eligibility action ${action?.action ?? 'unknown'} cannot enqueue a Fabric proof`);
    }
    const outcomeCode = action?.action === 'DECISION' || action?.action === 'REINSTATEMENT'
      ? item.decision
      : action?.outcomeCode;
    return {
      ledgerTxId: item.proofEventId!,
      entityType: 'eligibility-case',
      entityId: item.caseId,
      eventType,
      payload: {
        caseId: item.caseId,
        subjectRefHash: item.subjectRefHash,
        rationCardHash: item.rationCardHash,
        policyId: item.screening.policy.policyId,
        ruleIds: item.screening.policy.ruleIds,
        outcomeCode,
        reasonCode: action?.reasonCode,
        actionType: action?.action,
        effectiveTimestamp: item.updatedAt,
        priorState: action?.priorState,
        newState: item.state,
        externalEvidenceDigest: item.screening.evidenceDigest
      },
      timestamp: item.updatedAt
    };
  }
}
