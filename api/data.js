'use strict';
const supabase          = require('../lib/supabase');
const { verifySession } = require('../lib/auth');
const KEY = 'handover-v1';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const urlSet = !!process.env.SUPABASE_URL;
  const keySet = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  console.log(`[data] ${req.method} — SUPABASE_URL:${urlSet} KEY:${keySet}`);

  if (!verifySession(req)) {
    console.log('[data] auth rejected');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('store')
      .select('value')
      .eq('key', KEY)
      .maybeSingle();

    if (error) {
      console.error('[data] GET error:', error.code, error.message, error.details);
      return res.status(503).json({ error: 'Storage unavailable.', detail: error.message });
    }

    console.log('[data] GET ok — row found:', !!data);
    return res.status(200).json(data?.value ?? { teams: [], teamData: {} });
  }

  if (req.method === 'POST') {
    // Vercel may deliver body as a pre-parsed object or as a raw string depending
    // on runtime version — handle both.
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        console.error('[data] POST body parse failed:', e.message);
        return res.status(400).json({ error: 'Invalid JSON body' });
      }
    }

    if (!body || typeof body !== 'object') {
      console.error('[data] POST body is empty or wrong type:', typeof body);
      return res.status(400).json({ error: 'Missing body' });
    }

    console.log('[data] POST — upserting, top-level keys:', Object.keys(body).join(', '));

    const { error } = await supabase
      .from('store')
      .upsert(
        { key: KEY, value: body, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );

    if (error) {
      console.error('[data] POST upsert error:', error.code, error.message, error.details, error.hint);
      return res.status(503).json({ error: 'Storage write failed.', detail: error.message });
    }

    console.log('[data] POST ok');
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
};
