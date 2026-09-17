import { PageContext, PageResult } from '../../../../web/lib/page-context.js';
import { html, raw, SafeHtml } from '../../../../web/lib/html.js';

export async function handle(ctx: PageContext): Promise<PageResult> {
  const id = ctx.query['id'] || '';
  if (!id) {
    return { redirect: '/contacts', content: '' };
  }

  let contact: any = null;
  let error: string | null = null;

  try {
    const res = await ctx.api.get(`/api/v1/contacts/${encodeURIComponent(id)}`);
    contact = res?.data?.contact ?? null;
  } catch (err: any) {
    error = err.message;
  }

  if (!contact) {
    return {
      title: 'Contact Not Found',
      content: html`
        <div class="alert alert-danger">Contact not found.</div>
        <p><a href="/contacts" class="btn btn-secondary">← Back to Contacts</a></p>
      `
    };
  }

  const typeFormatted = contact.contact_type
    ? contact.contact_type.charAt(0).toUpperCase() + contact.contact_type.slice(1)
    : '';

  const notesHtml = contact.notes
    ? raw(contact.notes.replace(/\r?\n/g, '<br>'))
    : html`<span class="text-muted">No notes recorded for this contact.</span>`;

  const content = html`
    <div class="page-header">
      <div>
        <a href="/contacts" class="text-muted">← Back to Contacts</a>
        <h1 class="page-title">${contact.first_name} ${contact.last_name}</h1>
        <p class="page-subtitle">
          <span class="badge">${typeFormatted}</span>
          ${contact.company_name ? html` • ${contact.company_name}` : raw('')}
        </p>
      </div>
    </div>

    <div class="grid-2-col">
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Contact Information</h2>
        </div>
        <div class="detail-list">
          <div class="detail-item">
            <span class="detail-label">Full Name</span>
            <span class="detail-value">${contact.first_name} ${contact.last_name}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Contact Type</span>
            <span class="detail-value">${typeFormatted}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Email</span>
            <span class="detail-value">${contact.email ? html`<a href="mailto:${contact.email}">${contact.email}</a>` : '—'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Primary Phone</span>
            <span class="detail-value">${contact.phone || '—'}</span>
          </div>
          ${contact.secondary_phone
            ? html`
              <div class="detail-item">
                <span class="detail-label">Secondary Phone</span>
                <span class="detail-value">${contact.secondary_phone}</span>
              </div>
            `
            : raw('')}
          ${contact.vendor_specialty
            ? html`
              <div class="detail-item">
                <span class="detail-label">Specialty</span>
                <span class="detail-value">${contact.vendor_specialty}</span>
              </div>
            `
            : raw('')}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Notes & Background</h2>
        </div>
        <div class="card-body">
          <p>${notesHtml}</p>
        </div>
      </div>
    </div>
  `;

  return {
    title: `${contact.first_name} ${contact.last_name}`,
    content
  };
}
