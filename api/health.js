'use strict';
const supabase = require('../lib/supabase');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const report = {
    timestamp: new Date().toISOString(),
    env: {
      SUPABASE_URL: url ? 'set (' + url.slice(0, 12) + '…)' : 'MISSING',
      SUPABASE_SERVICE_ROLE_KEY: key ? 'set (length=' + key.length + ')' : 'MISSING',
      WARD_PASSWORD: process.env.WARD_PASSWORD ? 'set' : 'not set — open access',
      NODE_ENV: process.env.NODE_ENV || '(not set)',
    },
    supabase: null,
  };

  if (!url || !key) {
    report.supabase = { ok: false, error: 'Cannot connect — env vars missing' };
    return res.status(200).json(report);
  }

  try {
    // Read test
    const { data, error } = await supabase
      .from('store')
      .select('key, updated_at')
      .eq('key', 'handover-v1')
      .maybeSingle();

    if (error) {
      report.supabase = { ok: false, error: error.message, code: error.code, hint: error.hint };
    } else {
      report.supabase = data
        ? { ok: true, key: data.key, last_saved: data.updated_at }
        : { ok: true, note: 'table reachable — no row yet (app has not saved yet)' };
    }

    // Write test — upsert a throwaway row then delete it
    const testKey = '__healthcheck__';
    const { error: writeErr } = await supabase
      .from('store')
      .upsert(
        { key: testKey, value: { ping: true }, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );

    if (writeErr) {
      report.supabase.write_test = { ok: false, error: writeErr.message, code: writeErr.code };
    } else {
      await supabase.from('store').delete().eq('key', testKey);
      report.supabase.write_test = { ok: true };
    }
  } catch (e) {
    report.supabase = { ok: false, error: e.message };
  }

  return res.status(200).json(report);
};
