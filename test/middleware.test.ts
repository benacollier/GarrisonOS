import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { resolveCorsOrigin, securityHeadersMiddleware } from '../api/middleware.js';

class MockRequest extends EventEmitter {
  public headers: Record<string, string>;
  public socket = { remoteAddress: '127.0.0.1' };

  constructor(headers: Record<string, string> = {}) {
    super();
    this.headers = headers;
  }
}

class MockResponse {
  public headers: Record<string, string> = {};

  public setHeader(key: string, value: string): void {
    this.headers[key.toLowerCase()] = value;
  }
}

describe('Security middleware CORS policy', () => {
  it('echoes only an explicitly allowed origin and falls back safely', () => {
    const allowedOrigins = new Set(['https://app.example', 'https://admin.example']);

    assert.equal(resolveCorsOrigin('https://admin.example', allowedOrigins), 'https://admin.example');
    assert.equal(resolveCorsOrigin('https://evil.example', allowedOrigins), 'https://app.example');
    assert.equal(resolveCorsOrigin(undefined, allowedOrigins), 'https://app.example');
    assert.equal(resolveCorsOrigin('https://evil.example', new Set()), undefined);
  });

  it('never emits a wildcard CORS origin', async () => {
    const request = new MockRequest({ origin: 'https://untrusted.example' });
    const response = new MockResponse();

    await securityHeadersMiddleware(request as any, response as any, async () => {});

    assert.notEqual(response.headers['access-control-allow-origin'], '*');
    assert.equal(response.headers['access-control-allow-methods'], 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    assert.equal(
      response.headers['access-control-allow-headers'],
      'Content-Type, Authorization, X-Tenant-ID, X-Request-ID, X-User-ID'
    );
    assert.equal(response.headers['access-control-allow-credentials'], 'true');
  });

  it('does not echo an unconfigured origin', async () => {
    const request = new MockRequest({ origin: 'https://untrusted.example' });
    const response = new MockResponse();

    await securityHeadersMiddleware(request as any, response as any, async () => {});

    assert.notEqual(response.headers['access-control-allow-origin'], 'https://untrusted.example');
    assert.notEqual(response.headers['access-control-allow-origin'], '*');
  });
});
