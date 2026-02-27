import test from 'node:test';
import assert from 'node:assert/strict';
import { createToken, hashPassword, verifyPassword, verifyToken } from '../src/auth.js';

test('password hashing and verification', () => {
  const hashed = hashPassword('secret123');
  assert.equal(verifyPassword('secret123', hashed), true);
  assert.equal(verifyPassword('wrong', hashed), false);
});

test('token signing and verification', () => {
  const payload = { id: 'u_1', email: 'a@b.com' };
  const token = createToken(payload);
  assert.deepEqual(verifyToken(token), payload);
  assert.equal(verifyToken(token + 'broken'), null);
});
