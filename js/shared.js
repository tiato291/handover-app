const PRESETS = [
  'Chase Bloods','Fluid Review','Fluid Balance','Med Review',
  'Heart Rate Review','Blood Pressure Review','For MDT',
  'Wound Review','Imaging Chase','Urine Output Check','Weekend Discharge'
];
const COV      = ['RMO Review','SMO Review','Results Chase','No Review'];
const COV_SLUG  = { 'RMO Review':'rmo', 'SMO Review':'smo', 'Results Chase':'results', 'No Review':'nojobs' };
const COV_ORDER = { 'SMO Review':0, 'RMO Review':1, 'Results Chase':2, 'No Review':3 };
const WARDS    = ['CCU','AT&R','Medical','Surgical','Pediatrics'];
const WARD_ORDER = { CCU: 0, 'AT&R': 1, Medical: 2, Surgical: 3, Pediatrics: 4 };
const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

/* ---- STATE ---- */
let allPatients   = {};   // { teamId: [patient, ...] }
let patients      = [];   // reference to allPatients[currentTeam]
let teams         = [];
let currentTeam     = localStorage.getItem('gm_cur_team') || 'team1';
let compartment     = localStorage.getItem('gm_compartment') || 'medical';
let currentSurgTeam = localStorage.getItem('gm_cur_surg_team') || 'surg_boo';
if (compartment === 'surgical') currentTeam = currentSurgTeam;
let surgConsFilter  = 'All';
let currentFilter   = 'All';
let currentSort     = 'default';
let editMode      = true;

let undoStack        = [];    // max 10 steps
let redoStack        = [];    // max 10 steps
let _openMenuPid     = null;  // currently open three-dot menu pid
let _movePid         = null;
let _moveToTeam      = null;
let _deleteTargetPid = null;

let _lastSaveMs        = 0;
const _saveTimers      = {};
let _autoRefreshTimer  = null;
let searchQuery        = '';
let _teamLastEdited    = {};

/* ---- HELPERS ---- */
function newPid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'pid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}

function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }
function trunc(s, n) { n = n || 28; s = (s || '').trim(); return s.length > n ? s.slice(0, n) + '…' : s; }

function findPatient(pid) {
  for (const tp of Object.values(allPatients)) {
    const p = tp.find(x => x.pid === pid);
    if (p) return p;
  }
  return null;
}

function getTeamPatients(teamId) {
  if (!allPatients[teamId]) allPatients[teamId] = [];
  return allPatients[teamId];
}

/* ---- TEAM DEFAULTS ---- */
function defaultTeams() {
  return [
    { id:'team1',    name:'Team Red',           fixed:true },
    { id:'team2',    name:'Team Green',         fixed:true },
    { id:'team3',    name:'Team Blue',          fixed:true },
    { id:'team4',    name:'Team Yellow',        fixed:true },
    { id:'team5',    name:'Overnight Handover', fixed:true },
    { id:'surg_boo', name:'BOO',  compartment:'surgical', consultants:["Bonnet","O'Grady","Omar"],          fixed:true },
    { id:'surg_lash',name:'LASH', compartment:'surgical', consultants:['Lill','Howley','Aiono','Skavysh'], fixed:true },
  ];
}

/* ---- COMPARTMENT HELPERS ---- */
function teamBelongsTo(t, comp) {
  return comp === 'surgical' ? t.compartment === 'surgical' : t.compartment !== 'surgical';
}

function getTeamConsultants(teamId) {
  const t = teams.find(x => x.id === teamId);
  return (t && t.consultants) || [];
}

function stampTeamEdit(tid) {
  _teamLastEdited[tid] = Date.now();
  localStorage.setItem('gm_team_edited', JSON.stringify(_teamLastEdited));
  updateLastUpdatedText();
}

/* ---- NORMALIZATION ---- */
function normalizePatients() {
  patients.forEach(p => {
    if (p.compartment === 'surgical') {
      if (p.problemList === undefined) p.problemList = '';
      if (p.background  === undefined) p.background  = '';
      if (p.results     === undefined) p.results     = '';
      if (p.plan        === undefined) p.plan        = '';
      if (p.smo         === undefined) p.smo         = '';
      if (p.doa         === undefined) p.doa         = '';
      if (p.pod         === undefined) p.pod         = '';
      if (p.opDate      === undefined) p.opDate      = '';
      if (p.title       === undefined) p.title       = '';
      if (p.age         === undefined) p.age         = '';
      if (p.gender      === undefined) p.gender      = '';
      if (!p.ward)                     p.ward        = 'Surgical';
    } else {
      if (Array.isArray(p.coverage)) p.coverage = p.coverage[0] || '';
      else if (p.coverage == null)   p.coverage = '';
      if (p.sgoc        === undefined) p.sgoc        = '';
      if (p.sgocNote    === undefined) p.sgocNote    = '';
      if (p.age         === undefined) p.age         = '';
      if (p.gender      === undefined) p.gender      = '';
      if (p.genderOther === undefined) p.genderOther = '';
      if (!p.ward)     p.ward     = 'Medical';
      if (!p.jobs)     p.jobs     = [];
      if (!p.coverage) p.coverage = 'No Review';
    }
  });
}

function setField(pid, key, val) {
  const p = findPatient(pid);
  if (p) { p[key] = val; savePatient(pid); }
}

function toggleMode() {
  editMode = !editMode;
  if (editMode) {
    document.body.classList.remove('view-mode');
  } else {
    document.body.classList.add('view-mode');
  }
  const lbl = document.getElementById('hdrModeLabel');
  if (lbl) lbl.textContent = editMode ? 'Switch to View Mode' : 'Switch to Edit Mode';
}

/* ---- TOAST ---- */
let _toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove('show'), 2000);
}

/* ---- DOM HELPERS ---- */
function qpid(pid) { return document.querySelector('[data-pid="' + pid + '"]'); }

function h(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function genderLabel(p) {
  if (!p.gender) return '';
  return p.gender === 'Other' ? (p.genderOther || 'Other') : p.gender;
}

function refreshHeader(pid) {
  const p = findPatient(pid), card = qpid(pid);
  if (!p || !card) return;
  const nameInps = card.querySelectorAll('.hdr-name-inp');
  if (nameInps[0] && nameInps[0] !== document.activeElement) nameInps[0].value = p.firstName || '';
  if (nameInps[1] && nameInps[1] !== document.activeElement) nameInps[1].value = p.lastName  || '';
  const ageInp = card.querySelector('.hdr-age-inp');
  if (ageInp && ageInp !== document.activeElement) ageInp.value = p.age || '';
  const nhiInp = card.querySelector('.hdr-nhi-inp');
  if (nhiInp && nhiInp !== document.activeElement) nhiInp.value = p.nhi || '';
  const wardSel = card.querySelector('.hdr-ward-sel');
  if (wardSel && wardSel !== document.activeElement) wardSel.value = p.ward || 'Medical';
  const bedInp = card.querySelector('.hdr-bed-inp');
  if (bedInp && bedInp !== document.activeElement) bedInp.value = p.bed || '';
}
// Keep refreshTop as alias for backward compat with any residual callers
const refreshTop = refreshHeader;

function autoH(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }

/* ---- SURGICAL CSV IMPORT ---- */

const SURG_CONSULTANTS = {
  'bonnet':   { smo: 'Bonnet',   team: 'surg_boo'  },
  "o'grady":  { smo: "O'Grady",  team: 'surg_boo'  },
  'grady':    { smo: "O'Grady",  team: 'surg_boo'  },
  'omar':     { smo: 'Omar',     team: 'surg_boo'  },
  'lill':     { smo: 'Lill',     team: 'surg_lash' },
  'howley':   { smo: 'Howley',   team: 'surg_lash' },
  'aiono':    { smo: 'Aiono',    team: 'surg_lash' },
  'skavysh':  { smo: 'Skavysh',  team: 'surg_lash' },
};

function parseSurgAdmissionDate(dateStr) {
  if (!dateStr) return '';
  const s = String(dateStr).trim();
  // D/M, DD/MM, or DD/MM/YYYY (with optional trailing time) — already-normalised or numeric date
  const slashM = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/\d{4})?(?:\s.*)?$/);
  if (slashM) return parseInt(slashM[1], 10) + '/' + parseInt(slashM[2], 10);
  // DD-Mon-YYYY [HH:MM] — Clinical Portal format
  const datePart = s.split(' ')[0]; // "17-Jul-2026"
  const parts = datePart.split('-');
  if (parts.length < 3) return s;
  const [day, mon] = parts;
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthNum = MONTHS_SHORT.indexOf(mon) + 1;
  if (!monthNum) return s;
  return parseInt(day, 10) + '/' + monthNum; // "17/7"
}

function extractSurgeonSurname(clinician) {
  if (!clinician) return '';
  const words = clinician.trim().split(/\s+/);
  return words[words.length - 1] || '';
}

function updateLastUpdatedText() {
  const el = document.getElementById('lastUpdated');
  if (!el) return;
  const ts = _teamLastEdited[currentTeam];
  if (!ts) { el.textContent = ''; return; }
  const d    = new Date(ts);
  const now  = new Date();
  const hh   = d.getHours().toString().padStart(2, '0');
  const mm   = d.getMinutes().toString().padStart(2, '0');
  const time = hh + ':' + mm;
  const sameDay = d.getFullYear() === now.getFullYear() &&
                  d.getMonth()    === now.getMonth()    &&
                  d.getDate()     === now.getDate();
  const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  el.textContent = sameDay
    ? 'Edited ' + time
    : 'Edited ' + DAY_NAMES[d.getDay()] + ' ' + time;
}

