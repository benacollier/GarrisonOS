import { IncomingMessage, ServerResponse } from 'node:http';
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

/**
 * Authenticated user profile stored in the web session.
 */
export interface SessionUser {
  /**
   * Unique user identifier.
   */
  id: string;

  /**
   * Primary email address.
   */
  email: string;

  /**
   * User first name.
   */
  first_name: string;

  /**
   * User surname.
   */
  last_name: string;

  /**
   * User system role ('owner' | 'manager' | 'assistant' | 'read_only').
   */
  role: string;

  /**
   * Associated operator isolation identifier.
   */
  operator_id: string;

  /**
   * Legacy alias for operator_id retained for backward compatibility.
   */
  tenant_id?: string;
}

/**
 * Ephemeral flash notification displayed on the subsequent page view.
 */
export interface FlashMessage {
  /**
   * Notification category.
   */
  type: 'success' | 'error' | 'warning' | 'info';

  /**
   * Alert message text.
   */
  message: string;
}

/**
 * Underlying structured data persisted within the HMAC-signed session cookie.
 */
export interface SessionData {
  /**
   * Active authenticated user, or null/undefined if unauthenticated.
   */
  user?: SessionUser | null;

  /**
   * JWT/HMAC Bearer authentication token used for API requests.
   */
  authToken?: string | null;

  /**
   * Selected operator identifier.
   */
  operatorId?: string | null;

  /**
   * Legacy alias for operatorId.
   */
  tenantId?: string | null;

  /**
   * Cryptographic CSRF token protecting state-modifying requests.
   */
  csrfToken?: string;

  /**
   * Pending flash messages to display to the user.
   */
  flashMessages?: FlashMessage[];

  /**
   * Arbitrary session attributes.
   */
  [key: string]: unknown;
}

const SESSION_COOKIE_NAME = 'garrison_session';
const NODE_ENV = process.env['NODE_ENV'] || 'development';
const TEST_ONLY_SECRET = 'garrison-os-test-only-secret';
const DEFAULT_SECRET = process.env['APP_SECRET'] || (
  NODE_ENV === 'test' ? TEST_ONLY_SECRET : 'garrison-os-development-secret'
);

if (NODE_ENV === 'production' && !process.env['APP_SECRET']) {
  throw new Error('APP_SECRET is required for production session signing');
}

/**
 * Sign a string with HMAC-SHA256.
 */
function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

/**
 * Verify and unpack HMAC-SHA256 signed cookie value.
 */
function unsign(signedValue: string, secret: string): string | null {
  const dotIndex = signedValue.lastIndexOf('.');
  if (dotIndex === -1) return null;

  const data = signedValue.slice(0, dotIndex);
  const signature = signedValue.slice(dotIndex + 1);

  const expectedSignature = sign(data, secret);

  const sigBuffer = Buffer.from(signature, 'base64url');
  const expectedBuffer = Buffer.from(expectedSignature, 'base64url');

  if (sigBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null;
  }

  return data;
}

/**
 * Parses the Cookie header from an incoming HTTP request into key-value pairs.
 *
 * @param req - Incoming HTTP request message.
 * @returns Map of cookie names to decoded string values.
 */
export function parseCookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers['cookie'];
  if (!header) return {};

  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      try {
        cookies[key] = decodeURIComponent(val);
      } catch (err) {
        if (err instanceof URIError) continue;
        throw err;
      }
    }
  }
  return cookies;
}

/**
 * State container for an active user session in the TypeScript SSR presentation layer.
 * Tracks session attributes, CSRF tokens, flash alerts, and dirty state.
 */
export class Session {
  private data: SessionData;
  private isModified: boolean = false;

  /**
   * Initializes a new Session instance.
   *
   * @param initialData - Optional initial session data payload.
   */
  constructor(initialData?: SessionData) {
    this.data = initialData ? { ...initialData } : {};
  }

  /**
   * Retrieves a session attribute by key.
   *
   * @typeParam T - Expected value type.
   * @param key - Session attribute key.
   * @returns Value or undefined if absent.
   */
  public get<T = unknown>(key: keyof SessionData | string): T | undefined {
    return this.data[key as keyof SessionData] as T | undefined;
  }

  /**
   * Sets a session attribute and marks the session as modified.
   *
   * @param key - Session attribute key.
   * @param value - Value to store.
   */
  public set(key: keyof SessionData | string, value: unknown): void {
    this.data[key as keyof SessionData] = value as any;
    this.isModified = true;
  }

  /**
   * Deletes a session attribute and marks the session as modified.
   *
   * @param key - Session attribute key.
   */
  public delete(key: keyof SessionData | string): void {
    delete this.data[key as keyof SessionData];
    this.isModified = true;
  }

  /**
   * Clears all session attributes and marks the session as modified.
   */
  public clear(): void {
    this.data = {};
    this.isModified = true;
  }

  /**
   * Authenticated user profile, or null if unauthenticated.
   */
  public get user(): SessionUser | null {
    return this.data.user ?? null;
  }

  public set user(val: SessionUser | null) {
    this.data.user = val;
    this.isModified = true;
  }

  /**
   * Bearer authentication token.
   */
  public get authToken(): string | null {
    return this.data.authToken ?? null;
  }

  public set authToken(val: string | null) {
    this.data.authToken = val;
    this.isModified = true;
  }

  /**
   * Selected operator ID.
   */
  public get operatorId(): string {
    return this.data.operatorId || this.data.user?.operator_id || this.data.tenantId || this.data.user?.tenant_id || 'operator-demo';
  }

  public set operatorId(val: string) {
    this.data.operatorId = val;
    this.data.tenantId = val;
    this.isModified = true;
  }

  /**
   * Backward-compatible alias for operatorId.
   */
  public get tenantId(): string {
    return this.operatorId;
  }

  public set tenantId(val: string) {
    this.operatorId = val;
  }

  /**
   * Retrieves or generates a cryptographically secure 32-byte hex CSRF token.
   *
   * @returns CSRF token string.
   */
  public getCsrfToken(): string {
    if (!this.data.csrfToken) {
      this.data.csrfToken = randomBytes(32).toString('hex');
      this.isModified = true;
    }
    return this.data.csrfToken;
  }

  /**
   * Adds an ephemeral flash alert message.
   *
   * @param type - Category of flash alert.
   * @param message - Alert message body text.
   */
  public addFlash(type: 'success' | 'error' | 'warning' | 'info', message: string): void {
    if (!this.data.flashMessages) {
      this.data.flashMessages = [];
    }
    this.data.flashMessages.push({ type, message });
    this.isModified = true;
  }

  /**
   * Consumes and clears all pending flash alert messages.
   *
   * @returns Array of flash alert messages.
   */
  public consumeFlash(): FlashMessage[] {
    const messages = this.data.flashMessages ? [...this.data.flashMessages] : [];
    if (this.data.flashMessages && this.data.flashMessages.length > 0) {
      this.data.flashMessages = [];
      this.isModified = true;
    }
    return messages;
  }

  /**
   * Alias for consumeFlash().
   *
   * @returns Array of flash alert messages.
   */
  public getFlash(): FlashMessage[] {
    return this.consumeFlash();
  }

  /**
   * Retrieves the raw underlying session data object.
   *
   * @returns Reference to SessionData.
   */
  public raw(): SessionData {
    return this.data;
  }

  /**
   * Checks whether the session state has been modified since instantiation.
   *
   * @returns True if modified, false otherwise.
   */
  public isDirty(): boolean {
    return this.isModified;
  }
}

/**
 * Extracts and deserializes the Session from incoming request cookies,
 * verifying the HMAC signature against APP_SECRET.
 *
 * @param req - Incoming HTTP request message.
 * @param secret - Optional secret used to verify the HMAC signature.
 * @returns Initialized Session instance.
 */
export function getSession(req: IncomingMessage, secret: string = DEFAULT_SECRET): Session {
  const cookies = parseCookies(req);
  const cookieValue = cookies[SESSION_COOKIE_NAME];

  if (cookieValue) {
    const rawJson = unsign(cookieValue, secret);
    if (rawJson) {
      try {
        const parsed = JSON.parse(Buffer.from(rawJson, 'base64url').toString('utf8'));
        return new Session(parsed);
      } catch {
        // Fallback to empty session on parse failure
      }
    }
  }

  return new Session();
}

/**
 * Serializes, signs, and commits session data to the response Set-Cookie header.
 *
 * @param res - Node.js ServerResponse.
 * @param session - Active Session instance to serialize.
 * @param options - Optional flags including isSecure and secret overrides.
 */
export function commitSession(
  res: ServerResponse,
  session: Session,
  options?: { isSecure?: boolean; secret?: string }
): void {
  const secret = options?.secret || DEFAULT_SECRET;
  const isSecure = options?.isSecure ?? false;

  const rawJson = JSON.stringify(session.raw());
  const b64Data = Buffer.from(rawJson, 'utf8').toString('base64url');
  const signature = sign(b64Data, secret);
  const cookieValue = `${b64Data}.${signature}`;

  const cookieParts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(cookieValue)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict'
  ];

  if (isSecure) {
    cookieParts.push('Secure');
  }

  res.setHeader('Set-Cookie', cookieParts.join('; '));
}

/**
 * Clears the session cookie on user sign out by setting an expired Set-Cookie header.
 *
 * @param res - Node.js ServerResponse.
 * @param isSecure - Whether to append the Secure attribute.
 */
export function clearSession(res: ServerResponse, isSecure: boolean = false): void {
  const cookieParts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  ];
  if (isSecure) {
    cookieParts.push('Secure');
  }
  res.setHeader('Set-Cookie', cookieParts.join('; '));
}
