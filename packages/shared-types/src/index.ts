export type UUID = string;

export enum StakeholderType {
  PROCUREMENT_CENTER = 'PROCUREMENT_CENTER',
  MILLER = 'MILLER',
  TRANSPORTER = 'TRANSPORTER',
  STATE_GODOWN = 'STATE_GODOWN',
  BLOCK_GODOWN = 'BLOCK_GODOWN',
  FAIR_PRICE_SHOP = 'FAIR_PRICE_SHOP',
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
  DISTRIBUTION_TAMPERED = 'DISTRIBUTION_TAMPERED'
}

export type Stakeholder = {
  stakeholderId: string;
  stakeholderType: StakeholderType;
  name: string;
  district: string;
  licenseNo: string;
  status: StakeholderStatus;
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
  entityType: 'stakeholder' | 'lot' | 'transfer' | 'allocation' | 'auth' | 'distribution' | 'audit';
  entityId: string;
  eventType: string;
  payload: Record<string, unknown>;
  timestamp: string;
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
