// ============================================================
// DriveNet - Application web (version Flutter portée)
// ============================================================

const DEFAUTS = {
  recetteHebdo: 60000,
  consommationF100km: 6500,
  modeSombreAuto: true,
  modeSombre: false,
  onboardingFait: false,
};

const LS_PARAMS  = 'drivenet_params_v1';
const LS_SEMAINE = 'drivenet_semaine_v1';
const LS_HISTO   = 'drivenet_historique_v1';

let state = {
  params: { ...DEFAUTS },
  semaine: { debut: '', pointages: [] },
  historique: [],
  editingIndex: null,
};

// -------- Dates --------
function lundiDeLaSemaine(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0 = dimanche
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function isoDay(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIsoDay(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtTimestamp(isoTs) {
  const d = new Date(isoTs);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${mi}`;
}

// -------- Formatage --------
function grouper(n) {
  const abs = Math.abs(Math.round(n)).toString();
  let out = '';
  for (let i = 0; i < abs.length; i++) {
    if (i > 0 && (abs.length - i) % 3 === 0) out += '\u00A0';
    out += abs[i];
  }
  return out;
}

function fmt(n) {
  const r = Math.round(n);
  return `${r < 0 ? '-' : ''}${grouper(r)}\u00A0Fcfa`;
}

function fmtKm(n) {
  return `${grouper(n)}\u00A0km`;
}

function fmtPct(n) {
  return `${n.toFixed(1).replace('.', ',')}\u00A0%`;
}

// -------- Persistance --------
function save() {
  localStorage.setItem(LS_PARAMS, JSON.stringify(state.params));
  localStorage.setItem(LS_SEMAINE, JSON.stringify(state.semaine));
  localStorage.setItem(LS_HISTO, JSON.stringify(state.historique));
}

function load() {
  try { const p = JSON.parse(localStorage.getItem(LS_PARAMS) || 'null'); if (p) state.params = { ...DEFAUTS, ...p }; } catch (e) {}
  try { const s = JSON.parse(localStorage.getItem(LS_SEMAINE) || 'null'); if (s && s.debut) state.semaine = s; } catch (e) {}
  try { const h = JSON.parse(localStorage.getItem(LS_HISTO) || '[]'); if (Array.isArray(h)) state.historique = h; } catch (e) {}
}

function ensureCurrentWeek() {
  const isoLundi = isoDay(lundiDeLaSemaine(new Date()));
  if (!state.semaine.debut) {
    state.semaine = { debut: isoLundi, pointages: [] };
    return true;
  }
  if (state.semaine.debut !== isoLundi) {
    if (state.semaine.pointages.length > 0) {
      state.historique.unshift(state.semaine);
      if (state.historique.length > 52) state.historique = state.historique.slice(0, 52);
    }
    state.semaine = { debut: isoLundi, pointages: [] };
    return true;
  }
  return false;
}

// -------- Calculs --------
function carburantConsomme(pt, conso) {
  return pt.km * conso / 100;
}

function beneficePointage(pt, conso) {
  return pt.cash - pt.recetteVersee - carburantConsomme(pt, conso) - pt.yango;
}

function calculerBilan(params, semaine) {
  const conso = params.consommationF100km;
  let argent = 0, recette = 0, commission = 0, carburant = 0, carburantMis = 0, km = 0;
  let dernierBenefice = 0;
  for (const pt of semaine.pointages) {
    argent += pt.cash;
    recette += pt.recetteVersee;
    commission += pt.yango;
    carburant += carburantConsomme(pt, conso);
    carburantMis += pt.carburantMis;
    km += pt.km;
    dernierBenefice = beneficePointage(pt, conso);
  }
  const beneficeCumule = argent - recette - carburant - commission;
  const recetteRestante = Math.max(0, params.recetteHebdo - recette);
  const avancement = params.recetteHebdo > 0 ? Math.min(1, recette / params.recetteHebdo) : 1;
  let autonomie = null;
  if (semaine.pointages.length > 0 && carburantMis > 0 && conso > 0) {
    autonomie = (carburantMis / (conso / 100)) - km;
  }
  return { aPointages: semaine.pointages.length > 0, argent, recette, commission, carburant, km, dernierBenefice, beneficeCumule, recetteRestante, avancement, autonomie };
}

// -------- Thème --------
function appliquerTheme() {
  let dark;
  if (state.params.modeSombreAuto) {
    const h = new Date().getHours();
    dark = h >= 18 || h < 6;
  } else {
    dark = state.params.modeSombre;
  }
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

// -------- Rendu --------
function render() {
  appliquerTheme();
  const onboarding = document.getElementById('onboarding');
  const app = document.getElementById('app');

  if (!state.params.onboardingFait) {
    onboarding.classList.remove('hidden');
    app.classList.add('hidden');
    return;
  }
  onboarding.classList.add('hidden');
  app.classList.remove('hidden');

  const b = calculerBilan(state.params, state.semaine);
  renderHero(b);
  renderDetails(b);
  renderRecette(b);
  renderPointagesList();
}

function renderHero(b) {
  const el = document.getElementById('hero');
  if (!b.aPointages) {
    el.innerHTML = `
      <div class="label">BÉNÉFICE NET EN CASH</div>
      <div class="amount" style="color: var(--text-muted)">—</div>
      <div class="subtitle">Faites votre premier pointage</div>`;
    return;
  }
  const clsB = b.dernierBenefice >= 0 ? 'pos' : 'neg';
  const clsC = b.beneficeCumule >= 0 ? 'pos' : 'neg';
  el.innerHTML = `
    <div class="label">BÉNÉFICE NET EN CASH</div>
    <div class="amount ${clsB}">${fmt(b.dernierBenefice)}</div>
    <div class="subtitle">c'est ton argent</div>
    <div class="divider"></div>
    <div class="cumul-row">
      <span>Bénéfice cumulé de la semaine</span>
      <span class="${clsC}" style="font-weight:600">${fmt(b.beneficeCumule)}</span>
    </div>`;
}

function renderDetails(b) {
  const el = document.getElementById('details');
  const autoCls = b.autonomie !== null && b.autonomie < 0 ? 'neg' : '';
  el.innerHTML = `
    <div>DÉTAILS</div>
    <div class="row"><span>Argent généré</span><span>${fmt(b.argent)}</span></div>
    <div class="row"><span>Recette versée</span><span>${fmt(b.recette)}</span></div>
    <div class="row"><span>Recharge Solde</span><span>${fmt(b.commission)}</span></div>
    <div class="row"><span>Carburant Consommé (${fmtKm(b.km)})</span><span>${fmt(b.carburant)}</span></div>
    <hr>
    <div class="row gras ${autoCls}">
      <span>Autonomie restante</span>
      <span>${b.autonomie === null ? '—' : fmtKm(b.autonomie)}</span>
    </div>`;
}

function renderRecette(b) {
  const el = document.getElementById('recette');
  const pct = fmtPct(b.avancement * 100);
  const fillCls = b.recetteRestante <= 0 ? 'ok' : 'warn';
  const content = b.recetteRestante <= 0
    ? `<div class="badge-ok">✓ RECETTE COUVERTE — chaque franc généré est pour toi</div>`
    : `<div class="recette-info">Versé : ${fmt(b.recette)} / ${fmt(state.params.recetteHebdo)}</div>
       <div class="recette-info reste">Reste à verser : ${fmt(b.recetteRestante)}</div>`;
  el.innerHTML = `
    <div class="progress-header"><span>Recette hebdomadaire</span><span>${pct}</span></div>
    <div class="progress-bar"><div class="progress-fill ${fillCls}" style="width:${(b.avancement * 100).toFixed(1)}%"></div></div>
    ${content}`;
}

function renderPointagesList() {
  const el = document.getElementById('pointages-list');
  if (state.semaine.pointages.length === 0) { el.innerHTML = ''; return; }
  const conso = state.params.consommationF100km;
  const items = state.semaine.pointages.map((pt, i) => ({ pt, i })).reverse();
  el.innerHTML = `
    <div class="section-title">Pointages de la semaine</div>
    ${items.map(({ pt, i }) => {
      const benef = beneficePointage(pt, conso);
      const cls = benef >= 0 ? 'pos' : 'neg';
      return `<div class="pointage-row">
        <div class="info">
          <div class="top-line">
            <span class="timestamp">${fmtTimestamp(pt.timestamp)}</span>
            <span class="benefice ${cls}">${fmt(benef)}</span>
          </div>
          <div class="details-line">Argent ${fmt(pt.cash)} • Recette ${fmt(pt.recetteVersee)} • Yango ${fmt(pt.yango)} • Km ${fmtKm(pt.km)}</div>
        </div>
        <div class="row-actions">
          <button data-edit="${i}" title="Modifier">✏️</button>
          <button data-delete="${i}" title="Supprimer">🗑️</button>
        </div>
      </div>`;
    }).join('')}`;
  el.querySelectorAll('[data-edit]').forEach(btn =>
    btn.addEventListener('click', () => ouvrirEdition(parseInt(btn.dataset.edit))));
  el.querySelectorAll('[data-delete]').forEach(btn =>
    btn.addEventListener('click', () => supprimerPointage(parseInt(btn.dataset.delete))));
}

// -------- Modale pointage --------
function ouvrirNouveauPointage() {
  state.editingIndex = null;
  document.getElementById('modal-title').textContent = 'Nouveau pointage';
  ['p-cash','p-km','p-carburant','p-yango','p-recette'].forEach(id => document.getElementById(id).value = '');
  updateApercu();
  document.getElementById('modal-pointage').classList.remove('hidden');
}

function ouvrirEdition(index) {
  state.editingIndex = index;
  const pt = state.semaine.pointages[index];
  document.getElementById('modal-title').textContent = 'Modifier le pointage';
  document.getElementById('p-cash').value = pt.cash;
  document.getElementById('p-km').value = pt.km;
  document.getElementById('p-carburant').value = pt.carburantMis;
  document.getElementById('p-yango').value = pt.yango;
  document.getElementById('p-recette').value = pt.recetteVersee;
  updateApercu();
  document.getElementById('modal-pointage').classList.remove('hidden');
}

function fermerPointage() { document.getElementById('modal-pointage').classList.add('hidden'); }

function lireValeur(id) {
  const v = parseFloat(document.getElementById(id).value);
  return isNaN(v) || v < 0 ? 0 : v;
}

function updateApercu() {
  const pt = {
    cash: lireValeur('p-cash'),
    km: lireValeur('p-km'),
    carburantMis: lireValeur('p-carburant'),
    yango: lireValeur('p-yango'),
    recetteVersee: lireValeur('p-recette'),
  };
  const conso = state.params.consommationF100km;
  let semaine;
  if (state.editingIndex !== null) {
    const copie = state.semaine.pointages.slice();
    copie[state.editingIndex] = { ...pt, timestamp: state.semaine.pointages[state.editingIndex].timestamp };
    semaine = { ...state.semaine, pointages: copie };
  } else {
    semaine = { ...state.semaine, pointages: [...state.semaine.pointages, { ...pt, timestamp: new Date().toISOString() }] };
  }
  const b = calculerBilan(state.params, semaine);
  const benefPt = beneficePointage(pt, conso);
  const clsB = benefPt >= 0 ? 'pos' : 'neg';
  const clsC = b.beneficeCumule >= 0 ? 'pos' : 'neg';
  const autoCls = b.autonomie !== null && b.autonomie < 0 ? 'neg' : '';
  document.getElementById('apercu').innerHTML = `
    <div class="row gras"><span>Bénéfice à l'instant</span><span class="${clsB}">${fmt(benefPt)}</span></div>
    <div class="row"><span>Bénéfice cumulé de la semaine</span><span class="${clsC}">${fmt(b.beneficeCumule)}</span></div>
    <div class="row"><span>Recette restante</span><span>${b.recetteRestante <= 0 ? 'COUVERTE ✓' : fmt(b.recetteRestante)}</span></div>
    <div class="row ${autoCls}"><span>Autonomie restante</span><span>${b.autonomie === null ? '—' : fmtKm(b.autonomie)}</span></div>`;
}

function soumettrePointage(e) {
  e.preventDefault();
  const pt = {
    cash: lireValeur('p-cash'),
    km: lireValeur('p-km'),
    carburantMis: lireValeur('p-carburant'),
    yango: lireValeur('p-yango'),
    recetteVersee: lireValeur('p-recette'),
  };
  if (state.editingIndex !== null) {
    const ancien = state.semaine.pointages[state.editingIndex];
    state.semaine.pointages[state.editingIndex] = { ...pt, timestamp: ancien.timestamp };
  } else {
    state.semaine.pointages.push({ ...pt, timestamp: new Date().toISOString() });
  }
  save();
  fermerPointage();
  render();
}

function supprimerPointage(index) {
  if (!confirm('Supprimer ce pointage ?')) return;
  state.semaine.pointages.splice(index, 1);
  save();
  render();
}

// -------- Paramètres --------
function ouvrirSettings() {
  document.getElementById('s-recette').value = state.params.recetteHebdo;
  document.getElementById('s-conso').value = state.params.consommationF100km;
  document.getElementById('s-dark-auto').checked = state.params.modeSombreAuto;
  document.getElementById('s-dark').checked = state.params.modeSombre;
  document.getElementById('manual-dark-row').style.display = state.params.modeSombreAuto ? 'none' : 'flex';
  document.getElementById('modal-settings').classList.remove('hidden');
}

function fermerSettings() { document.getElementById('modal-settings').classList.add('hidden'); }

function soumettreSettings(e) {
  e.preventDefault();
  const recette = parseFloat(document.getElementById('s-recette').value);
  const conso = parseFloat(document.getElementById('s-conso').value);
  if (isNaN(recette) || isNaN(conso) || recette < 0 || conso < 0) {
    alert('Valeurs invalides');
    return;
  }
  state.params.recetteHebdo = recette;
  state.params.consommationF100km = conso;
  state.params.modeSombreAuto = document.getElementById('s-dark-auto').checked;
  state.params.modeSombre = document.getElementById('s-dark').checked;
  save();
  fermerSettings();
  render();
}

// -------- Historique --------
function ouvrirHistory() {
  const el = document.getElementById('history-list');
  if (state.historique.length === 0) {
    el.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:24px">Aucune semaine archivée pour le moment.</p>';
  } else {
    el.innerHTML = state.historique.map(s => {
      const b = calculerBilan(state.params, s);
      const cls = b.beneficeCumule >= 0 ? 'pos' : 'neg';
      const debut = parseIsoDay(s.debut);
      const fin = new Date(debut); fin.setDate(fin.getDate() + 6);
      return `<div class="history-item">
        <div class="title">Semaine du ${debut.getDate()}/${debut.getMonth() + 1} au ${fin.getDate()}/${fin.getMonth() + 1}</div>
        <div class="row"><span>Argent généré</span><span>${fmt(b.argent)}</span></div>
        <div class="row"><span>Recette versée</span><span>${fmt(b.recette)}</span></div>
        <div class="row gras"><span>Bénéfice cumulé</span><span class="${cls}">${fmt(b.beneficeCumule)}</span></div>
      </div>`;
    }).join('');
  }
  document.getElementById('modal-history').classList.remove('hidden');
}

function fermerHistory() { document.getElementById('modal-history').classList.add('hidden'); }

// -------- Nouvelle semaine --------
function nouvelleSemaine() {
  if (!confirm('Archiver la semaine actuelle et démarrer une nouvelle semaine ?')) return;
  if (state.semaine.pointages.length > 0) {
    state.historique.unshift(state.semaine);
    if (state.historique.length > 52) state.historique = state.historique.slice(0, 52);
  }
  state.semaine = { debut: isoDay(lundiDeLaSemaine(new Date())), pointages: [] };
  save();
  render();
}

// -------- Onboarding --------
function finaliserOnboarding() {
  const conso = parseFloat(document.getElementById('ob-conso').value);
  const recette = parseFloat(document.getElementById('ob-recette').value);
  if (isNaN(conso) || isNaN(recette) || conso <= 0 || recette <= 0) {
    alert('Renseignez les deux valeurs (nombres positifs).');
    return;
  }
  state.params.consommationF100km = conso;
  state.params.recetteHebdo = recette;
  state.params.onboardingFait = true;
  state.semaine = { debut: isoDay(lundiDeLaSemaine(new Date())), pointages: [] };
  save();
  render();
}

// -------- Initialisation --------
function init() {
  load();
  ensureCurrentWeek();
  save();

  document.getElementById('ob-start').addEventListener('click', finaliserOnboarding);
  document.getElementById('btn-new-pointage').addEventListener('click', ouvrirNouveauPointage);
  document.getElementById('btn-cancel-pointage').addEventListener('click', fermerPointage);
  document.getElementById('form-pointage').addEventListener('submit', soumettrePointage);
  ['p-cash','p-km','p-carburant','p-yango','p-recette'].forEach(id =>
    document.getElementById(id).addEventListener('input', updateApercu));

  document.getElementById('btn-settings').addEventListener('click', ouvrirSettings);
  document.getElementById('btn-cancel-settings').addEventListener('click', fermerSettings);
  document.getElementById('form-settings').addEventListener('submit', soumettreSettings);
  document.getElementById('s-dark-auto').addEventListener('change', e => {
    document.getElementById('manual-dark-row').style.display = e.target.checked ? 'none' : 'flex';
  });

  document.getElementById('btn-history').addEventListener('click', ouvrirHistory);
  document.getElementById('btn-close-history').addEventListener('click', fermerHistory);
  document.getElementById('btn-new-semaine').addEventListener('click', nouvelleSemaine);

  // Fermer les modales en cliquant sur le fond
  document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); });
  });

  // Rafraîchir le thème auto toutes les minutes
  setInterval(() => { if (state.params.modeSombreAuto) appliquerTheme(); }, 60000);

  render();
}

document.addEventListener('DOMContentLoaded', init);
