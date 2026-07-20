function setSgocDd(pid, val) {
  const p = findPatient(pid);
  if (!p) return;
  p.sgoc = val;
  savePatient(pid);
  const card = qpid(pid);
  if (!card) return;
  const sfx = p.sgoc ? ' sgoc-' + p.sgoc.toLowerCase() : '';
  card.querySelector('.card-top').className = 'card-top' + sfx;
  const sgocSel = card.querySelector('.hdr-sgoc-sel');
  if (sgocSel) {
    sgocSel.className = 'hdr-sgoc-sel' + (p.sgoc ? ' sgoc-' + p.sgoc.toLowerCase() : ' sgoc-none');
    sgocSel.value = val;
  }
}

function refreshSgocNote(pid) {
  const p = findPatient(pid), card = qpid(pid);
  if (!p || !card) return;
  const el = card.querySelector('.pt-sgoc-note');
  if (el) el.textContent = p.sgocNote || '';
}

function setGenderDd(pid, val) {
  const p = findPatient(pid);
  if (!p) return;
  p.gender = val;
  savePatient(pid);
  const card = qpid(pid);
  if (!card) return;
  const hdrOther = card.querySelector('.hdr-gender-other');
  if (hdrOther) hdrOther.style.display = (val === 'Other') ? '' : 'none';
  card.querySelectorAll('.sync-gender').forEach(sel => {
    if (sel !== document.activeElement) sel.value = val;
  });
}

function setCoverage(pid, val) {
  const p = findPatient(pid);
  if (!p) return;
  p.coverage = val;
  savePatient(pid);
  const card = qpid(pid);
  if (!card) return;
  const eff  = val || 'No Review';
  const slug = COV_SLUG[eff] || '';
  const covSel = card.querySelector('.hdr-cov-sel');
  if (covSel) {
    covSel.className = 'hdr-cov-sel cov-' + slug;
    covSel.value = eff;
  }
  updateCount();
}

/* ---- JOBS ---- */
let _jid = Date.now();
function newJid() { return ++_jid; }

function addJob(pid, text) {
  const p = findPatient(pid);
  if (!p) return;
  const job = { id: newJid(), text: text || '', done: false };
  p.jobs.push(job);
  pushUndo({ type: 'add_job', pid, teamId: p.teamId, jid: job.id, desc: 'added ' + trunc(text || 'job') });
  savePatient(pid);
  renderJobs(pid);
  if (!text) {
    setTimeout(() => {
      const card = qpid(pid);
      if (!card) return;
      const all = card.querySelectorAll('.job-inp');
      if (all.length) all[all.length - 1].focus();
    }, 30);
  }
}

function toggleJob(pid, jid) {
  const p = findPatient(pid);
  if (!p) return;
  const j = p.jobs.find(x => x.id === jid);
  if (!j) return;
  pushUndo({ type: 'toggle_job', pid, teamId: p.teamId, jid, prevDone: j.done, prevCompletedAt: j.completedAt, desc: (j.done ? 'unticked' : 'ticked') + ' ' + trunc(j.text || 'job') });
  j.done = !j.done;
  if (j.done) { j.completedAt = Date.now(); } else { delete j.completedAt; }
  savePatient(pid);
  const el = document.querySelector('[data-jid="' + jid + '"]');
  if (el) {
    el.classList.toggle('done', j.done);
    const cb = el.querySelector('.job-cb');
    if (cb) cb.checked = j.done;
    const timeEl = el.querySelector('.job-time');
    if (timeEl) timeEl.textContent = j.done && j.completedAt ? ' ✅ ' + fmtCompletedAt(j.completedAt) : '';
  }
  updateJobsCounter(pid);
}

function updateJobText(pid, jid, text) {
  const p = findPatient(pid);
  if (!p) return;
  const j = p.jobs.find(x => x.id === jid);
  if (j) { j.text = text; savePatient(pid); }
}

function deleteJob(pid, jid) {
  const p = findPatient(pid);
  if (!p) return;
  const idx = p.jobs.findIndex(j => j.id === jid);
  if (idx === -1) return;
  pushUndo({ type: 'delete_job', pid, teamId: p.teamId, job: deepClone(p.jobs[idx]), index: idx, desc: 'deleted ' + trunc(p.jobs[idx].text || 'job') });
  p.jobs.splice(idx, 1);
  savePatient(pid);
  renderJobs(pid);
}

/* ---- JOB DRAG AND DROP ---- */
let _dragPid   = null;
let _dragJid   = null;
let _dragOver  = null;   // { jid, before }
let _allowDrag = false;

function jobDragHandleDown() {
  _allowDrag = true;
  const up = () => { _allowDrag = false; document.removeEventListener('mouseup', up); };
  document.addEventListener('mouseup', up);
}

function onJobDragStart(event, pid, jid) {
  if (!editMode || !_allowDrag) { event.preventDefault(); return; }
  _dragPid = pid;
  _dragJid = jid;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', String(jid));
  setTimeout(() => {
    const el = document.querySelector('[data-jid="' + jid + '"]');
    if (el) el.classList.add('dragging');
  }, 0);
}

function onJobDragOver(event, pid, jid) {
  if (_dragPid !== pid || _dragJid === jid) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const rect = event.currentTarget.getBoundingClientRect();
  const before = event.clientY < rect.top + rect.height / 2;
  const card = qpid(pid);
  if (card) card.querySelectorAll('.job').forEach(el => el.classList.remove('drag-above','drag-below'));
  event.currentTarget.classList.add(before ? 'drag-above' : 'drag-below');
  _dragOver = { jid, before };
}

function onJobDragLeave(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) {
    event.currentTarget.classList.remove('drag-above', 'drag-below');
  }
}

function onJobDrop(event, pid) {
  event.preventDefault();
  if (_dragPid !== pid || !_dragOver || !_dragJid) return;
  const p = findPatient(pid);
  if (!p) return;
  const fromIdx = p.jobs.findIndex(j => j.id === _dragJid);
  if (fromIdx === -1) return;
  const [moved] = p.jobs.splice(fromIdx, 1);
  const newTargetIdx = p.jobs.findIndex(j => j.id === _dragOver.jid);
  if (newTargetIdx !== -1) {
    p.jobs.splice(_dragOver.before ? newTargetIdx : newTargetIdx + 1, 0, moved);
  } else {
    p.jobs.push(moved);
  }
  _dragPid = _dragJid = _dragOver = null;
  _allowDrag = false;
  savePatient(pid);
  renderJobs(pid);
}

function onJobDragEnd(event, pid) {
  _allowDrag = false;
  _dragPid = _dragJid = _dragOver = null;
  const card = qpid(pid);
  if (card) card.querySelectorAll('.job').forEach(el => el.classList.remove('dragging','drag-above','drag-below'));
}

/* ---- RENDER ---- */
function jobHTML(pid, j) {
  const ts = j.done && j.completedAt ? ' ✅ ' + fmtCompletedAt(j.completedAt) : '';
  return '<div class="job' + (j.done ? ' done' : '') + '" data-jid="' + j.id + '" draggable="true"' +
    ' ondragstart="onJobDragStart(event,\'' + pid + '\',' + j.id + ')"' +
    ' ondragover="onJobDragOver(event,\'' + pid + '\',' + j.id + ')"' +
    ' ondragleave="onJobDragLeave(event)"' +
    ' ondrop="onJobDrop(event,\'' + pid + '\')"' +
    ' ondragend="onJobDragEnd(event,\'' + pid + '\')">' +
    '<span class="job-drag-handle" onmousedown="jobDragHandleDown()">' +
      '<svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">' +
        '<circle cx="2" cy="2" r="1.1"/><circle cx="6" cy="2" r="1.1"/>' +
        '<circle cx="2" cy="6" r="1.1"/><circle cx="6" cy="6" r="1.1"/>' +
        '<circle cx="2" cy="10" r="1.1"/><circle cx="6" cy="10" r="1.1"/>' +
      '</svg>' +
    '</span>' +
    '<input type="checkbox" class="job-cb"' + (j.done ? ' checked' : '') +
      ' onchange="toggleJob(\'' + pid + '\',' + j.id + ')">' +
    '<textarea class="job-inp" rows="1" placeholder="Enter task..."' +
      ' oninput="updateJobText(\'' + pid + '\',' + j.id + ',this.value);autoH(this)"' +
      ' onfocus="autoH(this)">' + h(j.text) + '</textarea>' +
    '<span class="job-time">' + h(ts) + '</span>' +
    '<button class="job-del" onclick="deleteJob(\'' + pid + '\',' + j.id + ')" title="Remove">&times;</button>' +
  '</div>';
}

function renderJobs(pid) {
  const card = qpid(pid);
  if (!card) return;
  const p = findPatient(pid);
  if (!p) return;
  card.querySelector('.jobs-list').innerHTML = p.jobs.map(j => jobHTML(pid, j)).join('');
  updateJobsCounter(pid);
}

function cardHTML(p) {
  const pid     = p.pid;
  const covEff  = p.coverage || 'No Review';
  const covSlug = COV_SLUG[covEff] || '';
  return (
    '<div class="card" data-pid="' + pid + '">' +
    '<div class="card-top' + (p.sgoc ? ' sgoc-' + p.sgoc.toLowerCase() : '') + '">' +
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
            '<select class="hdr-sel hdr-gender-sel sync-gender" onchange="setGenderDd(\'' + pid + '\',this.value)">' +
              '<option value="">Gender</option>' +
              '<option value="M"' + (p.gender === 'M' ? ' selected' : '') + '>Male</option>' +
              '<option value="F"' + (p.gender === 'F' ? ' selected' : '') + '>Female</option>' +
              '<option value="Other"' + (p.gender === 'Other' ? ' selected' : '') + '>Other</option>' +
            '</select>' +
            '<input class="hdr-inp hdr-gender-other" type="text" placeholder="specify..." value="' + h(p.genderOther || '') + '"' +
              ' style="display:' + (p.gender === 'Other' ? '' : 'none') + '"' +
              ' oninput="setField(\'' + pid + '\',\'genderOther\',this.value)">' +
          '</div>' +
          '<div class="hdr-nhi-cell">' +
            '<span class="hdr-meta-lbl">NHI</span>' +
            '<input class="hdr-inp hdr-nhi-inp" type="text" value="' + h(p.nhi) + '" placeholder="—" maxlength="8"' +
              ' oninput="this.value=this.value.toUpperCase();setField(\'' + pid + '\',\'nhi\',this.value)"' +
              ' onblur="checkDuplicates()">' +
          '</div>' +
          '<div class="hdr-loc-group">' +
            '<select class="hdr-sel hdr-ward-sel" onchange="setField(\'' + pid + '\',\'ward\',this.value)">' +
              WARDS.map(w => '<option value="' + w + '"' + (p.ward === w ? ' selected' : '') + '>' + w + '</option>').join('') +
            '</select>' +
            '<span class="hdr-meta-lbl">Bed</span>' +
            '<input class="hdr-inp hdr-bed-inp" type="text" value="' + h(p.bed) + '" placeholder="—"' +
              ' oninput="setField(\'' + pid + '\',\'bed\',this.value)">' +
          '</div>' +
        '</div>' +
        '<div class="pt-sgoc-note">' + h(p.sgocNote || '') + '</div>' +
      '</div>' +
      '<div class="card-badges">' +
        '<select class="hdr-sgoc-sel' + (p.sgoc ? ' sgoc-' + p.sgoc.toLowerCase() : ' sgoc-none') + '" onchange="setSgocDd(\'' + pid + '\',this.value)">' +
          '<option value="">SGOC</option>' +
          ['A','B','C','D'].map(l => '<option value="' + l + '"' + (p.sgoc === l ? ' selected' : '') + '>SGOC ' + l + '</option>').join('') +
        '</select>' +
        '<select class="hdr-cov-sel cov-' + covSlug + '" onchange="setCoverage(\'' + pid + '\',this.value)">' +
          COV.map(o => '<option value="' + h(o) + '"' + (covEff === o ? ' selected' : '') + '>' + h(o) + '</option>').join('') +
        '</select>' +
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
      '<div class="f"><span class="lbl">Diagnosis</span>' +
        '<input class="inp" type="text" value="' + h(p.diagnosis) + '" placeholder="Current working diagnosis"' +
        ' oninput="setField(\'' + pid + '\',\'diagnosis\',this.value)">' +
      '</div>' +
      '<div class="print-row2">' +
        '<div class="f"><span class="lbl">Assessment / Clinical Notes</span>' +
          '<textarea class="inp" rows="2" placeholder="Current assessment and clinical status..."' +
          ' oninput="setField(\'' + pid + '\',\'assessment\',this.value);autoH(this)"' +
          ' onfocus="autoH(this)">' + h(p.assessment) + '</textarea>' +
        '</div>' +
        '<div class="f"><span class="lbl">Background / PMHx</span>' +
          '<textarea class="inp" rows="2" placeholder="Past medical history, relevant background..."' +
          ' oninput="setField(\'' + pid + '\',\'background\',this.value);autoH(this)"' +
          ' onfocus="autoH(this)">' + h(p.background) + '</textarea>' +
        '</div>' +
      '</div>' +
      '<hr class="hdiv">' +
      '<div>' +
        '<div class="jobs-hdr">' +
          '<div style="display:flex;align-items:center;gap:6px">' +
            '<span class="jobs-lbl">Jobs List</span>' +
            '<span class="' + ('jobs-count' + (p.jobs.length > 0 && p.jobs.filter(j=>j.done).length === p.jobs.length ? ' all-done' : '')) + '" id="jc-' + pid + '">' +
              (p.jobs.length > 0 ? '— ' + p.jobs.filter(j=>j.done).length + '/' + p.jobs.length + ' done' : '') +
            '</span>' +
          '</div>' +
          '<button class="btn-addjob" onclick="addJob(\'' + pid + '\')">' +
            '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">' +
            '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
            'Add Job</button>' +
        '</div>' +
        '<div class="jobs-list">' + p.jobs.map(j => jobHTML(pid, j)).join('') + '</div>' +
        '<div class="presets">' +
          PRESETS.map(pr =>
            '<button class="pre-btn" onclick="addJob(\'' + pid + '\',\'' + h(pr) + '\')">' + h(pr) + '</button>'
          ).join('') +
        '</div>' +
      '</div>' +
    '</div>' +
    '</div>'
  );
}

/* ---- HANDOVER SHEET IMPORT / EXPORT ----
   Distinct from the simple ward-list CSV import above. This format is
   multi-row-per-patient (extra pending tasks are extra rows with every
   other column blank) and matches patients by NHI against the current
   team, so updates never touch other teams and never delete/auto-complete
   an existing job — only add task text that isn't already present. */

// Raw row tokenizer (unlike parseCSV above, doesn't key by lowercased header
// name) — needed because this sheet's first column and several trailing
// columns are blank/unlabeled, so header-name lookup can't disambiguate them.
function parseCsvRowsRaw(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  function parseLine(line) {
    const fields = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') { inQ = false; }
        else { cur += c; }
      } else {
        if (c === '"') { inQ = true; }
        else if (c === ',') { fields.push(cur); cur = ''; }
        else { cur += c; }
      }
    }
    fields.push(cur);
    return fields;
  }
  const rows = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    rows.push(parseLine(line));
  }
  return rows;
}

function looksLikeHandoverSheetCSV(headerRow) {
  const lower = (headerRow || []).map(h => h.trim().toLowerCase());
  return lower.includes('nhi') && lower.includes('location') && lower.includes('tasks');
}

function normalizeHandoverCoverage(raw) {
  const s = (raw || '').trim().toLowerCase();
  if (s === 'smo review') return 'SMO Review';
  if (s === 'rmo review') return 'RMO Review';
  if (s === 'results chase') return 'Results Chase';
  if (s === 'no review') return 'No Review';
  return '';
}

function mapWardLoose(raw) {
  const s = (raw || '').trim();
  const direct = WARDS.find(w => w.toLowerCase() === s.toLowerCase());
  if (direct) return direct;
  const lower = s.toLowerCase();
  if (lower.includes('medical')) return 'Medical';
  if (lower.includes('surgical')) return 'Surgical';
  if (lower.includes('pediatric') || lower.includes('paediatric')) return 'Pediatrics';
  if (lower.includes('ccu')) return 'CCU';
  if (lower.includes('at&r') || lower.includes('atr')) return 'AT&R';
  return 'Medical';
}

function parseHandoverName(raw) {
  const parts = (raw || '').split(',');
  return {
    lastName: (parts[0] || '').trim().toUpperCase(),
    firstName: (parts[1] || '').trim(),
  };
}

function parseHandoverLocation(raw) {
  const s = (raw || '').trim();
  const idx = s.indexOf(' ');
  if (idx === -1) return { ward: mapWardLoose(s), bed: '' };
  return { ward: mapWardLoose(s.slice(0, idx)), bed: s.slice(idx + 1).trim() };
}

function parseHandoverSheetCSV(text) {
  const allRows = parseCsvRowsRaw(text);
  if (allRows.length < 2) return [];

  const headers = allRows[0].map(h => h.trim());
  const col = {
    coverage: 0,
    name: headers.indexOf('Name'),
    nhi: headers.indexOf('NHI'),
    location: headers.indexOf('Location'),
    goc: headers.indexOf('GOC'),
    diagnosis: headers.indexOf('Current Diagnosis'),
    assessment: headers.indexOf('Assessment'),
    tasks: headers.indexOf('Tasks'),
    background: headers.indexOf('Background'),
  };

  const result = [];
  let current = null;

  for (const cells of allRows.slice(1)) {
    const nhi = (cells[col.nhi] || '').trim().toUpperCase();
    const taskText = (cells[col.tasks] || '').trim();

    if (nhi) {
      const name = parseHandoverName(cells[col.name] || '');
      const loc = parseHandoverLocation(cells[col.location] || '');
      const gocRaw = (cells[col.goc] || '').trim().toUpperCase();
      current = {
        coverage: normalizeHandoverCoverage(cells[col.coverage] || ''),
        firstName: name.firstName,
        lastName: name.lastName,
        nhi,
        ward: loc.ward,
        bed: loc.bed,
        sgoc: ['A', 'B', 'C', 'D'].includes(gocRaw) ? gocRaw : '',
        diagnosis: (cells[col.diagnosis] || '').trim(),
        assessment: (cells[col.assessment] || '').trim(),
        background: (cells[col.background] || '').trim(),
        tasks: taskText ? [taskText] : [],
      };
      result.push(current);
    } else if (current && taskText) {
      current.tasks.push(taskText);
    }
  }

  return result;
}


const HANDOVER_DIFF_FIELD_LABELS = {
  coverage: 'Coverage', ward: 'Ward', bed: 'Bed', sgoc: 'GOC',
  diagnosis: 'Diagnosis', assessment: 'Assessment', background: 'Background', tasks: 'Tasks',
};

function diffHandoverSheet(rows, existingPatients) {
  const byNHI = new Map();
  existingPatients.filter(p => p.nhi).forEach(p => byNHI.set(p.nhi.trim().toUpperCase(), p));

  const newPatients = [];
  const updates = [];

  rows.forEach(row => {
    const match = byNHI.get(row.nhi);
    if (!match) { newPatients.push(row); return; }

    const changedFields = [];
    if ((match.coverage || '') !== row.coverage) changedFields.push('coverage');
    if ((match.ward || '') !== row.ward) changedFields.push('ward');
    if ((match.bed || '') !== row.bed) changedFields.push('bed');
    if ((match.sgoc || '') !== row.sgoc) changedFields.push('sgoc');
    if ((match.diagnosis || '') !== row.diagnosis) changedFields.push('diagnosis');
    if ((match.assessment || '') !== row.assessment) changedFields.push('assessment');
    if ((match.background || '') !== row.background) changedFields.push('background');

    const existingTexts = new Set((match.jobs || []).map(j => (j.text || '').trim().toLowerCase()));
    const newTasks = row.tasks.filter(t => !existingTexts.has(t.trim().toLowerCase()));
    if (newTasks.length > 0) changedFields.push('tasks');

    if (changedFields.length > 0) updates.push({ existing: match, incoming: row, changedFields, newTasks });
  });

  return { newPatients, updates };
}

/* ---- HANDOVER SHEET IMPORT PREVIEW MODAL ---- */
let _handoverDiff = null;
let _handoverSelection = { newPatients: null, updates: null };

function openHandoverImportPreview(diff) {
  _handoverDiff = diff;
  _handoverSelection = {
    newPatients: new Set(diff.newPatients.map((_, i) => i)),
    updates: new Set(diff.updates.map((_, i) => i)),
  };
  renderHandoverImportPreview();
  document.getElementById('handoverImportModal').classList.add('open');
}

function closeHandoverImportModal() {
  document.getElementById('handoverImportModal').classList.remove('open');
  _handoverDiff = null;
}

function handleHandoverImportOverlayClick(e) {
  if (e.target === document.getElementById('handoverImportModal')) closeHandoverImportModal();
}

function toggleHandoverSelection(kind, idx) {
  const set = _handoverSelection[kind];
  if (set.has(idx)) set.delete(idx); else set.add(idx);
  renderHandoverImportPreview();
}

function toggleHandoverSelectAll(kind, total) {
  const set = _handoverSelection[kind];
  if (set.size === total) set.clear();
  else { set.clear(); for (let i = 0; i < total; i++) set.add(i); }
  renderHandoverImportPreview();
}

function renderHandoverImportPreview() {
  const diff = _handoverDiff;
  if (!diff) return;
  const selectedCount = _handoverSelection.newPatients.size + _handoverSelection.updates.size;

  document.getElementById('handoverImportStats').innerHTML =
    '<strong>' + diff.newPatients.length + '</strong> new · <strong>' + diff.updates.length + '</strong> updated';

  let html = '';

  if (diff.newPatients.length === 0 && diff.updates.length === 0) {
    html = '<div class="import-preview-more">No new or changed patients found in this sheet.</div>';
  }

  if (diff.newPatients.length > 0) {
    html += '<div class="import-preview-section-hdr">' +
      '<span>New Patients — ' + diff.newPatients.length + '</span>' +
      '<a href="#" onclick="toggleHandoverSelectAll(\'newPatients\',' + diff.newPatients.length + ');return false;">' +
      (_handoverSelection.newPatients.size === diff.newPatients.length ? 'Deselect all' : 'Select all') + '</a></div>';
    html += diff.newPatients.map((row, i) => {
      const name = [row.firstName, row.lastName].filter(Boolean).join(' ') || '(no name)';
      const checked = _handoverSelection.newPatients.has(i) ? 'checked' : '';
      return '<label class="import-preview-item" style="cursor:pointer">' +
        '<input type="checkbox" ' + checked + ' onchange="toggleHandoverSelection(\'newPatients\',' + i + ')" style="margin-right:10px">' +
        '<span style="flex:1"><span class="import-preview-name">' + h(name) + '</span> ' +
        '<span class="import-preview-meta">' + h(row.nhi) + ' · ' + h(row.ward) + ' ' + h(row.bed) +
        ' · ' + row.tasks.length + ' task' + (row.tasks.length !== 1 ? 's' : '') + '</span></span></label>';
    }).join('');
  }

  if (diff.updates.length > 0) {
    html += '<div class="import-preview-section-hdr">' +
      '<span>Updates — ' + diff.updates.length + '</span>' +
      '<a href="#" onclick="toggleHandoverSelectAll(\'updates\',' + diff.updates.length + ');return false;">' +
      (_handoverSelection.updates.size === diff.updates.length ? 'Deselect all' : 'Select all') + '</a></div>';
    html += diff.updates.map((u, i) => {
      const name = [u.existing.firstName, u.existing.lastName].filter(Boolean).join(' ') || '(no name)';
      const checked = _handoverSelection.updates.has(i) ? 'checked' : '';
      const changedLabels = u.changedFields.map(f => HANDOVER_DIFF_FIELD_LABELS[f] || f).join(', ');
      const taskNote = u.newTasks.length > 0 ? ' (+' + u.newTasks.length + ' new task' + (u.newTasks.length !== 1 ? 's' : '') + ')' : '';
      return '<label class="import-preview-item" style="cursor:pointer">' +
        '<input type="checkbox" ' + checked + ' onchange="toggleHandoverSelection(\'updates\',' + i + ')" style="margin-right:10px">' +
        '<span style="flex:1"><span class="import-preview-name">' + h(name) + '</span> ' +
        '<span class="import-preview-meta">' + h(u.existing.nhi) + ' — ' + h(changedLabels) + h(taskNote) + '</span></span></label>';
    }).join('');
  }

  document.getElementById('handoverImportPreviewList').innerHTML = html;
  const applyBtn = document.getElementById('handoverImportApplyBtn');
  applyBtn.textContent = 'Apply (' + selectedCount + ')';
  applyBtn.disabled = selectedCount === 0;
}

function applyHandoverImport() {
  const diff = _handoverDiff;
  if (!diff) return;

  diff.newPatients.forEach((row, i) => {
    if (!_handoverSelection.newPatients.has(i)) return;
    const p = {
      pid: newPid(), teamId: currentTeam,
      firstName: row.firstName, lastName: row.lastName, age: '', gender: '', genderOther: '',
      nhi: row.nhi, ward: row.ward, bed: row.bed,
      diagnosis: row.diagnosis, sgoc: row.sgoc, sgocNote: '',
      assessment: row.assessment, background: row.background, coverage: row.coverage,
      jobs: row.tasks.map(text => ({ id: newJid(), text, done: false })),
    };
    patients.unshift(p);
    pushUndo({ type: 'add', pid: p.pid, teamId: currentTeam, desc: 'imported ' + trunc([p.firstName, p.lastName].filter(Boolean).join(' ') || 'patient') });
    savePatient(p.pid);
  });

  diff.updates.forEach((u, i) => {
    if (!_handoverSelection.updates.has(i)) return;
    const p = u.existing;
    p.coverage = u.incoming.coverage;
    p.ward = u.incoming.ward;
    p.bed = u.incoming.bed;
    p.sgoc = u.incoming.sgoc;
    p.diagnosis = u.incoming.diagnosis;
    p.assessment = u.incoming.assessment;
    p.background = u.incoming.background;
    u.newTasks.forEach(text => p.jobs.push({ id: newJid(), text, done: false }));
    savePatient(p.pid);
  });

  stampTeamEdit(currentTeam);
  render();
  closeHandoverImportModal();
  checkDuplicates();
  showToast('Handover sheet import applied');
}

/* ---- CLEAR ALL MODAL ---- */
function openClearModal() {
  const inp = document.getElementById('clearConfirmInp');
  inp.value = '';
  document.getElementById('clearConfirmBtn').disabled = true;
  inp.classList.remove('valid');
  document.getElementById('clearModal').classList.add('open');
  requestAnimationFrame(() => inp.focus());
}

function closeClearModal() { document.getElementById('clearModal').classList.remove('open'); }

function handleModalOverlayClick(e) {
  if (e.target === document.getElementById('clearModal')) closeClearModal();
}

function onClearInputChange(inp) {
  const valid = inp.value === 'DELETE';
  inp.classList.toggle('valid', valid);
  document.getElementById('clearConfirmBtn').disabled = !valid;
}

function confirmClearAll() {
  const saved = deepClone(patients);
  pushUndo({ type: 'clear_all', patients: saved, teamId: currentTeam, desc: 'cleared all patients' });
  (allPatients[currentTeam] || []).forEach(p => deletePatientFromServer(p.pid, currentTeam));
  allPatients[currentTeam] = [];
  patients = allPatients[currentTeam];
  stampTeamEdit(currentTeam);
  render(); closeClearModal();
}

/* ---- NEW FEATURE HELPERS ---- */
function fmtCompletedAt(ts) {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2,'0');
  const mm = d.getMinutes().toString().padStart(2,'0');
  const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
  return hh + ':' + mm + ' ' + day;
}

function updateJobsCounter(pid) {
  const el = document.getElementById('jc-' + pid);
  if (!el) return;
  const p = findPatient(pid);
  if (!p) return;
  const total = p.jobs.length;
  const done  = p.jobs.filter(j => j.done).length;
  el.textContent = total > 0 ? '— ' + done + '/' + total + ' done' : '';
  el.className   = 'jobs-count' + (total > 0 && done === total ? ' all-done' : '');
}

