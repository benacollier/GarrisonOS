import { html, raw, SafeHtml } from '../lib/html.js';
import { DashboardCard, HookRegistry } from '../lib/hooks.js';
import { PageContext, PageResult } from '../lib/page-context.js';

export interface DashboardPageOptions {
  dashboardCards: DashboardCard[];
  recentTransactions: Array<{
    id: string;
    transaction_date: number;
    transaction_type: string;
    description: string;
    amount_cents: number;
  }>;
  openWorkOrders: Array<{
    id: string;
    title: string;
    property_name: string;
    priority: string;
  }>;
}

function formatDate(epochMs: number): string {
  try {
    if (!Number.isFinite(epochMs)) return '';
    const d = new Date(epochMs);
    if (!Number.isFinite(d.getTime())) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
  } catch {
    return '';
  }
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function renderDashboardPage(options: DashboardPageOptions): SafeHtml {
  const cards = options.dashboardCards.length > 0
    ? options.dashboardCards.map((card) => html`
        <div class="card metric-card">
          <div class="metric-label">${card.title}</div>
          <div class="metric-value">${card.value}</div>
          ${card.subtitle ? html`<div class="metric-subtitle">${card.subtitle}</div>` : raw('')}
        </div>
      `)
    : [html`
        <div class="card metric-card">
          <div class="metric-label">System Status</div>
          <div class="metric-value text-success">Active</div>
          <div class="metric-subtitle">GarrisonOS Core Engine online</div>
        </div>
      `];

  const transactionsRows = options.recentTransactions.length > 0
    ? options.recentTransactions.map((tx) => {
        let amountHtml: SafeHtml;
        if (tx.transaction_type === 'payment') {
          amountHtml = html`<span class="text-success font-bold">+$${formatCurrency(tx.amount_cents)}</span>`;
        } else if (tx.transaction_type === 'expense') {
          amountHtml = html`<span class="text-danger font-bold">-$${formatCurrency(tx.amount_cents)}</span>`;
        } else {
          amountHtml = html`<span>$${formatCurrency(tx.amount_cents)}</span>`;
        }

        const typeFormatted = tx.transaction_type ? tx.transaction_type.charAt(0).toUpperCase() + tx.transaction_type.slice(1) : '';

        return html`
          <tr>
            <td>${formatDate(tx.transaction_date)}</td>
            <td><span class="badge">${typeFormatted}</span></td>
            <td>${tx.description}</td>
            <td>${amountHtml}</td>
          </tr>
        `;
      })
    : [html`
        <tr>
          <td colspan="4" class="text-center text-muted">No recent transactions recorded.</td>
        </tr>
      `];

  const workOrdersRows = options.openWorkOrders.length > 0
    ? options.openWorkOrders.map((wo) => {
        const priorityClass = wo.priority === 'emergency' ? 'badge-danger' : 'badge-warning';
        const priorityFormatted = wo.priority ? wo.priority.charAt(0).toUpperCase() + wo.priority.slice(1) : '';

        return html`
          <tr>
            <td><strong>${wo.title}</strong></td>
            <td>${wo.property_name}</td>
            <td><span class="badge ${priorityClass}">${priorityFormatted}</span></td>
            <td><a href="/maintenance/show?id=${encodeURIComponent(wo.id)}" class="btn btn-sm btn-secondary">Review</a></td>
          </tr>
        `;
      })
    : [html`
        <tr>
          <td colspan="4" class="text-center text-muted">No open work orders pending.</td>
        </tr>
      `];

  return html`
    <div class="page-header">
      <div>
        <h1 class="page-title">Portfolio Overview</h1>
        <p class="page-subtitle">Real-time occupancy, financial health, and operational status.</p>
      </div>
      <div class="btn-group">
        <a href="/accounting/rent-roll" class="btn btn-secondary">Rent Roll</a>
        <a href="/maintenance" class="btn btn-primary">+ Maintenance Ticket</a>
      </div>
    </div>

    <!-- Dynamic Hook Dashboard Cards -->
    <div class="metrics-grid">
      ${cards}
    </div>

    <div class="grid-2-col">
      <!-- Recent Financial Activity -->
      <div class="card">
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
          <h2 class="card-title">Recent Cash Activity</h2>
          <a href="/accounting" class="btn btn-sm btn-secondary">View All</a>
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${transactionsRows}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Active Work Orders -->
      <div class="card">
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
          <h2 class="card-title">Pending Repairs</h2>
          <a href="/maintenance" class="btn btn-sm btn-secondary">View All</a>
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Issue</th>
                <th>Property</th>
                <th>Priority</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${workOrdersRows}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

export async function handle(ctx: PageContext): Promise<PageResult> {
  const cards = await HookRegistry.getDashboardCards(ctx.api);

  let recentTransactions: any[] = [];
  try {
    const txRes = await ctx.api.get('/api/v1/accounting/transactions?limit=5');
    recentTransactions = txRes?.data?.transactions || [];
  } catch {
    // Graceful fallback
  }

  let openWorkOrders: any[] = [];
  try {
    const woRes = await ctx.api.get('/api/v1/maintenance/work-orders?status=open&limit=5');
    openWorkOrders = woRes?.data?.workOrders || [];
  } catch {
    // Graceful fallback
  }

  const content = renderDashboardPage({
    dashboardCards: cards,
    recentTransactions,
    openWorkOrders,
  });

  return {
    title: 'Dashboard',
    content,
  };
}
