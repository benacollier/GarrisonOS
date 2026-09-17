import { html, SafeHtml } from '../lib/html.js';
import { SessionUser } from '../lib/session.js';

export function renderHeader(user: SessionUser | null, operatorId: string): SafeHtml {
  return html`
    <header class="topbar">
      <div class="operator-selector tenant-selector">
        <span>🏢 <strong>${operatorId}</strong></span>
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
