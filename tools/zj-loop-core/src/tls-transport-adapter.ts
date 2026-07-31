import { request, type RequestOptions } from 'node:https';
import type { TransportAdapter, TransportEnvelope, TransportResult } from './transport-contract.js';
import { validateTransportEnvelope } from './transport-contract.js';

export const TLS_TRANSPORT_PROTOCOL = 'transport.v1' as const;

type TlsTransportAdapterInput = {
  endpoint: string;
  ca: string | Buffer;
  cert: string | Buffer;
  key: string | Buffer;
  bearer_token: string;
  protocol_version?: string;
  request_timeout_ms?: number;
};

type HttpResponse = { statusCode: number; body: unknown };

function requiredText(value: unknown, error: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(error);
}

function requiredCredential(value: unknown, error: string): asserts value is string | Buffer {
  if (!(typeof value === 'string' || Buffer.isBuffer(value)) || value.length === 0) throw new Error(error);
}

function pathSegment(value: string, error: string): string {
  requiredText(value, error);
  return encodeURIComponent(value);
}

function parseEndpoint(value: string): URL {
  requiredText(value, 'transport-endpoint-required');
  let endpoint: URL;
  try { endpoint = new URL(value); } catch { throw new Error('transport-endpoint-invalid'); }
  if (endpoint.protocol !== 'https:') throw new Error('transport-endpoint-https-required');
  return endpoint;
}

function bodyObject(value: unknown, error: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(error);
  return value as Record<string, unknown>;
}

function result(value: unknown): TransportResult {
  const body = bodyObject(value, 'transport-response-invalid');
  if (body.side_effects_executed !== false || !['accepted', 'duplicate', 'blocked'].includes(String(body.status))) throw new Error('transport-response-invalid');
  if (body.status === 'blocked') {
    requiredText(body.reason, 'transport-response-reason-invalid');
    return { status: 'blocked', ...(typeof body.message_id === 'string' ? { message_id: body.message_id } : {}), reason: body.reason, side_effects_executed: false };
  }
  requiredText(body.message_id, 'transport-response-message-id-invalid');
  requiredText(body.envelope_digest, 'transport-response-digest-invalid');
  if (!/^sha256:[0-9a-f]{64}$/.test(body.envelope_digest)) throw new Error('transport-response-digest-invalid');
  const status = body.status as 'accepted' | 'duplicate';
  return { status, message_id: body.message_id, envelope_digest: body.envelope_digest, side_effects_executed: false };
}

export function createTlsTransportAdapter(input: TlsTransportAdapterInput): TransportAdapter {
  const endpoint = parseEndpoint(input.endpoint);
  requiredText(input.bearer_token, 'transport-bearer-token-required');
  requiredCredential(input.ca, 'transport-ca-required');
  requiredCredential(input.cert, 'transport-client-cert-required');
  requiredCredential(input.key, 'transport-client-key-required');
  const protocolVersion = input.protocol_version ?? TLS_TRANSPORT_PROTOCOL;
  requiredText(protocolVersion, 'transport-protocol-version-required');
  const timeout = input.request_timeout_ms ?? 10_000;
  if (!Number.isInteger(timeout) || timeout <= 0) throw new Error('transport-timeout-invalid');

  async function call(method: string, pathname: string, body?: unknown): Promise<HttpResponse> {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const options: RequestOptions = {
      protocol: 'https:', hostname: endpoint.hostname, port: endpoint.port || 443, method,
      path: `${endpoint.pathname.replace(/\/$/, '')}${pathname}`,
      ca: input.ca, cert: input.cert, key: input.key, rejectUnauthorized: true, minVersion: 'TLSv1.3',
      timeout, headers: { authorization: `Bearer ${input.bearer_token}`, ...(payload === undefined ? {} : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }) },
    };
    return new Promise((resolve, reject) => {
      const req = request(options, (response) => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { text += chunk; });
        response.on('end', () => {
          if (!text) { resolve({ statusCode: response.statusCode ?? 0, body: null }); return; }
          try { resolve({ statusCode: response.statusCode ?? 0, body: JSON.parse(text) }); } catch { reject(new Error('transport-response-json-invalid')); }
        });
      });
      req.on('timeout', () => req.destroy(new Error('transport-request-timeout')));
      req.on('error', reject);
      if (payload !== undefined) req.write(payload);
      req.end();
    });
  }

  function blocked(response: HttpResponse): never {
    const body = bodyObject(response.body, 'transport-response-invalid');
    requiredText(body.reason, 'transport-response-reason-invalid');
    throw new Error(String(body.reason));
  }

  return {
    async openSession(session) {
      requiredText(session.network_id, 'transport-network-id-required');
      requiredText(session.node_id, 'transport-node-id-required');
      const response = await call('POST', '/v1/transport/sessions', { network_id: session.network_id, node_id: session.node_id, protocol_version: protocolVersion });
      if (response.statusCode !== 200 && response.statusCode !== 201) blocked(response);
      const body = bodyObject(response.body, 'transport-session-response-invalid');
      const sessionBody = bodyObject(body.session, 'transport-session-response-invalid');
      requiredText(sessionBody.session_id, 'transport-session-id-invalid');
      return { session_id: sessionBody.session_id };
    },
    async send(session) {
      requiredText(session.session_id, 'transport-session-id-required');
      const validation = validateTransportEnvelope(session.envelope);
      if (validation.status !== 'valid') throw new Error(validation.reason);
      const response = await call('POST', `/v1/transport/sessions/${pathSegment(session.session_id, 'transport-session-id-required')}/envelopes`, session.envelope);
      if (![200, 201, 202, 409].includes(response.statusCode)) blocked(response);
      return result(response.body);
    },
    async receive(session) {
      requiredText(session.session_id, 'transport-session-id-required');
      const response = await call('GET', `/v1/transport/sessions/${pathSegment(session.session_id, 'transport-session-id-required')}/envelopes`);
      if (response.statusCode === 204) return null;
      if (response.statusCode !== 200) blocked(response);
      const envelope = response.body as TransportEnvelope;
      const validation = validateTransportEnvelope(envelope);
      if (validation.status !== 'valid') throw new Error(validation.reason);
      return envelope;
    },
    async acknowledge(inputValue) {
      requiredText(inputValue.session_id, 'transport-session-id-required');
      requiredText(inputValue.message_id, 'transport-message-id-required');
      requiredText(inputValue.envelope_digest, 'transport-envelope-digest-required');
      const response = await call('POST', `/v1/transport/sessions/${pathSegment(inputValue.session_id, 'transport-session-id-required')}/ack`, { message_id: inputValue.message_id, envelope_digest: inputValue.envelope_digest });
      if (![200, 201, 202, 409].includes(response.statusCode)) blocked(response);
      return result(response.body);
    },
    async closeSession(inputValue) {
      requiredText(inputValue.session_id, 'transport-session-id-required');
      const response = await call('DELETE', `/v1/transport/sessions/${pathSegment(inputValue.session_id, 'transport-session-id-required')}`);
      if (response.statusCode !== 204 && response.statusCode !== 200) blocked(response);
    },
  };
}
