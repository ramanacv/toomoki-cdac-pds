import { createEligibilityMockServer } from './server.js';

const port = Number(process.env.PORT ?? 3010);
const token = process.env.PDS_ELIGIBILITY_SERVICE_TOKEN ?? '';
if (!token) throw new Error('PDS_ELIGIBILITY_SERVICE_TOKEN is required');

createEligibilityMockServer(token).listen(port, '0.0.0.0', () => {
  console.log(JSON.stringify({ event: 'eligibility_mock_started', port, simulationOnly: true }));
});
