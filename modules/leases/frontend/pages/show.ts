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
  const id = ctx.query['id'] || '';
  if (!id) {
    return { redirect: '/leases', content: '' };
  }

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
      if (action === 'activate_lease') {
        await ctx.api.post(`/api/v1/leases/${encodeURIComponent(id)}/activate`, {});
        ctx.session.addFlash('success', 'Lease activated successfully');
        return { redirect: `/leases/show?id=${encodeURIComponent(id)}`, content: '' };
      } else if (action === 'terminate_lease') {
        await ctx.api.post(`/api/v1/leases/${encodeURIComponent(id)}/terminate`, {});
        ctx.session.addFlash('success', 'Lease terminated');
        return { redirect: `/leases/show?id=${encodeURIComponent(id)}`, content: '' };
      } else if (action === 'add_signatory') {
        await ctx.api.post(`/api/v1/leases/${encodeURIComponent(id)}/contacts`, {
          contact_id: ctx.body['contact_id'] ?? '',
          role: ctx.body['role'] ?? 'occupant',
          is_financially_responsible: ctx.body['is_financially_responsible'] === '1' || ctx.body['is_financially_responsible'] === true
        });
        ctx.session.addFlash('success', 'Signatory added');
        return { redirect: `/leases/show?id=${encodeURIComponent(id)}`, content: '' };
      }
    } catch (err: any) {
      error = err.message;
    }
  }

  let lease: any = null;
  let contacts: any[] = [];

  try {
    const res = await ctx.api.get(`/api/v1/leases/${encodeURIComponent(id)}`);
    lease = res?.data?.lease ?? null;

    const contRes = await ctx.api.get('/api/v1/contacts');
    contacts = contRes?.data?.contacts || [];
  } catch (err: any) {
    error = error || err.message;
  }

  if (!lease) {
    return {
      title: 'Lease Not Found',
      content: html`
        <div class="alert alert-danger">Lease agreement not found.</div>
        <p><a href="/leases" class="btn btn-secondary">← Back to Leases</a></p>
      `
    };
  }

  const errorAlert = error
    ? html`<div class="alert alert-danger" style="margin-bottom: 1.5rem;">${error}</div>`
    : raw('');

  const statusFormatted = lease.status ? lease.status.charAt(0).toUpperCase() + lease.status.slice(1) : '';

  const signatoryRows = (lease.contacts || []).length > 0
    ? lease.contacts.map((sc: any) => {
        const roleFormatted = (sc.role || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
        return html`
          <tr>
            <td><strong><a href="/contacts/show?id=${encodeURIComponent(sc.contact_id)}">${sc.last_name}, ${sc.first_name}</a></strong></td>
            <td><span class="badge">${roleFormatted}</span></td>
            <td>${sc.phone || '—'}</td>
            <td>${sc.is_financially_responsible ? html`<span class="badge badge-success">Yes</span>` : html`<span class="badge">No</span>`}</td>
          </tr>
        `;
      })
    : [html`
        <tr>
          <td colspan="4" class="text-center text-muted">No occupants assigned yet.</td>
        </tr>
      `];

  const contactOptions = contacts.map((c) => html`<option value="${c.id}">${c.last_name}, ${c.first_name} (${c.contact_type})</option>`);

  const content = html`
    <div class="page-header">
      <div>
        <a href="/leases" class="text-muted">← Back to Leases</a>
        <h1 class="page-title">${lease.property_name || 'Property'} – Unit ${lease.unit_number || ''}</h1>
        <p class="page-subtitle">
          Status: <span class="badge badge-success">${statusFormatted}</span> •
          Term: ${formatDate(lease.start_date)} to ${formatDate(lease.end_date)}
        </p>
      </div>
      <div class="btn-group">
        <a href="/accounting/ledger-detail?lease_id=${encodeURIComponent(id)}" class="btn btn-secondary">Tenant Ledger</a>
        ${lease.status === 'draft'
          ? html`
            <form method="POST" action="/leases/show?id=${encodeURIComponent(id)}" style="display:inline;">
              ${csrfField(csrfToken)}
              <input type="hidden" name="action" value="activate_lease">
              <button type="submit" class="btn btn-primary">Activate Lease</button>
            </form>
          `
          : raw('')}
        ${lease.status === 'active' || lease.status === 'month_to_month'
          ? html`
            <form method="POST" action="/leases/show?id=${encodeURIComponent(id)}" style="display:inline;">
              ${csrfField(csrfToken)}
              <input type="hidden" name="action" value="terminate_lease">
              <button type="submit" class="btn btn-danger" onclick="return confirm('Terminate this lease?')">Terminate Lease</button>
            </form>
          `
          : raw('')}
      </div>
    </div>

    ${errorAlert}

    <div class="grid-2-col">
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Financial Terms</h2>
        </div>
        <div class="detail-list">
          <div class="detail-item">
            <span class="detail-label">Monthly Rent</span>
            <span class="detail-value"><strong>$${formatCurrency(lease.rent_amount_cents)}</strong></span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Security Deposit Required</span>
            <span class="detail-value">$${formatCurrency(lease.security_deposit_cents)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Deposit Held in Trust</span>
            <span class="detail-value">$${formatCurrency(lease.deposit_held_cents || 0)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Rent Due Day</span>
            <span class="detail-value">Day ${lease.rent_due_day} of each month</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Late Fee Policy</span>
            <span class="detail-value">$${formatCurrency(lease.late_fee_amount_cents || 0)} after ${lease.late_fee_grace_days} grace days</span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
          <h2 class="card-title">Tenants & Occupants</h2>
          <button class="btn btn-sm btn-secondary" onclick="document.getElementById('addSignatoryModal').showModal()">+ Add Person</button>
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Phone</th>
                <th>Financial</th>
              </tr>
            </thead>
            <tbody>
              ${signatoryRows}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Modal: Add Signatory -->
    <dialog id="addSignatoryModal" class="modal">
      <form method="POST" action="/leases/show?id=${encodeURIComponent(id)}" class="modal-box">
        ${csrfField(csrfToken)}
        <input type="hidden" name="action" value="add_signatory">
        <div class="modal-header">
          <h3>Add Person to Lease</h3>
          <button type="button" class="btn-close" onclick="document.getElementById('addSignatoryModal').close()">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label" for="signatory_contact_id">Select Contact *</label>
            <select class="form-select" id="signatory_contact_id" name="contact_id" required>
              <option value="">-- Choose Contact --</option>
              ${contactOptions}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="signatory_role">Role on Lease *</label>
            <select class="form-select" id="signatory_role" name="role" required>
              <option value="primary_tenant">Primary Tenant</option>
              <option value="co_tenant">Co-Tenant</option>
              <option value="guarantor">Guarantor</option>
              <option value="occupant">Occupant (Non-Signer)</option>
            </select>
          </div>
          <div class="form-group" style="display:flex; align-items:center; gap: 0.5rem;">
            <input type="checkbox" id="is_financially_responsible" name="is_financially_responsible" value="1" checked>
            <label for="is_financially_responsible">Financially Responsible for Rent</label>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('addSignatoryModal').close()">Cancel</button>
          <button type="submit" class="btn btn-primary">Add to Agreement</button>
        </div>
      </form>
    </dialog>
  `;

  return {
    title: `Lease: Unit ${lease.unit_number || ''}`,
    content
  };
}
