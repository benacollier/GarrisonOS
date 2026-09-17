import { PageContext, PageResult } from '../../../../web/lib/page-context.js';
import { html, raw, SafeHtml } from '../../../../web/lib/html.js';
import { csrfField, validateCsrf } from '../../../../web/lib/csrf.js';

function formatDate(epochMs: number): string {
  try {
    const d = new Date(epochMs);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  } catch {
    return '';
  }
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function handle(ctx: PageContext): Promise<PageResult> {
  const csrfToken = ctx.session.getCsrfToken();
  let error: string | null = null;

  if (ctx.method === 'POST') {
    if (!validateCsrf(csrfToken, ctx.body['csrf_token'])) {
      return {
        title: 'Error',
        status: 403,
        content: html`<div class="alert alert-danger">CSRF token validation failed.</div>`
      };
    }

    const action = ctx.body['action'] || '';
    try {
      if (action === 'reverse_entry') {
        const entryId = ctx.body['entry_id'] || '';
        const reason = (ctx.body['reason'] ?? 'Reversal requested via GL interface').trim();
        await ctx.api.post(`/api/v1/accounting/journal-entries/${encodeURIComponent(entryId)}/reverse`, {
          reason
        });
        ctx.session.addFlash('success', 'Journal entry reversed successfully.');
        return { redirect: '/accounting/general-ledger', content: '' };
      } else if (action === 'backfill_legacy') {
        await ctx.api.post('/api/v1/accounting/backfill-ledger', {});
        ctx.session.addFlash('success', 'Historical transactions successfully backfilled into General Ledger.');
        return { redirect: '/accounting/general-ledger', content: '' };
      }
    } catch (err: any) {
      error = err.message;
    }
  }

  const rawPage = parseInt(ctx.query['page'] || '1', 10);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const perPage = 50;
  const offset = (page - 1) * perPage;

  let entries: any[] = [];
  let total = 0;
  let totalPages = 1;

  try {
    const res = await ctx.api.get(`/api/v1/accounting/journal-entries?limit=${perPage}&offset=${offset}`);
    entries = res?.data?.entries || [];
    total = res?.data?.total || 0;
    totalPages = Math.max(1, Math.ceil(total / perPage));

    if (page > totalPages) {
      return { redirect: `/accounting/general-ledger?page=${totalPages}`, content: '' };
    }
  } catch (err: any) {
    error = error || err.message;
  }

  const errorAlert = error
    ? html`<div class="alert alert-danger" style="margin-bottom: var(--spacing-lg);">${error}</div>`
    : raw('');

  const tableRows: SafeHtml[] = [];

  if (entries.length === 0) {
    tableRows.push(html`
      <tr>
        <td colspan="8" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">
          No journal entries recorded. Post transactions or click "Sync / Backfill Ledger" to import single-entry transactions.
        </td>
      </tr>
    `);
  } else {
    for (const entry of entries) {
      let statusBadge: SafeHtml;
      if (entry.reversed_by_entry_id) {
        statusBadge = html`<span class="badge" style="background-color: var(--color-danger, #ef4444); color: white;">Reversed</span>`;
      } else if (entry.source_type === 'reversal') {
        statusBadge = html`<span class="badge" style="background-color: var(--color-warning, #f59e0b); color: white;">Reversal Entry</span>`;
      } else {
        statusBadge = html`<span class="badge" style="background-color: var(--color-success, #10b981); color: white;">Posted</span>`;
      }

      const actionsHtml = !entry.reversed_by_entry_id && entry.source_type !== 'reversal'
        ? html`
          <form method="POST" action="/accounting/general-ledger" style="display: inline;" onsubmit="return confirm('Reverse Entry #${entry.entry_number}? An exact opposite journal entry will be posted.');">
            ${csrfField(csrfToken)}
            <input type="hidden" name="action" value="reverse_entry">
            <input type="hidden" name="entry_id" value="${entry.id}">
            <button type="submit" class="btn btn-sm btn-outline-danger">Reverse</button>
          </form>
        `
        : html`<span style="color: var(--color-text-muted); font-size: 0.8rem;">Locked</span>`;

      tableRows.push(html`
        <tr style="background-color: rgba(0,0,0,0.02); font-weight: 600;">
          <td><code>#${entry.entry_number}</code></td>
          <td>${formatDate(entry.date_ms)}</td>
          <td><span class="badge">${entry.source_type}</span></td>
          <td>${entry.memo}</td>
          <td style="text-align: right; font-family: monospace;">$${formatCurrency(entry.total_debit_cents || 0)}</td>
          <td style="text-align: right; font-family: monospace;">$${formatCurrency(entry.total_credit_cents || 0)}</td>
          <td style="text-align: center;">${statusBadge}</td>
          <td style="text-align: right;">${actionsHtml}</td>
        </tr>
      `);

      if (Array.isArray(entry.lines)) {
        for (const line of entry.lines) {
          tableRows.push(html`
            <tr style="font-size: 0.85rem; color: var(--text-muted);">
              <td></td>
              <td colspan="3" style="padding-left: 2rem;">
                <code>${line.account_number || '—'}</code>
                <strong style="color: var(--text-main);">${line.account_name || 'Account'}</strong>
                ${line.description ? html` — <span style="font-style: italic;">${line.description}</span>` : raw('')}
              </td>
              <td style="text-align: right; font-family: monospace;">
                ${(line.debit_cents || 0) > 0 ? `$${formatCurrency(line.debit_cents)}` : ''}
              </td>
              <td style="text-align: right; font-family: monospace;">
                ${(line.credit_cents || 0) > 0 ? `$${formatCurrency(line.credit_cents)}` : ''}
              </td>
              <td colspan="2"></td>
            </tr>
          `);
        }
      }
    }
  }

  const paginationFooter = totalPages > 1
    ? html`
      <div class="card-footer" style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-top: 1px solid var(--border-color);">
        <div style="font-size: 0.85rem; color: var(--text-muted);">
          Page ${page} of ${totalPages} (showing ${entries.length} of ${total} entries)
        </div>
        <div style="display: flex; gap: 0.5rem;">
          ${page > 1 ? html`<a href="/accounting/general-ledger?page=${page - 1}" class="btn btn-sm btn-secondary">← Previous</a>` : raw('')}
          ${page < totalPages ? html`<a href="/accounting/general-ledger?page=${page + 1}" class="btn btn-sm btn-secondary">Next →</a>` : raw('')}
        </div>
      </div>
    `
    : raw('');

  const content = html`
    <div class="page-header">
      <div>
        <a href="/accounting" class="text-muted">← Back to Accounting</a>
        <h1 class="page-title">General Ledger</h1>
        <p class="page-subtitle">Native immutable double-entry journal entries, audit trail, and line allocations.</p>
      </div>

      <div class="actions" style="display: flex; gap: 0.5rem;">
        <form method="POST" action="/accounting/general-ledger" style="display: inline;">
          ${csrfField(csrfToken)}
          <input type="hidden" name="action" value="backfill_legacy">
          <button type="submit" class="btn btn-secondary" title="Ensure all legacy transactions have double-entry counterparts">
            Sync / Backfill Ledger
          </button>
        </form>
        <a href="/accounting/trial-balance" class="btn btn-primary">Trial Balance</a>
      </div>
    </div>

    ${errorAlert}

    <div class="card">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0;">Journal Entries (${entries.length} of ${total} total)</h3>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 100px;">Entry #</th>
              <th style="width: 120px;">Date</th>
              <th style="width: 140px;">Source</th>
              <th>Memo / Description</th>
              <th style="text-align: right; width: 130px;">Debits</th>
              <th style="text-align: right; width: 130px;">Credits</th>
              <th style="width: 140px; text-align: center;">Status</th>
              <th style="width: 120px; text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
      ${paginationFooter}
    </div>
  `;

  return {
    title: 'General Ledger',
    content
  };
}
