import { PageContext, PageResult } from '../../../../web/lib/page-context.js';
import { html, raw, SafeHtml } from '../../../../web/lib/html.js';
import { csrfField, validateCsrf } from '../../../../web/lib/csrf.js';

/**
 * Format integer cents into USD currency string.
 *
 * @param cents - Value in integer cents.
 * @returns Formatted currency string (e.g. '1,250.00').
 */
function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Test trade specialty compatibility against work order category.
 *
 * @param vendorSpecialty - Vendor trade specialty.
 * @param category - Work order category.
 * @returns True if compatible or general contractor.
 */
function matchesSpecialty(vendorSpecialty?: string | null, category?: string | null): boolean {
  if (!vendorSpecialty || !category) return false;
  const spec = vendorSpecialty.toLowerCase().trim();
  const cat = category.toLowerCase().trim();
  if (spec === cat) return true;
  if (spec === 'general contractor' || spec === 'general repair' || spec === 'handyman') return true;
  if ((cat === 'cosmetic' || cat === 'other') && (spec === 'make_ready' || spec === 'turnkey' || spec === 'cleaning' || spec === 'painting' || spec === 'general contractor')) return true;
  return spec.includes(cat) || cat.includes(spec);
}

/**
 * Web request handler for viewing and managing individual work order tickets.
 *
 * @param ctx - Page request context including session, query, and body.
 * @returns Rendered HTML page or redirect response.
 */
export async function handle(ctx: PageContext): Promise<PageResult> {
  const id = ctx.query['id'] || '';
  if (!id) {
    return { redirect: '/maintenance', content: '' };
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
      if (action === 'update_status') {
        await ctx.api.put(`/api/v1/maintenance/work-orders/${encodeURIComponent(id)}`, {
          status: ctx.body['status'] ?? 'open',
          vendor_contact_id: ctx.body['vendor_contact_id'] || null
        });
        ctx.session.addFlash('success', 'Work order status updated');
        return { redirect: `/maintenance/show?id=${encodeURIComponent(id)}`, content: '' };
      } else if (action === 'complete_order') {
        const costCents = Math.round(parseFloat(ctx.body['actual_cost'] ?? '0') * 100);
        await ctx.api.post(`/api/v1/maintenance/work-orders/${encodeURIComponent(id)}/complete`, {
          actual_cost_cents: costCents
        });
        ctx.session.addFlash('success', 'Work order marked completed and expense recorded');
        return { redirect: `/maintenance/show?id=${encodeURIComponent(id)}`, content: '' };
      }
    } catch (err: any) {
      error = err.message;
    }
  }

  let workOrder: any = null;
  let vendors: any[] = [];

  try {
    const res = await ctx.api.get(`/api/v1/maintenance/work-orders/${encodeURIComponent(id)}`);
    workOrder = res?.data?.workOrder ?? null;

    const vendRes = await ctx.api.get('/api/v1/contacts?type=vendor');
    vendors = vendRes?.data?.contacts || [];
  } catch (err: any) {
    error = error || err.message;
  }

  if (!workOrder) {
    return {
      title: 'Work Order Not Found',
      content: html`
        <div class="alert alert-danger">Work order not found.</div>
        <p><a href="/maintenance" class="btn btn-secondary">← Back to Work Orders</a></p>
      `
    };
  }

  const errorAlert = error
    ? html`<div class="alert alert-danger" style="margin-bottom: 1.5rem;">${error}</div>`
    : raw('');

  const statusFormatted = (workOrder.status || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
  const prioFormatted = workOrder.priority ? workOrder.priority.charAt(0).toUpperCase() + workOrder.priority.slice(1) : '';
  const catFormatted = workOrder.category ? workOrder.category.charAt(0).toUpperCase() + workOrder.category.slice(1) : '';

  const vendorOptions = vendors.map((v) => {
    const isSelected = workOrder.vendor_contact_id === v.id;
    const specialtyText = v.vendor_specialty ? ` [${v.vendor_specialty}]` : '';
    const w9Text = v.w9_received ? ' [W-9 ✓]' : ' [W-9 Pending]';
    return html`
      <option value="${v.id}" ${isSelected ? raw('selected') : raw('')}>
        ${v.last_name}, ${v.first_name}${v.company_name ? ` (${v.company_name})` : ''}${specialtyText}${w9Text}
      </option>
    `;
  });

  const eligibleDispatchVendors = vendors.filter((v) => {
    return v.w9_received === 1 && matchesSpecialty(v.vendor_specialty, workOrder.category);
  });

  const dispatchVendorOptions = eligibleDispatchVendors.length > 0
    ? eligibleDispatchVendors.map((v) => {
        const isSelected = workOrder.vendor_contact_id === v.id;
        const specialtyText = v.vendor_specialty ? ` [${v.vendor_specialty}]` : '';
        return html`
          <option value="${v.id}" ${isSelected ? raw('selected') : raw('')}>
            ${v.last_name}, ${v.first_name}${v.company_name ? ` (${v.company_name})` : ''}${specialtyText} [W-9 ✓]
          </option>
        `;
      })
    : [html`<option value="" disabled>No W-9 verified vendors matching category "${catFormatted}"</option>`];

  const statuses = [
    { value: 'open', label: 'Open' },
    { value: 'assigned', label: 'Assigned to Vendor' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'on_hold', label: 'On Hold / Awaiting Parts' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' }
  ];

  const statusOptions = statuses.map((s) => {
    const isSelected = workOrder.status === s.value;
    return html`<option value="${s.value}" ${isSelected ? raw('selected') : raw('')}>${s.label}</option>`;
  });

  const descHtml = workOrder.description
    ? raw(String(workOrder.description).split(/\r?\n/).map((line) => html`${line}`.toString()).join('<br>'))
    : html`<span class="text-muted">No details provided.</span>`;

  const isDispatchable = ['open', 'assigned', 'on_hold'].includes(workOrder.status);
  const isCompletable = workOrder.status !== 'completed' && workOrder.status !== 'cancelled';

  const content = html`
    <div class="page-header">
      <div>
        <a href="/maintenance" class="text-muted">← Back to Work Orders</a>
        <h1 class="page-title">${workOrder.title}</h1>
        <p class="page-subtitle">
          Ticket #${workOrder.id.slice(0, 8)} •
          ${workOrder.property_name || 'Property'}
          ${workOrder.unit_number ? html` (Unit ${workOrder.unit_number})` : raw('')}
        </p>
      </div>
      <div class="btn-group">
        ${isDispatchable
          ? html`<button class="btn btn-secondary" onclick="document.getElementById('dispatchModal').showModal()">⚡ Dispatch Vendor</button>`
          : raw('')}
        ${isCompletable
          ? html`<button class="btn btn-primary" onclick="document.getElementById('completeOrderModal').showModal()">✓ Complete & Record Cost</button>`
          : workOrder.status === 'completed'
            ? html`<span class="badge badge-success" style="padding: 0.5rem 1rem; font-size: 1rem;">Completed</span>`
            : html`<span class="badge badge-danger" style="padding: 0.5rem 1rem; font-size: 1rem;">Cancelled</span>`}
      </div>
    </div>

    ${errorAlert}

    <div class="grid-2-col">
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Issue Details</h2>
        </div>
        <div class="detail-list">
          <div class="detail-item">
            <span class="detail-label">Status</span>
            <span class="detail-value">
              <span class="badge badge-${workOrder.status === 'completed' ? 'success' : 'info'}">
                ${statusFormatted}
              </span>
            </span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Priority</span>
            <span class="detail-value">
              <span class="badge badge-${workOrder.priority === 'emergency' ? 'danger' : 'info'}">
                ${prioFormatted}
              </span>
            </span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Trade / Category</span>
            <span class="detail-value">${catFormatted}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Permission to Enter</span>
            <span class="detail-value">${workOrder.permission_to_enter ? 'Yes – Granted' : 'No – Requires Appointment'}</span>
          </div>
          ${workOrder.entry_instructions
            ? html`
              <div class="detail-item">
                <span class="detail-label">Entry Instructions</span>
                <span class="detail-value">${workOrder.entry_instructions}</span>
              </div>
            `
            : raw('')}
          <div class="detail-item">
            <span class="detail-label">Estimated Cost</span>
            <span class="detail-value">$${formatCurrency(workOrder.estimated_cost_cents || 0)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Actual Final Cost</span>
            <span class="detail-value font-bold text-danger">$${formatCurrency(workOrder.actual_cost_cents || 0)}</span>
          </div>
        </div>
        <div style="margin-top: 1.5rem;">
          <strong>Description / Notes:</strong>
          <p style="margin-top: 0.5rem; line-height: 1.5;">${descHtml}</p>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Dispatch & Workflow</h2>
        </div>
        <form method="POST" action="/maintenance/show?id=${encodeURIComponent(id)}">
          ${csrfField(csrfToken)}
          <input type="hidden" name="action" value="update_status">
          <div class="form-group">
            <label class="form-label" for="status">Update Status</label>
            <select class="form-select" id="status" name="status">
              ${statusOptions}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="vendor_contact_id">Assigned Vendor</label>
            <select class="form-select" id="vendor_contact_id" name="vendor_contact_id">
              <option value="">-- None / Self Managed --</option>
              ${vendorOptions}
            </select>
          </div>
          <button type="submit" class="btn btn-secondary">Update Status</button>
        </form>
      </div>
    </div>

    <!-- Modal: Dispatch Vendor -->
    <dialog id="dispatchModal" class="modal">
      <form method="POST" action="/maintenance/show?id=${encodeURIComponent(id)}" class="modal-box">
        ${csrfField(csrfToken)}
        <input type="hidden" name="action" value="update_status">
        <input type="hidden" name="status" value="assigned">
        <div class="modal-header">
          <h3>Dispatch Vendor for Work Order</h3>
          <button type="button" class="btn-close" onclick="document.getElementById('dispatchModal').close()">✕</button>
        </div>
        <div class="modal-body">
          <p>Assign a qualified trade contractor and transition this ticket to <strong>Assigned to Vendor</strong>.</p>
          <div class="form-group" style="margin-top: 1rem;">
            <label class="form-label" for="dispatch_vendor_id">Select Qualified Vendor / Contractor *</label>
            <select class="form-select" id="dispatch_vendor_id" name="vendor_contact_id" required>
              <option value="">-- Choose Trade Vendor --</option>
              ${dispatchVendorOptions}
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('dispatchModal').close()">Cancel</button>
          <button type="submit" class="btn btn-primary">Dispatch Work Order</button>
        </div>
      </form>
    </dialog>

    <!-- Modal: Complete Work Order -->
    <dialog id="completeOrderModal" class="modal">
      <form method="POST" action="/maintenance/show?id=${encodeURIComponent(id)}" class="modal-box">
        ${csrfField(csrfToken)}
        <input type="hidden" name="action" value="complete_order">
        <div class="modal-header">
          <h3>Complete Maintenance Work Order</h3>
          <button type="button" class="btn-close" onclick="document.getElementById('completeOrderModal').close()">✕</button>
        </div>
        <div class="modal-body">
          <p>Marking this work order as complete will record a repair operating expense under Schedule E in the property ledger if an actual cost is provided.</p>
          <div class="form-group" style="margin-top: 1rem;">
            <label class="form-label" for="actual_cost">Actual Invoice / Repair Cost ($) *</label>
            <input class="form-input" type="number" id="actual_cost" name="actual_cost" step="0.01" required value="${((workOrder.estimated_cost_cents || 0) / 100).toFixed(2)}">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('completeOrderModal').close()">Cancel</button>
          <button type="submit" class="btn btn-primary">Complete & Post Expense</button>
        </div>
      </form>
    </dialog>
  `;

  return {
    title: `Work Order #${workOrder.id.slice(0, 8)}`,
    content
  };
}
