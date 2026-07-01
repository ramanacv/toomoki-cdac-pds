import { existsSync, readFileSync } from 'node:fs';
import { Inject, Injectable } from '@nestjs/common';
import type { AuditAlert } from '@pds/shared-types';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import type { FabricRuntimeConfig } from '../config/fabric.config.js';
import { resolveFabricNetworkPath } from '../fabric/fabric-contract.js';
import { loadPersistenceRuntimeConfig } from '../config/persistence.config.js';
import { usesDemoChaincodeRuntime } from '../config/ledger-mode.config.js';
import { createFabricGatewayConnection } from '../fabric/fabric-gateway.connection.js';
import type {
  AdminActivityFeed,
  AdminFabricOrg,
  AdminHealthCheck,
  AdminMetrics,
  AdminNetworkInfo,
  AdminOverview,
  AdminStakeholderSummary
} from './admin.types.js';

const RECENT_EVENT_LIMIT = 25;

const groupBy = (items: string[]): Array<{ key: string; count: number }> => {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count);
};

@Injectable()
export class AdminService {
  constructor(
    @Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade,
    @Inject('FABRIC_RUNTIME_CONFIG') private readonly fabricConfig: FabricRuntimeConfig
  ) {}

  getOverview(): AdminOverview {
    const dashboard = this.ledger.getDashboardSummary();
    const metrics = this.buildMetrics();
    const network = this.buildNetworkInfo();
    const stakeholders = this.buildStakeholderSummary();
    const activity = this.buildActivityFeed();
    const alerts = this.ledger.getAlerts();

    return {
      generatedAt: new Date().toISOString(),
      readOnly: true,
      dashboard,
      metrics,
      network,
      stakeholders,
      activity,
      auditAlerts: this.buildAuditAlertSummary(alerts),
      health: this.buildHealthChecks(network),
      links: {
        health: '/health',
        openapi: '/openapi.json',
        traceExample: '/trace/lots/LOT-RICE-2026-001',
        auditAlerts: '/audit-alerts'
      }
    };
  }

  getNetwork(): AdminNetworkInfo {
    return this.buildNetworkInfo();
  }

  getActivity(): AdminActivityFeed {
    return this.buildActivityFeed();
  }

  getStakeholderSummary(): AdminStakeholderSummary {
    return this.buildStakeholderSummary();
  }

  private buildMetrics(): AdminMetrics {
    const state = this.ledger.exportState();
    const alerts = state.alerts;

    return {
      stakeholders: state.stakeholders.length,
      lots: state.lots.length,
      transfers: state.transfers.length,
      allocations: state.allocations.length,
      entitlements: state.entitlements.length,
      authTransactions: state.authTransactions.length,
      distributions: state.distributions.length,
      auditAlerts: alerts.length,
      openAuditAlerts: alerts.filter((alert) => alert.status !== 'RESOLVED').length,
      ledgerEvents: state.events.length
    };
  }

  private buildNetworkInfo(): AdminNetworkInfo {
    const persistence = loadPersistenceRuntimeConfig();
    const config = this.fabricConfig;
    const base: AdminNetworkInfo = {
      ledgerMode: config.ledgerMode,
      persistenceBackend: persistence.backend,
      legacyBackendMode: config.mode
    };

    if (config.ledgerMode === 'demo') {
      const state = this.ledger.exportState();
      return {
        ...base,
        demo: {
          inProcessChaincode: usesDemoChaincodeRuntime(config.ledgerMode, config.mode),
          worldStateSummary: {
            stakeholders: state.stakeholders.length,
            lots: state.lots.length,
            transfers: state.transfers.length,
            allocations: state.allocations.length,
            distributions: state.distributions.length,
            events: state.events.length,
            stockPositions: state.stock.length
          },
          statePath: config.statePath,
          journalPath: config.journalPath,
          chaincodeStatePath: config.chaincodeStatePath
        }
      };
    }

    const organizations = this.loadFabricOrganizations();
    const connectivity = this.checkFabricConnectivity(config);

    return {
      ...base,
      fabric: {
        network: config.network,
        channel: config.channel,
        chaincode: config.chaincode,
        clientOrg: config.clientOrg,
        mspId: config.mspId,
        peerEndpoint: config.peerEndpoint,
        peerHostAlias: config.peerHostAlias,
        connectionProfilePath: config.connectionProfilePath,
        connectivity: connectivity.status,
        connectivityDetail: connectivity.detail,
        organizations
      }
    };
  }

  private loadFabricOrganizations(): AdminFabricOrg[] {
    try {
      const manifestPath = resolveFabricNetworkPath('network-manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        organizations: AdminFabricOrg[];
      };
      return manifest.organizations;
    } catch {
      return [];
    }
  }

  private checkFabricConnectivity(config: FabricRuntimeConfig): {
    status: 'ok' | 'unavailable' | 'not_checked';
    detail: string;
  } {
    const requiredPaths = [config.connectionProfilePath, config.certPath, config.peerTlsCertPath];
    const missing = requiredPaths.filter((path) => !existsSync(path));
    if (missing.length > 0) {
      return {
        status: 'unavailable',
        detail: `Missing Fabric artifacts: ${missing.join(', ')}`
      };
    }

    return {
      status: 'not_checked',
      detail: 'Gateway connectivity is verified on demand; crypto and profile files are present.'
    };
  }

  async probeFabricConnectivity(): Promise<{ status: 'ok' | 'unavailable'; detail: string }> {
    const config = this.fabricConfig;
    if (config.ledgerMode !== 'fabric') {
      return { status: 'unavailable', detail: 'Ledger mode is not fabric' };
    }

    let connection: Awaited<ReturnType<typeof createFabricGatewayConnection>> | null = null;
    try {
      connection = await createFabricGatewayConnection(config);
      await connection.contract.evaluateTransaction('GetDashboardSummary', '{}');
      return { status: 'ok', detail: `Connected to ${config.peerEndpoint} on channel ${config.channel}` };
    } catch (error) {
      return {
        status: 'unavailable',
        detail: error instanceof Error ? error.message : 'Fabric gateway connection failed'
      };
    } finally {
      connection?.close();
    }
  }

  private buildStakeholderSummary(): AdminStakeholderSummary {
    const stakeholders = this.ledger.listStakeholders();
    return {
      byType: groupBy(stakeholders.map((item) => item.stakeholderType)).map(({ key, count }) => ({
        stakeholderType: key,
        count
      })),
      byStatus: groupBy(stakeholders.map((item) => item.status)).map(({ key, count }) => ({
        status: key,
        count
      })),
      fabricOrgMapping: this.loadFabricOrganizations().map((org) => ({
        orgName: org.name,
        role: org.role,
        mspId: org.mspId
      }))
    };
  }

  private buildActivityFeed(): AdminActivityFeed {
    const events = [...this.ledger.exportState().events].sort((left, right) =>
      right.timestamp.localeCompare(left.timestamp)
    );

    return {
      recentEvents: events.slice(0, RECENT_EVENT_LIMIT),
      eventCount: events.length
    };
  }

  private buildAuditAlertSummary(alerts: AuditAlert[]): AdminOverview['auditAlerts'] {
    const byRiskLevel: Record<string, number> = {};
    for (const alert of alerts) {
      byRiskLevel[alert.riskLevel] = (byRiskLevel[alert.riskLevel] ?? 0) + 1;
    }

    const recent = [...alerts]
      .sort((left, right) => (right.createdAt ?? '').localeCompare(left.createdAt ?? ''))
      .slice(0, 10);

    return {
      total: alerts.length,
      open: alerts.filter((alert) => alert.status !== 'RESOLVED').length,
      byRiskLevel,
      recent
    };
  }

  private buildHealthChecks(network: AdminNetworkInfo): AdminHealthCheck[] {
    const persistence = loadPersistenceRuntimeConfig();
    const checks: AdminHealthCheck[] = [
      {
        name: 'api',
        status: 'ok',
        detail: 'NestJS API process is running'
      },
      {
        name: 'ledger',
        status: 'ok',
        detail: `Ledger mode: ${network.ledgerMode}`
      },
      {
        name: 'persistence',
        status: persistence.backend === 'postgres' ? 'ok' : 'degraded',
        detail:
          persistence.backend === 'postgres'
            ? 'PostgreSQL snapshot backend active'
            : 'File-backed persistence (local dev)'
      }
    ];

    if (network.fabric) {
      checks.push({
        name: 'fabric-gateway',
        status: network.fabric.connectivity === 'unavailable' ? 'unavailable' : 'ok',
        detail: network.fabric.connectivityDetail
      });
    }

    return checks;
  }
}
