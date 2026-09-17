import { PageContext, PageResult } from '../../../../web/lib/page-context.js';
import { html, raw, SafeHtml } from '../../../../web/lib/html.js';
import { csrfField, validateCsrf } from '../../../../web/lib/csrf.js';

export async function handle(ctx: PageContext): Promise<PageResult> {
  const id = ctx.query['id'] || '';
  if (!id) {
    return { redirect: '/properties', content: '' };
  }

  const csrfToken = ctx.session.getCsrfToken();
  let error: string | null = null;

  if (ctx.method === 'POST' && ctx.body['action'] === 'create_unit') {
    if (!validateCsrf(csrfToken, ctx.body['csrf_token'])) {
      return {
        title: 'Error',
        status: 403,
        content: html`<div class="alert alert-danger">CSRF token validation failed.</div>`
      };
    }

    try {
      const marketRent = parseFloat(ctx.body['market_rent'] ?? '0');
      const targetDeposit = parseFloat(ctx.body['target_deposit'] ?? '0');

      await ctx.api.post('/api/v1/properties/units', {
        property_id: id,
        unit_number: ctx.body['unit_number'] ?? '',
        status: ctx.body['status'] ?? 'vacant',
        bedrooms: parseInt(ctx.body['bedrooms'] ?? '1', 10),
        bathrooms: parseFloat(ctx.body['bathrooms'] ?? '1.0'),
        square_feet: ctx.body['square_feet'] ? parseInt(ctx.body['square_feet'], 10) : null,
        market_rent_cents: Math.round(marketRent * 100),
        target_deposit_cents: Math.round(targetDeposit * 100)
      });
      ctx.session.addFlash('success', 'Unit added successfully');
      return { redirect: `/properties/show?id=${encodeURIComponent(id)}`, content: '' };
    } catch (err: any) {
      error = err.message;
    }
  }

  let property: any = null;
  let units: any[] = [];

  try {
    const res = await ctx.api.get(`/api/v1/properties/${encodeURIComponent(id)}`);
    property = res?.data?.property ?? null;
    units = res?.data?.units ?? [];
  } catch (err: any) {
    error = error || err.message;
  }

  if (!property) {
    return {
      title: 'Property Not Found',
      content: html`
        <div class="alert alert-danger">Property not found.</div>
        <p><a href="/properties" class="btn btn-secondary">← Back to Properties</a></p>
      `
    };
  }

  const errorAlert = error
    ? html`<div class="alert alert-danger" style="margin-bottom: 1.5rem;">${error}</div>`
    : raw('');

  const unitRows = units.length > 0
    ? units.map((u) => {
        let statusClass = 'badge-info';
        if (u.status === 'occupied') statusClass = 'badge-success';
        else if (u.status === 'vacant') statusClass = 'badge-warning';
        else if (u.status === 'turnover' || u.status === 'maintenance_hold') statusClass = 'badge-danger';

        const statusFormatted = (u.status || '').replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());

        return html`
          <tr>
            <td><strong>Unit ${u.unit_number}</strong></td>
            <td><span class="badge ${statusClass}">${statusFormatted}</span></td>
            <td>${u.bedrooms} bd / ${Number(u.bathrooms).toFixed(1)} ba</td>
            <td>${u.square_feet ? `${u.square_feet.toLocaleString()} sqft` : '—'}</td>
            <td><strong>$${((u.market_rent_cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>/mo</td>
            <td>$${(((u.target_deposit_cents || 0) / 100)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        `;
      })
    : [html`
        <tr>
          <td colspan="6" class="text-center text-muted">No units configured for this property. Add a unit above.</td>
        </tr>
      `];

  const propTypeFormatted = (property.property_type || '').replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());

  const content = html`
    <div class="page-header">
      <div>
        <a href="/properties" class="text-muted">← Back to Properties</a>
        <h1 class="page-title">${property.name}</h1>
        <p class="page-subtitle">
          ${property.address_line1}, ${property.city}, ${property.state} ${property.postal_code}
          • <span class="badge">${propTypeFormatted}</span>
        </p>
      </div>
      <button class="btn btn-primary" onclick="document.getElementById('addUnitModal').showModal()">+ Add Unit</button>
    </div>

    ${errorAlert}

    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Rentable Units (${units.length})</h2>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Unit #</th>
              <th>Status</th>
              <th>Bed / Bath</th>
              <th>Sq Ft</th>
              <th>Market Rent</th>
              <th>Deposit</th>
            </tr>
          </thead>
          <tbody>
            ${unitRows}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal: Add Unit -->
    <dialog id="addUnitModal" class="modal">
      <form method="POST" action="/properties/show?id=${encodeURIComponent(id)}" class="modal-box">
        ${csrfField(csrfToken)}
        <input type="hidden" name="action" value="create_unit">
        <div class="modal-header">
          <h3>Add Unit to ${property.name}</h3>
          <button type="button" class="btn-close" onclick="document.getElementById('addUnitModal').close()">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group col-6">
              <label class="form-label" for="unit_number">Unit Number / Identifier *</label>
              <input class="form-input" type="text" id="unit_number" name="unit_number" required placeholder="e.g. 101, A, Main">
            </div>
            <div class="form-group col-6">
              <label class="form-label" for="status">Status</label>
              <select class="form-select" id="status" name="status">
                <option value="vacant">Vacant</option>
                <option value="occupied">Occupied</option>
                <option value="notice_given">Notice Given</option>
                <option value="turnover">Turnover</option>
                <option value="maintenance_hold">Maintenance Hold</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group col-4">
              <label class="form-label" for="bedrooms">Bedrooms</label>
              <input class="form-input" type="number" id="bedrooms" name="bedrooms" value="1" min="0" required>
            </div>
            <div class="form-group col-4">
              <label class="form-label" for="bathrooms">Bathrooms</label>
              <input class="form-input" type="number" id="bathrooms" name="bathrooms" value="1.0" step="0.5" min="0" required>
            </div>
            <div class="form-group col-4">
              <label class="form-label" for="square_feet">Square Feet</label>
              <input class="form-input" type="number" id="square_feet" name="square_feet" placeholder="e.g. 850">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group col-6">
              <label class="form-label" for="market_rent">Market Monthly Rent ($) *</label>
              <input class="form-input" type="number" id="market_rent" name="market_rent" step="0.01" required placeholder="1450.00">
            </div>
            <div class="form-group col-6">
              <label class="form-label" for="target_deposit">Security Deposit Target ($)</label>
              <input class="form-input" type="number" id="target_deposit" name="target_deposit" step="0.01" placeholder="1450.00">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('addUnitModal').close()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Unit</button>
        </div>
      </form>
    </dialog>
  `;

  return {
    title: property.name,
    content
  };
}
