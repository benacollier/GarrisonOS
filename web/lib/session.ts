import { IncomingMessage, ServerResponse } from 'node:http';
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

export interface SessionUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  operator_id: string;
  tenant_id?: string;
}

export interface FlashMessage {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

export interface SessionData {
  user?: SessionUser | null;
  authToken?: string | null;
  operatorId?: string | null;
  tenantId?: string | null;
  csrfToken?: string;
  flashMessages?: FlashMessage[];
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
 * Parse Cookie header from incoming HTTP request.
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

export class Session {
  private data: SessionData;
  private isModified: boolean = false;

  constructor(initialData?: SessionData) {
    this.data = initialData ? { ...initialData } : {};
  }

  public get<T = unknown>(key: keyof SessionData | string): T | undefined {
    return this.data[key as keyof SessionData] as T | undefined;
  }

  public set(key: keyof SessionData | string, value: unknown): void {
    this.data[key as keyof SessionData] = value as any;
    this.isModified = true;
  }

  public delete(key: keyof SessionData | string): void {
    delete this.data[key as keyof SessionData];
    this.isModified = true;
  }

  public clear(): void {
    this.data = {};
    this.isModified = true;
  }

  public get user(): SessionUser | null {
    return this.data.user ?? null;
  }

  public set user(val: SessionUser | null) {
    this.data.user = val;
    this.isModified = true;
  }

  public get authToken(): string | null {
    return this.data.authToken ?? null;
  }

  public set authToken(val: string | null) {
    this.data.authToken = val;
    this.isModified = true;
  }

  public get operatorId(): string {
    return this.data.operatorId || this.data.user?.operator_id || this.data.tenantId || this.data.user?.tenant_id || 'operator-demo';
  }

  public set operatorId(val: string) {
    this.data.operatorId = val;
    this.data.tenantId = val;
    this.isModified = true;
  }

  public get tenantId(): string {
    return this.operatorId;
  }

  public set tenantId(val: string) {
    this.operatorId = val;
  }

  public getCsrfToken(): string {
    if (!this.data.csrfToken) {
      this.data.csrfToken = randomBytes(32).toString('hex');
      this.isModified = true;
    }
    return this.data.csrfToken;
  }

  public addFlash(type: 'success' | 'error' | 'warning' | 'info', message: string): void {
    if (!this.data.flashMessages) {
      this.data.flashMessages = [];
    }
    this.data.flashMessages.push({ type, message });
    this.isModified = true;
  }

  public consumeFlash(): FlashMessage[] {
    const messages = this.data.flashMessages ? [...this.data.flashMessages] : [];
    if (this.data.flashMessages && this.data.flashMessages.length > 0) {
      this.data.flashMessages = [];
      this.isModified = true;
    }
    return messages;
  }

  public getFlash(): FlashMessage[] {
    return this.consumeFlash();
  }

  public raw(): SessionData {
    return this.data;
  }

  public isDirty(): boolean {
    return this.isModified;
  }
}

/**
 * Extract or create session from request.
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
 * Commit session data to Set-Cookie header.
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
 * Clear session cookie on sign out.
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
