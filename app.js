// ================================================================
// DriveNet — version web
// Reproduction fidèle de l'application Flutter
// ================================================================

// ---------- Constantes ----------
const RECETTE_HEBDO_DEFAUT = 60000;
const CONSO_F100KM_DEFAUT = 6500;
const DATE_LIMITE_BETA = new Date(2026, 11, 31, 0, 0, 0); // 31 déc. 2026 à minuit
const STORAGE_KEY = 'drivenet_v1';
const NBSP = '\u00A0';

// ---------- État ----------
let state = {
  parametres: {
    recetteHebdo: RECETTE_HEBDO_DEFAUT,
    consommationF100km: CONSO_F100KM_DEFAUT,
    modeSombreAuto: true,
    modeSombre: false,
    onboardingFait: false,
  },
  semaine: { debut: null, pointages: [] },
  historique: [],
};
let editingIndex = null;

// ================================================================
// Persistance (localStorage, équivalent de shared_preferences)
// ================================================================
function charger() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (p.parametres) state.parametres = { ...state.parametres, ...p.parametres };
    if (p.semaine) state.semaine = p.semaine;
    if (Array.isArray(p.historique)) state.historique = p.historique;
  } catch (e) {
    console.error('charger:', e);
  }
}
function sauver() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('sauver:', e);
  }
}

// ================================================================
// Utilitaires de formatage (miroir exact de fmt, fmtPct, fmtKm, lire)
// ================================================================
function groupe(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += NBSP;
    out += s[i];
  }
  return out;
}
function fmt(v) {
  const r = Math.round(v);
  const sign = r < 0 ? '-' : '';
  return sign + groupe(Math.abs(r).toString()) + NBSP + 'Fcfa';
}
function fmtPct(v) {
  return v.toFixed(1).replace('.', ',') + NBSP + '%';
}
function fmtKm(v) {
  return groupe(Math.round(v).toString()) + NBSP + 'km';
}
function lire(texte) {
  if (texte == null) return 0;
  const t = String(texte).replace(/[\s\u00A0\u202F]/g, '').replace(',', '.');
  if (t === '') return 0;
  const v = parseFloat(t);
  if (!isFinite(v)) return null;
  return v;
}
function lundiDeLaSemaine(d) {
  const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = dd.getDay() || 7; // 1 = lundi, 7 = dimanche
  dd.setDate(dd.getDate() - (day - 1));
  return dd;
}
function memeJour(a, b) {
  if (!a || !b) return false;
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear()
    && da.getMonth() === db.getMonth()
    && da.getDate() === db.getDate();
}
function fmtDate(d) {
  return String(d.getDate()).padStart(2, '0') + '/'
    + String(d.getMonth() + 1).padStart(2, '0');
}
function fmtHeure(d) {
  return String(d.getHours()).padStart(2, '0') + ':'
    + String(d.getMinutes()).padStart(2, '0');
}
function numVersTexte(v) {
  if (Number.isInteger(v)) return v.toString();
  return v.toString().replace('.', ',');
}

// ================================================================
// Calculs (réplique exacte de calculerBilan)
// ================================================================
function calculerBilan(p, s) {
  let argent = 0, recette = 0, commission = 0, carburant = 0;
  let carburantMis = 0, km = 0, dernierBenefice = 0;

  for (const pt of s.pointages) {
    const c = pt.km * p.consommationF100km / 100;
    carburant += c;
    argent += pt.cash;
    recette += pt.recetteVersee;
    commission += pt.yango;
    carburantMis += pt.carburantMis;
    km += pt.km;
    dernierBenefice = pt.cash - pt.recetteVersee - c - pt.yango;
  }

  const beneficeCumule = argent - recette - carburant - commission;
  const recetteRestante = Math.max(0, p.recetteHebdo - recette);
  const avancement = p.recetteHebdo > 0 ? Math.min(1, recette / p.recetteHebdo) : 1;

  let autonomie = null;
  if (s.pointages.length > 0 && carburantMis > 0 && p.consommationF100km > 0) {
    autonomie = (carburantMis / (p.consommationF100km / 100)) - km;
  }

  return {
    aPointages: s.pointages.length > 0,
    argentGenereCumule: argent,
    recetteCumulee: recette,
    commissionCumulee: commission,
    carburantCumule: carburant,
    totalKm: km,
    beneficeDernierPointage: dernierBenefice,
    beneficeCumule,
    recetteRestante,
    avancement,
    autonomieKm: autonomie,
    recetteCouverte: recetteRestante <= 0.001,
  };
}

// ================================================================
// Thème sombre (auto 18h–6h, ou manuel)
// ================================================================
function isDark() {
  if (!state.parametres.modeSombreAuto) return state.parametres.modeSombre;
  const h = new Date().getHours();
  return h >= 18 || h < 6;
}
function appliquerTheme() {
  document.body.classList.toggle('dark', isDark());
}

// ================================================================
// Navigation
// ================================================================
function goTo(screen) {
  document.querySelectorAll('.screen').forEach(el => {
    el.hidden = el.dataset.screen !== screen;
  });
  window.scrollTo(0, 0);
}

// ================================================================
// Modal de confirmation
// ================================================================
function showModal(title, body, confirmLabel, danger) {
  return new Promise(resolve => {
    const modal = document.getElementById('modal');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').textContent = body;
    const cancelBtn = document.getElementById('modal-cancel');
    const confirmBtn = document.getElementById('modal-confirm');
    confirmBtn.textContent = confirmLabel || 'Confirmer';
    confirmBtn.className = 'btn-primary' + (danger ? ' btn-danger' : '');

    function close(val) {
      modal.hidden = true;
      cancelBtn.onclick = null;
      confirmBtn.onclick = null;
      modal.onclick = null;
      resolve(val);
    }
    cancelBtn.onclick = () => close(false);
    confirmBtn.onclick = () => close(true);
    modal.onclick = (e) => { if (e.target === modal) close(false); };
    modal.hidden = false;
  });
}

// ================================================================
// Action sheet (menu ⋮ des pointages)
// ================================================================
function showActionSheet(items) {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.style.alignItems = 'flex-end';

    const sheet = document.createElement('div');
    sheet.className = 'modal';
    sheet.style.marginBottom = '16px';
    sheet.style.padding = '8px';

    items.forEach(item => {
      const btn = document.createElement('button');
      btn.textContent = item.label;
      btn.style.cssText =
        'width:100%;text-align:left;padding:14px 16px;border:none;'
        + 'background:none;cursor:pointer;border-radius:8px;font-size:16px;'
        + 'font-weight:500;'
        + 'color:' + (item.danger ? 'var(--rouge)' : 'var(--text)') + ';';
      btn.onmouseenter = () => btn.style.background = 'var(--surface)';
      btn.onmouseleave = () => btn.style.background = 'none';
      btn.onclick = () => {
        document.body.removeChild(backdrop);
        resolve(true);
        item.action();
      };
      sheet.appendChild(btn);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Annuler';
    cancelBtn.style.cssText =
      'width:100%;text-align:left;padding:14px 16px;border:none;'
      + 'background:none;color:var(--text-muted);font-size:16px;'
      + 'cursor:pointer;border-radius:8px;border-top:1px solid var(--divider);'
      + 'margin-top:4px;';
    cancelBtn.onclick = () => {
      document.body.removeChild(backdrop);
      resolve(null);
    };
    sheet.appendChild(cancelBtn);

    backdrop.appendChild(sheet);
    document.body.appendChild(backdrop);
    backdrop.onclick = (e) => {
      if (e.target === backdrop) {
        document.body.removeChild(backdrop);
        resolve(null);
      }
    };
  });
}

// ================================================================
// Archivage / reset hebdomadaire
// ================================================================
function verifierSemaine() {
  const lundi = lundiDeLaSemaine(new Date());
  if (!state.semaine.debut || !memeJour(state.semaine.debut, lundi)) {
    if (state.semaine.pointages && state.semaine.pointages.length > 0) {
      state.historique.push({
        debut: state.semaine.debut,
        pointages: state.semaine.pointages,
      });
      while (state.historique.length > 52) state.historique.shift();
    }
    state.semaine = { debut: lundi.toISOString(), pointages: [] };
    sauver();
  }
}

// ================================================================
// Rendus
// ================================================================
function renderOnboarding() {
  const conso = document.getElementById('onb-conso');
  const recette = document.getElementById('onb-recette');
  const btn = document.getElementById('onb-btn');
  const err = document.getElementById('onb-error');

  conso.value = Math.round(state.parametres.consommationF100km).toString();
  recette.value = Math.round(state.parametres.recetteHebdo).toString();

  function update() {
    const c = lire(conso.value);
    const r = lire(recette.value);
    const ok = c != null && r != null && c > 0 && r > 0;
    btn.disabled = !ok;
    err.hidden = ok;
  }
  conso.oninput = update;
  recette.oninput = update;
  update();

  btn.onclick = () => {
    const c = lire(conso.value);
    const r = lire(recette.value);
    if (c == null || r == null || c <= 0 || r <= 0) return;
    state.parametres.consommationF100km = c;
    state.parametres.recetteHebdo = r;
    state.parametres.onboardingFait = true;
    sauver();
    renderMain();
    goTo('main');
  };
}

function renderMain() {
  const p = state.parametres;
  const s = state.semaine;
  const b = calculerBilan(p, s);
  const el = document.getElementById('main-content');

  const heroCls = b.beneficeDernierPointage >= 0 ? 'amount-pos' : 'amount-neg';
  const cumulCls = b.beneficeCumule >= 0 ? 'amount-pos' : 'amount-neg';

  let html = '';

  // Carte héros
  if (!b.aPointages) {
    html += `
      <div class="card card-hero">
        <div class="card-label">BÉNÉFICE NET EN CASH</div>
        <div class="hero-amount" style="color: var(--grey)">—</div>
        <div class="hero-sub">Faites votre premier pointage</div>
      </div>`;
  } else {
    html += `
      <div class="card card-hero">
        <div class="card-label">BÉNÉFICE NET EN CASH</div>
        <div class="hero-amount ${heroCls}">${fmt(b.beneficeDernierPointage)}</div>
        <div class="hero-sub">c'est ton argent</div>
        <div class="hero-divider"></div>
        <div class="hero-cumul">
          <span class="lbl">Bénéfice cumulé de la semaine</span>
          <span class="val ${cumulCls}">${fmt(b.beneficeCumule)}</span>
        </div>
      </div>`;
  }

  // Carte DÉTAILS
  const autoCls = (b.autonomieKm != null && b.autonomieKm < 0) ? 'amount-neg' : '';
  html += `
    <div class="card">
      <div class="card-label">DÉTAILS</div>
      <div class="row">
        <span class="row-label">Argent généré</span>
        <span class="row-value">${fmt(b.argentGenereCumule)}</span>
      </div>
      <div class="row">
        <span class="row-label">Recette versée</span>
        <span class="row-value">${fmt(b.recetteCumulee)}</span>
      </div>
      <div class="row">
        <span class="row-label">Recharge Solde</span>
        <span class="row-value">${fmt(b.commissionCumulee)}</span>
      </div>
      <div class="row">
        <span class="row-label">Carburant Consommé (${fmtKm(b.totalKm)})</span>
        <span class="row-value">${fmt(b.carburantCumule)}</span>
      </div>
      <hr class="divider">
      <div class="row">
        <span class="row-label gras">Autonomie restante</span>
        <span class="row-value gras ${autoCls}">${b.autonomieKm == null ? '—' : fmtKm(b.autonomieKm)}</span>
      </div>
    </div>`;

  // Carte recette
  const pct = fmtPct(b.avancement * 100);
  const fillCls = b.recetteCouverte ? 'ok' : 'warn';
  html += `
    <div class="card">
      <div class="progress-header">
        <span>Recette hebdomadaire</span>
        <span>${pct}</span>
      </div>
      <div class="progress-wrap">
        <div class="progress-fill ${fillCls}" style="width: ${(b.avancement * 100).toFixed(1)}%"></div>
      </div>`;

  if (b.recetteCouverte) {
    html += `
      <div class="recette-status">
        <span>✓</span>
        <span>RECETTE COUVERTE ✓ — chaque franc généré est pour toi</span>
      </div>`;
  } else {
    html += `
      <div style="font-size: 14px;">Versé : ${fmt(b.recetteCumulee)} / ${fmt(p.recetteHebdo)}</div>
      <div style="font-size: 14px; color: var(--orange); font-weight: 600; margin-top: 2px;">
        Reste à verser : ${fmt(b.recetteRestante)}
      </div>`;
  }
  html += `</div>`;

  // Boutons
  html += `<button id="btn-nouveau" class="btn-primary">+ Nouveau pointage</button>`;
  html += `<button id="btn-nouvelle-semaine" class="btn-outline">↻ Nouvelle semaine</button>`;

  // Liste des pointages
  if (s.pointages.length > 0) {
    html += `<h2 style="font-size: 16px; margin: 20px 0 4px;">Pointages de la semaine</h2>`;
    html += `<div class="pointage-list">`;
    const reversed = s.pointages.map((pt, i) => ({ pt, i })).reverse();
    for (const { pt, i } of reversed) {
      const ts = new Date(pt.timestamp);
      const benefice = pt.cash - pt.recetteVersee
        - (pt.km * p.consommationF100km / 100) - pt.yango;
      const cls = benefice >= 0 ? 'amount-pos' : 'amount-neg';
      html += `
        <div class="pointage-item">
          <div class="pointage-main">
            <div class="pointage-head">
              <span class="pointage-date">${fmtDate(ts)}  ${fmtHeure(ts)}</span>
              <span class="pointage-benefice ${cls}">${fmt(benefice)}</span>
            </div>
            <div class="pointage-detail">Argent ${fmt(pt.cash)} • Recette ${fmt(pt.recetteVersee)} • Yango ${fmt(pt.yango)} • Km ${fmtKm(pt.km)}</div>
          </div>
          <button class="pointage-menu" data-index="${i}" aria-label="Actions">⋮</button>
        </div>`;
    }
    html += `</div>`;
  }

  el.innerHTML = html;

  // Wiring
  document.getElementById('btn-nouveau').onclick = () => {
    editingIndex = null;
    renderPointage();
    goTo('pointage');
  };

  document.getElementById('btn-nouvelle-semaine').onclick = async () => {
    const ok = await showModal(
      'Nouvelle semaine ?',
      'La semaine en cours sera archivée et un nouveau cycle démarre. Les paramètres sont conservés.',
      'Démarrer', false
    );
    if (!ok) return;
    if (state.semaine.pointages.length > 0) {
      state.historique.push({
        debut: state.semaine.debut,
        pointages: state.semaine.pointages,
      });
      while (state.historique.length > 52) state.historique.shift();
    }
    state.semaine = { debut: lundiDeLaSemaine(new Date()).toISOString(), pointages: [] };
    sauver();
    renderMain();
  };

  el.querySelectorAll('.pointage-menu').forEach(btn => {
    btn.onclick = async () => {
      const idx = parseInt(btn.dataset.index, 10);
      const pt = state.semaine.pointages[idx];
      const ts = new Date(pt.timestamp);
      await showActionSheet([
        {
          label: 'Modifier',
          action: () => {
            editingIndex = idx;
            renderPointage();
            goTo('pointage');
          },
        },
        {
          label: 'Supprimer',
          danger: true,
          action: async () => {
            const ok = await showModal(
              'Supprimer ce pointage ?',
              `Le pointage du ${fmtDate(ts)} à ${fmtHeure(ts)} (argent généré ${fmt(pt.cash)}) sera retiré.`,
              'Supprimer', true
            );
            if (!ok) return;
            state.semaine.pointages.splice(idx, 1);
            sauver();
            renderMain();
          },
        },
      ]);
    };
  });
}

function renderPointage() {
  const p = state.parametres;
  const editing = editingIndex != null;
  const existing = editing ? state.semaine.pointages[editingIndex] : null;
  const el = document.getElementById('pointage-content');

  document.getElementById('pointage-title').textContent =
    editing ? 'Modifier le pointage' : 'Nouveau pointage';

  el.innerHTML = `
    <div class="field">
      <label for="pt-cash">Argent généré (Fcfa)</label>
      <input id="pt-cash" type="text" inputmode="decimal" value="${existing ? numVersTexte(existing.cash) : ''}">
      <small>Ce que tu as comme montant total sur toi actuellement</small>
    </div>
    <div class="field">
      <label for="pt-km">Distance parcouru (km)</label>
      <input id="pt-km" type="text" inputmode="decimal" value="${existing ? numVersTexte(existing.km) : ''}">
      <small>Le total de kilometre que tu as roulé jusqu'a maintenant</small>
    </div>
    <div class="field">
      <label for="pt-carburantMis">Carburant mis (Fcfa)</label>
      <input id="pt-carburantMis" type="text" inputmode="decimal" value="${existing ? numVersTexte(existing.carburantMis) : ''}">
      <small>Carburant consommé a la station en debut</small>
    </div>
    <div class="field">
      <label for="pt-yango">Recharge solde yango (Fcfa)</label>
      <input id="pt-yango" type="text" inputmode="decimal" value="${existing ? numVersTexte(existing.yango) : ''}">
    </div>
    <div class="field">
      <label for="pt-recette">Recette a versée (Fcfa)</label>
      <input id="pt-recette" type="text" inputmode="decimal" value="${existing ? numVersTexte(existing.recetteVersee) : ''}">
      <small>Recette que tu vas versé dans l'argent que tu as</small>
    </div>
    <div id="pt-preview"></div>
    <button id="pt-save" class="btn-primary" style="margin-top: 20px;" disabled>
      ${editing ? 'Enregistrer les modifications' : 'Enregistrer le pointage'}
    </button>
    <p id="pt-error" class="error" hidden>Vérifie les valeurs : certaines sont invalides.</p>
  `;

  const cash = document.getElementById('pt-cash');
  const km = document.getElementById('pt-km');
  const carburantMis = document.getElementById('pt-carburantMis');
  const yango = document.getElementById('pt-yango');
  const recette = document.getElementById('pt-recette');
  const saveBtn = document.getElementById('pt-save');
  const errEl = document.getElementById('pt-error');
  const previewEl = document.getElementById('pt-preview');

  function buildPointage() {
    const c = lire(cash.value);
    const k = lire(km.value);
    const cm = lire(carburantMis.value);
    const y = lire(yango.value);
    const r = lire(recette.value);
    if (c == null || k == null || cm == null || y == null || r == null) return null;
    return {
      timestamp: existing ? existing.timestamp : new Date().toISOString(),
      cash: c,
      km: k,
      carburantMis: cm,
      yango: y,
      recetteVersee: r,
    };
  }

  function update() {
    const pt = buildPointage();
    if (pt == null) {
      saveBtn.disabled = true;
      errEl.hidden = false;
      previewEl.innerHTML = '';
      return;
    }
    saveBtn.disabled = false;
    errEl.hidden = true;

    let semaine;
    if (editing) {
      const copy = [...state.semaine.pointages];
      copy[editingIndex] = pt;
      semaine = { debut: state.semaine.debut, pointages: copy };
    } else {
      semaine = { debut: state.semaine.debut, pointages: [...state.semaine.pointages, pt] };
    }
    const b = calculerBilan(p, semaine);
    const beneficePointage = pt.cash - pt.recetteVersee
      - (pt.km * p.consommationF100km / 100) - pt.yango;
    const clsBen = beneficePointage >= 0 ? 'amount-pos' : 'amount-neg';
    const clsCumul = b.beneficeCumule >= 0 ? 'amount-pos' : 'amount-neg';
    const clsRec = b.recetteCouverte ? 'amount-pos' : 'amount-warn';
    const clsAuto = (b.autonomieKm != null && b.autonomieKm < 0) ? 'amount-neg' : '';

    previewEl.innerHTML = `
      <hr class="divider" style="margin: 12px 0;">
      <div style="font-weight: 700; margin-bottom: 8px;">
        ${editing ? 'Aperçu après modification' : 'Aperçu après enregistrement'}
      </div>
      <div class="row">
        <span class="row-label">Bénéfice a l'instant</span>
        <span class="row-value ${clsBen}">${fmt(beneficePointage)}</span>
      </div>
      <div class="row">
        <span class="row-label">Bénéfice cumulé de la semaine</span>
        <span class="row-value ${clsCumul}">${fmt(b.beneficeCumule)}</span>
      </div>
      <div class="row">
        <span class="row-label">Recette restante</span>
        <span class="row-value ${clsRec}">${b.recetteCouverte ? 'COUVERTE ✓' : fmt(b.recetteRestante)}</span>
      </div>
      <div class="row">
        <span class="row-label">Autonomie restante</span>
        <span class="row-value ${clsAuto}">${b.autonomieKm == null ? '—' : fmtKm(b.autonomieKm)}</span>
      </div>
    `;
  }

  cash.oninput = update;
  km.oninput = update;
  carburantMis.oninput = update;
  yango.oninput = update;
  recette.oninput = update;
  update();

  saveBtn.onclick = () => {
    const pt = buildPointage();
    if (pt == null) return;
    if (editing) {
      state.semaine.pointages[editingIndex] = pt;
    } else {
      state.semaine.pointages.push(pt);
    }
    sauver();
    renderMain();
    goTo('main');
  };
}

function renderParams() {
  const p = state.parametres;
  const el = document.getElementById('params-content');

  el.innerHTML = `
    <div class="field">
      <label for="par-recette">Recette hebdomadaire (Fcfa)</label>
      <input id="par-recette" type="text" inputmode="decimal" value="${Math.round(p.recetteHebdo)}">
      <small>Montant fixe à verser au propriétaire chaque semaine</small>
    </div>
    <div class="field">
      <label for="par-conso">Consommation du véhicule (Fcfa pour 100 km)</label>
      <input id="par-conso" type="text" inputmode="decimal" value="${Math.round(p.consommationF100km)}">
      <small>Coût du carburant pour 100 km (ex. 6 500)</small>
    </div>
    <hr class="divider" style="margin: 16px 0;">
    <div class="switch-row">
      <div class="info">
        <div class="title">Mode sombre automatique</div>
        <div class="sub">Activé de 18h00 à 6h00</div>
      </div>
      <div id="sw-auto" class="switch ${p.modeSombreAuto ? 'on' : ''}"></div>
    </div>
    <div class="switch-row" id="sw-manual-row" ${p.modeSombreAuto ? 'style="display:none"' : ''}>
      <div class="info">
        <div class="title">Mode sombre</div>
        <div class="sub">Bascule manuelle</div>
      </div>
      <div id="sw-manual" class="switch ${p.modeSombre ? 'on' : ''}"></div>
    </div>
    <button id="par-save" class="btn-primary" style="margin-top: 20px;">Enregistrer</button>
    <p
