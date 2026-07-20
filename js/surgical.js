/* ================================================================
   SURGICAL COMPARTMENT
   ================================================================ */

/* ---- POD / OP-DATE HELPERS ---- */
function _todayMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function computePOD(opDate) {
  if (!opDate) return '';
  const parts = opDate.split('-').map(Number);
  if (parts.length < 3) return '';
  const op = new Date(parts[0], parts[1] - 1, parts[2]);
  op.setHours(0, 0, 0, 0);
  const diff = Math.floor((_todayMidnight() - op) / 86400000);
  return diff < 0 ? 0 : diff;
}

function opDateFromPOD(n) {
  const d = _todayMidnight();
  d.setDate(d.getDate() - n);
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function fmtOpDate(isoDate) {
  if (!isoDate) return '';
  const parts = isoDate.split('-').map(Number);
  if (parts.length < 3) return '';
  return parts[2] + '/' + parts[1];
}

function parseDMtoISO(dmStr) {
  if (!dmStr) return '';
  const parts = dmStr.split('/');
  if (parts.length < 2) return '';
  const day = parseInt(parts[0], 10);
  const mon = parseInt(parts[1], 10);
  if (isNaN(day) || isNaN(mon) || day < 1 || day > 31 || mon < 1 || mon > 12) return '';
  const today = _todayMidnight();
  let year = today.getFullYear();
  const candidate = new Date(year, mon - 1, day);
  candidate.setHours(0, 0, 0, 0);
  if (candidate > today) year--;
  return year + '-' + String(mon).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}

function setSurgPod(pid, val) {
  const p = findPatient(pid);
  if (!p) return;
  const trimmed = val.trim();
  if (trimmed === '') {
    p.opDate = '';
  } else {
    const n = parseInt(trimmed, 10);
    if (!isNaN(n) && n >= 0) p.opDate = opDateFromPOD(n);
  }
  savePatient(pid);
  const card = qpid(pid);
  if (!card) return;
  const podInp = card.querySelector('.surg-pod-inp');
  if (podInp) {
    const computed = computePOD(p.opDate);
    podInp.value = computed !== '' ? String(computed) : '';
  }
  const opInp = card.querySelector('.surg-opdate-inp');
  if (opInp) opInp.value = fmtOpDate(p.opDate);
}

function setSurgOpDate(pid, val) {
  const p = findPatient(pid);
  if (!p) return;
  p.opDate = parseDMtoISO(val.trim());
  savePatient(pid);
  const card = qpid(pid);
  if (!card) return;
  const podInp = card.querySelector('.surg-pod-inp');
  if (podInp) {
    const computed = computePOD(p.opDate);
    podInp.value = computed !== '' ? String(computed) : '';
  }
  const opInp = card.querySelector('.surg-opdate-inp');
  if (opInp) opInp.value = fmtOpDate(p.opDate);
}

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
  const pid     = p.pid;
  const livePOD = computePOD(p.opDate || '');
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
            '<input class="hdr-inp surg-doa-inp" type="text" value="' + h((p.doa || '').split(' ')[0]) + '" placeholder="—" maxlength="8"' +
              ' oninput="setField(\'' + pid + '\',\'doa\',this.value)">' +
            '<span class="hdr-demog-sep">&middot;</span>' +
            '<span class="hdr-meta-lbl">POD</span>' +
            '<input class="hdr-inp surg-pod-inp" type="text" inputmode="numeric" value="' + (livePOD !== '' ? String(livePOD) : '') + '" placeholder="—"' +
              ' onchange="setSurgPod(\'' + pid + '\',this.value)">' +
            '<span class="hdr-demog-sep">&middot;</span>' +
            '<span class="hdr-meta-lbl">Op</span>' +
            '<input class="hdr-inp surg-opdate-inp" type="text" value="' + h(fmtOpDate(p.opDate || '')) + '" placeholder="—" maxlength="6"' +
              ' onchange="setSurgOpDate(\'' + pid + '\',this.value)">' +
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
    opDate:      '',
    problemList: '',
    background:  '',
    results:     '',
    plan:        '',
  };
}

/* ---- SURGICAL XLSX IMPORT ---- */

let _surgXlsxDiff    = null; // { updates, unmatched, noNhi, noChanges, sheetName, colCount, colHeaders }
let _surgXlsxCreated = { unmatched: new Set(), noNhi: new Set() };
let _surgXlsxWb      = null; // SheetJS workbook, kept until modal closes

const SURG_XLSX_CLINICAL_FIELDS = [
  { key: 'problemList', label: 'Problem List' },
  { key: 'background',  label: 'Background'   },
  { key: 'results',     label: 'Results'       },
  { key: 'plan',        label: 'Plan'          },
];

// Maps any raw header string → canonical key (case-insensitive, synonym-aware)
function _surgXlsxNormHeader(raw) {
  var s = String(raw || '').replace(/\n/g, ' ').trim().toLowerCase();
  switch (s) {
    case 'patient':              return 'PATIENT';
    case 'bed':                  return 'BED';
    case 'smo & doa':
    case 'smo':
    case 'smo/doa':              return 'SMO_DOA';
    case 'pod':
    case 'dxpo':
    case 'dx po':                return 'POD';
    case 'problem list':
    case 'problems':
    case 'problem':              return 'PROBLEM_LIST';
    case 'background':           return 'BACKGROUND';
    case 'results':
    case 'result':               return 'RESULTS';
    case 'plan':
    case 'plans':
    case 'plans/jobs':           return 'PLAN';
    default:                     return null;
  }
}

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
      if (!wb.SheetNames.length) { alert('No worksheets found in this file.'); return; }
      _surgXlsxWb = wb;
      if (wb.SheetNames.length === 1) {
        _surgXlsxParseAndPreview(wb.SheetNames[0]);
      } else {
        _showSurgXlsxSheetPicker(wb.SheetNames);
      }
    } catch (err) {
      console.error('[surg-xlsx] read error:', err);
      alert('Could not read this file. Make sure it is a valid .xlsx file.');
    }
  };
  reader.readAsArrayBuffer(file);
}

function _showSurgXlsxSheetPicker(sheetNames) {
  var sel = document.getElementById('surgXlsxSheetSel');
  sel.innerHTML = sheetNames.map(function(name) {
    var selected = (name.toUpperCase() === 'BOO') ? ' selected' : '';
    return '<option value="' + h(name) + '"' + selected + '>' + h(name) + '</option>';
  }).join('');
  document.getElementById('surgXlsxSheetPicker').style.display    = '';
  document.getElementById('surgXlsxPreviewSection').style.display = 'none';
  document.getElementById('surgXlsxModal').classList.add('open');
}

function loadSurgXlsxSheet() {
  var sel = document.getElementById('surgXlsxSheetSel');
  var sheetName = sel ? sel.value : '';
  if (!sheetName || !_surgXlsxWb) return;
  _surgXlsxParseAndPreview(sheetName);
}

function _surgXlsxParseAndPreview(sheetName) {
  var wb = _surgXlsxWb;
  if (!wb) return;
  var ws = wb.Sheets[sheetName];
  if (!ws) { _showSurgXlsxError('Sheet "' + sheetName + '" not found in workbook.'); return; }

  var parsed;
  try {
    parsed = parseSurgXlsxRows(ws, sheetName);
  } catch (err) {
    console.error('[surg-xlsx] parse error:', err);
    _showSurgXlsxError('Error reading sheet "' + sheetName + '": ' + (err.message || err));
    return;
  }

  if (parsed.error) { _showSurgXlsxError(parsed.error); return; }
  if (!parsed.rows.length) {
    _showSurgXlsxError(
      'Couldn\'t find any patient rows on sheet "' + sheetName + '". ' +
      (parsed.colHeaders.length
        ? 'Recognised columns: ' + parsed.colHeaders.join(', ') + '.'
        : 'No recognised column headers found.')
    );
    return;
  }

  var diff = diffSurgXlsx(parsed.rows);
  diff.sheetName  = sheetName;
  diff.colCount   = parsed.colCount;
  diff.colHeaders = parsed.colHeaders;
  openSurgXlsxPreview(diff);
}

function _showSurgXlsxError(msg) {
  document.getElementById('surgXlsxSheetPicker').style.display    = 'none';
  document.getElementById('surgXlsxPreviewSection').style.display = '';
  document.getElementById('surgXlsxStats').innerHTML =
    '<span style="color:#c0392b;font-weight:600">' + h(msg) + '</span>';
  document.getElementById('surgXlsxPreviewList').innerHTML = '';
  var btn = document.getElementById('surgXlsxConfirmBtn');
  btn.disabled = true; btn.textContent = 'No Updates';
  document.getElementById('surgXlsxModal').classList.add('open');
}

var _XLSX_NHI_RE    = /\b([A-Z]{3}\d{4})\b/;
var _XLSX_AGE_SE_RE = /^(\d{1,3})(?:y?\/([MF])|([MF]))?$/i;

function parseSurgXlsxRows(ws, sheetName) {
  var ref = ws['!ref'];
  if (!ref) return { rows: [], colCount: 0, colHeaders: [], error: 'Sheet "' + (sheetName || '?') + '" appears to be empty.' };

  var fullRange = XLSX.utils.decode_range(ref);
  var hdrRow    = fullRange.s.r;

  // Scan header row to find real columns — stop after 20 consecutive empty cells
  var colMap   = {};  // canonical key → col index
  var colNames  = []; // display names of recognised headers
  var lastRealCol = fullRange.s.c - 1;
  var emptyRun    = 0;

  for (var col = fullRange.s.c; col <= fullRange.e.c && emptyRun < 20; col++) {
    var cell = ws[XLSX.utils.encode_cell({ r: hdrRow, c: col })];
    var raw  = cell ? String(cell.v || '').trim() : '';
    if (!raw) { emptyRun++; continue; }
    emptyRun = 0;
    lastRealCol = col;
    var norm = _surgXlsxNormHeader(raw);
    if (norm && !(norm in colMap)) { colMap[norm] = col; colNames.push(raw); }
  }

  if (!('PATIENT' in colMap)) {
    return {
      rows: [], colCount: 0, colHeaders: colNames,
      error: colNames.length
        ? 'No PATIENT column found on sheet "' + (sheetName || '?') + '". Found: ' + colNames.slice(0, 5).join(', ') + '.'
        : 'No recognisable column headers on sheet "' + (sheetName || '?') + '". Make sure you\'re selecting the right sheet.',
    };
  }

  // Limit the ref to real columns only, then parse rows
  var limitedRef  = XLSX.utils.encode_range({ s: { r: hdrRow, c: fullRange.s.c }, e: { r: fullRange.e.r, c: lastRealCol } });
  var originalRef = ws['!ref'];
  var jsonRows;
  try {
    ws['!ref'] = limitedRef;
    jsonRows = XLSX.utils.sheet_to_json(ws, { raw: true, defval: '' });
  } finally {
    ws['!ref'] = originalRef;
  }

  // Remap raw header keys → canonical keys
  var rows = [];
  for (var i = 0; i < jsonRows.length; i++) {
    var normRow = {};
    var rawRow  = jsonRows[i];
    Object.keys(rawRow).forEach(function(k) {
      var norm = _surgXlsxNormHeader(k);
      if (norm && !(norm in normRow)) normRow[norm] = rawRow[k];
    });
    var parsed = _parseSurgXlsxRow(normRow);
    if (parsed) rows.push(parsed);
  }

  return { rows: rows, colCount: colNames.length, colHeaders: colNames };
}

function _parseSurgXlsxRow(row) {
  var patientRaw = String(row['PATIENT'] || '').trim();
  if (!patientRaw || patientRaw === '(unknown)') return null;

  var lines    = patientRaw.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
  var nameLine = lines[0] || '';

  // NHI: find by pattern anywhere in the PATIENT cell
  var nhi = '';
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].toUpperCase().match(_XLSX_NHI_RE);
    if (m) { nhi = m[1]; break; }
  }

  // Age+sex: find in any non-NHI line (handles "81M", "70F", "63y/M")
  var age = '', gender = '';
  for (var j = 0; j < lines.length; j++) {
    var line = lines[j].trim();
    if (_XLSX_NHI_RE.test(line.toUpperCase())) continue;
    var am = line.match(_XLSX_AGE_SE_RE);
    if (am) { age = am[1]; gender = (am[2] || am[3] || '').toUpperCase(); break; }
  }

  // Name: "SMITH, John Robert (Mr)"
  var lastName = '', firstName = '', middleName = '', title = '';
  var commaIdx = nameLine.indexOf(',');
  if (commaIdx >= 0) {
    lastName = nameLine.slice(0, commaIdx).trim();
    var rest  = nameLine.slice(commaIdx + 1).trim();
    var titleMatch = rest.match(/\(([^)]+)\)\s*$/);
    title = titleMatch ? titleMatch[1].trim() : '';
    var givenFull  = (titleMatch ? rest.slice(0, titleMatch.index) : rest).trim();
    var givenParts = givenFull.split(/\s+/);
    firstName  = givenParts[0] || '';
    middleName = givenParts.slice(1).join(' ') || '';
  } else {
    lastName = nameLine;
  }

  // BED: "Surg\nB12" or "B12"
  var bedRaw   = String(row['BED'] || '').trim();
  var bedParts = bedRaw.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
  var bed = '';
  if (bedParts.length >= 2) {
    bed = bedParts[1];
  } else if (bedParts.length === 1 && bedParts[0].toLowerCase() !== 'surg') {
    bed = bedParts[0];
  }

  // SMO & DOA: "O'Grady\n15/7"
  var smoDoaRaw   = String(row['SMO_DOA'] || '').trim();
  var smoDoaParts = smoDoaRaw.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
  var smoRaw      = smoDoaParts[0] || '';
  var doa         = smoDoaParts[1] || '';
  var smoLookupKey = smoRaw.toLowerCase().replace(/[''ʼ]/g, "'");
  var smoEntry     = SURG_CONSULTANTS[smoLookupKey];
  var smo          = smoEntry ? smoEntry.smo : smoRaw;
  var suggestedTeam = smoEntry ? smoEntry.team : null;

  var pod         = String(row['POD']          || '').trim();
  var problemList = String(row['PROBLEM_LIST'] || '').trim();
  var background  = String(row['BACKGROUND']   || '').trim();
  var results     = String(row['RESULTS']      || '').trim();
  var plan        = String(row['PLAN']         || '').trim();

  return { nhi, lastName, firstName, middleName, title, age, gender, bed, smo, doa, pod, problemList, background, results, plan, suggestedTeam };
}

function diffSurgXlsx(rows) {
  var byNHI = new Map();
  Object.keys(allPatients).forEach(function(tid) {
    (allPatients[tid] || []).forEach(function(p) {
      if (p.compartment === 'surgical' && p.nhi) byNHI.set(p.nhi.trim().toUpperCase(), p);
    });
  });

  var updates = [], unmatched = [], noNhi = [], noChanges = [];

  rows.forEach(function(row) {
    if (!row.nhi) { noNhi.push(row); return; }
    var existing = byNHI.get(row.nhi.toUpperCase());
    if (!existing) { unmatched.push(row); return; }

    var fieldChanges = [];
    SURG_XLSX_CLINICAL_FIELDS.forEach(function(f) {
      var newVal = row[f.key] || '';
      var oldVal = (existing[f.key] || '').trim();
      if (newVal && newVal !== oldVal) fieldChanges.push({ key: f.key, label: f.label, oldVal: oldVal, newVal: newVal });
    });

    // POD → opDate
    var xlsxPodStr = row.pod ? String(row.pod).trim() : '';
    if (xlsxPodStr !== '') {
      var xlsxPod = parseInt(xlsxPodStr, 10);
      if (!isNaN(xlsxPod) && xlsxPod >= 0) {
        var currentPOD    = computePOD(existing.opDate);
        var currentPODStr = currentPOD !== '' ? String(currentPOD) : '';
        if (String(xlsxPod) !== currentPODStr) {
          fieldChanges.push({ key: '_pod_opdate', label: 'POD', oldVal: currentPODStr, newVal: String(xlsxPod), _opDate: opDateFromPOD(xlsxPod) });
        }
      }
    }

    if (fieldChanges.length > 0) updates.push({ existing: existing, row: row, fieldChanges: fieldChanges });
    else                          noChanges.push({ existing: existing, row: row });
  });

  return { updates: updates, unmatched: unmatched, noNhi: noNhi, noChanges: noChanges };
}

function openSurgXlsxPreview(diff) {
  _surgXlsxDiff    = diff;
  _surgXlsxCreated = { unmatched: new Set(), noNhi: new Set() };
  document.getElementById('surgXlsxSheetPicker').style.display    = 'none';
  document.getElementById('surgXlsxPreviewSection').style.display = '';
  renderSurgXlsxPreview();
  document.getElementById('surgXlsxModal').classList.add('open');
}

function closeSurgXlsxModal() {
  document.getElementById('surgXlsxModal').classList.remove('open');
  _surgXlsxDiff    = null;
  _surgXlsxCreated = { unmatched: new Set(), noNhi: new Set() };
  _surgXlsxWb      = null;
}

function handleSurgXlsxOverlayClick(e) {
  if (e.target === document.getElementById('surgXlsxModal')) closeSurgXlsxModal();
}

function renderSurgXlsxPreview() {
  var diff = _surgXlsxDiff;
  if (!diff) return;
  var updates   = diff.updates;
  var unmatched = diff.unmatched;
  var noNhi     = diff.noNhi     || [];
  var noChanges = diff.noChanges || [];

  // Stats: sheet info + row breakdown
  var metaParts = [];
  if (diff.sheetName) metaParts.push('Sheet: <strong>' + h(diff.sheetName) + '</strong>');
  if (diff.colCount)  metaParts.push(diff.colCount + ' column' + (diff.colCount !== 1 ? 's' : '') + ' detected');

  var statsParts = [];
  if (updates.length)   statsParts.push('<strong>' + updates.length   + '</strong> to update');
  if (noChanges.length) statsParts.push('<strong>' + noChanges.length + '</strong> already current');
  if (unmatched.length) statsParts.push('<strong>' + unmatched.length + '</strong> unmatched');
  if (noNhi.length)     statsParts.push('<strong>' + noNhi.length     + '</strong> no NHI found');

  var statsHTML = (metaParts.length ? metaParts.join(' &middot; ') + '<br>' : '') + statsParts.join(' &middot; ');
  document.getElementById('surgXlsxStats').innerHTML = statsHTML;

  var html      = '';
  var surgTeams = teams.filter(function(t) { return teamBelongsTo(t, 'surgical'); });

  // --- Updates ---
  if (updates.length) {
    html += '<div class="import-preview-section-hdr"><span>Will Update &mdash; ' + updates.length + '</span></div>';
    html += updates.map(function(u) {
      var name  = [u.existing.firstName, u.existing.lastName].filter(Boolean).join(' ') || u.row.nhi || '(unknown)';
      var inner = '<div class="surg-diff-name">' + h(name) + '<span class="surg-diff-nhi">' + h(u.existing.nhi) + '</span></div>';
      inner += u.fieldChanges.map(function(fc) {
        return '<div class="surg-diff-field">' +
          '<span class="surg-diff-label">' + h(fc.label) + '</span>' +
          '<span class="surg-diff-val">' +
            (fc.oldVal ? '<span class="surg-diff-old">' + h(trunc(fc.oldVal, 72)) + '</span> <span class="surg-diff-arrow">&rarr;</span> ' : '') +
            '<span class="surg-diff-new">' + h(trunc(fc.newVal, 72)) + '</span>' +
          '</span></div>';
      }).join('');
      return '<div class="surg-diff-row">' + inner + '</div>';
    }).join('');
  }

  // --- Unmatched (NHI present but not in app) ---
  if (unmatched.length) {
    html += '<div class="import-preview-section-hdr"><span>Unmatched (NHI not in app) &mdash; ' + unmatched.length + '</span></div>';
    html += unmatched.map(function(row, i) {
      return _surgUnmatchRowHTML(row, i, 'unmatched', surgTeams);
    }).join('');
  }

  // --- No NHI detected ---
  if (noNhi.length) {
    html += '<div class="import-preview-section-hdr"><span>No NHI detected &mdash; ' + noNhi.length + '</span></div>';
    html += noNhi.map(function(row, i) {
      return _surgUnmatchRowHTML(row, i, 'noNhi', surgTeams);
    }).join('');
  }

  if (!updates.length && !unmatched.length && !noNhi.length) {
    html = '<div class="import-preview-more">No patient rows found in this sheet.</div>';
  }

  document.getElementById('surgXlsxPreviewList').innerHTML = html;

  var confirmBtn = document.getElementById('surgXlsxConfirmBtn');
  confirmBtn.disabled = updates.length === 0;
  confirmBtn.textContent = updates.length
    ? 'Confirm ' + updates.length + ' Update' + (updates.length !== 1 ? 's' : '')
    : 'No Updates';
}

function _surgUnmatchRowHTML(row, i, section, surgTeams) {
  var createdSet = _surgXlsxCreated[section];
  var created    = createdSet && createdSet.has(i);
  var selId      = 'surgXlsxTeamSel-' + section + '-' + i;

  var name = [row.firstName, row.lastName].filter(Boolean).join(' ') || '(no name)';
  var metaParts = [];
  if (row.nhi)  metaParts.push(row.nhi);
  else          metaParts.push('<em style="color:var(--muted)">no NHI</em>');
  if (row.bed)  metaParts.push('Bed ' + row.bed);
  if (row.smo)  metaParts.push(h(row.smo));
  var meta = metaParts.join(' &middot; ');

  var teamOpts = surgTeams.map(function(t) {
    var sel = t.id === (row.suggestedTeam || currentTeam) ? ' selected' : '';
    return '<option value="' + h(t.id) + '"' + sel + '>' + h(t.name) + '</option>';
  }).join('');
  var teamSel = surgTeams.length > 1
    ? '<select class="surg-team-sel" id="' + selId + '">' + teamOpts + '</select>'
    : '';

  var btn = created
    ? '<span style="color:var(--muted);font-size:11px;font-style:italic">Created</span>'
    : '<button class="surg-create-btn" onclick="createSurgXlsxPatient(\'' + section + '\',' + i + ')">' +
        '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
        ' Create' +
      '</button>';

  return '<div class="surg-unmatch-row' + (created ? ' surg-unmatch-done' : '') + '">' +
    '<div class="surg-diff-name">' + h(name) + '</div>' +
    '<div class="import-preview-meta">' + meta + '</div>' +
    '<div class="surg-unmatch-actions">' + teamSel + btn + '</div>' +
    '</div>';
}

function createSurgXlsxPatient(section, idx) {
  var diff = _surgXlsxDiff;
  if (!diff) return;
  var rowArr     = section === 'noNhi' ? diff.noNhi : diff.unmatched;
  var createdSet = _surgXlsxCreated[section];
  if (!rowArr || createdSet.has(idx)) return;
  var row = rowArr[idx];
  if (!row) return;

  var surgTeams = teams.filter(function(t) { return teamBelongsTo(t, 'surgical'); });
  var selId     = 'surgXlsxTeamSel-' + section + '-' + idx;
  var teamSelEl = document.getElementById(selId);
  var tid = teamSelEl ? teamSelEl.value : (row.suggestedTeam || (surgTeams[0] && surgTeams[0].id) || currentTeam);

  var rowPod    = row.pod ? parseInt(String(row.pod).trim(), 10) : NaN;
  var rowOpDate = (!isNaN(rowPod) && rowPod >= 0) ? opDateFromPOD(rowPod) : '';
  var p = {
    pid: newPid(), teamId: tid, compartment: 'surgical',
    firstName: row.firstName || '', lastName: row.lastName || '',
    middleName: row.middleName || '', title: row.title || '',
    age: row.age || '', gender: row.gender || '', genderOther: '',
    nhi: row.nhi || '', ward: 'Surgical',
    bed: row.bed || '', smo: row.smo || '',
    doa: row.doa || '', opDate: rowOpDate,
    problemList: row.problemList || '', background: row.background || '',
    results: row.results || '', plan: row.plan || '',
  };

  if (!allPatients[tid]) allPatients[tid] = [];
  allPatients[tid].unshift(p);
  savePatient(p.pid);
  stampTeamEdit(tid);
  createdSet.add(idx);
  renderSurgXlsxPreview();

  if (tid === currentTeam) { patients = getTeamPatients(currentTeam); render(); }
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
    u.fieldChanges.forEach(function(fc) {
      if (fc.key === '_pod_opdate') { p.opDate = fc._opDate; }
      else { p[fc.key] = fc.newVal; }
    });
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

