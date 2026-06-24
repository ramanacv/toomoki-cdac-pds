export const OPENAPI_SPEC = {
  openapi: '3.0.0',
  info: {
    title: 'PDS-Chain API',
    version: '0.1.0',
    description: 'Local OpenAPI document for the PDS-Chain MVP API'
  },
  servers: [{ url: '/', description: 'Current host' }],
  paths: {
    '/health': { get: { summary: 'Health check' } },
    '/dashboard/summary': { get: { summary: 'Get dashboard summary' } },
    '/stakeholders': {
      get: { summary: 'List stakeholders' },
      post: { summary: 'Register stakeholder' }
    },
    '/lots': {
      get: { summary: 'List commodity lots' },
      post: { summary: 'Create commodity lot' }
    },
    '/lots/{lotId}': { get: { summary: 'Get commodity lot' } },
    '/lots/{lotId}/history': { get: { summary: 'Get lot history' } },
    '/transfers': {
      get: { summary: 'List transfers' },
      post: { summary: 'Dispatch stock' }
    },
    '/transfers/{transferId}': { get: { summary: 'Get transfer order' } },
    '/transfers/{transferId}/receive': { post: { summary: 'Receive stock' } },
    '/fps-allocations': {
      get: { summary: 'List allocations' },
      post: { summary: 'Allocate stock to FPS' }
    },
    '/fps-allocations/{allocationId}': { get: { summary: 'Get FPS allocation' } },
    '/fps-allocations/{allocationId}/receipt': { post: { summary: 'Confirm FPS receipt' } },
    '/auth/transactions': { get: { summary: 'List authentication transactions' } },
    '/auth/transactions/{authTxnId}': { get: { summary: 'Get authentication transaction' } },
    '/auth/mock-otp': { post: { summary: 'Simulate OTP authentication' } },
    '/auth/simulated-biometric': { post: { summary: 'Simulate biometric authentication' } },
    '/auth/supervisor-exception': { post: { summary: 'Record supervisor exception' } },
    '/entitlements/{rationCardHash}': { get: { summary: 'Get monthly entitlement' } },
    '/entitlements': { get: { summary: 'List entitlements' } },
    '/entitlements/validate': { post: { summary: 'Validate entitlement' } },
    '/distributions': {
      get: { summary: 'List distributions' },
      post: { summary: 'Record distribution' }
    },
    '/distributions/{distributionId}': { get: { summary: 'Get distribution receipt' } },
    '/trace/lots/{lotId}': { get: { summary: 'Verify lot trace' } },
    '/trace/distributions/{distributionId}': { get: { summary: 'Verify distribution trace' } },
    '/trace/verify': { post: { summary: 'Verify database digest against chain ledger' } },
    '/audit-alerts': { get: { summary: 'List audit alerts' } },
    '/audit-alerts/reconcile': { post: { summary: 'Reconcile alerts' } },
    '/audit-alerts/{alertId}/resolve': { post: { summary: 'Resolve audit alert' } }
  }
} as const;
