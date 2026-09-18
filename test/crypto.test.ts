import { test, describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  generateUUIDv7,
  getUUIDv7Timestamp,
  hashPassword,
  verifyPassword,
  createToken,
  verifyToken,
  verifyTokenWithDatabase
} from '../core/crypto.js';
import { getDatabase, closeDatabase } from '../database/client.js';
import { runMigrations } from '../database/migrator.js';

describe('Cryptography & Identity Subsystem', () => {
  it('generates valid RFC 9562 UUIDv7 identifiers', () => {
    const uuid = generateUUIDv7();
    assert.equal(typeof uuid, 'string');
    assert.equal(uuid.length, 36);

    const parts = uuid.split('-');
    assert.equal(parts.length, 5);
    assert.equal(parts[0]!.length, 8);
    assert.equal(parts[1]!.length, 4);
    assert.equal(parts[2]!.length, 4);
    assert.equal(parts[3]!.length, 4);
    assert.equal(parts[4]!.length, 12);

    // Verify Version 7 bit pattern at byte 6 (char index 14)
    assert.equal(uuid[14], '7');

    // Verify Variant 2 bit pattern (0b10 -> '8', '9', 'a', or 'b') at byte 8 (char index 19)
    assert.match(uuid[19]!, /^[89ab]$/);
  });

  it('preserves millisecond timestamp ordering in UUIDv7', () => {
    const t1 = Date.now();
    const id1 = generateUUIDv7(t1);
    const id2 = generateUUIDv7(t1 + 1000);

    const parsed1 = getUUIDv7Timestamp(id1);
    const parsed2 = getUUIDv7Timestamp(id2);

    assert.equal(parsed1, t1);
    assert.equal(parsed2, t1 + 1000);
    assert.ok(id1 < id2, 'Earlier UUIDv7 should be lexicographically less than later UUIDv7');
  });

  it('hashes and verifies passwords using scrypt with timing-safe comparison', async () => {
    const password = `test-pass-${randomBytes(12).toString('hex')}`;
    const hash = await hashPassword(password);

    assert.ok(hash.startsWith('$scrypt$N=16384,r=8,p=1$'));

    const isValid = await verifyPassword(password, hash);
    assert.equal(isValid, true);

    const isInvalid = await verifyPassword('WrongPassword', hash);
    assert.equal(isInvalid, false);
  });

  it('creates and verifies HMAC-SHA256 session tokens', () => {
    const secret = 'super-secret-test-key-at-least-32-chars-long';
    const payload = {
      sub: 'user-123',
      tid: 'tenant-abc',
      role: 'owner',
      exp: Math.floor(Date.now() / 1000) + 3600
    };

    const token = createToken(payload, secret);
    assert.ok(token.includes('.'));

    const verified = verifyToken(token, secret);
    assert.ok(verified !== null);
    assert.equal(verified?.sub, 'user-123');
    assert.equal(verified?.tid, 'tenant-abc');
    assert.equal(verified?.role, 'owner');

    // Verify tampered token fails
    const tampered = token.slice(0, -4) + 'abcd';
    assert.equal(verifyToken(tampered, secret), null);

    // Verify expired token fails
    const expiredToken = createToken(
      { ...payload, exp: Math.floor(Date.now() / 1000) - 10 },
      secret
    );
    assert.equal(verifyToken(expiredToken, secret), null);
  });

  it('creates and verifies tokens with token version for revocation', () => {
    const secret = 'super-secret-test-key-at-least-32-chars-long';

    // Token with version
    const tokenWithVersion = createToken(
      {
        sub: 'user-456',
        tid: 'tenant-xyz',
        role: 'manager',
        exp: Math.floor(Date.now() / 1000) + 3600,
        tv: 1
      },
      secret
    );

    const verified = verifyToken(tokenWithVersion, secret);
    assert.ok(verified !== null);
    assert.equal(verified?.tv, 1);
  });

  it('backward compatible with legacy tokens without version', () => {
    const secret = 'super-secret-test-key-at-least-32-chars-long';

    // Legacy token without tv field
    const legacyToken = createToken(
      {
        sub: 'user-789',
        tid: 'tenant-legacy',
        role: 'read_only',
        exp: Math.floor(Date.now() / 1000) + 3600
      },
      secret
    );

    const verified = verifyToken(legacyToken, secret);
    assert.ok(verified !== null);
    assert.equal(verified?.sub, 'user-789');
    assert.equal(verified?.tv, undefined);
  });
});

describe('Token Revocation with Database Backing', () => {
  const secret = 'test-revocation-secret-key-1234567890';
  let db: any;

  before(() => {
    db = getDatabase({ inMemory: true });
    runMigrations(db);

    const now = Date.now();
    db.prepare(`
      INSERT INTO operators (id, name, subdomain, currency, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('tenant-rev-test', 'Revocation Test Tenant', 'rev-test', 'USD', now, now);

    db.prepare(`
      INSERT INTO users (id, operator_id, email, password_hash, first_name, last_name, role, token_version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('user-rev-test', 'tenant-rev-test', 'test@rev.local', '$scrypt$dummy', 'Test', 'User', 'owner', 1, now, now);
  });

  after(() => {
    try { closeDatabase(); } catch {}
  });

  it('verifies tokens with matching database version', () => {
    const token = createToken(
      {
        sub: 'user-rev-test',
        tid: 'tenant-rev-test',
        role: 'owner',
        exp: Math.floor(Date.now() / 1000) + 3600,
        tv: 1
      },
      secret
    );

    const verified = verifyTokenWithDatabase(token, secret, db);
    assert.ok(verified !== null);
    assert.equal(verified?.sub, 'user-rev-test');
  });

  it('rejects tokens with mismatched version', () => {
    const token = createToken(
      {
        sub: 'user-rev-test',
        tid: 'tenant-rev-test',
        role: 'owner',
        exp: Math.floor(Date.now() / 1000) + 3600,
        tv: 2
      },
      secret
    );

    const verified = verifyTokenWithDatabase(token, secret, db);
    assert.equal(verified, null, 'Token with mismatched version should be rejected');
  });

  it('rejects legacy unversioned tokens without tv claim', () => {
    const token = createToken(
      {
        sub: 'user-rev-test',
        tid: 'tenant-rev-test',
        role: 'owner',
        exp: Math.floor(Date.now() / 1000) + 3600
      },
      secret
    );

    const verified = verifyTokenWithDatabase(token, secret, db);
    assert.equal(verified, null, 'Unversioned tokens without tv must be rejected');
  });

  it('rejects tokens for deleted users', () => {
    const now = Date.now();
    db.prepare('UPDATE users SET deleted_at = ? WHERE id = ?').run(now, 'user-rev-test');

    const token = createToken(
      {
        sub: 'user-rev-test',
        tid: 'tenant-rev-test',
        role: 'owner',
        exp: Math.floor(Date.now() / 1000) + 3600,
        tv: 1
      },
      secret
    );

    const verified = verifyTokenWithDatabase(token, secret, db);
    assert.equal(verified, null, 'Token for deleted user should be rejected');

    db.prepare('UPDATE users SET deleted_at = NULL WHERE id = ?').run('user-rev-test');
  });

  it('rejects createToken if neither opid nor tid claim is provided', () => {
    assert.throws(
      () => {
        createToken(
          {
            sub: 'user-no-op',
            role: 'owner',
            exp: Math.floor(Date.now() / 1000) + 3600
          },
          secret
        );
      },
      /createToken requires a non-empty operator claim/
    );
  });
});


