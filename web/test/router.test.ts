import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { WebRouter } from '../router.js';
import { Session } from '../lib/session.js';
import { ApiClient } from '../lib/api-client.js';
import { PageContext } from '../lib/page-context.js';

function createMockContext(path: string, options?: {
  user?: any;
  method?: string;
  isConfigured?: boolean;
}): { ctx: PageContext; res: ServerResponse; getOutput: () => string } {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = options?.method || 'GET';
  req.url = path;

  const res = new ServerResponse(req);
  let output = '';

  // Intercept write & end to capture output
  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);

  res.write = function (chunk: any, ...args: any[]) {
    if (chunk) output += chunk.toString();
    return (origWrite as any)(chunk, ...args);
  };

  res.end = function (chunk?: any, ...args: any[]) {
    if (chunk) output += chunk.toString();
    return (origEnd as any)(chunk, ...args);
  };

  const session = new Session();
  if (options?.user) {
    session.user = options.user;
    session.authToken = 'test-token';
  }

  // Mock API client
  const api = new ApiClient();
  (api as any).get = async (apiPath: string) => {
    if (apiPath === '/api/v1/system/status') {
      return { success: true, data: { is_configured: options?.isConfigured ?? true } };
    }
    return { success: true, data: {} };
  };

  const url = new URL(path, 'http://localhost');
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { query[k] = v; });

  const ctx: PageContext = {
    req,
    res,
    api,
    session,
    url,
    query,
    body: {},
    method: req.method,
  };

  return { ctx, res, getOutput: () => output };
}

describe('Web Presentation - WebRouter Subsystem', () => {
  it('redirects unauthenticated users from protected routes to /login', async () => {
    const { ctx, res } = createMockContext('/dashboard');
    await WebRouter.dispatch(ctx);

    assert.equal(res.statusCode, 302);
    assert.equal(res.getHeader('Location'), '/login');
  });

  it('renders login page for unauthenticated access to /login', async () => {
    const { ctx, res, getOutput } = createMockContext('/login');
    await WebRouter.dispatch(ctx);

    assert.equal(res.statusCode, 200);
    assert.ok(getOutput().includes('Sign In'));
    assert.ok(getOutput().includes('csrf_token'));
  });

  it('handles logout by clearing session and redirecting to /login', async () => {
    const { ctx, res } = createMockContext('/logout', {
      user: { id: 'u1', email: 'test@garrison.local', first_name: 'Test', last_name: 'User', role: 'admin', tenant_id: 't1' }
    });
    await WebRouter.dispatch(ctx);

    assert.equal(res.statusCode, 302);
    assert.equal(res.getHeader('Location'), '/login');
    assert.equal(ctx.session.user, null);
  });

  it('renders 404 page for unknown routes when authenticated', async () => {
    const { ctx, res, getOutput } = createMockContext('/nonexistent-module/xyz', {
      user: { id: 'u1', email: 'test@garrison.local', first_name: 'Test', last_name: 'User', role: 'admin', tenant_id: 't1' }
    });
    await WebRouter.dispatch(ctx);

    assert.equal(res.statusCode, 404);
    assert.ok(getOutput().includes('404'));
    assert.ok(getOutput().includes('Page Not Found'));
  });

  it('redirects to /setup when system is not configured', async () => {
    const { ctx, res } = createMockContext('/login', { isConfigured: false });
    await WebRouter.dispatch(ctx);

    assert.equal(res.statusCode, 302);
    assert.equal(res.getHeader('Location'), '/setup');
  });
});
