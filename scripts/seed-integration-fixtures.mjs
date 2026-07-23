#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getServiceAccessToken } from './iam/service-token.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiBase = process.env.API_BASE ?? 'http://127.0.0.1:3000';
const clientSecret = process.env.PDS_INTEGRATION_CLIENT_SECRET;
if (!clientSecret) throw new Error('Set PDS_INTEGRATION_CLIENT_SECRET to seed integration fixtures');

const token = await getServiceAccessToken({
  clientId: 'pds-integration-maharashtra',
  clientSecret
});
const fixtures = JSON.parse(
  await readFile(resolve(root, 'mock/integrations/maharashtra-sandbox-events.json'), 'utf8')
);
const results = [];
const request = async (path, method = 'GET') => {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` }
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${body?.message ?? JSON.stringify(body)}`);
  return body;
};

for (const fixture of fixtures) {
  const response = await fetch(`${apiBase}${fixture.endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(fixture.envelope)
  });
  const body = await response.json();
  if (![200, 201, 202].includes(response.status)) {
    throw new Error(`${fixture.endpoint} failed: ${response.status} ${body?.message ?? JSON.stringify(body)}`);
  }
  results.push({
    endpoint: fixture.endpoint,
    sourceEventId: fixture.envelope.sourceEventId,
    statusCode: response.status,
    operationalStatus: body.provenance?.status,
    operationId: body.provenance?.operationId
  });
}

const reconciliation = await request('/integrations/reconcile', 'POST');
const sourceHealth = await request('/integrations/health');

console.log(JSON.stringify({
  adapter: 'fixture-backed-maharashtra-sandbox',
  realIntegration: false,
  accepted: results,
  reconciliation,
  sourceHealth
}, null, 2));
