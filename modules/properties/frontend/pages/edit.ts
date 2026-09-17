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

  if (ctx.method === 'POST') {
    if (!validateCsrf(csrfToken, ctx.body['csrf_token'])) {
      return {
        title: 'Error',
        status: 403,
        content: html`<div class="alert alert-danger">CSRF token validation failed.</div>`
      };
    }

    try {
      await ctx.api.put(`/api/v1/properties/${encodeURIComponent(id)}`, {
        name: ctx.body['name'] ?? '',
        property_type: ctx.body['property_type'] ?? 'single_family',
        address_line1: ctx.body['address_line1'] ?? '',
        city: ctx.body['city'] ?? '',
        state: ctx.body['state'] ?? '',
        postal_code: ctx.body['postal_code'] ?? '',
        portfolio_id: ctx.body['portfolio_id'] ? ctx.body['portfolio_id'] : null,
        year_built: ctx.body['year_built'] ? parseInt(ctx.body['year_built'], 10) : null
      });
      ctx.session.addFlash('success', 'Property updated successfully');
      return { redirect: `/properties/show?id=${encodeURIComponent(id)}`, content: '' };
    } catch (err: any) {
      error = err.message;
    }
  }

  let property: any = null;
  let portfolios: any[] = [];

  try {
    const res = await ctx.api.get(`/api/v1/properties/${encodeURIComponent(id)}`);
    property = res?.data?.property ?? null;

    const portRes = await ctx.api.get('/api/v1/properties/portfolios');
    portfolios = portRes?.data?.portfolios ?? [];
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

  const propertyTypes = ['single_family', 'multi_family', 'condo', 'townhouse', 'commercial'];
  const typeOptions = propertyTypes.map((t) => {
    const isSelected = property.property_type === t;
    const label = t.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
    return html`<option value="${t}" ${isSelected ? raw('selected') : raw('')}>${label}</option>`;
  });

  const portfolioOptions = portfolios.map((p) => {
    const isSelected = property.portfolio_id === p.id;
    return html`<option value="${p.id}" ${isSelected ? raw('selected') : raw('')}>${p.name}</option>`;
  });

  const content = html`
    <div class="page-header">
      <div>
        <a href="/properties/show?id=${encodeURIComponent(id)}" class="text-muted">← Back to Property</a>
        <h1 class="page-title">Edit Property</h1>
      </div>
    </div>

    ${errorAlert}

    <div class="card" style="max-width: 680px;">
      <form method="POST" action="/properties/edit?id=${encodeURIComponent(id)}">
        ${csrfField(csrfToken)}
        <div class="form-group">
          <label class="form-label" for="name">Property Name *</label>
          <input class="form-input" type="text" id="name" name="name" required value="${property.name}">
        </div>
        <div class="form-group">
          <label class="form-label" for="property_type">Property Type *</label>
          <select class="form-select" id="property_type" name="property_type" required>
            ${typeOptions}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="address_line1">Street Address *</label>
          <input class="form-input" type="text" id="address_line1" name="address_line1" required value="${property.address_line1}">
        </div>
        <div class="form-row">
          <div class="form-group col-6">
            <label class="form-label" for="city">City *</label>
            <input class="form-input" type="text" id="city" name="city" required value="${property.city}">
          </div>
          <div class="form-group col-3">
            <label class="form-label" for="state">State *</label>
            <input class="form-input" type="text" id="state" name="state" required value="${property.state}" maxlength="2">
          </div>
          <div class="form-group col-3">
            <label class="form-label" for="postal_code">Zip Code *</label>
            <input class="form-input" type="text" id="postal_code" name="postal_code" required value="${property.postal_code}">
          </div>
        </div>
        ${portfolios.length > 0
          ? html`
            <div class="form-group">
              <label class="form-label" for="portfolio_id">Portfolio / Entity</label>
              <select class="form-select" id="portfolio_id" name="portfolio_id">
                <option value="">-- No Portfolio Assigned --</option>
                ${portfolioOptions}
              </select>
            </div>
          `
          : raw('')}
        <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
          <button type="submit" class="btn btn-primary">Save Changes</button>
          <a href="/properties/show?id=${encodeURIComponent(id)}" class="btn btn-secondary">Cancel</a>
        </div>
      </form>
    </div>
  `;

  return {
    title: `Edit ${property.name}`,
    content
  };
}
