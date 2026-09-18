import { html, raw, SafeHtml } from '../lib/html.js';
import { PageContext, PageResult } from '../lib/page-context.js';
import { getDatabase } from '../../database/client.js';
import { getLoadedModules } from '../../core/module-loader.js';
import { eventBus, DeadLetterFailure } from '../../core/events.js';
import { getRateLimitStats, RateLimitStats } from '../../api/middleware.js';
import { hasPermission } from '../../core/rbac.js';

/**
 * Telemetry data model compiled for the Admin Management Dashboard.
 */
export interface AdminDashboardData {
  /** Count of non-deleted operator accounts. */
  activeOperatorsCount: number;
  /** Count of non-deleted user accounts across all operators. */
  activeUsersCount: number;
  /** Total bytes consumed by stored attachments across all operators. */
  storageUsedBytes: number;
  /** Total storage quota allocated across all operators in bytes. */
  storageQuotaBytes: number;
  /** System uptime in seconds. */
  uptimeSeconds: number;
  /** Node.js runtime version. */
  nodeVersion: string;
  /** Process memory consumption metrics. */
  memoryUsageMb: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
  };
  /** Rate limiting metrics and recent throttle events. */
  rateLimitStats: RateLimitStats;
  /** Recent dead-letter event listener failures. */
  deadLetterFailures: DeadLetterFailure[];
  /** Recent failed backup executions. */
  failedBackups: Array<{
    id: string;
    filename: string;
    error_message: string;
    created_at: number;
  }>;
  /** List of dynamically loaded modules and their manifests. */
  loadedModules: Array<{
    id: string;
    name: string;
    version: string;
    description: string;
    dependencies: string[];
    slots?: string[];
  }>;
}

/**
 * Format bytes into human-readable representation (KB, MB, GB).
 *
 * @param bytes - Numeric byte count.
 * @returns Human-readable string.
 */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = (bytes / Math.pow(1024, i)).toFixed(1);
  return `${val} ${units[i]}`;
}

/**
 * Format seconds into human-readable duration (days, hours, minutes).
 *
 * @param totalSeconds - Total elapsed seconds.
 * @returns Formatted duration string.
 */
function formatUptime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0s';
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

/**
 * Format epoch millisecond timestamp into a human-readable UTC string.
 *
 * @param epochMs - Epoch timestamp in milliseconds.
 * @returns ISO-like formatted date and time string.
 */
function formatTimestamp(epochMs: number): string {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return 'N/A';
  try {
    const d = new Date(epochMs);
    return d.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  } catch {
    return 'Invalid Date';
  }
}

/**
 * Render the Admin Management GUI dashboard template.
 *
 * @param data - Compiled telemetry and diagnostic metrics.
 * @returns SafeHtml content structure.
 */
export function renderAdminPage(data: AdminDashboardData): SafeHtml {
  const quotaPercentage = data.storageQuotaBytes > 0
    ? Math.min(100, Math.round((data.storageUsedBytes / data.storageQuotaBytes) * 100))
    : 0;

  const moduleCards = data.loadedModules.map((mod) => html`
    <div class="card" style="margin-bottom: 1rem;">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
        <h3 class="card-title" style="margin: 0; font-size: 1.1rem;">${mod.name}</h3>
        <span class="badge" style="background: #e2e8f0; color: #334155; font-family: monospace;">v${mod.version}</span>
      </div>
      <p class="text-muted" style="margin: 0.5rem 0; font-size: 0.9rem;">${mod.description}</p>
      <div style="font-size: 0.8rem; color: #64748b;">
        <strong>ID:</strong> <code>${mod.id}</code>
        ${mod.dependencies && mod.dependencies.length > 0
          ? html` | <strong>Dependencies:</strong> ${mod.dependencies.join(', ')}`
          : raw('')}
      </div>
    </div>
  `);

  const errorRows = data.deadLetterFailures.map((failure) => html`
    <tr>
      <td>${formatTimestamp(failure.timestamp)}</td>
      <td><span class="badge" style="background: #fee2e2; color: #991b1b;">${failure.event}</span></td>
      <td>
        <div style="font-weight: 600; color: #dc2626;">${failure.error}</div>
        ${failure.stack ? html`<pre style="font-size: 0.75rem; margin-top: 0.25rem; max-height: 80px; overflow-y: auto; background: #f8fafc; padding: 0.25rem;">${failure.stack}</pre>` : raw('')}
      </td>
      <td style="font-family: monospace; font-size: 0.8rem;">${failure.operatorId || 'system'}</td>
    </tr>
  `);

  const backupRows = data.failedBackups.map((backup) => html`
    <tr>
      <td>${formatTimestamp(backup.created_at)}</td>
      <td><span class="badge" style="background: #fee2e2; color: #991b1b;">Failed Snapshot</span></td>
      <td>
        <div style="font-weight: 600; color: #dc2626;">${backup.error_message || 'Snapshot error'}</div>
        <div style="font-size: 0.75rem; color: #64748b;">${backup.filename}</div>
      </td>
      <td style="font-family: monospace; font-size: 0.8rem;">system</td>
    </tr>
  `);

  const rateLimitEvents = data.rateLimitStats.recentEvents.map((evt) => html`
    <tr>
      <td>${formatTimestamp(evt.timestamp)}</td>
      <td><code>${evt.key}</code></td>
      <td>${evt.path || '/'}</td>
      <td>${evt.ip || '127.0.0.1'}</td>
    </tr>
  `);

  return html`
    <div class="admin-dashboard-container" style="max-width: 1200px; margin: 0 auto; padding-bottom: 3rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
        <div>
          <h1 style="margin: 0; font-size: 1.75rem; font-weight: 700;">System Administration & Governance</h1>
          <p class="text-muted" style="margin: 0.25rem 0 0 0;">Platform health, resource utilization telemetry, and diagnostic logs.</p>
        </div>
        <div>
          <span class="badge" style="background: #dcfce7; color: #166534; font-size: 0.9rem; padding: 0.4rem 0.8rem;">
            ● Engine Online (${data.nodeVersion})
          </span>
        </div>
      </div>

      <!-- Overview Metric Cards -->
      <div class="metrics-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
        <div class="card metric-card">
          <div class="metric-label">Active Operators</div>
          <div class="metric-value font-bold" style="font-size: 2rem; color: #0284c7;">${String(data.activeOperatorsCount)}</div>
          <div class="metric-subtitle text-muted">${String(data.activeUsersCount)} active users</div>
        </div>

        <div class="card metric-card">
          <div class="metric-label">Storage Consumption</div>
          <div class="metric-value font-bold" style="font-size: 2rem; color: #059669;">${formatBytes(data.storageUsedBytes)}</div>
          <div class="metric-subtitle text-muted">${String(quotaPercentage)}% of ${formatBytes(data.storageQuotaBytes)} allocated</div>
        </div>

        <div class="card metric-card">
          <div class="metric-label">System Uptime</div>
          <div class="metric-value font-bold" style="font-size: 2rem; color: #7c3aed;">${formatUptime(data.uptimeSeconds)}</div>
          <div class="metric-subtitle text-muted">Heap: ${String(data.memoryUsageMb.heapUsed)} MB / RSS: ${String(data.memoryUsageMb.rss)} MB</div>
        </div>

        <div class="card metric-card">
          <div class="metric-label">Rate Limiter Activity</div>
          <div class="metric-value font-bold" style="font-size: 2rem; color: #d97706;">${String(data.rateLimitStats.totalBlocks)}</div>
          <div class="metric-subtitle text-muted">${String(data.rateLimitStats.activeBuckets)} active rate windows</div>
        </div>
      </div>

      <!-- Diagnostic & Error Logs -->
      <div class="card" style="margin-bottom: 2rem;">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
          <h2 class="card-title" style="margin: 0; font-size: 1.25rem;">System Error & Dead-Letter Log</h2>
          <span class="badge" style="background: #f1f5f9; color: #475569;">
            ${String(data.deadLetterFailures.length + data.failedBackups.length)} logged event(s)
          </span>
        </div>
        <div class="table-responsive">
          <table class="data-table" style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="text-align: left; border-bottom: 1px solid #e2e8f0;">
                <th style="padding: 0.75rem 1rem;">Timestamp</th>
                <th style="padding: 0.75rem 1rem;">Source / Event</th>
                <th style="padding: 0.75rem 1rem;">Diagnostic Message</th>
                <th style="padding: 0.75rem 1rem;">Operator</th>
              </tr>
            </thead>
            <tbody>
              ${errorRows.length > 0 || backupRows.length > 0
                ? raw(errorRows.join('') + backupRows.join(''))
                : html`
                    <tr>
                      <td colspan="4" style="padding: 2rem; text-align: center; color: #64748b;">
                        ✔ No unhandled errors or dead-letter events recorded.
                      </td>
                    </tr>
                  `}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Rate Limiting Events Table -->
      <div class="card" style="margin-bottom: 2rem;">
        <div class="card-header">
          <h2 class="card-title" style="margin: 0; font-size: 1.25rem;">Rate Limiting Throttle Events (429)</h2>
        </div>
        <div class="table-responsive">
          <table class="data-table" style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="text-align: left; border-bottom: 1px solid #e2e8f0;">
                <th style="padding: 0.75rem 1rem;">Timestamp</th>
                <th style="padding: 0.75rem 1rem;">Bucket Key</th>
                <th style="padding: 0.75rem 1rem;">Request Path</th>
                <th style="padding: 0.75rem 1rem;">Client IP</th>
              </tr>
            </thead>
            <tbody>
              ${rateLimitEvents.length > 0
                ? rateLimitEvents
                : html`
                    <tr>
                      <td colspan="4" style="padding: 2rem; text-align: center; color: #64748b;">
                        ✔ No rate limit throttle violations observed.
                      </td>
                    </tr>
                  `}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Dynamic Module Inspector -->
      <div class="card">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h2 class="card-title" style="margin: 0; font-size: 1.25rem;">Dynamic Module Inspector</h2>
          <span class="badge" style="background: #e0f2fe; color: #0369a1;">
            ${String(data.loadedModules.length)} modules loaded
          </span>
        </div>
        <div class="modules-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1rem;">
          ${moduleCards}
        </div>
      </div>
    </div>
  `;
}

/**
 * Web front-controller handler for the /admin dashboard route.
 * Strictly verifies that the authenticated user possesses the 'owner' role
 * or 'system:admin' permission before rendering.
 *
 * @param ctx - Page context wrapper.
 * @returns PageResult with rendered HTML or 403 Forbidden.
 */
export async function handle(ctx: PageContext): Promise<PageResult> {
  const userRole = ctx.session.user?.role || '';
  const isAuthorized = userRole === 'owner' || hasPermission(userRole, 'system:admin');

  if (!isAuthorized) {
    return {
      title: '403 Forbidden',
      status: 403,
      content: html`
        <div class="card" style="text-align: center; padding: 4rem 2rem; max-width: 600px; margin: 2rem auto;">
          <div style="font-size: 3rem; margin-bottom: 1rem;">🛡️</div>
          <h2 style="margin-bottom: 0.5rem; color: #dc2626;">403 Forbidden</h2>
          <p class="text-muted" style="margin-bottom: 1.5rem; line-height: 1.6;">
            Access to the Platform Administration & Governance dashboard requires the <strong>owner</strong> system role or <code>system:admin</code> administrative permission.
          </p>
          <div>
            <a href="/dashboard" class="btn btn-primary">Return to Dashboard</a>
          </div>
        </div>
      `
    };
  }

  const db = getDatabase();

  // 1. Operator and User counts
  let activeOperatorsCount = 0;
  let activeUsersCount = 0;
  let storageQuotaBytes = 0;
  try {
    const opRow = db.prepare(
      'SELECT COUNT(*) as cnt, COALESCE(SUM(storage_quota_bytes), 0) as quota FROM operators WHERE deleted_at IS NULL'
    ).get() as { cnt: number; quota: number };
    activeOperatorsCount = opRow ? opRow.cnt : 0;
    storageQuotaBytes = opRow ? opRow.quota : 0;

    const userRow = db.prepare(
      'SELECT COUNT(*) as cnt FROM users WHERE deleted_at IS NULL'
    ).get() as { cnt: number };
    activeUsersCount = userRow ? userRow.cnt : 0;
  } catch {
    // Graceful fallback
  }

  // 2. Storage used by attachments
  let storageUsedBytes = 0;
  try {
    const attachRow = db.prepare(
      'SELECT COALESCE(SUM(file_size_bytes), 0) as total FROM attachments WHERE deleted_at IS NULL'
    ).get() as { total: number };
    storageUsedBytes = attachRow ? attachRow.total : 0;
  } catch {
    // Attachments table might not have rows yet
  }

  // 3. Failed backups
  let failedBackups: any[] = [];
  try {
    failedBackups = db.prepare(`
      SELECT id, filename, error_message, created_at
      FROM backups
      WHERE status = 'failed'
      ORDER BY created_at DESC
      LIMIT 10
    `).all() as any[];
  } catch {
    // Backups table might not exist in light testing
  }

  // 4. Memory & Uptime
  const mem = process.memoryUsage();
  const uptimeSeconds = Math.floor(process.uptime());

  // 5. Rate limit telemetry
  const rateLimitStats = getRateLimitStats();

  // 6. Dead-letter failure log
  const deadLetterFailures = eventBus.getDeadLetterFailures();

  // 7. Loaded modules
  const loadedModules = getLoadedModules().map((m) => ({
    id: m.manifest.id,
    name: m.manifest.name,
    version: m.manifest.version,
    description: m.manifest.description,
    dependencies: m.manifest.dependencies || [],
    slots: m.manifest.slots || []
  }));

  const content = renderAdminPage({
    activeOperatorsCount,
    activeUsersCount,
    storageUsedBytes,
    storageQuotaBytes,
    uptimeSeconds,
    nodeVersion: process.version,
    memoryUsageMb: {
      rss: Math.round(mem.rss / (1024 * 1024)),
      heapTotal: Math.round(mem.heapTotal / (1024 * 1024)),
      heapUsed: Math.round(mem.heapUsed / (1024 * 1024))
    },
    rateLimitStats,
    deadLetterFailures,
    failedBackups,
    loadedModules
  });

  return {
    title: 'Platform Administration',
    content
  };
}
