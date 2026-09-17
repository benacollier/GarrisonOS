/**
 * Accounting Module - Trial Balance Report Page Handler
 */

import { PageContext, PageResult } from '../../../../web/lib/page-context.js';
import { html, raw, SafeHtml } from '../../../../web/lib/html.js';

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function handle(ctx: PageContext): Promise<PageResult> {
  const pageTitle = 'Trial Balance';
  const todayStr = new Date().toISOString().slice(0, 10);
  const rawAsOfDate = ctx.query['as_of_date'];
  const rawPropertyId = ctx.query['property_id'] || '';

  const propertyIdInput = typeof rawPropertyId === 'string' ? rawPropertyId.trim() : '';

  let asOfDateInput = todayStr;
  let isValidDate = false;
  let error: string | null = null;

  if (typeof rawAsOfDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawAsOfDate)) {
    const parsed = new Date(rawAsOfDate + 'T00:00:00Z');
    if (!isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === rawAsOfDate) {
      asOfDateInput = rawAsOfDate;
      isValidDate = true;
    }
  }

  if (!isValidDate && rawAsOfDate !== undefined) {
    error = 'Invalid date format provided. Please provide date in YYYY-MM-DD format.';
  }

  const asOfDateMs = new Date(asOfDateInput + 'T23:59:59.999Z').getTime();

  let trialBalance: any = null;
  let properties: any[] = [];

  try {
    if (isValidDate || rawAsOfDate === undefined) {
      const params = new URLSearchParams();
      params.set('as_of_date', String(asOfDateMs));
      if (propertyIdInput) {
        params.set('property_id', propertyIdInput);
      }
      const res = await ctx.api.get(`/api/v1/accounting/trial-balance?${params.toString()}`);
      trialBalance = res?.data?.trialBalance ?? null;
    }
  } catch (err: any) {
    error = err.message;
  }

  try {
    const propRes = await ctx.api.get('/api/v1/properties');
    properties = propRes?.data?.properties || [];
  } catch {
    // Graceful fallback
  }

  const errorAlert = error
    ? html`<div class="alert alert-danger" style="margin-bottom: var(--spacing-lg);">${error}</div>`
    : raw('');

  const propertyOptions: SafeHtml[] = [
    html`<option value="">All Properties (Consolidated)</option>`
  ];
  for (const p of properties) {
    propertyOptions.push(
      html`<option value="${p.id}" ${propertyIdInput === p.id ? raw('selected') : raw('')}>${p.name}</option>`
    );
  }

  let reportSection = raw('');
  if (trialBalance) {
    const isBalanced = !!trialBalance.isBalanced;
    const badge = isBalanced
      ? html`<span class="badge" style="background-color: var(--color-success, #10b981); color: white; padding: 4px 10px; border-radius: 4px;">Balanced (Zero-Sum Invariant Satisfied)</span>`
      : html`<span class="badge" style="background-color: var(--color-danger, #ef4444); color: white; padding: 4px 10px; border-radius: 4px;">Unbalanced Out-Of-Proof!</span>`;

    const accounts: any[] = trialBalance.accounts || [];
    const activeAccounts = accounts.filter(acc => acc.total_debit_cents !== 0 || acc.total_credit_cents !== 0);

    const rows: SafeHtml[] = [];
    if (activeAccounts.length === 0) {
      rows.push(html`
        <tr>
          <td colspan="6" style="text-align: center; color: var(--color-text-muted); padding: var(--spacing-xl);">
            No General Ledger entries found for this period.
          </td>
        </tr>
      `);
    } else {
      for (const acc of activeAccounts) {
        const debitStr = acc.total_debit_cents > 0 ? `$${formatCurrency(acc.total_debit_cents)}` : '—';
        const creditStr = acc.total_credit_cents > 0 ? `$${formatCurrency(acc.total_credit_cents)}` : '—';
        const netStr = `$${formatCurrency(acc.net_balance_cents)}`;
        rows.push(html`
          <tr>
            <td><code>${acc.account_number || '—'}</code></td>
            <td style="font-weight: 500;">${acc.account_name}</td>
            <td><span class="badge">${acc.account_type}</span></td>
            <td style="text-align: right; font-family: monospace;">${debitStr}</td>
            <td style="text-align: right; font-family: monospace;">${creditStr}</td>
            <td style="text-align: right; font-weight: 600; font-family: monospace;">${netStr}</td>
          </tr>
        `);
      }
    }

    const totalDebit = trialBalance.totalDebitCents ?? 0;
    const totalCredit = trialBalance.totalCreditCents ?? 0;
    const diff = Math.abs(totalDebit - totalCredit);
    const diffProof = diff === 0
      ? html`<span style="color: var(--color-success, #10b981);">$0.00 (In Balance)</span>`
      : html`<span style="color: var(--color-danger, #ef4444);">Out of Balance: $${formatCurrency(diff)}</span>`;

    reportSection = html`
      <div class="card" style="margin-bottom: var(--spacing-lg); padding: var(--spacing-md); display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span style="font-weight: 600; font-size: var(--font-size-base);">Ledger Invariant Status: </span>
          ${badge}
        </div>
        <div style="font-size: var(--font-size-sm); color: var(--color-text-muted);">
          Report generated for <strong>${asOfDateInput}</strong>
        </div>
      </div>

      <div class="card">
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th style="width: 100px;">Account #</th>
                <th>Account Name</th>
                <th>Type</th>
                <th style="text-align: right;">Total Debits</th>
                <th style="text-align: right;">Total Credits</th>
                <th style="text-align: right;">Net Balance</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
            <tfoot>
              <tr style="font-weight: 700; border-top: 2px solid var(--color-border);">
                <td colspan="3" style="text-align: right;">Totals & Invariant Proof:</td>
                <td style="text-align: right; font-family: monospace; font-size: var(--font-size-base);">$${formatCurrency(totalDebit)}</td>
                <td style="text-align: right; font-family: monospace; font-size: var(--font-size-base);">$${formatCurrency(totalCredit)}</td>
                <td style="text-align: right; font-family: monospace;">${diffProof}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }

  const content = html`
    <div class="page-header">
      <div>
        <a href="/accounting" class="text-muted">← Back to Accounting</a>
        <h1 class="page-title">Trial Balance Report</h1>
        <p class="page-subtitle">Standard General Ledger verification report verifying that total debits equal total credits.</p>
      </div>
      <div class="actions">
        <a href="/accounting/general-ledger" class="btn btn-secondary">General Ledger View</a>
      </div>
    </div>

    ${errorAlert}

    <div class="card" style="margin-bottom: var(--spacing-lg); padding: var(--spacing-md);">
      <form method="GET" action="/accounting/trial-balance" style="display: flex; gap: var(--spacing-md); align-items: flex-end; flex-wrap: wrap;">
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label">As of Date</label>
          <input type="date" name="as_of_date" class="form-control" value="${asOfDateInput}">
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label">Property Filter</label>
          <select name="property_id" class="form-control">
            ${propertyOptions}
          </select>
        </div>
        <button type="submit" class="btn btn-primary">Filter</button>
        <a href="/accounting/trial-balance" class="btn btn-secondary">Reset</a>
      </form>
    </div>

    ${reportSection}
  `;

  return {
    title: pageTitle,
    content,
  };
}
