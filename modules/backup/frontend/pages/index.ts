/**
 * Backup Module Management UI Page Handler
 */

import { PageContext, PageResult } from '../../../../web/lib/page-context.js';
import { html, raw, SafeHtml } from '../../../../web/lib/html.js';
import { csrfField, validateCsrf } from '../../../../web/lib/csrf.js';

export async function handle(ctx: PageContext): Promise<PageResult> {
  const pageTitle = 'Backup & Disaster Recovery';
  const csrfToken = ctx.session.getCsrfToken();

  let flashMessage: string | null = null;
  let flashError: string | null = null;

  if (ctx.method === 'POST') {
    if (!validateCsrf(csrfToken, ctx.body['csrf_token'])) {
      return {
        title: 'Error',
        status: 403,
        content: html`<div class="alert alert-danger">CSRF token validation failed.</div>`
      };
    }

    const action = ctx.body['action'] ?? '';

    if (action === 'create') {
      const type = ctx.body['backup_type'] ?? 'tenant_data';
      try {
        await ctx.api.post('/api/v1/backups', { type });
        ctx.session.addFlash('success', 'Backup created successfully.');
        return { redirect: '/backup', content: '' };
      } catch (err: any) {
        flashError = 'Failed to create backup: ' + (err.message || 'Unknown error');
      }
    } else if (action === 'verify') {
      const backupId = ctx.body['backup_id'] ?? '';
      if (backupId) {
        try {
          const res = await ctx.api.post(`/api/v1/backups/${encodeURIComponent(backupId)}/verify`, {});
          const isValid = res?.data?.valid ?? false;
          if (isValid) {
            ctx.session.addFlash('success', 'Backup integrity verified: SHA-256 matches.');
          } else {
            ctx.session.addFlash('error', 'Integrity verification failed! Checksum mismatch or file missing.');
          }
          return { redirect: '/backup', content: '' };
        } catch (err: any) {
          flashError = 'Verification error: ' + (err.message || 'Unknown error');
        }
      }
    } else if (action === 'restore') {
      const backupId = ctx.body['backup_id'] ?? '';
      const mode = ctx.body['restore_mode'] ?? 'clean_slate';
      if (backupId) {
        try {
          const res = await ctx.api.post(`/api/v1/backups/${encodeURIComponent(backupId)}/restore`, { mode });
          const msg = res?.data?.message ?? `Tenant data restored successfully (${mode}).`;
          ctx.session.addFlash('success', msg);
          return { redirect: '/backup', content: '' };
        } catch (err: any) {
          flashError = 'Failed to restore backup: ' + (err.message || 'Unknown error');
        }
      }
    } else if (action === 'delete') {
      const backupId = ctx.body['backup_id'] ?? '';
      if (backupId) {
        try {
          await ctx.api.delete(`/api/v1/backups/${encodeURIComponent(backupId)}`);
          ctx.session.addFlash('success', 'Backup record and archive removed.');
          return { redirect: '/backup', content: '' };
        } catch (err: any) {
          flashError = 'Failed to delete backup: ' + (err.message || 'Unknown error');
        }
      }
    } else if (action === 'trigger_backup') {
      try {
        await ctx.api.post('/api/v1/backups/scheduler/trigger', {});
        ctx.session.addFlash('success', 'Automated backup job triggered successfully.');
        return { redirect: '/backup', content: '' };
      } catch (err: any) {
        flashError = 'Failed to trigger backup job: ' + (err.message || 'Unknown error');
      }
    } else if (action === 'trigger_vacuum') {
      try {
        await ctx.api.post('/api/v1/backups/scheduler/trigger', { action: 'vacuum' });
        ctx.session.addFlash('success', 'Database maintenance routine (WAL checkpoint & VACUUM) executed successfully.');
        return { redirect: '/backup', content: '' };
      } catch (err: any) {
        flashError = 'Failed to run database maintenance: ' + (err.message || 'Unknown error');
      }
    }
  }

  // Fetch list of backups
  let backups: any[] = [];
  try {
    const res = await ctx.api.get('/api/v1/backups');
    backups = res?.data?.items ?? [];
  } catch {
    if (!flashError) flashError = 'Could not load backups list.';
  }

  // Fetch scheduler daemon status
  let scheduler: any = null;
  try {
    const scheduleRes = await ctx.api.get('/api/v1/backups/scheduler/status');
    scheduler = scheduleRes?.data?.scheduler ?? null;
  } catch (err) {
    process.stderr.write(`[backup] Scheduler status unavailable: ${String(err)}\n`);
  }

  const alertSuccess = flashMessage
    ? html`<div style="background: #e6f4ea; color: #137333; padding: 0.75rem 1rem; border-radius: 4px; margin-bottom: 1rem;">${flashMessage}</div>`
    : raw('');

  const alertDanger = flashError
    ? html`<div style="background: #fce8e6; color: #c5221f; padding: 0.75rem 1rem; border-radius: 4px; margin-bottom: 1rem;">${flashError}</div>`
    : raw('');

  const csrfInput = csrfField(csrfToken);

  const schedulerActive = scheduler?.enabled === true;
  const schedulerBadge = scheduler === null
    ? html`<span style="font-size: 0.75rem; background: #fce8e6; color: #c5221f; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 600;">STATUS UNAVAILABLE</span>`
    : schedulerActive
      ? html`<span style="font-size: 0.75rem; background: #e6f4ea; color: #137333; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 600;">DAEMON ACTIVE</span>`
      : html`<span style="font-size: 0.75rem; background: #f1f3f4; color: #5f6368; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 600;">MANUAL ONLY</span>`;

  const nextBackupStr = scheduler?.nextScheduledBackupAt
    ? new Date(scheduler.nextScheduledBackupAt).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
    : null;

  const nextBackupLine = nextBackupStr
    ? html`<div><strong>Next Scheduled Backup:</strong> ${nextBackupStr}</div>`
    : raw('');

  const maintenanceLine = scheduler?.maintenanceInProgress
    ? html`
      <div style="color: #e37400; font-weight: 600; margin-top: 0.25rem;">
        Maintenance actively running: ${String(scheduler.maintenanceInProgress)}
      </div>
    `
    : raw('');

  const schedulerPolicy = scheduler === null
    ? html`<div>Scheduler status and policy values are currently unavailable.</div>`
    : html`
      <div><strong>Backup Interval:</strong> Every ${String(scheduler.intervalHours ?? 24)} hours</div>
      <div><strong>Vacuum Interval:</strong> Every ${String(scheduler.vacuumIntervalHours ?? 168)} hours</div>
      <div><strong>Retention Policy:</strong> ${String(scheduler.retentionDays ?? 30)} days</div>
      ${nextBackupLine}
      ${maintenanceLine}
    `;

  const backupRows: SafeHtml[] = [];
  for (const b of backups) {
    const createdStr = new Date(b.created_at).toISOString().replace('T', ' ').slice(0, 19);
    const sizeKb = (b.file_size_bytes / 1024).toFixed(1);
    let statusColor = '#137333';
    if (b.status === 'pending') statusColor = '#e37400';
    if (b.status === 'failed') statusColor = '#c5221f';

    const statusCap = typeof b.status === 'string' && b.status.length > 0
      ? b.status.charAt(0).toUpperCase() + b.status.slice(1)
      : 'Unknown';

    const checksumShort = typeof b.checksum_sha256 === 'string'
      ? b.checksum_sha256.slice(0, 12) + '...'
      : '—';

    let downloadBtn = raw('');
    let verifyForm = raw('');
    let restoreBtn = raw('');

    if (b.status === 'completed') {
      downloadBtn = html`
        <a href="/api/v1/backups/${b.id}/download"
           style="padding: 0.25rem 0.5rem; background: #f1f3f4; border: 1px solid #dadce0; border-radius: 4px; text-decoration: none; color: #202124; font-size: 0.85rem;"
           download>
          Download
        </a>
      `;

      verifyForm = html`
        <form method="POST" action="/backup" style="display: inline;">
          ${csrfInput}
          <input type="hidden" name="action" value="verify">
          <input type="hidden" name="backup_id" value="${b.id}">
          <button type="submit" style="padding: 0.25rem 0.5rem; background: #f1f3f4; border: 1px solid #dadce0; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">
            Verify
          </button>
        </form>
      `;

      if (b.backup_type === 'tenant_data') {
        restoreBtn = html`
          <button type="button"
                  onclick="openRestoreModal('${b.id}', '${b.filename}')"
                  style="padding: 0.25rem 0.5rem; background: #e8f0fe; color: #1a73e8; border: 1px solid #d2e3fc; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: 500;">
            Restore...
          </button>
        `;
      }
    }

    const deleteForm = html`
      <form method="POST" action="/backup" style="display: inline;" onsubmit="return confirm('Permanently remove this backup archive?');">
        ${csrfInput}
        <input type="hidden" name="action" value="delete">
        <input type="hidden" name="backup_id" value="${b.id}">
        <button type="submit" style="padding: 0.25rem 0.5rem; background: #fce8e6; color: #c5221f; border: 1px solid #fad2cf; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">
          Delete
        </button>
      </form>
    `;

    backupRows.push(html`
      <tr style="border-bottom: 1px solid #f0f0f0;">
        <td style="padding: 0.75rem 0.5rem;">${createdStr}</td>
        <td style="padding: 0.75rem 0.5rem;">
          <span style="display: inline-block; padding: 0.2rem 0.5rem; background: #e8eaed; border-radius: 3px; font-size: 0.8rem;">
            ${b.backup_type}
          </span>
        </td>
        <td style="padding: 0.75rem 0.5rem; font-family: monospace;">${b.filename}</td>
        <td style="padding: 0.75rem 0.5rem;">${sizeKb} KB</td>
        <td style="padding: 0.75rem 0.5rem;">
          <span style="color: ${statusColor}; font-weight: 500;">${statusCap}</span>
        </td>
        <td style="padding: 0.75rem 0.5rem; font-family: monospace; font-size: 0.8rem;" title="${b.checksum_sha256}">
          ${checksumShort}
        </td>
        <td style="padding: 0.75rem 0.5rem; text-align: right; display: flex; gap: 0.5rem; justify-content: flex-end; align-items: center;">
          ${downloadBtn}
          ${verifyForm}
          ${restoreBtn}
          ${deleteForm}
        </td>
      </tr>
    `);
  }

  let tableContent = raw('');
  if (backups.length === 0) {
    tableContent = html`<p style="color: var(--color-text-muted, #777); font-style: italic;">No backups found. Trigger one above to establish a baseline.</p>`;
  } else {
    tableContent = html`
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.95rem;">
          <thead>
            <tr style="border-bottom: 2px solid #eee;">
              <th style="padding: 0.75rem 0.5rem;">Date (UTC)</th>
              <th style="padding: 0.75rem 0.5rem;">Type</th>
              <th style="padding: 0.75rem 0.5rem;">Filename</th>
              <th style="padding: 0.75rem 0.5rem;">Size</th>
              <th style="padding: 0.75rem 0.5rem;">Status</th>
              <th style="padding: 0.75rem 0.5rem;">SHA-256 Checksum</th>
              <th style="padding: 0.75rem 0.5rem; text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${backupRows}
          </tbody>
        </table>
      </div>
    `;
  }

  const content = html`
    <div class="module-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
      <div>
        <h1 style="margin: 0; font-size: 1.75rem;">Backup & Disaster Recovery</h1>
        <p style="margin: 0.25rem 0 0; color: var(--color-text-muted, #666);">
          Create point-in-time snapshots, verify checksums, manage automated maintenance, and restore tenant archives.
        </p>
      </div>
    </div>

    ${alertSuccess}
    ${alertDanger}

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
      <!-- Create Backup Card -->
      <div class="card" style="background: var(--color-surface, #fff); padding: 1.5rem; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <h2 style="margin-top: 0; font-size: 1.25rem;">Create New Backup</h2>
        <form method="POST" action="/backup" style="display: flex; flex-direction: column; gap: 1rem;">
          ${csrfInput}
          <input type="hidden" name="action" value="create">

          <div style="display: flex; flex-direction: column; gap: 0.25rem;">
            <label for="backup_type" style="font-weight: 500; font-size: 0.9rem;">Backup Type</label>
            <select id="backup_type" name="backup_type" style="padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px;">
              <option value="tenant_data">Tenant Data Export (.json.gz)</option>
              <option value="full_system">Full System Database Snapshot (.sqlite.gz)</option>
            </select>
          </div>

          <button type="submit" style="padding: 0.5rem 1.25rem; background: var(--color-primary, #0056b3); color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: 500; align-self: flex-start;">
            Trigger Backup Now
          </button>
        </form>
      </div>

      <!-- Daemon & Maintenance Card -->
      <div class="card" style="background: var(--color-surface, #fff); padding: 1.5rem; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <h2 style="margin-top: 0; font-size: 1.25rem; display: flex; justify-content: space-between; align-items: center;">
          <span>Automation & Maintenance</span>
          ${schedulerBadge}
        </h2>

        <div style="font-size: 0.85rem; color: var(--color-text-muted, #555); margin-bottom: 1rem; line-height: 1.6;">
          ${schedulerPolicy}
        </div>

        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
          <form method="POST" action="/backup" style="margin: 0;">
            ${csrfInput}
            <input type="hidden" name="action" value="trigger_backup">
            <button type="submit" style="padding: 0.4rem 0.8rem; background: #f1f3f4; color: #3c4043; border: 1px solid #dadce0; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">
              Run Automated Job
            </button>
          </form>

          <form method="POST" action="/backup" style="margin: 0;">
            ${csrfInput}
            <input type="hidden" name="action" value="trigger_vacuum">
            <button type="submit" style="padding: 0.4rem 0.8rem; background: #e8f0fe; color: #1a73e8; border: 1px solid #dadce0; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">
              Run Vacuum Routine
            </button>
          </form>
        </div>
      </div>
    </div>

    <div class="card" style="background: var(--color-surface, #fff); padding: 1.5rem; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <h2 style="margin-top: 0; font-size: 1.25rem; margin-bottom: 1rem;">Available Backups (${backups.length})</h2>
      ${tableContent}
    </div>

    <!-- Restore Modal Dialog -->
    <div id="restoreModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center;">
      <div style="background: #fff; width: 100%; max-width: 480px; padding: 1.5rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
        <h3 style="margin-top: 0; margin-bottom: 0.5rem;">Restore Tenant Data</h3>
        <p style="font-size: 0.9rem; color: #555; margin-bottom: 1.25rem;">
          Restoring from <strong id="modalBackupFilename">archive</strong>. Choose how you want existing tenant data handled:
        </p>

        <form method="POST" action="/backup" id="restoreForm">
          ${csrfInput}
          <input type="hidden" name="action" value="restore">
          <input type="hidden" name="backup_id" id="modalBackupId" value="">

          <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem;">
            <label style="display: flex; gap: 0.75rem; align-items: flex-start; cursor: pointer; padding: 0.5rem; border: 1px solid #eee; border-radius: 4px;">
              <input type="radio" name="restore_mode" value="clean_slate" checked style="margin-top: 0.25rem;">
              <div>
                <strong style="display: block; font-size: 0.95rem;">Clean-Slate (Replace)</strong>
                <span style="font-size: 0.85rem; color: #666;">
                  Clears existing tenant records in the backed-up tables before inserting the snapshot. Recommended for rollback to a prior point in time.
                </span>
              </div>
            </label>

            <label style="display: flex; gap: 0.75rem; align-items: flex-start; cursor: pointer; padding: 0.5rem; border: 1px solid #eee; border-radius: 4px;">
              <input type="radio" name="restore_mode" value="merge" style="margin-top: 0.25rem;">
              <div>
                <strong style="display: block; font-size: 0.95rem;">Merge / Upsert</strong>
                <span style="font-size: 0.85rem; color: #666;">
                  Inserts or updates records matching IDs from the backup, but preserves any new records created since the backup.
                </span>
              </div>
            </label>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
            <button type="button" onclick="closeRestoreModal()" style="padding: 0.5rem 1rem; border: 1px solid #ccc; background: #fff; border-radius: 4px; cursor: pointer;">
              Cancel
            </button>
            <button type="submit" style="padding: 0.5rem 1rem; background: #1a73e8; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">
              Confirm & Restore
            </button>
          </div>
        </form>
      </div>
    </div>

    <script>
    function openRestoreModal(backupId, filename) {
      document.getElementById('modalBackupId').value = backupId;
      document.getElementById('modalBackupFilename').innerText = filename;
      var modal = document.getElementById('restoreModal');
      modal.style.display = 'flex';
    }

    function closeRestoreModal() {
      var modal = document.getElementById('restoreModal');
      modal.style.display = 'none';
    }
    </script>
  `;

  return {
    title: pageTitle,
    content,
  };
}
