import { html, SafeHtml } from '../lib/html.js';
import { SessionUser } from '../lib/session.js';

export function renderHeader(user: SessionUser | null, tenantId: string): SafeHtml {
  return html`
    <header class="topbar">
      <div class="tenant-selector">
        <span>🏢 <strong>${tenantId}</strong></span>
      </div>
      <div class="user-profile">
        ${user
          ? html`
              <span>${user.first_name} ${user.last_name} (${user.role})</span>
              <a href="/logout" class="btn btn-sm btn-secondary">Sign Out</a>
            `
          : html`
              <a href="/login" class="btn btn-sm btn-primary">Sign In</a>
            `}
      </div>
    </header>
  `;
}
