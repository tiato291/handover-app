'use strict';
const { sign } = require('../lib/auth');

module.exports = function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { password } = req.body || {};

  if (!process.env.WARD_PASSWORD || password !== process.env.WARD_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  const expiry    = (Date.now() + 24 * 60 * 60 * 1000).toString(); // 24 h
  const signature = sign(expiry);
  const token     = `${signature}.${expiry}`;
  const secure    = process.env.NODE_ENV === 'production' ? '; Secure' : '';

  res.setHeader(
    'Set-Cookie',
    `gm_session=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=86400${secure}`
  );
  res.status(200).json({ ok: true });
};
