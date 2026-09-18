import { html, SafeHtml } from '../lib/html.js';
import { SessionUser } from '../lib/session.js';

/**
 * Renders the top navigation header containing operator badge and user authentication controls.
 *
 * @param user - Active authenticated user, or null if anonymous.
 * @param operatorId - Active operator context identifier string.
 * @returns SafeHtml template component.
 */
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
