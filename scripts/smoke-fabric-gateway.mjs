const API_BASE = process.env.API_BASE ?? 'http://localhost:3000';

const request = async (path, init) => {
  const response = await fetch(`${API_BASE}${path}`, init);
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
      stakeholderId: 'GW-SMOKE-001',
      stakeholderType: 'DEPARTMENT',
      name: 'Gateway Smoke Test',
      district: 'Demo',
      licenseNo: 'GW-001',
      status: 'ACTIVE'
    })
  });

  const trace = await request('/trace/lots/LOT-RICE-2026-001');
  if (trace.verificationSource !== 'chaincode') {
    console.warn('Expected verificationSource=chaincode in fabric mode');
  }

  console.log('Fabric gateway smoke passed');
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
