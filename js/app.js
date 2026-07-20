/* ---- TEAM TABS ---- */
function renderTeamTabs() {
  const container = document.getElementById('teamTabs');
  let html = teams.filter(t => teamBelongsTo(t, compartment)).map(t => {
    const isActive  = t.id === currentTeam;
    const isDynamic = !t.fixed;
    const count     = (allPatients[t.id] || []).length;
    const countStr  = count > 0 ? ' <span style="opacity:0.65;font-weight:400">(' + count + ')</span>' : '';
    return '<button class="team-tab' + (isActive ? ' active' : '') + '"' +
      ' onclick="handleTabClick(event,\'' + t.id + '\')">' +
      '<span class="tname">' + h(t.name) + countStr + '</span>' +
      (isDynamic
        ? '<span class="tdel" onclick="event.stopPropagation();deleteTeam(\'' + t.id + '\')" title="Remove team">&times;</span>'
        : '') +
    '</button>';
  }).join('');
  html += '<button class="btn-newteam" onclick="createTeam()">' +
    '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
    ' New Team</button>';
  container.innerHTML = html;
}

function handleTabClick(e, tid) {
  if (currentTeam === tid) startRename(e.currentTarget, tid);
  else switchTeam(tid);
}

function startRename(btn, tid) {
  const nameSpan = btn.querySelector('.tname');
  if (!nameSpan) return;
  const team = teams.find(x => x.id === tid);
  if (!team) return;
  const orig = team.name;
  const inp = document.createElement('input');
  inp.type = 'text'; inp.value = orig; inp.className = 'tname-inp';
  inp.style.width = Math.max(orig.length + 2, 6) + 'ch';
  nameSpan.replaceWith(inp);
  function commit() {
    const v = inp.value.trim();
    if (v) team.name = v;
    saveTeams(); renderTeamTabs();
  }
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', ev => {
    if (ev.key === 'Enter')  { ev.preventDefault(); inp.blur(); }
    if (ev.key === 'Escape') { team.name = orig; inp.blur(); }
    inp.style.width = Math.max(inp.value.length + 2, 6) + 'ch';
  });
  inp.addEventListener('input', () => { inp.style.width = Math.max(inp.value.length + 2, 6) + 'ch'; });
  requestAnimationFrame(() => { inp.focus(); inp.select(); });
}

function createTeam() {
  const name = prompt('New team name:');
  if (!name || !name.trim()) return;
  const id = (compartment === 'surgical' ? 'surg_' : 'med_') + Date.now();
  const t = { id, name: name.trim(), fixed: false };
  if (compartment === 'surgical') t.compartment = 'surgical';
  teams.push(t);
  saveTeams();
  switchTeam(id);
}

function deleteTeam(tid) {
  const team = teams.find(t => t.id === tid);
  if (!team || team.fixed) return;
  if (!confirm('Delete "' + team.name + '"?\nAll patients in this team will be permanently removed.')) return;
  (allPatients[tid] || []).forEach(p => deletePatientFromServer(p.pid, tid));
  delete allPatients[tid];
  teams = teams.filter(t => t.id !== tid);
  saveTeams();
  if (currentTeam === tid) {
    const compTeams = teams.filter(t => teamBelongsTo(t, compartment));
    const fallback = (compTeams[0] || {}).id || (compartment === 'surgical' ? 'surg_boo' : 'team1');
    currentTeam = fallback;
    if (compartment === 'surgical') {
      currentSurgTeam = fallback;
      localStorage.setItem('gm_cur_surg_team', fallback);
    } else {
      localStorage.setItem('gm_cur_team', fallback);
    }
    patients = getTeamPatients(fallback);
  }
  renderTeamTabs(); render();
}

function switchTeam(tid) {
  if (!teams.find(t => t.id === tid)) return;
  currentTeam   = tid;
  currentFilter = 'All';
  surgConsFilter = 'All';
  if (compartment === 'surgical') {
    currentSurgTeam = tid;
    localStorage.setItem('gm_cur_surg_team', tid);
  } else {
    localStorage.setItem('gm_cur_team', tid);
  }
  updateLastUpdatedText();
  patients = getTeamPatients(currentTeam);
  normalizePatients();
  renderTeamTabs();
  renderFilterBar();
  document.querySelectorAll('#medFilterLeft .filter-btn').forEach(b => {
    b.className = 'filter-btn' + (b.dataset.filter === 'All' ? ' active' : '');
  });
  render();
  checkDuplicates();
}

/* ---- FILTER / SORT ---- */
function setFilter(f) {
  currentFilter = f;
  document.querySelectorAll('#medFilterLeft .filter-btn').forEach(b => {
    b.className = 'filter-btn' + (b.dataset.filter === f ? ' active' : '');
  });
  render();
}

function getFiltered() {
  let list = compartment === 'surgical'
    ? (surgConsFilter === 'All' ? patients : patients.filter(p => p.smo === surgConsFilter))
    : (currentFilter  === 'All' ? patients : patients.filter(p => p.coverage === currentFilter));
  if (searchQuery) {
    const q = searchQuery;
    list = list.filter(p => {
      const name = ((p.firstName || '') + ' ' + (p.lastName || '')).toLowerCase();
      return name.includes(q) || (p.nhi || '').toLowerCase().includes(q);
    });
  }
  return list;
}

function updateCount() {
  const total    = patients.length;
  const filtered = getFiltered().length;
  let txt;
  const isAll = compartment === 'surgical' ? surgConsFilter === 'All' : currentFilter === 'All';
  if (isAll) {
    txt = total === 0 ? '' : total === 1 ? '1 patient' : total + ' patients';
  } else {
    txt = filtered + ' of ' + total + ' patient' + (total !== 1 ? 's' : '');
  }
  document.getElementById('filterCount').textContent = txt;
}

/* ---- PRINT ---- */
function doPrint() {
  const team    = teams.find(t => t.id === currentTeam) || { name: 'Unknown Team' };
  const now     = new Date();
  const dateStr = DAYS[now.getDay()] + ', ' + now.getDate() + ' ' + MONTHS[now.getMonth()] + ' ' + now.getFullYear();
  const shown   = getFiltered().length;
  const total   = patients.length;
  const scope   = currentFilter === 'All'
    ? total + ' patient' + (total !== 1 ? 's' : '')
    : h(currentFilter) + ' only — ' + shown + ' of ' + total + ' patients';
  const printTitle = compartment === 'surgical' ? 'Surgical — Patient Handover' : 'General Medicine — Patient Handover';
  document.getElementById('printHeader').innerHTML =
    '<div class="ph-top"><span class="ph-title">' + printTitle + '</span><span class="ph-team">' + h(team.name) + '</span></div>' +
    '<div class="ph-meta"><span>' + dateStr + '</span><span>' + scope + '</span></div>' +
    '<hr class="ph-rule">';
  window.print();
}

/* ---- PATIENTS ---- */
function addPatient() {
  if (compartment === 'surgical') {
    const consultants = getTeamConsultants(currentTeam);
    const p = {
      pid: newPid(), teamId: currentTeam, compartment: 'surgical',
      firstName:'', lastName:'', age:'', gender:'', genderOther:'', title:'', nhi:'',
      ward:'Surgical', bed:'',
      smo: consultants[0] || '', doa:'', pod:'',
      problemList:'', background:'', results:'', plan:'',
    };
    patients.unshift(p);
    pushUndo({ type: 'add', pid: p.pid, teamId: currentTeam, desc: 'added surgical patient' });
    savePatient(p.pid);
    render();
    checkDuplicates();
    setTimeout(() => {
      const card = qpid(p.pid);
      if (card) { const f = card.querySelector('.f-fn'); if (f) f.focus(); }
    }, 40);
    return;
  }
  const p = {
    pid: newPid(), teamId: currentTeam,
    firstName:'', lastName:'', age:'', gender:'', genderOther:'', nhi:'', ward:'Medical', bed:'',
    diagnosis:'', sgoc:'', sgocNote:'', assessment:'', background:'', coverage:'No Review', jobs:[]
  };
  patients.unshift(p);
  pushUndo({ type: 'add', pid: p.pid, teamId: currentTeam, desc: 'added patient' });
  savePatient(p.pid);
  render();
  checkDuplicates();
  setTimeout(() => {
    const card = qpid(p.pid);
    if (card) { const f = card.querySelector('.f-fn'); if (f) f.focus(); }
  }, 40);
}

function setSort(s) { currentSort = s; render(); }

function getSorted(list) {
  if (currentSort === 'default') return list;
  const copy = list.slice();
  if (currentSort === 'lastName') {
    copy.sort((a, b) =>
      (a.lastName || '').localeCompare(b.lastName || '') || (a.firstName || '').localeCompare(b.firstName || '')
    );
  } else if (currentSort === 'nhi') {
    copy.sort((a, b) => (a.nhi || '').localeCompare(b.nhi || ''));
  } else if (currentSort === 'bedspace') {
    copy.sort((a, b) => {
      const wa = WARD_ORDER[a.ward] ?? 99, wb = WARD_ORDER[b.ward] ?? 99;
      if (wa !== wb) return wa - wb;
      const na = parseInt(a.bed, 10), nb = parseInt(b.bed, 10);
      return (isNaN(na) ? Infinity : na) - (isNaN(nb) ? Infinity : nb);
    });
  } else if (currentSort === 'coverage') {
    copy.sort((a, b) => ((COV_ORDER[a.coverage] ?? 99) - (COV_ORDER[b.coverage] ?? 99)));
  }
  return copy;
}

/* ---- THREE-DOT MENU ---- */
function togglePtMenu(event, pid) {
  event.stopPropagation();
  const menu = document.getElementById('pt-menu-' + pid);
  if (!menu) return;
  if (_openMenuPid && _openMenuPid !== pid) {
    const prev = document.getElementById('pt-menu-' + _openMenuPid);
    if (prev) prev.style.display = 'none';
  }
  const isOpen = menu.style.display !== 'none';
  menu.style.display = isOpen ? 'none' : 'block';
  _openMenuPid = isOpen ? null : pid;
}

function closePtMenu() {
  if (_openMenuPid) {
    const menu = document.getElementById('pt-menu-' + _openMenuPid);
    if (menu) menu.style.display = 'none';
    _openMenuPid = null;
  }
}

/* ---- MOVE PATIENT ---- */
function openMoveModal(pid) {
  _movePid = pid; _moveToTeam = null;
  closePtMenu();
  const p = findPatient(pid);
  const name = p ? [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Patient' : 'Patient';
  document.getElementById('movePtTitle').textContent = 'Move ' + name;
  const sel = document.getElementById('moveTeamSel');
  sel.innerHTML = '<option value="">— Select team —</option>' +
    teams.filter(t => t.id !== currentTeam && teamBelongsTo(t, compartment))
      .map(t => '<option value="' + h(t.id) + '">' + h(t.name) + '</option>').join('');
  document.getElementById('moveStep1').style.display = '';
  document.getElementById('moveStep2').style.display = 'none';
  document.getElementById('moveNextBtn').disabled = true;
  document.getElementById('moveModal').classList.add('open');
}

function closeMoveModal() {
  document.getElementById('moveModal').classList.remove('open');
  _movePid = null; _moveToTeam = null;
}

function handleMoveOverlayClick(e) {
  if (e.target === document.getElementById('moveModal')) closeMoveModal();
}

function onMoveTeamSelect(val) {
  _moveToTeam = val;
  document.getElementById('moveNextBtn').disabled = !val;
}

function showMoveConfirm() {
  if (!_moveToTeam) return;
  const p = findPatient(_movePid);
  const name = p ? [p.firstName, p.lastName].filter(Boolean).join(' ') || 'this patient' : 'this patient';
  const fromTeam = teams.find(t => t.id === currentTeam);
  const toTeam   = teams.find(t => t.id === _moveToTeam);
  document.getElementById('moveConfirmMsg').innerHTML =
    'Move <strong>' + h(name) + '</strong> from <strong>' + h(fromTeam?.name || currentTeam) +
    '</strong> to <strong>' + h(toTeam?.name || _moveToTeam) + '</strong>?';
  document.getElementById('moveStep1').style.display = 'none';
  document.getElementById('moveStep2').style.display = '';
}

function backMoveStep() {
  document.getElementById('moveStep1').style.display = '';
  document.getElementById('moveStep2').style.display = 'none';
}

function confirmMovePatient() {
  const pid = _movePid, toTeam = _moveToTeam;
  if (!pid || !toTeam) return;
  const p = findPatient(pid);
  if (!p) return;
  const fromTeam = p.teamId || currentTeam;
  const _mvToName = (teams.find(t => t.id === toTeam) || {}).name || toTeam;
  const _mvPtName = [p.firstName, p.lastName].filter(Boolean).join(' ') || 'patient';
  pushUndo({ type: 'move', patient: deepClone(p), fromTeam, toTeam, desc: 'moved ' + _mvPtName + ' to ' + _mvToName });
  allPatients[fromTeam] = (allPatients[fromTeam] || []).filter(x => x.pid !== pid);
  if (fromTeam === currentTeam) patients = allPatients[currentTeam];
  deletePatientFromServer(pid, fromTeam);
  const moved = { ...p, teamId: toTeam };
  if (!allPatients[toTeam]) allPatients[toTeam] = [];
  allPatients[toTeam].push(moved);
  _lastSaveMs = Date.now();
  stampTeamEdit(fromTeam);
  stampTeamEdit(toTeam);
  fetch('/api/patient', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(moved)
  }).catch(e => console.error('[patient] Move save failed:', e));
  render(); closeMoveModal();
}

/* ---- DELETE PATIENT MODAL ---- */
function openDeleteModal(pid) {
  _deleteTargetPid = pid;
  closePtMenu();
  const p = findPatient(pid);
  const name = p ? [p.firstName, p.lastName].filter(Boolean).join(' ') || 'this patient' : 'this patient';
  document.getElementById('deletePatientName').textContent = name;
  document.getElementById('deletePatientModal').classList.add('open');
}

function closeDeleteModal() {
  document.getElementById('deletePatientModal').classList.remove('open');
  _deleteTargetPid = null;
}

function handleDeletePatientOverlay(e) {
  if (e.target === document.getElementById('deletePatientModal')) closeDeleteModal();
}

function confirmDeletePatient() {
  const pid = _deleteTargetPid;
  if (!pid) return;
  const p = findPatient(pid);
  if (!p) return;
  const teamId = p.teamId || currentTeam;
  const _delPtName = [p.firstName, p.lastName].filter(Boolean).join(' ') || 'patient';
  pushUndo({ type: 'delete', patient: deepClone(p), teamId, desc: 'deleted ' + _delPtName });
  allPatients[teamId] = (allPatients[teamId] || []).filter(x => x.pid !== pid);
  if (teamId === currentTeam) patients = allPatients[currentTeam];
  deletePatientFromServer(pid, teamId);
  render(); closeDeleteModal();
  checkDuplicates();
}

/* ---- UNDO ---- */
function pushUndo(action) {
  undoStack.push(action);
  if (undoStack.length > 10) undoStack.shift();
  redoStack.length = 0;
  updateUndoRedoBtns();
}

async function performUndo() {
  const action = undoStack.pop();
  if (!action) return;

  switch (action.type) {
    case 'add': {
      const p = findPatient(action.pid);
      if (p) {
        redoStack.push({ type: 'redo_add', patient: deepClone(p), teamId: action.teamId, desc: action.desc });
        allPatients[action.teamId] = (allPatients[action.teamId] || []).filter(x => x.pid !== action.pid);
        if (action.teamId === currentTeam) patients = allPatients[currentTeam];
        await deletePatientFromServer(action.pid, action.teamId);
        render();
      }
      break;
    }
    case 'delete': {
      const teamId = action.teamId;
      redoStack.push({ type: 'redo_delete', pid: action.patient.pid, teamId, patient: deepClone(action.patient), desc: action.desc });
      if (!allPatients[teamId]) allPatients[teamId] = [];
      allPatients[teamId].push(action.patient);
      if (teamId === currentTeam) patients = allPatients[currentTeam];
      savePatient(action.patient.pid);
      render();
      break;
    }
    case 'move': {
      const { patient, fromTeam, toTeam } = action;
      redoStack.push({ type: 'redo_move', patient: deepClone(patient), fromTeam, toTeam, desc: action.desc });
      allPatients[toTeam] = (allPatients[toTeam] || []).filter(x => x.pid !== patient.pid);
      if (!allPatients[fromTeam]) allPatients[fromTeam] = [];
      const restored = { ...patient, teamId: fromTeam };
      allPatients[fromTeam].push(restored);
      if (fromTeam === currentTeam || toTeam === currentTeam) patients = allPatients[currentTeam];
      await deletePatientFromServer(patient.pid, toTeam);
      _lastSaveMs = Date.now();
      fetch('/api/patient', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(restored)
      }).catch(e => console.error('[undo move]', e));
      render();
      break;
    }
    case 'toggle_job': {
      const p = findPatient(action.pid);
      if (p) {
        const j = p.jobs.find(x => x.id === action.jid);
        if (j) {
          redoStack.push({ type: 'redo_toggle', pid: action.pid, teamId: action.teamId, jid: action.jid, targetDone: j.done, desc: action.desc });
          j.done = action.prevDone;
          if (action.prevDone && action.prevCompletedAt) { j.completedAt = action.prevCompletedAt; }
          else { delete j.completedAt; }
          savePatient(action.pid);
          const el = document.querySelector('[data-jid="' + action.jid + '"]');
          if (el) {
            el.classList.toggle('done', j.done);
            const cb = el.querySelector('.job-cb');
            if (cb) cb.checked = j.done;
            const timeEl = el.querySelector('.job-time');
            if (timeEl) timeEl.textContent = j.done && j.completedAt ? ' ✅ ' + fmtCompletedAt(j.completedAt) : '';
          }
          updateJobsCounter(action.pid);
        }
      }
      break;
    }
    case 'clear_all': {
      const { patients: saved, teamId } = action;
      redoStack.push({ type: 'redo_clear', teamId, desc: action.desc });
      if (!allPatients[teamId]) allPatients[teamId] = [];
      for (const p of saved) { allPatients[teamId].push(p); savePatient(p.pid); }
      if (teamId === currentTeam) patients = allPatients[currentTeam];
      render();
      break;
    }
    case 'delete_job': {
      const { pid, job, index } = action;
      const p = findPatient(pid);
      if (p) {
        redoStack.push({ type: 'redo_delete_job', pid, teamId: action.teamId, job: deepClone(job), desc: action.desc });
        p.jobs.splice(index, 0, job);
        savePatient(pid);
        renderJobs(pid);
      }
      break;
    }
    case 'add_job': {
      const p = findPatient(action.pid);
      if (p) {
        const idx = p.jobs.findIndex(j => j.id === action.jid);
        if (idx !== -1) {
          redoStack.push({ type: 'redo_add_job', pid: action.pid, teamId: action.teamId, job: deepClone(p.jobs[idx]), index: idx, desc: action.desc });
          p.jobs.splice(idx, 1);
          savePatient(action.pid);
          renderJobs(action.pid);
        }
      }
      break;
    }
  }

  if (redoStack.length > 10) redoStack.shift();
  updateUndoRedoBtns();
  showToast('Undone' + (action.desc ? ': ' + action.desc : ''));
}

function updateUndoRedoBtns() {
  const u = document.getElementById('undoBtn');
  const r = document.getElementById('redoBtn');
  if (u) u.disabled = undoStack.length === 0;
  if (r) r.disabled = redoStack.length === 0;
}

async function performRedo() {
  const action = redoStack.pop();
  if (!action) return;

  switch (action.type) {
    case 'redo_add': {
      const { patient, teamId } = action;
      undoStack.push({ type: 'add', pid: patient.pid, teamId, desc: action.desc });
      if (!allPatients[teamId]) allPatients[teamId] = [];
      allPatients[teamId].unshift(patient);
      if (teamId === currentTeam) patients = allPatients[currentTeam];
      savePatient(patient.pid);
      render();
      break;
    }
    case 'redo_delete': {
      const { pid, teamId, patient } = action;
      undoStack.push({ type: 'delete', patient: deepClone(patient), teamId, desc: action.desc });
      allPatients[teamId] = (allPatients[teamId] || []).filter(x => x.pid !== pid);
      if (teamId === currentTeam) patients = allPatients[currentTeam];
      await deletePatientFromServer(pid, teamId);
      render();
      break;
    }
    case 'redo_move': {
      const { patient, fromTeam, toTeam } = action;
      undoStack.push({ type: 'move', patient: deepClone(patient), fromTeam, toTeam, desc: action.desc });
      allPatients[fromTeam] = (allPatients[fromTeam] || []).filter(x => x.pid !== patient.pid);
      if (!allPatients[toTeam]) allPatients[toTeam] = [];
      const moved = { ...patient, teamId: toTeam };
      allPatients[toTeam].push(moved);
      if (fromTeam === currentTeam || toTeam === currentTeam) patients = allPatients[currentTeam];
      await deletePatientFromServer(patient.pid, fromTeam);
      _lastSaveMs = Date.now();
      fetch('/api/patient', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(moved)
      }).catch(e => console.error('[redo move]', e));
      render();
      break;
    }
    case 'redo_toggle': {
      const p = findPatient(action.pid);
      if (p) {
        const j = p.jobs.find(x => x.id === action.jid);
        if (j) {
          undoStack.push({ type: 'toggle_job', pid: action.pid, teamId: action.teamId, jid: action.jid, prevDone: j.done, prevCompletedAt: j.completedAt, desc: action.desc });
          j.done = action.targetDone;
          if (j.done) { j.completedAt = Date.now(); } else { delete j.completedAt; }
          savePatient(action.pid);
          const el = document.querySelector('[data-jid="' + action.jid + '"]');
          if (el) {
            el.classList.toggle('done', j.done);
            const cb = el.querySelector('.job-cb');
            if (cb) cb.checked = j.done;
            const timeEl = el.querySelector('.job-time');
            if (timeEl) timeEl.textContent = j.done && j.completedAt ? ' ✅ ' + fmtCompletedAt(j.completedAt) : '';
          }
          updateJobsCounter(action.pid);
        }
      }
      break;
    }
    case 'redo_clear': {
      const { teamId } = action;
      const saved = deepClone(allPatients[teamId] || []);
      undoStack.push({ type: 'clear_all', patients: saved, teamId, desc: action.desc });
      (allPatients[teamId] || []).forEach(p => deletePatientFromServer(p.pid, teamId));
      allPatients[teamId] = [];
      if (teamId === currentTeam) patients = allPatients[currentTeam];
      render();
      break;
    }
    case 'redo_delete_job': {
      const { pid, job, teamId } = action;
      const p = findPatient(pid);
      if (p) {
        const idx = p.jobs.findIndex(j => j.id === job.id);
        undoStack.push({ type: 'delete_job', pid, teamId, job: deepClone(job), index: idx !== -1 ? idx : p.jobs.length, desc: action.desc });
        if (idx !== -1) p.jobs.splice(idx, 1);
        savePatient(pid);
        renderJobs(pid);
      }
      break;
    }
    case 'redo_add_job': {
      const { pid, job, index, teamId } = action;
      const p = findPatient(pid);
      if (p) {
        undoStack.push({ type: 'add_job', pid, teamId, jid: job.id, desc: action.desc });
        p.jobs.splice(index, 0, job);
        savePatient(pid);
        renderJobs(pid);
      }
      break;
    }
  }

  if (undoStack.length > 10) undoStack.shift();
  updateUndoRedoBtns();
  showToast('Redone' + (action.desc ? ': ' + action.desc : ''));
}


function render() {
  const toShow = getSorted(getFiltered());
  const grid   = document.getElementById('grid');
  if (!patients.length) {
    grid.innerHTML =
      '<div class="empty">' +
        '<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>' +
          '<path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' +
        '</svg>' +
        '<h3>No patients on the list</h3>' +
        '<p>Click <strong>Add Patient</strong> to begin the handover</p>' +
      '</div>';
  } else if (!toShow.length) {
    const filterLabel = compartment === 'surgical'
      ? h(surgConsFilter) + ' (consultant)'
      : h(currentFilter) + ' coverage';
    grid.innerHTML =
      '<div class="empty">' +
        '<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">' +
          '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>' +
        '</svg>' +
        '<h3>No patients match this filter</h3>' +
        '<p>No patients match <strong>' + filterLabel + '</strong>.</p>' +
      '</div>';
  } else {
    grid.innerHTML = toShow.map(p => p.compartment === 'surgical' ? surgCardHTML(p) : cardHTML(p)).join('');
  }
  updateCount();
  setTimeout(() => document.querySelectorAll('textarea').forEach(autoH), 10);
}

function exportHandoverSheet() {
  if (compartment === 'surgical') {
    const team = teams.find(t => t.id === currentTeam);
    const params = new URLSearchParams({
      team: currentTeam,
      teamName: team ? team.name : currentTeam,
      compartment: 'surgical',
    });
    window.location.href = '/api/export?' + params.toString();
  } else {
    window.location.href = '/api/export?team=' + encodeURIComponent(currentTeam);
  }
}

function toggleHeaderMenu(event) {
  event.stopPropagation();
  const dd = document.getElementById('hdrDropdown');
  if (!dd) return;
  dd.style.display = dd.style.display === 'none' ? '' : 'none';
}

function closeHeaderMenu() {
  const dd = document.getElementById('hdrDropdown');
  if (dd) dd.style.display = 'none';
}

function setSearch(val) {
  searchQuery = val.toLowerCase().trim();
  render();
}

function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('gm_dark', isDark ? '1' : '0');
}

/* ---- DUPLICATE DETECTION ---- */
let _duplicates = [];
let _dupShownKey = '';

function detectDuplicates() {
  const pts = patients;
  const groups = [];
  const flagged = new Set();

  const byNHI = {};
  pts.forEach(p => {
    const nhi = (p.nhi || '').trim().toUpperCase();
    if (nhi) {
      if (!byNHI[nhi]) byNHI[nhi] = [];
      byNHI[nhi].push(p);
    }
  });
  Object.entries(byNHI).forEach(([nhi, group]) => {
    if (group.length > 1) {
      groups.push({ reason: 'Same NHI: ' + nhi, pids: group.map(p => p.pid) });
      group.forEach(p => flagged.add(p.pid));
    }
  });

  const byName = {};
  pts.forEach(p => {
    const fn = (p.firstName || '').trim().toLowerCase();
    const ln = (p.lastName || '').trim().toLowerCase();
    if (fn && ln) {
      const key = fn + '\x00' + ln;
      if (!byName[key]) byName[key] = [];
      byName[key].push(p);
    }
  });
  Object.entries(byName).forEach(([key, group]) => {
    if (group.length > 1 && group.some(p => !flagged.has(p.pid))) {
      const [fn, ln] = key.split('\x00');
      const name = (fn.charAt(0).toUpperCase() + fn.slice(1)) + ' ' + (ln.charAt(0).toUpperCase() + ln.slice(1));
      groups.push({ reason: 'Same name: ' + name, pids: group.map(p => p.pid) });
      group.forEach(p => flagged.add(p.pid));
    }
  });

  return groups;
}

function checkDuplicates() {
  const groups = detectDuplicates();
  _duplicates = groups;
  const btn = document.getElementById('dupWarnBtn');
  const countEl = document.getElementById('dupWarnCount');

  if (groups.length === 0) {
    if (btn) btn.style.display = 'none';
    _dupShownKey = '';
    return;
  }

  const totalPts = new Set(groups.flatMap(g => g.pids)).size;
  if (btn) btn.style.display = '';
  if (countEl) countEl.textContent = totalPts;

  const key = groups.map(g => [...g.pids].sort().join(',')).sort().join('|');
  if (key !== _dupShownKey) {
    _dupShownKey = key;
    _showDupModal();
  }
}

function _dupPatientLabel(pid) {
  const p = findPatient(pid);
  if (!p) return '(unknown)';
  const name = [p.firstName, p.lastName].filter(Boolean).join(' ') || '(unnamed)';
  return p.nhi ? name + ' — ' + p.nhi : name;
}

function _showDupModal() {
  const groups = _duplicates;
  if (!groups.length) return;
  const total = new Set(groups.flatMap(g => g.pids)).size;
  const descEl = document.getElementById('dupModalDesc');
  const listEl = document.getElementById('dupModalList');
  if (descEl) descEl.textContent = total + ' patient' + (total !== 1 ? 's' : '') + ' appear' + (total === 1 ? 's' : '') + ' to be duplicates:';
  if (listEl) {
    listEl.innerHTML = groups.map(g =>
      '<div class="dup-modal-item">' +
        '<div>' + g.pids.map(pid => h(_dupPatientLabel(pid))).join(', ') + '</div>' +
        '<div class="dup-modal-reason">' + h(g.reason) + '</div>' +
      '</div>'
    ).join('');
  }
  document.getElementById('dupModal').classList.add('open');
}

function openDupModal() {
  if (!_duplicates.length) return;
  _showDupModal();
}

function closeDupModal() {
  document.getElementById('dupModal').classList.remove('open');
}

function handleDupOverlay(e) {
  if (e.target === document.getElementById('dupModal')) closeDupModal();
}

/* ---- SIGN OUT ---- */
async function doSignOut() {
  try { await fetch('/api/logout', { method: 'POST' }); } catch (_) {}
  window.location.href = '/login';
}

/* ---- INIT ---- */
(async function() {
  const now = new Date();
  document.getElementById('barDate').textContent =
    DAYS[now.getDay()] + ', ' + now.getDate() + ' ' + MONTHS[now.getMonth()] + ' ' + now.getFullYear();

  // Dark mode
  if (localStorage.getItem('gm_dark') === '1') {
    document.body.classList.add('dark-mode');
  }

  try { _teamLastEdited = JSON.parse(localStorage.getItem('gm_team_edited') || '{}'); } catch(_) {}

  await loadFromServer();
  updateCompartmentUI();
  renderTeamTabs();
  renderFilterBar();
  render();
  checkDuplicates();
  startAutoRefresh();
  updateLastUpdatedText();
  // Refresh at midnight so "Edited Mon 14:32" becomes "Edited 14:32" when the day rolls over
  setInterval(updateLastUpdatedText, 60000);

  // Fire-and-forget orphan cleanup after initial load
  fetch('/api/cleanup', { method: 'POST' }).catch(() => {});

  document.addEventListener('click', e => {
    closePtMenu();
    const wrap = document.getElementById('hdrMenuWrap');
    if (wrap && !wrap.contains(e.target)) closeHeaderMenu();
  });

  window.addEventListener('keydown', e => {
    const ae = document.activeElement;
    const inText = ae && (ae.tagName === 'TEXTAREA' || (ae.tagName === 'INPUT' && ae.type !== 'checkbox'));
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      if (inText) return;
      e.preventDefault();
      performRedo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
      if (inText) return;
      e.preventDefault();
      performUndo();
      return;
    }
    if (e.key === 'Escape') {
      closeClearModal();
      closeReplaceConfirmModal();
      closeImportModal();
      closeMoveModal();
      closeDeleteModal();
      closeDupModal();
      closePtMenu();
    }
  });

  window.addEventListener('beforeprint', () => {
    document.querySelectorAll('textarea.job-inp').forEach(ta => {
      const d = document.createElement('div');
      d.className = 'job-inp job-pxy';
      d.textContent = ta.value;
      ta.insertAdjacentElement('afterend', d);
    });
    document.querySelectorAll('textarea.inp').forEach(el => {
      el.style.height = 'auto';
      el.style.setProperty('height', el.scrollHeight + 'px', 'important');
    });
  });
  window.addEventListener('afterprint', () => {
    document.querySelectorAll('.job-pxy').forEach(d => d.remove());
    document.querySelectorAll('textarea.inp').forEach(el => {
      el.style.removeProperty('height');
      autoH(el);
    });
  });
})();
