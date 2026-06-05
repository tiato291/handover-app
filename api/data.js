'use strict';
const supabase          = require('../lib/supabase');
const { verifySession } = require('../lib/auth');

const TEAMS_KEY  = 'handover-teams-v1';
const LEGACY_KEY = 'handover-v1';
const PT_PREFIX  = 'pt:';

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
    const { data: teamsRow, error: teamsErr } = await supabase
      .from('store')
      .select('value')
      .eq('key', TEAMS_KEY)
      .maybeSingle();

    if (teamsErr) {
      console.error('[data] GET teams error:', teamsErr.message);
      return res.status(503).json({ error: 'Storage unavailable.', detail: teamsErr.message });
    }

    const { data: patientRows, error: ptsErr } = await supabase
      .from('store')
      .select('key, value')
      .like('key', PT_PREFIX + '%');

    if (ptsErr) {
      console.error('[data] GET patients error:', ptsErr.message);
      return res.status(503).json({ error: 'Storage unavailable.', detail: ptsErr.message });
    }

    const teams    = teamsRow?.value?.teams ?? [];
    const patients = (patientRows || []).map(r => r.value).filter(Boolean);

    // Only check for legacy data when there is nothing in the new format yet
    let legacy = null;
    if (patients.length === 0 && teams.length === 0) {
      const { data: legacyRow } = await supabase
        .from('store')
        .select('value')
        .eq('key', LEGACY_KEY)
        .maybeSingle();
      legacy = legacyRow?.value ?? null;
    }

    console.log(`[data] GET ok — ${patients.length} patients, ${teams.length} teams, legacy:${!!legacy}`);
    return res.status(200).json({ teams, patients, _legacy: legacy });
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); }
      catch (e) { return res.status(400).json({ error: 'Invalid JSON body' }); }
    }
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Missing body' });
    }

    const { error } = await supabase
      .from('store')
      .upsert(
        { key: TEAMS_KEY, value: { teams: body.teams || [] }, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );

    if (error) {
      console.error('[data] POST teams error:', error.message);
      return res.status(503).json({ error: 'Storage write failed.', detail: error.message });
    }

    console.log('[data] POST teams ok');
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
};
