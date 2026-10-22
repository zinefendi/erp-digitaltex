'use strict';
/* ERP DIGITAL-TEX — lot 0.9.0 « Ventes complètes » : écrans Devis, Proformas, Avoirs, Colisage export,
   impression FR / EN. Chargé après erp-coquille.js (helpers : api, toast, peut, fenetre, grandeFenetre, esc, $,
   voit, md, r3, jour, iso, entete, rechercheHtml, gestion, route, ECRANS).
   Tous les montants sont recalculés par le serveur ; sans le droit « voir les prix », le serveur ne les envoie pas. */

const ST_V = {
  devis: { emis: ['Émis', 'fut'], envoye: ['Envoyé', 'fut'], accepte: ['Accepté', 'vig'], refuse: ['Refusé', 'anc'], expire: ['Expiré', 'anc'], transforme: ['Transformé', 'vig'], annule: ['Annulé', 'anc'] },
  proformas: { emise: ['Émise', 'fut'], envoyee: ['Envoyée', 'fut'], acceptee: ['Acceptée', 'vig'], transformee: ['Transformée', 'vig'], annulee: ['Annulée', 'anc'] },
  avoirs: { emis: ['Émis', 'vig'], annule: ['Annulé', 'anc'] },
};
const ENT_V = { devis: 'devis', proformas: 'proforma', avoirs: 'avoir' };
const DROIT_V = { devis: 'commercial.devis', proformas: 'commercial.proformas', avoirs: 'commercial.avoirs' };
const INCOTERMS_V = ['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF'];
const badgeV = (type, d) => { const s = d.expire ? ['Expiré', 'anc'] : ST_V[type][d.statut] || [d.statut, 'anc']; return `<span class="badge ${s[1]}">${s[0]}</span>`; };

// envoi avec gestion de la vente à perte : le serveur refuse (409), l'utilisateur confirme, on renvoie avec confirmer_perte
async function envoiVente(method, url, body) {
  try { return await api(method, url, body); } catch (x) {
    if (x.code !== 'vente_a_perte') throw x;
    if (!confirm(x.message + '\n\nConfirmer quand même ? La confirmation est inscrite au journal d’audit.')) throw new Error('Enregistrement abandonné : prix sous le prix de revient.');
    return api(method, url, { ...body, confirmer_perte: true });
  }
}

/* ---------------------------------------------------------------- Devis et proformas */
async function ecranDevisPro(m, type) {
  const T = type === 'devis' ? { titre: 'Devis', un: 'devis', nouveau: '+ Devis', droit: 'commercial.devis' } : { titre: 'Factures proforma', un: 'proforma', nouveau: '+ Proforma', droit: 'commercial.proformas' };
  const prix = voit('prix');
  const [L, G, P] = await Promise.all([api('GET', '/api/ventes/' + type), gestion(true).catch(() => ({ clients: [] })), peut('commercial.produits_finis') ? api('GET', '/api/produits').catch(() => []) : []]);
  const clients = (G.clients || []).filter((c) => !c.archived);
  const cree = peut(T.droit, 'creer') && prix;
  const ouverts = L.filter((d) => ['emis', 'envoye', 'emise', 'envoyee', 'accepte', 'acceptee'].includes(d.statut) && !d.expire);
  m.innerHTML = entete(T.titre, type === 'devis'
    ? 'Circuit : devis → proforma → commande → BL → facture. Le numéro (DEV) est attribué par le serveur ; la transformation recopie les lignes sans ressaisie.'
    : 'Proforma (PRO) issue d’un devis ou établie directement, transformable en commande. Export : devise du client, taux de change, Incoterms 2020, document en français ou en anglais.',
    `<div class="row-f">${rechercheHtml('Client, n°, référence…')}<div class="champ" style="margin:0"><select id="filtre"><option value="">Tous</option><option value="ouverts">En cours</option>${Object.entries(ST_V[type]).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select></div>${cree ? `<button class="btn cta" data-v="nouveau">${T.nouveau}</button>` : ''}</div>`) +
    `<div class="chiffres"><div class="chiffre"><b>${L.length}</b><span>${T.un}(s) au total</span></div><div class="chiffre"><b>${ouverts.length}</b><span>en cours (non transformés)</span></div>
      ${prix ? `<div class="chiffre"><b>${md(ouverts.filter((d) => d.devise === 'DT').reduce((s, d) => s + (d.net || 0), 0))}</b><span>montant en cours (DT)</span></div>` : ''}
      <div class="chiffre ${L.some((d) => d.expire) ? 'alerte' : ''}"><b>${L.filter((d) => d.expire).length}</b><span>validité dépassée</span></div></div>
    <div class="panneau" id="liste" style="overflow:auto"></div>`;
  const dess = () => {
    const q = $('#recherche').value.trim().toLowerCase(), f = $('#filtre').value;
    const l = L.filter((d) => (!f || (f === 'ouverts' ? ouverts.includes(d) : f === 'expire' ? d.expire : d.statut === f && !d.expire)) && (!q || JSON.stringify([d.numero, d.client?.name, d.ref_client, d.commande_num, d.origine_num]).toLowerCase().includes(q)));
    $('#liste').innerHTML = l.length ? `<table class="nombres"><thead><tr><th>N°</th><th>Date</th><th>Client</th><th>Validité</th>${prix ? '<th class="n">Net</th>' : ''}<th>Suite</th><th>État</th></tr></thead><tbody>
      ${l.map((d) => `<tr class="cliquable" data-id="${d.id}"><td class="mono small"><b>${esc(d.numero)}</b>${d.vente_perte ? ' <span class="badge ret" title="Vente à perte confirmée">perte</span>' : ''}</td><td>${jour(d.date)}</td>
        <td>${esc(d.client?.name || '')}<div class="mute small">${d.type_client === 'export' ? `Export · ${esc(d.devise)}${d.incoterm ? ' · ' + esc(d.incoterm) : ''}` : 'Local'}${d.ref_client ? ' · réf. ' + esc(d.ref_client) : ''}</div></td>
        <td class="${d.expire ? 'rouge' : ''}">${jour(d.validite)}</td>${prix ? `<td class="n"><b>${md(d.net, d.devise)}</b></td>` : ''}
        <td class="mono small">${[d.origine_num ? '← ' + esc(d.origine_num) : '', ...(d.suites || []).map((s) => '→ ' + esc(s.numero)), d.commande_num ? '→ ' + esc(d.commande_num) : ''].filter(Boolean).join('<br>') || '—'}</td>
        <td>${badgeV(type, d)}</td></tr>`).join('')}</tbody></table>`
      : `<div class="vide">${L.length ? 'Aucun document pour ce filtre.' : `Aucun ${T.un} pour l’instant.`}</div>`;
  };
  $('#recherche').oninput = dess; $('#filtre').onchange = dess; dess();
  m.onclick = async (e) => {
    if (e.target.closest('[data-v=nouveau]')) return formDevisPro(type, null, clients, P);
    const tr = e.target.closest('tr[data-id]');
    if (tr) { try { formDevisPro(type, await api('GET', `/api/ventes/${type}/${tr.dataset.id}`), clients, P); } catch (x) { toast(x.message, true); } }
  };
}

async function formDevisPro(type, x, clients, produits) {
  const T = type === 'devis' ? { lib: 'Devis', droit: 'commercial.devis', ent: 'devis' } : { lib: 'Proforma', droit: 'commercial.proformas', ent: 'proforma' };
  const prix = voit('prix');
  const modifiable = !x || (['emis', 'envoye', 'emise', 'envoyee'].includes(x.statut) && peut(T.droit, 'modifier') && prix);
  let ro = x ? !modifiable : !(peut(T.droit, 'creer') && prix), verrouMsg = '';
  if (x && modifiable) {
    try { await api('POST', `/api/verrous/${T.ent}/${x.id}`); }
    catch (er) { ro = true; verrouMsg = er.message; }
  }
  const [fisc, codes] = await Promise.all([api('GET', '/api/parametres/fiscalite').catch(() => []), api('GET', '/api/produits/codes-article').catch(() => [])]);
  const libCode = Object.fromEntries(codes.map((c) => [c.code, c.libelle]));
  const tvaDefaut = (fisc.find((f) => f.code === 'tva_normale' && f.en_vigueur) || { valeur: 19 }).valeur;
  let cl = clients.find((c) => c.id === x?.client_id) || null;
  const estExport = () => cl?.type_client === 'export';
  const devise = () => (estExport() && ['EUR', 'USD'].includes(cl?.devise) ? cl.devise : 'DT');
  let lignes = x ? x.lignes.map((l) => ({ ...l })) : [{ produit: '', designation: '', couleur: '', taille: '', qte: 1, pu: 0, remise: 0, service: false }];
  let colis = x?.colisage ? x.colisage.map((c) => ({ ...c })) : [];
  const dis = ro ? 'disabled' : '';
  const pfOpts = produits.map((p) => `<option value="${esc(p.reference)}">${esc(p.reference)} · ${esc(p.code_article)}${p.client_nom ? ' · ' + esc(p.client_nom) : ''}</option>`).join('');

  const totaux = () => {
    const ttcMode = !estExport(), tva = estExport() ? 0 : (x?.tva ?? tvaDefaut), dec = devise() === 'DT' ? 3 : 2, arr = (v) => Math.round(v * 10 ** dec) / 10 ** dec;
    let s = 0; for (const l of lignes) s += (+l.qte || 0) * (+l.pu || 0) * (1 - (+l.remise || 0) / 100);
    s = arr(s);
    const ht = ttcMode ? arr(s / (1 + tva / 100)) : s, mt = ttcMode ? arr(s - ht) : arr(ht * tva / 100);
    return { ht, mt, net: arr(ht + mt), tva };
  };
  const dessL = () => {
    const d = devise();
    $('#vd-l').innerHTML = `<table class="nombres"><thead><tr><th>Produit fini</th><th>Désignation</th><th>Couleur</th><th>Taille</th><th class="n">Qté</th>${prix ? `<th class="n">P.U. ${estExport() ? 'HT' : 'TTC'}</th><th class="n">Remise %</th><th class="n">Total</th>` : ''}<th></th></tr></thead><tbody>
      ${lignes.map((l, i) => `<tr><td><input data-l="${i}" data-c="produit" list="vd-pf" value="${esc(l.produit || '')}" placeholder="${l.service ? 'Service' : 'P00126H'}" style="width:92px" ${dis || (l.service ? 'disabled' : '')}></td>
        <td><input data-l="${i}" data-c="designation" value="${esc(l.designation)}" maxlength="300" style="width:100%;min-width:150px" ${dis}>${l.service ? '<div class="mute small">Service (transport, frais…)</div>' : ''}</td>
        <td><input data-l="${i}" data-c="couleur" value="${esc(l.couleur || '')}" style="width:72px" ${dis}></td><td><input data-l="${i}" data-c="taille" value="${esc(l.taille || '')}" style="width:48px" ${dis}></td>
        <td class="n"><input data-l="${i}" data-c="qte" type="number" step="any" min="0" value="${l.qte}" style="width:62px" ${dis}></td>
        ${prix ? `<td class="n"><input data-l="${i}" data-c="pu" type="number" step="0.001" min="0" value="${l.pu ?? 0}" style="width:84px" ${dis}></td><td class="n"><input data-l="${i}" data-c="remise" type="number" step="0.5" min="0" max="100" value="${l.remise || 0}" style="width:52px" ${dis}></td>
        <td class="n" data-tot>${md((+l.qte || 0) * (+l.pu || 0) * (1 - (+l.remise || 0) / 100), d)}</td>` : ''}
        <td>${ro || lignes.length < 2 ? '' : `<button type="button" class="btn ghost sm" data-del="${i}" aria-label="Supprimer la ligne">✕</button>`}</td></tr>`).join('')}</tbody></table>
      <datalist id="vd-pf">${pfOpts}</datalist>
      <div class="row-f" style="justify-content:space-between;padding:8px 0">${ro ? '<span></span>' : '<span><button type="button" class="btn ghost sm" data-add>+ Produit</button> <button type="button" class="btn ghost sm" data-add-s>+ Service</button></span>'}<span class="small" id="vd-tot"></span></div>`;
    majTot();
  };
  const majTot = () => {
    if (!prix) return;
    const t = totaux(), d = devise();
    $('#vd-tot').innerHTML = `HT <b>${md(t.ht, d)}</b> · TVA ${t.tva} % <b>${md(t.mt, d)}</b> · <b>Net ${md(t.net, d)}</b>${estExport() ? ' · TVA 0 % export' : ''}`;
    document.querySelectorAll('#vd-l tbody tr').forEach((tr, i) => { const l = lignes[i], c = tr.querySelector('[data-tot]'); if (l && c) c.textContent = md((+l.qte || 0) * (+l.pu || 0) * (1 - (+l.remise || 0) / 100), d); });
  };
  const dessExp = () => {
    const z = $('#vd-exp'); if (!z) return;
    z.hidden = !estExport();
    if (!estExport()) return;
    $('#vd-dev').textContent = devise();
    $('#vd-colis').innerHTML = `<table class="nombres"><thead><tr><th>Colis</th><th>Contenu</th><th class="n">Qté</th><th class="n">Net kg</th><th class="n">Brut kg</th><th>Dimensions</th><th></th></tr></thead><tbody>
      ${colis.map((c, i) => `<tr><td><input data-k="${i}" data-c="colis" value="${esc(c.colis || i + 1)}" style="width:50px" ${dis}></td><td><input data-k="${i}" data-c="contenu" value="${esc(c.contenu || '')}" style="width:100%" ${dis}></td>
        <td class="n"><input data-k="${i}" data-c="quantite" type="number" min="0" value="${c.quantite || 0}" style="width:70px" ${dis}></td><td class="n"><input data-k="${i}" data-c="poids_net" type="number" step="0.001" min="0" value="${c.poids_net || 0}" style="width:80px" ${dis}></td>
        <td class="n"><input data-k="${i}" data-c="poids_brut" type="number" step="0.001" min="0" value="${c.poids_brut || 0}" style="width:80px" ${dis}></td><td><input data-k="${i}" data-c="dimensions" value="${esc(c.dimensions || '')}" style="width:100px" ${dis}></td>
        <td>${ro ? '' : `<button type="button" class="btn ghost sm" data-kdel="${i}">✕</button>`}</td></tr>`).join('')}</tbody></table>
      ${ro ? '' : '<button type="button" class="btn ghost sm" data-kadd style="margin-top:6px">+ Colis</button>'}`;
  };

  const actions = [];
  if (x) {
    const pV = (a) => peut(T.droit, a);
    const st = x.statut;
    if (['emis', 'emise'].includes(st) && pV('modifier')) actions.push(['statut:' + (type === 'devis' ? 'envoye' : 'envoyee'), 'Marquer envoyé']);
    if (['emis', 'envoye', 'emise', 'envoyee'].includes(st) && pV('valider')) actions.push(['statut:' + (type === 'devis' ? 'accepte' : 'acceptee'), 'Accepté par le client']);
    if (type === 'devis' && ['emis', 'envoye'].includes(st) && pV('valider')) actions.push(['statut:refuse', 'Refusé']);
    if (type === 'devis' && ['refuse', 'expire'].includes(st) && pV('valider')) actions.push(['statut:emis', 'Rouvrir']);
    if (prix && type === 'devis' && ['emis', 'envoye', 'accepte'].includes(st) && peut('commercial.proformas', 'creer')) actions.push(['proforma', '→ Proforma']);
    if (prix && ['emis', 'envoye', 'accepte', 'emise', 'envoyee', 'acceptee'].includes(st) && peut('commercial.commandes', 'creer')) actions.push(['commande', '→ Commande']);
    if (!['transforme', 'transformee', 'annule', 'annulee'].includes(st) && pV('annuler')) actions.push(['statut:' + (type === 'devis' ? 'annule' : 'annulee'), 'Annuler', 'danger']);
    if (prix) actions.push(['imprimer', 'Imprimer / PDF']);
  }

  grandeFenetre(`<h3>${x ? `${T.lib} ${esc(x.numero)} · ${esc(x.client?.name || '')}` : (type === 'devis' ? 'Nouveau devis' : 'Nouvelle proforma')}</h3><div class="msg err" hidden role="alert"></div>
    ${verrouMsg ? `<div class="msg" role="status" style="background:var(--org-l);padding:8px 12px;border-radius:8px;margin-bottom:10px">${esc(verrouMsg)} Lecture seule.</div>` : ''}
    ${x ? `<div class="kv-g"><span>État</span><b>${badgeV(type, x)}</b><span>Établi par</span><b>${esc(x.cree_par || '—')} · ${jour(x.cree_le)}</b>
      ${x.origine_num ? `<span>Issu de</span><b class="mono">${esc(x.origine_num)}</b>` : ''}${(x.suites || []).length ? `<span>Proforma</span><b class="mono">${x.suites.map((s) => esc(s.numero)).join(', ')}</b>` : ''}
      ${x.commande_num ? `<span>Commande</span><b class="mono">${esc(x.commande_num)}</b>` : ''}${x.motif ? `<span>Motif</span><b>${esc(x.motif)}</b>` : ''}${x.vente_perte ? '<span>Contrôle</span><b class="rouge">Vente à perte confirmée</b>' : ''}</div>` : ''}
    <div class="grille2">
      <div class="champ" style="grid-column:1/-1"><label for="vd-cl">Client *</label><select id="vd-cl" name="client" required ${dis || (x?.origine_id ? 'disabled' : '')}><option value="">— Choisir —</option>
        ${clients.map((c) => `<option value="${esc(c.id)}" ${c.id === x?.client_id ? 'selected' : ''}>${esc(c.name)}${c.type_client === 'export' ? ` · Export ${esc(c.devise || '')}` : ''}${c.mf ? ' · MF ' + esc(c.mf) : ''}</option>`).join('')}</select>
        ${clients.length ? '' : '<span class="aide">Créez d’abord le client dans Commercial › Clients.</span>'}</div>
      <div class="champ"><label for="vd-date">Date</label><input type="date" id="vd-date" name="date" value="${x?.date || iso()}" ${dis}></div>
      <div class="champ"><label for="vd-val">Valable jusqu’au</label><input type="date" id="vd-val" name="validite" value="${x?.validite || ''}" ${dis}><span class="aide">Vide = 30 jours.</span></div>
      <div class="champ"><label for="vd-ref">Référence du client (demande, appel d’offres…)</label><input id="vd-ref" name="ref_client" maxlength="80" value="${esc(x?.ref_client || '')}" ${dis}></div>
      <div class="champ"><label for="vd-lg">Langue du document</label><select id="vd-lg" name="langue" ${dis}><option value="fr">Français</option><option value="en" ${x?.langue === 'en' ? 'selected' : ''}>English</option></select></div>
    </div>
    <div id="vd-exp" class="panneau" style="padding:10px 12px;margin-bottom:10px" hidden><b>Export</b> <span class="mute small">— prix HT en <span id="vd-dev"></span>, TVA 0 %, pas de timbre</span>
      <div class="grille2" style="margin-top:8px"><div class="champ"><label for="vd-inc">Incoterm 2020</label><select id="vd-inc" name="incoterm" ${dis}><option value="">—</option>${INCOTERMS_V.map((i) => `<option ${i === x?.incoterm ? 'selected' : ''}>${i}</option>`).join('')}</select></div>
        <div class="champ"><label for="vd-lieu">Lieu (port, ville)</label><input id="vd-lieu" name="lieu_incoterm" maxlength="80" value="${esc(x?.lieu_incoterm || '')}" ${dis}></div>
        ${prix ? `<div class="champ"><label for="vd-tc">Taux de change (1 devise = … DT)</label><input id="vd-tc" name="taux_change" type="number" step="0.0001" min="0" value="${x?.taux_change ?? ''}" ${dis}><span class="aide">Obligatoire avec des produits finis : sert au contrôle de vente à perte.</span></div>` : ''}</div>
      <div class="mute small" style="margin:6px 0 4px">Colisage (facultatif — imprimé en « Packing list »)</div><div id="vd-colis"></div></div>
    <div id="vd-l" class="panneau" style="padding:6px 10px;margin-bottom:10px;overflow:auto"></div>
    <div class="grille2"><div class="champ"><label for="vd-cond">Conditions (paiement, délai…)</label><input id="vd-cond" name="conditions" maxlength="500" value="${esc(x?.conditions || '')}" ${dis}></div>
      <div class="champ"><label for="vd-note">Note</label><input id="vd-note" name="note" maxlength="1000" value="${esc(x?.note || '')}" ${dis}></div></div>
    ${actions.length ? `<div class="row-f" style="gap:6px;flex-wrap:wrap;margin:6px 0 2px">${actions.map(([k, l, c]) => `<button type="button" class="btn ${c || 'ghost'} sm" data-act="${k}">${esc(l)}</button>`).join('')}</div>` : ''}
    <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>${ro ? 'Fermer' : 'Annuler'}</button>${ro ? '' : '<button class="btn" value="ok">Enregistrer</button>'}</div>`, async (f) => {
    if (ro) return true;
    if (!cl) throw new Error('Choisissez le client.');
    const body = { date: f.date.value, ref_client: f.ref_client.value.trim(), langue: f.langue.value, conditions: f.conditions.value.trim(), note: f.note.value.trim(),
      lignes: lignes.filter((l) => String(l.designation).trim()).map((l) => ({ produit: l.service ? '' : String(l.produit || '').trim().toUpperCase(), designation: String(l.designation).trim(), couleur: l.couleur || '', taille: l.taille || '', qte: +l.qte || 0, pu: +l.pu || 0, remise: +l.remise || 0, service: !!l.service })) };
    if (!x?.origine_id) body.client_id = cl.id;
    body.validite = f.validite.value || null;
    if (estExport()) { body.incoterm = f.incoterm.value; body.lieu_incoterm = f.lieu_incoterm.value.trim(); body.taux_change = f.taux_change?.value ? +f.taux_change.value : null; body.colisage = colis; }
    if (x) { body.version = x.version; await envoiVente('PUT', `/api/ventes/${type}/${x.id}`, body); toast(`${T.lib} ${x.numero} enregistré${type === 'devis' ? '' : 'e'}.`); }
    else { const r = await envoiVente('POST', '/api/ventes/' + type, body); toast(`${T.lib} ${r.numero} créé${type === 'devis' ? '' : 'e'}.`); }
    route(); return true;
  });
  const fen = $('#fen'), z = $('#fen-form');
  if (x && modifiable && !verrouMsg) fen.addEventListener('close', () => api('DELETE', `/api/verrous/${T.ent}/${x.id}`).catch(() => {}), { once: true });
  dessL(); dessExp();
  const pf = (ref) => produits.find((p) => p.reference === ref);
  z.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'vd-cl') { cl = clients.find((c) => c.id === t.value) || null; if (estExport() && !$('#vd-lg').dataset.touche) $('#vd-lg').value = 'en'; dessL(); dessExp(); }
    if (t.id === 'vd-lg') t.dataset.touche = '1';
    if (t.dataset.c === 'produit' && t.dataset.l !== undefined) {
      const l = lignes[+t.dataset.l], p = pf(String(t.value).trim().toUpperCase());
      if (p) {
        l.produit = p.reference;
        if (!l.designation) l.designation = `${libCode[p.code_article] || p.code_article}${p.client_nom ? ' — ' + p.client_nom : ''}`;
        if (prix && p.prix_ht && !(+l.pu)) {
          const tc = +($('#vd-tc')?.value || 0);
          l.pu = estExport() ? (tc > 0 ? Math.round(p.prix_ht / tc * 100) / 100 : 0) : r3(p.prix_ht * (1 + tvaDefaut / 100));
        }
        dessL();
      }
    }
  });
  z.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.l !== undefined) { lignes[+t.dataset.l][t.dataset.c] = t.value; majTot(); }
    if (t.dataset.k !== undefined) colis[+t.dataset.k][t.dataset.c] = t.value;
  });
  z.addEventListener('click', async (e) => {
    if (e.target.closest('[data-add]')) { lignes.push({ produit: '', designation: '', couleur: '', taille: '', qte: 1, pu: 0, remise: 0, service: false }); dessL(); }
    if (e.target.closest('[data-add-s]')) { lignes.push({ produit: '', designation: '', couleur: '', taille: '', qte: 1, pu: 0, remise: 0, service: true }); dessL(); }
    const d = e.target.closest('[data-del]'); if (d) { lignes.splice(+d.dataset.del, 1); dessL(); }
    if (e.target.closest('[data-kadd]')) { colis.push({ colis: String(colis.length + 1), contenu: '', quantite: 0, poids_net: 0, poids_brut: 0, dimensions: '' }); dessExp(); }
    const kd = e.target.closest('[data-kdel]'); if (kd) { colis.splice(+kd.dataset.kdel, 1); dessExp(); }
    const a = e.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act;
    try {
      if (act === 'imprimer') return imprimerVente(type, x);
      if (act.startsWith('statut:')) {
        const statut = act.slice(7); let motif;
        if (['refuse', 'annule', 'annulee'].includes(statut)) { motif = prompt(statut === 'refuse' ? 'Motif du refus :' : 'Motif de l’annulation :'); if (!motif?.trim()) return; }
        await api('POST', `/api/ventes/${type}/${x.id}/statut`, { statut, version: x.version, ...(motif ? { motif: motif.trim() } : {}) });
        toast('État mis à jour.'); fen.close(); return route();
      }
      if (act === 'proforma') {
        if (!confirm(`Créer une proforma à partir du devis ${x.numero} ? Le devis passera à « Transformé ».`)) return;
        const r = await api('POST', `/api/ventes/devis/${x.id}/proforma`, { version: x.version });
        toast(`Proforma ${r.numero} créée.`); fen.close(); location.hash = lien('commercial', 'proformas'); return route();
      }
      if (act === 'commande') {
        const liv = prompt('Date de livraison prévue (AAAA-MM-JJ), facultatif :', '') ?? null; if (liv === null) return;
        if (liv && !/^\d{4}-\d{2}-\d{2}$/.test(liv.trim())) return toast('Date attendue au format AAAA-MM-JJ.', true);
        const r = await api('POST', `/api/ventes/${type}/${x.id}/commande`, { version: x.version, ...(liv.trim() ? { livraison: liv.trim() } : {}) });
        GEST = null; versCadres({ type: 'rafraichir' });
        toast(`Commande ${r.commande.numero} créée : elle est dans Commercial › Commandes.`); fen.close(); return route();
      }
    } catch (x2) { toast(x2.message, true); }
  });
}
ECRANS.devis = (m) => ecranDevisPro(m, 'devis');
ECRANS.proformas = (m) => ecranDevisPro(m, 'proformas');

/* ---------------------------------------------------------------- Avoirs */
ECRANS.avoirs = async (m) => {
  if (exigeVis(m, 'Avoirs', ['prix'])) return;
  const [L, G] = await Promise.all([api('GET', '/api/ventes/avoirs'), gestion(true)]);
  const cree = peut('commercial.avoirs', 'creer'), ann = peut('commercial.avoirs', 'annuler'), modA = peut('commercial.avoirs', 'modifier');
  m.innerHTML = entete('Avoirs', 'Une facture émise ne se supprime jamais : on la corrige par un avoir (AV), partiel (quelques lignes, quelques pièces) ou total. L’avoir est imputé sur le reste dû de la facture ; s’il dépasse, le surplus est « à rembourser ».',
    `<div class="row-f">${rechercheHtml('Client, n° d’avoir ou de facture…')}${cree ? '<button class="btn cta" data-a="nouveau">+ Avoir</button>' : ''}</div>`) +
    `<div class="chiffres"><div class="chiffre"><b>${L.filter((a) => a.statut === 'emis').length}</b><span>avoir(s) émis</span></div>
      <div class="chiffre"><b>${md(L.filter((a) => a.statut === 'emis' && a.devise === 'DT').reduce((s, a) => s + a.net, 0))}</b><span>montant des avoirs (DT)</span></div>
      <div class="chiffre ${L.some((a) => a.statut === 'emis' && a.a_rembourser > 0) ? 'alerte' : ''}"><b>${md(L.filter((a) => a.statut === 'emis' && a.devise === 'DT').reduce((s, a) => s + (a.a_rembourser || 0), 0))}</b><span>à rembourser aux clients (DT)</span></div></div>
    <div class="panneau" id="liste" style="overflow:auto"></div>`;
  const dess = () => {
    const q = $('#recherche').value.trim().toLowerCase();
    const l = L.filter((a) => !q || JSON.stringify([a.numero, a.facture_num, a.client?.name, a.motif]).toLowerCase().includes(q));
    $('#liste').innerHTML = l.length ? `<table class="nombres"><thead><tr><th>N°</th><th>Date</th><th>Client</th><th>Facture</th><th>Motif</th><th class="n">Net</th><th class="n">À rembourser</th><th>État</th><th></th></tr></thead><tbody>
      ${l.map((a) => `<tr><td class="mono small"><b>${esc(a.numero)}</b></td><td>${jour(a.date)}</td><td>${esc(a.client?.name || '')}</td><td class="mono small">${esc(a.facture_num || '')}</td><td class="small">${esc(a.motif || '')}</td>
        <td class="n"><b>${md(a.net, a.devise)}</b></td><td class="n ${a.a_rembourser > 0 && a.statut === 'emis' ? 'rouge' : ''}">${a.a_rembourser > 0 ? md(a.a_rembourser, a.devise) : '—'}</td><td>${badgeV('avoirs', a)}</td>
        <td><div class="actions"><button class="btn ghost sm" data-a="imprimer" data-id="${a.id}">Imprimer</button>${a.statut === 'emis' && modA ? `<button class="btn ghost sm" data-a="modifier" data-id="${a.id}">Modifier</button>` : ''}${a.statut === 'emis' && ann ? `<button class="btn ghost sm" data-a="annuler" data-id="${a.id}">Annuler</button>` : ''}</div></td></tr>`).join('')}</tbody></table>`
      : `<div class="vide">${L.length ? 'Aucun avoir pour cette recherche.' : 'Aucun avoir pour l’instant.'}</div>`;
  };
  $('#recherche').oninput = dess; dess();
  m.onclick = async (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = L.find((y) => y.id === +b.dataset.id);
    if (b.dataset.a === 'imprimer') return imprimerVente('avoirs', a);
    if (b.dataset.a === 'annuler') {
      grandeFenetre(`<h3>Annuler l’avoir ${esc(a.numero)}</h3><div class="msg err" hidden role="alert"></div><p>L’avoir reste dans l’historique (statut « annulé ») et son imputation est retirée de la facture ${esc(a.facture_num)}.</p>
        <div class="champ"><label for="av-mot">Motif *</label><input id="av-mot" name="motif" required maxlength="300"></div>
        <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Retour</button><button class="btn danger" value="ok">Annuler l’avoir</button></div>`, async (f) => {
        await api('POST', `/api/ventes/avoirs/${a.id}/statut`, { statut: 'annule', motif: f.motif.value.trim(), version: a.version }); GEST = null; toast('Avoir annulé.'); route(); return true;
      });
      return;
    }
    if (b.dataset.a === 'nouveau') return nouvelAvoir(G);
    if (b.dataset.a === 'modifier') return modifierAvoir(a);
  };
};

// 0.9.1 : modifier les lignes d'un avoir émis (quantités, prix pour une erreur de prix, suppression de ligne).
// Le serveur recalcule le montant, refait l'imputation sur la facture et trace la modification ; verrou 30 min.
async function modifierAvoir(a) {
  let C;
  try { await api('POST', `/api/verrous/avoir/${a.id}`); C = await api('GET', `/api/ventes/factures/${encodeURIComponent(a.facture_id)}/creditable?sauf=${a.id}`); }
  catch (x) { toast(x.message, true); return; }
  const cur = Object.fromEntries((a.lignes || []).map((l) => [l.index, l]));
  grandeFenetre(`<h3>Modifier l’avoir ${esc(a.numero)} · facture ${esc(a.facture_num)}</h3><div class="msg err" hidden role="alert"></div>
    <p class="mute small">Quantité à 0 = ligne retirée de l’avoir. Le prix peut être baissé (erreur de prix), jamais au-dessus du prix facturé. L’imputation sur la facture est recalculée.</p>
    <div class="champ"><label for="am-m">Motif *</label><input id="am-m" name="motif" required maxlength="300" value="${esc(a.motif || '')}"></div>
    <div class="panneau" style="padding:6px 10px;margin-bottom:10px;overflow:auto"><table class="nombres"><thead><tr><th>Désignation</th><th class="n">Facturé</th><th class="n">Créditable</th><th class="n">P.U. facturé ${C.prix_ttc ? 'TTC' : 'HT'}</th><th class="n">P.U. avoir</th><th class="n">Qté avoir</th><th></th></tr></thead><tbody>
      ${C.lignes.map((l) => `<tr><td>${esc(l.designation)}</td><td class="n">${l.qte}</td><td class="n">${l.creditable}</td><td class="n">${md(l.pu, C.devise)}</td>
        <td class="n"><input data-pu="${l.index}" type="number" step="any" min="0" max="${l.pu}" value="${cur[l.index] ? cur[l.index].pu : l.pu}" style="width:90px" ${l.creditable <= 0 ? 'disabled' : ''}></td>
        <td class="n"><input data-q="${l.index}" type="number" step="any" min="0" max="${l.creditable}" value="${cur[l.index] ? cur[l.index].qte : 0}" style="width:80px" ${l.creditable <= 0 ? 'disabled' : ''}></td>
        <td>${cur[l.index] ? `<button type="button" class="btn ghost sm" data-raz="${l.index}" title="Retirer la ligne de l’avoir">✕</button>` : ''}</td></tr>`).join('')}</tbody></table>
      <div class="small" id="am-tot" style="padding:8px 0;text-align:right"></div></div>
    <div class="champ"><label for="am-n">Note</label><input id="am-n" name="note" maxlength="1000" value="${esc(a.note || '')}"></div>
    <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Annuler</button><button class="btn" value="ok">Enregistrer</button></div>`, async (f) => {
    const lignes = [...f.querySelectorAll('[data-q]')].map((i) => ({ index: +i.dataset.q, qte: +i.value || 0, pu: +f.querySelector(`[data-pu="${i.dataset.q}"]`).value || 0 })).filter((l) => l.qte > 0);
    if (!lignes.length) throw new Error('Un avoir garde au moins une ligne : pour tout retirer, annulez l’avoir.');
    const r = await api('PUT', `/api/ventes/avoirs/${a.id}`, { version: a.version, motif: f.motif.value.trim(), note: f.note.value.trim(), lignes });
    GEST = null; versCadres({ type: 'rafraichir' });
    toast(`Avoir ${r.numero} modifié (${md(r.net, r.devise)})${r.a_rembourser > 0 ? ` — ${md(r.a_rembourser, r.devise)} à rembourser` : ''}.`); route(); return true;
  });
  const fen = $('#fen'), z = $('#fen-form');
  fen.addEventListener('close', () => api('DELETE', `/api/verrous/avoir/${a.id}`).catch(() => {}), { once: true });
  const calc = () => {
    let s = 0; z.querySelectorAll('[data-q]').forEach((i) => { const l = C.lignes.find((x) => x.index === +i.dataset.q); s += (+i.value || 0) * (+z.querySelector(`[data-pu="${i.dataset.q}"]`).value || 0) * (1 - (l.remise || 0) / 100); });
    $('#am-tot').innerHTML = `Montant ${C.prix_ttc ? 'TTC' : 'HT'} des lignes : <b>${md(s, C.devise)}</b> (montant exact, FODEC et TVA calculés par le serveur)`;
  };
  z.addEventListener('input', calc);
  z.addEventListener('click', (e) => { const b = e.target.closest('[data-raz]'); if (b) { z.querySelector(`[data-q="${b.dataset.raz}"]`).value = 0; calc(); } });
  calc();
}

function nouvelAvoir(G) {
  const facs = (G.invoices || []).filter((f) => f.status !== 'annulee' && f.number).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  let C = null;
  grandeFenetre(`<h3>Nouvel avoir</h3><div class="msg err" hidden role="alert"></div>
    <div class="grille2"><div class="champ" style="grid-column:1/-1"><label for="av-f">Facture d’origine *</label><select id="av-f" name="facture" required><option value="">— Choisir —</option>
      ${facs.map((f) => `<option value="${esc(f.id)}">${esc(f.number)} · ${jour(f.date)} · ${esc(f.client?.name || '')}</option>`).join('')}</select></div>
      <div class="champ"><label for="av-d">Date de l’avoir</label><input type="date" id="av-d" name="date" value="${iso()}"></div>
      <div class="champ"><label for="av-m">Motif * (retour, erreur de prix, remise…)</label><input id="av-m" name="motif" required maxlength="300"></div></div>
    <div id="av-l" class="panneau" style="padding:6px 10px;margin-bottom:10px;overflow:auto"><div class="vide">Choisissez la facture.</div></div>
    <div class="champ"><label for="av-n">Note</label><input id="av-n" name="note" maxlength="1000"></div>
    <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Annuler</button><button class="btn" value="ok">Établir l’avoir</button></div>`, async (f) => {
    if (!C) throw new Error('Choisissez la facture.');
    const lignes = [...f.querySelectorAll('[data-q]')].map((i) => ({ index: +i.dataset.q, qte: +i.value || 0 })).filter((l) => l.qte > 0);
    const total = C.lignes.every((l) => l.creditable <= 0 || lignes.find((x) => x.index === l.index)?.qte === l.creditable);
    if (!lignes.length) throw new Error('Indiquez au moins une quantité à créditer.');
    const body = { facture_id: C.id, date: f.date.value, motif: f.motif.value.trim(), note: f.note.value.trim(), ...(total ? { total: true } : { lignes }) };
    const r = await api('POST', '/api/ventes/avoirs', body);
    GEST = null; versCadres({ type: 'rafraichir' });
    toast(`Avoir ${r.numero} établi (${md(r.net, r.devise)})${r.a_rembourser > 0 ? ` — ${md(r.a_rembourser, r.devise)} à rembourser au client` : ''}.`); route(); return true;
  });
  const z = $('#fen-form');
  const calc = () => {
    if (!C) return;
    let s = 0; z.querySelectorAll('[data-q]').forEach((i) => { const l = C.lignes[+i.dataset.q]; s += (+i.value || 0) * l.pu * (1 - (l.remise || 0) / 100); });
    const ht = C.prix_ttc ? s / (1 + C.tva / 100) : s, net = C.prix_ttc ? s : s * (1 + C.tva / 100);
    $('#av-tot').innerHTML = `Avoir : HT <b>${md(ht, C.devise)}</b> · <b>Net ${md(net, C.devise)}</b> · reste dû sur la facture ${md(C.reste, C.devise)}${net > C.reste + 0.0005 ? ` → <b class="rouge">${md(net - C.reste, C.devise)} à rembourser</b>` : ''}`;
  };
  z.addEventListener('change', async (e) => {
    if (e.target.id !== 'av-f') return;
    C = null; $('#av-l').innerHTML = '<div class="vide">Chargement…</div>';
    if (!e.target.value) return;
    try { C = await api('GET', `/api/ventes/factures/${encodeURIComponent(e.target.value)}/creditable`); } catch (x) { $('#av-l').innerHTML = `<div class="vide">${esc(x.message)}</div>`; return; }
    $('#av-l').innerHTML = `<table class="nombres"><thead><tr><th>Désignation</th><th class="n">Facturé</th><th class="n">Déjà crédité</th><th class="n">P.U. ${C.prix_ttc ? 'TTC' : 'HT'}</th><th class="n">À créditer</th></tr></thead><tbody>
      ${C.lignes.map((l) => `<tr><td>${esc(l.designation)}</td><td class="n">${l.qte}</td><td class="n">${l.credite || '—'}</td><td class="n">${md(l.pu, C.devise)}</td>
        <td class="n"><input data-q="${l.index}" type="number" step="any" min="0" max="${l.creditable}" value="0" style="width:80px" ${l.creditable <= 0 ? 'disabled' : ''}></td></tr>`).join('')}</tbody></table>
      <div class="row-f" style="justify-content:space-between;padding:8px 0"><button type="button" class="btn ghost sm" data-tout>Tout créditer (avoir total)</button><span class="small" id="av-tot"></span></div>`;
    calc();
  });
  z.addEventListener('input', (e) => { if (e.target.dataset.q !== undefined) calc(); });
  z.addEventListener('click', (e) => { if (e.target.closest('[data-tout]')) { z.querySelectorAll('[data-q]').forEach((i) => { i.value = C.lignes[+i.dataset.q].creditable; }); calc(); } });
}

/* ---------------------------------------------------------------- Colisage et documents export des factures */
ECRANS.colisage = async (m) => {
  if (exigeVis(m, 'Documents export', ['prix'])) return;
  const G = await gestion(true);
  const facs = (G.invoices || []).filter((f) => f.status !== 'annulee' && (f.export || ['EUR', 'USD'].includes(f.currency))).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const modif = peut('commercial.factures', 'modifier');
  m.innerHTML = entete('Documents export', 'Factures export (EUR / USD, TVA 0 %) : liste de colisage (packing list) et impression de la facture en anglais ou en français, avec Incoterm et poids.', rechercheHtml('Client, n° de facture…')) +
    `<div class="panneau" id="liste" style="overflow:auto"></div>`;
  const dess = () => {
    const q = $('#recherche').value.trim().toLowerCase();
    const l = facs.filter((f) => !q || JSON.stringify([f.number, f.client?.name]).toLowerCase().includes(q));
    $('#liste').innerHTML = l.length ? `<table class="nombres"><thead><tr><th>Facture</th><th>Date</th><th>Client</th><th>Devise</th><th>Incoterm</th><th></th></tr></thead><tbody>
      ${l.map((f) => `<tr><td class="mono small"><b>${esc(f.number)}</b></td><td>${jour(f.date)}</td><td>${esc(f.client?.name || '')}</td><td>${esc(f.currency || 'DT')}</td><td>${esc(f.incoterm || '—')}</td>
        <td><div class="actions"><button class="btn ghost sm" data-c="colis" data-id="${esc(f.id)}">Colisage</button><button class="btn ghost sm" data-c="pl" data-id="${esc(f.id)}">Packing list</button></div></td></tr>`).join('')}</tbody></table>`
      : '<div class="vide">Aucune facture export. Une facture est « export » quand le client est de type Export (EUR / USD) dans Commercial › Clients.</div>';
  };
  $('#recherche').oninput = dess; dess();
  m.onclick = async (e) => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    const f = facs.find((x) => x.id === b.dataset.id);
    try {
      const K = await api('GET', `/api/ventes/colisage/${encodeURIComponent(f.id)}`);
      if (b.dataset.c === 'pl') return imprimerColisage(f, K.colis, f.langue === 'fr' ? 'fr' : 'en');
      let colis = K.colis.length ? K.colis.map((c) => ({ ...c })) : [{ colis: '1', contenu: '', quantite: 0, poids_net: 0, poids_brut: 0, dimensions: '' }];
      const dis = modif ? '' : 'disabled';
      const dessC = () => {
        $('#kc').innerHTML = `<table class="nombres"><thead><tr><th>Colis</th><th>Contenu</th><th class="n">Qté</th><th class="n">Net kg</th><th class="n">Brut kg</th><th>Dimensions</th><th></th></tr></thead><tbody>
          ${colis.map((c, i) => `<tr><td><input data-k="${i}" data-c2="colis" value="${esc(c.colis)}" style="width:50px" ${dis}></td><td><input data-k="${i}" data-c2="contenu" value="${esc(c.contenu)}" style="width:100%" ${dis}></td>
            <td class="n"><input data-k="${i}" data-c2="quantite" type="number" min="0" value="${c.quantite}" style="width:70px" ${dis}></td><td class="n"><input data-k="${i}" data-c2="poids_net" type="number" step="0.001" min="0" value="${c.poids_net}" style="width:80px" ${dis}></td>
            <td class="n"><input data-k="${i}" data-c2="poids_brut" type="number" step="0.001" min="0" value="${c.poids_brut}" style="width:80px" ${dis}></td><td><input data-k="${i}" data-c2="dimensions" value="${esc(c.dimensions)}" style="width:100px" ${dis}></td>
            <td>${modif ? `<button type="button" class="btn ghost sm" data-kdel="${i}">✕</button>` : ''}</td></tr>`).join('')}</tbody></table>${modif ? '<button type="button" class="btn ghost sm" data-kadd style="margin-top:6px">+ Colis</button>' : ''}`;
      };
      grandeFenetre(`<h3>Colisage · facture ${esc(f.number)} · ${esc(f.client?.name || '')}</h3><div class="msg err" hidden role="alert"></div>
        <p class="mute small">Quantités facturées : ${(f.lines || []).reduce((s, l) => s + (+l.qty || 0), 0)} pièce(s).</p><div id="kc" class="panneau" style="padding:6px 10px;overflow:auto"></div>
        <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>${modif ? 'Annuler' : 'Fermer'}</button>${modif ? '<button class="btn" value="ok">Enregistrer</button>' : ''}</div>`, async () => {
        if (!modif) return true;
        await api('PUT', `/api/ventes/colisage/${encodeURIComponent(f.id)}`, { colis, version: K.version }); toast('Colisage enregistré.'); return true;
      });
      dessC();
      const z = $('#fen-form');
      z.addEventListener('input', (ev) => { const t = ev.target; if (t.dataset.k !== undefined) colis[+t.dataset.k][t.dataset.c2] = t.value; });
      z.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-kadd]')) { colis.push({ colis: String(colis.length + 1), contenu: '', quantite: 0, poids_net: 0, poids_brut: 0, dimensions: '' }); dessC(); }
        const kd = ev.target.closest('[data-kdel]'); if (kd) { colis.splice(+kd.dataset.kdel, 1); dessC(); }
      });
    } catch (x) { toast(x.message, true); }
  };
};

/* ---------------------------------------------------------------- Impression FR / EN */
const LIB_V = {
  fr: { devis: 'DEVIS', proformas: 'FACTURE PROFORMA', avoirs: 'AVOIR', pl: 'LISTE DE COLISAGE', no: 'N°', date: 'Date', validite: 'Valable jusqu’au', client: 'Client', ref: 'Votre référence',
    facture: 'Facture d’origine', motif: 'Motif', art: 'Réf.', des: 'Désignation', coul: 'Couleur', tai: 'Taille', qte: 'Qté', pu: 'P.U.', rem: 'Remise', tot: 'Total HT',
    ht: 'Total HT', tva: 'TVA', net: 'Net à payer', netAv: 'Montant de l’avoir', inc: 'Incoterm', dev: 'Devise', cond: 'Conditions', note: 'Note', banque: 'Banque', rib: 'RIB',
    exp: 'Vente à l’exportation — TVA 0 %', colis: 'Colis', contenu: 'Contenu', pn: 'Poids net (kg)', pb: 'Poids brut (kg)', dim: 'Dimensions', totaux: 'Totaux', sig: 'Cachet et signature', mf: 'MF', rc: 'RC', tel: 'Tél.', annule: 'ANNULÉ' },
  en: { devis: 'QUOTATION', proformas: 'PROFORMA INVOICE', avoirs: 'CREDIT NOTE', pl: 'PACKING LIST', no: 'No.', date: 'Date', validite: 'Valid until', client: 'Customer', ref: 'Your reference',
    facture: 'Original invoice', motif: 'Reason', art: 'Ref.', des: 'Description', coul: 'Colour', tai: 'Size', qte: 'Qty', pu: 'Unit price', rem: 'Disc.', tot: 'Amount',
    ht: 'Total excl. VAT', tva: 'VAT', net: 'Total due', netAv: 'Credit amount', inc: 'Incoterm', dev: 'Currency', cond: 'Terms', note: 'Note', banque: 'Bank', rib: 'IBAN / RIB',
    exp: 'Export sale — VAT 0 %', colis: 'Package', contenu: 'Contents', pn: 'Net weight (kg)', pb: 'Gross weight (kg)', dim: 'Dimensions', totaux: 'Totals', sig: 'Stamp and signature', mf: 'Tax ID', rc: 'Trade reg.', tel: 'Tel.', annule: 'CANCELLED' },
};
const CSS_IMP = `body{font:12.5px/1.45 Arial,sans-serif;color:#14263a;margin:28px auto;max-width:780px}h1{font-size:20px;color:#1f4f7d;margin:0}
  .t{display:flex;justify-content:space-between;gap:24px;margin-bottom:18px}.soc b{font-size:15px}.box{border:1px solid #d1dbe5;border-radius:8px;padding:10px 12px}
  table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border-bottom:1px solid #d1dbe5;padding:6px 8px;text-align:left;vertical-align:top}th{background:#eef2f7;font-size:11.5px}
  td.n,th.n{text-align:right;white-space:nowrap}.tot{margin-left:auto;width:46%}.tot td{border:none;padding:3px 8px}.tot tr.g td{font-weight:700;font-size:14px;border-top:2px solid #1f4f7d}
  .m{font-size:11px;color:#55606b;margin-top:14px}.sig{margin-top:30px;display:flex;justify-content:flex-end}.sig div{width:42%;border:1px solid #d1dbe5;height:80px;padding:8px;color:#6b7885}
  .ann{color:#c0392b;font-weight:700}.saut{page-break-before:always}@media print{button{display:none}}`;
const socHtml = (s, L) => `<div class="soc">${s.logo ? `<img src="${esc(s.logo)}" alt="" style="max-height:56px;display:block;margin-bottom:6px">` : ''}<b>${esc(s.nom)}</b><br>${esc(s.adresse)} ${esc(s.ville)}<br>${s.telephone ? L.tel + ' ' + esc(s.telephone) + '<br>' : ''}${s.email ? esc(s.email) + '<br>' : ''}${L.mf} : ${esc(s.mf || '—')}${s.rc ? ' · ' + L.rc + ' : ' + esc(s.rc) : ''}</div>`;
const cliHtml = (c, L) => `<div class="box"><b>${L.client}</b><br>${esc(c?.name || '')}<br>${esc(c?.address || '')} ${esc(c?.city || '')}${c?.country ? '<br>' + esc(c.country) : ''}${c?.mf ? `<br>${L.mf} : ${esc(c.mf)}` : ''}</div>`;
function fenetreImp(titre, corps, lang) {
  const w = window.open('', '_blank'); if (!w) { toast('Autorisez les fenêtres pour imprimer.', true); return; }
  w.document.write(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(titre)}</title><style>${CSS_IMP}</style></head><body><button onclick="print()" style="float:right;padding:8px 14px">${lang === 'en' ? 'Print' : 'Imprimer'}</button>${corps}</body></html>`);
  w.document.close();
}
function tableColis(colis, L) {
  const s = (k) => colis.reduce((a, c) => a + (+c[k] || 0), 0);
  return `<table><thead><tr><th>${L.colis}</th><th>${L.contenu}</th><th class="n">${L.qte}</th><th class="n">${L.pn}</th><th class="n">${L.pb}</th><th>${L.dim}</th></tr></thead><tbody>
    ${colis.map((c) => `<tr><td>${esc(c.colis)}</td><td>${esc(c.contenu)}</td><td class="n">${c.quantite}</td><td class="n">${(+c.poids_net || 0).toFixed(3)}</td><td class="n">${(+c.poids_brut || 0).toFixed(3)}</td><td>${esc(c.dimensions || '')}</td></tr>`).join('')}
    <tr><th>${L.totaux}</th><th>${colis.length} ${L.colis.toLowerCase()}(s)</th><th class="n">${s('quantite')}</th><th class="n">${s('poids_net').toFixed(3)}</th><th class="n">${s('poids_brut').toFixed(3)}</th><th></th></tr></tbody></table>`;
}
// 0.9.1 : devis, proformas et avoirs imprimés au format DIGITAL-TEX (même gabarit que les factures et BL de la Gestion).
// La liste de colisage (export) garde sa mise en page propre (imprimerColisage).
async function imprimerVente(type, d) {
  try {
    if (!window.DocsDT) throw new Error('Module d’impression non chargé : rechargez la page (Ctrl+F5).');
    const soc = await api('GET', '/api/parametres/societe').catch(() => ({}));
    const G = await gestion().catch(() => null);
    const cl = G && (G.clients || []).find((c) => c.id === d.client_id);
    const bytes = await window.DocsDT.buildDocDT(window.DocsDT.dataVente(type, d, { clientCode: (cl && cl.code) || '', societe: soc }));
    ouvrirPdfDT(`${d.numero}.pdf`, bytes);
    if ((d.colisage || []).length) await imprimerColisage({ number: d.numero, date: d.date, incoterm: d.incoterm, client: d.client }, d.colisage, d.langue === 'en' ? 'en' : 'fr');
  } catch (x) { toast(x.message, true); }
}
function ouvrirPdfDT(nom, bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const w = window.open(url, '_blank');
  if (!w) { const a = document.createElement('a'); a.href = url; a.download = nom; document.body.appendChild(a); a.click(); a.remove(); }
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}
async function imprimerColisage(f, colis, lang) {
  if (!colis.length) return toast('Saisissez d’abord le colisage de cette facture.', true);
  const soc = await api('GET', '/api/parametres/societe'), L = LIB_V[lang];
  fenetreImp(`${L.pl} ${f.number}`, `<div class="t">${socHtml(soc, L)}<div style="text-align:right"><h1>${L.pl}</h1><div>${lang === 'en' ? 'Invoice' : 'Facture'} <b>${esc(f.number)}</b></div><div>${L.date} : ${jour(f.date)}</div>
    ${f.incoterm ? `<div>${L.inc} : ${esc(f.incoterm)}</div>` : ''}</div></div>${cliHtml(f.client, L)}${tableColis(colis, L)}<div class="sig"><div>${L.sig}</div></div>`, lang);
}
