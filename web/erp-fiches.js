'use strict';
/* ERP DIGITAL-TEX — lot 0.15.0 : fiches techniques versionnées (Infographie), commandes à compléter (Commercial),
   étiquettes de composition / d'emballage (Production), composition des tissus (Stock MP), paramètres d'étiquetage,
   traçabilité (QR → /t/CODE) et bouton « Imprimer » à côté de chaque « PDF ».
   Chargé après erp-coquille.js et erp-production.js (helpers : api, toast, peut, voit, fenetre, grandeFenetre, esc, $,
   jour, entete, rechercheHtml, route, ECRANS, MODS). Aucun prix n'est affiché sans le droit « prix » : le serveur ne
   l'envoie pas. */

const STATUT_V = { brouillon: ['Brouillon', 'fut'], proposee: ['Proposée', 'fut'], validee: ['Validée', 'vig'], en_production: ['En production', 'vig'], archivee: ['Archivée', 'anc'] };
const badgeFiche = (s) => { const e = STATUT_V[s] || [s || '—', 'anc']; return `<span class="badge ${e[1]}">${e[0]}</span>`; };
const SEXE_L = { B: 'Bébé', E: 'Enfant (unisexe)', F: 'Femme', H: 'Homme', U: 'Unisexe' };

/* ================================================================ Imprimer (à côté de chaque PDF) */
// Même document que le PDF, envoyé directement à la boîte d'impression (iframe masquée ; repli : nouvel onglet).
window.Imprimer = {
  async pdf(source) {
    let url = source, temp = false;
    if (source instanceof Uint8Array || source instanceof ArrayBuffer) { url = URL.createObjectURL(new Blob([source], { type: 'application/pdf' })); temp = true; }
    else if (source instanceof Blob) { url = URL.createObjectURL(source); temp = true; }
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
    f.src = url; document.body.appendChild(f);
    const nettoyer = () => setTimeout(() => { f.remove(); if (temp) URL.revokeObjectURL(url); }, 60000);
    f.onload = () => {
      try { f.contentWindow.focus(); f.contentWindow.print(); nettoyer(); }
      catch (_) { f.remove(); const w = window.open(url, '_blank'); if (!w) toast('Autorisez les fenêtres pour imprimer.', true); else setTimeout(() => { try { w.print(); } catch (__) { /* l'utilisateur imprime depuis l'onglet */ } }, 800); }
    };
  },
  // tableau HTML de l'écran → page imprimable (en-tête DIGITAL-TEX, date) ; les données sont celles déjà reçues
  ecran(titre, el) {
    const w = window.open('', '_blank'); if (!w) return toast('Autorisez les fenêtres pour imprimer.', true);
    const t = el.cloneNode(true); t.querySelectorAll('button, .actions, input[type=checkbox]').forEach((b) => b.remove());
    w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(titre)}</title><style>
      body{font:12px/1.4 system-ui,sans-serif;margin:18mm 12mm;color:#1d2a38}h1{font-size:18px;margin:0 0 2px}p{margin:0 0 12px;color:#6a6258}
      table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f1e8df;font-size:11px}
      .n{text-align:right}.badge{font-weight:700}img{max-width:60px;max-height:60px}@page{size:A4;margin:12mm}</style></head><body>
      <h1>${esc(titre)}</h1><p>DIGITAL-TEX · édité le ${new Date().toLocaleString('fr-FR')}</p>${t.outerHTML}<script>onload=()=>{print()}<\/script></body></html>`);
    w.document.close();
  },
};
// Bouton « Imprimer » ajouté automatiquement à côté de tout bouton « PDF » (écrans natifs) ; et « PDF / Imprimer »
// sur chaque écran de liste qui n'en a pas (Production, Stocks, Compta…).
const boutonImprimerListe = () => '<button class="btn ghost sm" data-imp-ecran title="Imprimer cette liste">Imprimer</button>';
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-imp-ecran]'); if (!b) return;
  const m = $('#contenu'); const titre = m.querySelector('.entete h2')?.textContent || 'ERP DIGITAL-TEX';
  const zone = m.querySelector('#liste table, .panneau table') || m.querySelector('.panneau') || m;
  window.Imprimer.ecran(titre, zone);
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-imp-url]'); if (!b) return;
  e.preventDefault(); window.Imprimer.pdf(b.dataset.impUrl);
});
// observe le contenu : place « Imprimer » à côté des boutons PDF / Exporter, et sur les listes sans export
new MutationObserver(() => {
  const m = document.getElementById('contenu'); if (!m || m.hidden) return;
  for (const b of document.querySelectorAll('#contenu button[data-pdf]:not([data-imp-fait]), #contenu a[data-pdf-url]:not([data-imp-fait]), #fen-form a[data-pdf-url]:not([data-imp-fait])')) {
    b.dataset.impFait = '1';
    const i = document.createElement('button'); i.type = 'button'; i.className = b.className.replace('cta', '') || 'btn ghost sm'; i.textContent = 'Imprimer';
    if (b.dataset.pdfUrl) i.dataset.impUrl = b.dataset.pdfUrl;
    else i.onclick = (ev) => { ev.stopPropagation(); window.__imprimerSuivant = true; b.click(); };
    b.after(i);
  }
  const ent = m.querySelector('.entete'); const tbl = m.querySelector('#liste table, .panneau table');
  if (ent && tbl && !ent.querySelector('[data-imp-ecran]')) {
    const zone = ent.querySelector('.row-f') || ent;
    zone.insertAdjacentHTML('beforeend', boutonImprimerListe());
  }
}).observe(document.body, { childList: true, subtree: true });
// les fonctions d'ouverture de PDF existantes (factures, devis, avoirs) impriment au lieu d'ouvrir si « Imprimer » a été cliqué
const _open = window.open.bind(window);
window.open = function (url, ...r) {
  if (window.__imprimerSuivant && typeof url === 'string' && url.startsWith('blob:')) { window.__imprimerSuivant = false; window.Imprimer.pdf(url); return { closed: false, close() {}, location: {} }; }
  window.__imprimerSuivant = false; return _open(url, ...r);
};
const boutonsPdf = (url, nom = 'PDF') => `<a class="btn ghost sm" href="${esc(url)}" target="_blank" rel="noopener" data-pdf-url="${esc(url)}">${esc(nom)}</a>`;

/* ================================================================ Bibliothèque des fiches (Infographie) */
ECRANS.bibliotheque = async (m) => {
  const [L, clients] = await Promise.all([api('GET', '/api/fiches'), api('GET', '/api/fiches/clients')]);
  const cree = peut('infographie.fiches', 'creer');
  m.innerHTML = entete('Bibliothèque des fiches', 'Une fiche par produit fini : la <b>référence</b> (ex. P00126H) est le nom du produit et du fichier patronage <span class="mono">.MDL</span>. Les versions ne s’écrasent jamais : une version proposée ou validée est figée, la modifier crée la version suivante.',
    `<div class="row-f">${rechercheHtml('Référence, désignation, client…')}
      <div class="champ" style="margin:0"><select id="f-client" aria-label="Client"><option value="">Tous les clients</option>${clients.map((c) => `<option value="${c.basique ? 'basique' : esc(c.id)}">${esc(c.nom)}</option>`).join('')}</select></div>
      <div class="champ" style="margin:0"><select id="f-statut" aria-label="Statut"><option value="">Tous statuts</option>${Object.entries(STATUT_V).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select></div>
      ${peut('infographie.fiches') ? '<button class="btn ghost" data-b="pdf">Ouvrir un PDF…</button>' : ''}
      ${cree ? '<button class="btn cta" data-b="nouvelle">+ Nouvelle fiche</button>' : ''}</div>`) +
    `<div class="grille-fiches" id="liste"></div>`;
  const dess = () => {
    const q = $('#recherche').value.trim().toLowerCase(), cl = $('#f-client').value, st = $('#f-statut').value;
    const l = L.filter((f) => (!cl || (cl === 'basique' ? !f.client_id : f.client_id === cl)) && (!st || f.statut === st)
      && (!q || JSON.stringify([f.reference, f.designation, f.client_libelle, f.article]).toLowerCase().includes(q)));
    $('#liste').innerHTML = l.length ? l.map((f) => `<button class="carte-fiche" data-id="${f.id}">
        <span class="vign">${f.vignette ? `<img src="${esc(f.vignette)}" alt="">` : '<span class="mute small">sans vignette</span>'}</span>
        <b class="mono">${esc(f.reference)}</b><span>${esc(f.designation || f.article || '')}</span>
        <span class="small mute">${esc(f.client_libelle)} · ${esc(SEXE_L[f.sexe] || '')}</span>
        <span class="small">v${f.numero || f.version_courante} ${badgeFiche(f.statut)}${f.source_fiche_id ? ' <span class="badge anc">copie</span>' : ''}</span></button>`).join('')
      : `<div class="vide" style="grid-column:1/-1">${L.length ? 'Aucune fiche pour ce filtre.' : 'Aucune fiche technique. Créez la première avec « + Nouvelle fiche ».'}</div>`;
  };
  $('#recherche').oninput = dess; $('#f-client').onchange = dess; $('#f-statut').onchange = dess; dess();
  m.onclick = async (e) => {
    const b = e.target.closest('[data-b]');
    if (b?.dataset.b === 'nouvelle') return nouvelleFiche(clients);
    if (b?.dataset.b === 'pdf') return ouvrirPdfFiche();
    const c = e.target.closest('.carte-fiche'); if (c) ouvrirFiche(+c.dataset.id);
  };
};

async function nouvelleFiche(clients) {
  const codes = await api('GET', '/api/produits/codes-article').catch(() => []);
  const produits = await api('GET', '/api/produits').catch(() => []);
  grandeFenetre(`<h3>Nouvelle fiche technique</h3><div class="msg err" hidden role="alert"></div>
    <div class="champ"><label><input type="radio" name="mode" value="nouveau" checked> Nouveau produit (référence attribuée par le serveur)</label>
      <label><input type="radio" name="mode" value="existant"> Produit fini existant</label></div>
    <div id="nf-nouveau" class="grille2">
      <div class="champ"><label for="nf-code">Code article *</label><select id="nf-code" name="code">${codes.filter((c) => c.actif).map((c) => `<option value="${esc(c.code)}">${esc(c.code)} — ${esc(c.libelle)}</option>`).join('')}</select></div>
      <div class="champ"><label for="nf-sexe">Sexe *</label><select id="nf-sexe" name="sexe">${Object.entries(SEXE_L).map(([k, v]) => `<option value="${k}" ${k === 'H' ? 'selected' : ''}>${k} — ${v}</option>`).join('')}</select></div>
      <div class="champ" style="grid-column:1/-1"><label for="nf-t">Taillant (tailles séparées par des espaces)</label><input id="nf-t" name="taillant" placeholder="S M L XL XXL"></div>
    </div>
    <div id="nf-existant" class="champ" hidden><label for="nf-p">Produit fini</label><select id="nf-p" name="produit">${produits.map((p) => `<option value="${p.id}">${esc(p.reference)} — ${esc(p.client_nom || 'Basique')}</option>`).join('')}</select></div>
    <div class="grille2">
      <div class="champ"><label for="nf-c">Client</label><select id="nf-c" name="client">${clients.map((c) => `<option value="${esc(c.id)}">${esc(c.nom)}</option>`).join('')}</select>
        <span class="aide">« Basique » = produit sans client (toujours en premier). Un produit avec client est spécifique.</span></div>
      <div class="champ"><label for="nf-d">Désignation</label><input id="nf-d" name="designation" maxlength="160" placeholder="Polo piqué manches courtes"></div>
    </div>
    <p class="mute small">La composition 3D se fait ensuite dans le Studio 3D (bouton « Ouvrir en 3D »), puis « Proposer au commercial ».</p>
    <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Annuler</button><button class="btn" value="ok">Créer la fiche</button></div>`, async (f) => {
    const existant = f.querySelector('[name=mode]:checked').value === 'existant';
    const body = existant ? { produit_id: +f.produit.value, designation: f.designation.value.trim() }
      : { code_article: f.code.value, sexe: f.sexe.value, taillant: f.taillant.value.split(/[\s,;]+/).filter(Boolean), client_id: f.client.value || undefined, designation: f.designation.value.trim() };
    const r = await api('POST', '/api/fiches', body);
    toast(`Fiche ${r.reference} créée (v1 brouillon).`); route(); setTimeout(() => ouvrirFiche(r.id), 200); return true;
  });
  const f = $('#fen-form');
  f.querySelectorAll('[name=mode]').forEach((r) => r.onchange = () => { const ex = f.querySelector('[name=mode]:checked').value === 'existant'; $('#nf-nouveau').hidden = ex; $('#nf-existant').hidden = !ex; });
}

async function ouvrirFiche(id) {
  const f = await api('GET', '/api/fiches/' + id);
  const clients = await api('GET', '/api/fiches/clients');
  const mod = peut('infographie.fiches', 'modifier'), prop = peut('infographie.fiches', 'valider'), dup = peut('infographie.fiches', 'creer');
  const br = f.versions.find((v) => v.statut === 'brouillon');
  grandeFenetre(`<h3>Fiche ${esc(f.reference)} · ${esc(f.client_libelle)}</h3><div class="msg err" hidden role="alert"></div>
    ${f.verrou ? `<div class="msg info">Modifiée par <b>${esc(f.verrou.par)}</b>${f.verrou.poste ? ' (' + esc(f.verrou.poste) + ')' : ''} : lecture seule jusqu’à ${new Date(f.verrou.jusqu).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.</div>` : ''}
    <div class="grille2"><div><p><b>Produit / patronage :</b> <span class="mono">${esc(f.ref_produit)}</span> · <span class="mono">${esc(f.ref_produit)}.MDL</span></p>
      <p><b>Désignation :</b> ${esc(f.designation || f.article || '—')} · <b>Sexe :</b> ${esc(SEXE_L[f.sexe] || f.sexe)} · <b>Tailles :</b> ${esc((f.taillant || []).join(' ') || '—')}</p>
      <p><b>État :</b> ${f.etat === 'specifique' ? 'Spécifique' : 'Basique'}${f.source_fiche_id ? ` · copie de la fiche n° ${f.source_fiche_id}` : ''}</p></div>
      <div class="actions" style="justify-content:flex-end;flex-wrap:wrap">
        ${mod && !f.verrou ? `<button type="button" class="btn" data-f="3d" data-v="${(br || f.versions[0]).id}">Ouvrir en 3D</button>` : `<button type="button" class="btn ghost" data-f="3d" data-v="${f.versions[0].id}">Voir en 3D</button>`}
        ${dup ? `<button type="button" class="btn ghost" data-f="dupliquer">Dupliquer pour un autre client</button>` : ''}
        ${f.versions.length > 1 ? `<button type="button" class="btn ghost" data-f="comparer">Comparer deux versions</button>` : ''}</div></div>
    <h4 style="margin:14px 0 6px">Versions</h4>
    <div class="frise">${f.versions.map((v) => `<div class="etape-v ${v.statut}">
      <span class="vign">${v.vignette ? `<img src="${esc(v.vignette)}" alt="">` : ''}</span>
      <div><b>v${v.numero}</b> ${badgeFiche(v.statut)}<div class="small mute">${esc(v.cree_par_nom || '')} · ${jour(v.cree_le)}${v.motif_modif ? ' · « ' + esc(v.motif_modif) + ' »' : ''}</div>
        ${v.propose_le ? `<div class="small">Proposée ${v.propose_par_nom ? 'par ' + esc(v.propose_par_nom) : ''} le ${jour(v.propose_le)}</div>` : ''}
        ${v.valide_le ? `<div class="small vert">Validée par ${esc(v.valide_par_nom)} le ${jour(v.valide_le)}${v.commande_numero ? ' · ' + esc(v.commande_numero) : ''}</div>` : ''}</div>
      <div class="actions">
        ${v.pdf_valide_id ? boutonsPdf('/api/fichiers/' + v.pdf_valide_id, 'PDF validé') : v.pdf_id ? boutonsPdf('/api/fichiers/' + v.pdf_id, 'PDF') : ''}
        ${v.statut === 'brouillon' && prop && !f.verrou ? `<button type="button" class="btn cta sm" data-f="proposer" data-v="${v.id}">Proposer au commercial</button>` : ''}
        ${v.statut !== 'brouillon' && mod && !br ? `<button type="button" class="btn ghost sm" data-f="version" data-v="${v.id}">Nouvelle version</button>` : ''}</div></div>`).join('')}</div>
    <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Fermer</button></div>`, async () => true);
  const fen = $('#fen-form');
  fen.onclick = async (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    try {
      if (b.dataset.f === '3d') { $('#fen').close(); return ouvrirEn3D(f, +b.dataset.v); }
      if (b.dataset.f === 'version') {
        const motif = prompt('Motif de la modification (nouvelle version) :'); if (!motif || motif.trim().length < 3) return toast('Motif obligatoire (3 caractères au moins).', true);
        await api('POST', `/api/fiches/${f.id}/versions`, { depuis: +b.dataset.v, motif: motif.trim() }); toast('Nouvelle version créée en brouillon.'); $('#fen').close(); return ouvrirFiche(f.id);
      }
      if (b.dataset.f === 'proposer') return proposer(f, +b.dataset.v, clients);
      if (b.dataset.f === 'dupliquer') return dupliquer(f, clients);
      if (b.dataset.f === 'comparer') return comparer(f);
    } catch (x) { toast(x.message, true); }
  };
}

async function proposer(f, vid, clients, depuisStudio) {
  let corps = {};
  if (!f.client_id) {
    const reels = clients.filter((c) => !c.basique);
    const nom = prompt(`Fiche Basique : client de la commande ?\n${reels.slice(0, 30).map((c, i) => `${i + 1}. ${c.nom}`).join('\n')}\n\nTapez le numéro :`);
    const c = reels[(+nom || 0) - 1]; if (!c) return toast('« Basique » n’est pas un client : choisissez le client de la commande.', true);
    corps.client_id = c.id;
  }
  if (!confirm(`Proposer la version au commercial ?\n\nElle sera figée (plus de modification : une modification créera la version suivante), le PDF sera généré sans aucun prix, et une commande « à compléter » sera créée (sans numéro ni prix) pour le commercial.`)) return;
  const r = await api('POST', `/api/fiches/versions/${vid}/proposer`, corps);
  toast(`Version proposée. Commande à compléter n° ${r.brouillon_id} pour le commercial.`); if (depuisStudio) return r; $('#fen').close(); ouvrirFiche(f.id); return r;
}
async function dupliquer(f, clients) {
  const reels = clients;
  const nom = prompt(`Dupliquer ${f.reference} pour quel client ? (nouvelle référence, nouveau patronage)\n${reels.slice(0, 30).map((c, i) => `${i + 1}. ${c.nom}`).join('\n')}\n\nTapez le numéro :`);
  const c = reels[(+nom || 0) - 1]; if (!c) return;
  const v = f.versions.find((x) => x.statut === 'validee' || x.statut === 'en_production') || f.versions[0];
  const r = await api('POST', `/api/fiches/${f.id}/dupliquer`, { depuis: v.id, client_id: c.id || undefined });
  toast(`Fiche ${r.reference} créée pour ${r.client_libelle} (copie de ${f.reference} v${v.numero}).`); $('#fen').close(); route(); setTimeout(() => ouvrirFiche(r.id), 200);
}
async function comparer(f) {
  const a = f.versions[1], b = f.versions[0];
  const r = await api('GET', `/api/fiches/comparer/${a.id}/${b.id}`);
  fenetre(`<h3>${esc(f.reference)} : v${r.a.numero} → v${r.b.numero}</h3>
    <div class="grille2"><div>${r.a.vignette ? `<img src="${esc(r.a.vignette)}" style="max-width:100%">` : ''}<p class="small">v${r.a.numero} ${badgeFiche(r.a.statut)}</p></div><div>${r.b.vignette ? `<img src="${esc(r.b.vignette)}" style="max-width:100%">` : ''}<p class="small">v${r.b.numero} ${badgeFiche(r.b.statut)}</p></div></div>
    <div class="panneau" style="max-height:40vh;overflow:auto">${r.differences.length ? `<table><thead><tr><th>Élément</th><th>Avant</th><th>Après</th></tr></thead><tbody>${r.differences.map((d) => `<tr><td class="mono small">${esc(d.champ)}</td><td class="small">${esc(d.avant)}</td><td class="small">${esc(d.apres)}</td></tr>`).join('')}</tbody></table>` : '<div class="vide">Aucune différence de composition.</div>'}</div>
    <div class="pied"><button class="btn" value="ok">Fermer</button></div>`, async () => true);
}
async function ouvrirPdfFiche() {
  const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/pdf,.pdf';
  i.onchange = async () => {
    try {
      const r = await fetch('/api/fiches/ouvrir-pdf', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/pdf' }, body: i.files[0] });
      const d = await r.json(); if (!r.ok) throw new Error(d.message);
      toast(`PDF reconnu : fiche n° ${d.fiche_id}, version ${d.numero}.`); ouvrirFiche(d.fiche_id);
    } catch (x) { toast(x.message, true); }
  };
  i.click();
}
// Ouvre le Studio 3D sur la version : le studio lit la composition et l'enregistre dans la version (brouillon)
function ouvrirEn3D(f, vid) {
  sessionStorage.setItem('erp.fiche3d', JSON.stringify({ fiche_id: f.id, version_id: vid, reference: f.reference }));
  location.hash = '#infographie/studio';
  setTimeout(() => { try { versCadres({ type: 'ouvrir-fiche', fiche_id: f.id, version_id: vid }); } catch (_) { /* */ } }, 1500);
}

// Studio 3D → ERP : « Proposer au commercial » depuis la barre de la fiche dans le studio
addEventListener('message', async (e) => {
  if (e.origin !== location.origin || !e.data || !e.data.erp || e.data.type !== 'fiche-proposer') return;
  try {
    const [f, clients] = await Promise.all([api('GET', '/api/fiches/' + e.data.fiche_id), api('GET', '/api/fiches/clients')]);
    const r = await proposer(f, +e.data.version_id, clients, true);
    if (r) versCadres({ type: 'fiche-proposee', fiche_id: f.id, version_id: +e.data.version_id });
  } catch (x) { toast(x.message, true); }
});

/* ================================================================ Commandes à compléter (Commercial) */
ECRANS.aCompleter = async (m) => {
  const L = await api('GET', '/api/commandes-a-completer');
  m.innerHTML = entete('Commandes à compléter', 'Proposées par l’Infographie (fiche technique validée avec le client), ou dupliquées d’une ancienne commande. <b>Sans numéro</b> tant qu’elles ne sont pas validées : complétez les quantités (couleurs × tailles) et les prix, puis « Valider » — le numéro CMD est attribué à ce moment-là et les OF sont lancés.',
    `<div class="row-f">${rechercheHtml('Client, référence…')}</div>`) + '<div class="panneau" id="liste" style="overflow:auto"></div>';
  const dess = () => {
    const q = $('#recherche').value.trim().toLowerCase();
    const l = L.filter((b) => !q || JSON.stringify([b.client_nom, b.lignes.map((x) => x.reference)]).toLowerCase().includes(q));
    $('#liste').innerHTML = l.length ? `<table><thead><tr><th>N°</th><th>Créée</th><th>Origine</th><th>Client</th><th>Fiches</th><th>Par</th></tr></thead><tbody>
      ${l.map((b) => `<tr class="cliquable" data-id="${b.id}"><td class="mono">#${b.id}</td><td>${jour(b.cree_le)}</td><td>${b.origine === 'duplication' ? 'Duplication' : 'Infographie'}</td>
        <td><b>${esc(b.client_nom)}</b></td><td class="mono small">${b.lignes.map((x) => esc(x.reference) + ' v' + x.version).join(' · ')}</td><td class="small">${esc(b.cree_par_nom || '')}</td></tr>`).join('')}</tbody></table>`
      : '<div class="vide">Aucune commande à compléter.</div>';
  };
  $('#recherche').oninput = dess; dess();
  m.onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) completer(+tr.dataset.id); };
};

async function completer(id) {
  const b = await api('GET', '/api/commandes-a-completer/' + id);
  const prix = voit('prix'), ok = peut('commercial.commandes', 'valider') && prix;
  const ligneHtml = (l, i) => {
    const tailles = (l.taillant || []).length ? l.taillant : ['TU'];
    const couleurs = [...new Set((l.detail || []).map((x) => x.couleur).filter(Boolean))];
    if (!couleurs.length) couleurs.push('');
    const q = (c, t) => (l.detail || []).find((x) => x.couleur === c && x.taille === t)?.qte || '';
    return `<div class="panneau" style="padding:10px 12px;margin-bottom:10px" data-l="${i}" data-fv="${l.fiche_version_id}">
      <div class="row-f"><b class="mono">${esc(l.reference)}</b> v${l.version} ${l.derniere_version && l.derniere_version !== l.version ? `<span class="badge fut">v${l.derniere_version} existe</span>` : ''} — ${esc(l.designation || '')}
        <span class="spacer"></span>${prix ? `<label class="small">Prix HT <input class="court" data-pu value="${l.pu ?? ''}" inputmode="decimal" style="width:90px"></label><label class="small">Remise % <input class="court" data-rem value="${l.remise || 0}" style="width:60px"></label>` : ''}</div>
      <table class="nombres grille-q"><thead><tr><th>Couleur</th>${tailles.map((t) => `<th class="n">${esc(t)}</th>`).join('')}</tr></thead><tbody>
        ${couleurs.map((c) => `<tr><td><input data-coul value="${esc(c)}" placeholder="Couleur" style="width:120px"></td>${tailles.map((t) => `<td class="n"><input data-t="${esc(t)}" value="${q(c, t)}" inputmode="decimal" style="width:56px;text-align:right"></td>`).join('')}</tr>`).join('')}
      </tbody></table><button type="button" class="btn ghost sm" data-addc>+ Couleur</button></div>`;
  };
  grandeFenetre(`<h3>Commande à compléter #${b.id} · ${esc(b.client_nom)}</h3><div class="msg err" hidden role="alert"></div>
    <div class="grille2"><div class="champ"><label for="ac-bc">N° bon de commande client</label><input id="ac-bc" name="bc" value="${esc(b.bc_client || '')}" maxlength="80"></div>
      <div class="champ"><label for="ac-l">Livraison voulue</label><input id="ac-l" name="livraison" type="date" value="${b.livraison ? String(b.livraison).slice(0, 10) : ''}"></div></div>
    <div id="ac-lignes">${b.lignes.map(ligneHtml).join('')}</div>
    ${ok ? `<label class="chk-l"><input type="checkbox" name="lancer" checked> Lancer les OF à la validation (bloqués pour un produit sans nomenclature ni gamme)</label>
      <label class="chk-l"><input type="checkbox" name="perte"> Confirmer une vente à perte (si signalée)</label>` : '<p class="mute small">Valider demande le droit « Commandes › valider » et de voir les prix.</p>'}
    <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Fermer</button>
      ${peut('commercial.commandes', 'annuler') ? '<button type="button" class="btn ghost" data-ac="abandon">Abandonner</button>' : ''}
      ${prix ? '<button type="button" class="btn ghost" data-ac="enr">Enregistrer</button>' : ''}${ok ? '<button class="btn" value="ok">Valider la commande</button>' : ''}</div>`, async (f) => {
    const v = await enregistrer(f); if (!v) return false;
    const r = await api('POST', `/api/commandes-a-completer/${b.id}/valider`, { version: v, lancer_of: f.lancer?.checked !== false, confirmer_perte: !!f.perte?.checked });
    const L = r.lancement || { lances: [], bloques: [] };
    toast(`Commande ${r.commande.numero} validée. OF lancés : ${L.lances.map((x) => x.numero).join(', ') || 'aucun'}${L.bloques.length ? ' · bloqués : ' + L.bloques.map((x) => (x.reference || '') + ' (' + x.motif + ')').join(', ') : ''}.`);
    route(); return true;
  });
  let version = b.version;
  const f = $('#fen-form');
  const lire = () => [...f.querySelectorAll('[data-l]')].map((d) => ({ fiche_version_id: +d.dataset.fv,
    ...(prix ? { pu: Number(String(d.querySelector('[data-pu]').value).replace(',', '.')) || 0, remise: Number(String(d.querySelector('[data-rem]').value).replace(',', '.')) || 0 } : {}),
    detail: [...d.querySelectorAll('tbody tr')].flatMap((tr) => { const c = tr.querySelector('[data-coul]').value.trim(); return [...tr.querySelectorAll('[data-t]')].map((i) => ({ couleur: c, taille: i.dataset.t === 'TU' ? '' : i.dataset.t, qte: Number(String(i.value).replace(',', '.')) || 0 })).filter((x) => x.qte > 0); }) }));
  async function enregistrer(fo) {
    const r = await api('PUT', '/api/commandes-a-completer/' + b.id, { version, bc_client: fo.bc.value.trim(), livraison: fo.livraison.value || undefined, lignes: lire() });
    version = r.version; return version;
  }
  f.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-addc]');
    if (a) { const tb = a.previousElementSibling.querySelector('tbody'); const tr = tb.rows[0].cloneNode(true); tr.querySelectorAll('input').forEach((i) => (i.value = '')); tb.appendChild(tr); return; }
    const x = e.target.closest('[data-ac]'); if (!x) return;
    try {
      if (x.dataset.ac === 'enr') { await enregistrer(f); toast('Commande enregistrée (toujours à compléter).'); }
      if (x.dataset.ac === 'abandon') { const motif = prompt('Motif de l’abandon :'); if (!motif) return; await api('POST', `/api/commandes-a-completer/${b.id}/abandonner`, { version, motif }); toast('Commande abandonnée.'); $('#fen').close(); route(); }
    } catch (er) { toast(er.message, true); }
  });
}

/* ================================================================ Étiquettes (Production) */
ECRANS.etiquettes = async (m) => {
  const L = await api('GET', '/api/etiquettes/file');
  const gen = peut('production.etiquettes', 'creer'), exp = peut('production.etiquettes', 'exporter'), imp = peut('production.etiquettes', 'valider');
  m.innerHTML = entete('Étiquettes', 'Composition (rouleau 40 mm, pliée en deux, imprimante TSC TTP-244 Pro) et autocollants d’emballage. Une étiquette par pièce : fibres en français et en arabe, symboles d’entretien, « Fabriqué en Tunisie », code-barres, n° d’OF, QR de traçabilité. « Imprimer sur rouleau » envoie le format exact à la TSC (pilote Windows) et note les étiquettes imprimées ; « PDF » = planche A4 d’aperçu.',
    `<div class="row-f">${rechercheHtml('OF, commande, client, référence…')}</div>`) +
    '<div class="panneau" id="liste" style="overflow:auto"></div>';
  const dess = () => {
    const q = $('#recherche').value.trim().toLowerCase();
    const l = L.filter((o) => !q || JSON.stringify([o.numero, o.commande_numero, o.client_nom, o.reference]).toLowerCase().includes(q));
    $('#liste').innerHTML = l.length ? `<table class="nombres"><thead><tr><th>OF</th><th>Commande</th><th>Client</th><th>Produit</th><th class="n">Composition</th><th class="n">Emballage</th><th class="n">À imprimer</th><th></th></tr></thead><tbody>
      ${l.map((o) => `<tr><td class="mono"><b>${esc(o.numero)}</b></td><td class="mono small">${esc(o.commande_numero || '—')}</td><td>${esc(o.client_nom || '—')}</td><td class="mono small">${esc(o.reference)}</td>
        <td class="n">${o.composition}</td><td class="n">${o.emballage}</td><td class="n ${o.a_imprimer ? 'rouge' : ''}">${o.a_imprimer}</td>
        <td><div class="actions">${gen ? `<button class="btn ghost sm" data-e="gen" data-of="${o.of_id}">${o.composition ? 'Compléter' : 'Générer'}</button>` : ''}
          ${o.composition ? boutonsPdf('/api/etiquettes/pdf?of_id=' + o.of_id, 'PDF') : ''}
          ${o.composition && imp ? `<button class="btn cta sm" data-e="rouleau" data-of="${o.of_id}" title="Format exact du rouleau (TSC TTP-244 Pro) : une étiquette par page">Imprimer sur rouleau</button>` : ''}</div></td></tr>`).join('')}</tbody></table>`
      : '<div class="vide">Aucun OF lancé.</div>';
  };
  $('#recherche').oninput = dess; dess();
  m.onclick = async (e) => {
    const b = e.target.closest('[data-e]'); if (!b) return;
    if (b.dataset.e === 'rouleau') return imprimerRouleau(+b.dataset.of);
    try { const r = await api('POST', `/api/prod/of/${b.dataset.of}/etiquettes`); toast(`${r.of} : ${r.nouvelles} nouvelle(s) étiquette(s).`); route(); }
    catch (x) { toast(x.message, true); }
  };
};

// Impression sur rouleau (TSC TTP-244 Pro, pilote Windows) : PDF au format exact, une étiquette par page.
// Choisir la TSC dans la boîte d'impression (Windows la retient), puis confirmer : l'impression est enregistrée.
async function imprimerRouleau(ofId) {
  fenetre(`<h3>Imprimer sur rouleau</h3><div class="msg err" hidden role="alert"></div>
    <div class="champ"><label>Étiquettes</label><select name="type"><option value="composition">Composition (40 × 120 mm, pliée)</option><option value="emballage">Autocollants d’emballage (60 × 40 mm)</option></select></div>
    <label class="chk-l"><input type="checkbox" name="nouv" checked> Seulement celles pas encore imprimées</label>
    <div class="champ"><label>Motif (obligatoire pour une réimpression)</label><input name="motif" maxlength="300" placeholder="Ex. : étiquettes abîmées"></div>
    <p class="mute small">Dans la boîte d’impression, choisissez l’imprimante <b>TSC TTP-244 Pro</b>, échelle « Taille réelle » (100 %).</p>
    <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Annuler</button><button class="btn" value="ok">Imprimer</button></div>`, async (f) => {
    const q = new URLSearchParams({ of_id: ofId, type: f.type.value, format: 'rouleau' }); if (f.nouv.checked) q.set('a_imprimer', 'true');
    const r = await fetch('/api/etiquettes/pdf?' + q, { credentials: 'same-origin' });
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.message || 'Aucune étiquette à imprimer.'); }
    const ids = (r.headers.get('X-Etiquettes-Ids') || '').split(',').filter(Boolean).map(Number);
    const blob = await r.blob();
    window.Imprimer.pdf(blob);
    const motif = f.motif.value.trim();
    setTimeout(async () => {
      if (!confirm(`L’impression de ${ids.length} étiquette(s) s’est-elle bien passée ?\n\nOK : elles sont notées « imprimées » (traçabilité).`)) return;
      try { const x = await api('POST', '/api/etiquettes/imprimees', { ids, ...(motif ? { motif } : {}), poste_imprimante: 'TSC TTP-244 Pro' }); toast(`${x.nombre} étiquette(s) notée(s) imprimée(s).`); route(); }
      catch (er) { toast(er.message, true); }
    }, 2500);
    return true;
  });
}

/* ================================================================ Composition et entretien des tissus (Stock MP) */
ECRANS.compositions = async (m) => {
  const [arts, ref] = await Promise.all([api('GET', '/api/registres/articles_mp'), api('GET', '/api/etiquettes/referentiel')]);
  const tissus = arts.filter((a) => a.actif && /tissu/i.test(a.famille || ''));
  const mod = peut('stock_mp.articles', 'modifier') || peut('infographie.fiches', 'modifier');
  m.innerHTML = entete('Composition et entretien des tissus', 'Fibres en % (total 100 %) et 5 symboles d’entretien ISO 3758 (lavage, blanchiment, séchage, repassage, entretien professionnel), en français et en arabe. Repris sur la fiche technique et sur chaque étiquette de composition. Les modèles par type de tissu sont <b>proposés</b> : à vérifier selon la teinture et le marquage.',
    `<div class="row-f">${rechercheHtml('Code, désignation…')}</div>`) + '<div class="panneau" id="liste" style="overflow:auto"></div>';
  const dico = Object.fromEntries(ref.fibres.map((f) => [f.code, f]));
  const dess = () => {
    const q = $('#recherche').value.trim().toLowerCase();
    const l = tissus.filter((a) => !q || JSON.stringify([a.code, a.designation]).toLowerCase().includes(q));
    $('#liste').innerHTML = l.length ? `<table><thead><tr><th>Code</th><th>Tissu</th><th>Composition</th><th>Entretien</th><th></th></tr></thead><tbody>
      ${l.map((a) => `<tr class="cliquable" data-id="${a.id}"><td class="mono">${esc(a.code || '')}</td><td>${esc(a.designation)}</td><td>${a.composition ? esc(a.composition) + `<div class="small" dir="rtl">${esc(a.composition_ar || '')}</div>` : '<span class="rouge small">à saisir</span>'}</td>
        <td class="small">${a.entretien ? ref.traitements.map((t) => esc(ref.symboles[t][a.entretien[t]] || '')).join(' · ') : '<span class="rouge">à saisir</span>'}</td><td>${mod ? '<button class="btn ghost sm">Modifier</button>' : ''}</td></tr>`).join('')}</tbody></table>`
      : '<div class="vide">Aucun article de famille « Tissu ». Créez-les dans Stock MP › Articles matières (famille : Tissu).</div>';
  };
  $('#recherche').oninput = dess; dess();
  m.onclick = (e) => {
    const tr = e.target.closest('tr[data-id]'); if (!tr || !mod) return;
    const a = tissus.find((x) => x.id === +tr.dataset.id);
    const fib = (a.fibres || [{ fibre: 'coton', pct: 100 }]);
    const selSym = (t, v) => `<select name="s-${t}">${Object.entries(ref.symboles[t]).map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    grandeFenetre(`<h3>${esc(a.code || '')} · ${esc(a.designation)}</h3><div class="msg err" hidden role="alert"></div>
      <h4>Fibres (total 100 %)</h4><div id="cp-f">${fib.map((f) => `<div class="row-f" data-fib><select name="fibre">${ref.fibres.filter((x) => x.actif).map((x) => `<option value="${x.code}" ${x.code === f.fibre ? 'selected' : ''}>${esc(x.fr)} — ${esc(x.ar)}</option>`).join('')}</select><input name="pct" value="${f.pct}" style="width:70px" inputmode="decimal"> %</div>`).join('')}</div>
      <button type="button" class="btn ghost sm" data-cp="plus">+ Fibre</button>
      <h4>Entretien</h4><div class="champ"><label>Modèle proposé</label><select id="cp-mod"><option value="">— choisir un modèle —</option>${ref.modeles.map((x) => `<option value="${x.code}">${esc(x.libelle)}</option>`).join('')}</select></div>
      <div class="grille2">${ref.traitements.map((t) => `<div class="champ"><label>${{ lavage: 'Lavage', blanchiment: 'Blanchiment', sechage: 'Séchage', repassage: 'Repassage', pro: 'Entretien professionnel' }[t]}</label>${selSym(t, a.entretien?.[t])}</div>`).join('')}</div>
      <div class="champ"><label>Consignes (français)</label><input name="tfr" value="${esc(a.entretien?.texte_fr || '')}" maxlength="300"></div>
      <div class="champ"><label>Consignes (arabe)</label><input name="tar" dir="rtl" value="${esc(a.entretien?.texte_ar || '')}" maxlength="300"></div>
      <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Annuler</button><button class="btn" value="ok">Enregistrer</button></div>`, async (f) => {
      const fibres = [...f.querySelectorAll('[data-fib]')].map((d) => ({ fibre: d.querySelector('[name=fibre]').value, pct: Number(String(d.querySelector('[name=pct]').value).replace(',', '.')) || 0 })).filter((x) => x.pct > 0);
      const entretien = Object.fromEntries(ref.traitements.map((t) => [t, f['s-' + t].value])); entretien.texte_fr = f.tfr.value.trim(); entretien.texte_ar = f.tar.value.trim();
      const r = await api('PUT', `/api/stocks/mp/articles/${a.id}/composition`, { version: a.version, fibres, entretien });
      toast('Composition enregistrée : ' + r.composition); route(); return true;
    });
    const f = $('#fen-form');
    f.querySelector('[data-cp=plus]').onclick = () => { const d = f.querySelector('[data-fib]').cloneNode(true); d.querySelector('[name=pct]').value = ''; $('#cp-f').appendChild(d); };
    $('#cp-mod').onchange = (e) => { const x = ref.modeles.find((y) => y.code === e.target.value); if (!x) return; for (const t of ref.traitements) f['s-' + t].value = x.symboles[t]; f.tfr.value = x.texte_fr; f.tar.value = x.texte_ar; };
  };
  void dico;
};

/* ================================================================ Paramètres › Étiquettes */
ECRANS.paramEtiquettes = async (m) => {
  const ref = await api('GET', '/api/etiquettes/referentiel');
  const mod = peut('parametres.etiquettes', 'modifier'), o = ref.options;
  m.innerHTML = entete('Étiquettes', 'Réglages valables pour tous les postes (étiquettes de composition et d’emballage).') + `<div class="panneau" style="padding:16px 18px">
    <div class="grille2">
      <div class="champ"><label>Pays d’origine (français)</label><input id="pe-ofr" value="${esc(o.etiq_origine_fr)}" ${mod ? '' : 'disabled'}></div>
      <div class="champ"><label>Pays d’origine (arabe)</label><input id="pe-oar" dir="rtl" value="${esc(o.etiq_origine_ar)}" ${mod ? '' : 'disabled'}></div>
      <div class="champ"><label>Étiquettes de réserve par OF</label><input id="pe-res" type="number" min="0" max="50" value="${esc(o.etiq_reserve)}" ${mod ? '' : 'disabled'}></div>
      <div class="champ"><label>Format de l’autocollant d’emballage (mm)</label><input id="pe-fmt" value="${esc(o.etiq_format_emballage)}" pattern="[0-9]{2,3}x[0-9]{2,3}" ${mod ? '' : 'disabled'}></div>
      <div class="champ"><label>Nom du client sur les étiquettes</label><select id="pe-cli" ${mod ? '' : 'disabled'}><option value="non" ${o.etiq_client !== 'oui' ? 'selected' : ''}>Non</option><option value="oui" ${o.etiq_client === 'oui' ? 'selected' : ''}>Oui</option></select></div>
      <div class="champ"><label>Préfixe entreprise GS1 (EAN-13)</label><input id="pe-gs1" value="${esc(o.gs1_prefixe)}" placeholder="619…" ${mod ? '' : 'disabled'}>
        <span class="aide">Vide : codes internes Code 128 (DT00000001…). Après adhésion à GS1 Tunisie, saisissez le préfixe : les nouveaux codes seront des EAN-13.</span></div>
    </div>${mod ? '<button class="btn" id="pe-ok">Enregistrer</button>' : ''}</div>
    <h3 style="margin:18px 0 8px">Fibres (français / arabe)</h3><div class="panneau"><table><thead><tr><th>Code</th><th>Français</th><th>Arabe</th></tr></thead><tbody>
      ${ref.fibres.map((f) => `<tr><td class="mono">${esc(f.code)}</td><td>${esc(f.fr)}</td><td dir="rtl">${esc(f.ar)}</td></tr>`).join('')}</tbody></table></div>
    <p class="mute small">Traductions arabes fournies par défaut : à faire relire. Symboles d’entretien : marques GINETEX — vérifiez l’accord de licence (ou celui de votre fournisseur d’étiquettes).</p>`;
  $('#pe-ok')?.addEventListener('click', async () => {
    try {
      await api('PUT', '/api/parametres/etiquettes', { etiq_origine_fr: $('#pe-ofr').value.trim(), etiq_origine_ar: $('#pe-oar').value.trim(), etiq_reserve: +$('#pe-res').value || 0,
        etiq_format_emballage: $('#pe-fmt').value.trim(), etiq_client: $('#pe-cli').value, gs1_prefixe: $('#pe-gs1').value.replace(/\D/g, '') });
      toast('Réglages des étiquettes enregistrés.');
    } catch (x) { toast(x.message, true); }
  });
};

/* ================================================================ Traçabilité (QR → #t/CODE) */
async function afficherTracabilite(code) {
  try {
    const t = await api('GET', '/api/tracabilite/' + encodeURIComponent(code));
    fenetre(`<h3>Traçabilité · <span class="mono">${esc(t.code)}</span></h3>
      <p><b class="mono">${esc(t.reference)}</b> — ${esc(t.designation || '')} · taille <b>${esc(t.taille || 'TU')}</b>${t.couleur ? ' · ' + esc(t.couleur) : ''}</p>
      <table><tbody>
        <tr><th>Commande</th><td class="mono">${esc(t.commande || '—')} · ${esc(t.client || '')}</td></tr>
        <tr><th>OF</th><td class="mono">${esc(t.of.numero)} · ${t.of.parties.map((p) => ['Coupe', 'Marquage', 'Assemblage'][p.partie - 1] + ' : ' + ({ en_attente: 'en attente', en_cours: 'en cours', validee: 'validée', sans_objet: 'sans objet' }[p.etat] || p.etat)).join(' · ')}</td></tr>
        <tr><th>Composition</th><td>${esc(t.composition || '—')}</td></tr>
        <tr><th>Tissu (lots / rouleaux)</th><td>${t.rouleaux.length ? t.rouleaux.map((r) => `${esc(r.code || r.article || '')} · lot ${esc(r.n_lot || '—')} · bain ${esc(r.bain || '—')} · rouleau ${esc(r.rouleau || '—')}`).join('<br>') : 'coupe pas encore validée'}</td></tr>
        <tr><th>Production</th><td>${t.production ? (t.production.du === t.production.au ? jour(t.production.au) : `du ${jour(t.production.du)} au ${jour(t.production.au)}`) : 'en cours'}</td></tr>
        <tr><th>Livraison</th><td>${t.livraison.bls ? t.livraison.bls.map((b) => `${esc(b.numero)} le ${jour(b.date)}`).join('<br>') : `prévue le ${jour(t.livraison.prevue)}`}</td></tr>
        <tr><th>Code-barres</th><td class="mono">${esc(t.code_barres)}</td></tr>
        ${t.fiche ? `<tr><th>Fiche technique</th><td>v${t.fiche.version} validée par ${esc(t.fiche.validee_par || '')} le ${jour(t.fiche.le)} ${t.fiche.pdf_id ? boutonsPdf('/api/fichiers/' + t.fiche.pdf_id, 'PDF') : ''}</td></tr>` : ''}
      </tbody></table><div class="pied"><button class="btn" value="ok">Fermer</button></div>`, async () => true);
  } catch (x) { toast(x.message, true); }
}
// QR : /t/CODE (étiquette) et /f/ID (fiche) → servis par index.html (try_files) puis convertis en #t/CODE, #f/ID.
// Si l'utilisateur n'est pas connecté, l'adresse est gardée et traitée juste après la connexion.
{
  const p = location.pathname.match(/^\/(t|f)\/([A-Za-z0-9]{1,20})\/?$/);
  if (p) history.replaceState(null, '', '/#' + p[1] + '/' + p[2]);
}
const _routeOrig = route;
// eslint-disable-next-line no-global-assign
route = async function () {
  const h = location.hash.match(/^#(t|f)\/([A-Za-z0-9]{1,20})$/);
  if (h && typeof MOI !== 'undefined' && MOI && !MOI.doit_changer_mdp) {
    if (h[1] === 't') { history.replaceState(null, '', '#accueil'); await _routeOrig(); return afficherTracabilite(h[2]); }
    if (peut('infographie.fiches')) { history.replaceState(null, '', '#infographie/fiches'); await _routeOrig(); return ouvrirFiche(+h[2]); }
    history.replaceState(null, '', '#accueil');
  }
  return _routeOrig();
};

/* ================================================================ menus */
(function brancherMenus() {
  Object.assign(MODS.infographie.f, { fiches: { t: 'natif', ecran: 'bibliotheque', ico: 'doc', libelle: 'Bibliothèque des fiches', d: 'Fiches techniques versionnées : 3D, versions, duplication, proposition au commercial' } });
  Object.assign(MODS.commercial.f, { a_completer: { t: 'natif', ecran: 'aCompleter', fonction: 'commandes', ico: 'list', libelle: 'Commandes à compléter', d: 'Proposées par l’Infographie : quantités, prix, validation → CMD + OF' },
    codes_barres: { t: 'natif', ecran: 'codesBarres', ico: 'hash', libelle: 'Codes-barres', d: 'Un code par taille × couleur, code sachet, pièces par sachet' } });
  Object.assign(MODS.production.f, { etiquettes: { t: 'natif', ecran: 'etiquettes', ico: 'doc', libelle: 'Étiquettes', d: 'Composition (FR/AR, entretien, QR) et emballage ; aperçu PDF, Excel' } });
  Object.assign(MODS.stock_mp.f, { compositions: { t: 'natif', ecran: 'compositions', fonction: 'articles', ico: 'list', libelle: 'Composition des tissus', d: 'Fibres % et entretien FR / AR' } });
  Object.assign(MODS.parametres.f, { etiquettes: { t: 'natif', ecran: 'paramEtiquettes', ico: 'doc', libelle: 'Étiquettes', d: 'Origine, réserve, format, préfixe GS1, fibres' } });
})();

/* ================================================================ Codes-barres produit (Commercial) */
ECRANS.codesBarres = async (m) => {
  const P = await api('GET', '/api/produits');
  m.innerHTML = entete('Codes-barres produit', 'Un code par taille et par couleur, créé automatiquement ; un code distinct pour un sachet de plusieurs pièces (torchons, serviettes, coiffes : 2 ou 10 par sachet). Code 128 interne tant qu’aucun préfixe GS1 n’est saisi (Paramètres › Étiquettes).',
    `<div class="row-f">${rechercheHtml('Référence…')}</div>`) + '<div class="panneau" id="liste" style="overflow:auto"></div>';
  const dess = () => {
    const q = $('#recherche').value.trim().toLowerCase();
    const l = P.filter((p) => !q || JSON.stringify([p.reference, p.client_nom, p.designation]).toLowerCase().includes(q));
    $('#liste').innerHTML = l.length ? `<table><thead><tr><th>Référence</th><th>Client</th><th>Sexe</th><th>Tailles</th><th></th></tr></thead><tbody>
      ${l.map((p) => `<tr class="cliquable" data-id="${p.id}"><td class="mono"><b>${esc(p.reference)}</b></td><td>${esc(p.client_nom || 'Basique')}</td><td>${esc(SEXE_L[p.sexe] || p.sexe)}</td><td class="small">${esc((p.taillant || []).join(' '))}</td><td><button class="btn ghost sm">Codes</button></td></tr>`).join('')}</tbody></table>`
      : '<div class="vide">Aucun produit fini.</div>';
  };
  $('#recherche').oninput = dess; dess();
  m.onclick = async (e) => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    const p = P.find((x) => x.id === +tr.dataset.id);
    const L = await api('GET', `/api/produits/${p.id}/codes-barres`);
    const modif = peut('commercial.codes_barres', 'modifier');
    fenetre(`<h3>Codes-barres · ${esc(p.reference)}</h3><div class="msg err" hidden role="alert"></div>
      <div class="grille2"><div class="champ"><label>Pièces par sachet</label><input name="pps" type="number" min="1" max="1000" value="${p.pieces_par_sachet || 1}" ${modif ? '' : 'disabled'}></div>
        <div class="champ"><label>Désignation (nom sur l’emballage)</label><input name="des" maxlength="160" value="${esc(p.designation || '')}" ${modif ? '' : 'disabled'}></div></div>
      <div class="panneau" style="max-height:45vh;overflow:auto"><table><thead><tr><th>Taille</th><th>Couleur</th><th>Conditionnement</th><th>Code</th><th>Type</th></tr></thead><tbody>
        ${L.map((c) => `<tr><td>${esc(c.taille || 'TU')}</td><td>${esc(c.couleur || 'toutes')}</td><td>${c.conditionnement > 1 ? 'sachet de ' + c.conditionnement : 'pièce'}</td><td class="mono">${esc(c.code)}</td><td>${c.type === 'EAN13' ? 'EAN-13' : 'Code 128'}</td></tr>`).join('') || '<tr><td colspan="5" class="mute">Aucun code.</td></tr>'}</tbody></table></div>
      <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Fermer</button>${modif ? '<button class="btn" value="ok">Enregistrer</button>' : ''}</div>`, async (f) => {
      if (!modif) return true;
      const r = await api('PUT', `/api/produits/${p.id}/conditionnement`, { pieces_par_sachet: +f.pps.value || 1, designation: f.des.value.trim() });
      toast(`Enregistré${r.crees.length ? ' · ' + r.crees.length + ' code(s) créé(s)' : ''}.`); route(); return true;
    });
  };
};
