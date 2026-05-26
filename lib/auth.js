'use strict';
const crypto = require('crypto');

const SECRET = process.env.SESSION_SECRET || 'local-dev-secret';

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(part => {
    const [k, ...v] = part.trim().split('=');
    if (k) out[k.trim()] = decodeURIComponent(v.join('='));
  });
  return out;
}

function sign(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
}

/**
 * Returns true if the request carries a valid session cookie.
 * If WARD_PASSWORD is not set, auth is disabled (local dev mode).
 */
function verifySession(req) {
  if (!process.env.WARD_PASSWORD) return true;   // no password configured → open access

  const token = parseCookies(req)['gm_session'];
  if (!token) return false;

  const dot = token.indexOf('.');
  if (dot === -1) return false;
  const signature = token.slice(0, dot);
  const expiry    = token.slice(dot + 1);

  if (Date.now() > parseInt(expiry, 10)) return false;

  const expected = sign(expiry);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature.padEnd(64, '0')),
      Buffer.from(expected.padEnd(64, '0'))
    ) && signature.length === expected.length;
  } catch {
    return false;
  }
}

module.exports = { sign, verifySession };
