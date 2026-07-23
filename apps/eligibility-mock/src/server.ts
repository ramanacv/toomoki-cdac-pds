import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { EligibilityScreeningEngine, ScreeningConflictError } from './screening.js';

const json = (response: ServerResponse, status: number, body: unknown): void => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
};

const readJson = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (chunks.reduce((total, chunk) => total + chunk.length, 0) > 32_768) throw new Error('Request body is too large');
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

export type EligibilityHttpResult = { status: number; body: unknown };

export const handleEligibilityHttp = (
  token: string,
  engine: EligibilityScreeningEngine,
  request: {
    method?: string | undefined;
    url?: string | undefined;
    authorization?: string | undefined;
    body?: unknown;
  }
): EligibilityHttpResult => {
  if (request.method === 'GET' && request.url === '/health') {
    return { status: 200, body: { ok: true, service: 'eligibility-mock', simulationOnly: true } };
  }
  if (request.method !== 'POST' || request.url !== '/v1/screenings') {
    return { status: 404, body: { message: 'Not found' } };
  }
  if (!token || request.authorization !== `Bearer ${token}`) {
    return { status: 401, body: { message: 'Unauthorized service caller' } };
  }
  try {
    return { status: 200, body: engine.screen(request.body) };
  } catch (error) {
    if (error instanceof ScreeningConflictError) return { status: 409, body: { message: error.message } };
    return { status: 400, body: { message: error instanceof Error ? error.message : 'Invalid screening request' } };
  }
};

export const createEligibilityMockServer = (token: string, engine = new EligibilityScreeningEngine()) =>
  createServer(async (request, response) => {
    let body: unknown;
    if (request.method === 'POST') {
      try {
        body = await readJson(request);
      } catch (error) {
        json(response, 400, { message: error instanceof Error ? error.message : 'Invalid JSON body' });
        return;
      }
    }
    const result = handleEligibilityHttp(token, engine, {
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      body
    });
    json(response, result.status, result.body);
  });
