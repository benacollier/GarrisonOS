import { PageContext, PageResult } from '../../../../web/lib/page-context.js';
import { html, raw, SafeHtml } from '../../../../web/lib/html.js';

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseUtcDate(value: string, endOfDay: boolean): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
  const timestamp = new Date(`${value}${suffix}`).getTime();
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    return null;
  }
  return timestamp;
}

export async function handle(ctx: PageContext): Promise<PageResult> {
  const propertyId = ctx.query['property_id'] || '';
  const filterSubmitted = ctx.query['filter_submitted'] !== undefined;
  const unexportedOnly = filterSubmitted ? ctx.query['unexported_only'] === '1' : true;
  const startDate = ctx.query['start_date'] || '';
  const endDate = ctx.query['end_date'] || '';
  const startDateMs = parseUtcDate(startDate, false);
  const endDateMs = parseUtcDate(endDate, true);

  let error: string | null = null;
  let preview: any[] = [];
  let properties: any[] = [];
  let summary: any = null;

  try {
    const propRes = await ctx.api.get('/api/v1/properties');
    properties = propRes?.data?.properties || [];

    const queryParams = new URLSearchParams();
    if (propertyId) queryParams.set('property_id', propertyId);
    if (unexportedOnly) queryParams.set('unexported_only', 'true');
    if (startDateMs !== null) queryParams.set('start_date', String(startDateMs));
    if (endDateMs !== null) queryParams.set('end_date', String(endDateMs));

    const previewRes = await ctx.api.get(`/api/v1/accounting/quickbooks/preview?${queryParams.toString()}`);
    preview = previewRes?.data?.entries || [];
    summary = previewRes?.data?.summary || null;
  } catch (err: any) {
    error = err.message;
  }

  const errorAlert = error
    ? html`<div class="alert alert-danger" style="margin-bottom: 1.5rem;"><strong>Error:</strong> ${error}</div>`
    : raw('');

  const exportParams = new URLSearchParams();
  if (propertyId) exportParams.set('property_id', propertyId);
  exportParams.set('unexported_only', unexportedOnly ? 'true' : 'false');
  if (startDateMs !== null) exportParams.set('start_date', String(startDateMs));
  if (endDateMs !== null) exportParams.set('end_date', String(endDateMs));
  exportParams.set('mark_exported', 'true');
  const exportQueryStr = exportParams.toString();

  const propertyOptions = properties.map((p) => html`
    <option value="${p.id}" ${propertyId === p.id ? raw('selected') : raw('')}>${p.name}</option>
  `);

  const summaryMetrics = summary
    ? html`
      <div class="metrics-grid" style="margin-bottom: 1.5rem;">
        <div class="card metric-card">
          <div class="metric-label">Transactions in Batch</div>
          <div class="metric-value">${summary.transactionCount ?? 0}</div>
        </div>
        <div class="card metric-card">
          <div class="metric-label">Synthesized Journal Entries</div>
          <div class="metric-value">${summary.entryCount ?? 0}</div>
        </div>
        <div class="card metric-card">
          <div class="metric-label">Total Debits</div>
          <div class="metric-value text-success">$${formatCurrency(summary.totalDebitCents || 0)}</div>
        </div>
        <div class="card metric-card">
          <div class="metric-label">Total Credits</div>
          <div class="metric-value text-success">$${formatCurrency(summary.totalCreditCents || 0)}</div>
        </div>
        <div class="card metric-card">
          <div class="metric-label">Balanced Check</div>
          <div class="metric-value ${summary.isBalanced ? 'text-success' : 'text-danger'}">
            ${summary.isBalanced ? '✓ Balanced (100%)' : '⚠ Out of Balance'}
          </div>
        </div>
      </div>
    `
    : raw('');

  const previewRows: SafeHtml[] = [];
  if (preview.length === 0) {
    previewRows.push(html`
      <tr>
        <td colspan="7" class="text-center text-muted" style="padding: 2.5rem;">
          No unexported accounting transactions match the selected filter.
        </td>
      </tr>
    `);
  } else {
    for (const entry of preview) {
      const lines = entry.lines || [];
      const dateStr = new Date(entry.date_ms).toISOString().split('T')[0];

      for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx];
        previewRows.push(html`
          <tr style="${idx === 0 ? 'border-top: 2px solid var(--border-color);' : ''}">
            <td>
              ${idx === 0
                ? html`
                  <strong>${dateStr}</strong><br>
                  <small class="text-muted">${entry.reference_number}</small>
                `
                : raw('')}
            </td>
            <td>
              <strong>${line.account_number || ''}</strong> ${line.account_name}
              <br><small class="text-muted">${line.account_type}</small>
            </td>
            <td>
              <span class="badge badge-secondary">${line.class_name || 'General'}</span>
            </td>
            <td>${line.entity_name || '-'}</td>
            <td>${line.description}</td>
            <td style="text-align: right; font-family: monospace;">
              ${(line.debit_cents || 0) > 0 ? `$${formatCurrency(line.debit_cents)}` : '-'}
            </td>
            <td style="text-align: right; font-family: monospace;">
              ${(line.credit_cents || 0) > 0 ? `$${formatCurrency(line.credit_cents)}` : '-'}
            </td>
          </tr>
        `);
      }
    }
  }

  const content = html`
    <div class="page-header">
      <div>
        <a href="/accounting" class="text-muted">← Back to Accounting</a>
        <h1 class="page-title">QuickBooks Integration & GL Export</h1>
        <p class="page-subtitle">Export balanced double-entry general ledger transactions to QuickBooks Online and QuickBooks Desktop.</p>
      </div>
      <div class="btn-group">
        <a href="/accounting/chart-of-accounts" class="btn btn-secondary">Manage Chart of Accounts</a>
      </div>
    </div>

    ${errorAlert}

    <!-- Export Action Bar -->
    <div class="card" style="margin-bottom: 2rem;">
      <div class="card-header">
        <h3 style="margin: 0; font-size: 1.1rem;">QuickBooks Export Profiles</h3>
      </div>
      <div class="card-body">
        <p class="text-muted" style="margin-bottom: 1.25rem;">
          Export transactions synthesized directly into double-entry debits and credits matching your Chart of Accounts and QuickBooks Classes.
        </p>
        <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
          <a href="/api/v1/accounting/export/quickbooks/qbo-journal.csv?${exportQueryStr}" class="btn btn-primary" target="_blank">
            📥 Export QuickBooks Online (QBO) Journal CSV
          </a>
          <a href="/api/v1/accounting/export/quickbooks/desktop.iif?${exportQueryStr}" class="btn btn-secondary" target="_blank">
            📥 Export QuickBooks Desktop (IIF)
          </a>
          <a href="/api/v1/accounting/export/quickbooks/bank-feed.qbo?${exportQueryStr}" class="btn btn-secondary" target="_blank">
            📥 Export Web Connect Bank Feed (.QBO)
          </a>
        </div>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="card" style="margin-bottom: 1.5rem;">
      <form method="GET" action="/accounting/quickbooks" style="display: flex; gap: 1rem; align-items: flex-end; flex-wrap: wrap; padding: 1rem;">
        <input type="hidden" name="filter_submitted" value="1">
        <div class="form-group" style="margin: 0; min-width: 200px;">
          <label class="form-label">Filter Property (Class)</label>
          <select name="property_id" class="form-select">
            <option value="">All Properties</option>
            ${propertyOptions}
          </select>
        </div>

        <div class="form-group" style="margin: 0;">
          <label class="form-label">Start Date</label>
          <input type="date" name="start_date" class="form-input" value="${startDate}">
        </div>

        <div class="form-group" style="margin: 0;">
          <label class="form-label">End Date</label>
          <input type="date" name="end_date" class="form-input" value="${endDate}">
        </div>

        <div class="form-group" style="margin: 0; display: flex; align-items: center; gap: 0.5rem; height: 38px;">
          <input type="checkbox" id="unexported_only" name="unexported_only" value="1" ${unexportedOnly ? raw('checked') : raw('')}>
          <label for="unexported_only" style="margin: 0; cursor: pointer;">Unexported only</label>
        </div>

        <button type="submit" class="btn btn-secondary">Apply Filter</button>
        <a href="/accounting/quickbooks" class="btn btn-text">Reset</a>
      </form>
    </div>

    ${summaryMetrics}

    <!-- Journal Entries Preview Table -->
    <div class="card">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; font-size: 1.1rem;">General Ledger Batch Preview</h3>
        <span class="badge badge-info">${preview.length} Journal Entries Ready</span>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date / Ref</th>
              <th>Account & Number</th>
              <th>Class (Property)</th>
              <th>Name (Customer / Vendor)</th>
              <th>Description</th>
              <th style="text-align: right;">Debit ($)</th>
              <th style="text-align: right;">Credit ($)</th>
            </tr>
          </thead>
          <tbody>
            ${previewRows}
          </tbody>
        </table>
      </div>
    </div>
  `;

  return {
    title: 'QuickBooks Integration & GL Export',
    content
  };
}
