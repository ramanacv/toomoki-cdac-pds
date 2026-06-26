import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Gauge,
  Registry
} from 'prom-client';
import type { PlaneType } from '../../infrastructure/plane.decorator.js';

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
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  readonly httpRequestsTotal = new Counter({
    name: 'pds_http_requests_total',
    help: 'Total HTTP requests handled by the PDS API',
    labelNames: ['method', 'path', 'plane', 'status_code'] as const,
    registers: [this.registry]
  });

  readonly httpRequestDurationMs = new Histogram({
    name: 'pds_http_request_duration_ms',
    help: 'HTTP request duration in milliseconds',
    labelNames: ['method', 'plane'] as const,
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

  readonly grievancesTotal = new Counter({
    name: 'pds_grievances_total',
    help: 'Grievances filed',
    labelNames: ['grievance_type', 'fps_id'] as const,
    registers: [this.registry]
  });

  onModuleInit() {
    collectDefaultMetrics({ register: this.registry });
  }

  /** Record a completed HTTP request. Call from the logging interceptor. */
  recordRequest(labels: {
    method: string;
    path: string;
    plane: PlaneType;
    statusCode: number;
    durationMs: number;
  }) {
    this.httpRequestsTotal.labels(labels.method, labels.path, labels.plane, String(labels.statusCode)).inc();
    this.httpRequestDurationMs.labels(labels.method, labels.plane).observe(labels.durationMs);
  }
}
