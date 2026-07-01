const API_BASE = process.env.API_BASE ?? 'http://localhost:3000';
const AUTH_TOKEN = process.env.PDS_DEV_AUTH_TOKEN ?? process.env.SMOKE_AUTH_TOKEN;
const SMOKE_ID = `GW-SMOKE-${Date.now()}`;

const request = async (path, init) => {
  const headers = new Headers(init?.headers);
  if (AUTH_TOKEN) {
    headers.set('Authorization', `Bearer ${AUTH_TOKEN}`);
  }
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${response.status}`);
  }
  return response.json();
};

const main = async () => {
  const health = await request('/health');
  if (!health.ok) {
    throw new Error('API health check failed');
  }

  await request('/stakeholders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stakeholderId: SMOKE_ID,
      stakeholderType: 'DEPARTMENT',
      name: 'Gateway Smoke Test',
      district: 'Demo',
      licenseNo: SMOKE_ID,
      status: 'ACTIVE'
    })
  });

  const trace = await request('/trace/lots/LOT-RICE-2026-001');
  if (trace.verificationSource !== 'chaincode') {
    throw new Error(`Expected verificationSource=chaincode in fabric mode, got ${trace.verificationSource}`);
  }

  console.log('Fabric gateway smoke passed');
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
