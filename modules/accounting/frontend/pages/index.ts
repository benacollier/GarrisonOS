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
  const typeFilter = ctx.query['type'] || '';
  const categoryFilter = ctx.query['category'] || '';
  const csrfToken = ctx.session.getCsrfToken();
  let error: string | null = null;

  if (ctx.method === 'POST' && ctx.body['action'] === 'create_transaction') {
    if (!validateCsrf(csrfToken, ctx.body['csrf_token'])) {
      return {
        title: 'Error',
        status: 403,
        content: html`<div class="alert alert-danger">CSRF token validation failed.</div>`
      };
    }

    try {
      const amountCents = Math.round(parseFloat(ctx.body['amount'] ?? '0') * 100);
      const txDate = new Date(ctx.body['transaction_date'] ?? Date.now()).getTime();

      await ctx.api.post('/api/v1/accounting/transactions', {
        transaction_type: ctx.body['transaction_type'] ?? 'payment',
        category: ctx.body['category'] ?? 'rent',
        amount_cents: amountCents,
        transaction_date: txDate,
        description: ctx.body['description'] ?? '',
        payment_method: ctx.body['payment_method'] || null,
        reference_number: ctx.body['reference_number'] || null,
        property_id: ctx.body['property_id'] || null
      });

      ctx.session.addFlash('success', 'Transaction successfully recorded');
      return { redirect: '/accounting', content: '' };
    } catch (err: any) {
      error = err.message;
    }
  }

  let transactions: any[] = [];
  let properties: any[] = [];

  try {
    const params = new URLSearchParams();
    if (typeFilter) params.set('transaction_type', typeFilter);
    if (categoryFilter) params.set('category', categoryFilter);
    const queryStr = params.toString() ? `?${params.toString()}` : '';

    const res = await ctx.api.get(`/api/v1/accounting/transactions${queryStr}`);
    transactions = res?.data?.transactions || [];

    const propRes = await ctx.api.get('/api/v1/properties');
    properties = propRes?.data?.properties || [];
  } catch (err: any) {
    error = error || err.message;
  }

  const errorAlert = error
    ? html`<div class="alert alert-danger" style="margin-bottom: 1.5rem;">${error}</div>`
    : raw('');

  const transactionRows = transactions.length > 0
    ? transactions.map((t) => {
        let badgeClass = 'badge-info';
        if (t.transaction_type === 'payment') badgeClass = 'badge-success';
        else if (t.transaction_type === 'charge') badgeClass = 'badge-warning';
        else if (t.transaction_type === 'expense') badgeClass = 'badge-danger';

        const typeFormatted = (t.transaction_type || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
        const catFormatted = (t.category || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

        let amountHtml: SafeHtml;
        if (t.transaction_type === 'payment' || t.transaction_type === 'deposit_inflow') {
          amountHtml = html`<span class="text-success font-bold">+$${formatCurrency(t.amount_cents)}</span>`;
        } else if (t.transaction_type === 'expense') {
          amountHtml = html`<span class="text-danger font-bold">-$${formatCurrency(t.amount_cents)}</span>`;
        } else {
          amountHtml = html`<span class="font-bold">$${formatCurrency(t.amount_cents)}</span>`;
        }

        return html`
          <tr>
            <td>${formatDate(t.transaction_date)}</td>
            <td><span class="badge ${badgeClass}">${typeFormatted}</span></td>
            <td>${catFormatted}</td>
            <td>${t.description}</td>
            <td>${t.payment_method ? t.payment_method.toUpperCase() : '—'}</td>
            <td>${amountHtml}</td>
          </tr>
        `;
      })
    : [html`
        <tr>
          <td colspan="6" class="text-center text-muted">No transactions matching criteria.</td>
        </tr>
      `];

  const propertyOptions = properties.map((p) => html`<option value="${p.id}">${p.name}</option>`);
  const today = new Date().toISOString().split('T')[0];

  const content = html`
    <div class="page-header">
      <div>
        <h1 class="page-title">Financial Ledger</h1>
        <p class="page-subtitle">Cash-basis income, expenses, and tenant transactions.</p>
      </div>
      <div class="btn-group">
        <button class="btn btn-primary" onclick="document.getElementById('addTxModal').showModal()">+ Record Transaction</button>
        <a href="/accounting/general-ledger" class="btn btn-secondary">General Ledger</a>
        <a href="/accounting/trial-balance" class="btn btn-secondary">Trial Balance</a>
        <a href="/accounting/rent-roll" class="btn btn-secondary">Rent Roll</a>
        <a href="/accounting/schedule-e" class="btn btn-secondary">Schedule E</a>
        <a href="/accounting/quickbooks" class="btn btn-secondary">QuickBooks Sync</a>
      </div>
    </div>

    ${errorAlert}

    <!-- Filters Bar -->
    <div class="filter-bar card">
      <div class="filter-pills">
        <a href="/accounting" class="filter-pill ${!typeFilter ? 'active' : ''}">All</a>
        <a href="/accounting?type=payment" class="filter-pill ${typeFilter === 'payment' ? 'active' : ''}">Payments</a>
        <a href="/accounting?type=charge" class="filter-pill ${typeFilter === 'charge' ? 'active' : ''}">Charges</a>
        <a href="/accounting?type=expense" class="filter-pill ${typeFilter === 'expense' ? 'active' : ''}">Expenses</a>
        <a href="/accounting?type=deposit_inflow" class="filter-pill ${typeFilter === 'deposit_inflow' ? 'active' : ''}">Deposits</a>
      </div>
    </div>

    <div class="card">
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Category</th>
              <th>Description</th>
              <th>Payment Method</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${transactionRows}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal: Record Transaction -->
    <dialog id="addTxModal" class="modal">
      <form method="POST" action="/accounting" class="modal-box">
        ${csrfField(csrfToken)}
        <input type="hidden" name="action" value="create_transaction">
        <div class="modal-header">
          <h3>Record Transaction</h3>
          <button type="button" class="btn-close" onclick="document.getElementById('addTxModal').close()">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group col-6">
              <label class="form-label" for="transaction_type">Type *</label>
              <select class="form-select" id="transaction_type" name="transaction_type" required>
                <option value="payment">Payment Received (Income)</option>
                <option value="expense">Operating Expense (Outflow)</option>
                <option value="charge">Charge Invoiced (Owed)</option>
                <option value="deposit_inflow">Security Deposit Trust Inflow</option>
              </select>
            </div>
            <div class="form-group col-6">
              <label class="form-label" for="category">Category *</label>
              <select class="form-select" id="category" name="category" required>
                <optgroup label="Income">
                  <option value="rent">Rent</option>
                  <option value="late_fee">Late Fee</option>
                  <option value="pet_fee">Pet Fee</option>
                  <option value="utility_rebill">Utility Rebill</option>
                  <option value="security_deposit">Security Deposit</option>
                  <option value="other_income">Other Income</option>
                </optgroup>
                <optgroup label="Schedule E Expenses">
                  <option value="repairs">Repairs</option>
                  <option value="cleaning_maintenance">Cleaning & Maintenance</option>
                  <option value="utilities">Utilities</option>
                  <option value="property_taxes">Property Taxes</option>
                  <option value="insurance">Insurance</option>
                  <option value="management_fees">Management Fees</option>
                  <option value="mortgage_interest">Mortgage Interest</option>
                  <option value="supplies">Supplies</option>
                  <option value="legal_professional">Legal & Professional</option>
                  <option value="advertising">Advertising</option>
                  <option value="capital_improvement">Capital Improvement</option>
                </optgroup>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group col-6">
              <label class="form-label" for="amount">Amount ($) *</label>
              <input class="form-input" type="number" id="amount" name="amount" step="0.01" required placeholder="0.00">
            </div>
            <div class="form-group col-6">
              <label class="form-label" for="transaction_date">Date *</label>
              <input class="form-input" type="date" id="transaction_date" name="transaction_date" required value="${today}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="description">Description *</label>
            <input class="form-input" type="text" id="description" name="description" required placeholder="e.g. September Rent Payment or Replaced Water Heater">
          </div>
          <div class="form-row">
            <div class="form-group col-6">
              <label class="form-label" for="payment_method">Payment Method</label>
              <select class="form-select" id="payment_method" name="payment_method">
                <option value="">-- None / N/A --</option>
                <option value="zelle">Zelle</option>
                <option value="ach">ACH Transfer</option>
                <option value="check">Paper Check</option>
                <option value="cash">Cash</option>
                <option value="credit_card">Credit Card</option>
                <option value="direct_deposit">Direct Deposit</option>
              </select>
            </div>
            <div class="form-group col-6">
              <label class="form-label" for="reference_number">Ref # / Check #</label>
              <input class="form-input" type="text" id="reference_number" name="reference_number" placeholder="e.g. #1048">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="property_id">Associated Property</label>
            <select class="form-select" id="property_id" name="property_id">
              <option value="">-- Portfolio Wide / None --</option>
              ${propertyOptions}
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('addTxModal').close()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Transaction</button>
        </div>
      </form>
    </dialog>
  `;

  return {
    title: 'Accounting & Ledger',
    content
  };
}
