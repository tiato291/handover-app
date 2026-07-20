function savePatient(pid) {
  clearTimeout(_saveTimers[pid]);
  updateCount();
  stampTeamEdit(currentTeam);
  _saveTimers[pid] = setTimeout(() => _doSavePatient(pid), 300);
}

async function _doSavePatient(pid) {
  _lastSaveMs = Date.now();
  const p = findPatient(pid);
  if (!p) return;
  try {
    const res = await fetch('/api/patient', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p)
    });
    if (res.status === 401) { window.location.href = '/login'; return; }
    if (!res.ok) console.error('[patient] Save failed:', res.status);
  } catch(e) { console.error('[patient] Save failed:', e); }
}

async function deletePatientFromServer(pid, teamId) {
  _lastSaveMs = Date.now();
  try {
    const res = await fetch('/api/patient', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pid, teamId })
    });
    if (res.status === 401) { window.location.href = '/login'; return; }
    if (!res.ok) console.error('[patient] Delete failed:', res.status);
  } catch(e) { console.error('[patient] Delete failed:', e); }
}

async function saveTeams() {
  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teams })
    });
    if (res.status === 401) { window.location.href = '/login'; return; }
  } catch(e) { console.error('[teams] Save failed:', e); }
}

/* ---- LOAD FROM SERVER ---- */
async function loadFromServer() {
  try {
    const res = await fetch('/api/data');
    if (res.status === 401) { window.location.href = '/login'; return; }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    const so = document.getElementById('hdrSignOutItem');
    const soDiv = document.getElementById('hdrSignOutDiv');
    if (so) so.style.display = '';
    if (soDiv) soDiv.style.display = '';

    let loadedTeams = data.teams || [];
    if (!loadedTeams.length) loadedTeams = defaultTeams();
    defaultTeams().forEach((def, i) => {
      if (!loadedTeams.find(t => t.id === def.id)) loadedTeams.splice(i, 0, def);
    });
    teams = loadedTeams;

    allPatients = {};
    for (const p of (data.patients || [])) {
      if (!p.teamId) continue;
      if (!allPatients[p.teamId]) allPatients[p.teamId] = [];
      allPatients[p.teamId].push(p);
    }

    if (data._legacy && (data.patients || []).length === 0) {
      await migrateLegacyData(data._legacy);
      return;
    }

    if (!teams.find(t => t.id === currentTeam && teamBelongsTo(t, compartment))) {
      const fallback = teams.find(t => teamBelongsTo(t, compartment));
      if (compartment === 'surgical') {
        currentTeam = currentSurgTeam = (fallback || {}).id || 'surg_boo';
        localStorage.setItem('gm_cur_surg_team', currentTeam);
      } else {
        currentTeam = (fallback || {}).id || 'team1';
        localStorage.setItem('gm_cur_team', currentTeam);
      }
    }
    patients = getTeamPatients(currentTeam);
    normalizePatients();
  } catch(e) {
    console.warn('Could not load from server:', e);
    teams = defaultTeams();
    allPatients = {};
    patients = getTeamPatients(currentTeam);
  }
}

async function migrateLegacyData(legacy) {
  if (!legacy) return;
  if (legacy.teams && legacy.teams.length) {
    teams = legacy.teams;
    defaultTeams().forEach((def, i) => {
      if (!teams.find(t => t.id === def.id)) teams.splice(i, 0, def);
    });
    await saveTeams();
  }
  const saves = [];
  for (const [teamId, teamData] of Object.entries(legacy.teamData || {})) {
    for (const p of (teamData.patients || [])) {
      const pid = newPid();
      const patient = {
        pid, teamId,
        firstName: p.firstName || '', lastName: p.lastName || '',
        age: p.age || '', gender: p.gender || '', genderOther: p.genderOther || '',
        nhi: p.nhi || '', ward: p.ward || 'Medical', bed: p.bed || '',
        diagnosis: p.diagnosis || '', sgoc: p.sgoc || '', sgocNote: p.sgocNote || '',
        assessment: p.assessment || '', background: p.background || '',
        coverage: Array.isArray(p.coverage) ? (p.coverage[0] || '') : (p.coverage || ''),
        jobs: (p.jobs || []).map(j => ({ id: j.id || Date.now(), text: j.text || '', done: !!j.done }))
      };
      if (!allPatients[teamId]) allPatients[teamId] = [];
      allPatients[teamId].push(patient);
      saves.push(_doSavePatient(pid));
    }
  }
  await Promise.all(saves);
  if (!teams.find(t => t.id === currentTeam)) {
    currentTeam = 'team1';
    localStorage.setItem('gm_cur_team', 'team1');
  }
  patients = getTeamPatients(currentTeam);
  normalizePatients();
}

/* ---- AUTO-REFRESH (30 seconds) ---- */
function startAutoRefresh() {
  if (_autoRefreshTimer) return;
  _autoRefreshTimer = setInterval(doAutoRefresh, 30000);
}

async function doAutoRefresh() {
  if (Date.now() - _lastSaveMs < 5000) return;
  const active = document.activeElement;
  const grid   = document.getElementById('grid');
  if (active && grid && grid.contains(active)) return;
  try {
    const res = await fetch('/api/data');
    if (res.status === 401) { window.location.href = '/login'; return; }
    if (!res.ok) return;
    if (Date.now() - _lastSaveMs < 2000) return;
    const data = await res.json();
    let newTeams = data.teams || [];
    if (!newTeams.length) newTeams = defaultTeams();
    defaultTeams().forEach((def, i) => {
      if (!newTeams.find(t => t.id === def.id)) newTeams.splice(i, 0, def);
    });
    teams = newTeams;
    allPatients = {};
    for (const p of (data.patients || [])) {
      if (!p.teamId) continue;
      if (!allPatients[p.teamId]) allPatients[p.teamId] = [];
      allPatients[p.teamId].push(p);
    }
    patients = getTeamPatients(currentTeam);
    normalizePatients();
    updateLastUpdatedText();
    renderTeamTabs();
    renderFilterBar();
    render();
    checkDuplicates();
  } catch(e) { /* network blip */ }
}
