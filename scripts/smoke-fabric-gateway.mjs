import { getServiceAccessToken } from './iam/service-token.mjs';

const API_BASE = process.env.API_BASE ?? 'http://localhost:3000';
const AUTH_TOKEN = await getServiceAccessToken();
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
  const network = await request('/admin/network');
  if (network.ledgerMode !== 'fabric') throw new Error(`Expected fabric ledgerMode, got ${network.ledgerMode}`);

  await request('/stakeholders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stakeholderId: SMOKE_ID,
      stakeholderType: 'DISTRICT_SUPPLY_OFFICE',
      name: 'Gateway Smoke Test',
      district: 'Demo',
      licenseNo: SMOKE_ID,
      status: 'ACTIVE'
    })
  });

  // After admin reset / live-lifecycle, fixture lot ids may not exist — discover a Rice lot.
  const lots = await request('/lots');
  const riceLot = Array.isArray(lots)
    ? lots.find((lot) => lot?.commodity === 'Rice') ?? lots[0]
    : null;
  if (!riceLot?.lotId) {
    throw new Error('No lots available to trace in fabric smoke');
  }

  const trace = await request(`/trace/lots/${riceLot.lotId}`);
  if (trace.verificationSource !== 'chaincode') {
    throw new Error(`Expected verificationSource=chaincode in fabric mode, got ${trace.verificationSource}`);
  }

  console.log(`Fabric gateway smoke passed (lot=${riceLot.lotId})`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
