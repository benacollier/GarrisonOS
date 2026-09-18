import { html, raw, SafeHtml } from '../lib/html.js';
import { SessionUser } from '../lib/session.js';
import { hasPermission } from '../../core/rbac.js';

/**
 * Renders the top navigation header containing operator badge and user authentication controls.
 *
 * @param user - Active authenticated user, or null if anonymous.
 * @param operatorId - Active operator context identifier string.
 * @returns SafeHtml template component.
 */
export function renderHeader(user: SessionUser | null, operatorId: string): SafeHtml {
  const canAdmin = user ? (user.role === 'owner' || hasPermission(user.role, 'system:admin')) : false;

  return html`
    <header class="topbar">
      <div class="operator-selector">
        <span>🏢 <strong>${operatorId}</strong></span>
      </div>
      <div class="user-profile">
        ${user
          ? html`
              ${canAdmin ? html`<a href="/admin" class="btn btn-sm btn-secondary" style="margin-right: 0.5rem;">⚙️ Admin</a>` : raw('')}
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
