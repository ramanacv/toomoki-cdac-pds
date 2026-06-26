export const CHAINCODE_OPERATIONS = [
  // ── Supply chain ──────────────────────────────────────────────────────
  'RegisterStakeholder',
  'CreateCommodityLot',
  'DispatchLot',
  'ReceiveLot',
  'AllocateToFPS',
  'RecordFPSReceipt',
  // ── Beneficiary auth & distribution ──────────────────────────────────
  'RegisterBeneficiaryHash',
  'CreateMonthlyEntitlement',
  'RecordDistribution',
  // ── Audit ─────────────────────────────────────────────────────────────
  'CheckDuplicateClaim',
  'RaiseAuditFlag',
  'ResolveAuditFlag',
  'RecordLedgerProof',
  // ── Ration card lifecycle ─────────────────────────────────────────────
  'IssueRationCard',
  'ActivateRationCard',
  'SuspendRationCard',
  'TransferRationCard',
  // ── Grievance management ──────────────────────────────────────────────
  'FileGrievance',
  'AcknowledgeGrievance',
  'ResolveGrievance',
  'EscalateOverdueGrievances',
  // ── Entitlement rules engine ──────────────────────────────────────────
  'ProposeEntitlementRule',
  'ApproveEntitlementRule',
  // ── Quota rollover ────────────────────────────────────────────────────
  'RolloverUnclaimedQuota',
  // ── Queries ───────────────────────────────────────────────────────────
  'GetLotHistory',
  'GetDistributionHistory',
  'GetCurrentStock',
  'VerifyDatabaseHash',
  'GetRationCardHistory',
  'GetActiveEntitlementRules',
  'GetEntityHistory',
  'GetDistributionsByFPS',
  'GetStakeholdersByType'
] as const;

export type ChaincodeOperation = (typeof CHAINCODE_OPERATIONS)[number];

export const isChaincodeOperation = (value: string): value is ChaincodeOperation =>
  (CHAINCODE_OPERATIONS as readonly string[]).includes(value);

export const isChaincodeQuery = (operation: ChaincodeOperation): boolean =>
  operation === 'GetLotHistory' ||
  operation === 'GetDistributionHistory' ||
  operation === 'GetCurrentStock' ||
  operation === 'VerifyDatabaseHash' ||
  operation === 'CheckDuplicateClaim' ||
  operation === 'GetRationCardHistory' ||
  operation === 'GetActiveEntitlementRules' ||
  operation === 'GetEntityHistory' ||
  operation === 'GetDistributionsByFPS' ||
  operation === 'GetStakeholdersByType';
