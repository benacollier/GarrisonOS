import { PageContext, PageResult } from '../../../../web/lib/page-context.js';
import { html, raw, SafeHtml } from '../../../../web/lib/html.js';
import { csrfField, validateCsrf } from '../../../../web/lib/csrf.js';

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function handle(ctx: PageContext): Promise<PageResult> {
  const csrfToken = ctx.session.getCsrfToken();
  let error: string | null = null;

  if (ctx.method === 'POST' && ctx.body['action'] === 'generate_rent') {
    if (!validateCsrf(csrfToken, ctx.body['csrf_token'])) {
      return {
        title: 'Error',
        status: 403,
        content: html`<div class="alert alert-danger">CSRF token validation failed.</div>`
      };
    }

    try {
      const now = new Date();
      const defaultMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      const genRes = await ctx.api.post('/api/v1/accounting/generate-rent-charges', {
        month: ctx.body['target_month'] || defaultMonth
      });
      const created = genRes?.data?.result?.chargesCreated ?? 0;
      ctx.session.addFlash('success', `Generated ${created} rent charge(s) for the billing cycle`);
      return { redirect: '/accounting/rent-roll', content: '' };
    } catch (err: any) {
      error = err.message;
    }
  }

  let rentRoll: any[] = [];
  let summary: any = null;

  try {
    const res = await ctx.api.get('/api/v1/accounting/rent-roll');
    rentRoll = res?.data?.rentRoll || [];
    summary = res?.data?.summary || null;
  } catch (err: any) {
    error = error || err.message;
  }

  const errorAlert = error
    ? html`<div class="alert alert-danger" style="margin-bottom: 1.5rem;">${error}</div>`
    : raw('');

  const summaryMetrics = summary
    ? html`
      <div class="metrics-grid">
        <div class="card metric-card">
          <div class="metric-label">Active Leases</div>
          <div class="metric-value">${summary.totalUnits ?? 0}</div>
        </div>
        <div class="card metric-card">
          <div class="metric-label">Scheduled Monthly Rent</div>
          <div class="metric-value text-success">$${formatCurrency(summary.totalScheduledRentCents || 0)}</div>
        </div>
        <div class="card metric-card">
          <div class="metric-label">Total Outstanding Delinquency</div>
          <div class="metric-value ${(summary.totalDelinquencyCents || 0) > 0 ? 'text-danger' : 'text-success'}">
            $${formatCurrency(summary.totalDelinquencyCents || 0)}
          </div>
        </div>
      </div>
    `
    : raw('');

  const rentRollRows = rentRoll.length > 0
    ? rentRoll.map((row) => {
        let balanceHtml: SafeHtml;
        if (row.balance_cents > 0) {
          balanceHtml = html`<span class="text-danger font-bold">$${formatCurrency(row.balance_cents)} Owed</span>`;
        } else if (row.balance_cents < 0) {
          balanceHtml = html`<span class="text-success font-bold">$${formatCurrency(Math.abs(row.balance_cents))} Credit</span>`;
        } else {
          balanceHtml = html`<span class="text-muted">$0.00 Paid</span>`;
        }

        const statusFormatted = row.status ? row.status.charAt(0).toUpperCase() + row.status.slice(1) : '';

        return html`
          <tr>
            <td><strong>${row.property_name}</strong></td>
            <td>Unit ${row.unit_number}</td>
            <td>${row.tenant_name}</td>
            <td><span class="badge badge-success">${statusFormatted}</span></td>
            <td>$${formatCurrency(row.monthly_rent_cents || 0)}</td>
            <td>$${formatCurrency(row.deposit_held_cents || 0)}</td>
            <td>${balanceHtml}</td>
            <td>
              <a href="/accounting/ledger-detail?lease_id=${encodeURIComponent(row.lease_id)}" class="btn btn-sm btn-secondary">Ledger</a>
            </td>
          </tr>
        `;
      })
    : [html`
        <tr>
          <td colspan="8" class="text-center text-muted">No active leases on rent roll.</td>
        </tr>
      `];

  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  const content = html`
    <div class="page-header">
      <div>
        <a href="/accounting" class="text-muted">← Back to Accounting</a>
        <h1 class="page-title">Portfolio Rent Roll</h1>
        <p class="page-subtitle">Itemized unit occupancy, monthly scheduled rent, and live tenant ledger balances.</p>
      </div>
      <div class="btn-group">
        <button class="btn btn-primary" onclick="document.getElementById('generateRentModal').showModal()">⚡ Run Monthly Billing</button>
        <a href="/api/v1/accounting/export/rent-roll.csv" class="btn btn-secondary" target="_blank">Export CSV</a>
      </div>
    </div>

    ${errorAlert}
    ${summaryMetrics}

    <div class="card">
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Property</th>
              <th>Unit</th>
              <th>Tenant</th>
              <th>Status</th>
              <th>Scheduled Rent</th>
              <th>Deposit Held</th>
              <th>Tenant Balance</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${rentRollRows}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal: Run Monthly Billing -->
    <dialog id="generateRentModal" class="modal">
      <form method="POST" action="/accounting/rent-roll" class="modal-box">
        ${csrfField(csrfToken)}
        <input type="hidden" name="action" value="generate_rent">
        <div class="modal-header">
          <h3>Generate Monthly Rent Charges</h3>
          <button type="button" class="btn-close" onclick="document.getElementById('generateRentModal').close()">✕</button>
        </div>
        <div class="modal-body">
          <p>This will post monthly rent charges to the ledgers of all active leases for the selected billing month. Leases starting mid-month will have rent prorated automatically.</p>
          <div class="form-group" style="margin-top: 1rem;">
            <label class="form-label" for="target_month">Billing Month (YYYY-MM)</label>
            <input class="form-input" type="month" id="target_month" name="target_month" required value="${currentMonth}">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('generateRentModal').close()">Cancel</button>
          <button type="submit" class="btn btn-primary">Generate Charges</button>
        </div>
      </form>
    </dialog>
  `;

  return {
    title: 'Portfolio Rent Roll',
    content
  };
}
