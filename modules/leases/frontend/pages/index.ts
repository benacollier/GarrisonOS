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
  const statusFilter = ctx.query['status'] || '';
  const csrfToken = ctx.session.getCsrfToken();
  let error: string | null = null;

  if (ctx.method === 'POST' && ctx.body['action'] === 'create_lease') {
    if (!validateCsrf(csrfToken, ctx.body['csrf_token'])) {
      return {
        title: 'Error',
        status: 403,
        content: html`<div class="alert alert-danger">CSRF token validation failed.</div>`
      };
    }

    try {
      const startDate = new Date(ctx.body['start_date'] ?? '').getTime();
      const endDate = new Date(ctx.body['end_date'] ?? '').getTime();
      const rentCents = Math.round(parseFloat(ctx.body['rent_amount'] ?? '0') * 100);
      const depositCents = Math.round(parseFloat(ctx.body['security_deposit'] ?? '0') * 100);

      const contactsPayload: any[] = [];
      if (ctx.body['contact_id']) {
        contactsPayload.push({
          contact_id: ctx.body['contact_id'],
          role: 'primary_tenant',
          is_financially_responsible: true
        });
      }

      await ctx.api.post('/api/v1/leases', {
        unit_id: ctx.body['unit_id'] ?? '',
        status: ctx.body['status'] ?? 'active',
        start_date: startDate,
        end_date: endDate,
        rent_amount_cents: rentCents,
        security_deposit_cents: depositCents,
        deposit_held_cents: depositCents,
        rent_due_day: parseInt(ctx.body['rent_due_day'] ?? '1', 10),
        late_fee_grace_days: parseInt(ctx.body['late_fee_grace_days'] ?? '5', 10),
        late_fee_amount_cents: Math.round(parseFloat(ctx.body['late_fee_amount'] ?? '50') * 100),
        contacts: contactsPayload
      });

      ctx.session.addFlash('success', 'Lease agreement created successfully');
      return { redirect: '/leases', content: '' };
    } catch (err: any) {
      error = err.message;
    }
  }

  let leases: any[] = [];
  let units: any[] = [];
  let contacts: any[] = [];

  try {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    const queryStr = params.toString() ? `?${params.toString()}` : '';

    const res = await ctx.api.get(`/api/v1/leases${queryStr}`);
    leases = res?.data?.leases || [];

    const propRes = await ctx.api.get('/api/v1/properties/units');
    units = propRes?.data?.units || [];

    const contRes = await ctx.api.get('/api/v1/contacts?type=tenant');
    contacts = contRes?.data?.contacts || [];
  } catch (err: any) {
    error = error || err.message;
  }

  const errorAlert = error
    ? html`<div class="alert alert-danger" style="margin-bottom: 1.5rem;">${error}</div>`
    : raw('');

  const leaseRows = leases.length > 0
    ? leases.map((l) => {
        let statusClass = 'badge-info';
        if (l.status === 'active') statusClass = 'badge-success';
        else if (l.status === 'expiring') statusClass = 'badge-warning';
        else if (l.status === 'terminated') statusClass = 'badge-danger';

        const statusFormatted = (l.status || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

        return html`
          <tr>
            <td>
              <strong><a href="/leases/show?id=${encodeURIComponent(l.id)}">${l.property_name || 'Property'}</a></strong>
              <div class="text-muted text-sm">Unit ${l.unit_number || '—'}</div>
            </td>
            <td><span class="badge ${statusClass}">${statusFormatted}</span></td>
            <td>${formatDate(l.start_date)} – ${formatDate(l.end_date)}</td>
            <td><strong>$${formatCurrency(l.rent_amount_cents)}</strong>/mo</td>
            <td>$${formatCurrency(l.deposit_held_cents || 0)}</td>
            <td><a href="/leases/show?id=${encodeURIComponent(l.id)}" class="btn btn-sm btn-secondary">View Details</a></td>
          </tr>
        `;
      })
    : [html`
        <tr>
          <td colspan="6" class="text-center text-muted">No leases matching the selected criteria.</td>
        </tr>
      `];

  const unitOptions = units.map((u) => html`<option value="${u.id}">Unit ${u.unit_number} (${u.status})</option>`);
  const contactOptions = contacts.map((c) => html`<option value="${c.id}">${c.last_name}, ${c.first_name}</option>`);

  const now = new Date();
  const defaultStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const nextYear = new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), 0));
  const defaultEnd = `${nextYear.getUTCFullYear()}-${String(nextYear.getUTCMonth() + 1).padStart(2, '0')}-${String(nextYear.getUTCDate()).padStart(2, '0')}`;

  const content = html`
    <div class="page-header">
      <div>
        <h1 class="page-title">Lease Agreements</h1>
        <p class="page-subtitle">Track lease contracts, rent amounts, terms, and occupants.</p>
      </div>
      <button class="btn btn-primary" onclick="document.getElementById('addLeaseModal').showModal()">+ New Lease</button>
    </div>

    ${errorAlert}

    <!-- Filters Bar -->
    <div class="filter-bar card">
      <div class="filter-pills">
        <a href="/leases" class="filter-pill ${!statusFilter ? 'active' : ''}">All</a>
        <a href="/leases?status=active" class="filter-pill ${statusFilter === 'active' ? 'active' : ''}">Active</a>
        <a href="/leases?status=draft" class="filter-pill ${statusFilter === 'draft' ? 'active' : ''}">Draft</a>
        <a href="/leases?status=month_to_month" class="filter-pill ${statusFilter === 'month_to_month' ? 'active' : ''}">Month-to-Month</a>
        <a href="/leases?status=expiring" class="filter-pill ${statusFilter === 'expiring' ? 'active' : ''}">Expiring</a>
        <a href="/leases?status=terminated" class="filter-pill ${statusFilter === 'terminated' ? 'active' : ''}">Terminated</a>
      </div>
    </div>

    <div class="card">
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Property / Unit</th>
              <th>Status</th>
              <th>Term Dates</th>
              <th>Monthly Rent</th>
              <th>Deposit Held</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${leaseRows}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal: New Lease -->
    <dialog id="addLeaseModal" class="modal">
      <form method="POST" action="/leases" class="modal-box">
        ${csrfField(csrfToken)}
        <input type="hidden" name="action" value="create_lease">
        <div class="modal-header">
          <h3>Create Lease Agreement</h3>
          <button type="button" class="btn-close" onclick="document.getElementById('addLeaseModal').close()">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group col-6">
              <label class="form-label" for="unit_id">Select Unit *</label>
              <select class="form-select" id="unit_id" name="unit_id" required>
                <option value="">-- Choose Unit --</option>
                ${unitOptions}
              </select>
            </div>
            <div class="form-group col-6">
              <label class="form-label" for="contact_id">Primary Tenant</label>
              <select class="form-select" id="contact_id" name="contact_id">
                <option value="">-- Select Contact --</option>
                ${contactOptions}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group col-6">
              <label class="form-label" for="start_date">Start Date *</label>
              <input class="form-input" type="date" id="start_date" name="start_date" required value="${defaultStart}">
            </div>
            <div class="form-group col-6">
              <label class="form-label" for="end_date">End Date *</label>
              <input class="form-input" type="date" id="end_date" name="end_date" required value="${defaultEnd}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group col-6">
              <label class="form-label" for="rent_amount">Monthly Rent ($) *</label>
              <input class="form-input" type="number" id="rent_amount" name="rent_amount" step="0.01" required placeholder="1500.00">
            </div>
            <div class="form-group col-6">
              <label class="form-label" for="security_deposit">Security Deposit ($)</label>
              <input class="form-input" type="number" id="security_deposit" name="security_deposit" step="0.01" placeholder="1500.00">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group col-4">
              <label class="form-label" for="rent_due_day">Rent Due Day</label>
              <input class="form-input" type="number" id="rent_due_day" name="rent_due_day" value="1" min="1" max="28">
            </div>
            <div class="form-group col-4">
              <label class="form-label" for="late_fee_grace_days">Grace Days</label>
              <input class="form-input" type="number" id="late_fee_grace_days" name="late_fee_grace_days" value="5">
            </div>
            <div class="form-group col-4">
              <label class="form-label" for="late_fee_amount">Late Fee ($)</label>
              <input class="form-input" type="number" id="late_fee_amount" name="late_fee_amount" value="50.00" step="0.01">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('addLeaseModal').close()">Cancel</button>
          <button type="submit" class="btn btn-primary">Create Agreement</button>
        </div>
      </form>
    </dialog>
  `;

  return {
    title: 'Lease Agreements',
    content
  };
}
