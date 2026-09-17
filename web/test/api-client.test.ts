import { after, before, describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { ApiClient, ApiException } from '../lib/api-client.js';

describe('Web Presentation - API Client Transport', () => {
  let server: http.Server;
  let port = 0;

  before(async () => {
    server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, authorization: req.headers.authorization }));
    });
    await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
    port = (server.address() as AddressInfo).port;
  });

  after(async () => {
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((err) => err ? rejectClose(err) : resolveClose());
    });
  });

  it('allows authenticated HTTP requests to loopback addresses', async () => {
    const client = new ApiClient({ baseUrl: `http://127.0.0.1:${port}`, authToken: 'test-token' });
    const response = await client.get<{ authorization: string }>('/health');

    assert.equal(response.authorization, 'Bearer test-token');
  });

  it('rejects authenticated HTTP requests to non-loopback hosts before sending', async () => {
    const client = new ApiClient({ baseUrl: 'http://example.test', authToken: 'test-token' });

    await assert.rejects(
      () => client.get('/health'),
      (err: unknown) => err instanceof ApiException && err.errorCode === 'INSECURE_TRANSPORT'
    );
  });
});
