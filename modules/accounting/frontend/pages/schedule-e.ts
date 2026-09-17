import { PageContext, PageResult } from '../../../../web/lib/page-context.js';
import { html, raw, SafeHtml } from '../../../../web/lib/html.js';

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function handle(ctx: PageContext): Promise<PageResult> {
  const currentYear = new Date().getUTCFullYear();
  const selectedYear = ctx.query['year'] && !isNaN(parseInt(ctx.query['year'], 10))
    ? parseInt(ctx.query['year'], 10)
    : currentYear;
  const selectedProperty = ctx.query['property_id'] || '';

  let report: any = null;
  let properties: any[] = [];
  let error: string | null = null;

  try {
    const params = new URLSearchParams();
    params.set('year', String(selectedYear));
    if (selectedProperty) params.set('property_id', selectedProperty);

    const res = await ctx.api.get(`/api/v1/accounting/schedule-e?${params.toString()}`);
    report = res?.data?.report ?? null;

    const propRes = await ctx.api.get('/api/v1/properties');
    properties = propRes?.data?.properties || [];
  } catch (err: any) {
    error = err.message;
  }

  const errorAlert = error
    ? html`<div class="alert alert-danger" style="margin-bottom: 1.5rem;">${error}</div>`
    : raw('');

  const yearOptions: SafeHtml[] = [];
  for (let y = currentYear; y >= currentYear - 5; y--) {
    yearOptions.push(html`<option value="${y}" ${y === selectedYear ? raw('selected') : raw('')}>${y}</option>`);
  }

  const propOptions = properties.map((p) => html`
    <option value="${p.id}" ${selectedProperty === p.id ? raw('selected') : raw('')}>${p.name}</option>
  `);

  let reportContent = raw('');

  if (report) {
    const incomeEntries = Object.entries(report.incomeByCategory || {}).map(([cat, cents]: [string, any]) => {
      const catFormatted = cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      return html`
        <tr>
          <td>${catFormatted}</td>
          <td class="text-right font-bold text-success">$${formatCurrency(Number(cents))}</td>
        </tr>
      `;
    });

    const expenseEntries = Object.entries(report.expenseByCategory || {}).map(([cat, cents]: [string, any]) => {
      const catFormatted = cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      return html`
        <tr>
          <td>${catFormatted}</td>
          <td class="text-right font-bold text-danger">$${formatCurrency(Number(cents))}</td>
        </tr>
      `;
    });

    reportContent = html`
      <div class="metrics-grid">
        <div class="card metric-card">
          <div class="metric-label">Total Rental Income</div>
          <div class="metric-value text-success">$${formatCurrency(report.totalIncomeCents || 0)}</div>
          <div class="metric-subtitle">Cash collected in ${selectedYear}</div>
        </div>
        <div class="card metric-card">
          <div class="metric-label">Operating Expenses</div>
          <div class="metric-value text-danger">$${formatCurrency(report.totalOperatingExpenseCents || 0)}</div>
          <div class="metric-subtitle">Deductible operating costs</div>
        </div>
        <div class="card metric-card">
          <div class="metric-label">Net Operating Income (NOI)</div>
          <div class="metric-value ${(report.netOperatingIncomeCents || 0) >= 0 ? 'text-success' : 'text-danger'}">
            $${formatCurrency(report.netOperatingIncomeCents || 0)}
          </div>
          <div class="metric-subtitle">Pre-tax cash flow</div>
        </div>
      </div>

      <div class="grid-2-col">
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">Income Sources</h2>
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th class="text-right">Total ($)</th>
                </tr>
              </thead>
              <tbody>
                ${incomeEntries.length > 0
                  ? html`
                    ${incomeEntries}
                    <tr style="border-top: 2px solid var(--border-color);">
                      <td><strong>Total Income</strong></td>
                      <td class="text-right font-bold text-success"><strong>$${formatCurrency(report.totalIncomeCents || 0)}</strong></td>
                    </tr>
                  `
                  : html`
                    <tr>
                      <td colspan="2" class="text-center text-muted">No income recorded for this period.</td>
                    </tr>
                  `}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h2 class="card-title">IRS Schedule E Expense Categories</h2>
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Line Item Category</th>
                  <th class="text-right">Total ($)</th>
                </tr>
              </thead>
              <tbody>
                ${expenseEntries.length > 0
                  ? html`
                    ${expenseEntries}
                    <tr style="border-top: 2px solid var(--border-color);">
                      <td><strong>Total Operating Expenses</strong></td>
                      <td class="text-right font-bold text-danger"><strong>$${formatCurrency(report.totalOperatingExpenseCents || 0)}</strong></td>
                    </tr>
                  `
                  : html`
                    <tr>
                      <td colspan="2" class="text-center text-muted">No expenses recorded for this period.</td>
                    </tr>
                  `}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  const content = html`
    <div class="page-header">
      <div>
        <a href="/accounting" class="text-muted">← Back to Accounting</a>
        <h1 class="page-title">IRS Schedule E Tax Summary (${selectedYear})</h1>
        <p class="page-subtitle">Cash-basis net operating income, rental income, and categorized operating expenses.</p>
      </div>
      <div class="btn-group">
        <a href="/api/v1/accounting/export/schedule-e.csv?year=${selectedYear}" class="btn btn-secondary" target="_blank">Export Schedule E CSV</a>
      </div>
    </div>

    ${errorAlert}

    <!-- Year & Property Filter -->
    <div class="filter-bar card">
      <form method="GET" action="/accounting/schedule-e" style="display:flex; gap:1rem; align-items:center; flex-wrap:wrap;">
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label" style="display:inline-block; margin-right:0.5rem;" for="year">Tax Year:</label>
          <select class="form-select form-input-sm" id="year" name="year" onchange="this.form.submit()">
            ${yearOptions}
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label" style="display:inline-block; margin-right:0.5rem;" for="property_id">Property:</label>
          <select class="form-select form-input-sm" id="property_id" name="property_id" onchange="this.form.submit()">
            <option value="">-- All Properties Combined --</option>
            ${propOptions}
          </select>
        </div>
      </form>
    </div>

    ${reportContent}
  `;

  return {
    title: `IRS Schedule E Tax Summary (${selectedYear})`,
    content
  };
}
