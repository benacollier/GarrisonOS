import { describe, it, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRouter, validateEnvironment } from '../api/server.js';

class MockRequest extends EventEmitter {
  public method: string;
  public url: string;
  public headers: Record<string, string>;
  public socket = { remoteAddress: '127.0.0.1' };

  constructor(method: string, url: string, headers: Record<string, string> = {}) {
    super();
    this.method = method;
    this.url = url;
    this.headers = { host: '127.0.0.1:3000', ...headers };
  }
}

class MockResponse {
  public statusCode = 200;
  public headers: Record<string, string> = {};
  public body = '';
  public writableEnded = false;

  public setHeader(key: string, value: string): void {
    this.headers[key.toLowerCase()] = value;
  }

  public writeHead(statusCode: number, headers: Record<string, string> = {}): void {
    this.statusCode = statusCode;
    Object.entries(headers).forEach(([key, value]) => {
      this.headers[key.toLowerCase()] = value;
    });
  }

  public end(chunk?: string): void {
    if (chunk) this.body += chunk;
    this.writableEnded = true;
  }
}

async function handleBatch(body: unknown): Promise<{ statusCode: number; body: any }> {
  const router = createRouter(31_234);
  const request = new MockRequest('POST', '/api/v1/batch', {
    'content-type': 'application/json',
    'x-tenant-id': 'tenant-test'
  });
  const response = new MockResponse();
  const promise = router.handle(request as any, response as any);
  request.emit('data', Buffer.from(JSON.stringify(body)));
  request.emit('end');
  await promise;
  return { statusCode: response.statusCode, body: JSON.parse(response.body) };
}

describe('Environment validation', () => {
  it('requires APP_SECRET outside development and test', () => {
    assert.throws(
      () => validateEnvironment('production', undefined),
      /APP_SECRET must be set/
    );
    assert.throws(
      () => validateEnvironment('staging', '   '),
      /APP_SECRET must be set/
    );
  });

  it('allows explicit secrets and local development defaults', () => {
    assert.doesNotThrow(() => validateEnvironment('production', 'secure-secret'));
    assert.doesNotThrow(() => validateEnvironment('development', undefined));
    assert.doesNotThrow(() => validateEnvironment('test', undefined));
  });
});

describe('Batch endpoint', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects malformed, empty, oversized, and mutating batches', async () => {
    for (const body of [
      {},
      { requests: [] },
      { requests: Array.from({ length: 11 }, () => ({ method: 'GET', path: '/health' })) },
      { requests: [{ method: 'POST', path: '/api/v1/properties' }] },
      { requests: [{ method: 'GET', path: 'https://evil.example' }] }
    ]) {
      const result = await handleBatch(body);
      assert.equal(result.statusCode, 400);
      assert.equal(result.body.error.code, 'VALIDATION_ERROR');
    }
  });

  it('forwards authentication context and returns indexed response envelopes', async () => {
    const seen: Array<{ url: string; init: RequestInit | undefined }> = [];
    globalThis.fetch = async (url, init) => {
      seen.push({ url: String(url), init });
      return new Response(JSON.stringify({ success: true, data: { status: 'ok' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };

    const router = createRouter(31_234);
    const request = new MockRequest('POST', '/api/v1/batch', {
      'content-type': 'application/json',
      'x-tenant-id': 'tenant-test',
      'x-request-id': 'request-test'
    });
    const response = new MockResponse();
    const promise = router.handle(request as any, response as any);
    request.emit('data', Buffer.from(JSON.stringify({
      requests: [
        { method: 'GET', path: '/health' },
        { method: 'GET', path: '/api/v1/modules' }
      ]
    })));
    request.emit('end');
    await promise;

    const parsed = JSON.parse(response.body);
    assert.equal(response.statusCode, 200);
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.responses.response_0.path, '/health');
    assert.equal(parsed.data.responses.response_1.path, '/api/v1/modules');
    assert.equal(parsed.meta.total, 2);
    assert.equal(seen.length, 2);
    assert.equal(seen[0]!.url, 'http://127.0.0.1:31234/health');
    const forwardedHeaders = new Headers(seen[0]!.init?.headers);
    assert.equal(forwardedHeaders.get('x-tenant-id'), 'tenant-test');
  });

  it('executes requests concurrently and preserves mixed response statuses', async () => {
    const started: string[] = [];
    globalThis.fetch = async (url) => {
      const path = new URL(url).pathname;
      started.push(path);
      await new Promise((resolve) => setTimeout(resolve, path === '/health' ? 25 : 5));
      return new Response(JSON.stringify({
        success: path === '/health',
        ...(path === '/health'
          ? { data: { status: 'ok' } }
          : { error: { code: 'NOT_FOUND', message: 'Missing' } })
      }), { status: path === '/health' ? 200 : 404 });
    };

    const start = Date.now();
    const result = await handleBatch({
      requests: [
        { method: 'GET', path: '/health' },
        { method: 'GET', path: '/api/v1/missing' }
      ]
    });

    assert.ok(Date.now() - start < 45);
    assert.deepEqual(started.sort(), ['/api/v1/missing', '/health']);
    assert.equal(result.body.data.responses.response_0.status, 200);
    assert.equal(result.body.data.responses.response_1.status, 404);
    assert.equal(result.body.data.responses.response_1.error.code, 'NOT_FOUND');
  });
});
