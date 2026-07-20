/* ================================================================
   SURGICAL COMPARTMENT
   ================================================================ */

function switchCompartment(comp) {
  if (compartment === comp) return;
  if (compartment === 'surgical') {
    currentSurgTeam = currentTeam;
    localStorage.setItem('gm_cur_surg_team', currentSurgTeam);
  } else {
    localStorage.setItem('gm_cur_team', currentTeam);
  }
  compartment = comp;
  localStorage.setItem('gm_compartment', comp);
  surgConsFilter = 'All';
  currentFilter  = 'All';
  if (comp === 'surgical') {
    currentTeam = currentSurgTeam;
    if (!teams.find(t => t.id === currentTeam && teamBelongsTo(t, 'surgical'))) {
      currentTeam = currentSurgTeam = (teams.find(t => teamBelongsTo(t, 'surgical')) || {}).id || 'surg_boo';
    }
  } else {
    currentTeam = localStorage.getItem('gm_cur_team') || 'team1';
    if (!teams.find(t => t.id === currentTeam && teamBelongsTo(t, 'medical'))) {
      currentTeam = (teams.find(t => teamBelongsTo(t, 'medical')) || {}).id || 'team1';
    }
  }
  patients = getTeamPatients(currentTeam);
  normalizePatients();
  updateCompartmentUI();
  renderTeamTabs();
  renderFilterBar();
  render();
  checkDuplicates();
  updateLastUpdatedText();
}

function updateCompartmentUI() {
  const medBtn  = document.getElementById('cmpMed');
  const surgBtn = document.getElementById('cmpSurg');
  if (medBtn)  medBtn.classList.toggle('active',  compartment === 'medical');
  if (surgBtn) surgBtn.classList.toggle('active', compartment === 'surgical');
  const titleEl = document.getElementById('barTitle');
  if (titleEl) titleEl.innerHTML = compartment === 'surgical'
    ? 'Surgical &mdash; Patient Handover'
    : 'General Medicine &mdash; Patient Handover';
  const exportLbl = document.getElementById('hdrExportLabel');
  if (exportLbl) exportLbl.textContent = compartment === 'surgical'
    ? 'Export Surgical Sheet (.xlsx)'
    : 'Export Handover Sheet (.xlsx)';
  const xlsxItem = document.getElementById('hdrXlsxImportItem');
  if (xlsxItem) xlsxItem.style.display = compartment === 'surgical' ? '' : 'none';
}

function renderFilterBar() {
  const medFL  = document.getElementById('medFilterLeft');
  const surgFL = document.getElementById('surgFilterLeft');
  if (compartment === 'surgical') {
    if (medFL)  medFL.style.display  = 'none';
    if (surgFL) {
      surgFL.style.display = '';
      const consultants = getTeamConsultants(currentTeam);
      const opts = ['All', ...consultants];
      surgFL.innerHTML = '<span class="filter-lbl">Consultant</span>' +
        opts.map(c =>
          '<button class="filter-btn' + (surgConsFilter === c ? ' active' : '') + '"' +
          ' data-c="' + h(c) + '" onclick="setSurgFilter(this.dataset.c)">' + h(c) + '</button>'
        ).join('');
    }
  } else {
    if (medFL)  medFL.style.display  = '';
    if (surgFL) surgFL.style.display = 'none';
  }
}

function setSurgFilter(consultant) {
  surgConsFilter = consultant;
  renderFilterBar();
  render();
}

function surgCardHTML(p) {
  const pid = p.pid;
  const consultants = getTeamConsultants(p.teamId);
  const smoOptions = consultants.slice();
  if (p.smo && !smoOptions.includes(p.smo)) smoOptions.push(p.smo);
  const smoField = smoOptions.length
    ? '<select class="hdr-sel surg-smo-sel" onchange="setField(\'' + pid + '\',\'smo\',this.value)">' +
        '<option value="">—</option>' +
        smoOptions.map(c => '<option value="' + h(c) + '"' + (p.smo === c ? ' selected' : '') + '>' + h(c) + '</option>').join('') +
      '</select>'
    : '<input class="hdr-inp surg-smo-inp" type="text" value="' + h(p.smo || '') + '" placeholder="—"' +
        ' oninput="setField(\'' + pid + '\',\'smo\',this.value)">';
  return (
    '<div class="card" data-pid="' + pid + '">' +
    '<div class="card-top">' +
      '<div class="card-top-left">' +
        '<div class="pt-hdr-grid">' +
          '<input class="hdr-inp hdr-name-inp f-fn" type="text" value="' + h(p.firstName) + '" placeholder="First name"' +
            ' oninput="setField(\'' + pid + '\',\'firstName\',this.value)" onblur="checkDuplicates()">' +
          '<div class="hdr-row1-rest">' +
            '<input class="hdr-inp hdr-name-inp" type="text" value="' + h(p.lastName) + '" placeholder="Last name"' +
              ' oninput="setField(\'' + pid + '\',\'lastName\',this.value)" onblur="checkDuplicates()">' +
            '<span class="hdr-demog-sep">|</span>' +
            '<input class="hdr-inp hdr-age-inp" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" value="' + h(p.age) + '" placeholder="Age"' +
              ' oninput="this.value=this.value.replace(/[^0-9]/g,\'\');setField(\'' + pid + '\',\'age\',this.value)">' +
            '<select class="hdr-sel hdr-gender-sel" onchange="setField(\'' + pid + '\',\'gender\',this.value)">' +
              '<option value="">Gender</option>' +
              '<option value="M"' + (p.gender === 'M' ? ' selected' : '') + '>Male</option>' +
              '<option value="F"' + (p.gender === 'F' ? ' selected' : '') + '>Female</option>' +
            '</select>' +
          '</div>' +
          '<div class="hdr-nhi-cell">' +
            '<span class="hdr-meta-lbl">NHI</span>' +
            '<input class="hdr-inp hdr-nhi-inp" type="text" value="' + h(p.nhi) + '" placeholder="—" maxlength="8"' +
              ' oninput="this.value=this.value.toUpperCase();setField(\'' + pid + '\',\'nhi\',this.value)"' +
              ' onblur="checkDuplicates()">' +
          '</div>' +
          '<div class="surg-loc-group">' +
            '<span class="hdr-meta-lbl">Bed</span>' +
            '<input class="hdr-inp hdr-bed-inp" type="text" value="' + h(p.bed) + '" placeholder="—"' +
              ' oninput="setField(\'' + pid + '\',\'bed\',this.value)">' +
            '<span class="hdr-demog-sep">&middot;</span>' +
            '<span class="hdr-meta-lbl">SMO</span>' +
            smoField +
            '<span class="hdr-demog-sep">&middot;</span>' +
            '<span class="hdr-meta-lbl">DOA</span>' +
            '<input class="hdr-inp surg-doa-inp" type="text" value="' + h(p.doa || '') + '" placeholder="—" maxlength="8"' +
              ' oninput="setField(\'' + pid + '\',\'doa\',this.value)">' +
            '<span class="hdr-demog-sep">&middot;</span>' +
            '<span class="hdr-meta-lbl">POD</span>' +
            '<input class="hdr-inp surg-pod-inp" type="text" inputmode="numeric" value="' + h(p.pod || '') + '" placeholder="—"' +
              ' oninput="setField(\'' + pid + '\',\'pod\',this.value)">' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="pt-menu-wrap no-print">' +
        '<button class="btn-pt-menu" onclick="togglePtMenu(event,\'' + pid + '\')" title="Options">&#8942;</button>' +
        '<div class="pt-dropdown" id="pt-menu-' + pid + '" style="display:none">' +
          '<button onclick="openMoveModal(\'' + pid + '\')">Move Patient</button>' +
          '<button class="danger" onclick="openDeleteModal(\'' + pid + '\')">Delete Patient</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="card-body">' +
      '<div class="surg-field-grid">' +
        '<div class="f"><span class="lbl">Problem List</span>' +
          '<textarea class="inp" rows="3" placeholder="Active problems..."' +
          ' oninput="setField(\'' + pid + '\',\'problemList\',this.value);autoH(this)"' +
          ' onfocus="autoH(this)">' + h(p.problemList || '') + '</textarea>' +
        '</div>' +
        '<div class="f"><span class="lbl">Background</span>' +
          '<textarea class="inp" rows="3" placeholder="Past medical history, relevant background..."' +
          ' oninput="setField(\'' + pid + '\',\'background\',this.value);autoH(this)"' +
          ' onfocus="autoH(this)">' + h(p.background || '') + '</textarea>' +
        '</div>' +
        '<div class="f"><span class="lbl">Results</span>' +
          '<textarea class="inp" rows="3" placeholder="Investigations, bloods, imaging..."' +
          ' oninput="setField(\'' + pid + '\',\'results\',this.value);autoH(this)"' +
          ' onfocus="autoH(this)">' + h(p.results || '') + '</textarea>' +
        '</div>' +
        '<div class="f"><span class="lbl">Plan</span>' +
          '<textarea class="inp" rows="3" placeholder="Management plan, disposition..."' +
          ' oninput="setField(\'' + pid + '\',\'plan\',this.value);autoH(this)"' +
          ' onfocus="autoH(this)">' + h(p.plan || '') + '</textarea>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '</div>'
  );
}

function csvRowToSurgPatient(row) {
  const sex = (row['sex'] || '').toUpperCase();
  let gender = '';
  if (sex === 'M' || sex === 'MALE')        gender = 'M';
  else if (sex === 'F' || sex === 'FEMALE') gender = 'F';

  const clinician = row['responsible clinician'] || '';
  const surname   = extractSurgeonSurname(clinician);
  const match     = SURG_CONSULTANTS[surname.toLowerCase()];
  const smo       = match ? match.smo : surname;
  const autoTeam  = match ? match.team : null;

  return {
    compartment: 'surgical',
    firstName:   (row['given name']   || '').trim(),
    lastName:    (row['family name']  || '').trim(),
    middleName:  (row['middle name']  || '').trim(),
    age:         (row['age']          || '').trim(),
    gender,
    genderOther: '',
    title:       (row['prefix']       || '').trim(),
    nhi:         (row['nhi']          || '').trim().toUpperCase(),
    ward:        'Surgical',
    bed:         (row['bed']          || '').trim(),
    smo,
    _autoTeam:   autoTeam,
    doa:         parseSurgAdmissionDate(row['admission date'] || ''),
    pod:         '',
    problemList: '',
    background:  '',
    results:     '',
    plan:        '',
  };
}

/* ---- SURGICAL XLSX IMPORT ---- */

let _surgXlsxDiff    = null; // { updates: [...], unmatched: [...] }
let _surgXlsxCreated = new Set();

const SURG_XLSX_CLINICAL_FIELDS = [
  { key: 'problemList', label: 'Problem List' },
  { key: 'background',  label: 'Background'   },
  { key: 'results',     label: 'Results'       },
  { key: 'plan',        label: 'Plan'          },
];

function triggerSurgXlsxImport() {
  const inp = document.getElementById('importXlsxFileInput');
  inp.value = ''; inp.click();
}

function handleSurgXlsxFile(input) {
  const file = input.files[0];
  if (!file) return;
  if (typeof XLSX === 'undefined') {
    alert('The XLSX library has not loaded yet. Please check your internet connection and try again.');
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const wb   = XLSX.read(data, { type: 'array', cellText: false, cellDates: false });
      const wsName = wb.SheetNames[0];
      if (!wsName) { alert('No worksheet found in this file.'); return; }
      const ws   = wb.Sheets[wsName];
      const rows = parseSurgXlsxRows(ws);
      if (!rows.length) { alert('No valid patient rows found in this file. Check it is a surgical handover XLSX.'); return; }
      const diff = diffSurgXlsx(rows);
      openSurgXlsxPreview(diff);
    } catch (err) {
      console.error('[surg-xlsx] parse error:', err);
      alert('Could not read this file. Make sure it is a valid surgical handover XLSX.');
    }
  };
  reader.readAsArrayBuffer(file);
}

function parseSurgXlsxRows(ws) {
  const jsonRows = XLSX.utils.sheet_to_json(ws, { raw: true, defval: '' });
  const result = [];
  for (const row of jsonRows) {
    const parsed = _parseSurgXlsxRow(row);
    if (parsed) result.push(parsed);
  }
  return result;
}

function _parseSurgXlsxRow(row) {
  // PATIENT cell lines: "SURNAME, Given [Middle] [(Title)]" / "ageSex" / "NHI"
  const patientRaw = String(row['PATIENT'] || '').trim();
  if (!patientRaw || patientRaw === '(unknown)') return null;

  const lines = patientRaw.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
  const nameLine = lines[0] || '';
  var ageSexStr = '', nhi = '';

  if (lines.length >= 3) {
    ageSexStr = lines[1];
    nhi       = lines[2].toUpperCase();
  } else if (lines.length === 2) {
    if (/^\d{1,3}[MF]?$/i.test(lines[1])) { ageSexStr = lines[1]; }
    else { nhi = lines[1].toUpperCase(); }
  }

  // Parse name: "SMITH, John Robert (Mr)"
  var lastName = '', firstName = '', middleName = '', title = '';
  var commaIdx = nameLine.indexOf(',');
  if (commaIdx >= 0) {
    lastName = nameLine.slice(0, commaIdx).trim();
    var rest = nameLine.slice(commaIdx + 1).trim();
    var titleMatch = rest.match(/\(([^)]+)\)\s*$/);
    title = titleMatch ? titleMatch[1].trim() : '';
    var givenFull = (titleMatch ? rest.slice(0, titleMatch.index) : rest).trim();
    var givenParts = givenFull.split(/\s+/);
    firstName  = givenParts[0] || '';
    middleName = givenParts.slice(1).join(' ') || '';
  } else {
    lastName = nameLine;
  }

  // Age+sex: "81M" / "70F" / "81"
  var ageSexMatch = ageSexStr.match(/^(\d+)([MF])?$/i);
  var age    = ageSexMatch ? ageSexMatch[1] : '';
  var gender = (ageSexMatch && ageSexMatch[2]) ? ageSexMatch[2].toUpperCase() : '';

  // BED cell: "Surg\nB12"
  var bedRaw   = String(row['BED'] || '').trim();
  var bedParts = bedRaw.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
  var bed = '';
  if (bedParts.length >= 2) {
    bed = bedParts[1];
  } else if (bedParts.length === 1 && bedParts[0].toLowerCase() !== 'surg') {
    bed = bedParts[0];
  }

  // SMO & DOA cell: "O'Grady\n15/7"
  var smoDoaKey = 'SMO & DOA';
  var smoDoaRaw = String(row[smoDoaKey] || '').trim();
  var smoDoaParts = smoDoaRaw.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
  var smoRaw = smoDoaParts[0] || '';
  var doa    = smoDoaParts[1] || '';

  // Normalize SMO: replace curly apostrophes before lookup
  var smoLookupKey = smoRaw.toLowerCase().replace(/[‘’ʼ]/g, "'");
  var smoEntry     = SURG_CONSULTANTS[smoLookupKey];
  var smo          = smoEntry ? smoEntry.smo : smoRaw;
  var suggestedTeam = smoEntry ? smoEntry.team : null;

  var pod         = String(row['POD']          || '').trim();
  var problemList = String(row['PROBLEM LIST'] || '').trim();
  var background  = String(row['BACKGROUND']   || '').trim();
  var results     = String(row['RESULTS']      || '').trim();
  var plan        = String(row['PLAN']         || '').trim();

  return { nhi, lastName, firstName, middleName, title, age, gender, bed, smo, doa, pod, problemList, background, results, plan, suggestedTeam };
}

function diffSurgXlsx(rows) {
  // Index all surgical patients across all teams by NHI
  var byNHI = new Map();
  Object.keys(allPatients).forEach(function(tid) {
    (allPatients[tid] || []).forEach(function(p) {
      if (p.compartment === 'surgical' && p.nhi) {
        byNHI.set(p.nhi.trim().toUpperCase(), p);
      }
    });
  });

  var updates   = [];
  var unmatched = [];

  rows.forEach(function(row) {
    if (!row.nhi) { unmatched.push(row); return; }
    var existing = byNHI.get(row.nhi.toUpperCase());
    if (!existing) { unmatched.push(row); return; }

    var fieldChanges = [];
    SURG_XLSX_CLINICAL_FIELDS.forEach(function(f) {
      var newVal = row[f.key] || '';
      var oldVal = (existing[f.key] || '').trim();
      if (newVal && newVal !== oldVal) {
        fieldChanges.push({ key: f.key, label: f.label, oldVal: oldVal, newVal: newVal });
      }
    });
    if (fieldChanges.length > 0) {
      updates.push({ existing: existing, row: row, fieldChanges: fieldChanges });
    }
  });

  return { updates: updates, unmatched: unmatched };
}

function openSurgXlsxPreview(diff) {
  _surgXlsxDiff    = diff;
  _surgXlsxCreated = new Set();
  renderSurgXlsxPreview();
  document.getElementById('surgXlsxModal').classList.add('open');
}

function closeSurgXlsxModal() {
  document.getElementById('surgXlsxModal').classList.remove('open');
  _surgXlsxDiff    = null;
  _surgXlsxCreated = new Set();
}

function handleSurgXlsxOverlayClick(e) {
  if (e.target === document.getElementById('surgXlsxModal')) closeSurgXlsxModal();
}

function renderSurgXlsxPreview() {
  var diff = _surgXlsxDiff;
  if (!diff) return;
  var updates   = diff.updates;
  var unmatched = diff.unmatched;

  var createdCount = _surgXlsxCreated.size;
  document.getElementById('surgXlsxStats').innerHTML =
    '<strong>' + updates.length + '</strong> update' + (updates.length !== 1 ? 's' : '') +
    ' &middot; <strong>' + unmatched.length + '</strong> unmatched' +
    (createdCount ? ' (<strong>' + createdCount + '</strong> created)' : '');

  var html = '';

  if (updates.length > 0) {
    html += '<div class="import-preview-section-hdr"><span>Will Update &mdash; ' + updates.length + '</span></div>';
    html += updates.map(function(u) {
      var name = [u.existing.firstName, u.existing.lastName].filter(Boolean).join(' ') || u.row.nhi || '(unknown)';
      var inner = '<div class="surg-diff-name">' + h(name) + '<span class="surg-diff-nhi">' + h(u.existing.nhi) + '</span></div>';
      inner += u.fieldChanges.map(function(fc) {
        var oldTrunc = trunc(fc.oldVal, 72);
        var newTrunc = trunc(fc.newVal, 72);
        return '<div class="surg-diff-field">' +
          '<span class="surg-diff-label">' + h(fc.label) + '</span>' +
          '<span class="surg-diff-val">' +
            (oldTrunc ? '<span class="surg-diff-old">' + h(oldTrunc) + '</span> <span class="surg-diff-arrow">&rarr;</span> ' : '') +
            '<span class="surg-diff-new">' + h(newTrunc) + '</span>' +
          '</span></div>';
      }).join('');
      return '<div class="surg-diff-row">' + inner + '</div>';
    }).join('');
  }

  if (unmatched.length > 0) {
    html += '<div class="import-preview-section-hdr"><span>Unmatched &mdash; ' + unmatched.length + '</span></div>';
    var surgTeams = teams.filter(function(t) { return teamBelongsTo(t, 'surgical'); });
    html += unmatched.map(function(row, i) {
      var created = _surgXlsxCreated.has(i);
      var name = [row.firstName, row.lastName].filter(Boolean).join(' ') || '(no name)';
      var metaParts = [];
      if (row.nhi)  metaParts.push(row.nhi);
      if (row.bed)  metaParts.push('Bed ' + row.bed);
      if (row.smo)  metaParts.push(row.smo);
      var meta = metaParts.join(' &middot; ');
      var teamOpts = surgTeams.map(function(t) {
        var sel = t.id === (row.suggestedTeam || currentTeam) ? ' selected' : '';
        return '<option value="' + h(t.id) + '"' + sel + '>' + h(t.name) + '</option>';
      }).join('');
      var teamSel = surgTeams.length > 1
        ? '<select class="surg-team-sel" id="surgXlsxTeamSel-' + i + '">' + teamOpts + '</select>'
        : '';
      var btn = created
        ? '<span style="color:var(--muted);font-size:11px;font-style:italic">Created</span>'
        : '<button class="surg-create-btn" onclick="createSurgXlsxPatient(' + i + ')">' +
            '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
            ' Create' +
          '</button>';
      return '<div class="surg-unmatch-row' + (created ? ' surg-unmatch-done' : '') + '">' +
        '<div class="surg-diff-name">' + h(name) + '</div>' +
        '<div class="import-preview-meta">' + meta + '</div>' +
        '<div class="surg-unmatch-actions">' + teamSel + btn + '</div>' +
        '</div>';
    }).join('');
  }

  if (!updates.length && !unmatched.length) {
    html = '<div class="import-preview-more">No patient rows found in this sheet.</div>';
  }

  document.getElementById('surgXlsxPreviewList').innerHTML = html;

  var confirmBtn = document.getElementById('surgXlsxConfirmBtn');
  confirmBtn.disabled = updates.length === 0;
  confirmBtn.textContent = updates.length
    ? 'Confirm ' + updates.length + ' Update' + (updates.length !== 1 ? 's' : '')
    : 'No Updates';
}

function createSurgXlsxPatient(idx) {
  var diff = _surgXlsxDiff;
  if (!diff || _surgXlsxCreated.has(idx)) return;
  var row = diff.unmatched[idx];
  if (!row) return;

  var surgTeams  = teams.filter(function(t) { return teamBelongsTo(t, 'surgical'); });
  var teamSelEl  = document.getElementById('surgXlsxTeamSel-' + idx);
  var tid = teamSelEl ? teamSelEl.value
    : (row.suggestedTeam || (surgTeams[0] && surgTeams[0].id) || currentTeam);

  var p = {
    pid: newPid(), teamId: tid, compartment: 'surgical',
    firstName: row.firstName || '', lastName: row.lastName || '',
    middleName: row.middleName || '', title: row.title || '',
    age: row.age || '', gender: row.gender || '', genderOther: '',
    nhi: row.nhi || '', ward: 'Surgical',
    bed: row.bed || '', smo: row.smo || '',
    doa: row.doa || '', pod: row.pod || '',
    problemList: row.problemList || '', background: row.background || '',
    results: row.results || '', plan: row.plan || '',
  };

  if (!allPatients[tid]) allPatients[tid] = [];
  allPatients[tid].unshift(p);
  savePatient(p.pid);
  stampTeamEdit(tid);

  _surgXlsxCreated.add(idx);
  renderSurgXlsxPreview();

  if (tid === currentTeam) {
    patients = getTeamPatients(currentTeam);
    render();
  }
  var teamObj = teams.find(function(t) { return t.id === tid; });
  showToast('Created ' + ([p.firstName, p.lastName].filter(Boolean).join(' ') || p.nhi || 'patient') + ' in ' + (teamObj ? teamObj.name : tid));
}

function applySurgXlsxImport() {
  var diff = _surgXlsxDiff;
  if (!diff) return;
  var count = 0;
  var affectedTeams = new Set();

  diff.updates.forEach(function(u) {
    var p = u.existing;
    u.fieldChanges.forEach(function(fc) { p[fc.key] = fc.newVal; });
    savePatient(p.pid);
    affectedTeams.add(p.teamId);
    count++;
  });

  affectedTeams.forEach(function(tid) { stampTeamEdit(tid); });
  patients = getTeamPatients(currentTeam);
  render();
  closeSurgXlsxModal();
  checkDuplicates();
  showToast(count + ' patient' + (count !== 1 ? 's' : '') + ' updated from XLSX');
}

