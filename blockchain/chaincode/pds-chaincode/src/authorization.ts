/**
 * MSP / client-identity authorization for the PDS chaincode (T1.5).
 *
 * Each write operation is mapped to the MSP(s) allowed to submit it, based on
 * the organization layout in blockchain/fabric-network/organization-layout.json:
 *
 *   - ProcurementMillerMSP  → procurement center (CreateCommodityLot, DispatchLot from procurement)
 *   - GodownWarehouseMSP    → state/block godowns (ReceiveLot, AllocateToFPS, DispatchLot from godown)
 *   - FairPriceShopMSP      → FPS (RecordDistribution, RegisterBeneficiaryHash)
 *   - FoodAndCivilSuppliesMSP → department / entitlement authority (CreateMonthlyEntitlement)
 *   - AuditAuthorityMSP     → auditors (RaiseAuditFlag, ResolveAuditFlag)
 *
 * Query operations (Get*) are read-only and open to any authenticated MSP.
 *
 * Divergence from the demo invoker: the demo invoker (src/invoker.ts) runs
 * out-of-band with NO fabric client identity, so it bypasses these checks.
 * Fabric deployments enforce MSP/role gating here. This divergence is
 * intentional and documented in DEPLOYMENT.md.
 */

export type ClientIdentity = {
  getMSPID(): string;
  getAttributeValue(name: string): string | undefined;
};

/**
 * Operation → set of allowed MSP IDs. An empty set means "any authenticated
 * identity" (used for read-only queries, which are not gated here).
 */
const OPERATION_MSP_ALLOWLIST: Record<string, Set<string>> = {
  // Supply chain
  CreateCommodityLot: new Set(['ProcurementMillerMSP']),
  TransformLot: new Set(['ProcurementMillerMSP']),
  DispatchLot: new Set(['ProcurementMillerMSP', 'GodownWarehouseMSP']),
  ReceiveLot: new Set(['GodownWarehouseMSP', 'ProcurementMillerMSP']),
  AllocateToFPS: new Set(['GodownWarehouseMSP']),
  RecordFPSReceipt: new Set(['FairPriceShopMSP']),
  // Beneficiary auth & distribution
  RegisterBeneficiaryHash: new Set(['FairPriceShopMSP']),
  CreateMonthlyEntitlement: new Set(['FoodAndCivilSuppliesMSP']),
  RecordDistribution: new Set(['FairPriceShopMSP']),
  // Audit
  RaiseAuditFlag: new Set(['AuditAuthorityMSP', 'FoodAndCivilSuppliesMSP']),
  ResolveAuditFlag: new Set(['AuditAuthorityMSP', 'FoodAndCivilSuppliesMSP']),
  RegisterStakeholder: new Set(['FoodAndCivilSuppliesMSP', 'AuditAuthorityMSP']),
  RecordLedgerProof: new Set(['AuditAuthorityMSP']),
  // Ration card lifecycle
  IssueRationCard: new Set(['FoodAndCivilSuppliesMSP']),
  ActivateRationCard: new Set(['FoodAndCivilSuppliesMSP']),
  SuspendRationCard: new Set(['FoodAndCivilSuppliesMSP', 'AuditAuthorityMSP']),
  TransferRationCard: new Set(['FoodAndCivilSuppliesMSP']),
  // Grievance management — FileGrievance is intentionally omitted (ungated, any authenticated MSP)
  AcknowledgeGrievance: new Set(['FairPriceShopMSP']),
  ResolveGrievance: new Set(['FairPriceShopMSP', 'FoodAndCivilSuppliesMSP']),
  EscalateOverdueGrievances: new Set(['AuditAuthorityMSP']),
  // Entitlement rules
  ProposeEntitlementRule: new Set(['FoodAndCivilSuppliesMSP']),
  ApproveEntitlementRule: new Set(['AuditAuthorityMSP']),
  // Quota rollover
  RolloverUnclaimedQuota: new Set(['FoodAndCivilSuppliesMSP'])
};

export const assertAuthorized = (operation: string, identity: ClientIdentity): void => {
  const allowed = OPERATION_MSP_ALLOWLIST[operation];
  if (!allowed) {
    // Queries and unmapped operations are not MSP-gated here.
    return;
  }
  const mspId = identity.getMSPID();
  if (!allowed.has(mspId)) {
    throw new Error(`MSP ${mspId} is not authorized to perform ${operation}`);
  }
};
