'use strict';
/* ERP DIGITAL-TEX — lot 0.10.0 « Stocks » : matières premières (lots et rouleaux) et produits finis (taille, couleur),
   mouvements, inventaires, valorisation FIFO. Chargé après erp-coquille.js (helpers : api, toast, peut, voit, fenetre,
   grandeFenetre, esc, $, md, r3, jour, iso, entete, rechercheHtml, route, ECRANS, boutonsExport).
   Les valeurs (coûts) ne sont envoyées par le serveur qu'avec le droit « voir les coûts de revient ». */

const qteF = (v) => (+v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 3 });
const TYPES_MP = { reception: 'Réception', sortie_of: 'Sortie OF', sortie: 'Sortie', retour: 'Retour', transfert: 'Transfert', ajustement: 'Ajustement', inventaire: 'Inventaire', annulation: 'Annulation' };
const TYPES_PF = { entree_manuelle: 'Entrée', entree_of: 'Entrée OF', sortie_bl: 'Livraison (BL)', retour_bl: 'Retour BL', retour_client: 'Retour client', sortie: 'Sortie', ajustement: 'Ajustement', inventaire: 'Inventaire' };
const lotLib = (l) => [l.rouleau ? 'Rouleau ' + l.rouleau : '', l.n_lot ? 'lot ' + l.n_lot : '', l.bain ? 'bain ' + l.bain : ''].filter(Boolean).join(' · ') || `Lot du ${jour(l.date_entree)}`;
const signe = (v) => `<span class="${v < 0 ? 'rouge' : ''}">${v > 0 ? '+' : ''}${qteF(v)}</span>`;
const estTissuF = (a) => /^tissu/i.test(a?.famille || '');

/* ---------------------------------------------------------------- Stock MP : état */
ECRANS.etatMP = async (m) => {
  const [L, P] = await Promise.all([api('GET', '/api/stocks/mp/etat'), api('GET', '/api/stocks/parametres').catch(() => ({}))]);
  const val = voit('couts'), actifs = L.filter((a) => a.actif || a.physique);
  const alertes = actifs.filter((a) => a.alerte);
  m.innerHTML = entete('Stock matières premières', `Physique = ce qui est en magasin · réservé = promis aux OF (lot 7) · disponible = physique − réservé. Valorisation : <b>${esc(P.methode_valorisation?.valeur || 'FIFO')}</b> (premier entré, premier sorti — à confirmer par le comptable).`,
    `<div class="row-f">${rechercheHtml('Article, code, couleur…')}<div class="champ" style="margin:0"><select id="filtre"><option value="">Tous</option><option value="alerte">Sous le seuil</option><option value="stock">En stock</option><option value="vide">Sans stock</option></select></div>${boutonsExport('mp', '/api/stocks/mp/etat', peut('stock_mp.articles', 'exporter'))}</div>`) +
    `<div class="chiffres"><div class="chiffre"><b>${actifs.length}</b><span>article(s) suivi(s)</span></div><div class="chiffre"><b>${actifs.reduce((s, a) => s + a.lots, 0)}</b><span>lots / rouleaux en stock</span></div>
      <div class="chiffre ${alertes.length ? 'alerte' : ''}"><b>${alertes.length}</b><span>article(s) sous le seuil minimum</span></div>
      ${val ? `<div class="chiffre"><b>${md(actifs.reduce((s, a) => s + a.valeur, 0))}</b><span>valeur du stock (FIFO)</span></div>` : ''}</div>
    <div class="panneau" id="liste" style="overflow:auto"></div>`;
  const dess = () => {
    const q = $('#recherche').value.trim().toLowerCase(), f = $('#filtre').value;
    const l = actifs.filter((a) => (!f || (f === 'alerte' ? a.alerte : f === 'stock' ? a.physique > 0 : a.physique <= 0)) && (!q || JSON.stringify([a.code, a.designation, a.couleur, a.famille]).toLowerCase().includes(q)));
    $('#liste').innerHTML = l.length ? `<table class="nombres"><thead><tr><th>Code</th><th>Article</th><th>Famille</th><th class="n">Physique</th><th class="n">Réservé</th><th class="n">Disponible</th><th class="n">Seuil</th><th class="n">Lots</th>${val ? '<th class="n">Valeur</th><th class="n">Coût moyen</th>' : ''}</tr></thead><tbody>
      ${l.map((a) => `<tr class="cliquable" data-id="${a.id}"><td class="mono small">${esc(a.code)}</td><td><b>${esc(a.designation)}</b>${a.couleur ? `<div class="mute small">${esc(a.couleur)}</div>` : ''}</td><td>${esc(a.famille)}</td>
        <td class="n">${qteF(a.physique)} ${esc(a.unite)}</td><td class="n">${a.reserve ? qteF(a.reserve) : '—'}</td><td class="n ${a.alerte ? 'rouge' : ''}"><b>${qteF(a.disponible)}</b>${a.alerte ? ' <span class="badge ret">seuil</span>' : ''}</td>
        <td class="n">${a.seuil_min ?? '—'}</td><td class="n">${a.lots}</td>${val ? `<td class="n">${md(a.valeur)}</td><td class="n">${dt(a.cout_moyen)}</td>` : ''}</tr>`).join('')}</tbody></table>`
      : `<div class="vide">${actifs.length ? 'Aucun article pour ce filtre.' : 'Aucun article matière. Créez-les dans « Articles matières », puis saisissez une réception.'}</div>`;
  };
  $('#recherche').oninput = dess; $('#filtre').onchange = dess; dess();
  m.onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) ficheLotsMP(L.find((a) => a.id === +tr.dataset.id)); };
};

async function ficheLotsMP(a) {
  const lots = await api('GET', `/api/stocks/mp/articles/${a.id}/lots`);
  const val = voit('couts');
  grandeFenetre(`<h3>${esc(a.designation)} — lots et rouleaux</h3>
    <p class="mute small">${qteF(a.physique)} ${esc(a.unite)} en stock · sortie dans l’ordre FIFO (le plus ancien d’abord)${estTissuF(a) ? ' ; tissu : on choisit le rouleau à chaque sortie' : ''}.</p>
    ${lots.length ? `<div style="overflow:auto"><table class="nombres"><thead><tr><th>Lot / rouleau</th><th>Entrée</th><th>Réception</th><th>Emplacement</th><th class="n">Initial</th><th class="n">Restant</th>${val ? '<th class="n">Coût unitaire</th><th class="n">Valeur</th>' : ''}</tr></thead><tbody>
      ${lots.map((l) => `<tr><td><b>${esc(lotLib(l))}</b></td><td>${jour(l.date_entree)}</td><td class="mono small">${esc(l.reception || '—')}</td><td>${esc(l.emplacement || '—')}</td><td class="n">${qteF(l.qte_initiale)}</td><td class="n"><b>${qteF(l.qte_restante)}</b></td>${val ? `<td class="n">${dt(l.cout_unitaire)}</td><td class="n">${md(l.valeur)}</td>` : ''}</tr>`).join('')}</tbody></table></div>` : '<div class="vide">Aucun lot en stock.</div>'}
    <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Fermer</button>${peut('stock_mp.sorties', 'creer') && lots.length ? '<button class="btn" value="ok">Sortir / déplacer…</button>' : ''}</div>`, () => { formMouvementMP(a, lots); return false; });
}

/* ---------------------------------------------------------------- Stock MP : réceptions */
ECRANS.receptionsMP = async (m) => {
  const [L, arts] = await Promise.all([api('GET', '/api/stocks/mp/receptions'), api('GET', '/api/registres/articles_mp')]);
  const cree = peut('stock_mp.entrees', 'creer'), ann = peut('stock_mp.entrees', 'annuler'), val = voit('couts');
  m.innerHTML = entete('Réceptions de matières', 'Chaque réception reçoit un numéro (RMP) du serveur et crée un lot par ligne. Tissu : une ligne par rouleau (n° de lot, bain de teinture, métrage). Le coût d’achat se saisit avec le droit « prix d’achat », sinon le prix de la fiche article est repris.',
    `<div class="row-f">${rechercheHtml('N°, fournisseur, article…')}${cree ? '<button class="btn cta" data-r="nouveau">+ Réception</button>' : ''}</div>`) +
    `<div class="panneau" id="liste" style="overflow:auto"></div>`;
  const dess = () => {
    const q = $('#recherche').value.trim().toLowerCase();
    const l = L.filter((r) => !q || JSON.stringify([r.numero, r.fournisseur, r.ref_fournisseur, r.lignes.map((x) => [x.designation, x.rouleau, x.n_lot])]).toLowerCase().includes(q));
    $('#liste').innerHTML = l.length ? `<table class="nombres"><thead><tr><th>N°</th><th>Date</th><th>Fournisseur</th><th>Lignes</th>${val ? '<th class="n">Valeur</th>' : ''}<th>État</th><th></th></tr></thead><tbody>
      ${l.map((r) => `<tr><td class="mono small"><b>${esc(r.numero)}</b></td><td>${jour(r.date)}</td><td>${esc(r.fournisseur || '—')}${r.ref_fournisseur ? `<div class="mute small">réf. ${esc(r.ref_fournisseur)}</div>` : ''}</td>
        <td class="small">${r.lignes.map((x) => `${esc(x.designation)} : <b>${qteF(x.qte)} ${esc(x.unite || '')}</b>${x.rouleau || x.n_lot ? ` <span class="etiq">${esc(lotLib(x))}</span>` : ''}`).join('<br>')}</td>
        ${val ? `<td class="n">${md(r.valeur)}</td>` : ''}<td>${r.statut === 'annulee' ? `<span class="badge anc" title="${esc(r.motif)}">Annulée</span>` : '<span class="badge vig">Validée</span>'}</td>
        <td>${r.statut !== 'annulee' && ann ? `<button class="btn ghost sm" data-r="annuler" data-id="${r.id}">Annuler</button>` : ''}</td></tr>`).join('')}</tbody></table>`
      : `<div class="vide">${L.length ? 'Aucune réception pour cette recherche.' : 'Aucune réception pour l’instant.'}</div>`;
  };
  $('#recherche').oninput = dess; dess();
  m.onclick = (e) => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    if (b.dataset.r === 'nouveau') return formReception(arts.filter((a) => a.actif));
    const r = L.find((x) => x.id === +b.dataset.id);
    grandeFenetre(`<h3>Annuler la réception ${esc(r.numero)}</h3><div class="msg err" hidden role="alert"></div><p>Possible seulement si rien n’est encore sorti de ses lots. La réception reste dans l’historique (statut « annulée »).</p>
      <div class="champ"><label for="rc-mot">Motif *</label><input id="rc-mot" name="motif" required minlength="3" maxlength="300"></div>
      <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Retour</button><button class="btn danger" value="ok">Annuler la réception</button></div>`, async (f) => {
      await api('POST', `/api/stocks/mp/receptions/${r.id}/annuler`, { motif: f.motif.value.trim() }); toast('Réception annulée.'); route(); return true;
    });
  };
};

function formReception(arts) {
  if (!arts.length) return toast('Créez d’abord les articles matières (Stock MP › Articles matières).', true);
  const coutOk = voit('achats') || voit('couts');
  let lignes = [{ article_id: '', qte: '', n_lot: '', bain: '', rouleau: '', emplacement: '', cout_unitaire: '' }];
  const opts = arts.map((a) => `<option value="${a.id}">${esc(a.designation)}${a.code ? ' (' + esc(a.code) + ')' : ''} · ${esc(a.unite)}</option>`).join('');
  const ligneHtml = (l, i) => `<tr data-i="${i}"><td><select data-k="article_id" required><option value="">— article —</option>${opts}</select></td><td><input data-k="qte" type="number" step="any" min="0.001" required style="width:90px"></td>
    <td><input data-k="rouleau" maxlength="60" style="width:90px" placeholder="R12"></td><td><input data-k="n_lot" maxlength="60" style="width:90px"></td><td><input data-k="bain" maxlength="60" style="width:80px"></td>
    <td><input data-k="emplacement" maxlength="80" style="width:110px"></td>${coutOk ? '<td><input data-k="cout_unitaire" type="number" step="any" min="0" style="width:90px" placeholder="fiche"></td>' : ''}<td><button type="button" class="btn ghost sm" data-del="${i}">✕</button></td></tr>`;
  grandeFenetre(`<h3>Nouvelle réception</h3><div class="msg err" hidden role="alert"></div>
    <div class="grille2"><div class="champ"><label for="rc-date">Date</label><input id="rc-date" name="date" type="date" value="${iso()}" required></div>
      <div class="champ"><label for="rc-f">Fournisseur</label><input id="rc-f" name="fournisseur" maxlength="200" list="rc-fl"><datalist id="rc-fl">${[...new Set(arts.map((a) => a.fournisseur).filter(Boolean))].map((x) => `<option value="${esc(x)}">`).join('')}</datalist></div>
      <div class="champ"><label for="rc-ref">N° BL / facture du fournisseur</label><input id="rc-ref" name="ref" maxlength="80"></div>
      <div class="champ"><label for="rc-note">Note</label><input id="rc-note" name="note" maxlength="500"></div></div>
    <p class="mute small">Tissu : <b>une ligne par rouleau</b> (n° de rouleau ou de lot obligatoire). Les autres matières : une ligne par article.</p>
    <div style="overflow:auto"><table class="nombres"><thead><tr><th>Article</th><th>Quantité</th><th>Rouleau</th><th>N° lot</th><th>Bain</th><th>Emplacement</th>${coutOk ? '<th>Coût unit. HT</th>' : ''}<th></th></tr></thead><tbody id="rc-l"></tbody></table></div>
    <button type="button" class="btn ghost sm" id="rc-plus">+ Ligne</button>
    <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Annuler</button><button class="btn" value="ok">Enregistrer la réception</button></div>`, async (f) => {
    lire(f);
    const L = lignes.filter((l) => l.article_id).map((l) => {
      const o = { article_id: +l.article_id, qte: Number(String(l.qte).replace(',', '.')) };
      for (const k of ['n_lot', 'bain', 'rouleau', 'emplacement']) if (l[k].trim()) o[k] = l[k].trim();
      if (coutOk && String(l.cout_unitaire).trim() !== '') o.cout_unitaire = Number(String(l.cout_unitaire).replace(',', '.'));
      return o;
    });
    if (!L.length) throw new Error('Ajoutez au moins une ligne.');
    const r = await api('POST', '/api/stocks/mp/receptions', { date: f.date.value, fournisseur: f.fournisseur.value.trim(), ref_fournisseur: f.ref.value.trim(), note: f.note.value.trim(), lignes: L });
    toast(`Réception ${r.numero} enregistrée (${r.lots.length} lot(s)).`); route(); return true;
  });
  const f = $('#fen-form');
  const lire = () => { f.querySelectorAll('#rc-l tr').forEach((tr) => { const l = lignes[+tr.dataset.i]; tr.querySelectorAll('[data-k]').forEach((x) => { l[x.dataset.k] = x.value; }); }); };
  const dess = () => { $('#rc-l', f).innerHTML = lignes.map(ligneHtml).join(''); f.querySelectorAll('#rc-l tr').forEach((tr) => { const l = lignes[+tr.dataset.i]; tr.querySelectorAll('[data-k]').forEach((x) => { x.value = l[x.dataset.k] ?? ''; }); }); };
  dess();
  $('#rc-plus', f).onclick = () => { lire(); const p = lignes[lignes.length - 1]; lignes.push({ ...p, qte: '', rouleau: '' }); dess(); };
  f.addEventListener('click', (e) => { const d = e.target.closest('[data-del]'); if (!d) return; lire(); lignes.splice(+d.dataset.del, 1); if (!lignes.length) lignes.push({ article_id: '', qte: '', n_lot: '', bain: '', rouleau: '', emplacement: '', cout_unitaire: '' }); dess(); });
}

/* ---------------------------------------------------------------- Stock MP : mouvements */
ECRANS.mouvementsMP = async (m) => {
  const [L, etat] = await Promise.all([api('GET', '/api/stocks/mp/mouvements'), api('GET', '/api/stocks/mp/etat')]);
  const val = voit('couts');
  const peutMvt = peut('stock_mp.sorties', 'creer') || peut('stock_mp.entrees', 'modifier') || peut('stock_mp.entrees', 'valider');
  m.innerHTML = entete('Mouvements de matières', 'Tout mouvement est conservé (aucune suppression) et tracé dans le journal. Une erreur se corrige par un mouvement inverse.',
    `<div class="row-f">${rechercheHtml('Article, rouleau, motif, document…')}<div class="champ" style="margin:0"><select id="filtre"><option value="">Tous types</option>${Object.entries(TYPES_MP).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      ${boutonsExport('mvmp', '/api/stocks/mp/mouvements', peut('stock_mp.entrees', 'exporter'))}${peutMvt ? '<button class="btn cta" data-m="nouveau">+ Mouvement</button>' : ''}</div>`) +
    `<div class="panneau" id="liste" style="overflow:auto"></div>`;
  const dess = () => {
    const q = $('#recherche').value.trim().toLowerCase(), f = $('#filtre').value;
    const l = L.filter((x) => (!f || x.type === f) && (!q || JSON.stringify([x.designation, x.rouleau, x.n_lot, x.motif, x.ref_doc, x.emplacement]).toLowerCase().includes(q))).slice(0, 500);
    $('#liste').innerHTML = l.length ? `<table class="nombres"><thead><tr><th>Date</th><th>Type</th><th>Article</th><th>Lot / rouleau</th><th class="n">Quantité</th>${val ? '<th class="n">Valeur</th>' : ''}<th>Motif / document</th><th>Par</th></tr></thead><tbody>
      ${l.map((x) => `<tr><td>${jour(x.date)}</td><td><span class="etiq">${esc(TYPES_MP[x.type] || x.type)}</span></td><td><b>${esc(x.designation)}</b></td><td class="small">${x.lot_id ? esc(lotLib(x)) : '—'}${x.emplacement ? `<div class="mute">${esc(x.emplacement)}</div>` : ''}</td>
        <td class="n">${signe(x.qte)} ${esc(x.unite || '')}</td>${val ? `<td class="n">${md(x.valeur)}</td>` : ''}<td class="small">${esc(x.motif || '')}${x.ref_doc ? `<div class="mono">${esc(x.ref_doc)}</div>` : ''}</td><td class="small">${esc(x.utilisateur || '')}</td></tr>`).join('')}</tbody></table>`
      : '<div class="vide">Aucun mouvement.</div>';
  };
  $('#recherche').oninput = dess; $('#filtre').onchange = dess; dess();
  m.onclick = async (e) => {
    if (!e.target.closest('[data-m=nouveau]')) return;
    const choix = etat.filter((a) => a.actif);
    if (!choix.length) return toast('Aucun article matière.', true);
    fenetre(`<h3>Nouveau mouvement — article</h3><div class="champ"><label for="mv-a">Article</label><select id="mv-a" name="a">${choix.map((a) => `<option value="${a.id}">${esc(a.designation)} · ${qteF(a.physique)} ${esc(a.unite)}</option>`).join('')}</select></div>
      <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Annuler</button><button class="btn" value="ok">Continuer</button></div>`, async (f) => {
      const a = choix.find((x) => x.id === +f.a.value);
      const lots = await api('GET', `/api/stocks/mp/articles/${a.id}/lots`);
      setTimeout(() => formMouvementMP(a, lots), 0); return true;
    });
  };
};

function formMouvementMP(a, lots) {
  const types = [['sortie', 'Sortie (vers l’atelier, échantillon…)', peut('stock_mp.sorties', 'creer')], ['retour', 'Retour en stock sur un lot', peut('stock_mp.sorties', 'creer')],
    ['transfert', 'Transfert d’emplacement', peut('stock_mp.entrees', 'modifier')], ['ajustement', 'Ajustement (+ ou −, justifié)', peut('stock_mp.entrees', 'valider')]].filter((t) => t[2]);
  if (!types.length) return toast('Vos droits ne permettent pas de mouvement de stock.', true);
  const tissu = estTissuF(a);
  fenetre(`<h3>${esc(a.designation)}</h3><div class="msg err" hidden role="alert"></div>
    <div class="champ"><label for="mv-t">Mouvement</label><select id="mv-t" name="type">${types.map((t) => `<option value="${t[0]}">${t[1]}</option>`).join('')}</select></div>
    <div class="champ"><label for="mv-l">Lot / rouleau</label><select id="mv-l" name="lot"><option value="">${tissu ? '— choisir le rouleau —' : 'FIFO automatique (le plus ancien d’abord)'}</option>${lots.map((l) => `<option value="${l.id}">${esc(lotLib(l))} · reste ${qteF(l.qte_restante)} ${esc(a.unite)}${l.emplacement ? ' · ' + esc(l.emplacement) : ''}</option>`).join('')}</select></div>
    <div class="champ"><label for="mv-q">Quantité (${esc(a.unite)})</label><input id="mv-q" name="qte" type="number" step="any" required><span class="aide">Ajustement : négatif pour retirer, positif pour ajouter. Transfert : vide = tout le lot.</span></div>
    <div class="champ" id="mv-e-c" hidden><label for="mv-e">Nouvel emplacement</label><input id="mv-e" name="empl" maxlength="80"></div>
    <div class="champ"><label for="mv-m">Motif / référence</label><input id="mv-m" name="motif" maxlength="300" placeholder="Ex. : coupe commande CMD-2026-0012"></div>
    <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Annuler</button><button class="btn" value="ok">Enregistrer</button></div>`, async (f) => {
    const type = f.type.value, body = { type, article_id: a.id };
    if (f.lot.value) body.lot_id = +f.lot.value;
    const q = f.qte.value.trim(); if (q !== '') body.qte = Number(q.replace(',', '.'));
    if (type === 'transfert') body.emplacement = f.empl.value.trim();
    if (f.motif.value.trim()) body.motif = f.motif.value.trim();
    const r = await api('POST', '/api/stocks/mp/mouvements', body);
    toast('Mouvement enregistré' + (r.valeur !== undefined && type === 'sortie' ? ` (valeur FIFO ${md(r.valeur)})` : '') + '.'); route(); return true;
  });
  const f = $('#fen-form'), maj = () => { $('#mv-e-c', f).hidden = f.type.value !== 'transfert'; f.qte.required = f.type.value !== 'transfert'; };
  f.type.onchange = maj; maj();
}

/* ---------------------------------------------------------------- Stock PF : état */
ECRANS.etatPF = async (m) => {
  const L = await api('GET', '/api/stocks/pf/etat');
  const val = voit('couts'), neg = L.filter((s) => s.negatif);
  m.innerHTML = entete('Stock produits finis', 'Par référence, taille et couleur. La validation d’un BL sort automatiquement les pièces des produits finis livrés ; si le stock ne suffit pas, le BL passe et le stock devient négatif (alerte inscrite au journal).',
    `<div class="row-f">${rechercheHtml('Référence, client, taille, couleur…')}<label class="chk-l" style="margin:0"><input type="checkbox" id="neg"> Négatifs seulement</label>${boutonsExport('pf', '/api/stocks/pf/etat', peut('stock_pf.stock', 'exporter'))}${peut('stock_pf.entrees', 'creer') ? '<button class="btn cta" data-p="nouveau">+ Entrée en stock</button>' : ''}</div>`) +
    `<div class="chiffres"><div class="chiffre"><b>${new Set(L.filter((s) => s.qte > 0).map((s) => s.produit_id)).size}</b><span>référence(s) en stock</span></div><div class="chiffre"><b>${qteF(L.reduce((s, x) => s + Math.max(0, x.qte), 0))}</b><span>pièces en stock</span></div>
      <div class="chiffre ${neg.length ? 'alerte' : ''}"><b>${neg.length}</b><span>ligne(s) en stock négatif (à régulariser)</span></div>${val ? `<div class="chiffre"><b>${md(L.reduce((s, x) => s + x.valeur, 0))}</b><span>valeur du stock (FIFO, au PRI)</span></div>` : ''}</div>
    <div class="panneau" id="liste" style="overflow:auto"></div>`;
  const dess = () => {
    const q = $('#recherche').value.trim().toLowerCase(), n = $('#neg').checked;
    const l = L.filter((s) => (!n || s.negatif) && (s.qte !== 0 || n) && (!q || JSON.stringify([s.reference, s.article, s.client_nom, s.taille, s.couleur, s.emplacement]).toLowerCase().includes(q)));
    $('#liste').innerHTML = l.length ? `<table class="nombres"><thead><tr><th>Référence</th><th>Article</th><th>Client</th><th>Couleur</th><th>Taille</th><th class="n">Quantité</th><th>Emplacement</th>${val ? '<th class="n">Valeur</th>' : ''}<th></th></tr></thead><tbody>
      ${l.map((s, i) => `<tr><td class="mono small"><b>${esc(s.reference)}</b></td><td>${esc(s.article || s.code_article)}</td><td class="small">${esc(s.client_nom || '—')}</td><td>${esc(s.couleur || '—')}</td><td>${esc(s.taille || '—')}</td>
        <td class="n ${s.negatif ? 'rouge' : ''}"><b>${qteF(s.qte)}</b>${s.negatif ? ' <span class="badge ret">négatif</span>' : ''}</td><td class="small">${esc(s.emplacement || '—')}</td>${val ? `<td class="n">${md(s.valeur)}</td>` : ''}
        <td>${peut('stock_pf.stock', 'modifier') || peut('stock_pf.sorties', 'creer') ? `<button class="btn ghost sm" data-p="mvt" data-i="${L.indexOf(s)}">Mouvement</button>` : ''}</td></tr>`).join('')}</tbody></table>`
      : `<div class="vide">${L.length ? 'Rien pour ce filtre.' : 'Aucun produit fini en stock. Les livraisons (BL) et les entrées manuelles alimentent ce tableau.'}</div>`;
  };
  $('#recherche').oninput = dess; $('#neg').onchange = dess; dess();
  m.onclick = async (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    if (b.dataset.p === 'nouveau') return formMouvementPF(null);
    formMouvementPF(L[+b.dataset.i]);
  };
};

async function formMouvementPF(s) {
  const types = [['entree_manuelle', 'Entrée en stock (production hors OF, stock initial)', peut('stock_pf.entrees', 'creer')], ['retour_client', 'Retour client', peut('stock_pf.entrees', 'creer')],
    ['sortie', 'Sortie (échantillon, don, rebut…)', peut('stock_pf.sorties', 'creer')], ['ajustement', 'Ajustement (+ ou −, justifié)', peut('stock_pf.stock', 'modifier')]].filter((t) => t[2]);
  if (!types.length) return toast('Vos droits ne permettent pas de mouvement de stock.', true);
  const P = s ? [] : await api('GET', '/api/produits').catch(() => []);
  fenetre(`<h3>${s ? esc(s.reference) + ' · ' + esc([s.couleur, s.taille].filter(Boolean).join(' · ')) : 'Mouvement de produit fini'}</h3><div class="msg err" hidden role="alert"></div>
    <div class="champ"><label for="mp-t">Mouvement</label><select id="mp-t" name="type">${types.map((t) => `<option value="${t[0]}">${t[1]}</option>`).join('')}</select></div>
    ${s ? '' : `<div class="champ"><label for="mp-r">Référence produit fini</label><input id="mp-r" name="ref" required maxlength="30" list="mp-rl" placeholder="P00126H" style="text-transform:uppercase"><datalist id="mp-rl">${P.map((p) => `<option value="${esc(p.reference)}">${esc(p.code_article)}${p.client_nom ? ' · ' + esc(p.client_nom) : ''}</option>`).join('')}</datalist></div>
      <div class="grille2"><div class="champ"><label for="mp-c">Couleur</label><input id="mp-c" name="couleur" maxlength="60"></div><div class="champ"><label for="mp-ta">Taille</label><input id="mp-ta" name="taille" maxlength="30"></div></div>`}
    <div class="champ"><label for="mp-q">Quantité (pièces)</label><input id="mp-q" name="qte" type="number" step="1" required><span class="aide">Ajustement : négatif pour retirer.</span></div>
    <div class="champ"><label for="mp-e">Emplacement (facultatif)</label><input id="mp-e" name="empl" maxlength="80" value="${esc(s?.emplacement || '')}"></div>
    <div class="champ"><label for="mp-m">Motif</label><input id="mp-m" name="motif" maxlength="300" placeholder="Obligatoire pour un ajustement ou un retour client"></div>
    <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Annuler</button><button class="btn" value="ok">Enregistrer</button></div>`, async (f) => {
    const body = { type: f.type.value, qte: Number(f.qte.value.replace(',', '.')) };
    if (s) Object.assign(body, { produit_id: s.produit_id, taille: s.taille, couleur: s.couleur }); else Object.assign(body, { reference: f.ref.value.trim().toUpperCase(), taille: f.taille.value.trim(), couleur: f.couleur.value.trim() });
    if (f.empl.value.trim() || s?.emplacement) body.emplacement = f.empl.value.trim();
    if (f.motif.value.trim()) body.motif = f.motif.value.trim();
    await api('POST', '/api/stocks/pf/mouvements', body); toast('Mouvement enregistré.'); route(); return true;
  });
}

ECRANS.mouvementsPF = async (m) => {
  const L = await api('GET', '/api/stocks/pf/mouvements');
  const val = voit('couts');
  m.innerHTML = entete('Mouvements de produits finis', 'Livraisons (BL) automatiques, entrées, retours, ajustements et inventaires. Les lignes en rouge ont rendu le stock négatif.',
    `<div class="row-f">${rechercheHtml('Référence, BL, motif…')}<div class="champ" style="margin:0"><select id="filtre"><option value="">Tous types</option>${Object.entries(TYPES_PF).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>${boutonsExport('mvpf', '/api/stocks/pf/mouvements', peut('stock_pf.stock', 'exporter'))}</div>`) +
    `<div class="panneau" id="liste" style="overflow:auto"></div>`;
  const dess = () => {
    const q = $('#recherche').value.trim().toLowerCase(), f = $('#filtre').value;
    const l = L.filter((x) => (!f || x.type === f) && (!q || JSON.stringify([x.reference, x.ref_num, x.motif, x.taille, x.couleur]).toLowerCase().includes(q))).slice(0, 500);
    $('#liste').innerHTML = l.length ? `<table class="nombres"><thead><tr><th>Date</th><th>Type</th><th>Référence</th><th>Couleur · taille</th><th class="n">Quantité</th>${val ? '<th class="n">Valeur</th>' : ''}<th>Document / motif</th><th>Par</th></tr></thead><tbody>
      ${l.map((x) => `<tr><td>${jour(x.date)}</td><td><span class="etiq">${esc(TYPES_PF[x.type] || x.type)}</span>${x.alerte_negatif ? ' <span class="badge ret">stock négatif</span>' : ''}</td><td class="mono small"><b>${esc(x.reference)}</b></td><td>${esc([x.couleur, x.taille].filter(Boolean).join(' · ') || '—')}</td>
        <td class="n">${signe(x.qte)}</td>${val ? `<td class="n">${md(x.valeur)}</td>` : ''}<td class="small">${x.ref_num ? `<span class="mono">${esc(x.ref_num)}</span> ` : ''}${esc(x.motif || '')}</td><td class="small">${esc(x.utilisateur || '')}</td></tr>`).join('')}</tbody></table>`
      : '<div class="vide">Aucun mouvement.</div>';
  };
  $('#recherche').oninput = dess; $('#filtre').onchange = dess; dess();
};

/* ---------------------------------------------------------------- Inventaires (MP et PF) */
ECRANS.inventaires = async (m, d) => {
  const stock = d.stock, droit = stock === 'mp' ? 'stock_mp.inventaires' : 'stock_pf.inventaires';
  const L = (await api('GET', '/api/stocks/inventaires')).filter((i) => i.stock === stock);
  const ST_I = { brouillon: ['En cours', 'fut'], valide: ['Validé', 'vig'], annule: ['Abandonné', 'anc'] };
  m.innerHTML = entete(`Inventaires — ${stock === 'mp' ? 'matières premières' : 'produits finis'}`, `Périodique (tout le stock) ou tournant (une sélection). On compte, on saisit, puis on valide : chaque écart doit être justifié et devient un mouvement « Inventaire » au coût FIFO. ${stock === 'mp' ? 'Les matières se comptent lot par lot (rouleau par rouleau pour le tissu).' : 'Les produits finis se comptent par taille et couleur.'}`,
    peut(droit, 'creer') ? '<button class="btn cta" data-i="nouveau">+ Inventaire</button>' : '') +
    `<div class="panneau" style="overflow:auto">${L.length ? `<table class="nombres"><thead><tr><th>N°</th><th>Date</th><th>Type</th><th class="n">Lignes comptées</th><th>Par</th><th>État</th></tr></thead><tbody>
      ${L.map((i) => `<tr class="cliquable" data-id="${i.id}"><td class="mono small"><b>${esc(i.numero)}</b></td><td>${jour(i.date)}</td><td>${i.type === 'tournant' ? 'Tournant' : 'Périodique'}</td><td class="n">${i.nb_comptes} / ${i.nb_lignes}</td><td class="small">${esc(i.cree_par || '')}</td><td><span class="badge ${ST_I[i.statut][1]}">${ST_I[i.statut][0]}</span></td></tr>`).join('')}</tbody></table>`
      : '<div class="vide">Aucun inventaire pour l’instant.</div>'}</div>`;
  m.onclick = async (e) => {
    if (e.target.closest('[data-i=nouveau]')) {
      const choix = stock === 'mp' ? (await api('GET', '/api/stocks/mp/etat')).filter((a) => a.physique > 0).map((a) => [a.id, a.designation]) : [...new Map((await api('GET', '/api/stocks/pf/etat')).filter((s) => s.qte !== 0).map((s) => [s.produit_id, s.reference])).entries()];
      return fenetre(`<h3>Nouvel inventaire</h3><div class="msg err" hidden role="alert"></div>
        <div class="grille2"><div class="champ"><label for="in-d">Date</label><input id="in-d" name="date" type="date" value="${iso()}"></div>
        <div class="champ"><label for="in-t">Type</label><select id="in-t" name="type"><option value="periodique">Périodique (tout le stock)</option><option value="tournant">Tournant (sélection)</option></select></div></div>
        <div class="champ" id="in-sel" hidden><label>${stock === 'mp' ? 'Articles' : 'Références'} à compter</label><div style="max-height:220px;overflow:auto">${choix.map(([id, n]) => `<label class="chk-l"><input type="checkbox" name="sel" value="${id}"> ${esc(n)}</label>`).join('') || '<p class="mute">Aucun stock.</p>'}</div></div>
        <div class="champ"><label for="in-n">Note</label><input id="in-n" name="note" maxlength="500"></div>
        <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Annuler</button><button class="btn" value="ok">Ouvrir l’inventaire</button></div>`, async (f) => {
        const body = { stock, type: f.type.value, date: f.date.value, note: f.note.value.trim() };
        if (body.type === 'tournant') body.filtre = [...f.querySelectorAll('input[name=sel]:checked')].map((x) => +x.value);
        const r = await api('POST', '/api/stocks/inventaires', body); toast(`Inventaire ${r.numero} ouvert (${r.lignes} ligne(s) à compter).`);
        setTimeout(() => ouvrirInventaire(r.id), 0); return true;
      }) || (() => { const f = $('#fen-form'); f.type.onchange = () => { $('#in-sel', f).hidden = f.type.value !== 'tournant'; }; })();
    }
    const tr = e.target.closest('tr[data-id]'); if (tr) ouvrirInventaire(+tr.dataset.id);
  };
};

async function ouvrirInventaire(id) {
  const i = await api('GET', `/api/stocks/inventaires/${id}`);
  const droit = i.stock === 'mp' ? 'stock_mp.inventaires' : 'stock_pf.inventaires';
  const ed = i.statut === 'brouillon' && peut(droit, 'modifier'), val = voit('couts') && i.statut === 'valide';
  const lib = (l) => i.stock === 'mp' ? `<b>${esc(l.designation)}</b><div class="mute small">${esc(lotLib(l))}${l.emplacement ? ' · ' + esc(l.emplacement) : ''}</div>` : `<b class="mono">${esc(l.reference)}</b><div class="mute small">${esc([l.couleur, l.taille].filter(Boolean).join(' · ') || '—')}</div>`;
  grandeFenetre(`<h3>Inventaire ${esc(i.numero)} · ${i.stock === 'mp' ? 'matières' : 'produits finis'}</h3><div class="msg err" hidden role="alert"></div>
    <p class="mute small">${i.type === 'tournant' ? 'Tournant' : 'Périodique'} du ${jour(i.date)} · ouvert par ${esc(i.cree_par || '')}${i.valide_par ? ` · validé par ${esc(i.valide_par)} le ${jour(i.valide_le)}` : ''}. ${ed ? 'Saisissez la quantité comptée (0 si rien trouvé) ; justifiez chaque écart.' : ''}</p>
    <div style="overflow:auto;max-height:55vh"><table class="nombres"><thead><tr><th>Ligne</th><th class="n">Théorique</th><th class="n">Compté</th><th class="n">Écart</th><th>Justification</th>${val ? '<th class="n">Valeur écart</th>' : ''}</tr></thead><tbody>
      ${i.lignes.map((l, k) => { const ec = l.ecart ?? (l.compte == null ? null : r3(l.compte - l.theorique)); return `<tr data-k="${k}"><td>${lib(l)}</td><td class="n">${qteF(l.stock_validation ?? l.theorique)}</td>
        <td class="n">${ed ? `<input data-c="${k}" type="number" step="any" min="0" value="${l.compte ?? ''}" style="width:90px">` : qteF(l.compte)}</td><td class="n" data-e="${k}">${ec == null ? '—' : signe(ec)}</td>
        <td>${ed ? `<input data-j="${k}" maxlength="300" value="${esc(l.justification || '')}" placeholder="si écart">` : esc(l.justification || '')}</td>${val ? `<td class="n">${l.valeur_ecart ? md(l.valeur_ecart) : '—'}</td>` : ''}</tr>`; }).join('')}</tbody></table></div>
    <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Fermer</button>
      ${i.statut === 'brouillon' && peut(droit, 'creer') ? '<button class="btn danger" type="button" data-inv="abandon">Abandonner</button>' : ''}
      ${ed ? '<button class="btn ghost" type="button" data-inv="enr">Enregistrer le comptage</button>' : ''}${i.statut === 'brouillon' && peut(droit, 'valider') ? '<button class="btn" value="ok">Valider l’inventaire</button>' : ''}</div>`, async (f) => {
    let v = i.version;
    if (ed) v = (await enregistrer(f)).version;
    const r = await api('POST', `/api/stocks/inventaires/${i.id}/valider`, { version: v });
    toast(`Inventaire validé : ${r.ecarts} écart(s) passé(s) en stock${r.valeur_ecart !== undefined ? ` (${md(r.valeur_ecart)})` : ''}.`); route(); return true;
  });
  const f = $('#fen-form');
  const enregistrer = async () => {
    const lignes = i.lignes.map((l, k) => { const c = f.querySelector(`[data-c="${k}"]`).value.trim(); return { index: k, compte: c === '' ? null : Number(c.replace(',', '.')), justification: f.querySelector(`[data-j="${k}"]`).value.trim() }; });
    const r = await api('PUT', `/api/stocks/inventaires/${i.id}`, { version: i.version, lignes }); i.version = r.version; return r;
  };
  f.addEventListener('input', (e) => { const k = e.target.dataset.c; if (k === undefined) return; const l = i.lignes[+k], c = e.target.value.trim(); f.querySelector(`[data-e="${k}"]`).innerHTML = c === '' ? '—' : signe(r3(Number(c.replace(',', '.')) - l.theorique)); });
  f.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-inv]'); if (!b) return;
    try {
      if (b.dataset.inv === 'enr') { await enregistrer(); toast('Comptage enregistré.'); }
      if (b.dataset.inv === 'abandon' && confirm('Abandonner cet inventaire ? Aucun stock ne sera modifié.')) { await api('POST', `/api/stocks/inventaires/${i.id}/annuler`); $('#fen').close(); toast('Inventaire abandonné.'); route(); }
    } catch (x) { toast(x.message, true); }
  });
}

/* ---------------------------------------------------------------- Compta générale : valorisation (remplace l'écran CMUP provisoire) */
ECRANS.valorisation = async (m) => {
  if (exigeVis(m, 'Valorisation des stocks', ['couts'])) return;
  const [mp, pf, P, achats] = await Promise.all([api('GET', '/api/stocks/mp/etat').catch(() => []), api('GET', '/api/stocks/pf/etat').catch(() => []), api('GET', '/api/stocks/parametres').catch(() => ({})), api('GET', '/api/compta/valorisation').catch(() => ({ articles: [] }))]);
  const vmp = mp.reduce((s, a) => s + (a.valeur || 0), 0), vpf = pf.reduce((s, x) => s + (x.valeur || 0), 0);
  m.innerHTML = entete('Valorisation des stocks', `Méthode : <b>${esc(P.methode_valorisation?.valeur || 'FIFO')}</b> — ${esc(P.methode_valorisation?.commentaire || '')}. Matières au coût d’achat des lots restants ; produits finis au prix de revient (PRI) de leur entrée.`) +
    `<div class="chiffres"><div class="chiffre"><b>${md(vmp)}</b><span>matières premières</span></div><div class="chiffre"><b>${md(vpf)}</b><span>produits finis</span></div><div class="chiffre"><b>${md(vmp + vpf)}</b><span>total des stocks</span></div></div>
    <h3 class="titre-bloc">Matières premières</h3><div class="panneau" style="overflow:auto">${mp.filter((a) => a.physique).length ? `<table class="nombres"><thead><tr><th>Article</th><th class="n">Quantité</th><th class="n">Coût moyen des lots</th><th class="n">Valeur FIFO</th></tr></thead><tbody>
      ${mp.filter((a) => a.physique).map((a) => `<tr><td><b>${esc(a.designation)}</b></td><td class="n">${qteF(a.physique)} ${esc(a.unite)}</td><td class="n">${dt(a.cout_moyen)}</td><td class="n"><b>${md(a.valeur)}</b></td></tr>`).join('')}</tbody></table>` : '<div class="vide">Aucune matière en stock.</div>'}</div>
    <h3 class="titre-bloc">Produits finis</h3><div class="panneau" style="overflow:auto">${pf.filter((x) => x.qte).length ? `<table class="nombres"><thead><tr><th>Référence</th><th>Couleur · taille</th><th class="n">Quantité</th><th class="n">Valeur FIFO</th></tr></thead><tbody>
      ${pf.filter((x) => x.qte).map((x) => `<tr><td class="mono small"><b>${esc(x.reference)}</b></td><td>${esc([x.couleur, x.taille].filter(Boolean).join(' · ') || '—')}</td><td class="n ${x.negatif ? 'rouge' : ''}">${qteF(x.qte)}</td><td class="n">${md(x.valeur)}</td></tr>`).join('')}</tbody></table>` : '<div class="vide">Aucun produit fini en stock.</div>'}</div>
    ${achats.articles.length ? `<h3 class="titre-bloc">Pour mémoire : coût moyen des factures d’achat (CMUP)</h3><div class="panneau" style="overflow:auto"><table class="nombres"><thead><tr><th>Désignation (factures d’achat)</th><th>Devise</th><th class="n">Quantité achetée</th><th class="n">CMUP</th></tr></thead><tbody>
      ${achats.articles.map((a) => `<tr><td>${esc(a.designation)}</td><td>${a.devise}</td><td class="n">${a.quantite.toLocaleString('fr-FR')}</td><td class="n">${md(a.cmup, a.devise)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <p class="mute small">Écritures comptables de variation de stock : non générées dans cette version (comptes et méthode à valider avec le comptable).</p>`;
};
