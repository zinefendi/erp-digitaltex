'use strict';
/* Atelier DIGITAL-TEX — PWA tablette (lot 0.12.0). CDC §4.6.4 : liste des OF avec filtres,
   fiche OF avec les 3 parties (Commencer / Valider / Signaler un problème), fiche technique
   plein écran avec zoom, pointage par le responsable, aucun prix (le serveur n'en envoie pas),
   mode hors ligne court (dernière liste + fiches consultées, validations en file d'attente),
   déconnexion automatique après inactivité. */
const API = '';
const INACTIVITE_MS = 15 * 60 * 1000;
const $ = (s, r) => (r || document).querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const qteF = (v) => (+v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 3 });
const jour = (s) => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const heure = (s) => s ? new Date(s).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—';
const NOM_PARTIE = { 1: 'Coupe', 2: 'Marquage', 3: 'Assemblage et finition' };
const ETAT_PARTIE = { en_attente: ['En attente', 'b-att'], en_cours: ['En cours', 'b-crs'], validee: ['Validée', 'b-ok'], sans_objet: ['Sans objet', 'b-so'] };
const STATUT_OF = { cree: ['Créé', 'b-att'], en_cours: ['En cours', 'b-crs'], termine: ['Terminé', 'b-ok'], annule: ['Annulé', 'b-att'] };

let etat = { jeton: null, moi: null, onglet: 'of', filtre: 'en_cours', of: null, ouvriers: [], file: [] };

/* ---------------- stockage local (hors ligne) et file d'attente ---------------- */
const lis = (k, def) => { try { return JSON.parse(localStorage.getItem('atelier.' + k)) ?? def; } catch { return def; } };
const ecris = (k, v) => { try { localStorage.setItem('atelier.' + k, JSON.stringify(v)); } catch { /* stockage plein : on ignore */ } };

async function api(methode, chemin, corps, brut) {
  const r = await fetch(API + chemin, {
    method: methode,
    headers: { ...(etat.jeton ? { authorization: 'Bearer ' + etat.jeton } : {}), ...(brut ? {} : { 'content-type': 'application/json' }) },
    body: brut ? corps : (corps ? JSON.stringify(corps) : undefined),
  });
  if (r.status === 401 && etat.jeton) { deconnexion(true); throw new Error('session_expirée'); }
  const j = r.status === 204 ? {} : await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.message || 'Erreur ' + r.status); e.code = j.erreur; e.statut = r.status; throw e; }
  return j;
}

/* Appel avec reprise : si le réseau est coupé et que la route est une action de production
   (commencer / valider / pointage / signaler), la demande part en file et se rejouera. */
async function apiOuFile(methode, chemin, corps, libelle) {
  try { return await api(methode, chemin, corps); }
  catch (e) {
    if (e.statut === undefined || navigator.onLine === false) {
      etat.file.push({ methode, chemin, corps, libelle, le: new Date().toISOString() });
      ecris('file', etat.file); majBandeau();
      toast(libelle + ' mis en attente — sera envoyé au retour du réseau.');
      return { en_file: true };
    }
    throw e;
  }
}

async function viderFile() {
  if (!etat.file.length || !navigator.onLine || !etat.jeton) return;
  const restant = [];
  for (const a of etat.file) {
    try { await api(a.methode, a.chemin, a.corps); toast(a.libelle + ' envoyé.'); }
    catch (e) { if (e.statut === undefined) restant.push(a); else toast(a.libelle + ' refusé par le serveur : ' + e.message, true); }
  }
  etat.file = restant; ecris('file', etat.file); majBandeau();
}

function majBandeau() {
  const b = $('#horsligne');
  const n = etat.file.length;
  if (b) b.hidden = !navigator.onLine && !n ? true : !(!navigator.onLine || n);
  if (b) b.textContent = !navigator.onLine ? 'Hors ligne — données enregistrées, envoi au retour du réseau.' :
    n ? `${n} action(s) en attente d’envoi…` : '';
}
addEventListener('online', () => { viderFile(); });
addEventListener('offline', majBandeau);

function toast(msg, erreur) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false; t.style.background = erreur ? '#b91c1c' : '';
  clearTimeout(toast._h); toast._h = setTimeout(() => { t.hidden = true; }, 4000);
}

/* ---------------- inactivité : déconnexion automatique (CDC §4.6.4) ---------------- */
let minuteur;
const reveille = () => {
  clearTimeout(minuteur);
  if (etat.jeton) minuteur = setTimeout(() => deconnexion(true), INACTIVITE_MS);
};
['click', 'touchstart', 'keydown'].forEach((ev) => addEventListener(ev, reveille, { passive: true }));

async function deconnexion(auto) {
  try { if (etat.jeton) await api('POST', '/api/auth/deconnexion'); } catch { /* déjà fermée */ }
  clearTimeout(minuteur); minuteur = undefined;
  etat.jeton = null; etat.moi = null; etat.of = null;
  localStorage.removeItem('atelier.jeton');
  dessiner();
  if (auto) toast('Session fermée après inactivité.');
}

/* ---------------- dessin ---------------- */
function dessiner() {
  const a = $('#app');
  if (!etat.jeton) return login(a);
  a.innerHTML = `
    <div class="barre">
      <h1>Atelier</h1>
      <div class="qui">${esc(etat.moi?.nom_complet || '')}</div>
      <button class="quitter" id="quitter">Quitter</button>
    </div>
    <div class="horsligne" id="horsligne" hidden></div>
    <div class="onglets">
      <button id="ong-of" class="${etat.onglet === 'of' ? 'actif' : ''}">Ordres de fabrication</button>
      <button id="ong-pg" class="${etat.onglet === 'pointage' ? 'actif' : ''}">Pointage</button>
    </div>
    <div class="corps" id="corps"></div>`;
  $('#quitter').onclick = () => deconnexion(false);
  $('#ong-of').onclick = () => { etat.onglet = 'of'; dessiner(); };
  $('#ong-pg').onclick = () => { etat.onglet = 'pointage'; dessiner(); };
  majBandeau(); viderFile();
  (etat.onglet === 'of' ? listeOF : pointage)(a.querySelector('#corps'));
}

/* ---------------- connexion : identifiant + PIN (clavier numérique) ---------------- */
function login(a) {
  let saisi = '';
  const dess = () => { $('.pin-ecran').textContent = '•'.repeat(saisi.length) || ' '; };
  a.innerHTML = `<div class="login">
    <h1>Atelier DIGITAL-TEX</h1>
    <p class="sous">Identifiant puis code PIN</p>
    <div class="champ" style="width:240px"><input id="id" autocomplete="username" autocapitalize="none" placeholder="Identifiant" maxlength="60" style="text-align:center"></div>
    <div class="pin-ecran" style="margin-top:12px">&nbsp;</div>
    <div class="pav">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-n="${n}">${n}</button>`).join('')}
      <button class="eff" data-eff="1">✕</button><button data-n="0">0</button><button data-ok="1">OK</button></div>
    <div class="erreur" id="log-err" hidden></div>
    <p class="info" style="margin-top:20px">Aucun prix ni donnée sensible n’apparaît sur la tablette.</p>
  </div>`;
  const err = (m) => { const e = $('#log-err'); e.textContent = m; e.hidden = !m; };
  a.onclick = async (ev) => {
    const b = ev.target.closest('button');
    if (ev.target.id === 'id') return;
    if (!b) return;
    if (b.dataset.n) { if (saisi.length < 8) { saisi += b.dataset.n; dess(); } return; }
    if (b.dataset.eff) { saisi = saisi.slice(0, -1); dess(); return; }
    if (b.dataset.ok) {
      const identifiant = $('#id').value.trim();
      if (!identifiant) return err('Saisissez votre identifiant.');
      if (saisi.length !== 4) return err('Le PIN compte 4 chiffres.');
      b.disabled = true;
      try {
        const r = await fetch('/api/auth/connexion-pin', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ identifiant, pin: saisi }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { err(j.message || 'Connexion refusée.'); saisi = ''; dess(); b.disabled = false; return; }
        etat.jeton = r.jeton ?? j.jeton; etat.moi = j.utilisateur;
        ecris('jeton', etat.jeton); etat.file = lis('file', []); dessiner();
      } catch { err('Réseau indisponible — réessayez.'); b.disabled = false; }
    }
  };
}

/* ---------------- liste des OF (filtres CDC §4.6.4) ---------------- */
const FILTRES = { en_cours: 'En cours', cree: 'Créés', termine: 'Terminés', tous: 'Tous' };

async function listeOF(z) {
  const cache = lis('of.liste', []);
  if (!navigator.onLine && cache.length) return dessinerListeOF(z, cache, true);
  const L = await api('GET', '/api/prod/of');
  ecris('of.liste', L); dessinerListeOF(z, L, false);
}

function dessinerListeOF(z, L, cache) {
  const q = lis('of.q', '');
  z.innerHTML = `${cache ? '<div class="horsligne" style="margin-bottom:8px">Liste enregistrée sur la tablette (hors ligne).</div>' : ''}
    <div class="filtres">${Object.entries(FILTRES).map(([k, v]) => `<button data-f="${k}" class="${etat.filtre === k ? 'actif' : ''}">${v}</button>`).join('')}</div>
    <div class="champ"><input id="cher" placeholder="Rechercher : n°, client, produit…" value="${esc(q)}"></div>
    <div id="liste"></div>`;
  const dess = () => {
    const c = $('#cher').value.trim().toLowerCase();
    const l = L.filter((o) => (etat.filtre === 'tous' ? true : etat.filtre === 'en_cours' ? o.statut === 'en_cours' || o.statut === 'cree' : o.statut === etat.filtre)
      && (!c || JSON.stringify([o.numero, o.client_nom, o.reference, o.commande_numero]).toLowerCase().includes(c)));
    $('#liste').innerHTML = l.map((o) => `<div class="carte cliq" data-id="${o.id}">
      <div class="numero">${esc(o.numero)} <span class="badge ${(STATUT_OF[o.statut] || ['', 'b-att'])[1]}">${(STATUT_OF[o.statut] || [o.statut])[0]}</span></div>
      <div class="ligne2">${esc(o.reference)} · ${esc(o.client_nom || '—')} · ${qteF(o.pieces)} pièce(s)</div>
      <div class="ligne2">Livraison promise : ${jour(o.date_livraison)} · lancé le ${jour(o.date_lancement)}</div>
      <div class="parts">${(o.parties || []).map((p) => { const e = ETAT_PARTIE[p.etat] || [p.etat, '']; return `<span class="puce ${p.etat}">${NOM_PARTIE[p.partie].split(' ')[0]} ${(e[0] === 'En attente' ? '·' : e[0] === 'En cours' ? '→' : e[0] === 'Validée' ? '✓' : '—')}</span>`; }).join('')}</div>
    </div>`).join('') || '<div class="carte">Aucun OF pour ce filtre.</div>';
  };
  dess();
  $('#cher').oninput = () => { ecris('of.q', $('#cher').value); dess(); };
  z.querySelectorAll('.filtres button').forEach((b) => b.onclick = () => { etat.filtre = b.dataset.f; dessinerListeOF(z, L, cache); });
  $('#liste').onclick = (ev) => { const c = ev.target.closest('[data-id]'); if (c) ficheOF(+c.dataset.id); };
}

/* ---------------- fiche OF : 3 parties + commencer / valider / signaler ---------------- */
async function ficheOF(id) {
  let of;
  try { of = await api('GET', `/api/prod/of/${id}`); ecris('of.' + id, of); }
  catch { of = lis('of.' + id, null); if (!of) return toast('Fiche non disponible hors ligne.', true); }
  etat.of = of;
  try { etat.ouvriers = await api('GET', '/api/prod/ouvriers'); } catch { etat.ouvriers = lis('ouvriers', []); }
  ecris('ouvriers', etat.ouvriers);
  dessinerFiche();
}

function dessinerFiche() {
  const of = etat.of;
  const prochaine = [1, 2, 3].find((n) => ['en_attente', 'en_cours'].includes(of.parties.find((p) => p.partie === n).etat)
    && of.parties.filter((p) => p.partie < n).every((p) => ['validee', 'sans_objet'].includes(p.etat)));
  const a = $('#app');
  a.innerHTML = `
    <div class="barre">
      <button class="retour" id="ret">‹ Retour</button>
      <h1 style="font-size:17px">${esc(of.numero)}</h1>
      <button class="quitter" id="quitter">Quitter</button>
    </div>
    <div class="horsligne" id="horsligne" hidden></div>
    <div class="corps">
      <div class="entete-of">
        <div class="numero">${esc(of.numero)} <span class="badge ${(STATUT_OF[of.statut] || ['', 'b-att'])[1]}">${(STATUT_OF[of.statut] || [of.statut])[0]}</span>${of.fiche_modifiee ? ' <span class="badge b-crs">fiche modifiée</span>' : ''}</div>
        <div class="grille">
          <div><span class="info">Produit</span><br><b>${esc(of.reference)}</b></div>
          <div><span class="info">Client</span><br><b>${esc(of.client_nom || '—')}</b></div>
          <div><span class="info">Livraison promise</span><br><b>${jour(of.date_livraison)}</b></div>
          <div><span class="info">Pièces</span><br><b>${qteF((of.tailles_couleurs || []).reduce((s, t) => s + t.qte, 0))}</b></div>
        </div>
        <table class="table-qte"><thead><tr><th>Taille</th><th>Couleur</th><th>Quantité</th></tr></thead><tbody>
          ${(of.tailles_couleurs || []).map((t) => `<tr><td>${esc(t.taille || '—')}</td><td>${esc(t.couleur || '—')}</td><td><b>${qteF(t.qte)}</b></td></tr>`).join('')}</tbody></table>
        <button class="gros second" id="fiche">Fiche technique (plein écran)</button>
      </div>
      ${[1, 2, 3].map((n) => {
        const p = of.parties.find((x) => x.partie === n);
        const e = ETAT_PARTIE[p.etat] || [p.etat, 'b-att'];
        const ouv = of.affectations.filter((x) => x.partie === n && !x.annule).map((x) => x.ouvrier);
        const active = prochaine === n && of.statut !== 'annule' && of.statut !== 'termine';
        return `<div class="partie">
          <div class="tete"><b style="font-size:17px">${NOM_PARTIE[n]}</b> <span class="badge ${e[1]}">${e[0]}</span></div>
          <div class="ouvriers">${ouv.length ? 'Affecté(s) : ' + esc(ouv.join(', ')) : 'Aucun ouvrier affecté (affectation depuis l’écran web Affectation).'}</div>
          <div class="info">Validé à ce jour : ${qteF((p.qtes_validees || []).reduce((s, q) => s + q.qte, 0))} / ${qteF((of.tailles_couleurs || []).reduce((s, t) => s + t.qte, 0))}</div>
          ${active && p.etat === 'en_attente' ? '<button class="gros" data-commencer="' + n + '">Commencer</button>' : ''}
          ${active && p.etat === 'en_cours' ? '<button class="gros" data-valider="' + n + '">Valider</button>' : ''}
        </div>`;
      }).join('')}
      <button class="gros alerte" id="signaler">⚠ Signaler un problème</button>
      <h3 style="margin:16px 0 6px">Dernières validations</h3>
      ${of.validations.filter((v) => !v.annule).slice(-5).reverse().map((v) => `<div class="carte"><b>${NOM_PARTIE[v.partie]}</b> — ${jour(v.date)} ${heure(v.horodatage)}
        <div class="ligne2">${(v.qtes || []).map((q) => `${esc(q.taille)} ${esc(q.couleur)} : ${qteF(q.qte)}`).join(' · ')}${v.photo_nom ? ' · 📷 photo' : ''}${v.remarques ? ' · ' + esc(v.remarques) : ''}</div></div>`).join('') || '<div class="carte info">Aucune validation encore.</div>'}
    </div>`;
  $('#ret').onclick = () => { etat.of = null; dessiner(); };
  $('#quitter').onclick = () => deconnexion(false);
  $('#fiche').onclick = () => ficheTech();
  $('#signaler').onclick = () => formSignaler();
  a.querySelectorAll('[data-commencer]').forEach((b) => b.onclick = async () => {
    const n = +b.dataset.commencer;
    b.disabled = true;
    try { await apiOuFile('POST', `/api/prod/of/${of.id}/partie/${n}/commencer`, undefined, 'Début de ' + NOM_PARTIE[n]); if (!etat.file.length) toast(NOM_PARTIE[n] + ' démarrée.'); await recharger(of.id); }
    catch (e) { b.disabled = false; toast(e.message, true); }
  });
  a.querySelectorAll('[data-valider]').forEach((b) => b.onclick = () => formValider(+b.dataset.valider));
}

async function recharger(id) {
  try { etat.of = await api('GET', `/api/prod/of/${id}`); ecris('of.' + id, etat.of); } catch { /* hors ligne : on garde */ }
  dessinerFiche();
}

/* ---------------- validation d'une partie (gros champs, photo) ---------------- */
function formValider(n) {
  const of = etat.of;
  const p = of.parties.find((x) => x.partie === n);
  const cumul = new Map((p.qtes_validees || []).map((t) => [JSON.stringify([t.taille, t.couleur]), +t.qte || 0]));
  const restes = (of.tailles_couleurs || []).map((t) => ({ ...t, reste: Math.round(((t.qte - (cumul.get(JSON.stringify([t.taille, t.couleur])) || 0)) * 1000)) / 1000 })).filter((t) => t.reste > 0.0005);
  if (!restes.length) return toast('Rien à valider sur cette partie.', true);
  let photo = null;
  const a = $('#app');
  a.innerHTML = `
    <div class="barre"><button class="retour" id="ret">‹ Retour</button><h1 style="font-size:17px">Valider — ${NOM_PARTIE[n]}</h1><button class="quitter" id="quitter">Quitter</button></div>
    <div class="corps">
      <div class="info" style="margin-bottom:8px">${esc(of.numero)} · ${esc(of.reference)}${n === 3 ? ' · les pièces validées entrent en stock produits finis.' : ''}</div>
      <table class="table-qte"><thead><tr><th>Taille</th><th>Couleur</th><th>Reste</th><th>Validé maintenant</th></tr></thead><tbody>
        ${restes.map((t, i) => `<tr><td><b>${esc(t.taille || '—')}</b></td><td>${esc(t.couleur || '—')}</td><td>${qteF(t.reste)}</td>
          <td><input type="number" inputmode="numeric" step="1" min="0" max="${t.reste}" value="${t.reste}" data-q="${i}"></td></tr>`).join('')}</tbody></table>
      <div class="champ"><label for="v-rem">Remarques</label><textarea id="v-rem" maxlength="500" placeholder="Qualité, rebuts, équipe…"></textarea></div>
      <div class="champ"><label>Photo (facultative)</label><input type="file" accept="image/*" capture="environment" id="v-photo" style="font-size:16px"></div>
      <button class="gros" id="v-ok">Valider la partie</button>
      <div class="erreur" id="v-err" hidden></div>
    </div>`;
  $('#ret').onclick = dessinerFiche; $('#quitter').onclick = () => deconnexion(false);
  $('#v-photo').onchange = () => { photo = $('#v-photo').files[0] || null; };
  $('#v-ok').onclick = async () => {
    const err = $('#v-err');
    const qtes = restes.map((t, i) => ({ taille: t.taille, couleur: t.couleur, qte: +$(`[data-q="${i}"]`).value || 0 })).filter((t) => t.qte > 0);
    if (!qtes.length) { err.textContent = 'Saisissez au moins une quantité.'; err.hidden = false; return; }
    const corps = { qtes };
    if ($('#v-rem').value.trim()) corps.remarques = $('#v-rem').value.trim();
    $('#v-ok').disabled = true;
    try {
      if (photo) {
        const r = await fetch(`/api/fichiers?nature=photo_atelier&cible_type=of&cible_id=${of.id}`, {
          method: 'POST', headers: { authorization: 'Bearer ' + etat.jeton }, body: photo,
        });
        if (!r.ok) throw new Error('Photo refusée : ' + ((await r.json().catch(() => ({}))).message || r.status));
        corps.photo_id = (await r.json()).id;
      }
      const r = await apiOuFile('POST', `/api/prod/of/${of.id}/partie/${n}/valider`, corps, 'Validation de ' + NOM_PARTIE[n]);
      if (!r || !r.en_file) toast(r && r.statut === 'termine' ? 'OF terminé — produits finis entrés en stock.' : NOM_PARTIE[n] + ' validée.');
      etat.of = null; dessiner();
    } catch (e) { err.textContent = e.message; err.hidden = false; $('#v-ok').disabled = false; }
  };
}

/* ---------------- signaler un problème ---------------- */
function formSignaler() {
  const of = etat.of;
  const a = $('#app');
  a.innerHTML = `
    <div class="barre"><button class="retour" id="ret">‹ Retour</button><h1 style="font-size:17px">Signaler un problème</h1><button class="quitter" id="quitter">Quitter</button></div>
    <div class="corps">
      <div class="info" style="margin-bottom:8px">${esc(of.numero)} · ${esc(of.reference)}</div>
      <div class="champ"><label for="sg-p">Partie concernée</label><select id="sg-p"><option value="">— générale —</option>${[1, 2, 3].map((n) => `<option value="${n}">${NOM_PARTIE[n]}</option>`).join('')}</select></div>
      <div class="champ"><label for="sg-t">Qu’est-ce qui bloque ? *</label><textarea id="sg-t" maxlength="500" placeholder="Tissu manquant, machine en panne, erreur de couleur…"></textarea></div>
      <button class="gros" id="sg-ok">Envoyer le signalement</button>
      <div class="erreur" id="sg-err" hidden></div>
    </div>`;
  $('#ret').onclick = dessinerFiche; $('#quitter').onclick = () => deconnexion(false);
  $('#sg-ok').onclick = async () => {
    const texte = $('#sg-t').value.trim();
    if (texte.length < 3) { const e = $('#sg-err'); e.textContent = 'Décrivez le problème (3 caractères au moins).'; e.hidden = false; return; }
    $('#sg-ok').disabled = true;
    try {
      const corps = { texte }; if ($('#sg-p').value) corps.partie = +$('#sg-p').value;
      await apiOuFile('POST', `/api/prod/of/${of.id}/signalements`, corps, 'Signalement');
      if (!etat.file.length) toast('Signalement envoyé.');
      dessinerFiche();
    } catch (e) { $('#sg-err').textContent = e.message; $('#sg-err').hidden = false; $('#sg-ok').disabled = false; }
  };
}

/* ---------------- fiche technique plein écran avec zoom ---------------- */
function ficheTech() {
  const f = etat.of.fiche || {};
  const a = $('#app');
  a.innerHTML = `
    <div class="barre"><button class="retour" id="ret">‹ Retour</button><h1 style="font-size:17px">Fiche technique — ${esc(etat.of.numero)}</h1><button class="quitter" id="quitter">Quitter</button></div>
    <div class="corps" style="overflow:auto">
      ${f.illustration ? `<img src="${esc(f.illustration)}" alt="Illustration du modèle" style="width:100%;border-radius:12px;touch-action:pinch-zoom">` : '<div class="carte info">Pas d’illustration sur cette fiche.</div>'}
      <div class="carte"><b>Marquages :</b> ${(f.marquages || []).length ? f.marquages.map((x) => esc(x.libelle || x.type)).join(', ') : 'aucun'}</div>
      <div class="carte"><b>Matières :</b> ${(f.bom || []).length ? f.bom.map((x) => `${esc(x.designation)} × ${qteF(x.qte)}`).join(' · ') : '—'}</div>
      <div class="carte"><b>Gamme :</b> ${(f.gamme || []).length ? f.gamme.map((x) => `${esc(x.operation)} (${qteF(x.temps_min)} min)`).join(' · ') : '—'}</div>
    </div>`;
  $('#ret').onclick = dessinerFiche; $('#quitter').onclick = () => deconnexion(false);
}

/* ---------------- pointage (le responsable pointe pour tous) ---------------- */
async function pointage(z) {
  const Aujourd = new Date().toISOString().slice(0, 10);
  let P = [], actifs = [];
  try {
    [P, actifs] = await Promise.all([api('GET', `/api/prod/pointages?du=${Aujourd}&au=${Aujourd}`), api('GET', '/api/prod/ouvriers')]);
    ecris('pointages.' + Aujourd, P); ecris('ouvriers', actifs);
  } catch { P = lis('pointages.' + Aujourd, []); actifs = lis('ouvriers', []); }
  const duree = (p) => p.fin ? Math.round((new Date(p.fin) - new Date(p.debut)) / 60000) + ' min' : 'en cours';
  const enCours = P.filter((p) => !p.annule && !p.fin);
  z.innerHTML = `<div class="info" style="margin-bottom:8px">${jour(Aujourd)} — pointage du début et de la fin pour chaque ouvrier. Temps prévu : gamme du produit.</div>
    ${actifs.filter((o) => o.actif).map((o) => {
      const ouverts = enCours.filter((p) => p.ouvrier_id === o.id);
      return `<div class="ouv-ligne">
        <div class="nom">${esc(o.nom)}</div>
        ${ouverts.map((p) => `<div class="petit">→ ${esc(p.numero)} · ${NOM_PARTIE[p.partie]} — démarré à ${heure(p.debut)}</div>
          <button class="btn-p finir" data-fin="${p.id}">Terminer (${NOM_PARTIE[p.partie]})</button>`).join('')}
        <button class="btn-p demarrer" data-deb="${o.id}">Démarrer une tâche</button>
      </div>`;
    }).join('') || '<div class="carte info">Aucun ouvrier actif — créez-les depuis l’écran web Affectation.</div>'}
    <h3 style="margin:16px 0 6px">Pointages du jour</h3>
    ${P.filter((p) => !p.annule).map((p) => `<div class="carte"><b>${esc(p.ouvrier || 'ouvrier #' + p.ouvrier_id)}</b> · ${esc(p.numero)} · ${NOM_PARTIE[p.partie]} — ${heure(p.debut)} → ${p.fin ? heure(p.fin) : 'en cours'} (${duree(p)})</div>`).join('') || '<div class="carte info">Aucun pointage aujourd’hui.</div>'}`;
  z.querySelectorAll('[data-deb]').forEach((b) => b.onclick = () => formDebutTache(+b.dataset.deb));
  z.querySelectorAll('[data-fin]').forEach((b) => b.onclick = async () => {
    b.disabled = true;
    try {
      const p = P.find((x) => x.id === +b.dataset.fin);
      await apiOuFile('PATCH', `/api/prod/pointages/${p.id}`, { version: p.version, fin: new Date().toISOString() }, 'Fin de tâche');
      if (!etat.file.length) toast('Tâche terminée.'); pointage(z);
    } catch (e) { b.disabled = false; toast(e.message, true); }
  });
}

async function formDebutTache(ouvrierId) {
  const ouv = etat.ouvriers.find((o) => o.id === ouvrierId) || { nom: 'ouvrier' };
  let OF;
  try { OF = await api('GET', '/api/prod/of?statut=en_cours'); } catch { OF = lis('of.liste', []).filter((o) => o.statut === 'en_cours'); }
  if (!OF.length) return toast('Aucun OF en cours.', true);
  const a = $('#app');
  a.innerHTML = `
    <div class="barre"><button class="retour" id="ret">‹ Retour</button><h1 style="font-size:17px">Démarrer — ${esc(ouv.nom)}</h1><button class="quitter" id="quitter">Quitter</button></div>
    <div class="corps">
      <div class="champ"><label for="d-of">Ordre de fabrication *</label><select id="d-of">${OF.map((o) => `<option value="${o.id}">${esc(o.numero)} — ${esc(o.reference)} · ${esc(o.client_nom || '')}</option>`).join('')}</select></div>
      <div class="champ"><label for="d-p">Partie *</label><select id="d-p">${[1, 2, 3].map((n) => `<option value="${n}">${NOM_PARTIE[n]}</option>`).join('')}</select></div>
      <button class="gros" id="d-ok">Démarrer le pointage</button>
      <div class="erreur" id="d-err" hidden></div>
    </div>`;
  $('#ret').onclick = () => dessiner(); $('#quitter').onclick = () => deconnexion(false);
  $('#d-ok').onclick = async () => {
    $('#d-ok').disabled = true;
    try {
      await apiOuFile('POST', '/api/prod/pointages', { of_id: +$('#d-of').value, partie: +$('#d-p').value, ouvrier_id: ouvrierId, debut: new Date().toISOString(), source: 'tablette' }, 'Pointage');
      if (!etat.file.length) toast('Pointage démarré.');
      dessiner();
    } catch (e) { $('#d-err').textContent = e.message; $('#d-err').hidden = false; $('#d-ok').disabled = false; }
  };
}

/* ---------------- démarrage ---------------- */
(async function demarrer() {
  etat.jeton = lis('jeton', null); etat.file = lis('file', []);
  if (etat.jeton) {
    try { etat.moi = await api('GET', '/api/auth/moi'); } catch { etat.jeton = null; localStorage.removeItem('atelier.jeton'); }
  }
  dessiner(); majBandeau();
  setInterval(viderFile, 30000);
})();