import { test, describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  generateUUIDv7,
  getUUIDv7Timestamp,
  hashPassword,
  verifyPassword,
  createToken,
  verifyToken
} from '../core/crypto.js';

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
    const password = 'SuperSecretSecurePassword!99';
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
});

