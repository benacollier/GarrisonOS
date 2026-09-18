import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { Session, getSession, commitSession, clearSession, parseCookies } from '../lib/session.js';

describe('Web Presentation - Cookie Session Management', () => {
  it('creates an empty session with fresh CSRF token when none provided', () => {
    const session = new Session();
    assert.equal(session.user, null);
    assert.equal(session.authToken, null);
    assert.equal(typeof session.getCsrfToken(), 'string');
    assert.equal(session.getCsrfToken().length, 64);
  });

  it('manages flash messages with addFlash and consumeFlash lifecycle', () => {
    const session = new Session();
    session.addFlash('success', 'Profile updated');
    session.addFlash('info', 'New update available');

    const firstRead = session.consumeFlash();
    assert.equal(firstRead.length, 2);
    assert.equal(firstRead[0]?.message, 'Profile updated');
    assert.equal(firstRead[1]?.message, 'New update available');

    // Consumed flash messages are cleared on subsequent call
    const secondRead = session.consumeFlash();
    assert.equal(secondRead.length, 0);
  });

  it('signs and verifies session data with HMAC-SHA256', () => {
    const secret = 'super-secret-key-for-testing-12345';
    const originalSession = new Session();
    originalSession.user = {
      id: 'usr-123',
      email: 'admin@garrisonos.local',
      first_name: 'Admin',
      last_name: 'User',
      role: 'administrator',
      operator_id: 'operator-demo',
      tenant_id: 'operator-demo'
    };
    originalSession.authToken = 'test-jwt-or-hmac-token';

    // Mock response to capture Set-Cookie header
    const socket = new Socket();
    const res = new ServerResponse(new IncomingMessage(socket));
    commitSession(res, originalSession, { secret, isSecure: false });

    const setCookie = res.getHeader('Set-Cookie') as string;
    assert.ok(setCookie);
    assert.ok(setCookie.includes('garrison_session='));
    assert.ok(setCookie.includes('HttpOnly'));
    assert.ok(setCookie.includes('SameSite=Strict'));

    // Extract cookie value
    const match = setCookie.match(/garrison_session=([^;]+)/);
    assert.ok(match);
    const cookieValue = decodeURIComponent(match[1]!);

    // Mock incoming request with cookie
    const req = new IncomingMessage(socket);
    req.headers['cookie'] = `garrison_session=${cookieValue}`;

    const recoveredSession = getSession(req, secret);
    assert.ok(recoveredSession.user);
    assert.equal(recoveredSession.user?.id, 'usr-123');
    assert.equal(recoveredSession.user?.email, 'admin@garrisonos.local');
    assert.equal(recoveredSession.authToken, 'test-jwt-or-hmac-token');
  });

  it('rejects tampered cookie payloads and returns clean session', () => {
    const secret = 'super-secret-key-for-testing-12345';
    const socket = new Socket();
    const req = new IncomingMessage(socket);

    // Tampered signature
    req.headers['cookie'] = 'garrison_session=eyJ1c2VyIjp7fX0.tampered_signature';

    const session = getSession(req, secret);
    assert.equal(session.user, null);
    assert.equal(session.authToken, null);
  });

  it('skips malformed cookie encodings and continues parsing valid cookies', () => {
    const socket = new Socket();
    const req = new IncomingMessage(socket);
    req.headers['cookie'] = 'malformed=%E0%A4%A; valid=hello%20world';

    assert.deepEqual(parseCookies(req), { valid: 'hello world' });
    assert.equal(getSession(req, 'super-secret-key-for-testing-12345').user, null);
  });

  it('fails module initialization without APP_SECRET in production', () => {
    const sessionModuleUrl = pathToFileURL(resolve('dist/web/lib/session.js')).href;
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'production' };
    delete env['APP_SECRET'];

    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `import(${JSON.stringify(sessionModuleUrl)})`], {
      env,
      encoding: 'utf8'
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /APP_SECRET is required for production session signing/);
  });

  it('sets Max-Age=0 on clearSession', () => {
    const socket = new Socket();
    const res = new ServerResponse(new IncomingMessage(socket));
    clearSession(res, false);

    const setCookie = res.getHeader('Set-Cookie') as string;
    assert.ok(setCookie.includes('Max-Age=0'));
    assert.ok(setCookie.includes('Expires=Thu, 01 Jan 1970 00:00:00 GMT'));
  });
});
