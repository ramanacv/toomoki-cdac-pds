const DEFAULT_TOKEN_URL = 'http://localhost:8080/realms/viksitpds/protocol/openid-connect/token';

export async function getServiceAccessToken(options = {}) {
  if (process.env.PDS_E2E_ACCESS_TOKEN) return process.env.PDS_E2E_ACCESS_TOKEN;
  const clientId = options.clientId ?? process.env.PDS_OIDC_SERVICE_CLIENT_ID ?? 'pds-benchmark';
  const clientSecret = options.clientSecret ?? process.env.PDS_BENCHMARK_CLIENT_SECRET;
  if (!clientSecret) throw new Error('Set PDS_BENCHMARK_CLIENT_SECRET; static deployed API tokens are not supported');
  const tokenUrl = options.tokenUrl ?? process.env.PDS_OIDC_TOKEN_URL ?? DEFAULT_TOKEN_URL;
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret })
  });
  if (!response.ok) throw new Error(`OIDC client-credentials request failed with ${response.status}`);
  const body = await response.json();
  if (typeof body.access_token !== 'string' || !body.access_token) throw new Error('OIDC response did not include an access token');
  return body.access_token;
}
