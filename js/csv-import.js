/* ---- CSV IMPORT ---- */
let _pendingImport = [];

function triggerImport() {
  const inp = document.getElementById('importFileInput');
  inp.value = ''; inp.click();
}

function handleImportFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    const rawRows = parseCsvRowsRaw(text);
    if (rawRows.length > 0 && looksLikeHandoverSheetCSV(rawRows[0])) {
      const handoverRows = parseHandoverSheetCSV(text);
      if (!handoverRows.length) {
        alert('No valid patient rows found in the handover sheet.');
        return;
      }
      openHandoverImportPreview(diffHandoverSheet(handoverRows, patients));
      return;
    }

    const rows = parseCSV(text);
    if (compartment === 'surgical') {
      _pendingImport = rows.map(csvRowToSurgPatient).filter(p => p.firstName || p.lastName || p.nhi);
    } else {
      _pendingImport = rows.map(csvRowToPatient).filter(p => p.firstName || p.lastName || p.nhi);
    }
    if (!_pendingImport.length) {
      alert('No valid patient rows found in the CSV. Check that the file has the expected column headers.');
      return;
    }
    showImportPreview();
  };
  reader.readAsText(file);
}

function parseCSV(text) {
  const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n');
  if (!lines.length) return [];
  function parseLine(line) {
    const fields = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
        else if (c === '"') { inQ = false; }
        else { cur += c; }
      } else {
        if (c === '"') { inQ = true; }
        else if (c === ',') { fields.push(cur.trim()); cur = ''; }
        else { cur += c; }
      }
    }
    fields.push(cur.trim()); return fields;
  }
  const headers = parseLine(lines[0]).map(x => x.toLowerCase().replace(/[()]/g,'').trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const fields = parseLine(lines[i]);
    const row = {};
    headers.forEach((hdr, idx) => { row[hdr] = (fields[idx] || '').trim(); });
    rows.push(row);
  }
  return rows;
}

function csvRowToPatient(row) {
  const sex = (row['sex'] || '').toUpperCase();
  let gender = '';
  if (sex === 'M' || sex === 'MALE')        gender = 'M';
  else if (sex === 'F' || sex === 'FEMALE') gender = 'F';
  const wardRaw = (row['ward'] || '').trim();
  const wardLower = wardRaw.toLowerCase();
  const WH_WARD_PARTIAL = [
    { contains: "wh children's", mapped: 'Pediatrics' },
    { contains: 'wh critical care', mapped: 'CCU' },
    { contains: 'wh acute stroke', mapped: 'AT&R' },
    { contains: 'wh medical', mapped: 'Medical' },
    { contains: 'wh surgical', mapped: 'Surgical' },
  ];
  const whMatch = WH_WARD_PARTIAL.find(({ contains }) => wardLower.includes(contains));
  const ward = (whMatch && whMatch.mapped)
    || WARDS.find(w => w.toLowerCase() === wardLower)
    || 'Medical';
  return {
    firstName:(row['given name']||'').trim(), lastName:(row['family name']||'').trim(),
    age:(row['age']||'').trim(), gender, genderOther:'',
    nhi:(row['nhi']||'').trim().toUpperCase(), ward:ward||'Medical', bed:(row['bed']||'').trim(),
    diagnosis:'', sgoc:'', sgocNote:'', assessment:'', background:'', coverage:'', jobs:[]
  };
}

function showImportPreview() {
  const count = _pendingImport.length;
  document.getElementById('importStats').innerHTML =
    '<strong>' + count + ' patient' + (count !== 1 ? 's' : '') + '</strong> found in CSV';
  const MAX_PREVIEW = 10;

  if (compartment === 'surgical') {
    let html = _pendingImport.slice(0, MAX_PREVIEW).map(p => {
      const name  = [p.firstName, p.lastName].filter(Boolean).join(' ') || '(no name)';
      const parts = [];
      if (p.nhi)  parts.push('NHI: ' + p.nhi);
      if (p.bed)  parts.push('Bed ' + p.bed);
      if (p.smo)  parts.push(p.smo);
      const autoTeam = teams.find(t => t.id === p._autoTeam);
      if (autoTeam) parts.push('→ ' + autoTeam.name);
      return '<div class="import-preview-item"><span class="import-preview-name">' + h(name) + '</span>' +
        '<span class="import-preview-meta">' + h(parts.join(' · ')) + '</span></div>';
    }).join('');
    if (count > MAX_PREVIEW) html += '<div class="import-preview-more">and ' + (count - MAX_PREVIEW) + ' more&hellip;</div>';
    document.getElementById('importPreviewList').innerHTML = html;
    const affectedTeamIds = new Set(_pendingImport.map(p => p._autoTeam || currentTeam).filter(Boolean));
    const existingCount = Array.from(affectedTeamIds).reduce((s, tid) => s + (allPatients[tid] || []).length, 0);
    document.getElementById('importAddBtn').textContent = 'Add to teams';
    document.getElementById('importReplaceBtn').textContent =
      existingCount ? 'Replace (' + existingCount + ' existing)' : 'Import as new list';
    const _dupNoteEl = document.getElementById('importDupNote');
    if (_dupNoteEl) _dupNoteEl.innerHTML = '';
    document.getElementById('importModal').classList.add('open');
    return;
  }

  const existing = patients.length;
  let html = _pendingImport.slice(0, MAX_PREVIEW).map(p => {
    const name  = [p.firstName, p.lastName].filter(Boolean).join(' ') || '(no name)';
    const parts = [];
    if (p.nhi)  parts.push('NHI: ' + p.nhi);
    if (p.ward) parts.push(p.ward);
    if (p.bed)  parts.push('Bed ' + p.bed);
    return '<div class="import-preview-item"><span class="import-preview-name">' + h(name) + '</span>' +
      '<span class="import-preview-meta">' + h(parts.join(' · ')) + '</span></div>';
  }).join('');
  if (count > MAX_PREVIEW) html += '<div class="import-preview-more">and ' + (count - MAX_PREVIEW) + ' more&hellip;</div>';
  document.getElementById('importPreviewList').innerHTML = html;
  document.getElementById('importAddBtn').textContent =
    'Add to existing' + (existing ? ' (' + existing + ' patient' + (existing !== 1 ? 's' : '') + ')' : '');
  document.getElementById('importReplaceBtn').textContent =
    existing ? 'Replace all ' + existing + ' patient' + (existing !== 1 ? 's' : '') : 'Import as new list';
  const _xNHIs = new Set(patients.filter(p => p.nhi).map(p => p.nhi.trim().toUpperCase()));
  const _dupCnt = _pendingImport.filter(p => p.nhi && _xNHIs.has(p.nhi.trim().toUpperCase())).length;
  const _dupNoteEl = document.getElementById('importDupNote');
  if (_dupNoteEl) _dupNoteEl.innerHTML = _dupCnt > 0
    ? '<div class="import-dup-note">⚠ ' + _dupCnt + ' patient' + (_dupCnt !== 1 ? 's' : '') + ' will be skipped when adding to existing (duplicate NHI)</div>'
    : '';
  document.getElementById('importModal').classList.add('open');
}

function closeImportModal() {
  document.getElementById('importModal').classList.remove('open');
  _pendingImport = [];
}

function handleImportOverlayClick(e) {
  if (e.target === document.getElementById('importModal')) closeImportModal();
}

function doImport(replace) {
  if (compartment === 'surgical') {
    const groups = {};
    _pendingImport.forEach(p => {
      const tid = p._autoTeam || currentTeam;
      if (!groups[tid]) groups[tid] = [];
      groups[tid].push(p);
    });
    if (replace) {
      Object.keys(groups).forEach(tid => {
        const existing = allPatients[tid] || [];
        if (existing.length) {
          pushUndo({ type: 'clear_all', patients: deepClone(existing), teamId: tid, desc: 'replaced surgical patients' });
          existing.forEach(p => deletePatientFromServer(p.pid, tid));
          allPatients[tid] = [];
        }
      });
    } else {
      Object.keys(groups).forEach(tid => {
        const nhis = new Set((allPatients[tid] || []).filter(p => p.nhi).map(p => p.nhi.trim().toUpperCase()));
        groups[tid] = groups[tid].filter(p => !p.nhi || !nhis.has(p.nhi.trim().toUpperCase()));
      });
    }
    let total = 0;
    Object.entries(groups).forEach(([tid, pts]) => {
      if (!allPatients[tid]) allPatients[tid] = [];
      pts.forEach(p => {
        const newP = { ...p, pid: newPid(), teamId: tid };
        delete newP._autoTeam;
        allPatients[tid].unshift(newP);
        savePatient(newP.pid);
        total++;
      });
      stampTeamEdit(tid);
    });
    patients = getTeamPatients(currentTeam);
    render(); closeImportModal(); checkDuplicates();
    showToast(total + ' patient' + (total !== 1 ? 's' : '') + ' imported');
    return;
  }

  let skipped = [];
  if (replace) {
    const saved = deepClone(patients);
    pushUndo({ type: 'clear_all', patients: saved, teamId: currentTeam, desc: 'replaced all patients' });
    (allPatients[currentTeam] || []).forEach(p => deletePatientFromServer(p.pid, currentTeam));
    allPatients[currentTeam] = [];
    patients = allPatients[currentTeam];
  } else {
    const existingNHIs = new Set(patients.filter(p => p.nhi).map(p => p.nhi.trim().toUpperCase()));
    skipped = _pendingImport.filter(p => p.nhi && existingNHIs.has(p.nhi.trim().toUpperCase()));
    if (skipped.length > 0) {
      _pendingImport = _pendingImport.filter(p => !p.nhi || !existingNHIs.has(p.nhi.trim().toUpperCase()));
    }
  }
  const imported = _pendingImport.map(p => { p.pid = newPid(); p.teamId = currentTeam; return p; });
  imported.forEach(p => savePatient(p.pid));
  patients.unshift(...imported);
  render(); closeImportModal();
  checkDuplicates();
  if (skipped.length > 0) {
    const names = skipped.map(p => [p.firstName, p.lastName].filter(Boolean).join(' ') || p.nhi).join(', ');
    showToast(skipped.length + ' skipped (duplicate NHI): ' + trunc(names, 50));
  }
}

function openReplaceConfirmModal() {
  const team = teams.find(t => t.id === currentTeam);
  document.getElementById('replaceConfirmTeamName').textContent = team ? team.name : 'this team';
  document.getElementById('replaceConfirmModal').classList.add('open');
}

function closeReplaceConfirmModal() {
  document.getElementById('replaceConfirmModal').classList.remove('open');
}

function handleReplaceConfirmOverlay(e) {
  if (e.target === document.getElementById('replaceConfirmModal')) closeReplaceConfirmModal();
}

function doReplaceConfirmed() { closeReplaceConfirmModal(); doImport(true); }
