import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Gauge,
  Registry
} from 'prom-client';
import type { PlaneType } from '../../infrastructure/plane.decorator.js';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import { setFabricMetricsSink, type FabricMetricsSink } from './metrics-hooks.js';

/**
 * Prometheus metrics for the PDS API.
 *
 * All metrics carry a `plane` label ('control' | 'data') so dashboards can
 * show control-plane governance activity (stakeholder registrations, entitlement
 * rule approvals) independently from data-plane throughput (distributions,
 * lot transfers).
 *
 * Exposed at GET /metrics in Prometheus text format.
 */
@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy, FabricMetricsSink {
  readonly registry = new Registry();

  readonly httpRequestsTotal = new Counter({
    name: 'pds_http_requests_total',
    help: 'Total HTTP requests handled by the PDS API',
    labelNames: ['method', 'route', 'plane', 'status_class'] as const,
    registers: [this.registry]
  });

  readonly httpRequestDurationMs = new Histogram({
    name: 'pds_http_request_duration_ms',
    help: 'HTTP request duration in milliseconds',
    labelNames: ['method', 'route', 'plane', 'status_class'] as const,
    buckets: [5, 20, 50, 100, 250, 500, 1000, 2500, 5000],
    registers: [this.registry]
  });

  readonly chaincodeOperationsTotal = new Counter({
    name: 'pds_chaincode_operations_total',
    help: 'Chaincode submit/evaluate calls made from the API',
    labelNames: ['operation', 'plane', 'outcome'] as const,
    registers: [this.registry]
  });

  readonly openAlertsGauge = new Gauge({
    name: 'pds_audit_alerts_open',
    help: 'Current number of unresolved audit alerts',
    labelNames: ['risk_level'] as const,
    registers: [this.registry]
  });

  readonly distributionsTotal = new Counter({
    name: 'pds_distributions_total',
    help: 'Beneficiary distributions recorded',
    labelNames: ['commodity', 'outcome'] as const,
    registers: [this.registry]
  });

  readonly lotTransfersTotal = new Counter({
    name: 'pds_lot_transfers_total',
    help: 'Commodity lot transfer events',
    labelNames: ['status'] as const,
    registers: [this.registry]
  });

  readonly businessOperationsTotal = new Counter({
    name: 'pds_business_operations_total',
    help: 'Mutation outcomes by normalized operation route',
    labelNames: ['operation', 'outcome'] as const,
    registers: [this.registry]
  });

  readonly outboxGauge = new Gauge({
    name: 'pds_proof_outbox_rows',
    help: 'Durable Fabric proof outbox rows by state',
    labelNames: ['state'] as const,
    registers: [this.registry]
  });

  readonly proofCommitLatency = new Histogram({
    name: 'pds_proof_enqueue_to_commit_seconds',
    help: 'Elapsed time from proof enqueue to confirmed Fabric commit',
    buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60],
    registers: [this.registry]
  });

  readonly proofRetriesTotal = new Counter({
    name: 'pds_proof_retries_total', help: 'Fabric proof submission retries', registers: [this.registry]
  });

  readonly proofDeadLettersTotal = new Counter({
    name: 'pds_proof_dead_letters_total', help: 'Fabric proofs moved to terminal dead letter', registers: [this.registry]
  });

  readonly fabricSubmissionDuration = new Histogram({
    name: 'pds_fabric_submission_duration_seconds',
    help: 'Fabric proof submission duration and result',
    labelNames: ['result'] as const,
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
    registers: [this.registry]
  });

  private readonly observedCommittedEvents = new Set<string>();

  constructor(@Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade) {}

  readonly grievancesTotal = new Counter({
    name: 'pds_grievances_total',
    help: 'Grievances filed',
    labelNames: ['grievance_type'] as const,
    registers: [this.registry]
  });

  onModuleInit() {
    collectDefaultMetrics({ register: this.registry });
    setFabricMetricsSink(this);
  }

  onModuleDestroy() { setFabricMetricsSink(null); }

  /** Record a completed HTTP request. Call from the logging interceptor. */
  recordRequest(labels: {
    method: string;
    path: string;
    plane: PlaneType;
    statusCode: number;
    durationMs: number;
  }) {
    const statusClass = `${Math.floor(labels.statusCode / 100)}xx`;
    this.httpRequestsTotal.labels(labels.method, labels.path, labels.plane, statusClass).inc();
    this.httpRequestDurationMs.labels(labels.method, labels.path, labels.plane, statusClass).observe(labels.durationMs);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(labels.method)) {
      this.businessOperationsTotal.labels(labels.path, labels.statusCode < 400 ? 'success' : 'failure').inc();
    }
  }

  recordFabricSubmission(durationSeconds: number, result: 'success' | 'failure') {
    this.fabricSubmissionDuration.labels(result).observe(durationSeconds);
  }

  recordProofRetry(deadLettered: boolean) {
    this.proofRetriesTotal.inc();
    if (deadLettered) this.proofDeadLettersTotal.inc();
  }

  async render(): Promise<string> {
    const pool = this.ledger.getOperationalPool();
    if (pool) {
      const [counts, committed] = await Promise.all([
        pool.query('SELECT status, COUNT(*)::int AS count FROM ledger_outbox GROUP BY status'),
        pool.query(`SELECT event_id, EXTRACT(EPOCH FROM (committed_at - created_at))::float8 AS latency
                    FROM ledger_outbox WHERE status = 'COMMITTED' AND committed_at IS NOT NULL`)
      ]);
      this.outboxGauge.reset();
      for (const state of ['PENDING', 'SUBMITTING', 'COMMITTED', 'FAILED', 'DEAD_LETTER']) this.outboxGauge.labels(state).set(0);
      for (const row of counts.rows) this.outboxGauge.labels(String(row.status)).set(Number(row.count));
      for (const row of committed.rows) {
        const eventId = String(row.event_id);
        if (!this.observedCommittedEvents.has(eventId)) {
          this.observedCommittedEvents.add(eventId);
          this.proofCommitLatency.observe(Number(row.latency));
        }
      }
    }
    return this.registry.metrics();
  }
}
