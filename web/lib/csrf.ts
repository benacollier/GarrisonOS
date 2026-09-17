import { randomBytes, timingSafeEqual } from 'node:crypto';
import { raw, SafeHtml } from './html.js';

/**
 * Generate a cryptographically secure 64-character hex CSRF token.
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Render a hidden CSRF token input field for HTML forms.
 *
 * @param token Cryptographic CSRF token.
 * @returns SafeHtml hidden input element.
 */
export function csrfField(token: string): SafeHtml {
  return raw(`<input type="hidden" name="csrf_token" value="${token}">`);
}

/**
 * Validate a candidate CSRF token against the session-stored token using timing-safe comparison.
 * Fails closed on empty, missing, or mismatched tokens.
 *
 * @param sessionToken Expected token from active session.
 * @param candidateToken Token submitted via form body or X-CSRF-Token header.
 * @returns True if tokens match exactly, false otherwise.
 */
export function validateCsrf(sessionToken: string | null | undefined, candidateToken: string | null | undefined): boolean {
  if (!sessionToken || !candidateToken) {
    return false;
  }

  const bufSession = Buffer.from(sessionToken, 'utf8');
  const bufCandidate = Buffer.from(candidateToken, 'utf8');

  if (bufSession.length !== bufCandidate.length) {
    return false;
  }

  return timingSafeEqual(bufSession, bufCandidate);
}
