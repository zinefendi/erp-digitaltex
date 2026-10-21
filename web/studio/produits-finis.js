'use strict';
// Produits finis (lot 0.8.0) — écran web. Session par cookie (comme la Gestion), aucun prix
// n'est affiché si le serveur ne l'envoie pas (masquage côté serveur, règle CDC § 5.2).
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n3 = (v) => (v === undefined || v === null) ? '—' : Number(v).toFixed(3);
  const sexeL = { B: 'Bébé', E: 'Enfant', F: 'Femme', H: 'Homme', U: 'Unisexe' };

  let PRODUITS = [], CODES = [], CLIENTS = [], TARIFS = [], TARIFS_DETAIL = { couts: [], tarifs: [] }, COUTS = null, DROITS = null;

  async function api(method, url, body) {
    const opt = { method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) { opt.headers['content-type'] = 'application/json'; opt.body = JSON.stringify(body); }
    const r = await fetch('/api' + url, opt);
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { location.href = '/'; throw new Error('Session expirée.'); }
    if (!r.ok) { const e = new Error(d.message || 'Erreur (' + r.status + ')'); e.code = d.erreur; e.extra = d; throw e; }
    return d;
  }
  const flash = (m, err) => {
    const f = document.createElement('div'); f.className = 'flash' + (err ? ' err' : ''); f.textContent = m;
    document.body.appendChild(f); setTimeout(() => f.remove(), 4200);
  };

  // ---------------------------------------------------------------- chargement
  async function charger() {
    [PRODUITS, CODES, TARIFS] = await Promise.all([api('GET', '/produits'), api('GET', '/produits/codes-article'), api('GET', '/produits/couts')]);
    COUTS = TARIFS.couts ? Object.fromEntries((TARIFS.couts || []).filter((c) => c.en_vigueur).map((c) => [c.code, c])) : null;
    TARIFS_DETAIL = { couts: TARIFS.couts || [], tarifs: TARIFS.tarifs || [] }; TARIFS = TARIFS.tarifs || [];
    try { const g = await api('GET', '/commercial/gestion'); CLIENTS = g.clients || []; } catch (_) { CLIENTS = []; }
    try {
      const acc = await api('GET', '/accueil');
      DROITS = { super_admin: acc.super_admin, prix: (acc.visibilites || []).includes('prix') };
      for (const m of acc.modules) for (const f of m.fonctions) DROITS[f.code] = f.actions || [];
    } catch (_) { DROITS = {}; }
    const peut = (f, a) => (DROITS.super_admin || (DROITS[f] || []).includes(a));
    $('#btn-new').classList.toggle('hide', !peut('commercial.produits_finis', 'creer'));
    $('#btn-conv').classList.toggle('hide', !peut('commercial.produits_finis', 'creer'));
    $('#btn-codes').classList.toggle('hide', !peut('parametres.codes_article', 'lire'));
    $('#btn-couts').classList.toggle('hide', !peut('parametres.couts', 'lire'));
    $('#note-prix').textContent = PRODUITS.length && PRODUITS[0].prix_ht === undefined
      ? 'Les prix et coûts ne vous sont pas envoyés par le serveur (règle de confidentialité).' : '';
    afficher();
  }

  const fiche = (id) => PRODUITS.find((p) => p.id === id);
  function afficher() {
    const q = $('#q').value.trim().toLowerCase(), fe = $('#fetat').value;
    const rows = PRODUITS.filter((p) => (!fe || p.etat === fe)
      && (!q || [p.reference, p.client_nom, p.code_article].join(' ').toLowerCase().includes(q)));
    $('#compte').textContent = rows.length + ' produit(s) affiché(s) sur ' + PRODUITS.length;
    const voitPrix = PRODUITS.length && PRODUITS[0].prix_ht !== undefined;
    const voitPri = PRODUITS.length && PRODUITS[0].pri !== undefined;
    $('#liste').innerHTML = rows.map((p) => `<tr data-open="${p.id}">
      <td class="b">${esc(p.reference)}</td><td>${esc(p.code_article)}</td>
      <td>${esc(p.client_nom || '—')}</td>
      <td><span class="${p.etat === 'specifique' ? 'warn' : 'ok'}">${p.etat === 'specifique' ? 'Spécifique' : 'Basique'}</span></td>
      <td class="small">${esc((p.taillant || []).join(', '))}</td>
      <td class="n b">${voitPrix ? n3(p.prix_ht) : '—'}</td>
      <td class="n">${voitPri ? n3(p.pri) : '—'}</td>
      <td class="small">${(p.maj_le || '').slice(0, 16).replace('T', ' ')}</td>
      <td>${p.annule ? '<span class="mute">annulé</span>' : '<button class="sm" data-edit="' + p.id + '">Ouvrir</button>'}</td></tr>`).join('')
      || '<tr><td colspan="9" class="mute">Aucun produit fini.</td></tr>';
  }

  // ---------------------------------------------------------------- dialogue générique
  function dlg(html) { $('#dlg').innerHTML = '<div>' + html + '</div>'; $('#dlg').style.display = 'flex'; }
  function fermer() { $('#dlg').style.display = 'none'; $('#dlg').innerHTML = ''; }
  $('#dlg').addEventListener('click', (e) => { if (e.target.id === 'dlg') fermer(); });

  // lignes éditables BOM / gamme / marquages
  const bomRow = (l = {}) => `<div class="row" data-l="bom"><input class="w" data-k="designation" placeholder="Désignation matière" value="${esc(l.designation)}">
    <input data-k="qte" type="number" min="0" step="0.001" placeholder="Quantité" value="${esc(l.qte ?? '')}"><input data-k="pu" type="number" min="0" step="0.001" placeholder="Prix unitaire" value="${esc(l.pu ?? '')}"><button class="sm" data-del>✕</button></div>`;
  const gammeRow = (l = {}) => `<div class="row" data-l="gamme"><input class="w" data-k="operation" placeholder="Opération" value="${esc(l.operation)}"><input data-k="temps_min" type="number" min="0" step="0.001" placeholder="Minutes" value="${esc(l.temps_min ?? '')}"><button class="sm" data-del>✕</button></div>`;
  const marqRow = (l = {}) => `<div class="row" data-l="marq">
    <select data-k="type">${TARIFS.map((t) => `<option value="${esc(t.code)}" ${t.code === l.type ? 'selected' : ''}>${esc(t.libelle)} (${esc(t.unite)})</option>`).join('')}</select>
    <input data-k="faces" type="number" min="0" step="1" placeholder="Faces" value="${esc(l.faces ?? '')}"><input data-k="points" type="number" min="0" step="1" placeholder="Points" value="${esc(l.points ?? '')}"><button class="sm" data-del>✕</button></div>`;

  function formulaire(p, nextRef) {
    const voitPrix = p ? p.prix_ht !== undefined : DROITS.prix;
    const peutPrix = DROITS.super_admin || (DROITS['commercial.produits_finis'] || []).includes('creer');
    const prixSaisissable = voitPrix; // le serveur refuse la saisie de prix sans la visibilité
    dlg(`<h3>${p ? 'Produit fini ' + esc(p.reference) : 'Nouveau produit fini'}</h3>
    <div class="row">
      <label>Code article<select id="f-code" ${p ? 'disabled' : ''}>${CODES.filter((c) => c.actif).map((c) => `<option value="${esc(c.code)}" ${p && p.code_article === c.code ? 'selected' : ''}>${esc(c.code)} — ${esc(c.libelle)}</option>`).join('')}</select></label>
      <label>Sexe<select id="f-sexe" ${p ? 'disabled' : ''}>${Object.entries(sexeL).map(([k, v]) => `<option value="${k}" ${p && p.sexe === k ? 'selected' : ''}>${k} — ${v}</option>`).join('')}</select></label>
      <label>Client (vide = basique)<select id="f-client"><option value="">— Aucun —</option>${CLIENTS.map((c) => `<option value="${esc(c.id)}" ${p && p.client_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label>Taillant (séparés par des virgules)<input id="f-taillant" placeholder="S, M, L, XL" value="${esc(p ? (p.taillant || []).join(', ') : '')}"></label>
    </div>
    ${p ? '' : `<p class="small mute">Référence qui sera attribuée : <b>${esc(nextRef || '…')}</b> (par le serveur, dans la transaction).</p>`}
    <div class="calc">${voitPrix || !p ? '' : ''}
      ${COUTS ? `<div><span>Coût minute</span><b>${n3(COUTS.cout_minute)} DT</b></div><div><span>Perte</span><b>${n3(COUTS.perte_matiere)} %</b></div><div><span>Marge par défaut</span><b>${n3(COUTS.marge_defaut)} %</b></div>` : ''}
    </div>
    <h2 style="margin-top:12px">BOM — matières (quantité × prix unitaire)</h2>
    <div class="lignes" id="l-bom">${(p ? p.bom || [] : []).map(bomRow).join('')}</div>
    <button class="sm" data-add="bom">+ Ligne matière</button>
    <h2 style="margin-top:12px">Gamme d'assemblage (Σ temps des opérations)</h2>
    <div class="lignes" id="l-gamme">${(p ? p.gamme || [] : []).map(gammeRow).join('')}</div>
    <button class="sm" data-add="gamme">+ Opération</button>
    <h2 style="margin-top:12px">Marquages (tarifs des Paramètres)</h2>
    ${TARIFS.length ? `<div class="lignes" id="l-marq">${(p ? p.marquages || [] : []).map(marqRow).join('')}</div><button class="sm" data-add="marq">+ Marquage</button>`
      : '<p class="small warn">Aucun tarif de marquage en vigueur : saisissez les tarifs dans « Coûts &amp; tarifs » pour utiliser des marquages.</p>'}
    <h2 style="margin-top:12px">Prix</h2>
    <div class="row">
      ${prixSaisissable ? `<label>Source du prix<select id="f-source"><option value="calcule" ${!p || p.prix_source === 'calcule' ? 'selected' : ''}>Calculé (PRI × marge)</option><option value="manuel" ${p && p.prix_source === 'manuel' ? 'selected' : ''}>Saisi à la main</option><option value="devis" ${p && p.prix_source === 'devis' ? 'selected' : ''}>D'après un devis (notez le n° dans la note)</option></select></label>
      <label>Prix de vente HT<input id="f-prix" type="number" min="0" step="0.001" value="${esc(p ? p.prix_ht : '')}"></label>
      <label>Marge % (vide = défaut)<input id="f-marge" type="number" min="0" step="0.1" value="${esc(p && p.marge !== undefined ? p.marge : '')}"></label>` : '<p class="small mute">Le prix est calculé par le serveur. Vous ne voyez pas les montants.</p>'}
    </div>
    <label style="margin-top:8px">Note<input id="f-note" value="${esc(p ? p.note : '')}"></label>
    ${p ? `<p class="small mute">Version ${p.version} · état ${p.etat === 'specifique' ? 'spécifique' : 'basique'} (changer les marquages fait passer de l'un à l'autre, la référence ne change pas).</p>` : ''}
    <label class="small hide" id="lbl-perte" style="flex-direction:row;gap:6px;align-items:center"><input type="checkbox" id="f-perte"> Confirmer la vente à perte</label>
    <div class="actions">
      ${p ? '<button data-annuler>Annuler le produit</button>' : ''}
      <button data-fermer>Fermer</button>
      <button class="primary" data-enregistrer>${p ? 'Enregistrer' : 'Créer le produit fini'}</button>
    </div>`);
    $('#dlg').dataset.edit = p ? p.id : '';
    $('#dlg').dataset.version = p ? p.version : '';
    // saisie prix à la main : préremplir avec le prix calculé (le serveur recalcule de toute façon)
  }

  function lireLignes(sel, kind) {
    return [...document.querySelectorAll(sel + ' .row')].map((r) => {
      const v = (k) => r.querySelector(`[data-k="${k}"]`)?.value;
      if (kind === 'bom') return { designation: v('designation'), qte: +v('qte') || 0, pu: +v('pu') || 0 };
      if (kind === 'gamme') return { operation: v('operation'), temps_min: +v('temps_min') || 0 };
      return { type: v('type'), libelle: '', faces: +v('faces') || 0, points: +v('points') || 0 };
    });
  }
  async function enregistrer() {
    const id = $('#dlg').dataset.edit;
    const corps = {
      bom: lireLignes('#l-bom', 'bom'), gamme: lireLignes('#l-gamme', 'gamme'),
      marquages: lireLignes('#l-marq', 'marq'),
      taillant: $('#f-taillant').value.split(',').map((s) => s.trim()).filter(Boolean),
      client_id: $('#f-client').value || null,
      note: $('#f-note').value.trim(),
    };
    if ($('#f-source')) { corps.prix_source = $('#f-source').value; }
    if ($('#f-prix') && $('#f-source')?.value !== 'calcule') corps.prix_ht = +$('#f-prix').value || 0;
    if ($('#f-marge')?.value !== '') corps.marge = +$('#f-marge').value;
    if ($('#f-perte')?.checked) corps.confirmer_perte = true;
    try {
      if (id) { corps.version = Number($('#dlg').dataset.version); await api('PUT', '/produits/' + id, corps); flash('Produit enregistré.'); }
      else { const f = await api('POST', '/produits', { ...corps, code_article: $('#f-code').value, sexe: $('#f-sexe').value }); flash('Produit fini ' + f.reference + ' créé.'); }
      fermer(); await charger();
    } catch (e) {
      if (e.code === 'vente_a_perte') {
        $('#lbl-perte').classList.remove('hide');
        flash(e.message, true);
      } else flash(e.message, true);
    }
  }

  // ---------------------------------------------------------------- codes article
  function ecranCodes() {
    dlg(`<h3>Codes article (produits finis)</h3>
    <table><thead><tr><th>Code</th><th>Libellé</th><th>Actif</th><th></th></tr></thead><tbody>
    ${CODES.map((c) => `<tr><td class="b">${esc(c.code)}</td><td>${esc(c.libelle)}</td><td>${c.actif ? 'oui' : 'désactivé'}</td>
      <td>${c.actif ? `<button class="sm" data-cdel="${esc(c.code)}" data-cver="${c.version}">Désactiver</button>` : ''}</td></tr>`).join('')}</tbody></table>
    <div class="row" style="margin-top:10px"><label>Code<input id="c-code" maxlength="10" style="text-transform:uppercase"></label>
      <label>Libellé<input id="c-lib"></label><button class="primary sm" data-cadd>Ajouter</button></div>
    <div class="actions"><button data-fermer>Fermer</button></div>`);
  }
  async function ajouterCode() {
    try { CODES = await api('POST', '/produits/codes-article', { code: $('#c-code').value, libelle: $('#c-lib').value }); flash('Code ajouté.'); ecranCodes(); }
    catch (e) { flash(e.message, true); }
  }
  async function desactiverCode(code, version) {
    if (!confirm('Désactiver le code ' + code + ' ? Il restera dans la liste (rien n\'est supprimé).')) return;
    try { await api('DELETE', '/produits/codes-article/' + encodeURIComponent(code)); await charger(); ecranCodes(); }
    catch (e) { flash(e.message, true); }
  }

  // ---------------------------------------------------------------- coûts & tarifs
  function ecranCouts() {
    const d = TARIFS_DETAIL;
    dlg(`<h3>Coûts et tarifs de production (valeurs datées)</h3>
    <h2 style="margin-top:8px">Coûts</h2>
    <table><thead><tr><th>Code</th><th>Libellé</th><th class="n">Valeur</th><th>Unité</th><th>En vigueur le</th><th>Actuel</th></tr></thead><tbody>
    ${(d.couts || []).map((c) => `<tr><td>${esc(c.code)}</td><td>${esc(c.libelle)}</td><td class="n b">${n3(c.valeur)}</td><td>${esc(c.unite)}</td><td>${esc(c.en_vigueur_le)}</td><td>${c.en_vigueur ? '<span class="ok b">oui</span>' : ''}</td></tr>`).join('')}</tbody></table>
    <div class="row" style="margin-top:10px">
      <label>Coût<select id="k-code"><option value="cout_minute">Coût minute (DT)</option><option value="perte_matiere">Perte matière (%)</option><option value="marge_defaut">Marge par défaut (%)</option></select></label>
      <label>Valeur<input id="k-val" type="number" min="0" step="0.001"></label>
      <label>En vigueur le<input id="k-date" type="date"></label><button class="primary sm" data-kadd>Nouvelle valeur datée</button>
    </div>
    <h2 style="margin-top:14px">Tarifs de marquage</h2>
    <table><thead><tr><th>Code</th><th>Libellé</th><th>Unité</th><th class="n">Prix</th><th>En vigueur le</th><th>Actuel</th></tr></thead><tbody>
    ${(d.tarifs || []).map((t) => `<tr><td>${esc(t.code)}</td><td>${esc(t.libelle)}</td><td>${esc(t.unite)}</td><td class="n b">${n3(t.prix)}</td><td>${esc(t.en_vigueur_le)}</td><td>${t.en_vigueur ? '<span class="ok b">oui</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="mute">Aucun tarif saisi.</td></tr>'}</tbody></table>
    <div class="row" style="margin-top:10px">
      <label>Libellé<input id="t-lib" placeholder="Ex. : Impression 1 face"></label>
      <label>Unité<select id="t-unite"><option value="par_face">par face</option><option value="par_1000_points">par 1 000 points</option><option value="par_piece">par pièce</option></select></label>
      <label>Prix<input id="t-prix" type="number" min="0" step="0.001"></label>
      <label>En vigueur le<input id="t-date" type="date"></label><button class="primary sm" data-tadd>Ajouter le tarif</button>
    </div>
    <div class="actions"><button data-fermer>Fermer</button></div>`);
    $('#k-date').value = new Date().toISOString().slice(0, 10);
    $('#t-date').value = new Date().toISOString().slice(0, 10);
  }
  async function ajouterCout() {
    try { const r = await api('POST', '/produits/couts', { code: $('#k-code').value, valeur: +$('#k-val').value, en_vigueur_le: $('#k-date').value }); TARIFS_DETAIL = r; TARIFS = r.tarifs || []; flash('Valeur ajoutée.'); ecranCouts(); }
    catch (e) { flash(e.message, true); }
  }
  async function ajouterTarif() {
    const lib = $('#t-lib').value.trim();
    const code = lib.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 39);
    try { const r = await api('POST', '/produits/tarifs-marquages', { code, libelle: lib, unite: $('#t-unite').value, prix: +$('#t-prix').value, en_vigueur_le: $('#t-date').value }); TARIFS_DETAIL = r; TARIFS = r.tarifs || []; flash('Tarif ajouté.'); ecranCouts(); }
    catch (e) { flash(e.message, true); }
  }

  // ---------------------------------------------------------------- conversion articles 0.7.0
  async function ecranConversion() {
    let articles = [];
    try { articles = (await api('GET', '/commercial/articles')).filter((a) => a.type === 'produit' && !a.produit_id && a.actif); } catch (_) { /* */ }
    dlg(`<h3>Convertir un article (0.7.0) en produit fini</h3>
    <p class="small mute">L'ancien code reste en alias sur l'article ; les prestations (transport…) ne se convertissent pas.</p>
    <table><thead><tr><th>Code</th><th>Désignation</th><th>Code article PF</th><th>Sexe</th><th></th></tr></thead><tbody>
    ${articles.map((a) => `<tr><td class="b">${esc(a.code)}</td><td>${esc(a.designation)}</td>
      <td><select data-conv-code><option value="">— choisir —</option>${CODES.filter((c) => c.actif).map((c) => `<option value="${esc(c.code)}">${esc(c.code)} — ${esc(c.libelle)}</option>`).join('')}</select></td>
      <td><select data-conv-sexe>${Object.keys(sexeL).map((k) => `<option value="${k}">${k}</option>`).join('')}</select></td>
      <td><button class="sm primary" data-conv="${a.id}">Convertir</button></td></tr>`).join('') || '<tr><td colspan="5" class="mute">Tous les articles produits sont déjà convertis.</td></tr>'}</tbody></table>
    <div class="actions"><button data-fermer>Fermer</button></div>`);
  }
  async function convertir(id) {
    const ligne = document.querySelector(`[data-conv="${id}"]`).closest('tr');
    const code = ligne.querySelector('[data-conv-code]').value, sexe = ligne.querySelector('[data-conv-sexe]').value;
    if (!code) return flash('Choisissez le code article du produit fini.', true);
    try { const f = await api('POST', '/produits/convertir-article', { article_id: Number(id), code_article: code, sexe }); flash('Article converti : ' + f.reference + '.'); fermer(); await charger(); }
    catch (e) { flash(e.message, true); }
  }

  // ---------------------------------------------------------------- événements
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('button,tr[data-open],input[type=checkbox]'); if (!t) return;
    const d = t.dataset;
    try {
      if (d.edit) { const p = fiche(+d.edit); const ref = (await api('GET', '/produits/prochaine-reference/' + p.code_article + '/' + p.sexe)).prochaine; formulaire(p, ref); }
      else if (d.add === 'bom') $('#l-bom').insertAdjacentHTML('beforeend', bomRow());
      else if (d.add === 'gamme') $('#l-gamme').insertAdjacentHTML('beforeend', gammeRow());
      else if (d.add === 'marq') $('#l-marq').insertAdjacentHTML('beforeend', marqRow());
      else if ('del' in d && t.closest('.row')) t.closest('.row').remove();
      else if (d.enregistrer !== undefined) await enregistrer();
      else if ('fermer' in d) fermer();
      else if (d.annuler !== undefined) {
        if (!confirm('Annuler ce produit fini ? La référence reste réservée, l\'historique est conservé.')) return;
        try { await api('POST', '/produits/' + $('#dlg').dataset.edit + '/annuler', { version: Number($('#dlg').dataset.version), motif: $('#f-note').value }); flash('Produit annulé.'); fermer(); await charger(); }
        catch (er) { flash(er.message, true); }
      }
      else if (t.id === 'btn-new') { const c = $('#f-code'); const ref = await api('GET', '/produits/prochaine-reference/' + (CODES.find((x) => x.actif)?.code || 'P') + '/H'); formulaire(null, ref.prochaine); }
      else if (t.id === 'btn-codes') ecranCodes();
      else if (t.id === 'btn-couts') ecranCouts();
      else if (t.id === 'btn-conv') ecranConversion();
      else if (d.cadd) ajouterCode();
      else if (d.cdel) desactiverCode(d.cdel, d.cver);
      else if (d.kadd) ajouterCout();
      else if (d.tadd) ajouterTarif();
      else if (d.conv) convertir(d.conv);
    } catch (er) { flash(er.message, true); }
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'q' || e.target.id === 'fetat') afficher(); });
  $('#qui').textContent = 'Chargement…';
  charger().then(() => { $('#qui').textContent = ''; }).catch((e) => { $('#qui').textContent = e.message; });
})();