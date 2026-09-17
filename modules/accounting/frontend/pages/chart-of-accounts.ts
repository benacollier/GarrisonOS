import { PageContext, PageResult } from '../../../../web/lib/page-context.js';
import { html, raw, SafeHtml } from '../../../../web/lib/html.js';
import { csrfField, validateCsrf } from '../../../../web/lib/csrf.js';

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
      if (action === 'create_account') {
        await ctx.api.post('/api/v1/accounting/chart-of-accounts', {
          account_number: ctx.body['account_number'] ? ctx.body['account_number'].trim() : null,
          account_name: (ctx.body['account_name'] ?? '').trim(),
          account_type: ctx.body['account_type'] ?? 'Expense',
          qb_account_type: ctx.body['qb_account_type'] ?? ctx.body['account_type'] ?? 'Expense',
          category_mapping: ctx.body['category_mapping'] ? ctx.body['category_mapping'].trim() : null,
          description: ctx.body['description'] ? ctx.body['description'].trim() : null
        });
        ctx.session.addFlash('success', 'Chart of accounts entry created successfully');
        return { redirect: '/accounting/chart-of-accounts', content: '' };
      } else if (action === 'update_account') {
        const accountId = ctx.body['account_id'] || '';
        await ctx.api.put(`/api/v1/accounting/chart-of-accounts/${encodeURIComponent(accountId)}`, {
          account_number: ctx.body['account_number'] ? ctx.body['account_number'].trim() : null,
          account_name: (ctx.body['account_name'] ?? '').trim(),
          account_type: ctx.body['account_type'] ?? 'Expense',
          qb_account_type: ctx.body['qb_account_type'] ?? 'Expense',
          category_mapping: ctx.body['category_mapping'] ? ctx.body['category_mapping'].trim() : null,
          description: ctx.body['description'] ? ctx.body['description'].trim() : null,
          is_active: ctx.body['is_active'] ? 1 : 0
        });
        ctx.session.addFlash('success', 'Account updated successfully');
        return { redirect: '/accounting/chart-of-accounts', content: '' };
      }
    } catch (err: any) {
      error = err.message;
    }
  }

  let accounts: any[] = [];
  try {
    const res = await ctx.api.get('/api/v1/accounting/chart-of-accounts?include_inactive=true');
    accounts = res?.data?.accounts || [];
  } catch (err: any) {
    error = error || err.message;
  }

  const errorAlert = error
    ? html`<div class="alert alert-danger" style="margin-bottom: 1.5rem;"><strong>Error:</strong> ${error}</div>`
    : raw('');

  const accountRows = accounts.length > 0
    ? accounts.map((acc) => html`
        <tr>
          <td style="font-family: monospace; font-weight: bold;">
            ${acc.account_number || '-'}
          </td>
          <td>
            <strong>${acc.account_name}</strong>
            ${acc.description ? html`<br><small class="text-muted">${acc.description}</small>` : raw('')}
          </td>
          <td>
            <span class="badge badge-secondary">${acc.account_type}</span>
          </td>
          <td>
            <span class="badge badge-secondary">${acc.qb_account_type}</span>
          </td>
          <td>
            ${acc.category_mapping ? html`<code>${acc.category_mapping}</code>` : html`<span class="text-muted">-</span>`}
          </td>
          <td>
            <span class="badge ${acc.is_active ? 'badge-success' : 'badge-danger'}">
              ${acc.is_active ? 'Active' : 'Inactive'}
            </span>
          </td>
        </tr>
      `)
    : [html`
        <tr>
          <td colspan="6" class="text-center text-muted" style="padding: 2.5rem;">
            No chart of accounts loaded.
          </td>
        </tr>
      `];

  const content = html`
    <div class="page-header">
      <div>
        <a href="/accounting" class="text-muted">← Back to Accounting</a>
        <h1 class="page-title">Chart of Accounts</h1>
        <p class="page-subtitle">Configure general ledger accounts and map GarrisonOS categories to QuickBooks account structures.</p>
      </div>
      <div class="btn-group">
        <a href="/accounting/quickbooks" class="btn btn-secondary">QuickBooks Export</a>
        <button class="btn btn-primary" onclick="document.getElementById('newAccountModal').showModal()">+ Add GL Account</button>
      </div>
    </div>

    ${errorAlert}

    <div class="card">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; font-size: 1.1rem;">General Ledger Accounts (${accounts.length})</h3>
        <span class="badge badge-info">Standard Real Estate & Schedule E COA</span>
      </div>
      <div class="table-responsive">
        <table class="table data-table">
          <thead>
            <tr>
              <th style="width: 120px;">Account #</th>
              <th>Account Name</th>
              <th>Account Type</th>
              <th>QuickBooks Type</th>
              <th>GarrisonOS Category Mapping</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${accountRows}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Add Account Modal -->
    <dialog id="newAccountModal" class="modal">
      <div class="modal-box">
        <h3 class="modal-title">Add Chart of Accounts Item</h3>
        <form method="POST" action="/accounting/chart-of-accounts">
          ${csrfField(csrfToken)}
          <input type="hidden" name="action" value="create_account">

          <div class="form-group">
            <label class="form-label">Account Number</label>
            <input type="text" name="account_number" class="form-input" placeholder="e.g. 5150">
          </div>

          <div class="form-group">
            <label class="form-label">Account Name *</label>
            <input type="text" name="account_name" class="form-input" required placeholder="e.g. Landscaping & Snow Removal">
          </div>

          <div class="form-group">
            <label class="form-label">Account Type *</label>
            <select name="account_type" class="form-select" required>
              <option value="Expense">Expense</option>
              <option value="Income">Income</option>
              <option value="Bank">Bank</option>
              <option value="AccountsReceivable">Accounts Receivable</option>
              <option value="OtherCurrentAsset">Other Current Asset</option>
              <option value="AccountsPayable">Accounts Payable</option>
              <option value="OtherCurrentLiability">Other Current Liability</option>
              <option value="Equity">Equity</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">QuickBooks Account Type *</label>
            <select name="qb_account_type" class="form-select" required>
              <option value="Expense">Expense</option>
              <option value="Income">Income</option>
              <option value="Bank">Bank</option>
              <option value="AccountsReceivable">Accounts Receivable</option>
              <option value="OtherCurrentAsset">Other Current Asset</option>
              <option value="FixedAsset">Fixed Asset</option>
              <option value="AccountsPayable">Accounts Payable</option>
              <option value="OtherCurrentLiability">Other Current Liability</option>
              <option value="Equity">Equity</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">GarrisonOS Category Mapping (Optional)</label>
            <input type="text" name="category_mapping" class="form-input" placeholder="e.g. cleaning_maintenance, repairs, rent">
          </div>

          <div class="form-group">
            <label class="form-label">Description (Optional)</label>
            <textarea name="description" class="form-input" rows="2" placeholder="Brief note on when this account is debited or credited"></textarea>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('newAccountModal').close()">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Account</button>
          </div>
        </form>
      </div>
    </dialog>
  `;

  return {
    title: 'Chart of Accounts',
    content
  };
}
