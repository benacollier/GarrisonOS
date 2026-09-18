import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  rateLimitMiddleware,
  resetRateLimitMap,
  evictExpiredRateLimits,
  getRateLimitConfig
} from '../../api/middleware.js';

class MockRequest extends EventEmitter {
  public method: string;
  public path: string;
  public headers: Record<string, string>;
  public operatorId?: string;
  public socket = { remoteAddress: '127.0.0.1' };

  constructor(path = '/api/v1/properties', operatorId?: string, ip = '127.0.0.1') {
    super();
    this.method = 'GET';
    this.path = path;
    this.operatorId = operatorId;
    this.headers = {
      'x-forwarded-for': ip
    };
    if (operatorId) {
      this.headers['x-operator-id'] = operatorId;
    }
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
    for (const [k, v] of Object.entries(headers)) {
      this.headers[k.toLowerCase()] = v;
    }
  }

  public end(chunk?: string): void {
    if (chunk) this.body += chunk;
    this.writableEnded = true;
  }

  public json(): any {
    try {
      return JSON.parse(this.body);
    } catch {
      return null;
    }
  }
}

describe('Global Sliding-Window Rate Limiter Subsystem', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetRateLimitMap();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetRateLimitMap();
  });

  it('throttles sensitive auth endpoints when 10 req/15min threshold is exceeded', async () => {
    const path = '/api/v1/auth/login';
    const clientIp = '192.168.1.50';

    // First 10 requests should succeed
    for (let i = 0; i < 10; i++) {
      const req = new MockRequest(path, undefined, clientIp);
      const res = new MockResponse();
      let nextCalled = false;

      await rateLimitMiddleware(req as any, res as any, async () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true, `Request #${i + 1} should be permitted`);
      assert.equal(res.statusCode, 200);
    }

    // 11th request should be throttled with HTTP 429
    const req11 = new MockRequest(path, undefined, clientIp);
    const res11 = new MockResponse();
    let nextCalled11 = false;

    await rateLimitMiddleware(req11 as any, res11 as any, async () => {
      nextCalled11 = true;
    });

    assert.equal(nextCalled11, false);
    assert.equal(res11.statusCode, 429);
    assert.ok(res11.headers['retry-after']);
    const body = res11.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'RATE_LIMITED');
  });

  it('keys authenticated operational routes by operator ID and isolates operator counters', async () => {
    const operatorA = 'op-alpha-123';
    const operatorB = 'op-beta-456';
    const path = '/api/v1/properties';

    // Override env for faster threshold test
    process.env['RATE_LIMIT_OPERATOR_MAX'] = '5';
    process.env['RATE_LIMIT_OPERATOR_WINDOW_MS'] = '60000';

    // Operator A makes 5 requests (fills quota)
    for (let i = 0; i < 5; i++) {
      const req = new MockRequest(path, operatorA, '127.0.0.1');
      const res = new MockResponse();
      let nextCalled = false;
      await rateLimitMiddleware(req as any, res as any, async () => { nextCalled = true; });
      assert.equal(nextCalled, true);
    }

    // 6th request from Operator A is throttled
    const reqA6 = new MockRequest(path, operatorA, '127.0.0.1');
    const resA6 = new MockResponse();
    let nextCalledA6 = false;
    await rateLimitMiddleware(reqA6 as any, resA6 as any, async () => { nextCalledA6 = true; });
    assert.equal(nextCalledA6, false);
    assert.equal(resA6.statusCode, 429);

    // Operator B making request from the same IP is NOT throttled (isolated by operatorId)
    const reqB1 = new MockRequest(path, operatorB, '127.0.0.1');
    const resB1 = new MockResponse();
    let nextCalledB1 = false;
    await rateLimitMiddleware(reqB1 as any, resB1 as any, async () => { nextCalledB1 = true; });
    assert.equal(nextCalledB1, true);
    assert.equal(resB1.statusCode, 200);
  });

  it('resets window after resetAt timestamp expires', async () => {
    process.env['RATE_LIMIT_OPERATOR_MAX'] = '2';
    process.env['RATE_LIMIT_OPERATOR_WINDOW_MS'] = '50'; // 50ms window

    const operator = 'op-window-reset';
    const path = '/api/v1/leases';

    // Request 1 & 2 succeed
    for (let i = 0; i < 2; i++) {
      const req = new MockRequest(path, operator);
      const res = new MockResponse();
      let nextCalled = false;
      await rateLimitMiddleware(req as any, res as any, async () => { nextCalled = true; });
      assert.equal(nextCalled, true);
    }

    // Request 3 throttled
    const req3 = new MockRequest(path, operator);
    const res3 = new MockResponse();
    let nextCalled3 = false;
    await rateLimitMiddleware(req3 as any, res3 as any, async () => { nextCalled3 = true; });
    assert.equal(nextCalled3, false);
    assert.equal(res3.statusCode, 429);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 60));

    // Request 4 succeeds after window reset
    const req4 = new MockRequest(path, operator);
    const res4 = new MockResponse();
    let nextCalled4 = false;
    await rateLimitMiddleware(req4 as any, res4 as any, async () => { nextCalled4 = true; });
    assert.equal(nextCalled4, true);
    assert.equal(res4.statusCode, 200);
  });

  it('evicts expired bucket keys to prevent memory leaks', async () => {
    process.env['RATE_LIMIT_OPERATOR_MAX'] = '10';
    process.env['RATE_LIMIT_OPERATOR_WINDOW_MS'] = '100';

    const req1 = new MockRequest('/api/v1/properties', 'op-evict-1');
    const res1 = new MockResponse();
    await rateLimitMiddleware(req1 as any, res1 as any, async () => {});

    const req2 = new MockRequest('/api/v1/properties', 'op-evict-2');
    const res2 = new MockResponse();
    await rateLimitMiddleware(req2 as any, res2 as any, async () => {});

    // Before expiration, 0 evicted
    const evictedBefore = evictExpiredRateLimits(Date.now());
    assert.equal(evictedBefore, 0);

    // After expiration timestamp simulation
    const futureTime = Date.now() + 1000;
    const evictedAfter = evictExpiredRateLimits(futureTime);
    assert.equal(evictedAfter, 2, 'Should evict both expired keys');

    // Subsequent eviction sweep finds 0 keys left
    const evictedFinal = evictExpiredRateLimits(futureTime);
    assert.equal(evictedFinal, 0);
  });

  it('respects environment variable configuration overrides', () => {
    process.env['RATE_LIMIT_OPERATOR_MAX'] = '200';
    process.env['RATE_LIMIT_OPERATOR_WINDOW_MS'] = '120000';
    process.env['RATE_LIMIT_AUTH_MAX'] = '25';
    process.env['RATE_LIMIT_AUTH_WINDOW_MS'] = '600000';
    process.env['RATE_LIMIT_PUBLIC_MAX'] = '90';
    process.env['RATE_LIMIT_PUBLIC_WINDOW_MS'] = '45000';

    const config = getRateLimitConfig();
    assert.equal(config.operatorMax, 200);
    assert.equal(config.operatorWindowMs, 120000);
    assert.equal(config.authMax, 25);
    assert.equal(config.authWindowMs, 600000);
    assert.equal(config.publicMax, 90);
    assert.equal(config.publicWindowMs, 45000);
  });

  it('correctly parses client IP from multi-hop X-Forwarded-For headers', async () => {
    process.env['RATE_LIMIT_AUTH_MAX'] = '2';
    process.env['RATE_LIMIT_AUTH_WINDOW_MS'] = '60000';

    const multiHopIp = '203.0.113.195, 70.41.3.18, 150.172.238.178';
    const req1 = new MockRequest('/api/v1/auth/login', undefined, multiHopIp);
    const res1 = new MockResponse();
    await rateLimitMiddleware(req1 as any, res1 as any, async () => {});
    assert.equal(res1.statusCode, 200);

    const req2 = new MockRequest('/api/v1/auth/login', undefined, multiHopIp);
    const res2 = new MockResponse();
    await rateLimitMiddleware(req2 as any, res2 as any, async () => {});
    assert.equal(res2.statusCode, 200);

    // Third request from same client IP (even with different downstream proxy chain) is throttled
    const req3 = new MockRequest('/api/v1/auth/login', undefined, '203.0.113.195, 10.0.0.1');
    const res3 = new MockResponse();
    await rateLimitMiddleware(req3 as any, res3 as any, async () => {});
    assert.equal(res3.statusCode, 429);
    assert.equal(res3.json().error.code, 'RATE_LIMITED');
  });
});
