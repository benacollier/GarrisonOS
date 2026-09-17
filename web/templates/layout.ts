import { html, raw, SafeHtml } from '../lib/html.js';
import { SessionUser, FlashMessage } from '../lib/session.js';
import { NavigationItem } from '../lib/hooks.js';
import { renderSidebar } from './sidebar.js';
import { renderHeader } from './header.js';
import { renderFlash } from './flash.js';

export interface LayoutOptions {
  title?: string;
  content: SafeHtml | string;
  user: SessionUser | null;
  tenantId: string;
  navItems: NavigationItem[];
  flashMessages?: FlashMessage[];
  currentPath: string;
}

export function renderLayout(options: LayoutOptions): string {
  const pageTitle = options.title ? `${options.title} – GarrisonOS` : 'GarrisonOS Property Management';
  const sidebar = renderSidebar(options.navItems, options.currentPath);
  const header = renderHeader(options.user, options.tenantId);
  const flash = renderFlash(options.flashMessages || []);
  const bodyContent = typeof options.content === 'string' ? raw(options.content) : options.content;

  const doc = html`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pageTitle}</title>
    <link rel="stylesheet" href="/public/css/variables.css">
    <link rel="stylesheet" href="/public/css/style.css">
    <script src="/public/js/app.js" defer></script>
</head>
<body>
    <div class="app-container">
        ${sidebar}
        <div class="main-content">
            ${header}
            <main class="page-body">
                ${flash}
                ${bodyContent}
            </main>
        </div>
    </div>
</body>
</html>`;

  return doc.toString();
}
