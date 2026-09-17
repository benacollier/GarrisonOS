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
  const leaseId = ctx.query['lease_id'] || '';
  if (!leaseId) {
    return { redirect: '/accounting', content: '' };
  }

  const csrfToken = ctx.session.getCsrfToken();
  let error: string | null = null;

  let lease: any = null;
  let balance: any = null;
  let transactions: any[] = [];

  try {
    const leaseRes = await ctx.api.get(`/api/v1/leases/${encodeURIComponent(leaseId)}`);
    lease = leaseRes?.data?.lease ?? null;

    const balRes = await ctx.api.get(`/api/v1/accounting/balance/${encodeURIComponent(leaseId)}`);
    balance = balRes?.data?.balance ?? null;
    transactions = balRes?.data?.transactions || [];
  } catch (err: any) {
    error = err.message;
  }

  if (!lease) {
    return {
      title: 'Lease Not Found',
      content: html`
        <div class="alert alert-danger">Lease not found.</div>
        <p><a href="/accounting" class="btn btn-secondary">← Back to Accounting</a></p>
      `
    };
  }

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
      if (action === 'post_payment') {
        const amountCents = Math.round(parseFloat(ctx.body['amount'] ?? '0') * 100);
        if (!Number.isFinite(amountCents) || amountCents <= 0) {
          throw new Error('Payment amount must be greater than zero.');
        }
        const txDate = new Date(ctx.body['transaction_date'] ?? Date.now()).getTime();

        await ctx.api.post('/api/v1/accounting/transactions', {
          transaction_type: 'payment',
          category: ctx.body['category'] ?? 'rent',
          amount_cents: amountCents,
          transaction_date: txDate,
          description: ctx.body['description'] || 'Rent Payment',
          payment_method: ctx.body['payment_method'] || 'zelle',
          reference_number: ctx.body['reference_number'] || null,
          property_id: lease.property_id || null,
          unit_id: lease.unit_id || null,
          lease_id: leaseId
        });
        ctx.session.addFlash('success', 'Payment recorded on ledger');
        return { redirect: `/accounting/ledger-detail?lease_id=${encodeURIComponent(leaseId)}`, content: '' };
      } else if (action === 'deposit_disposition') {
        const deductions: any[] = [];
        if (ctx.body['damage_description'] && ctx.body['damage_amount']) {
          const amountCents = Math.round(parseFloat(ctx.body['damage_amount']) * 100);
          if (!Number.isFinite(amountCents) || amountCents < 0) {
            throw new Error('Deduction amount must be zero or greater.');
          }
          deductions.push({
            description: ctx.body['damage_description'],
            amount_cents: amountCents,
            category: 'repairs'
          });
        }
        await ctx.api.post('/api/v1/accounting/deposit-disposition', {
          lease_id: leaseId,
          deductions
        });
        ctx.session.addFlash('success', 'Security deposit trust disposition finalized');
        return { redirect: `/accounting/ledger-detail?lease_id=${encodeURIComponent(leaseId)}`, content: '' };
      }
    } catch (err: any) {
      error = err.message;
    }
  }

  const errorAlert = error
    ? html`<div class="alert alert-danger" style="margin-bottom: 1.5rem;">${error}</div>`
    : raw('');

  let running = 0;
  const transactionRows = transactions.length > 0
    ? transactions.map((t) => {
        const isCharge = ['charge', 'deposit_return', 'deposit_deduction'].includes(t.transaction_type);
        const isPayment = ['payment', 'refund'].includes(t.transaction_type);
        if (isCharge) running += t.amount_cents;
        if (isPayment) running -= t.amount_cents;

        const typeFormatted = (t.transaction_type || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
        const catFormatted = (t.category || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

        return html`
          <tr>
            <td>${formatDate(t.transaction_date)}</td>
            <td><span class="badge">${typeFormatted}</span></td>
            <td>${catFormatted}</td>
            <td>${t.description}</td>
            <td>${t.payment_method ? t.payment_method.toUpperCase() : '—'}</td>
            <td>
              ${t.journal_entry_id
                ? html`<a href="/accounting/general-ledger" title="View in General Ledger"><code>GL Linked</code></a>`
                : html`<span class="text-muted">—</span>`}
            </td>
            <td>${isCharge ? `$${formatCurrency(t.amount_cents)}` : '—'}</td>
            <td>${isPayment ? html`<span class="text-success font-bold">+$${formatCurrency(t.amount_cents)}</span>` : '—'}</td>
            <td><strong>$${formatCurrency(running)}</strong></td>
          </tr>
        `;
      })
    : [html`
        <tr>
          <td colspan="9" class="text-center text-muted">No transactions on ledger.</td>
        </tr>
      `];

  const today = new Date().toISOString().split('T')[0];
  const balanceCents = balance?.balanceCents ?? 0;

  const content = html`
    <div class="page-header">
      <div>
        <a href="/leases/show?id=${encodeURIComponent(leaseId)}" class="text-muted">← Back to Lease Agreement</a>
        <h1 class="page-title">Tenant Ledger Statement</h1>
        <p class="page-subtitle">
          ${lease.property_name || 'Property'} – Unit ${lease.unit_number || ''}
        </p>
      </div>
      <div class="btn-group">
        <button class="btn btn-primary" onclick="document.getElementById('postPaymentModal').showModal()">+ Post Payment</button>
        <button class="btn btn-secondary" onclick="document.getElementById('depositDispModal').showModal()">Move-Out Disposition</button>
        <a href="/api/v1/accounting/export/ledger/${encodeURIComponent(leaseId)}.csv" class="btn btn-secondary" target="_blank">Export CSV</a>
      </div>
    </div>

    ${errorAlert}

    <div class="metrics-grid">
      <div class="card metric-card">
        <div class="metric-label">Current Ledger Balance</div>
        <div class="metric-value ${balanceCents > 0 ? 'text-danger' : 'text-success'}">
          $${formatCurrency(balanceCents)}
        </div>
        <div class="metric-subtitle">${balanceCents > 0 ? 'Amount owed by tenant' : 'Paid in full / credit'}</div>
      </div>
      <div class="card metric-card">
        <div class="metric-label">Monthly Rent Rate</div>
        <div class="metric-value">$${formatCurrency(lease.rent_amount_cents || 0)}</div>
        <div class="metric-subtitle">Due on day ${lease.rent_due_day || 1}</div>
      </div>
      <div class="card metric-card">
        <div class="metric-label">Security Deposit Held</div>
        <div class="metric-value">$${formatCurrency(lease.deposit_held_cents || 0)}</div>
        <div class="metric-subtitle">Trust account balance</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Transaction History</h2>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Category</th>
              <th>Description</th>
              <th>Payment Method</th>
              <th>GL Entry</th>
              <th>Charge</th>
              <th>Payment</th>
              <th>Running Balance</th>
            </tr>
          </thead>
          <tbody>
            ${transactionRows}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal: Post Payment -->
    <dialog id="postPaymentModal" class="modal">
      <form method="POST" action="/accounting/ledger-detail?lease_id=${encodeURIComponent(leaseId)}" class="modal-box">
        ${csrfField(csrfToken)}
        <input type="hidden" name="action" value="post_payment">
        <div class="modal-header">
          <h3>Post Tenant Payment</h3>
          <button type="button" class="btn-close" onclick="document.getElementById('postPaymentModal').close()">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group col-6">
              <label class="form-label" for="amount">Payment Amount ($) *</label>
              <input class="form-input" type="number" id="amount" name="amount" step="0.01" required value="${(Math.max(0, balanceCents) / 100).toFixed(2)}">
            </div>
            <div class="form-group col-6">
              <label class="form-label" for="payment_date">Payment Date *</label>
              <input class="form-input" type="date" id="payment_date" name="transaction_date" required value="${today}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group col-6">
              <label class="form-label" for="payment_method">Payment Method *</label>
              <select class="form-select" id="payment_method" name="payment_method" required>
                <option value="zelle">Zelle</option>
                <option value="ach">ACH / Bank Transfer</option>
                <option value="check">Paper Check</option>
                <option value="cash">Cash</option>
                <option value="credit_card">Credit Card</option>
                <option value="direct_deposit">Direct Deposit</option>
              </select>
            </div>
            <div class="form-group col-6">
              <label class="form-label" for="reference_number">Check # / Confirmation #</label>
              <input class="form-input" type="text" id="reference_number" name="reference_number" placeholder="e.g. ZL-847291">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="description">Description</label>
            <input class="form-input" type="text" id="description" name="description" value="Monthly Rent Payment">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('postPaymentModal').close()">Cancel</button>
          <button type="submit" class="btn btn-primary">Record Payment</button>
        </div>
      </form>
    </dialog>

    <!-- Modal: Move-Out Deposit Disposition -->
    <dialog id="depositDispModal" class="modal">
      <form method="POST" action="/accounting/ledger-detail?lease_id=${encodeURIComponent(leaseId)}" class="modal-box">
        ${csrfField(csrfToken)}
        <input type="hidden" name="action" value="deposit_disposition">
        <div class="modal-header">
          <h3>Move-Out Security Deposit Disposition</h3>
          <button type="button" class="btn-close" onclick="document.getElementById('depositDispModal').close()">✕</button>
        </div>
        <div class="modal-body">
          <p><strong>Deposit Held in Trust:</strong> $${formatCurrency(lease.deposit_held_cents || 0)}</p>
          <p><strong>Unpaid Rent Balance:</strong> $${formatCurrency(Math.max(0, balanceCents))}</p>
          <hr style="margin: 1rem 0; border: 0; border-top: 1px solid var(--border-color);">
          <div class="form-group">
            <label class="form-label" for="damage_description">Itemized Damage / Repair Deduction</label>
            <input class="form-input" type="text" id="damage_description" name="damage_description" placeholder="e.g. Carpet deep cleaning & wall patching">
          </div>
          <div class="form-group">
            <label class="form-label" for="damage_amount">Deduction Amount ($)</label>
            <input class="form-input" type="number" id="damage_amount" name="damage_amount" step="0.01" placeholder="0.00">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('depositDispModal').close()">Cancel</button>
          <button type="submit" class="btn btn-danger">Finalize Disposition & Close Lease</button>
        </div>
      </form>
    </dialog>
  `;

  return {
    title: `Tenant Ledger: Unit ${lease.unit_number || ''}`,
    content
  };
}
