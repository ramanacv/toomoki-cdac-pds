const operationalRoles = ['management', 'department', 'procurement', 'fci', 'godown', 'block-office', 'fps', 'auditor'] as const;
const secured = (summary: string, roles: readonly string[] = operationalRoles) => ({
  summary,
  'x-required-roles': roles,
  responses: {
    '401': { $ref: '#/components/responses/Unauthorized' },
    '403': { $ref: '#/components/responses/Forbidden' }
  }
});

export const OPENAPI_SPEC = {
  openapi: '3.0.0',
  info: {
    title: 'ViksitPDS API',
    version: '0.1.0',
    description: 'ViksitPDS near-MVP API. Online operations use OIDC bearer authentication; PostgreSQL operations commit before asynchronous Fabric proofs.'
  },
  security: [{ oidcBearer: [] }],
  components: {
    securitySchemes: {
      oidcBearer: {
        type: 'http', scheme: 'bearer', bearerFormat: 'JWT',
        description: 'Keycloak access token issued for the pds-api audience.'
      }
    },
    responses: {
      Unauthorized: { description: 'Missing, expired, invalid, wrong-issuer, wrong-audience or unverifiable bearer token.' },
      Forbidden: { description: 'Authenticated identity lacks a required application role.' }
    }
  },
  'x-role-policy': {
    stakeholderCreate: ['department'], lotCreate: ['fci'], dispatch: ['fci', 'godown'],
    transferReceipt: ['fci', 'godown'], stageTwoAuthorization: ['department'], allocation: ['department', 'block-office'],
    fpsReceipt: ['fps'], authentication: ['fps'], distribution: ['fps'], entitlementWrite: ['department'],
    entitlementValidation: ['department', 'fps'], reconciliation: ['auditor'], admin: ['platform-admin'],
    metrics: ['metrics-reader', 'platform-admin'], reset: ['demo-reset'],
    integrations: ['integration-service'],
    eligibilityRead: ['department', 'auditor', 'management'],
    eligibilityMutation: ['department'],
    beneficiaryRegistryRead: ['department', 'auditor', 'management'],
    beneficiaryRegistryMutation: ['department']
  },
  servers: [{ url: '/', description: 'Current host' }],
  paths: {
    '/health': { get: { summary: 'Minimal health check', security: [] } },
    '/health/live': { get: { summary: 'Liveness check', security: [] } },
    '/health/ready': { get: { summary: 'Minimal readiness check', security: [] } },
    '/dashboard/summary': { get: secured('Get dashboard summary') },
    '/stock': { get: secured('List stock positions by org and commodity') },
    '/stakeholders': {
      get: secured('List stakeholders'),
      post: secured('Register stakeholder', ['department'])
    },
    '/lots': {
      get: secured('List commodity lots'),
      post: secured('Create commodity lot', ['fci'])
    },
    '/lots/{lotId}': { get: secured('Get commodity lot') },
    '/lots/{lotId}/history': { get: secured('Get lot history') },
    '/transfers': {
      get: secured('List transfers'),
      post: secured('Dispatch stock', ['fci', 'godown'])
    },
    '/transfers/{transferId}': { get: secured('Get transfer order') },
    '/transfers/{transferId}/authorize': { post: secured('Authorize Stage-II movement', ['department']) },
    '/transfers/{transferId}/receive': { post: secured('Receive stock', ['fci', 'godown']) },
    '/ledger-events': { get: secured('List ledger evidence events') },
    '/fps-allocations': {
      get: secured('List allocations'),
      post: secured('Allocate stock to FPS', ['department', 'block-office'])
    },
    '/fps-allocations/{allocationId}': { get: secured('Get FPS allocation') },
    '/fps-allocations/{allocationId}/receipt': { post: secured('Confirm FPS receipt', ['fps']) },
    '/auth/transactions': { get: secured('List authentication transactions', ['fps', 'department', 'auditor']) },
    '/auth/transactions/{authTxnId}': { get: secured('Get authentication transaction', ['fps', 'department', 'auditor']) },
    '/auth/mock-otp': { post: secured('Simulate OTP authentication', ['fps']) },
    '/auth/simulated-biometric': { post: secured('Simulate biometric authentication', ['fps']) },
    '/auth/supervisor-exception': { post: secured('Record supervisor exception', ['fps']) },
    '/entitlements/{rationCardHash}': { get: secured('Get monthly entitlement', ['fps', 'department', 'auditor']) },
    '/entitlements': {
      get: secured('List entitlements', ['fps', 'department', 'auditor']),
      post: secured('Create or update entitlement', ['department'])
    },
    '/entitlements/validate': { post: secured('Validate entitlement', ['department', 'fps']) },
    '/distributions': {
      get: secured('List distributions', ['fps', 'department', 'auditor', 'management']),
      post: secured('Record distribution', ['fps'])
    },
    '/distributions/{distributionId}': { get: secured('Get distribution receipt', ['fps', 'department', 'auditor', 'management']) },
    '/trace/lots/{lotId}': { get: secured('Verify lot trace') },
    '/trace/distributions/{distributionId}': { get: secured('Verify distribution trace') },
    '/trace/verify': { post: secured('Verify database digest against chain ledger') },
    '/audit-alerts': { get: secured('List audit alerts', ['auditor']) },
    '/audit-alerts/reconcile': { post: secured('Reconcile alerts', ['auditor']) },
    '/audit-alerts/{alertId}/resolve': { post: secured('Resolve audit alert', ['auditor']) },
    '/ledger-proofs/{eventId}': { get: secured('Get asynchronous Fabric proof status') },
    '/admin/proofs/summary': { get: secured('Summarize durable proof pipeline states', ['platform-admin', 'auditor']) },
    '/admin/overview': { get: secured('Get application administration overview', ['platform-admin']) },
    '/admin/network': { get: secured('Get ledger and persistence topology', ['platform-admin']) },
    '/admin/activity': { get: secured('Get recent application activity', ['platform-admin']) },
    '/admin/stakeholders/summary': { get: secured('Get stakeholder summary', ['platform-admin']) },
    '/admin/reset': { post: secured('Reset explicitly authorized demo data', ['demo-reset']) },
    '/metrics': { get: secured('Get Prometheus metrics', ['metrics-reader', 'platform-admin']) },
    '/integrations/smartpds/v1/master-references': { post: secured('Ingest SMART-PDS/RCMS master reference event', ['integration-service']) },
    '/integrations/scm/v1/allocation-events': { post: secured('Ingest state-SCM allocation event', ['integration-service']) },
    '/integrations/scm/v1/movement-events': { post: secured('Ingest state-SCM movement event', ['integration-service']) },
    '/integrations/epos/v1/distribution-events': { post: secured('Ingest AePDS/ePoS distribution event', ['integration-service']) },
    '/integrations/events': { get: secured('List privacy-safe source-event provenance', ['integration-service']) },
    '/integrations/events/{sourceSystem}/{sourceEventId}/trace': {
      get: secured('Trace a source event to its operation and Fabric proof state', ['integration-service'])
    },
    '/integrations/health': { get: secured('Get per-source ingestion health', ['integration-service']) },
    '/integrations/reconcile': { post: secured('Reconcile imported source events', ['integration-service']) }
    ,
    '/eligibility/v1/summary': { get: secured('Summarize synthetic external eligibility screening', ['department', 'auditor', 'management']) },
    '/eligibility/v1/screenings': { post: secured('Run external eligibility screening', ['department']) },
    '/eligibility/v1/cases': { get: secured('List eligibility review cases', ['department', 'auditor', 'management']) },
    '/eligibility/v1/cases/{caseId}': { get: secured('Get eligibility review case', ['department', 'auditor', 'management']) },
    '/eligibility/v1/cases/{caseId}/notice': { post: secured('Issue guided review notice', ['department']) },
    '/eligibility/v1/cases/{caseId}/verification': { post: secured('Record guided verification', ['department']) },
    '/eligibility/v1/cases/{caseId}/recommendation': { post: secured('Record review recommendation', ['department']) },
    '/eligibility/v1/cases/{caseId}/decision': { post: secured('Record authorized mock RCMS decision', ['department']) },
    '/eligibility/v1/cases/{caseId}/appeals': { post: secured('Record eligibility appeal', ['department']) },
    '/eligibility/v1/cases/{caseId}/reinstate': { post: secured('Reverse decision and reinstate remaining entitlement', ['department']) },
    '/eligibility/v1/entitlement-gate': { post: secured('Demonstrate effective entitlement gate', ['department', 'auditor', 'management']) },
    '/eligibility/v1/demo/reset': { post: secured('Reset only synthetic eligibility demo state', ['demo-reset']) },
    '/beneficiary-registry/v1/summary': {
      get: secured('Summarize privacy-safe beneficiary lifecycle projections', ['department', 'auditor', 'management'])
    },
    '/beneficiary-registry/v1/events': {
      post: secured('Record an authorized beneficiary lifecycle mutation and proof intent', ['department'])
    }
  }
} as const;
