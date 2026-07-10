export type UUID = string;

export type CommodityName = 'Rice' | 'Wheat' | 'Dal' | 'Sugar' | 'Cooking Oil' | 'Kerosene';

export type CommodityDefinition = {
  name: CommodityName;
  slug: string;
  defaultQualityGrade: string;
  defaultTopUpQuantityKg: number;
  defaultMonthlyEntitlementKg: number;
};

export type CommodityRouteLeg = {
  id: string;
  fromOrg: string;
  toOrg: string;
  stage: 'I' | 'II';
  lot: 'source' | 'transformed';
  requiresAuthorization?: boolean;
};

export type CommodityRouteTemplate = {
  commodity: CommodityName;
  sourceLotId: string;
  activeLotId: string;
  requiresTransformation: boolean;
  transformation?: {
    transformedBy: string;
    parentLotId: string;
    childLotId: string;
    outputCommodity: CommodityName;
  };
  fpsDelivery?: {
    allocationId: string;
    sourceGodownId: string;
    fpsId: string;
    allocatedQtyKg: number;
  };
  legs: CommodityRouteLeg[];
};

export const COMMODITIES: CommodityDefinition[] = [
  {
    name: 'Rice',
    slug: 'RICE',
    defaultQualityGrade: 'A',
    defaultTopUpQuantityKg: 10000,
    defaultMonthlyEntitlementKg: 25
  },
  {
    name: 'Wheat',
    slug: 'WHEAT',
    defaultQualityGrade: 'A',
    defaultTopUpQuantityKg: 7000,
    defaultMonthlyEntitlementKg: 10
  },
  {
    name: 'Dal',
    slug: 'DAL',
    defaultQualityGrade: 'A',
    defaultTopUpQuantityKg: 2000,
    defaultMonthlyEntitlementKg: 2
  },
  {
    name: 'Sugar',
    slug: 'SUGAR',
    defaultQualityGrade: 'A',
    defaultTopUpQuantityKg: 2000,
    defaultMonthlyEntitlementKg: 2
  },
  {
    name: 'Cooking Oil',
    slug: 'COOKING-OIL',
    defaultQualityGrade: 'A',
    defaultTopUpQuantityKg: 1000,
    defaultMonthlyEntitlementKg: 1
  },
  {
    name: 'Kerosene',
    slug: 'KEROSENE',
    defaultQualityGrade: 'A',
    defaultTopUpQuantityKg: 1000,
    defaultMonthlyEntitlementKg: 3
  }
];

const FPS_ALLOCATION_KG = 300;

const canonicalFpsRoute = (
  commodity: CommodityName,
  slug: string,
  sourceLotId: string
): CommodityRouteTemplate => ({
  commodity,
  sourceLotId,
  activeLotId: sourceLotId,
  requiresTransformation: false,
  fpsDelivery: {
    allocationId: `ALLOC-POC-${slug}-FPS`,
    sourceGodownId: 'ISSUE-001',
    fpsId: 'FPS-101',
    allocatedQtyKg: FPS_ALLOCATION_KG
  },
  legs: [
    {
      id: `TR-POC-${slug}-PROC-FCI`,
      fromOrg: 'PROC-001',
      toOrg: 'FCI-001',
      stage: 'I',
      lot: 'source'
    },
    {
      id: `TR-POC-${slug}-FCI-DEPOT`,
      fromOrg: 'FCI-001',
      toOrg: 'GODOWN-S-001',
      stage: 'I',
      lot: 'source'
    },
    {
      id: `TR-POC-${slug}-DEPOT-ISSUE`,
      fromOrg: 'GODOWN-S-001',
      toOrg: 'ISSUE-001',
      stage: 'II',
      lot: 'source',
      requiresAuthorization: true
    }
  ]
});

export const COMMODITY_ROUTE_TEMPLATES: CommodityRouteTemplate[] = [
  canonicalFpsRoute('Rice', 'RICE', 'LOT-RICE-2026-001'),
  canonicalFpsRoute('Wheat', 'WHEAT', 'LOT-WHEAT-2026-001'),
  canonicalFpsRoute('Dal', 'DAL', 'LOT-DAL-2026-001'),
  canonicalFpsRoute('Sugar', 'SUGAR', 'LOT-SUGAR-2026-001'),
  canonicalFpsRoute('Cooking Oil', 'COOKING-OIL', 'LOT-COOKING-OIL-2026-001'),
  canonicalFpsRoute('Kerosene', 'KEROSENE', 'LOT-KEROSENE-2026-001')
];

/** Bootstrap / first-seed series. Fixture lot ids use `2026` in place of this token. */
export const INITIAL_DEMO_SERIES_ID = 'POC';

const commoditySlugsLongestFirst = (): string[] =>
  [...COMMODITIES.map((commodity) => commodity.slug)].sort((left, right) => right.length - left.length);

const seriesToken = (seriesId: string): string =>
  seriesId === INITIAL_DEMO_SERIES_ID ? 'POC' : seriesId;

/** Build a seed lot id for a commodity slug and run series. */
export const buildSeedLotId = (slug: string, seriesId: string, seq = '001'): string => {
  if (seriesId === INITIAL_DEMO_SERIES_ID) {
    return `LOT-${slug}-2026-${seq}`;
  }
  return `LOT-${slug}-${seriesId}-${seq}`;
};

/** Extract the run series embedded in a lot id (`POC` for bootstrap `…-2026-001` lots). */
export const seriesIdFromLotId = (lotId: string): string => {
  for (const slug of commoditySlugsLongestFirst()) {
    const prefix = `LOT-${slug}-`;
    if (!lotId.startsWith(prefix)) {
      continue;
    }
    const rest = lotId.slice(prefix.length);
    const match = /^(.*)-(\d{3})$/.exec(rest);
    if (!match?.[1]) {
      continue;
    }
    return match[1] === '2026' ? INITIAL_DEMO_SERIES_ID : match[1];
  }
  return INITIAL_DEMO_SERIES_ID;
};

/** Best-effort created time from a reset series id (`RyyyyMMdd-HHmmss-…`). */
export const createdAtFromLotId = (lotId: string): string | undefined => {
  const series = seriesIdFromLotId(lotId);
  if (series === INITIAL_DEMO_SERIES_ID) {
    return undefined;
  }
  const match = /^R(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(series);
  if (!match) {
    return undefined;
  }
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.000Z`;
};

export type TransferLegSuffix = 'PROC-FCI' | 'FCI-DEPOT' | 'DEPOT-ISSUE';

export const buildTransferId = (seriesId: string, slug: string, leg: TransferLegSuffix): string =>
  `TR-${seriesToken(seriesId)}-${slug}-${leg}`;

export const buildAllocationId = (seriesId: string, slug: string): string =>
  `ALLOC-${seriesToken(seriesId)}-${slug}-FPS`;

export const buildDistributionId = (
  seriesId: string,
  slug: string,
  kind: '001' | '002' | 'EXCEPTION' = '001'
): string => {
  const token = seriesToken(seriesId);
  if (token === 'POC' && slug === 'RICE') {
    if (kind === 'EXCEPTION') return 'DIST-POC-EXCEPTION';
    return kind === '001' ? 'DIST-POC-001' : 'DIST-POC-002';
  }
  if (kind === 'EXCEPTION') return `DIST-${token}-${slug}-EXCEPTION`;
  return `DIST-${token}-${slug}-${kind}`;
};

/** UTC timestamp series id, e.g. `R20260710-165432-a1b2`. */
export const generateResetSeriesId = (date: Date = new Date(), entropy = ''): string => {
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  const stamp = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
  const suffix = (entropy || Math.random().toString(36).slice(2, 6)).slice(0, 4);
  return `R${stamp}-${suffix}`;
};

/** Clone the canonical route template with series-scoped lot / transfer / allocation ids. */
export const buildCommodityRouteForSeries = (
  commodity: string,
  seriesId: string,
  sourceLotId?: string
): CommodityRouteTemplate | undefined => {
  const base = getCommodityRouteTemplate(commodity);
  if (!base) {
    return undefined;
  }
  const definition = COMMODITIES.find((item) => item.name === commodity);
  if (!definition) {
    return undefined;
  }
  const slug = definition.slug;
  const lotId = sourceLotId ?? buildSeedLotId(slug, seriesId);
  const legSuffix = (legId: string): TransferLegSuffix => {
    if (legId.endsWith('PROC-FCI')) return 'PROC-FCI';
    if (legId.endsWith('FCI-DEPOT')) return 'FCI-DEPOT';
    return 'DEPOT-ISSUE';
  };
  return {
    ...base,
    sourceLotId: lotId,
    activeLotId: lotId,
    ...(base.fpsDelivery
      ? {
          fpsDelivery: {
            ...base.fpsDelivery,
            allocationId: buildAllocationId(seriesId, slug)
          }
        }
      : {}),
    legs: base.legs.map((leg) => ({
      ...leg,
      id: buildTransferId(seriesId, slug, legSuffix(leg.id))
    }))
  };
};

export const getCommodityRouteTemplate = (commodity: string): CommodityRouteTemplate | undefined =>
  COMMODITY_ROUTE_TEMPLATES.find((template) => template.commodity === commodity);

export const isCommodityRouteEdgeAllowed = (
  commodity: string,
  fromOrg: string,
  toOrg: string,
  lotKind: CommodityRouteLeg['lot']
): boolean => {
  const template = getCommodityRouteTemplate(commodity);
  return template
    ? template.legs.some((leg) => leg.fromOrg === fromOrg && leg.toOrg === toOrg && leg.lot === lotKind)
    : true;
};

export enum StakeholderType {
  FCI = 'FCI',
  PROCUREMENT_CENTER = 'PROCUREMENT_CENTER',
  TRANSPORTER = 'TRANSPORTER',
  STATE_GODOWN = 'STATE_GODOWN',
  ISSUE_POINT = 'ISSUE_POINT',
  FAIR_PRICE_SHOP = 'FAIR_PRICE_SHOP',
  DISTRICT_SUPPLY_OFFICE = 'DISTRICT_SUPPLY_OFFICE',
  AUDITOR = 'AUDITOR'
}

export enum StakeholderStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE'
}

export enum LotStatus {
  CREATED = 'CREATED',
  DISPATCHED = 'DISPATCHED',
  RECEIVED = 'RECEIVED',
  RECEIVED_WITH_SHORTAGE = 'RECEIVED_WITH_SHORTAGE'
}

export enum TransferStatus {
  DISPATCHED = 'DISPATCHED',
  RECEIVED = 'RECEIVED',
  RECEIVED_WITH_SHORTAGE = 'RECEIVED_WITH_SHORTAGE'
}

export enum AuthMode {
  MOCK_OTP = 'MOCK_OTP',
  SIMULATED_BIOMETRIC = 'SIMULATED_BIOMETRIC',
  SUPERVISOR_EXCEPTION = 'SUPERVISOR_EXCEPTION'
}

export enum AuthResult {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  EXCEPTION_APPROVED = 'EXCEPTION_APPROVED'
}

export enum AlertType {
  SHORT_RECEIPT = 'SHORT_RECEIPT',
  DUPLICATE_CLAIM = 'DUPLICATE_CLAIM',
  FPS_OVER_DISTRIBUTION = 'FPS_OVER_DISTRIBUTION',
  UNAUTHORIZED_TRANSACTION = 'UNAUTHORIZED_TRANSACTION',
  DB_LEDGER_MISMATCH = 'DB_LEDGER_MISMATCH',
  IN_TRANSIT_DELAY = 'IN_TRANSIT_DELAY',
  FPS_CLOSING_STOCK_MISMATCH = 'FPS_CLOSING_STOCK_MISMATCH',
  DISTRIBUTION_TAMPERED = 'DISTRIBUTION_TAMPERED',
  GRIEVANCE_SLA_BREACH = 'GRIEVANCE_SLA_BREACH'
}

export enum RationCardType {
  AAY = 'AAY',
  PHH = 'PHH',
  NPH = 'NPH',
  APL = 'NPH',
  BPL = 'PHH'
}

export enum RationCardStatus {
  ISSUED = 'ISSUED',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  CANCELLED = 'CANCELLED'
}

export enum GrievanceType {
  NOT_RECEIVED = 'NOT_RECEIVED',
  QUANTITY_SHORT = 'QUANTITY_SHORT',
  QUALITY_POOR = 'QUALITY_POOR',
  UNAUTHORIZED_CHARGE = 'UNAUTHORIZED_CHARGE',
  OTHER = 'OTHER'
}

export enum GrievanceStatus {
  OPEN = 'OPEN',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  ESCALATED = 'ESCALATED',
  RESOLVED = 'RESOLVED'
}

export enum EntitlementRuleStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  ACTIVE = 'ACTIVE',
  SUPERSEDED = 'SUPERSEDED'
}

export type Stakeholder = {
  stakeholderId: string;
  stakeholderType: StakeholderType;
  name: string;
  district: string;
  licenseNo: string;
  status: StakeholderStatus;
  jurisdiction?: 'CENTRAL' | 'STATE';
  capacityKg?: number;
};

export type CommodityLot = {
  lotId: string;
  commodity: string;
  season: string;
  quantityKg: number;
  qualityGrade: string;
  source: string;
  currentOwner: string;
  currentLocation: string;
  status: LotStatus;
  transformedFromLotId?: string;
  /** ISO timestamp when the lot was created on the ledger. */
  createdAt?: string;
};

export type TransferOrder = {
  transferId: string;
  lotId: string;
  fromOrg: string;
  toOrg: string;
  dispatchedQtyKg: number;
  receivedQtyKg?: number;
  shortageQtyKg?: number;
  vehicleNo: string;
  status: TransferStatus;
  dispatchTimestamp: string;
  receiveTimestamp?: string;
  stage?: 'I' | 'II';
  authorizedBy?: string;
  authorizedAt?: string;
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'BLOCKED';
  roRef?: string;
  transporterId?: string;
  transformedFromLotId?: string;
};

export type FPSAllocation = {
  allocationId: string;
  fpsId: string;
  commodity: string;
  allocatedQtyKg: number;
  receivedQtyKg?: number;
  month: string;
  sourceGodownId: string;
  status: 'ALLOCATED' | 'RECEIVED';
};

export type MonthlyEntitlement = {
  rationCardHash: string;
  commodity: string;
  month: string;
  monthlyEntitlementKg: number;
  alreadyLiftedKg: number;
  availableBalanceKg: number;
  active: boolean;
  category?: RationCardType;
};

export type AuthTransaction = {
  authTxnId: string;
  beneficiaryRefHash: string;
  rationCardHash: string;
  authMode: AuthMode;
  authResult: AuthResult;
  authTxnRefHash: string;
  approvedBy?: string;
  timestamp: string;
};

export type DistributionTransaction = {
  distributionId: string;
  fpsId: string;
  rationCardHash: string;
  beneficiaryRefHash: string;
  commodity: string;
  deliveredKg: number;
  authMode: AuthMode;
  authResult: AuthResult;
  authTxnRefHash: string;
  dealerId: string;
  timestamp: string;
  ledgerTxId?: string;
};

export type AuditAlert = {
  alertId: string;
  alertType: AlertType;
  entityId: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  message: string;
  status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED';
  evidence: Record<string, string | number | boolean>;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
};

export type LedgerEvent = {
  ledgerTxId: string;
  entityType: 'stakeholder' | 'lot' | 'transfer' | 'allocation' | 'auth' | 'distribution' | 'audit' | 'rationcard' | 'grievance' | 'entitlementrule' | 'workflow';
  entityId: string;
  eventType: string;
  payload: Record<string, unknown>;
  timestamp: string;
};

export type RationCard = {
  rationCardHash: string;
  cardType: RationCardType;
  assignedFpsId: string;
  issuedAt: string;
  status: RationCardStatus;
  suspendedAt?: string;
  suspendReason?: string;
  cancelledAt?: string;
  transferHistory: Array<{ fromFps: string; toFps: string; at: string; authorizedBy: string }>;
};

export type Grievance = {
  grievanceId: string;
  rationCardHash: string;
  fpsId: string;
  grievanceType: GrievanceType;
  description: string;
  status: GrievanceStatus;
  filedAt: string;
  slaDeadlineAt: string;
  acknowledgedAt?: string;
  escalatedAt?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
};

export type EntitlementRule = {
  ruleId: string;
  category: RationCardType;
  commodity: string;
  monthlyKg: number;
  effectiveFrom: string;
  effectiveTo?: string;
  status: EntitlementRuleStatus;
  proposedBy: string;
  approvedBy?: string;
};

export type DashboardSummary = {
  trackedStockKg: number;
  activeLots: number;
  completedDistributions: number;
  /** Sum of in-transit transfers and ALLOCATED FPS allocations awaiting receipt */
  pendingReceipts: number;
  /** Transfers dispatched but not yet received at destination */
  pendingTransferReceipts: number;
  /** FPS allocations created but not yet receipt-confirmed */
  pendingFpsAllocations: number;
  openAlerts: number;
  highRiskFps: string[];
};

export type DemoSnapshot = {
  stakeholders: Stakeholder[];
  lots: CommodityLot[];
  transfers: TransferOrder[];
  allocations: FPSAllocation[];
  entitlements: MonthlyEntitlement[];
  distributions: DistributionTransaction[];
  alerts: AuditAlert[];
  rationCards: RationCard[];
  grievances: Grievance[];
  entitlementRules: EntitlementRule[];
};

export const maskHash = (value: string) => `${value.slice(0, 4)}****${value.slice(-4)}`;

const fnv1a = (value: string, seed: number): number => {
  let hash = seed >>> 0;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

export const hashReference = (value: string): string => {
  const first = fnv1a(value, 0x811c9dc5).toString(16).padStart(8, '0');
  const second = fnv1a(`${value}:pds`, 0x811c9dc5 ^ 0x9e3779b9).toString(16).padStart(8, '0');
  return `${first}${second}`;
};

export const makeTimestamp = (date: Date = new Date()): string => date.toISOString();
