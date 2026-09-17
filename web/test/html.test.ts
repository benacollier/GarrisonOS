import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { html, raw, escapeHtml, SafeHtml } from '../lib/html.js';

describe('Web Presentation - Safe HTML Generation', () => {
  it('escapes dangerous HTML special characters by default', () => {
    const malicious = '<script>alert("xss")</script>';
    const template = html`<div>${malicious}</div>`;
    assert.equal(
      template.toString(),
      '<div>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</div>'
    );
  });

  it('preserves raw safe HTML without double escaping', () => {
    const safeContent = raw('<strong>Bold &amp; Protected</strong>');
    const template = html`<p>${safeContent}</p>`;
    assert.equal(template.toString(), '<p><strong>Bold &amp; Protected</strong></p>');
  });

  it('handles nested templates and arrays of SafeHtml elements', () => {
    const items = ['Alpha', 'Beta', 'Gamma'].map((item) => html`<li>${item}</li>`);
    const list = html`<ul>${items}</ul>`;
    assert.equal(list.toString(), '<ul><li>Alpha</li><li>Beta</li><li>Gamma</li></ul>');
  });

  it('correctly handles numbers, booleans, and nullish values', () => {
    const template = html`<div>Count: ${42}, Active: ${true}, Null: ${null}, Undefined: ${undefined}</div>`;
    assert.equal(template.toString(), '<div>Count: 42, Active: true, Null: , Undefined: </div>');
  });

  it('escapes quotes in attribute contexts', () => {
    const maliciousAttr = 'val" onfocus="alert(1)';
    const template = html`<input value="${maliciousAttr}">`;
    assert.equal(
      template.toString(),
      '<input value="val&quot; onfocus=&quot;alert(1)">'
    );
  });
});
