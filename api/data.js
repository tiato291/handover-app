'use strict';
const { kv }           = require('@vercel/kv');
const { verifySession } = require('../lib/auth');

const KEY = 'handover-v1';

module.exports = async function handler(req, res) {
  if (!verifySession(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    try {
      const data = await kv.get(KEY) ?? { teams: [], teamData: {} };
      return res.status(200).json(data);
    } catch (e) {
      console.error('KV read error:', e);
      return res.status(503).json({
        error: 'Storage unavailable. Add Vercel KV to your project in the dashboard.'
      });
    }
  }

  if (req.method === 'POST') {
    try {
      // req.body is auto-parsed by Vercel when Content-Type is application/json
      await kv.set(KEY, req.body);
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('KV write error:', e);
      return res.status(503).json({ error: 'Storage write failed.' });
    }
  }

  res.status(405).end();
};
