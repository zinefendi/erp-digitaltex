'use strict';
/* ERP DIGITAL-TEX — lot 0.11.0 « Production » : ordres de fabrication en 3 parties (coupe, marquage,
   assemblage et finition), calcul des besoins, BOM et gammes versionnées (CDC §4.6 et §4.7).
   Chargé après erp-coquille.js (helpers : api, toast, peut, voit, fenetre, grandeFenetre, esc, $, md,
   dt, r3, jour, iso, entete, rechercheHtml, route, ECRANS, boutonsExport).
   Aucun prix n'apparaît ici : le serveur n'envoie jamais les montants avec un OF. */

// qteF est déclaré dans erp-stocks.js (chargé avant) : une 2e déclaration bloquait tout ce script (corrigé en 0.13.0).
const NOM_PARTIE = { 1: 'Coupe', 2: 'Marquage', 3: 'Assemblage et finition' };
const ETAT_PARTIE = { en_attente: ['En attente', 'fut'], en_cours: ['En cours', 'vig'], validee: ['Validée', 'vig'], sans_objet: ['Sans objet', 'anc'] };
const STATUT_OF = { cree: ['Créé', 'fut'], en_cours: ['En cours', 'vig'], termine: ['Terminé', 'vig'], annule: ['Annulé', 'anc'] };
const badge = (dico, k) => { const e = dico[k] || [k, 'anc']; return `<span class="badge ${e[1]}">${e[0]}</span>`; };
const cumulDe = (partie) => new Map((partie.qtes_validees || []).map((t) => [JSON.stringify([t.taille, t.couleur]), +t.qte || 0]));

async function chargerCommandes() {
  for (const u of ['/api/metier/orders', '/api/metier/documents?collection=orders']) {
    try { const r = await api('GET', u); if (Array.isArray(r)) return r; if (r && Array.isArray(r.documents)) return r.documents; } catch (e) { /* essai suivant */ }
  }
  return [];
}

/* ---------------------------------------------------------------- Ordres de fabrication */
ECRANS.of = async (m) => {
  const L = await api('GET', '/api/prod/of');
  m.innerHTML = entete('Ordres de fabrication', 'Un OF part d’une commande client validée. Les 3 parties se valident dans l’ordre : <b>coupe</b> (sortie des matières du stock), <b>marquage</b> (sans objet si le produit n’a pas de marquage), <b>assemblage et finition</b> (entrée des produits finis en stock). Validation partielle possible : le reste reste en cours.',
    `<div class="row-f">${rechercheHtml('N°, client, produit…')}<div class="champ" style="margin:0"><select id="filtre"><option value="">Tous</option>${Object.entries(STATUT_OF).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select></div>
      ${peut('production.of', 'creer') ? '<button class="btn cta" data-r="nouveau">+ Ordre de fabrication</button>' : ''}</div>`) +
    `<div class="chiffres"><div class="chiffre"><b>${L.filter((o) => o.statut === 'en_cours').length}</b><span>OF en cours</span></div><div class="chiffre"><b>${L.filter((o) => o.statut === 'termine').length}</b><span>OF terminés</span></div>
      <div class="chiffre"><b>${qteF(L.filter((o) => o.statut !== 'annule').reduce((s, o) => s + o.pieces, 0))}</b><span>pièces engagées</span></div></div>
    <div class="panneau" id="liste" style="overflow:auto"></div>`;
  const dess = () => {
    const q = $('#recherche').value.trim().toLowerCase(), f = $('#filtre').value;
    const l = L.filter((o) => (!f || o.statut === f) && (!q || JSON.stringify([o.numero, o.client_nom, o.reference, o.commande_numero]).toLowerCase().includes(q)));
    $('#liste').innerHTML = l.length ? `<table class="nombres"><thead><tr><th>N° OF</th><th>Lancement</th><th>Livraison</th><th>Commande</th><th>Client</th><th>Produit</th><th class="n">Pièces</th><th>1 · 2 · 3</th><th>État</th></tr></thead><tbody>
      ${l.map((o) => `<tr class="cliquable" data-id="${o.id}"><td class="mono small"><b>${esc(o.numero)}</b></td><td>${jour(o.date_lancement)}</td><td>${o.date_livraison ? jour(o.date_livraison) : '—'}</td>
        <td class="mono small">${esc(o.commande_numero || '—')}</td><td>${esc(o.client_nom || '—')}</td><td class="mono small">${esc(o.reference)}</td><td class="n">${qteF(o.pieces)}</td>
        <td class="small">${o.parties.map((p) => badge(ETAT_PARTIE, p.etat).replace('En attente', '·').replace('En cours', '→').replace('Validée', '✓').replace('Sans objet', '—')).join(' ')}</td>
        <td>${badge(STATUT_OF, o.statut)}</td></tr>`).join('')}</tbody></table>`
      : `<div class="vide">${L.length ? 'Aucun OF pour ce filtre.' : 'Aucun ordre de fabrication. Créez-en un depuis une commande validée, ou consultez le Calcul des besoins.'}</div>`;
  };
  $('#recherche').oninput = dess; $('#filtre').onchange = dess; dess();
  m.onclick = (e) => {
    if (e.target.closest('[data-r=nouveau]')) return formOF();
    const tr = e.target.closest('tr[data-id]'); if (tr) ouvrirOF(L.find((o) => o.id === +tr.dataset.id).id);
  };
};

async function formOF(pre) {
  const [commandes, produits] = await Promise.all([chargerCommandes(), api('GET', '/api/produits').catch(() => [])]);
  const cmds = commandes.filter((c) => !['annule', 'annulee'].includes((c.status || c.donnees?.status || '') + ''));
  if (!cmds.length) return toast('Aucune commande disponible : un OF part d’une commande client validée.', true);
  fenetre(`<h3>Nouvel ordre de fabrication</h3><div class="msg err" hidden role="alert"></div>
    <div class="champ"><label for="of-c">Commande client *</label><select id="of-c" name="commande" required>${cmds.map((c) => { const d = c.donnees || c; return `<option value="${esc(c.id ?? d.id)}">${esc(d.number || c.number || c.id)} — ${esc(d.clientName || d.client?.name || c.clientName || 'client ?')}${d.date ? ' · ' + jour(d.date) : ''}</option>`; }).join('')}</select></div>
    <div class="champ"><label for="of-p">Produit fini *</label><select id="of-p" name="produit" required><option value="">— produit —</option>${produits.map((p) => `<option value="${p.id}" data-taillant="${esc(JSON.stringify(p.taillant || []))}">${esc(p.reference)} — ${esc(p.code_article)}${p.client_nom ? ' · ' + esc(p.client_nom) : ''}</option>`).join('')}</select><span class="aide">Tailles proposées d’après le taillant du produit.</span></div>
    <div class="champ"><label for="of-l">Date de livraison promise</label><input id="of-l" name="livraison" type="date"></div>
    <div class="champ"><label for="of-n">Remarques</label><input id="of-n" name="remarques" maxlength="500"></div>
    <div id="of-tc"><p class="mute small">Choisissez un produit pour saisir les quantités par taille et couleur.</p></div>
    <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Annuler</button><button class="btn" value="ok">Lancer l’OF</button></div>`, async (f) => {
    const tc = [...f.querySelectorAll('[data-tc]')].map((x) => ({ taille: x.dataset.taille, couleur: x.dataset.couleur, qte: Number(String(x.value).replace(',', '.')) || 0 })).filter((x) => x.qte > 0);
    if (!f.produit.value) throw new Error('Choisissez le produit fini.');
    if (!tc.length) throw new Error('Saisissez au moins une quantité (taille, couleur).');
    const body = { commande_id: f.commande.value, produit_id: +f.produit.value, tailles_couleurs: tc };
    if (f.livraison.value) body.date_livraison = f.livraison.value;
    if (f.remarques.value.trim()) body.remarques = f.remarques.value.trim();
    const r = await api('POST', '/api/prod/of', body);
    toast(`OF ${r.numero} créé — matières réservées d’après la BOM.`); setTimeout(() => ouvrirOF(r.id), 0); return true;
  });
  const f = $('#fen-form');
  const dessTC = () => {
    const o = f.produit.selectedOptions[0], taillant = o && o.value ? JSON.parse(o.dataset.taillant || '[]') : [];
    $('#of-tc', f).innerHTML = !o?.value ? '<p class="mute small">Choisissez un produit pour saisir les quantités par taille et couleur.</p>'
      : `<div style="overflow:auto"><table class="nombres"><thead><tr><th>Taille</th><th>Couleur du tissu / modèle</th><th class="n">Quantité</th></tr></thead><tbody>
        ${(taillant.length ? taillant : ['']).map((t) => `<tr><td><b>${esc(t || '—')}</b></td><td><input data-tc data-taille="${esc(t)}" data-couleur="" maxlength="60" placeholder="couleur (ex. Blanc)"></td><td><input data-tc data-taille="${esc(t)}" data-couleur="" class="qte-tc" type="number" step="1" min="0" style="width:90px"></td></tr>`).join('')}</tbody></table></div>
        <p class="mute small">Une ligne par taille ; une couleur différente = une nouvelle ligne (dupliquez en changeant la couleur).</p>`;
  };
  f.produit.onchange = dessTC; dessTC();
  f.addEventListener('input', (e) => { // la couleur saisie porte sur la ligne (taille + couleur)
    if (e.target.matches('input[data-tc]:not(.qte-tc)')) { const tr = e.target.closest('tr'); tr.querySelector('.qte-tc').dataset.couleur = e.target.value.trim(); e.target.dataset.couleur = e.target.value.trim(); }
  });
}

async function ouvrirOF(id) {
  const of = await api('GET', `/api/prod/of/${id}`);
  const party = (n) => of.parties.find((p) => p.partie === n);
  const prochaine = [1, 2, 3].find((n) => ['en_attente', 'en_cours'].includes(party(n).etat) && of.parties.filter((p) => p.partie < n).every((p) => ['validee', 'sans_objet'].includes(p.etat)));
  const peutValider = prochaine && of.statut !== 'annule' && peut('production.etapes', 'valider');
  const qtesTxt = (l) => (l || []).map((q) => `${esc(q.taille || '—')} ${esc(q.couleur || '')} : <b>${qteF(q.qte)}</b>`).join(' · ') || '—';
  grandeFenetre(`<h3>${esc(of.numero)} · ${esc(of.reference)} ${esc(of.article || '')} ${badge(STATUT_OF, of.statut)}${of.fiche_modifiee ? ' <span class="badge ret" title="La fiche du produit a changé après le lancement : cet OF garde sa version.">fiche modifiée</span>' : ''}</h3>
    <div class="msg err" hidden role="alert"></div>
    <div class="grille2"><p class="small">Commande <b class="mono">${esc(of.commande_numero || '—')}</b> · client <b>${esc(of.client_nom || '—')}</b><br>Lancement <b>${jour(of.date_lancement)}</b> · livraison promise <b>${of.date_livraison ? jour(of.date_livraison) : '—'}</b> · <b>${qteF(of.parties.reduce((s, p) => s + (p.qtes_validees || []).reduce((x, q) => x + q.qte, 0), 0) || of.tailles_couleurs.reduce((s, t) => s + t.qte, 0))}</b> pièce(s)<br>Par ${esc(of.cree_par_nom || '')} le ${jour(of.cree_le)}</p>
      <p class="small">Quantités : ${of.tailles_couleurs.map((t) => `${esc(t.taille || '—')} ${esc(t.couleur || '')} : <b>${qteF(t.qte)}</b>`).join(' · ')}</p></div>
    <h3 class="titre-bloc">Les 3 parties</h3>
    <table class="nombres"><thead><tr><th>Partie</th><th>État</th><th>Validé à ce jour</th></tr></thead><tbody>
      ${of.parties.map((p) => `<tr><td><b>${NOM_PARTIE[p.partie]}</b></td><td>${badge(ETAT_PARTIE, p.etat)}</td><td class="small">${qtesTxt(p.qtes_validees)}</td></tr>`).join('')}</tbody></table>
    <h3 class="titre-bloc">Validations (aucune suppression : une erreur s’annule avec motif)</h3>
    <div style="max-height:22vh;overflow:auto"><table class="nombres"><thead><tr><th>Date</th><th>Partie</th><th>Quantités</th><th>Par</th><th>Remarques</th><th></th></tr></thead><tbody>
      ${of.validations.map((v) => `<tr><td>${jour(v.date)}</td><td>${NOM_PARTIE[v.partie]}</td><td class="small">${qtesTxt(v.qtes)}</td><td class="small">${esc(v.utilisateur || '')}</td><td class="small">${esc(v.remarques || '')}${v.photo_nom ? `<div class="mute small">📷 ${esc(v.photo_nom)}</div>` : ''}</td>
        <td>${v.annule ? `<span class="badge anc" title="${esc(v.motif)}">Annulée</span>` : (peut('production.etapes', 'annuler') && of.statut !== 'annule' ? `<button class="btn ghost sm" data-v="${v.id}">Annuler</button>` : '')}</td></tr>`).join('') || '<tr><td colspan="6" class="mute">Aucune validation encore.</td></tr>'}</tbody></table></div>
    <details><summary class="small">Fiche technique (figée au lancement — sans prix)</summary>
      <div class="grille2"><div>${of.fiche.illustration ? `<img src="${esc(of.fiche.illustration)}" alt="illustration" style="max-width:100%">` : '<p class="mute small">Pas d’illustration.</p>'}</div>
        <div class="small"><p><b>Marquages :</b> ${of.fiche.marquages.length ? of.fiche.marquages.map((x) => esc(x.libelle || x.type)).join(', ') : 'aucun'}</p>
          <p><b>BOM :</b> ${of.fiche.bom.length ? of.fiche.bom.map((x) => `${esc(x.designation)} × ${qteF(x.qte)}`).join(' · ') : '—'}</p>
          <p><b>Gamme :</b> ${of.fiche.gamme.length ? of.fiche.gamme.map((x) => `${esc(x.operation)} (${qteF(x.temps_min)} min)`).join(' · ') : '—'}</p>
          <p><b>Matières réservées / consommées :</b> ${(of.besoins || []).filter((b) => b.article_id).map((b) => `${esc(b.designation)} ${qteF(b.qte_totale)} ${esc(b.unite)}`).join(' · ') || '—'}</p></div></div></details>
    <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Fermer</button>
      ${of.statut !== 'annule' && !of.validations.some((v) => !v.annule) && peut('production.of', 'annuler') ? '<button class="btn danger" type="button" data-of="annuler">Annuler l’OF</button>' : ''}
      ${peutValider ? `<button class="btn ghost" type="button" data-of="commencer">${party(prochaine).etat === 'en_attente' ? 'Commencer ' : ''}${NOM_PARTIE[prochaine]}</button>` : ''}
      ${peutValider ? `<button class="btn" value="ok">Valider ${NOM_PARTIE[prochaine]}</button>` : ''}</div>`, 
    peutValider ? async () => { setTimeout(() => formValiderPartie(of, prochaine), 0); return true; } : null);
  const f = $('#fen');
  f.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-of],[data-v]'); if (!b) return;
    if (b.dataset.v) {
      const v = of.validations.find((x) => x.id === +b.dataset.v);
      return fenetre(`<h3>Annuler la validation (${NOM_PARTIE[v.partie]})</h3><div class="msg err" hidden role="alert"></div>
        <p class="small">Les mouvements de stock correspondants (matières ou produits finis) sont passés en sens inverse, dans la même opération. Réservée aux responsables autorisés.</p>
        <div class="champ"><label for="vc-m">Motif *</label><input id="vc-m" name="motif" required minlength="3" maxlength="300"></div>
        <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Retour</button><button class="btn danger" value="ok">Annuler la validation</button></div>`, async (g) => {
        await api('POST', `/api/prod/of/${of.id}/validations/${v.id}/annuler`, { motif: g.motif.value.trim() }); toast('Validation annulée, stock corrigé.'); route(); return true;
      });
    }
    if (b.dataset.of === 'annuler') {
      return fenetre(`<h3>Annuler l’OF ${esc(of.numero)}</h3><div class="msg err" hidden role="alert"></div><p class="small">Possible seulement si aucune partie n’a été validée. Les réservations de matières sont libérées.</p>
        <div class="champ"><label for="oa-m">Motif *</label><input id="oa-m" name="motif" required minlength="3" maxlength="300"></div>
        <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Retour</button><button class="btn danger" value="ok">Annuler l’OF</button></div>`, async (g) => {
        await api('POST', `/api/prod/of/${of.id}/annuler`, { motif: g.motif.value.trim() }); toast('OF annulé.'); route(); return true;
      });
    }
    if (b.dataset.of === 'commencer') { await api('POST', `/api/prod/of/${of.id}/partie/${prochaine}/commencer`); toast(`${NOM_PARTIE[prochaine]} démarrée.`); route(); }
  });
}

async function formValiderPartie(of, n) {
  const of2 = await api('GET', `/api/prod/of/${of.id}`);
  const party = of2.parties.find((p) => p.partie === n);
  const cumul = cumulDe(party);
  const restes = of2.tailles_couleurs.map((t) => { const k = JSON.stringify([t.taille, t.couleur]); return { ...t, reste: r3(t.qte - (cumul.get(k) || 0)) }; }).filter((t) => t.reste > 0.0005);
  const besoinLignes = n === 1 ? (of2.besoins || []).filter((b) => b.article_id) : [];
  const piecesOF = of2.tailles_couleurs.reduce((s, t) => s + t.qte, 0) || 1;
  const lotsParArticle = {};
  for (const b of besoinLignes) lotsParArticle[b.article_id] = await api('GET', `/api/stocks/mp/articles/${b.article_id}/lots`).catch(() => []);
  grandeFenetre(`<h3>Valider — ${NOM_PARTIE[n]} · ${esc(of2.numero)}</h3><div class="msg err" hidden role="alert"></div>
    <p class="mute small">${n === 1 ? 'Saisissez les quantités coupées et le métrage réellement sorti (rouleau par rouleau pour le tissu). La sortie passe dans le stock dans la même opération.' : n === 2 ? 'Marquage terminé pour les quantités saisies.' : 'Contrôle qualité, repassage, pliage, emballage : les pièces validées entrent en stock produits finis au prix de revient.'}</p>
    <div style="overflow:auto"><table class="nombres"><thead><tr><th>Taille</th><th>Couleur</th><th class="n">Reste à valider</th><th class="n">Quantité validée maintenant</th></tr></thead><tbody>
      ${restes.map((t, i) => `<tr><td><b>${esc(t.taille || '—')}</b></td><td>${esc(t.couleur || '—')}</td><td class="n">${qteF(t.reste)}</td><td><input data-q="${i}" type="number" step="1" min="0" max="${t.reste}" value="${t.reste}" style="width:90px"></td></tr>`).join('')}</tbody></table></div>
    ${n === 1 && besoinLignes.length ? `<h3 class="titre-bloc">Matières consommées (prorata proposé, saisis le réel)</h3>
      <div style="overflow:auto"><table class="nombres"><thead><tr><th>Article</th><th class="n">Besoin restant</th><th>Rouleau / lot</th><th class="n">Quantité sortie</th></tr></thead><tbody>
        ${besoinLignes.map((b, j) => { const besoin = restes.reduce((s, t, i) => { const q = $(`[data-q="${i}"]`); return s; }, 0); return `<tr><td><b>${esc(b.designation)}</b>${b.unite ? ` <span class="mute small">(${esc(b.unite)})</span>` : ''}</td><td class="n" data-besoin="${b.article_id}">—</td>
          <td><select data-lot="${b.article_id}"><option value="">— ${/^tissu/i.test(b.famille || '') ? 'choisir le rouleau' : 'FIFO automatique'} —</option>${(lotsParArticle[b.article_id] || []).map((l) => `<option value="${l.id}">${esc(l.rouleau ? 'Rouleau ' + l.rouleau : l.n_lot || 'lot')}${l.bain ? ' · bain ' + esc(l.bain) : ''} · reste ${qteF(l.qte_restante)} ${esc(b.unite || '')}</option>`).join('')}</select></td>
          <td><input data-s="${b.article_id}" type="number" step="any" min="0" style="width:90px"></td></tr>`; }).join('')}</tbody></table></div>` : ''}
    <div class="champ"><label for="vp-r">Remarques</label><input id="vp-r" name="remarques" maxlength="500" placeholder="Qualité, rebuts, équipe…"></div>
    <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Retour</button><button class="btn" value="ok">Valider la partie</button></div>`, async (f) => {
    const qtes = restes.map((t, i) => ({ taille: t.taille, couleur: t.couleur, qte: Number(String(f.querySelector(`[data-q="${i}"]`).value).replace(',', '.')) || 0 })).filter((t) => t.qte > 0);
    if (!qtes.length) throw new Error('Saisissez au moins une quantité validée.');
    const body = { qtes, remarques: f.remarques.value.trim() };
    if (n === 1) {
      const sorties = besoinLignes.map((b) => ({ article_id: b.article_id, lot_id: +f.querySelector(`[data-lot="${b.article_id}"]`).value || null, qte: Number(String(f.querySelector(`[data-s="${b.article_id}"]`).value).replace(',', '.')) || 0 })).filter((s) => s.qte > 0);
      if (sorties.length) body.sorties = sorties;
    }
    const r = await api('POST', `/api/prod/of/${of2.id}/partie/${n}/valider`, body);
    toast(r.statut === 'termine' ? `OF ${of2.numero} terminé — produits finis entrés en stock.` : `${NOM_PARTIE[n]} validée${r.etat === 'validee' ? ' en totalité' : ' (partiellement)'}.`); route(); return true;
  });
  const f = $('#fen-form');
  const majBesoin = () => { // prorata proposé : besoin par pièce (perte incluse) × quantités validées
    for (const b of besoinLignes) {
      const qtesVal = restes.map((t, i) => ({ t, q: Number(String(f.querySelector(`[data-q="${i}"]`).value).replace(',', '.')) || 0 }));
      const besoin = besoinLignes.find((x) => x.article_id === b.article_id);
      let q = 0;
      for (const { t, q: qv } of qtesVal) { const pp = besoin.par_piece && besoin.par_piece[t.taille] !== undefined ? besoin.par_piece[t.taille] : r3(besoin.qte_totale / piecesOF); q = r3(q + pp * qv); }
      const cell = f.querySelector(`[data-besoin="${b.article_id}"]`); if (cell) cell.textContent = qteF(q) + ' ' + (b.unite || '');
      const inp = f.querySelector(`[data-s="${b.article_id}"]`); if (inp && inp.value === '') inp.value = q > 0 ? q : '';
    }
  };
  f.addEventListener('input', majBesoin); majBesoin();
}

/* ---------------------------------------------------------------- Calcul des besoins */
ECRANS.besoins = async (m) => {
  const commandes = await chargerCommandes();
  const cmds = commandes.filter((c) => !['annule', 'annulee'].includes((c.status || c.donnees?.status || '') + ''));
  m.innerHTML = entete('Calcul des besoins', 'Matières nécessaires aux commandes d’après la BOM versionnée (perte matière générale incluse), comparées au stock : disponible = physique − réservé aux OF ; « à commander » = ce qui manque.',
    `<div class="row-f"><div class="champ" style="margin:0"><select id="cmd"><option value="">— choisir une commande —</option>${cmds.map((c) => { const d = c.donnees || c; return `<option value="${esc(c.id ?? d.id)}">${esc(d.number || c.number || c.id)} — ${esc(d.clientName || d.client?.name || '')}</option>`; }).join('')}</select></div></div>`) +
    `<div id="bc"></div>`;
  $('#cmd').onchange = async () => {
    const id = $('#cmd').value;
    if (!id) return $('#bc').innerHTML = '';
    const B = await api('GET', `/api/prod/besoins?commande_id=${encodeURIComponent(id)}`);
    $('#bc').innerHTML = B.length ? B.map((g) => `<h3 class="titre-bloc">${esc(g.reference)} — ${qteF(g.pieces)} pièce(s) <button class="btn sm" data-ofp="${g.produit_id}">Lancer un OF</button></h3>
      <div class="panneau" style="overflow:auto"><table class="nombres"><thead><tr><th>Matière</th><th class="n">Besoin</th><th>Unité</th><th class="n">Physique</th><th class="n">Réservé (autres OF)</th><th class="n">Disponible</th><th class="n">À commander</th></tr></thead><tbody>
        ${g.lignes.map((l) => `<tr><td><b>${esc(l.designation)}</b>${l.article_id ? '' : ' <span class="badge anc">hors registre</span>'}</td><td class="n"><b>${qteF(l.qte_totale)}</b></td><td>${esc(l.unite || '—')}</td>
          <td class="n">${l.article_id ? qteF(l.physique) : '—'}</td><td class="n">${l.article_id ? qteF(l.reserve) : '—'}</td>
          <td class="n ${l.article_id && l.disponible < l.qte_totale ? 'rouge' : ''}">${l.article_id ? qteF(l.disponible) : '—'}</td>
          <td class="n">${l.article_id && l.a_commander > 0 ? `<b class="rouge">${qteF(l.a_commander)}</b>` : '—'}</td></tr>`).join('')}</tbody></table></div>`).join('')
      : '<div class="vide">Aucune ligne de produit fini sur cette commande (ou BOM vide).</div>';
    $('#bc').onclick = (e) => { const b = e.target.closest('[data-ofp]'); if (b) formOF({ commande_id: id, produit_id: +b.dataset.ofp }); };
  };
};

/* ---------------------------------------------------------------- BOM versionnée */
ECRANS.bomVersions = async (m) => {
  const produits = await api('GET', '/api/produits').catch(() => []);
  if (!produits.length) { m.innerHTML = entete('Nomenclatures (BOM)', 'Les nomenclatures se rattachent aux produits finis du catalogue.') + '<div class="vide">Créez d’abord un produit fini (module Infographie › Produits finis).</div>'; return; }
  m.innerHTML = entete('Nomenclatures (BOM) versionnées', 'Une nomenclature par produit, <b>versionnée</b> : modifier crée une nouvelle version et n’altère jamais les OF déjà lancés (ils gardent la leur). Le prix de revient du produit est recalculé quand son prix est « calculé ». Tissu : le métrage peut varier par taille.',
    `<div class="row-f"><div class="champ" style="margin:0"><select id="pf"><option value="">— produit —</option>${produits.map((p) => `<option value="${p.id}" data-taillant="${esc(JSON.stringify(p.taillant || []))}">${esc(p.reference)} — ${esc(p.code_article)}${p.client_nom ? ' · ' + esc(p.client_nom) : ''}</option>`).join('')}</select></div>
      ${peut('bom.nomenclatures', 'creer') ? '<button class="btn cta" id="bom-n" disabled>+ Nouvelle version</button>' : ''}</div>`) +
    `<div id="bv"></div>`;
  const charger = async () => {
    const id = $('#pf').value; $('#bom-n').disabled = !id; if (!id) return $('#bv').innerHTML = '';
    const V = await api('GET', `/api/pf/boms?produit_id=${id}`);
    $('#bv').innerHTML = V.length ? V.map((v) => `<h3 class="titre-bloc">Version ${v.version} · ${jour(v.date_effet)} ${v.statut === 'active' ? '<span class="badge vig">Active</span>' : '<span class="badge anc">Archivée</span>'} <span class="mute small">${esc(v.origine === 'migration' ? 'reprise 0.11.0' : v.origine === 'creation' ? 'créée' : 'modifiée')} par ${esc(v.cree_par || '')}${v.note ? ' — ' + esc(v.note) : ''}</span></h3>
      <div class="panneau" style="overflow:auto"><table class="nombres"><thead><tr><th>Matière</th><th>Unité</th><th class="n">Qté de base</th><th>Métrage par taille</th></tr></thead><tbody>
        ${v.lignes.map((l) => `<tr><td>${l.article_id ? `<b>${esc(l.designation)}</b>` : `${esc(l.designation)} <span class="badge anc">hors registre</span>`}</td><td>${esc(l.unite || '—')}</td><td class="n">${qteF(l.qte_base)}</td>
          <td class="small">${Object.entries(l.par_taille || {}).map(([t, q]) => `${esc(t)} : ${qteF(q)}`).join(' · ') || '—'}</td></tr>`).join('') || '<tr><td colspan="4" class="mute">Nomenclature vide.</td></tr>'}</tbody></table></div>`).join('')
      : '<div class="vide">Aucune version : créez la première nomenclature de ce produit.</div>';
  };
  $('#pf').onchange = charger; charger();
  $('#bom-n').onclick = () => formBom(produits.find((p) => p.id === +$('#pf').value));
};

async function formBom(p) {
  const arts = (await api('GET', '/api/registres/articles_mp').catch(() => [])).filter((a) => a.actif);
  const taillant = JSON.parse(document.querySelector(`#pf option[value="${p.id}"]`)?.dataset.taillant || '[]');
  const voitCouts = voit('achats') || voit('couts');
  let lignes = [{ article_id: '', designation: '', unite: '', qte_base: '', par_taille: {} }];
  fenetre(`<h3>Nouvelle version de BOM — ${esc(p.reference)}</h3><div class="msg err" hidden role="alert"></div>
    <p class="mute small">La version active précédente est archivée : les OF déjà lancés conservent leur version. ${voitCouts ? 'Le prix unitaire reprend le prix d’achat de la fiche (modifiable).' : 'Le coût des matières repris du prix d’achat de la fiche.'}</p>
    <div class="champ"><label for="bm-n">Note de version</label><input id="bm-n" name="note" maxlength="500" placeholder="Pourquoi cette version ?"></div>
    <div style="overflow:auto"><table class="nombres"><thead><tr><th>Matière (registre)</th><th>Désignation</th><th>Unité</th><th class="n">Qté de base</th><th>Par taille (tissu)</th><th></th></tr></thead><tbody id="bm-l"></tbody></table></div>
    <button type="button" class="btn ghost sm" id="bm-plus">+ Ligne</button>
    <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Annuler</button><button class="btn" value="ok">Enregistrer la version</button></div>`, async () => {
    const L = lignes.filter((l) => l.article_id || l.designation.trim()).map((l) => {
      const o = { designation: l.designation.trim(), qte_base: Number(String(l.qte_base).replace(',', '.')) || 0 };
      if (l.article_id) o.article_id = +l.article_id;
      if (l.unite.trim()) o.unite = l.unite.trim();
      const pt = {}; for (const [t, q] of Object.entries(l.par_taille || {})) if (+q > 0) pt[t] = +q;
      if (Object.keys(pt).length) o.par_taille = pt;
      if (voitCouts && l.pu !== undefined && l.pu !== '') o.pu = Number(String(l.pu).replace(',', '.')) || 0;
      return o;
    });
    if (!L.length) throw new Error('Ajoutez au moins une matière (ou une ligne désignée).');
    const r = await api('POST', '/api/pf/boms', { produit_id: p.id, lignes: L, note: $('#bm-n').value.trim() });
    toast(`BOM version ${r.version} enregistrée.`); route(); return true;
  });
  const f = $('#fen-form');
  const opts = arts.map((a) => `<option value="${a.id}">${esc(a.designation)}${a.code ? ' (' + esc(a.code) + ')' : ''} · ${esc(a.famille || '')}</option>`).join('');
  const lire = () => f.querySelectorAll('#bm-l tr').forEach((tr, i) => { const l = lignes[i]; tr.querySelectorAll('[data-k]').forEach((x) => { l[x.dataset.k] = x.value; }); const pt = {}; tr.querySelectorAll('[data-pt]').forEach((x) => { if (x.value) pt[x.dataset.pt] = x.value; }); l.par_taille = pt; });
  const dess = () => {
    $('#bm-l', f).innerHTML = lignes.map((l, i) => `<tr data-i="${i}">
      <td><select data-k="article_id" style="min-width:180px"><option value="">— ligne libre —</option>${opts}</select></td>
      <td><input data-k="designation" maxlength="200" style="width:140px"></td><td><input data-k="unite" maxlength="20" style="width:60px"></td>
      <td><input data-k="qte_base" type="number" step="any" min="0" style="width:80px"></td>
      <td class="small">${taillant.map((t) => `<label class="small">${esc(t)} <input data-pt="${esc(t)}" type="number" step="any" min="0" style="width:64px" placeholder="base"></label>`).join(' ') || '<span class="mute">pas de taillant</span>'}</td>
      <td><button type="button" class="btn ghost sm" data-del="${i}">✕</button></td></tr>`).join('');
    f.querySelectorAll('#bm-l tr').forEach((tr, i) => { const l = lignes[i]; tr.querySelectorAll('[data-k]').forEach((x) => { x.value = l[x.dataset.k] ?? ''; }); });
  };
  dess();
  $('#bm-plus', f).onclick = () => { lire(); lignes.push({ article_id: '', designation: '', unite: '', qte_base: '', par_taille: {} }); dess(); };
  f.addEventListener('click', (e) => { const d = e.target.closest('[data-del]'); if (!d) return; lire(); lignes.splice(+d.dataset.del, 1); if (!lignes.length) lignes.push({ article_id: '', designation: '', unite: '', qte_base: '', par_taille: {} }); dess(); });
}

/* ---------------------------------------------------------------- Affectation (version simple) */
ECRANS.taches = async (m) => {
  const [OF, ouvriers] = await Promise.all([api('GET', '/api/prod/of?statut=en_cours'), api('GET', '/api/prod/ouvriers')]);
  m.innerHTML = entete('Affectation', 'Version simple : depuis cet écran, on affecte des <b>ouvriers de l’atelier</b> aux parties de chaque OF en cours. La tablette de l’atelier montre les tâches affectées. Le pointage se fait sur l’écran <b>Pointage</b>.',
    `<div class="row-f"><div class="champ" style="margin:0"><select id="of"><option value="">— choisir un OF en cours —</option>${OF.map((o) => `<option value="${o.id}">${esc(o.numero)} — ${esc(o.reference)} · ${esc(o.client_nom || '—')} · ${qteF(o.pieces)} pièce(s)</option>`).join('')}</select></div>
      ${peut('production.taches', 'creer') ? '<button class="btn ghost" data-r="ouvriers">Ouvriers de l’atelier</button>' : ''}</div>`) +
    `<div id="ta"></div>`;
  $('#of').onchange = () => chargerAffectations($('#of').value, ouvriers);
  chargerAffectations($('#of').value, ouvriers);
  m.onclick = (e) => {
    const b = e.target.closest('[data-r],[data-aj],[data-ret]'); if (!b) return;
    if (b.dataset.r === 'ouvriers') return formOuvriers();
    if (b.dataset.aj) return ajouterAffectation(+b.dataset.aj, ouvriers);
    if (b.dataset.ret) return retirerAffectation(+b.dataset.ret);
  };
};

async function chargerAffectations(id, ouvriers) {
  const z = $('#ta');
  if (!id) { z.innerHTML = '<div class="vide">Choisissez un ordre de fabrication en cours.</div>'; return; }
  const of = await api('GET', `/api/prod/of/${id}`);
  const affDe = (n) => of.affectations.filter((a) => a.partie === n);
  const peutGerer = peut('production.taches', 'creer') && of.statut === 'en_cours';
  z.innerHTML = `<h3 class="titre-bloc">${esc(of.numero)} · ${esc(of.reference)} ${badge(STATUT_OF, of.statut)} — ${esc(of.client_nom || '')}</h3>
    ${[1, 2, 3].map((n) => {
      const p = of.parties.find((x) => x.partie === n);
      const A = affDe(n);
      return `<div class="panneau" style="margin-bottom:10px"><b>${NOM_PARTIE[n]}</b> ${badge(ETAT_PARTIE, p.etat)}
        <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">${A.filter((a) => !a.annule).map((a) => `<span class="badge vig">${esc(a.ouvrier)}${peut('production.taches', 'modifier') ? ` <button class="btn ghost sm" data-ret="${a.id}" title="Retirer" style="padding:0 6px">✕</button>` : ''}</span>`).join('') || '<span class="mute small">Personne n’est affecté à cette partie.</span>'}</div>
        ${peutGerer && p.etat !== 'sans_objet' && p.etat !== 'validee' ? `<button class="btn ghost sm" data-aj="${n}" style="margin-top:8px">+ Affecter un ouvrier</button>` : ''}</div>`;
    }).join('')}
    <h3 class="titre-bloc">Signalements</h3>
    <div class="panneau">${of.signalements.map((s) => `<p class="small"><b>${jour(s.cree_le)}</b>${s.partie ? ` · ${NOM_PARTIE[s.partie]}` : ''} — ${esc(s.texte)} <span class="mute small">(${esc(s.cree_par_nom || '')})</span> ${s.etat === 'resolu' ? `<span class="badge vig">Résolu${s.resolu_note ? ' : ' + esc(s.resolu_note) : ''}</span>` : '<span class="badge ret">Ouvert</span>'}${peut('production.of', 'modifier') && s.etat === 'ouvert' ? ` <button class="btn ghost sm" data-res="${s.id}">Résoudre</button>` : ''}</p>`).join('') || '<p class="mute small">Aucun signalement.</p>'}</div>`;
  z.onclick = async (e) => {
    const b = e.target.closest('[data-ret],[data-res]'); if (!b) return;
    if (b.dataset.ret) return retirerAffectation(+b.dataset.ret);
    if (b.dataset.res) return resoudreSignalement(+b.dataset.res);
  };
}

async function formOuvriers() {
  const O = await api('GET', '/api/prod/ouvriers');
  fenetre(`<h3>Ouvriers de l’atelier</h3><div class="msg err" hidden role="alert"></div>
    <div style="max-height:40vh;overflow:auto"><table class="nombres"><thead><tr><th>Nom</th><th>Poste</th><th>État</th></tr></thead><tbody>
      ${O.map((o) => `<tr><td><b>${esc(o.nom)}</b></td><td>${esc(o.poste || '—')}</td><td>${o.actif ? '<span class="badge vig">Actif</span>' : '<span class="badge anc">Désactivé</span>'}</td></tr>`).join('') || '<tr><td colspan="3" class="mute">Aucun ouvrier.</td></tr>'}</tbody></table></div>
    <div class="row-f" style="margin-top:10px"><div class="champ"><label for="ov-n">Nouvel ouvrier *</label><input id="ov-n" name="nom" minlength="2" maxlength="80" required></div>
      <div class="champ"><label for="ov-p">Poste</label><input id="ov-p" name="poste" maxlength="80" placeholder="Piqueuse, coupeur…"></div></div>
    <p class="mute small">Un ouvrier désactivé n’apparaît plus dans les nouvelles affectations ; son historique est conservé.</p>
    <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Fermer</button><button class="btn" value="ok">Ajouter l’ouvrier</button></div>`, async (f) => {
    await api('POST', '/api/prod/ouvriers', { nom: f.nom.value.trim(), poste: f.poste.value.trim() });
    toast('Ouvrier ajouté.'); route(); return true;
  });
}

async function ajouterAffectation(partie, ouvriers) {
  const actifs = ouvriers.filter((o) => o.actif);
  if (!actifs.length) return toast('Créez d’abord un ouvrier (bouton « Ouvriers de l’atelier »).', true);
  fenetre(`<h3>Affecter — ${NOM_PARTIE[partie]}</h3><div class="msg err" hidden role="alert"></div>
    <div class="champ"><label for="af-o">Ouvrier *</label><select id="af-o" name="ouvrier" required>${actifs.map((o) => `<option value="${o.id}">${esc(o.nom)}${o.poste ? ' · ' + esc(o.poste) : ''}</option>`).join('')}</select></div>
    <div class="champ"><label for="af-n">Note</label><input id="af-n" name="note" maxlength="200"></div>
    <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Annuler</button><button class="btn" value="ok">Affecter</button></div>`, async (f) => {
    await api('POST', `/api/prod/of/${$('#of').value}/affectations`, { partie, ouvrier_id: +f.ouvrier.value, note: f.note.value.trim() });
    toast('Ouvrier affecté.'); route(); return true;
  });
}

async function retirerAffectation(id) {
  fenetre(`<h3>Retirer l’affectation</h3><div class="msg err" hidden role="alert"></div>
    <div class="champ"><label for="af-m">Motif *</label><input id="af-m" name="motif" required minlength="3" maxlength="300"></div>
    <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Retour</button><button class="btn danger" value="ok">Retirer</button></div>`, async (f) => {
    await api('POST', `/api/prod/affectations/${id}/annuler`, { motif: f.motif.value.trim() });
    toast('Affectation retirée.'); route(); return true;
  });
}

async function resoudreSignalement(id) {
  fenetre(`<h3>Résoudre le signalement</h3><div class="msg err" hidden role="alert"></div>
    <div class="champ"><label for="sg-n">Note de résolution</label><input id="sg-n" name="note" maxlength="300"></div>
    <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Retour</button><button class="btn" value="ok">Résolu</button></div>`, async (f) => {
    await api('POST', `/api/prod/signalements/${id}/resoudre`, { note: f.note.value.trim() });
    toast('Signalement résolu.'); route(); return true;
  });
}

/* ---------------------------------------------------------------- Pointage (version simple) */
ECRANS.pointage = async (m) => {
  const jourDef = new Date().toISOString().slice(0, 10);
  const [OF, ouvriers] = await Promise.all([api('GET', '/api/prod/of?statut=en_cours'), api('GET', '/api/prod/ouvriers')]);
  m.innerHTML = entete('Pointage', 'Version simple : le responsable pointe le <b>début</b> et la <b>fin</b> des tâches pour le compte de chaque ouvrier (web ou tablette). Le temps prévu vient de la gamme du produit.',
    `<div class="row-f"><div class="champ" style="margin:0"><label for="pg-du" class="mute small">Jour&nbsp;</label><input id="pg-du" type="date" value="${jourDef}" style="width:150px"></div>
      <div class="champ" style="margin:0"><label for="pg-o" class="mute small">Ouvrier&nbsp;</label><select id="pg-o"><option value="">Tous</option>${ouvriers.filter((o) => o.actif).map((o) => `<option value="${o.id}">${esc(o.nom)}</option>`).join('')}</select></div>
      ${peut('production.pointage', 'creer') && OF.length ? '<button class="btn cta" data-r="nouveau">+ Pointage</button>' : ''}</div>`) +
    `<div id="pg"></div>`;
  const charger = async () => {
    const q = new URLSearchParams(); if ($('#pg-du').value) q.set('du', $('#pg-du').value), q.set('au', $('#pg-du').value); if ($('#pg-o').value) q.set('ouvrier_id', $('#pg-o').value);
    const P = await api('GET', '/api/prod/pointages?' + q.toString());
    const mn = (x) => x ? qteF(Math.round(x / 60 * 10) / 10) + ' min' : '—';
    const duree = (p) => p.fin ? mn((new Date(p.fin) - new Date(p.debut)) / 1000) : 'en cours';
    $('#pg').innerHTML = `<div class="panneau" style="overflow:auto"><table class="nombres"><thead><tr><th>Ouvrier</th><th>OF</th><th>Partie</th><th>Début</th><th>Fin</th><th>Durée</th><th>Temps prévu (gamme)</th><th>Source</th><th></th></tr></thead><tbody>
      ${P.filter((p) => !p.annule).map((p) => `<tr><td><b>${esc(p.ouvrier)}</b></td><td class="mono small">${esc(p.numero)}</td><td>${NOM_PARTIE[p.partie]}</td>
        <td class="small">${dt(p.debut)}</td><td class="small">${p.fin ? dt(p.fin) : '—'}</td><td class="n">${duree(p)}</td><td class="n">${p.temps_prevu_piece ? qteF(p.temps_prevu_piece) + ' min/pièce' : '—'}</td><td>${p.source === 'tablette' ? 'Tablette' : 'Web'}</td>
        <td>${peut('production.pointage', 'modifier') ? `<button class="btn ghost sm" data-corr="${p.id}" data-v="${p.version}" data-fin="${p.fin || ''}" data-debut="${p.debut}">Corriger</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="9" class="mute">Aucun pointage ce jour.</td></tr>'}</tbody></table></div>
      ${P.some((p) => p.annule) ? '<p class="mute small">' + P.filter((p) => p.annule).length + ' pointage(s) annulé(s) ce jour (motif tracé à l’audit).</p>' : ''}`;
    $('#pg').onclick = (e) => {
      const b = e.target.closest('[data-corr]'); if (!b) return;
      formCorrection(b.dataset);
    };
  };
  $('#pg-du').onchange = charger; $('#pg-o').onchange = charger; charger();
  m.onclick = (e) => { if (e.target.closest('[data-r=nouveau]')) return formPointage(OF, ouvriers); };
};

async function formPointage(OF, ouvriers) {
  const actifs = ouvriers.filter((o) => o.actif);
  if (!actifs.length) return toast('Créez d’abord un ouvrier (écran Affectation).', true);
  fenetre(`<h3>Nouveau pointage</h3><div class="msg err" hidden role="alert"></div>
    <div class="champ"><label for="pt-o">Ordre de fabrication *</label><select id="pt-o" name="of" required>${OF.map((o) => `<option value="${o.id}">${esc(o.numero)} — ${esc(o.reference)}</option>`).join('')}</select></div>
    <div class="champ"><label for="pt-p">Partie *</label><select id="pt-p" name="partie" required>${[1, 2, 3].map((n) => `<option value="${n}">${NOM_PARTIE[n]}</option>`).join('')}</select></div>
    <div class="champ"><label for="pt-w">Ouvrier *</label><select id="pt-w" name="ouvrier" required>${actifs.map((o) => `<option value="${o.id}">${esc(o.nom)}</option>`).join('')}</select></div>
    <div class="grille2"><div class="champ"><label for="pt-d">Début *</label><input id="pt-d" name="debut" type="datetime-local" required></div>
      <div class="champ"><label for="pt-f">Fin (vide = en cours)</label><input id="pt-f" name="fin" type="datetime-local"></div></div>
    <div class="champ"><label for="pt-r">Remarques</label><input id="pt-r" name="remarques" maxlength="300"></div>
    <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Annuler</button><button class="btn" value="ok">Enregistrer</button></div>`, async (f) => {
    const body = { of_id: +f.of.value, partie: +f.partie.value, ouvrier_id: +f.ouvrier.value, debut: new Date(f.debut.value).toISOString() };
    if (f.fin.value) body.fin = new Date(f.fin.value).toISOString();
    if (f.remarques.value.trim()) body.remarques = f.remarques.value.trim();
    await api('POST', '/api/prod/pointages', body);
    toast('Pointage enregistré.'); route(); return true;
  });
}

async function formCorrection(d) {
  fenetre(`<h3>Corriger le pointage</h3><div class="msg err" hidden role="alert"></div>
    <div class="grille2"><div class="champ"><label for="pc-d">Début</label><input id="pc-d" name="debut" type="datetime-local"></div>
      <div class="champ"><label for="pc-f">Fin</label><input id="pc-f" name="fin" type="datetime-local"></div></div>
    <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Retour</button><button class="btn" value="ok">Enregistrer la correction</button></div>`, async (f) => {
    const body = { version: +d.v };
    if (f.debut.value) body.debut = new Date(f.debut.value).toISOString();
    if (f.fin.value) body.fin = new Date(f.fin.value).toISOString();
    await api('PATCH', `/api/prod/pointages/${d.corr}`, body);
    toast('Pointage corrigé (tracé à l’audit).'); route(); return true;
  });
  const f = $('#fen-form');
  const isoLocal = (s) => { const d = new Date(s); return isNaN(d) ? '' : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  f.debut.value = isoLocal(d.debut); if (d.fin) f.fin.value = isoLocal(d.fin);
}

/* ---------------------------------------------------------------- Gammes versionnées */
ECRANS.gammeVersions = async (m) => {
  const produits = await api('GET', '/api/produits').catch(() => []);
  if (!produits.length) { m.innerHTML = entete('Gammes opératoires', 'Les gammes se rattachent aux produits finis du catalogue.') + '<div class="vide">Créez d’abord un produit fini.</div>'; return; }
  m.innerHTML = entete('Gammes opératoires versionnées', 'Opérations, temps standard et poste. La modification crée une nouvelle version (les OF lancés gardent la leur) et recalcule le coût d’industrialisation du produit quand son prix est « calculé ».',
    `<div class="row-f"><div class="champ" style="margin:0"><select id="pf"><option value="">— produit —</option>${produits.map((p) => `<option value="${p.id}">${esc(p.reference)} — ${esc(p.code_article)}</option>`).join('')}</select></div>
      ${peut('bom.gammes', 'creer') ? '<button class="btn cta" id="ga-n" disabled>+ Nouvelle version</button>' : ''}</div>`) +
    `<div id="gv"></div>`;
  const charger = async () => {
    const id = $('#pf').value; $('#ga-n').disabled = !id; if (!id) return $('#gv').innerHTML = '';
    const V = await api('GET', `/api/pf/gammes?produit_id=${id}`);
    $('#gv').innerHTML = V.length ? V.map((v) => `<h3 class="titre-bloc">Version ${v.version} · ${jour(v.date_effet)} ${v.statut === 'active' ? '<span class="badge vig">Active</span>' : '<span class="badge anc">Archivée</span>'} <span class="mute small">par ${esc(v.cree_par || '')}${v.note ? ' — ' + esc(v.note) : ''}</span></h3>
      <div class="panneau" style="overflow:auto"><table class="nombres"><thead><tr><th class="n">#</th><th>Opération</th><th>Poste / compétence</th><th class="n">Temps (min)</th></tr></thead><tbody>
        ${v.operations.map((o, i) => `<tr><td class="n">${i + 1}</td><td><b>${esc(o.operation)}</b></td><td>${esc(o.poste || '—')}</td><td class="n">${qteF(o.temps_min)}</td></tr>`).join('') || '<tr><td colspan="4" class="mute">Gamme vide.</td></tr>'}</tbody></table></div>`).join('')
      : '<div class="vide">Aucune gamme enregistrée pour ce produit.</div>';
  };
  $('#pf').onchange = charger; charger();
  $('#ga-n').onclick = () => formGamme(produits.find((p) => p.id === +$('#pf').value));
};

async function formGamme(p) {
  let operations = [{ operation: '', temps_min: '', poste: '' }];
  fenetre(`<h3>Nouvelle version de gamme — ${esc(p.reference)}</h3><div class="msg err" hidden role="alert"></div>
    <p class="mute small">Listez les opérations dans l’ordre. Le total des minutes sert au coût d’industrialisation et, plus tard, au suivi du temps réel à la tablette.</p>
    <div class="champ"><label for="gm-n">Note de version</label><input id="gm-n" name="note" maxlength="500"></div>
    <div style="overflow:auto"><table class="nombres"><thead><tr><th>Opération</th><th class="n">Temps (min)</th><th>Poste / compétence</th><th></th></tr></thead><tbody id="gm-l"></tbody></table></div>
    <button type="button" class="btn ghost sm" id="gm-plus">+ Opération</button>
    <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Annuler</button><button class="btn" value="ok">Enregistrer la version</button></div>`, async () => {
    const O = operations.map((o) => ({ operation: o.operation.trim(), temps_min: Number(String(o.temps_min).replace(',', '.')) || 0, poste: o.poste.trim() })).filter((o) => o.operation);
    if (!O.length) throw new Error('Ajoutez au moins une opération.');
    const r = await api('POST', '/api/pf/gammes', { produit_id: p.id, operations: O, note: $('#gm-n').value.trim() });
    toast(`Gamme version ${r.version} enregistrée.`); route(); return true;
  });
  const f = $('#fen-form');
  const lire = () => f.querySelectorAll('#gm-l tr').forEach((tr, i) => { operations[i] && tr.querySelectorAll('[data-k]').forEach((x) => { operations[i][x.dataset.k] = x.value; }); });
  const dess = () => {
    $('#gm-l', f).innerHTML = operations.map((o, i) => `<tr><td><input data-k="operation" maxlength="120" style="width:200px" placeholder="Assemblage"></td>
      <td><input data-k="temps_min" type="number" step="any" min="0" style="width:80px"></td><td><input data-k="poste" maxlength="80" style="width:140px" placeholder="Piqueuse…"></td>
      <td><button type="button" class="btn ghost sm" data-del="${i}">✕</button></td></tr>`).join('');
    f.querySelectorAll('#gm-l tr').forEach((tr, i) => { tr.querySelectorAll('[data-k]').forEach((x) => { x.value = operations[i][x.dataset.k] ?? ''; }); });
  };
  dess();
  $('#gm-plus', f).onclick = () => { lire(); operations.push({ operation: '', temps_min: '', poste: '' }); dess(); };
  f.addEventListener('click', (e) => { const d = e.target.closest('[data-del]'); if (!d) return; lire(); operations.splice(+d.dataset.del, 1); if (!operations.length) operations.push({ operation: '', temps_min: '', poste: '' }); dess(); });
}
