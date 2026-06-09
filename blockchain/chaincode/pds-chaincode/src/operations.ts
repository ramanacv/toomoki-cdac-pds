export const CHAINCODE_OPERATIONS = [
  'RegisterStakeholder',
  'CreateCommodityLot',
  'DispatchLot',
  'ReceiveLot',
  'AllocateToFPS',
  'RecordFPSReceipt',
  'RegisterBeneficiaryHash',
  'CreateMonthlyEntitlement',
  'RecordDistribution',
  'CheckDuplicateClaim',
  'RaiseAuditFlag',
  'ResolveAuditFlag',
  'RecordLedgerProof',
  'GetLotHistory',
  'GetDistributionHistory',
  'GetCurrentStock',
  'VerifyDatabaseHash'
] as const;

export type ChaincodeOperation = (typeof CHAINCODE_OPERATIONS)[number];

export const isChaincodeOperation = (value: string): value is ChaincodeOperation =>
  (CHAINCODE_OPERATIONS as readonly string[]).includes(value);

export const isChaincodeQuery = (operation: ChaincodeOperation): boolean =>
  operation === 'GetLotHistory' ||
  operation === 'GetDistributionHistory' ||
  operation === 'GetCurrentStock' ||
  operation === 'VerifyDatabaseHash' ||
  operation === 'CheckDuplicateClaim';
