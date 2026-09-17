import { html, SafeHtml } from '../lib/html.js';
import { NavigationItem } from '../lib/hooks.js';
import { getApplicationVersion } from '../../core/version.js';

const ICON_MAP: Record<string, string> = {
  'building': '🏢',
  'users': '👥',
  'file-text': '📄',
  'dollar-sign': '💵',
  'list': '📋',
  'file-bar-chart': '📈',
  'tool': '🔧',
  'database': '💾'
};

export function renderSidebar(navItems: NavigationItem[], currentPath: string): SafeHtml {
  const isDashboardActive = currentPath === '/' || currentPath === '/dashboard';
  let appVersion = '0.1.0-dev';
  try {
    appVersion = getApplicationVersion();
  } catch {
    // Graceful fallback if VERSION file lookup fails
  }

  const renderedItems = navItems.map((item) => {
    const isActive = currentPath === item.route || currentPath.startsWith(item.route + '/');
    const icon = ICON_MAP[item.icon ?? ''] ?? '📁';
    const activeClass = isActive ? 'active' : '';

    return html`
      <a href="${item.route}" class="nav-link ${activeClass}">
        <span>${icon}</span> ${item.label}
      </a>
    `;
  });

  return html`
    <aside class="sidebar">
      <div class="sidebar-header">
        <a href="/dashboard">🏰 GarrisonOS</a>
      </div>
      <nav class="sidebar-nav">
        <a href="/dashboard" class="nav-link ${isDashboardActive ? 'active' : ''}">
          <span>📊</span> Dashboard
        </a>
        ${renderedItems}
      </nav>
      <div class="sidebar-footer">
        <small>GarrisonOS v${appVersion} (Open Source)</small>
      </div>
    </aside>
  `;
}
