'use strict';
const supabase                  = require('../lib/supabase');
const { verifySession }         = require('../lib/auth');
const { buildHandoverWorkbook } = require('../lib/handoverWorkbook');
const { buildSurgWorkbook }     = require('../lib/surgWorkbook');

const PT_PREFIX     = 'pt:';
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

  const team       = req.query && req.query.team;
  const isSurgical = req.query && req.query.compartment === 'surgical';
  const teamName   = req.query && req.query.teamName;

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

  const date = new Date().toISOString().slice(0, 10);
  let buffer, filename;

  if (isSurgical) {
    patients.sort((a, b) =>
      (a.smo || '').localeCompare(b.smo || '') || (a.bed || '').localeCompare(b.bed || '')
    );
    buffer = await buildSurgWorkbook(patients);
    const slug = (teamName || team || 'all').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    filename = 'Surg-Handover-' + slug + '-' + date + '.xlsx';
  } else {
    patients.sort((a, b) => wardRank(a.ward) - wardRank(b.ward));
    buffer = await buildHandoverWorkbook(patients);
    const scope = (team || 'all-teams').replace(/\s+/g, '-').toLowerCase();
    filename = 'handover-' + scope + '-' + date + '.xlsx';
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
  res.status(200).send(buffer);
};
