import { createEposAuthMockServer } from './server.js';

const port = Number(process.env.PORT ?? 3011);
const token = process.env.PDS_EPOS_AUTH_SERVICE_TOKEN ?? '';
if (!token) throw new Error('PDS_EPOS_AUTH_SERVICE_TOKEN is required');

createEposAuthMockServer(token).listen(port, '0.0.0.0', () => {
  console.log(
    JSON.stringify({
      event: 'epos_auth_mock_started',
      port,
      simulationOnly: true,
      note: 'Aadhaar-format auth simulation only; no live UIDAI connectivity'
    })
  );
});
