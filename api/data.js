'use strict';
const supabase          = require('../lib/supabase');
const { verifySession } = require('../lib/auth');
const KEY = 'handover-v1';

module.exports = async function handler(req, res) {
  if (!verifySession(req)) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('store')
      .select('value')
      .eq('key', KEY)
      .maybeSingle();
    if (error) {
      console.error('Supabase read error:', error);
      return res.status(503).json({ error: 'Storage unavailable.' });
    }
    return res.status(200).json(data?.value ?? { teams: [], teamData: {} });
  }

  if (req.method === 'POST') {
    const { error } = await supabase
      .from('store')
      .upsert({ key: KEY, value: req.body, updated_at: new Date().toISOString() });
    if (error) {
      console.error('Supabase write error:', error);
      return res.status(503).json({ error: 'Storage write failed.' });
    }
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
};
