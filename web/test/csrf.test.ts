import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { generateCsrfToken, validateCsrf, csrfField } from '../lib/csrf.js';

describe('Web Presentation - CSRF Protection Subsystem', () => {
  it('generates a 64-character hexadecimal cryptographic token', () => {
    const token = generateCsrfToken();
    assert.equal(typeof token, 'string');
    assert.equal(token.length, 64);
    assert.match(token, /^[0-9a-f]{64}$/);
  });

  it('validates matching tokens successfully using constant-time equality', () => {
    const token = generateCsrfToken();
    assert.equal(validateCsrf(token, token), true);
  });

  it('rejects mismatched tokens', () => {
    const token1 = generateCsrfToken();
    const token2 = generateCsrfToken();
    assert.equal(validateCsrf(token1, token2), false);
  });

  it('rejects null, undefined, or malformed input without throwing', () => {
    const valid = generateCsrfToken();
    assert.equal(validateCsrf(valid, null), false);
    assert.equal(validateCsrf(valid, undefined), false);
    assert.equal(validateCsrf(valid, ''), false);
    assert.equal(validateCsrf(valid, 'short'), false);
    assert.equal(validateCsrf('', valid), false);
  });

  it('renders a hidden form input with escaped token', () => {
    const token = generateCsrfToken();
    const field = csrfField(token);
    assert.equal(
      field.toString(),
      `<input type="hidden" name="csrf_token" value="${token}">`
    );
  });
});
