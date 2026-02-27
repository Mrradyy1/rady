import crypto from 'crypto';

const TOKEN_SECRET = process.env.TOKEN_SECRET || 'comiking-super-secret';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hashed = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hashed}`;
}

export function verifyPassword(password, stored) {
  const [salt, oldHash] = stored.split(':');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(oldHash, 'hex'));
}

export function createToken(payload) {
  const rawPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(rawPayload).digest('base64url');
  return `${rawPayload}.${sig}`;
}

export function verifyToken(token) {
  const [rawPayload, sig] = token.split('.');
  if (!rawPayload || !sig) return null;
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(rawPayload).digest('base64url');
  if (sig !== expected) return null;
  return JSON.parse(Buffer.from(rawPayload, 'base64url').toString('utf8'));
}
