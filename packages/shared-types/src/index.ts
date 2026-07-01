export type UUID = string;

export enum StakeholderType {
  DFPD = 'DFPD',
  FCI = 'FCI',
  FCI_BUFFER_GODOWN = 'FCI_BUFFER_GODOWN',
  PROCUREMENT_CENTER = 'PROCUREMENT_CENTER',
  MILLER = 'MILLER',
  TRANSPORTER = 'TRANSPORTER',
  STATE_GODOWN = 'STATE_GODOWN',
  BLOCK_GODOWN = 'BLOCK_GODOWN',
  ISSUE_POINT = 'ISSUE_POINT',
  FAIR_PRICE_SHOP = 'FAIR_PRICE_SHOP',
  WELFARE_INSTITUTE = 'WELFARE_INSTITUTE',
  SHIV_BHOJAN_EATERY = 'SHIV_BHOJAN_EATERY',
  DIVISIONAL_OFFICE = 'DIVISIONAL_OFFICE',
  DISTRICT_SUPPLY_OFFICE = 'DISTRICT_SUPPLY_OFFICE',
  TALUKA_SUPPLY_OFFICE = 'TALUKA_SUPPLY_OFFICE',
  DEPARTMENT = 'DEPARTMENT',
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
  pendingReceipts: number;
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
