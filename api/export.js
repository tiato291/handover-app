'use strict';
const supabase                 = require('../lib/supabase');
const { verifySession }        = require('../lib/auth');
const { buildHandoverWorkbook } = require('../lib/handoverWorkbook');

const PT_PREFIX = 'pt:';
const WARD_PRIORITY = ['CCU', 'Pediatrics', 'AT&R', 'Medical', 'Surgical'];

function wardRank(ward) {
  const idx = WARD_PRIORITY.indexOf(ward);
  return idx === -1 ? WARD_PRIORITY.length : idx;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!verifySession(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const team = req.query && req.query.team;

  const { data: patientRows, error } = await supabase
    .from('store')
    .select('value')
    .like('key', PT_PREFIX + '%');

  if (error) {
    console.error('[export] error:', error.message);
    return res.status(503).json({ error: 'Storage unavailable.', detail: error.message });
  }

  let patients = (patientRows || []).map(r => r.value).filter(Boolean);
  if (team) patients = patients.filter(p => p.teamId === team);
  patients.sort((a, b) => wardRank(a.ward) - wardRank(b.ward));

  const buffer = await buildHandoverWorkbook(patients);
  const scope = (team || 'all-teams').replace(/\s+/g, '-').toLowerCase();
  const filename = 'handover-' + scope + '-' + new Date().toISOString().slice(0, 10) + '.xlsx';

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
  res.status(200).send(buffer);
};
