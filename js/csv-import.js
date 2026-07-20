/* ---- CSV IMPORT ---- */
let _pendingImport = [];

const _CSV_DEMO_FIELDS_MED  = ['firstName','lastName','age','gender','ward','bed'];
const _CSV_DEMO_FIELDS_SURG = ['firstName','lastName','middleName','title','age','gender','ward','bed','smo','doa'];
const _CSV_FIELD_LABEL = {
  firstName:'First name', lastName:'Last name', middleName:'Middle name',
  title:'Title', age:'Age', gender:'Sex', ward:'Ward', bed:'Bed', smo:'SMO', doa:'DOA'
};

function _buildCsvNhiMap(isSurgical) {
  var map = {};
  if (isSurgical) {
    teams.filter(function(t) { return t.compartment === 'surgical'; }).forEach(function(t) {
      (allPatients[t.id] || []).forEach(function(p) {
        if (p.nhi) map[p.nhi.trim().toUpperCase()] = p;
      });
    });
  } else {
    patients.filter(function(p) { return p.nhi; }).forEach(function(p) {
      map[p.nhi.trim().toUpperCase()] = p;
    });
  }
  return map;
}

function _csvDemoDiff(existing, imported, fields) {
  var changes = [];
  fields.forEach(function(k) {
    var oldV = (existing[k] || '').toString().trim();
    var newV = (imported[k]  || '').toString().trim();
    // DOA: normalise both sides to D/M before comparing so a stored raw timestamp
    // ("17/07/2026 17:32") vs a freshly-parsed value ("17/7") isn't a false positive
    var oldCmp = (k === 'doa') ? parseSurgAdmissionDate(oldV) : oldV;
    var newCmp = (k === 'doa') ? parseSurgAdmissionDate(newV) : newV;
    if (newCmp && newCmp !== oldCmp) {
      changes.push((_CSV_FIELD_LABEL[k] || k) + ': ' + (oldCmp || '—') + ' → ' + newCmp);
    }
  });
  return changes;
}

function _csvApplyDemoUpdate(existing, imported, isSurgical) {
  var fields = isSurgical ? _CSV_DEMO_FIELDS_SURG : _CSV_DEMO_FIELDS_MED;
  fields.forEach(function(k) {
    if (imported[k] !== undefined && imported[k] !== '') existing[k] = imported[k];
  });
  savePatient(existing.pid);
  stampTeamEdit(existing.teamId);
}

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
  var isSurg  = compartment === 'surgical';
  var fields  = isSurg ? _CSV_DEMO_FIELDS_SURG : _CSV_DEMO_FIELDS_MED;
  var nhiMap  = _buildCsvNhiMap(isSurg);

  var updateRows = [], newRows = [];
  _pendingImport.forEach(function(p) {
    if (p.nhi && nhiMap[p.nhi]) {
      updateRows.push({ imported: p, existing: nhiMap[p.nhi], diffs: _csvDemoDiff(nhiMap[p.nhi], p, fields) });
    } else {
      newRows.push(p);
    }
  });

  var count = _pendingImport.length;
  var statsParts = [];
  if (updateRows.length) statsParts.push('<strong>' + updateRows.length + '</strong> to update');
  if (newRows.length)    statsParts.push('<strong>' + newRows.length + '</strong> new');
  document.getElementById('importStats').innerHTML =
    '<strong>' + count + '</strong> patient' + (count !== 1 ? 's' : '') + ' in CSV' +
    (statsParts.length ? ' &mdash; ' + statsParts.join(', ') : '');

  var html = '';

  if (updateRows.length) {
    html += '<div class="import-preview-section-hdr"><span>Updates &mdash; ' + updateRows.length + '</span></div>';
    updateRows.forEach(function(r) {
      var p    = r.imported;
      var name = [p.firstName, p.lastName].filter(Boolean).join(' ') || '(no name)';
      var meta = [];
      if (p.nhi)                   meta.push('NHI: ' + p.nhi);
      if (isSurg && p.smo)         meta.push(p.smo);
      else if (!isSurg && p.ward)  meta.push(p.ward);
      if (p.bed)                   meta.push('Bed ' + p.bed);
      var diffText = r.diffs.length
        ? r.diffs.map(function(d) { return h(d); }).join(' &middot; ')
        : '<span class="import-diff-nochange">No demographic changes</span>';
      html += '<div class="import-preview-item">' +
        '<div class="import-preview-row">' +
          '<span class="import-badge import-badge-update">update</span>' +
          '<span class="import-preview-name">' + h(name) + '</span>' +
          '<span class="import-preview-meta">' + h(meta.join(' · ')) + '</span>' +
        '</div>' +
        '<div class="import-diff-lines">' + diffText + '</div>' +
      '</div>';
    });
  }

  if (newRows.length) {
    html += '<div class="import-preview-section-hdr"><span>New patients &mdash; ' + newRows.length + '</span></div>';
    newRows.forEach(function(p) {
      var name = [p.firstName, p.lastName].filter(Boolean).join(' ') || '(no name)';
      var meta = [];
      if (p.nhi)                   meta.push('NHI: ' + p.nhi);
      if (isSurg && p.smo)         meta.push(p.smo);
      else if (!isSurg && p.ward)  meta.push(p.ward);
      if (p.bed)                   meta.push('Bed ' + p.bed);
      if (isSurg) {
        var autoTeam = teams.find(function(t) { return t.id === p._autoTeam; });
        if (autoTeam) meta.push('→ ' + autoTeam.name);
      }
      html += '<div class="import-preview-item">' +
        '<div class="import-preview-row">' +
          '<span class="import-badge import-badge-new">new</span>' +
          '<span class="import-preview-name">' + h(name) + '</span>' +
          '<span class="import-preview-meta">' + h(meta.join(' · ')) + '</span>' +
        '</div>' +
      '</div>';
    });
  }

  document.getElementById('importPreviewList').innerHTML = html;

  var noteEl = document.getElementById('importDupNote');
  if (noteEl) {
    noteEl.innerHTML = updateRows.length
      ? '<div class="import-update-note">Matched patients will have demographics refreshed only — clinical notes, POD, and op date will not be changed.</div>'
      : '';
  }

  // Button labels
  var addLabel;
  if (updateRows.length && newRows.length) {
    addLabel = 'Update ' + updateRows.length + ' + add ' + newRows.length;
  } else if (updateRows.length) {
    addLabel = 'Update demographics (' + updateRows.length + ')';
  } else {
    addLabel = 'Import all (' + newRows.length + ')';
  }
  document.getElementById('importAddBtn').textContent = addLabel;

  if (isSurg) {
    var affectedTeamIds = new Set(_pendingImport.map(function(p) { return p._autoTeam || currentTeam; }).filter(Boolean));
    var existingCount = Array.from(affectedTeamIds).reduce(function(s, tid) { return s + (allPatients[tid] || []).length; }, 0);
    document.getElementById('importReplaceBtn').textContent =
      existingCount ? 'Replace all (' + existingCount + ' existing)' : 'Import as new list';
  } else {
    var existing = patients.length;
    document.getElementById('importReplaceBtn').textContent =
      existing ? 'Replace all ' + existing + ' patient' + (existing !== 1 ? 's' : '') : 'Import as new list';
  }

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
  var isSurg = compartment === 'surgical';

  if (isSurg) {
    if (replace) {
      var groups = {};
      _pendingImport.forEach(function(p) {
        var tid = p._autoTeam || currentTeam;
        if (!groups[tid]) groups[tid] = [];
        groups[tid].push(p);
      });
      Object.keys(groups).forEach(function(tid) {
        var existing = allPatients[tid] || [];
        if (existing.length) {
          pushUndo({ type: 'clear_all', patients: deepClone(existing), teamId: tid, desc: 'replaced surgical patients' });
          existing.forEach(function(p) { deletePatientFromServer(p.pid, tid); });
          allPatients[tid] = [];
        }
      });
      var total = 0;
      Object.entries(groups).forEach(function([tid, pts]) {
        if (!allPatients[tid]) allPatients[tid] = [];
        pts.forEach(function(p) {
          var newP = Object.assign({}, p, { pid: newPid(), teamId: tid });
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

    // Surgical smart merge: update demographics for NHI matches, create new for others
    var nhiMap = _buildCsvNhiMap(true);
    var updatedCount = 0, addedCount = 0;
    var toAdd = {};
    _pendingImport.forEach(function(p) {
      if (p.nhi && nhiMap[p.nhi]) {
        _csvApplyDemoUpdate(nhiMap[p.nhi], p, true);
        updatedCount++;
      } else {
        var tid = p._autoTeam || currentTeam;
        if (!toAdd[tid]) toAdd[tid] = [];
        toAdd[tid].push(p);
      }
    });
    Object.entries(toAdd).forEach(function([tid, pts]) {
      if (!allPatients[tid]) allPatients[tid] = [];
      pts.forEach(function(p) {
        var newP = Object.assign({}, p, { pid: newPid(), teamId: tid });
        delete newP._autoTeam;
        allPatients[tid].unshift(newP);
        savePatient(newP.pid);
        addedCount++;
      });
      stampTeamEdit(tid);
    });
    patients = getTeamPatients(currentTeam);
    render(); closeImportModal(); checkDuplicates();
    var parts = [];
    if (updatedCount) parts.push(updatedCount + ' updated');
    if (addedCount)   parts.push(addedCount + ' added');
    showToast(parts.join(', ') || 'No changes');
    return;
  }

  // Medical
  if (replace) {
    var saved = deepClone(patients);
    pushUndo({ type: 'clear_all', patients: saved, teamId: currentTeam, desc: 'replaced all patients' });
    (allPatients[currentTeam] || []).forEach(function(p) { deletePatientFromServer(p.pid, currentTeam); });
    allPatients[currentTeam] = [];
    patients = allPatients[currentTeam];
    _pendingImport.forEach(function(p) { p.pid = newPid(); p.teamId = currentTeam; savePatient(p.pid); });
    patients.unshift.apply(patients, _pendingImport);
    render(); closeImportModal(); checkDuplicates();
    showToast(_pendingImport.length + ' patient' + (_pendingImport.length !== 1 ? 's' : '') + ' imported');
    return;
  }

  // Medical smart merge: update demographics for NHI matches, create new for others
  var nhiMap = _buildCsvNhiMap(false);
  var updatedCount = 0, addedCount = 0;
  _pendingImport.forEach(function(p) {
    if (p.nhi && nhiMap[p.nhi]) {
      _csvApplyDemoUpdate(nhiMap[p.nhi], p, false);
      updatedCount++;
    } else {
      p.pid = newPid(); p.teamId = currentTeam;
      savePatient(p.pid);
      patients.unshift(p);
      addedCount++;
    }
  });
  if (updatedCount || addedCount) stampTeamEdit(currentTeam);
  render(); closeImportModal(); checkDuplicates();
  var parts = [];
  if (updatedCount) parts.push(updatedCount + ' updated');
  if (addedCount)   parts.push(addedCount + ' added');
  showToast(parts.join(', ') || 'No changes');
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
