import { html, raw, SafeHtml } from '../lib/html.js';
import { FlashMessage } from '../lib/session.js';

export function renderFlash(messages: FlashMessage[]): SafeHtml {
  if (!messages || messages.length === 0) {
    return raw('');
  }

  const items = messages.map((msg) => {
    let typeClass = 'alert-info';
    if (msg.type === 'success') typeClass = 'alert-success';
    else if (msg.type === 'error') typeClass = 'alert-danger';
    else if (msg.type === 'warning') typeClass = 'alert-warning';

    return html`<div class="alert ${typeClass}">${msg.message}</div>`;
  });

  return html`${items}`;
}
