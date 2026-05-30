'use strict';
const { createClient } = require('@supabase/supabase-js');

// No auth required — safe to expose because it only reveals
// whether vars are set (never their values) and DB connectivity.
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const report = {
    timestamp: new Date().toISOString(),
    env: {
      SUPABASE_URL: url
        ? 'set (' + url.slice(0, 12) + '…)'
        : 'MISSING',
      SUPABASE_SERVICE_ROLE_KEY: key
        ? 'set (length=' + key.length + ')'
        : 'MISSING',
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
    const sb = createClient(url, key);

    // 1. Check the store table exists and is readable
    const { data, error } = await sb
      .from('store')
      .select('key, updated_at')
      .eq('key', 'handover-v1')
      .maybeSingle();

    if (error) {
      report.supabase = { ok: false, error: error.message, code: error.code, hint: error.hint };
    } else if (!data) {
      report.supabase = { ok: true, note: 'table reachable but no row yet — app has not saved yet' };
    } else {
      report.supabase = { ok: true, key: data.key, last_saved: data.updated_at };
    }

    // 2. Quick write test — write then immediately read back
    const testKey = '__healthcheck__';
    const { error: writeErr } = await sb
      .from('store')
      .upsert({ key: testKey, value: { ping: true }, updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (writeErr) {
      report.supabase.write_test = { ok: false, error: writeErr.message, code: writeErr.code };
    } else {
      // Clean up
      await sb.from('store').delete().eq('key', testKey);
      report.supabase.write_test = { ok: true };
    }
  } catch (e) {
    report.supabase = { ok: false, error: e.message };
  }

  res.status(200).json(report);
};
