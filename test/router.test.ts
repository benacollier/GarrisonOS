import { test, describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Router } from '../api/router.js';

class MockIncomingMessage extends EventEmitter {
  public method: string;
  public url: string;
  public headers: Record<string, string>;
  public socket: any = { remoteAddress: '127.0.0.1' };

  constructor(method: string, url: string, headers: Record<string, string> = {}) {
    super();
    this.method = method;
    this.url = url;
    this.headers = { host: '127.0.0.1:3000', ...headers };
  }
}

class MockServerResponse {
  public statusCode: number = 200;
  public headers: Record<string, string> = {};
  public body: string = '';
  public writableEnded: boolean = false;

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
}

describe('Zero-Dependency HTTP Router Subsystem', () => {
  it('correctly matches routes and extracts path parameters', async () => {
    const router = new Router();
    let capturedParams: Record<string, string> = {};

    router.get('/api/v1/properties/:propertyId/units/:unitId', (req, res) => {
      capturedParams = req.params;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    });

    const req = new MockIncomingMessage('GET', '/api/v1/properties/prop-123/units/unit-456') as any;
    const res = new MockServerResponse() as any;

    await router.handle(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(capturedParams['propertyId'], 'prop-123');
    assert.equal(capturedParams['unitId'], 'unit-456');
  });

  it('correctly parses query strings', async () => {
    const router = new Router();
    let capturedQuery: Record<string, string> = {};

    router.get('/api/v1/contacts', (req, res) => {
      capturedQuery = req.query;
      res.writeHead(200);
      res.end('ok');
    });

    const req = new MockIncomingMessage('GET', '/api/v1/contacts?type=tenant&q=smith') as any;
    const res = new MockServerResponse() as any;

    await router.handle(req, res);

    assert.equal(capturedQuery['type'], 'tenant');
    assert.equal(capturedQuery['q'], 'smith');
  });

  it('streams and parses JSON request bodies', async () => {
    const router = new Router();
    let capturedBody: any = null;

    router.post('/api/v1/properties', (req, res) => {
      capturedBody = req.body;
      res.writeHead(201);
      res.end('created');
    });

    const payload = JSON.stringify({ name: 'Maple Court', rent: 140000 });
    const req = new MockIncomingMessage('POST', '/api/v1/properties', {
      'content-type': 'application/json'
    }) as any;
    const res = new MockServerResponse() as any;

    const handlePromise = router.handle(req, res);

    // Emit streaming payload data
    req.emit('data', Buffer.from(payload));
    req.emit('end');

    await handlePromise;

    assert.equal(res.statusCode, 201);
    assert.deepEqual(capturedBody, { name: 'Maple Court', rent: 140000 });
  });

  it('returns 404 with structured error envelope for unregistered routes', async () => {
    const router = new Router();
    const req = new MockIncomingMessage('GET', '/api/v1/nonexistent') as any;
    const res = new MockServerResponse() as any;

    await router.handle(req, res);

    assert.equal(res.statusCode, 404);
    const parsed = JSON.parse(res.body);
    assert.equal(parsed.success, false);
    assert.equal(parsed.error.code, 'NOT_FOUND');
  });
});

