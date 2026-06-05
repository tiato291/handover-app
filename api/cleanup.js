'use strict';
const supabase          = require('../lib/supabase');
const { verifySession } = require('../lib/auth');

const TEAMS_KEY = 'handover-teams-v1';
const PT_PREFIX = 'pt:';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!verifySession(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();

  // Fetch current teams so we know which teamIds are valid
  const { data: teamsRow, error: teamsErr } = await supabase
    .from('store')
    .select('value')
    .eq('key', TEAMS_KEY)
    .maybeSingle();

  if (teamsErr) {
    console.error('[cleanup] teams fetch error:', teamsErr.message);
    return res.status(503).json({ error: teamsErr.message });
  }

  const knownTeamIds = new Set(
    (teamsRow?.value?.teams || []).map(t => t.id)
  );

  // Fetch all per-patient rows with updated_at for tie-breaking duplicates
  const { data: rows, error: ptsErr } = await supabase
    .from('store')
    .select('key, value, updated_at')
    .like('key', PT_PREFIX + '%');

  if (ptsErr) {
    console.error('[cleanup] patients fetch error:', ptsErr.message);
    return res.status(503).json({ error: ptsErr.message });
  }

  const orphanKeys = [];
  // pid → { key, updated_at } for the "winner" when duplicates are found
  const seenPids   = new Map();

  for (const row of (rows || [])) {
    const { key, value, updated_at } = row;

    // Malformed record — no pid or teamId in value
    if (!value || !value.pid || !value.teamId) {
      orphanKeys.push(key);
      continue;
    }

    // Key must match pt:{teamId}:{pid} — if it doesn't the record is a stale
    // leftover from a move whose DELETE request failed
    const expectedKey = PT_PREFIX + value.teamId + ':' + value.pid;
    if (key !== expectedKey) {
      orphanKeys.push(key);
      continue;
    }

    // teamId must correspond to a team that still exists
    if (!knownTeamIds.has(value.teamId)) {
      orphanKeys.push(key);
      continue;
    }

    // Duplicate pid across teams — keep the most recently saved copy
    if (seenPids.has(value.pid)) {
      const prev = seenPids.get(value.pid);
      if (updated_at > prev.updated_at) {
        orphanKeys.push(prev.key);
        seenPids.set(value.pid, { key, updated_at });
      } else {
        orphanKeys.push(key);
      }
    } else {
      seenPids.set(value.pid, { key, updated_at });
    }
  }

  if (orphanKeys.length > 0) {
    const { error: delErr } = await supabase
      .from('store')
      .delete()
      .in('key', orphanKeys);

    if (delErr) {
      console.error('[cleanup] delete error:', delErr.message);
      return res.status(503).json({ error: delErr.message });
    }
  }

  console.log(`[cleanup] removed ${orphanKeys.length} orphan record(s)`);
  return res.status(200).json({ removed: orphanKeys.length });
};
