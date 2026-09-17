import { html, raw, SafeHtml } from '../lib/html.js';
import { csrfField, validateCsrf } from '../lib/csrf.js';
import { FlashMessage } from '../lib/session.js';
import { PageContext, PageResult } from '../lib/page-context.js';

export interface LoginPageOptions {
  csrfToken: string;
  flashMessages?: FlashMessage[];
  error?: string | null;
  email?: string;
  tenantId?: string;
}

export function renderLoginPage(options: LoginPageOptions): string {
  const flashes = (options.flashMessages || []).map(
    (f) =>
      html`<div class="alert alert-${f.type === 'success' ? 'success' : 'danger'}" style="margin-bottom: 1.5rem;">
        ${f.message}
      </div>`
  );

  const errorAlert = options.error
    ? html`<div class="alert alert-danger" style="margin-bottom: 1.5rem;">${options.error}</div>`
    : raw('');

  const doc = html`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sign In – GarrisonOS</title>
    <link rel="stylesheet" href="/public/css/variables.css">
    <link rel="stylesheet" href="/public/css/style.css">
</head>
<body style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background-color: #0f172a;">
    <div class="card" style="width: 100%; max-width: 420px; padding: 2.5rem; box-shadow: var(--shadow-lg);">
        <div style="text-align: center; margin-bottom: 2rem;">
            <h1 style="font-size: 1.75rem; font-weight: 800; color: var(--text-main); letter-spacing: -0.02em;">🏰 GarrisonOS</h1>
            <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.25rem;">Zero-dependency Property Management</p>
        </div>

        ${flashes}
        ${errorAlert}

        <form method="POST" action="/login">
            ${csrfField(options.csrfToken)}
            <div class="form-group">
                <label class="form-label" for="email">Email Address</label>
                <input class="form-input" type="email" id="email" name="email" required placeholder="operator@garrisonos.local" value="${options.email || ''}">
            </div>

            <div class="form-group">
                <label class="form-label" for="password">Password</label>
                <input class="form-input" type="password" id="password" name="password" required placeholder="••••••••••••">
            </div>

            <div class="form-group">
                <label class="form-label" for="tenant_id">Tenant ID / Account (Optional)</label>
                <input class="form-input" type="text" id="tenant_id" name="tenant_id" placeholder="e.g. tenant-demo" value="${options.tenantId || ''}">
            </div>

            <button type="submit" class="btn btn-primary" style="width: 100%; padding: 0.75rem; font-size: 1rem; margin-top: 1rem;">
                Sign In to Platform
            </button>
        </form>
    </div>
</body>
</html>`;

  return doc.toString();
}

export async function handle(ctx: PageContext): Promise<PageResult> {
  if (ctx.session.user) {
    return { redirect: '/dashboard', content: '' };
  }

  const csrfToken = ctx.session.getCsrfToken();
  let error: string | null = null;
  let email = '';
  let tenantId = '';

  if (ctx.method === 'POST') {
    if (!validateCsrf(csrfToken, ctx.body['csrf_token'])) {
      return {
        title: 'Error',
        status: 403,
        content: html`<div class="alert alert-danger">CSRF token validation failed.</div>`
      };
    }

    email = typeof ctx.body['email'] === 'string' ? ctx.body['email'].trim() : '';
    const password = typeof ctx.body['password'] === 'string' ? ctx.body['password'] : '';
    tenantId = typeof ctx.body['tenant_id'] === 'string' ? ctx.body['tenant_id'].trim() : '';

    try {
      const res = await ctx.api.post('/api/v1/auth/login', {
        email,
        password,
        tenant_id: tenantId ? tenantId : undefined,
      });

      const token = res.data?.token;
      const user = res.data?.user;

      if (user && token) {
        ctx.session.user = user;
        ctx.session.authToken = token;
        if (res.data.tenant_id) {
          ctx.session.tenantId = res.data.tenant_id;
        }
        ctx.session.addFlash('success', `Welcome back, ${user.first_name || 'User'}!`);
        return { redirect: '/dashboard', content: '' };
      } else {
        error = 'Invalid credentials or login response.';
      }
    } catch (err: any) {
      error = err.message || 'Authentication failed.';
    }
  }

  const content = renderLoginPage({
    csrfToken,
    flashMessages: ctx.session.getFlash(),
    error,
    email,
    tenantId,
  });

  return {
    title: 'Sign In',
    content,
    isFullDocument: true,
  };
}

