'use strict';
const supabase          = require('../lib/supabase');
const { verifySession } = require('../lib/auth');

function patientKey(teamId, pid) {
  return 'pt:' + teamId + ':' + pid;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!verifySession(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); }
    catch (e) { return res.status(400).json({ error: 'Invalid JSON body' }); }
  }

  if (req.method === 'POST') {
    if (!body || !body.pid || !body.teamId) {
      return res.status(400).json({ error: 'Missing pid or teamId' });
    }
    const key = patientKey(body.teamId, body.pid);
    const { error } = await supabase
      .from('store')
      .upsert(
        { key, value: body, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
    if (error) {
      console.error('[patient] POST error:', error.message);
      return res.status(503).json({ error: 'Storage write failed.', detail: error.message });
    }
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    if (!body || !body.pid || !body.teamId) {
      return res.status(400).json({ error: 'Missing pid or teamId' });
    }
    const key = patientKey(body.teamId, body.pid);
    const { error } = await supabase
      .from('store')
      .delete()
      .eq('key', key);
    if (error) {
      console.error('[patient] DELETE error:', error.message);
      return res.status(503).json({ error: 'Storage delete failed.', detail: error.message });
    }
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
};
