import { randomBytes, scrypt, timingSafeEqual, createHmac } from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_BYTES = 16;

/**
 * Generate an RFC 9562 UUIDv7 string.
 * Time-ordered 128-bit identifier with millisecond precision and monotonic sortability.
 */
export function generateUUIDv7(timestampMs: number = Date.now()): string {
  const bytes = randomBytes(16);

  // 48-bit timestamp (bytes 0-5)
  const time = BigInt(timestampMs);
  bytes[0] = Number((time >> 40n) & 0xffn);
  bytes[1] = Number((time >> 32n) & 0xffn);
  bytes[2] = Number((time >> 24n) & 0xffn);
  bytes[3] = Number((time >> 16n) & 0xffn);
  bytes[4] = Number((time >> 8n) & 0xffn);
  bytes[5] = Number(time & 0xffn);

  // 4-bit version 7 in high nibble of byte 6 (0x70)
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;

  // 2-bit variant (0b10) in high 2 bits of byte 8 (0x80)
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Extract timestamp in milliseconds from an RFC 9562 UUIDv7.
 */
export function getUUIDv7Timestamp(uuid: string): number {
  const cleanHex = uuid.replace(/-/g, '');
  if (cleanHex.length !== 32) {
    throw new Error(`Invalid UUID format: ${uuid}`);
  }
  const timeHex = cleanHex.slice(0, 12);
  return Number(BigInt(`0x${timeHex}`));
}

/**
 * Hash password using scrypt with random salt.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      SCRYPT_KEYLEN,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
      (err, derivedKey) => {
        if (err) return reject(err);
        const saltHex = salt.toString('hex');
        const hashHex = derivedKey.toString('hex');
        resolve(`$scrypt$N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}$${saltHex}$${hashHex}`);
      }
    );
  });
}

/**
 * Verify password against formatted scrypt hash in constant time.
 */
export async function verifyPassword(password: string, hashString: string): Promise<boolean> {
  const parts = hashString.split('$');
  if (parts.length !== 5 || parts[1] !== 'scrypt') {
    return false;
  }

  const saltHex = parts[3];
  const storedHashHex = parts[4];
  if (!saltHex || !storedHashHex) {
    return false;
  }

  const salt = Buffer.from(saltHex, 'hex');
  const storedKey = Buffer.from(storedHashHex, 'hex');

  return new Promise((resolve) => {
    scrypt(
      password,
      salt,
      storedKey.length,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
      (err, derivedKey) => {
        if (err || derivedKey.length !== storedKey.length) {
          return resolve(false);
        }
        resolve(timingSafeEqual(derivedKey, storedKey));
      }
    );
  });
}

/**
 * Generate random hex token (e.g. CSRF tokens, API keys).
 */
export function generateRandomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/**
 * Decoded payload for verified HMAC-SHA256 tokens.
 */
export interface TokenPayload {
  /** Subject identifier (user UUID). */
  sub: string;
  /** Primary operator isolation identifier. */
  opid: string;
  /** Role assigned to user (e.g. owner, manager, assistant, read_only). */
  role: string;
  /** Issued-at timestamp in seconds. */
  iat: number;
  /** Expiration timestamp in seconds. */
  exp: number;
  /** Token version for stateless revocation. */
  tv?: number;
  [key: string]: unknown;
}

/**
 * Input arguments for creating a signed token.
 */
export interface TokenInput {
  /** Subject identifier (user UUID). */
  sub: string;
  /** Primary operator isolation identifier. */
  opid?: string;
  /** Role assigned to user. */
  role: string;
  /** Expiration timestamp in seconds. */
  exp: number;
  /** Optional token version for revocation checks. */
  tv?: number;
  [key: string]: unknown;
}

/**
 * Create a signed HMAC-SHA256 session token.
 * Requires a non-empty operator claim (`opid`).
 *
 * @param payload - Token claims and configuration.
 * @param secret - Cryptographic secret key used for HMAC signing.
 * @returns Serialized JWT string.
 * @throws {Error} When `opid` is not provided as a non-empty string.
 */
export function createToken(payload: TokenInput, secret: string): string {
  const operatorClaim = (
    (typeof payload.opid === 'string' && payload.opid.trim().length > 0 ? payload.opid.trim() : '') ||
    (typeof payload['operatorId'] === 'string' && (payload['operatorId'] as string).trim().length > 0 ? (payload['operatorId'] as string).trim() : '')
  );

  if (!operatorClaim) {
    throw new Error('createToken requires a non-empty operator claim (opid)');
  }

  const fullPayload: TokenPayload = Object.assign({}, payload, {
    opid: payload.opid || operatorClaim,
    iat: Math.floor(Date.now() / 1000)
  });

  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const signature = createHmac('sha256', secret)
    .update(signatureInput)
    .digest('base64url');

  return `${signatureInput}.${signature}`;
}

/**
 * Verify and decode an HMAC-SHA256 session token.
 */
export function verifyToken(token: string, secret: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  if (!encodedHeader || !encodedPayload || !signature) {
    return null;
  }

  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = createHmac('sha256', secret)
    .update(signatureInput)
    .digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expectedSigBuffer = Buffer.from(expectedSignature);

  if (
    sigBuffer.length !== expectedSigBuffer.length ||
    !timingSafeEqual(sigBuffer, expectedSigBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as TokenPayload;

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowSeconds) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Verify token with database-backed token version validation.
 * Used for stateless token revocation - when a user's password or role changes,
 * their token_version is incremented, invalidating all existing tokens.
 * Enforces strict token_version verification; legacy unversioned tokens lacking
 * a numeric `tv` claim are rejected to guarantee 100% token revocability.
 */
export function verifyTokenWithDatabase(
  token: string,
  secret: string,
  db: any
): TokenPayload | null {
  const payload = verifyToken(token, secret);
  if (!payload) {
    return null;
  }

  const tokenVersion = payload.tv;

  // Reject unversioned tokens to guarantee 100% revocability
  if (tokenVersion === undefined || typeof tokenVersion !== 'number') {
    return null;
  }

  // Fetch user's current token version from database
  const user = db.prepare(
    'SELECT token_version FROM users WHERE id = ? AND deleted_at IS NULL'
  ).get(payload.sub) as { token_version: number } | undefined;

  if (!user) {
    return null;
  }

  if (user.token_version !== tokenVersion) {
    return null;
  }

  return payload;
}
