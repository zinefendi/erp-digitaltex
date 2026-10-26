// Uniform Studio 3D — fenêtre « Gestion » : commandes, avances, bons de livraison, factures, clients.
// Données locales (processus principal, gestion.json + .bak). Documents PDF dans Documents\Uniform Studio 3D\.
import { attachDatePickers, isoToday, isoToFr, addDays } from './datepick.js';
import { buildReceipt, dt, amountWords, cur, money } from './docs-pdf.js';
import { buildDocDT, dataFacture, dataBL } from './docs-dt.js';
import { attachRefPicker } from './refpick.js';
import { staffList, gset, nextNumber, peekNumber, ensureClient, clientSnap, orderTotal, advancesTotal, delivered, deliveryState, invoicesOf, invoicedLines, advanceUsed, paidOf, invoiceState, orderState, groupInvoiceLines, invoiceTotals, rid, r3, invOrderIds, lineOrderId, invBlIds, blInvoiced, blsToInvoice, invoiceGroups, groupTitle } from './gestion-core.js';

const D = window.uniformDesktop;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const M = (v) => dt(v) + ' DT';

let db = null, cat = null, G = null, CO = {};
let tab = 'dash', selId = null, q = '', flt = '';
const ST = {
  en_cours: ['En cours', 'b'], partielle: ['Livrée en partie', 'o'], livree: ['Livrée', 'g'], facturee: ['Facturée', 'v'], soldee: ['Soldée', 'g2'], annulee: ['Annulée', 'x'],
  payee: ['Payée', 'g2'], impayee: ['Non payée', 'r'], partielle_f: ['Payée en partie', 'o'], livre: ['Livré', 'g'], annule: ['Annulé', 'x'],
};
const chip = (k) => { const [l, c] = ST[k] || [k, 'b']; return `<span class="st st-${c}">${esc(l)}</span>`; };
const invChip = (i) => { const s = invoiceState(i); return chip(s === 'partielle' ? 'partielle_f' : s); };

// ERP 0.7.0 : articles et prestations vendus hors Studio (créés par le commercial ou le comptable)
let ART = [];
async function loadArticles() { if (D.articles) { try { ART = (await D.articles()).filter((a) => a.actif); } catch (e) { ART = []; } } }
const artTTC = (a) => r3((+a.prix_ht || 0) * (1 + (+a.tva || 0) / 100));
// 0.10.1 : saisie par référence (produits finis + articles), banques tunisiennes, prix affichés H.T.
let REFS = [], BANKS = [];
async function loadRefs() {
  const [P, C] = await Promise.all([D.produits ? D.produits() : [], D.codesArticle ? D.codesArticle() : []]);
  const lib = Object.fromEntries((C || []).map((c) => [c.code, c.libelle]));
  REFS = [...(P || []).map((p) => ({ ref: p.reference, designation: [lib[p.code_article] || p.code_article, p.client_nom].filter(Boolean).join(' · '), type: 'Produit fini', ht: p.prix_ht ?? null, service: false })),
    ...ART.map((a) => ({ ref: a.code, designation: a.designation, type: a.type === 'prestation' ? 'Prestation' : 'Article', ht: a.prix_ht ?? null, service: a.type === 'prestation', artType: a.type, unite: a.unite }))];
}
async function loadBanks() { try { BANKS = D.banques ? (await D.banques()).filter((b) => b.actif !== false) : []; } catch (_) { BANKS = []; } }
const bankName = (c) => (BANKS.find((b) => b.code === c) || {}).nom || c || '';
const bankOpts = (v = '') => `<option value="">Banque…</option>${BANKS.map((b) => `<option value="${esc(b.code)}" ${b.code === v ? 'selected' : ''}>${esc(b.nom)}</option>`).join('')}`;
// commandes stockées en TTC (format Studio) : coefficient TTC → H.T. d'une ligne
const kTTC = (l) => (1 + (+G.tva || 0) / 100) * (l && (l.service || l.artType === 'prestation') ? 1 : 1 + (+G.fodec || 0) / 100);
const puHTo = (l) => r3((+l.pu || 0) / kTTC(l));
const studioIds = (o) => new Set(((o && o.lines) || []).filter((l) => l.src === 'studio').map((l) => l.id));
const ficheAttr = (ref, oid) => `data-fiche="${esc(ref || '')}" data-fo="${esc(oid || '')}" title="Double-clic : fiche technique"`;
async function upScan(id, input) {
  const f = input && input.files && input.files[0]; if (!f) return null;
  if (!D.fichiers) throw new Error('Envoi de fichiers indisponible.');
  busy('Envoi du scan…'); try { const r = await D.fichiers.envoyer('scan_paiement', 'reglement', id, f); return { id: r.id, nom: r.nom }; } finally { busy(false); }
}
const scanCell = (p) => (p.scan ? `<button class="btn sm ghost" data-scan="${esc(p.scan.id)}" title="${esc(p.scan.nom || '')}">Scan</button>` : '');
async function load() {
  [db, cat] = await Promise.all([D.db.get(), D.catalogue.get().then((r) => r.catalogue), loadArticles(), loadBanks()]);
  await loadRefs().catch(() => { REFS = []; });
  G = gset(cat); CO = cat.company || {};
  render();
}
// 0.13.1 : les réglages (dont Paramètres › Factures › multi-BL) sont relus à chaque rafraîchissement, sans F5
const relireReglages = async () => { try { cat = (await D.catalogue.get()).catalogue; G = gset(cat); CO = cat.company || {}; } catch (_) { /* garde les réglages connus */ } };
D.db.onChange(async () => { db = await D.db.get(); await relireReglages(); render(true); });
if (D.onNotify) D.onNotify(async (ch) => { if (ch === 'catalogue-saved') { cat = (await D.catalogue.get()).catalogue; G = gset(cat); CO = cat.company || {}; render(true); } });

/* ------------------------------------------------------------------ rendu */
function render(keepScroll) {
  $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  const main = $('#main'), sc = keepScroll ? [$('.list') && $('.list').scrollTop, $('.detail') && $('.detail').scrollTop] : null;
  const active = document.activeElement && document.activeElement.closest('#main') ? document.activeElement : null;
  if (keepScroll && active && active.matches('input,textarea,select') && !active.matches('[data-date]')) return; // ne pas interrompre une saisie
  main.innerHTML = tab === 'dash' ? dashView() : tab === 'orders' ? ordersView() : tab === 'bls' ? blsView() : tab === 'invoices' ? invoicesView() : clientsView();
  attachDatePickers(document);
  if (sc) { if ($('.list')) $('.list').scrollTop = sc[0] || 0; if ($('.detail')) $('.detail').scrollTop = sc[1] || 0; }
  const s = $('#q'); if (s && document.activeElement !== s && q) { s.focus(); s.setSelectionRange(q.length, q.length); }
}
const toolbar = (ph, filters = []) => `<div class="tb"><input id="q" type="search" placeholder="${esc(ph)}" value="${esc(q)}" autocomplete="off">
  ${filters.length ? `<select id="flt"><option value="">Tous les statuts</option>${filters.map(([k, l]) => `<option value="${k}" ${flt === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : ''}</div>`;

/* ---- tableau de bord */
function dashView() {
  const m = isoToday().slice(0, 7), y = isoToday().slice(0, 4);
  const orders = db.orders.filter((o) => o.status !== 'annulee');
  const open = orders.filter((o) => !['soldee', 'annulee'].includes(orderState(db, o)));
  const toDeliver = orders.filter((o) => ['todo', 'partial'].includes(deliveryState(db, o).state));
  const inv = db.invoices.filter((i) => i.status !== 'annulee' && cur(i) === 'DT'); // montants en DT ; factures export (EUR / USD) à part
  const unpaid = inv.filter((i) => invoiceState(i) !== 'payee');
  const rest = r3(unpaid.reduce((s, i) => s + Math.max(0, invoiceTotals(i).net - paidOf(i)), 0));
  const caM = r3(inv.filter((i) => String(i.date).startsWith(m)).reduce((s, i) => s + invoiceTotals(i).ttc, 0));
  const caY = r3(inv.filter((i) => String(i.date).startsWith(y)).reduce((s, i) => s + invoiceTotals(i).ttc, 0));
  const advM = r3(orders.flatMap((o) => o.advances || []).filter((a) => String(a.date).startsWith(m)).reduce((s, a) => s + (+a.amount || 0), 0));
  const late = toDeliver.filter((o) => o.delivery && o.delivery < isoToday());
  const overdue = unpaid.filter((i) => i.due && i.due < isoToday());
  const card = (l, v, sub, go) => `<button class="kpi" ${go ? `data-go="${go}"` : ''}><span>${esc(l)}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</button>`;
  const soon = toDeliver.slice().sort((a, b) => String(a.delivery || '9').localeCompare(String(b.delivery || '9'))).slice(0, 8);
  return `<div class="pane"><div class="kpis">
      ${card('Commandes non soldées', open.length, `${toDeliver.length} à livrer${late.length ? ` · <em class="r">${late.length} en retard</em>` : ''}`, 'orders')}
      ${card('Factures non soldées', unpaid.length, `reste à encaisser <b>${M(rest)}</b>${overdue.length ? ` · <em class="r">${overdue.length} échue${overdue.length > 1 ? 's' : ''}</em>` : ''}`, 'invoices')}
      ${card('Chiffre d’affaires du mois', M(caM), `année ${y} : ${M(caY)} (TTC facturé)`, 'invoices')}
      ${card('Avances encaissées ce mois', M(advM), '', 'orders')}</div>
    <div class="cols2"><section class="box"><h3>Livraisons à venir</h3>${soon.length ? `<table class="t"><thead><tr><th>Livraison</th><th>Commande</th><th>Client</th><th>Livré</th></tr></thead><tbody>${soon.map((o) => { const d = deliveryState(db, o);
        return `<tr data-open="orders:${o.id}"><td class="${o.delivery && o.delivery < isoToday() ? 'r b' : ''}">${o.delivery ? isoToFr(o.delivery) : '<span class="mute">à confirmer</span>'}</td><td><b>${esc(o.number)}</b></td><td>${esc(o.client.name)}</td><td>${d.done}/${d.tot}</td></tr>`; }).join('')}</tbody></table>` : '<p class="mute">Aucune livraison en attente.</p>'}</section>
      <section class="box"><h3>Factures à encaisser</h3>${unpaid.length ? `<table class="t"><thead><tr><th>Échéance</th><th>Facture</th><th>Client</th><th class="n">Reste</th></tr></thead><tbody>${unpaid.slice().sort((a, b) => String(a.due).localeCompare(String(b.due))).slice(0, 8).map((i) =>
        `<tr data-open="invoices:${i.id}"><td class="${i.due && i.due < isoToday() ? 'r b' : ''}">${isoToFr(i.due)}</td><td><b>${esc(i.number)}</b></td><td>${esc(i.client.name)}</td><td class="n">${M(invoiceTotals(i).net - paidOf(i))}</td></tr>`).join('')}</tbody></table>` : '<p class="mute">Toutes les factures sont soldées.</p>'}</section></div>
    <section class="box"><h3>Sauvegarde</h3><p class="mute">Les commandes, BL, factures et clients sont enregistrés sur ce PC (avec une copie de secours automatique). Faites une sauvegarde régulière sur une clé USB ou un disque réseau.</p>
      <div class="row"><button class="btn ghost" data-act="dbexport">Sauvegarder…</button><button class="btn ghost" data-act="dbimport">Restaurer une sauvegarde…</button>
      <button class="btn ghost" data-act="folder" data-k="factures">Dossier des factures</button><button class="btn ghost" data-act="folder" data-k="bl">Dossier des BL</button></div></section></div>`;
}

/* ---- commandes */
function ordersView() {
  const L = db.orders.slice().sort((a, b) => String(b.date + b.number).localeCompare(String(a.date + a.number)))
    .filter((o) => !q || norm([o.number, o.clientPO, o.client.name].join(' ')).includes(norm(q))).filter((o) => !flt || orderState(db, o) === flt);
  const o = db.orders.find((x) => x.id === selId) || null;
  return `<div class="split"><aside class="list"><div class="lh">${toolbar('Rechercher : n°, client, BC…', Object.entries(ST).slice(0, 6).map(([k, [l]]) => [k, l]))}<button class="btn sm" data-act="neworder">+ Commande</button></div>
    ${L.length ? L.map((x) => { const t = orderTotal(x), a = advancesTotal(x);
      return `<button class="li ${x.id === selId ? 'on' : ''}" data-sel="${x.id}"><div><b>${esc(x.number)}</b>${chip(orderState(db, x))}</div><div>${esc(x.client.name)}</div><small>${isoToFr(x.date)}${x.clientPO ? ' · BC ' + esc(x.clientPO) : ''} · ${M(t)}${a ? ' · avance ' + M(a) : ''}</small></button>`; }).join('') : '<p class="empty">Aucune commande.<br><small>Les commandes créées dans le studio (Fiches PDF) apparaissent ici.</small></p>'}</aside>
    <section class="detail">${o ? orderDetail(o) : '<p class="empty">Sélectionnez une commande.</p>'}</section></div>`;
}
function orderDetail(o) {
  const t = orderTotal(o), adv = advancesTotal(o), del = delivered(db, o), inv = invoicedLines(db, o), st = orderState(db, o), locked = st === 'annulee';
  const bls = db.bls.filter((b) => b.orderId === o.id), invs = db.invoices.filter((i) => invOrderIds(i).includes(o.id));
  const ds = deliveryState(db, o);
  const htT = r3((o.lines || []).reduce((s, l) => s + (+l.qty || 0) * puHTo(l), 0));
  const lines = (o.lines || []).map((l, i) => { const st = l.src === 'studio';
    return `<tr ${ficheAttr(l.article || l.ref, o.id)}><td class="mono small">${esc(l.article || l.ref || '')}</td><td>${esc(l.designation)}${st ? ' <span class="tag" title="Saisie en Infographie : seul le prix se modifie">infographie</span>' : ''}</td><td>${esc(l.staff || '')}</td><td>${esc(l.color || '')}</td><td>${esc(l.size || '')}</td>
      <td class="n"><input type="number" min="0" step="1" data-ol="${i}" data-k="qty" value="${+l.qty || 0}" ${locked || st ? 'disabled' : ''}></td>
      <td class="n"><input type="number" min="0" step="0.001" data-ol="${i}" data-k="pu" value="${puHTo(l)}" ${locked ? 'disabled' : ''}></td>
      <td class="n b">${dt((+l.qty || 0) * puHTo(l))}</td><td class="n mute">${l.service ? '—' : (del[l.id] || 0)}</td><td class="n mute">${inv[l.id] || 0}</td>
      <td>${locked || st ? '' : `<button class="ib" data-oldel="${i}" title="Supprimer la ligne">✕</button>`}</td></tr>`; }).join('');
  return `<div class="dh"><div><h2>Commande ${esc(o.number)}</h2>${chip(st)} <span class="mute">Livraison : ${ds.done}/${ds.tot} pièces</span></div>
    <div class="row">${locked ? '' : `<button class="btn" data-act="newbl" ${ds.state === 'done' || ds.state === 'none' ? 'disabled' : ''}>+ Bon de livraison</button><button class="btn" data-act="newinv">+ Facture</button><button class="btn ghost" data-act="fichejoin">Joindre une fiche technique</button>`}<button class="btn ghost" data-act="ficheopen">Fiche technique</button>
    <button class="btn ghost" data-act="${locked ? 'reopen' : 'cancelorder'}">${locked ? 'Rétablir' : 'Annuler la commande'}</button></div></div>
    <div class="g4">
      <label>Client<input data-of="client" value="${esc(o.client.name)}" list="cl" autocomplete="off" ${locked ? 'disabled' : ''}><datalist id="cl">${db.clients.map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist></label>
      <label>N° bon de commande client<input data-of="clientPO" value="${esc(o.clientPO || '')}" ${locked ? 'disabled' : ''}></label>
      <label>Date de création<input data-date data-of="date" value="${esc(o.date)}" required ${locked ? 'disabled' : ''}></label>
      <label>Livraison voulue<input data-date data-of="delivery" value="${esc(o.delivery || '')}" data-min="${esc(o.date)}" ${locked ? 'disabled' : ''}></label></div>
    <h3>Lignes de la commande</h3>
    <table class="t ed"><thead><tr><th>Réf.</th><th>Désignation</th><th>Service</th><th>Couleur</th><th>Taille</th><th class="n">Qté</th><th class="n">PRIX H.T.</th><th class="n">Total H.T.</th><th class="n">Livré</th><th class="n">Facturé</th><th></th></tr></thead>
      <tbody>${lines || '<tr><td colspan="11" class="mute">Aucune ligne.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="7">${locked ? '' : '<button class="btn sm ghost" data-act="addline">+ Ajouter une ligne (référence, transport, retouche…)</button>'}</td><td class="n b">${M(htT)}<div class="mute small">TTC ${M(t)}</div></td><td colspan="3"></td></tr></tfoot></table>
    <h3>Avances <span class="mute">${M(adv)} reçu${adv ? 'es' : 'e'} · reste ${M(Math.max(0, t - adv))}</span></h3>
    ${(o.advances || []).length ? `<table class="t"><thead><tr><th>Date</th><th class="n">Montant</th><th>Mode</th><th>N° document</th><th>Banque</th><th>Échéance</th><th>Reçu</th><th></th></tr></thead><tbody>${o.advances.map((a, i) => `<tr><td>${isoToFr(a.date)}</td><td class="n b">${M(a.amount)}</td><td>${esc(a.mode)}</td><td>${esc(a.ref || '')}</td><td>${esc(bankName(a.bank))}</td><td>${a.due ? isoToFr(a.due) : ''}</td><td>${esc(a.receipt || '')}</td>
      <td class="r">${scanCell(a)}<button class="btn sm ghost" data-advpdf="${i}">Reçu PDF</button>${locked ? '' : `<button class="ib" data-advdel="${i}" title="Supprimer">✕</button>`}</td></tr>`).join('')}</tbody></table>` : '<p class="mute">Aucune avance.</p>'}
    ${locked ? '' : `<div class="advf"><input type="number" min="0" step="0.001" id="advamt" placeholder="Montant"><select id="advmode">${G.paymentModes.map((m) => `<option>${esc(m)}</option>`).join('')}</select><input data-date id="advdate" value="${isoToday()}" required><input id="advref" placeholder="N° chèque / effet / virement"><select id="advbank">${bankOpts()}</select><input data-date id="advdue" value="" placeholder="Échéance"><label class="btn sm ghost filep">Scan<input type="file" id="advscan" accept="image/*,application/pdf" capture="environment" hidden></label><button class="btn sm" data-act="advadd">+ Ajouter l’avance</button>
      ${t ? [30, 50, 100].map((k) => `<button class="chipb" data-advpct="${k}">${k} %</button>`).join('') : ''}</div>`}
    <div class="cols2"><section><h3>Bons de livraison</h3>${bls.length ? `<table class="t"><tbody>${bls.map((b) => `<tr data-open="bls:${b.id}"><td><b>${esc(b.number)}</b></td><td>${isoToFr(b.date)}</td><td>${(b.lines || []).reduce((s, l) => s + (+l.qty || 0), 0)} pcs</td><td>${chip(b.status || 'livre')}</td></tr>`).join('')}</tbody></table>` : '<p class="mute">Aucun BL.</p>'}</section>
      <section><h3>Factures</h3>${invs.length ? `<table class="t"><tbody>${invs.map((i) => `<tr data-open="invoices:${i.id}"><td><b>${esc(i.number)}</b></td><td>${isoToFr(i.date)}</td><td class="n">${M(invoiceTotals(i).net)}</td><td>${i.status === 'annulee' ? chip('annulee') : invChip(i)}</td></tr>`).join('')}</tbody></table>` : '<p class="mute">Aucune facture.</p>'}</section></div>
    ${(o.products || []).length ? `<h3>Produits créés dans le studio</h3><div class="prods">${o.products.map((p) => `<div class="prod">${p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : ''}<div><b>${esc(p.name || p.garment)}</b><small>${esc(p.garment)}${p.staff ? ' · ' + esc(p.staff) : ''} · ${p.qty} pcs</small></div></div>`).join('')}</div>` : ''}`;
}

/* ---- BL */
function blsView() {
  const L = db.bls.slice().sort((a, b) => String(b.date + b.number).localeCompare(String(a.date + a.number))).filter((b) => !q || norm([b.number, b.orderNumber, b.clientPO, b.client.name].join(' ')).includes(norm(q))).filter((b) => !flt || (b.status || 'livre') === flt);
  const b = db.bls.find((x) => x.id === selId);
  return `<div class="split"><aside class="list"><div class="lh">${toolbar('Rechercher : n° BL, commande, client…', [['livre', 'Livré'], ['annule', 'Annulé']])}<button class="btn sm" data-act="freebl">+ Bon de livraison</button></div>
    ${L.length ? L.map((x) => `<button class="li ${x.id === selId ? 'on' : ''}" data-sel="${x.id}"><div><b>${esc(x.number)}</b>${chip(x.status || 'livre')}</div><div>${esc(x.client.name)}</div><small>${isoToFr(x.date)} · commande ${esc(x.orderNumber)} · ${(x.lines || []).reduce((s, l) => s + (+l.qty || 0), 0)} pcs${x.status !== 'annule' && blInvoiced(db, x) ? ' · facturé ' + esc(blInvoiced(db, x).number) : x.status !== 'annule' ? ' · <b>à facturer</b>' : ''}</small></button>`).join('') : '<p class="empty">Aucun bon de livraison.<br><small>Créez-les depuis une commande ou directement (« + Bon de livraison »).</small></p>'}</aside>
    <section class="detail">${b ? `<div class="dh"><div><h2>Bon de livraison ${esc(b.number)}</h2>${chip(b.status || 'livre')}</div><div class="row"><button class="btn" data-act="blpdf">PDF</button>${b.status === 'annule' ? '' : `<button class="btn ghost" data-act="blinv" ${blInvoiced(db, b) ? 'disabled title="Déjà facturé"' : 'title="Facturer ce BL (vous pourrez cocher d’autres BL du même client)"'}>Convertir en facture</button><button class="btn ghost" data-act="blcancel">Annuler le BL</button>`}</div></div>
      <div class="kv"><span>Date</span><b>${isoToFr(b.date)}</b><span>Client</span><b>${esc(b.client.name)}</b><span>Commande</span><b><button class="linkb" data-open="orders:${b.orderId}">${esc(b.orderNumber)}</button></b><span>BC client</span><b>${esc(b.clientPO || '—')}</b>${blInvoiced(db, b) ? `<span>Facture</span><b><button class="linkb" data-open="invoices:${blInvoiced(db, b).id}">${esc(blInvoiced(db, b).number)}</button></b>` : ''}</div>
      ${blEditable(b) ? '<p class="hint">Ce BL n’est pas encore facturé : vous pouvez corriger une quantité ou supprimer une ligne (le reste redevient « à livrer »).</p>' : ''}
      <table class="t ed"><thead><tr><th>Réf.</th><th>Désignation</th><th>Service</th><th>Couleur</th><th>Taille</th><th class="n">Qté</th><th></th></tr></thead><tbody>${(b.lines || []).map((l, k) => `<tr ${ficheAttr(l.article, b.orderId)}><td class="mono small">${esc(l.article || '')}</td><td>${esc(l.designation)}</td><td>${esc(l.staff || '')}</td><td>${esc(l.color || '')}</td><td>${esc(l.size || '')}</td>
        <td class="n b">${blEditable(b) ? `<input type="number" min="1" step="1" data-bll="${k}" value="${l.qty}">` : l.qty}</td><td>${blEditable(b) ? `<button class="ib" data-bldel="${k}" title="Supprimer la ligne">✕</button>` : ''}</td></tr>`).join('')}</tbody></table>
      ${b.note ? `<p class="mute">Observations : ${esc(b.note)}</p>` : ''}` : '<p class="empty">Sélectionnez un bon de livraison.</p>'}</section></div>`;
}

/* ---- factures */
function invoicesView() {
  const L = db.invoices.slice().sort((a, b) => String(b.date + b.number).localeCompare(String(a.date + a.number))).filter((i) => !q || norm([i.number, i.orderNumber, ...(i.orderNumbers || []), ...(i.blNumbers || []), i.clientPO, i.client.name].join(' ')).includes(norm(q)))
    .filter((i) => !flt || (flt === 'annulee' ? i.status === 'annulee' : i.status !== 'annulee' && invoiceState(i) === flt));
  const i = db.invoices.find((x) => x.id === selId);
  return `<div class="split"><aside class="list"><div class="lh">${toolbar('Rechercher : n° facture, client, BC…', [['impayee', 'Non payée'], ['partielle', 'Payée en partie'], ['payee', 'Payée'], ['annulee', 'Annulée']])}<div class="row" style="flex-direction:column;gap:4px"><button class="btn sm" data-act="blsinv" title="${G.multiBL !== false ? 'Choisir un client puis cocher un ou plusieurs de ses BL non facturés' : 'Facturation multi-BL désactivée (Paramètres › Factures) : un BL par facture'}">${G.multiBL !== false ? 'Facturer des BL' : 'Facturer un BL'}${blsToInvoice(db).length ? ` (${blsToInvoice(db).length})` : ''}</button><button class="btn sm ghost" data-act="freeinv">+ Facture</button></div></div>
    ${L.length ? L.map((x) => { const X = invoiceTotals(x); return `<button class="li ${x.id === selId ? 'on' : ''}" data-sel="${x.id}"><div><b>${esc(x.number)}</b>${x.status === 'annulee' ? chip('annulee') : invChip(x)}</div><div>${esc(x.client.name)}</div><small>${isoToFr(x.date)} · ${money(X.net, cur(x))}${x.status !== 'annulee' && paidOf(x) && invoiceState(x) !== 'payee' ? ' · reste ' + money(X.net - paidOf(x), cur(x)) : ''}</small></button>`; }).join('') : '<p class="empty">Aucune facture.<br><small>Créez-les depuis une commande ou un BL, ou « + Facture ».</small></p>'}</aside>
    <section class="detail">${i ? invoiceDetail(i) : '<p class="empty">Sélectionnez une facture.</p>'}</section></div>`;
}
function invoiceDetail(i) {
  const X = invoiceTotals(i), paid = paidOf(i), rest = r3(Math.max(0, X.net - paid)), off = i.status === 'annulee';
  const C = cur(i), M = (v) => money(v, C);
  return `<div class="dh"><div><h2>Facture ${esc(i.number)}</h2>${off ? chip('annulee') : invChip(i)}</div><div class="row"><button class="btn" data-act="invpdf">PDF</button>${invEditable(i) ? '<button class="btn ghost" data-act="invedit">Modifier les lignes</button>' : ''}${off ? '' : '<button class="btn ghost" data-act="invcancel">Annuler la facture</button>'}</div></div>
    ${!off && !invEditable(i) ? '<p class="hint">Facture réglée (règlement ou avoir) : ses lignes ne se modifient plus — corrigez par un avoir (Commercial › Avoirs).</p>' : ''}
    <div class="kv"><span>Date</span><b>${isoToFr(i.date)}</b><span>Échéance</span><b class="${!off && rest > 0 && i.due < isoToday() ? 'r' : ''}">${isoToFr(i.due)}</b><span>Client</span><b>${esc(i.client.name)}</b>
      <span>Commande${invOrderIds(i).length > 1 ? 's' : ''}</span><b>${invOrderIds(i).length ? invOrderIds(i).map((oid, k) => { const o = db.orders.find((z) => z.id === oid); return `<button class="linkb" data-open="orders:${oid}">${esc((o && o.number) || (i.orderNumbers || [])[k] || i.orderNumber || '?')}</button>`; }).join(', ') : '—'}</b><span>BL</span><b>${invBlIds(i).length ? invBlIds(i).map((bid, k) => `<button class="linkb" data-open="bls:${bid}">${esc((i.blNumbers || [])[k] || '?')}</button>`).join(', ') : '—'}</b><span>BC client</span><b>${esc(i.clientPO || '—')}</b>${i.export ? `<span>Vente</span><b>Exportation · ${esc(C)}${i.incoterm ? ' · ' + esc(i.incoterm) : ''}</b>` : ''}${i.ttnRef ? `<span>Réf. TTN</span><b>${esc(i.ttnRef)}</b>` : ''}</div>
    <table class="t"><thead><tr><th>Réf.</th><th>Désignation</th><th class="n">Qté</th><th class="n">PRIX H.T.</th><th class="n">Remise</th><th class="n">Total H.T.</th></tr></thead><tbody>${invoiceGroups(i, X.lines).map((g) => `${g.titre ? `<tr class="grp"><td colspan="6">${esc(g.titre)}</td></tr>` : ''}${g.lignes.map(({ l }) => `<tr ${ficheAttr(l.article, lineOrderId(i, l))}><td class="mono small">${esc(l.article || '')}</td><td>${esc(l.designation)}${l.staff ? ' <span class="mute small">· ' + esc(l.staff) + '</span>' : ''}</td><td class="n">${l.qty}</td><td class="n">${dt(l.puHT)}</td><td class="n">${l.remise ? l.remise + ' %' : ''}</td><td class="n b">${dt(l.totHT)}</td></tr>`).join('')}`).join('')}</tbody></table>
    ${recapBL(i)}
    <div class="tot"><div><span>Total H.T.</span><b>${M(X.ht)}</b></div>${X.fodec ? `<div><span>FODEC ${+i.fodec} %</span><b>${M(X.fodec)}</b></div>` : ''}<div><span>TVA ${i.tva} %</span><b>${M(X.tva)}</b></div><div><span>Total TTC</span><b>${M(X.ttc)}</b></div>${X.timbre ? `<div><span>Timbre</span><b>${M(X.timbre)}</b></div>` : ''}<div class="big"><span>Net à payer</span><b>${M(X.net)}</b></div>
      ${+i.advance ? `<div><span>Avance déduite</span><b>- ${M(i.advance)}</b></div>` : ''}${(i.payments || []).map((p) => `<div><span>Règlement ${isoToFr(p.date)} · ${esc(p.mode)}${p.ref ? ' ' + esc(p.ref) : ''}</span><b>- ${M(p.amount)}</b></div>`).join('')}
      <div class="big ${rest > 0 ? 'due' : 'ok'}"><span>Reste à payer</span><b>${M(rest)}</b></div></div>
    <p class="mute small">${esc(amountWords(X.net, C))}.</p>
    ${off ? '' : `<h3>Règlements</h3>${(i.payments || []).length ? `<table class="t"><tbody>${i.payments.map((p, k) => `<tr><td>${isoToFr(p.date)}</td><td class="n b">${M(p.amount)}</td><td>${esc(p.mode)}</td><td>${esc(p.ref || '')}</td><td>${esc(bankName(p.bank))}</td><td>${p.due ? 'éch. ' + isoToFr(p.due) : ''}</td><td class="r">${scanCell(p)}${p.enc ? '<span class="mute small" title="Encaissement enregistré en comptabilité : à annuler depuis Comptabilité clients › Encaissements">compta</span>' : `<button class="ib" data-paydel="${k}" title="Supprimer">✕</button>`}</td></tr>`).join('')}</tbody></table>` : ''}
      ${rest > 0 ? `<div class="advf"><input type="number" min="0" step="0.001" id="payamt" placeholder="Montant" value="${rest}"><select id="paymode">${G.paymentModes.map((m) => `<option>${esc(m)}</option>`).join('')}</select><input data-date id="paydate" value="${isoToday()}" required><input id="payref" placeholder="N° chèque / effet / virement"><select id="paybank">${bankOpts()}</select><input data-date id="paydue" value="" placeholder="Échéance"><label class="btn sm ghost filep">Scan<input type="file" id="payscan" accept="image/*,application/pdf" capture="environment" hidden></label><button class="btn sm" data-act="payadd">+ Enregistrer le règlement</button></div>` : '<p class="ok b">Facture soldée.</p>'}`}`;
}

/* ---- clients */
function clientsView() {
  const L = db.clients.slice().sort((a, b) => a.name.localeCompare(b.name, 'fr')).filter((c) => !q || norm([c.name, c.contact, c.city, c.mf, c.phone].join(' ')).includes(norm(q)));
  const c = db.clients.find((x) => x.id === selId);
  const bal = (c) => { const inv = db.invoices.filter((i) => i.status !== 'annulee' && i.client.id === c.id && cur(i) === 'DT'); return r3(inv.reduce((s, i) => s + Math.max(0, invoiceTotals(i).net - paidOf(i)), 0)); };
  const f = (k, l, w2) => `<label class="${w2 ? 'w2' : ''}">${l}<input data-cf="${k}" value="${esc(c[k] || '')}"></label>`;
  return `<div class="split"><aside class="list"><div class="lh">${toolbar('Rechercher un client…')}<button class="btn sm" data-act="newclient">+ Client</button></div>
    ${L.length ? L.map((x) => { const b = bal(x); return `<button class="li ${x.id === selId ? 'on' : ''}" data-sel="${x.id}"><div><b>${esc(x.name)}</b>${b ? `<span class="st st-r">${M(b)}</span>` : ''}</div><small>${esc([x.contact, x.city, x.phone].filter(Boolean).join(' · ') || '—')}</small></button>`; }).join('') : '<p class="empty">Aucun client.</p>'}</aside>
    <section class="detail">${c ? `<div class="dh"><div><h2>${esc(c.name)}</h2>${bal(c) ? `<span class="st st-r">Reste à encaisser ${M(bal(c))}</span>` : '<span class="st st-g2">À jour</span>'}</div><div class="row"><button class="btn ghost" data-act="delclient">Supprimer</button></div></div>
      <div class="g2">${f('name', 'Raison sociale / nom', true)}${f('contact', 'Contact')}${f('phone', 'Téléphone')}${f('email', 'E-mail')}${f('mf', 'Matricule fiscal')}${f('address', 'Adresse', true)}${f('city', 'Code postal et ville')}</div>
      <p class="hint">Les modifications sont enregistrées automatiquement et utilisées pour les prochains BL et factures (les documents déjà émis ne changent pas).</p>
      <h3>Historique</h3><table class="t"><thead><tr><th>Date</th><th>Document</th><th>Statut</th><th class="n">Montant</th></tr></thead><tbody>
      ${[...db.orders.filter((o) => o.client.id === c.id).map((o) => [o.date, `Commande ${o.number}`, chip(orderState(db, o)), orderTotal(o), 'orders:' + o.id]), ...db.invoices.filter((i) => i.client.id === c.id).map((i) => [i.date, `Facture ${i.number}`, i.status === 'annulee' ? chip('annulee') : invChip(i), invoiceTotals(i).net, 'invoices:' + i.id])]
        .sort((a, b) => String(b[0]).localeCompare(String(a[0]))).map(([d, l, s, m, go]) => `<tr data-open="${go}"><td>${isoToFr(d)}</td><td><b>${esc(l)}</b></td><td>${s}</td><td class="n">${M(m)}</td></tr>`).join('') || '<tr><td colspan="4" class="mute">Aucun document.</td></tr>'}</tbody></table>` : '<p class="empty">Sélectionnez un client.</p>'}</section></div>`;
}

/* ------------------------------------------------------------------ actions */
const curOrder = () => db.orders.find((x) => x.id === selId);
const put = async (col, rec) => {
  const r = await D.db.put(col, rec); db = await D.db.get();
  // ERP 0.10.0 : BL livré sans stock suffisant → le BL passe, l'alerte est affichée (et inscrite au journal par le serveur)
  if (r && Array.isArray(r.alertes_stock) && r.alertes_stock.length) alert('Attention : stock produits finis insuffisant.\n\n' + r.alertes_stock.map((a) => `${a.reference}${a.taille ? ' ' + a.taille : ''}${a.couleur ? ' ' + a.couleur : ''} : livré ${a.livre}, stock ${a.stock_avant} → ${a.stock_apres}`).join('\n') + '\n\nLe BL est enregistré ; le stock négatif est à régulariser (Stock PF).');
  return r;
};
async function saveOrder(o, rerender = true) { o.total = orderTotal(o); await put('orders', o); if (rerender) render(true); }

document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('button,tr[data-open]'); if (!t || t.closest('#dlg')) return;
  const d = t.dataset;
  try {
    if (d.tab) { tab = d.tab; selId = null; q = ''; flt = ''; render(); return; }
    if (d.go) { tab = d.go; selId = null; q = ''; flt = ''; render(); return; }
    if (d.open) { const [tb, id] = d.open.split(':'); tab = tb; selId = id; q = ''; flt = ''; render(); return; }
    if (d.sel) { selId = d.sel; render(true); return; }
    if (d.advpct) { const o = curOrder(); $('#advamt').value = r3(Math.max(0, orderTotal(o) * (+d.advpct) / 100 - (+d.advpct === 100 ? advancesTotal(o) : 0))); return; }
    if (d.oldel !== undefined) { const o = curOrder(), l = o.lines[+d.oldel], del = delivered(db, o); if (del[l.id]) return toast('Cette ligne est déjà livrée (BL) : elle ne peut pas être supprimée.', true); if (!confirm(`Supprimer la ligne « ${l.designation} » ?`)) return; o.lines.splice(+d.oldel, 1); await saveOrder(o); return; }
    if (d.advdel !== undefined) { const o = curOrder(), a = o.advances[+d.advdel]; if (!confirm(`Supprimer l’avance de ${M(a.amount)} du ${isoToFr(a.date)} ?`)) return; o.advances.splice(+d.advdel, 1); await saveOrder(o); return; }
    if (d.advpdf !== undefined) { const o = curOrder(), a = o.advances[+d.advpdf]; if (!a.receipt) { a.receipt = await nextNumber(D, cat, 'receipt', a.date); await saveOrder(o, false); } busy('Préparation du reçu…'); const b = await buildReceipt(CO, o, a); busy(false); await D.docs.save('factures', `Recu ${a.receipt} - ${o.client.name}`, b); return; }
    if (d.bldel !== undefined) { const b = db.bls.find((x) => x.id === selId), l = b.lines[+d.bldel]; if ((b.lines || []).length <= 1) return toast('Un BL garde au moins une ligne : pour tout retirer, annulez le BL.', true); if (!confirm(`Supprimer la ligne « ${[l.designation, l.color, l.size].filter(Boolean).join(' · ')} » (${l.qty} pcs) du BL ${b.number} ? Ces pièces redeviennent « à livrer ».`)) return; await put('bls', { ...b, lines: b.lines.filter((_, k) => k !== +d.bldel) }); render(true); toast('Ligne supprimée du BL.'); return; }
    if (d.scan) { if (D.fichiers) window.open(D.fichiers.url(d.scan), '_blank'); return; }
    if (d.paydel !== undefined) { const i = db.invoices.find((x) => x.id === selId); if (!confirm('Supprimer ce règlement ?')) return; i.payments.splice(+d.paydel, 1); await put('invoices', i); render(true); return; }
    if (d.act) await act(d.act, t);
  } catch (e) { busy(false); toast(e.message, true); }
});
document.addEventListener('dblclick', (ev) => {
  const tr = ev.target.closest('#main tr[data-fiche]'); if (!tr || ev.target.matches('input,select,button')) return;
  ouvrirFiche(tr.dataset.fiche, tr.dataset.fo);
});
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.id === 'q') { q = t.value; clearTimeout(window.__qt); window.__qt = setTimeout(() => render(), 160); }
});
document.addEventListener('change', async (ev) => {
  const t = ev.target, d = t.dataset;
  try {
    if (t.id === 'flt') { flt = t.value; render(); return; }
    if (d.ol !== undefined) {
      const o = curOrder(), l = o.lines[+d.ol], v = d.k === 'qty' ? Math.max(0, Math.floor(+t.value || 0)) : r3(Math.max(0, +t.value || 0));
      if (d.k === 'qty') { const done = Math.max(delivered(db, o)[l.id] || 0, invoicedLines(db, o)[l.id] || 0); if (v < done) { toast(`Déjà ${done} livré(s) ou facturé(s) : la quantité ne peut pas être inférieure.`, true); t.value = l.qty; return; } }
      l[d.k] = d.k === 'pu' ? r3(v * kTTC(l)) : v; await saveOrder(o); return;
    }
    if (d.of) {
      const o = curOrder();
      if (d.of === 'client') { const name = t.value.trim(); if (!name) { t.value = o.client.name; return; } const c = await ensureClient(D, name); o.client = clientSnap(c); }
      else if (d.of === 'date' || d.of === 'delivery') { o[d.of] = t.dataset.iso; if (o.delivery && o.delivery < o.date) o.delivery = ''; }
      else o[d.of] = t.value.trim();
      await saveOrder(o); return;
    }
    if (d.bll !== undefined) {
      const b = db.bls.find((x) => x.id === selId), l = b.lines[+d.bll], o = db.orders.find((x) => x.id === b.orderId), ol = o && o.lines.find((x) => x.id === l.lineId);
      const max = ol ? (+ol.qty || 0) - (delivered(db, o, b.id)[l.lineId] || 0) : l.qty, v = Math.floor(+t.value || 0);
      if (!(v >= 1)) { toast('Quantité d’au moins 1 (pour retirer la ligne, cliquez sur ✕).', true); t.value = l.qty; return; }
      if (v > max) { toast(`${max} au plus pour cette ligne (commande : ${ol ? ol.qty : '?'}, déjà livré par d’autres BL : ${ol ? ol.qty - max : 0}).`, true); t.value = l.qty; return; }
      await put('bls', { ...b, lines: b.lines.map((x, k) => (k === +d.bll ? { ...x, qty: v } : x)) }); render(true); toast('Quantité du BL modifiée.'); return;
    }
    if (d.cf) { const c = db.clients.find((x) => x.id === selId); c[d.cf] = t.value.trim(); if (d.cf === 'name' && !c.name) return toast('Le nom est obligatoire.', true); await put('clients', c); render(true); return; }
  } catch (e) { toast(e.message, true); }
});

async function act(k, btn) {
  const o = curOrder();
  if (k === 'dbexport') { const r = await D.db.exportFile(); if (r && r.path) toast('Sauvegarde enregistrée : ' + r.path); }
  else if (k === 'dbimport') { if (!confirm('Restaurer une sauvegarde remplace TOUTES les commandes, BL, factures et clients actuels. Continuer ?')) return; const r = await D.db.importFile(); if (r && r.ok) { db = await D.db.get(); selId = null; render(); toast('Sauvegarde restaurée.'); } }
  else if (k === 'folder') await D.docs.folder(btn.dataset.k);
  else if (k === 'neworder') {
    const r = await ask({ title: 'Nouvelle commande', text: 'Pour une commande sans fiche technique (articles, réassort…). Les commandes avec produits personnalisés se créent dans le studio.', fields: [
      { k: 'client', label: 'Client', list: db.clients.map((c) => c.name) }, { k: 'clientPO', label: 'N° bon de commande client (facultatif)' },
      { k: 'date', label: 'Date de création', type: 'date', value: isoToday() }, { k: 'delivery', label: 'Livraison voulue', type: 'date', value: '' }] });
    if (!r || !r.client.trim()) return;
    const c = await ensureClient(D, r.client);
    const rec = await put('orders', { number: await nextNumber(D, cat, 'order', r.date), clientPO: r.clientPO.trim(), client: clientSnap(c), date: r.date || isoToday(), delivery: r.delivery || '', lines: [], advances: [], products: [], status: 'en_cours', total: 0 });
    tab = 'orders'; selId = rec.id; render(); toast(`Commande ${rec.number} créée. Ajoutez les lignes.`);
  }
  else if (k === 'addline' && o) {
    await loadArticles(); await loadRefs().catch(() => {});
    const r = await ask({ title: `Ajouter des lignes · commande ${o.number}`, wide: true, okLabel: 'Ajouter', fields: [{ k: 'lines', type: 'invlines', value: { lines: [blankLine(true)], cs: true, remise: false, noTotals: true, orderId: o.id, tva: G.tva, timbre: 0, fodec: G.fodec } }] });
    if (!r) return;
    const L = r.lines.lines.filter((l) => String(l.designation).trim() && +l.qty > 0); if (!L.length) return;
    for (const l of L) { const y = { id: rid(), src: l.article ? 'article' : 'manual', article: l.article || '', artType: l.artType || '', designation: l.designation.trim(), staff: l.staff || '', color: (l.color || '').trim(), size: (l.size || '').trim(), qty: Math.max(0, Math.floor(+l.qty || 0)), service: !!l.service }; y.pu = r3((+l.pu || 0) * kTTC(y)); o.lines.push(y); }
    await saveOrder(o); toast(`${L.length} ligne(s) ajoutée(s).`);
  }
  else if (k === 'fichejoin' && o) {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/pdf,image/jpeg,image/png';
    inp.onchange = async () => { const f = inp.files[0]; if (!f) return; try { busy('Envoi de la fiche technique…'); await D.fichiers.envoyer('fiche_technique', 'commande', o.id, f); busy(false); toast('Fiche technique jointe à la commande ' + o.number + '.'); } catch (e) { busy(false); toast(e.message, true); } };
    inp.click();
  }
  else if (k === 'ficheopen' && o) await ouvrirFiche('', o.id);
  else if (k === 'freebl') await newBLDirect();
  else if (k === 'advadd' && o) {
    const amt = r3(+$('#advamt').value || 0); if (!(amt > 0)) return toast('Indiquez le montant.', true);
    const t = orderTotal(o), a0 = advancesTotal(o);
    if (t && a0 + amt > t + 0.0005 && !confirm(`Le total des avances (${M(a0 + amt)}) dépasse la commande (${M(t)}). Continuer ?`)) return;
    const a = { id: rid(), date: $('#advdate').dataset.iso || isoToday(), amount: amt, mode: $('#advmode').value, ref: $('#advref').value.trim(), bank: $('#advbank').value, due: $('#advdue').dataset.iso || '' };
    const sc = await upScan(a.id, $('#advscan')); if (sc) a.scan = sc;
    a.receipt = await nextNumber(D, cat, 'receipt', a.date);
    (o.advances ||= []).push(a); await saveOrder(o); toast(`Avance enregistrée · reçu ${a.receipt}.`);
  }
  else if (k === 'cancelorder' && o) {
    if (db.bls.some((b) => b.orderId === o.id && b.status !== 'annule') || invoicesOf(db, o).length) return toast('Annulez d’abord les BL et factures de cette commande.', true);
    if (!confirm(`Annuler la commande ${o.number} ? Elle reste dans l’historique (numéro conservé).`)) return; o.status = 'annulee'; await saveOrder(o);
  }
  else if (k === 'reopen' && o) { o.status = 'en_cours'; await saveOrder(o); }
  else if (k === 'newbl' && o) await newBL(o);
  else if (k === 'newinv' && o) await newInvoice(o, null);
  else if (k === 'blpdf') { const b = db.bls.find((x) => x.id === selId); await pdfBL(b); }
  else if (k === 'blcancel') { const b = db.bls.find((x) => x.id === selId); if (db.invoices.some((i) => i.status !== 'annulee' && (i.blIds || []).includes(b.id))) return toast('Ce BL est facturé : annulez d’abord la facture.', true); if (!confirm(`Annuler le BL ${b.number} ? Les quantités redeviennent « à livrer ».`)) return; b.status = 'annule'; await put('bls', b); render(true); }
  else if (k === 'blinv') { const b = db.bls.find((x) => x.id === selId); await invoiceFromBLs(b); }
  else if (k === 'blsinv') await invoiceFromBLs(null);
  else if (k === 'invpdf') { const i = db.invoices.find((x) => x.id === selId); await pdfFacture(i); }
  else if (k === 'invedit') { const i = db.invoices.find((x) => x.id === selId); await editInvoice(i); }
  else if (k === 'invcancel') { const i = db.invoices.find((x) => x.id === selId); if (!confirm(`Annuler la facture ${i.number} ? Le numéro reste attribué (pas de trou dans la numérotation) et la facture apparaît « Annulée ».`)) return; i.status = 'annulee'; await put('invoices', i); render(true); }
  else if (k === 'payadd') {
    const i = db.invoices.find((x) => x.id === selId), amt = r3(+$('#payamt').value || 0); if (!(amt > 0)) return toast('Indiquez le montant.', true);
    { const rest = r3(Math.max(0, invoiceTotals(i).net - paidOf(i))); if (amt > rest + 0.0005 && !confirm(`Le règlement (${M(amt)}) dépasse le reste à payer (${M(rest)}). L’enregistrer quand même ?`)) return; }
    const p = { id: rid(), date: $('#paydate').dataset.iso || isoToday(), amount: amt, mode: $('#paymode').value, ref: $('#payref').value.trim(), bank: $('#paybank').value, due: $('#paydue').dataset.iso || '' };
    const sc = await upScan(p.id, $('#payscan')); if (sc) p.scan = sc;
    (i.payments ||= []).push(p);
    await put('invoices', i); render(true); toast('Règlement enregistré.');
  }
  else if (k === 'freeinv') await newInvoice(null, null);
  else if (k === 'newclient') { const r = await ask({ title: 'Nouveau client', fields: [{ k: 'name', label: 'Raison sociale / nom' }, { k: 'contact', label: 'Contact' }, { k: 'phone', label: 'Téléphone' }, { k: 'mf', label: 'Matricule fiscal' }, { k: 'type_client', label: 'Type de client', type: 'select', value: 'local', options: [['local', 'Local (dinars)'], ['export', 'Export (facture en devise)']] }, { k: 'devise', label: 'Devise (si Export)', type: 'select', value: 'DT', options: [['DT', 'DT — dinars'], ['EUR', 'EUR — euros'], ['USD', 'USD — dollars']] }] }); if (!r || !r.name.trim()) return; if (db.clients.some((c) => norm(c.name) === norm(r.name))) return toast('Ce client existe déjà.', true); const c = await put('clients', { ...r, name: r.name.trim(), address: '', city: '', email: '', type_client: r.type_client === 'export' ? 'export' : 'local', devise: r.devise || 'DT' }); tab = 'clients'; selId = c.id; render(); }
  else if (k === 'delclient') { const c = db.clients.find((x) => x.id === selId); if (db.orders.some((o) => o.client.id === c.id) || db.invoices.some((i) => i.client.id === c.id)) return toast('Ce client a des commandes ou des factures : il ne peut pas être supprimé.', true); if (!confirm(`Supprimer le client « ${c.name} » ?`)) return; await D.db.del('clients', c.id); db = await D.db.get(); selId = null; render(); }
}

async function newBL(o) {
  const del = delivered(db, o), goods = o.lines.filter((l) => !l.service && (+l.qty || 0) - (del[l.id] || 0) > 0);
  if (!goods.length) return toast('Tout est déjà livré.', true);
  const r = await ask({ title: `Bon de livraison · commande ${o.number}`, text: 'Quantités à livrer maintenant (le reste pourra faire l’objet d’un autre BL).', wide: true, fields: [
    { k: 'date', label: 'Date de livraison', type: 'date', value: isoToday() },
    { k: 'qty', type: 'table', rows: goods.map((l) => ({ id: l.id, label: [l.designation, l.staff, l.color, l.size].filter(Boolean).join(' · '), max: (+l.qty || 0) - (del[l.id] || 0) })) },
    { k: 'note', label: 'Observations (facultatif)' }], okLabel: 'Créer le BL' });
  if (!r) return;
  const lines = goods.map((l) => ({ lineId: l.id, article: l.article || '', designation: l.designation, staff: l.staff, color: l.color, size: l.size, qty: Math.min(Math.max(0, Math.floor(+r.qty[l.id] || 0)), (+l.qty || 0) - (del[l.id] || 0)) })).filter((l) => l.qty > 0);
  if (!lines.length) return toast('Aucune quantité à livrer.', true);
  const client = clientSnap(db.clients.find((c) => c.id === o.client.id) || o.client);
  const bl = await put('bls', { number: await nextNumber(D, cat, 'bl', r.date), date: r.date, orderId: o.id, orderNumber: o.number, clientPO: o.clientPO || '', client, lines, note: r.note.trim(), status: 'livre' });
  render(true); toast(`BL ${bl.number} créé.`);
  await pdfBL(bl);
}

// 0.10.1 : BL direct (sans commande préalable) — la commande est créée automatiquement (origine « BL direct »), puis le BL.
async function newBLDirect() {
  await loadArticles(); await loadRefs().catch(() => {});
  const today = isoToday();
  const r = await ask({ title: 'Bon de livraison', wide: true, okLabel: 'Créer le BL', fields: [
    { k: 'client', label: 'Client', list: db.clients.map((c) => c.name) }, { k: 'clientPO', label: 'N° bon de commande client (facultatif)' },
    { k: 'date', label: 'Date de livraison', type: 'date', value: today },
    { k: 'lines', type: 'invlines', value: { lines: [blankLine(true)], cs: true, remise: false, noTotals: true, tva: G.tva, timbre: 0, fodec: G.fodec } },
    { k: 'note', label: 'Observations (facultatif)' }] });
  if (!r) return;
  if (!r.client.trim()) return toast('Indiquez le client.', true);
  const L = r.lines.lines.filter((l) => String(l.designation).trim() && +l.qty > 0);
  if (!L.some((l) => !l.service)) return toast('Le BL doit contenir au moins une ligne livrable (hors prestation).', true);
  const c = await ensureClient(D, r.client), client = clientSnap(c), date = r.date || today;
  const lines = L.map((l) => { const y = { id: rid(), src: l.article ? 'article' : 'manual', article: l.article || '', artType: l.artType || '', designation: l.designation.trim(), staff: l.staff || '', color: (l.color || '').trim(), size: (l.size || '').trim(), qty: Math.max(0, Math.floor(+l.qty || 0)), service: !!l.service }; y.pu = r3((+l.pu || 0) * kTTC(y)); return y; });
  const ord = await put('orders', { number: await nextNumber(D, cat, 'order', date), clientPO: r.clientPO.trim(), client, date, delivery: date, lines, advances: [], products: [], status: 'en_cours', origine: 'bl_direct', total: 0 });
  const bl = await put('bls', { number: await nextNumber(D, cat, 'bl', date), date, orderId: ord.id, orderNumber: ord.number, clientPO: ord.clientPO || '', client,
    lines: lines.filter((l) => !l.service).map((l) => ({ lineId: l.id, article: l.article, designation: l.designation, staff: l.staff, color: l.color, size: l.size, qty: l.qty })), note: (r.note || '').trim(), status: 'livre' });
  tab = 'bls'; selId = bl.id; render(); toast(`BL ${bl.number} créé (commande ${ord.number} créée automatiquement).`);
  await pdfBL(bl);
}

// 0.13.0 : récapitulatif des BL et commandes d'une facture (écran)
function recapBL(i) {
  const ids = invBlIds(i); if (!ids.length) return '';
  const rows = ids.map((bid, k) => { const b = db.bls.find((x) => x.id === bid) || {}, l0 = (i.lines || []).find((l) => l.blId === bid) || {};
    const pcs = (i.lines || []).filter((l) => l.blId === bid && !l.service && l.artType !== 'prestation').reduce((s2, l) => s2 + (+l.qty || 0), 0);
    return `<tr data-open="bls:${bid}"><td><b>${esc((i.blNumbers || [])[k] || b.number || '?')}</b></td><td>${isoToFr(b.date || l0.blDate || '')}</td><td>${esc(l0.orderNumber || b.orderNumber || '')}</td><td>${esc(l0.clientPO || b.clientPO || '')}</td><td class="n">${pcs || ''}</td></tr>`; }).join('');
  return `<h3>Récapitulatif des BL facturés (${ids.length})</h3><table class="t"><thead><tr><th>BL</th><th>Date</th><th>Commande</th><th>BC client</th><th class="n">Pièces facturées</th></tr></thead><tbody>${rows}</tbody></table>`;
}
const blPieces = (b) => (b.lines || []).reduce((s2, l) => s2 + (+l.qty || 0), 0);
const sameClient = (a, b) => (a && a.id && b && b.id ? a.id === b.id : norm(a && a.name) === norm(b && b.name));
/**
 * Facture de plusieurs BL d'un même client : choix du client, cases à cocher des BL non facturés,
 * puis lignes regroupées par BL (une ligne par BL, jamais fusionnées), avec les références BL / commande / BC client.
 */
async function invoiceFromBLs(b0) {
  await relireReglages(); // réglage multi-BL à jour au moment du clic (changé sur un autre poste)
  const libres = blsToInvoice(db);
  if (!libres.length) return toast('Aucun BL à facturer : tous les BL sont déjà facturés ou annulés.', true);
  let client = b0 ? b0.client : null;
  if (!client) {
    const parC = new Map(); for (const b of libres) { const k = b.client.id || norm(b.client.name); if (!parC.has(k)) parC.set(k, { c: b.client, n: 0 }); parC.get(k).n++; }
    const L = [...parC.entries()].sort((a, b) => a[1].c.name.localeCompare(b[1].c.name, 'fr'));
    const r0 = await ask({ title: 'Facturer des BL · client', text: 'Une facture regroupe un ou plusieurs BL d’un même client. Choisissez le client : ses BL non facturés s’affichent ensuite.', fields: [
      { k: 'cl', label: 'Client', type: 'select', value: L[0][0], options: L.map(([k, x]) => [k, `${x.c.name} — ${x.n} BL à facturer`]) }] });
    if (!r0) return; client = parC.get(r0.cl).c;
  }
  const dispo = libres.filter((b) => sameClient(b.client, client)).sort((a, b) => String(a.date + a.number).localeCompare(String(b.date + b.number)));
  if (!dispo.length) return toast('Ce client n’a aucun BL à facturer.', true);
  const oNum = (b) => { const o = db.orders.find((x) => x.id === b.orderId); return (o && o.number) || b.orderNumber || ''; };
  const MULTI = G.multiBL !== false;
  if (!MULTI && b0) return newInvoice(db.orders.find((x) => x.id === b0.orderId), b0);
  if (!MULTI) { // un seul BL par facture : choix du BL, puis facture « selon le BL » (comportement d'avant 0.13.0)
    const r2 = await ask({ title: `Facturer un BL · ${client.name}`, text: 'La facturation multi-BL est désactivée (Paramètres › Factures) : une facture reprend un seul BL.', fields: [
      { k: 'bl', label: 'BL à facturer', type: 'select', value: dispo[0].id, options: dispo.map((b) => [b.id, `${b.number} du ${isoToFr(b.date)} — commande ${oNum(b)} — ${blPieces(b)} pcs`]) }] });
    if (!r2) return; const b = dispo.find((x) => x.id === r2.bl); return newInvoice(db.orders.find((x) => x.id === b.orderId), b);
  }
  const r1 = await ask({ title: `Facturer des BL · ${client.name}`, wide: true, okLabel: 'Préparer la facture', text: 'Cochez les BL à regrouper sur la même facture. Chaque BL garde ses lignes (jamais fusionnées) et ses références commande / BC client.', fields: [
    { k: 'bls', type: 'checks', value: b0 ? [b0.id] : dispo.map((b) => b.id),
      cols: [{ l: 'BL' }, { l: 'Date' }, { l: 'Commande' }, { l: 'BC client' }, { l: 'Pièces', n: true }],
      rows: dispo.map((b) => ({ id: b.id, cells: [`<b>${esc(b.number)}</b>`, isoToFr(b.date), esc(oNum(b)), esc(b.clientPO || ''), String(blPieces(b))] })),
      sum: (sel) => { const n = dispo.filter((b) => sel[b.id]); return n.length ? `<b>${n.length}</b> BL sélectionné${n.length > 1 ? 's' : ''} · ${n.reduce((s2, b) => s2 + blPieces(b), 0)} pièces · commande${new Set(n.map((b) => b.orderId)).size > 1 ? 's' : ''} ${[...new Set(n.map(oNum))].join(', ')}` : 'Aucun BL sélectionné.'; } }] });
  if (!r1) return;
  const sel = dispo.filter((b) => r1.bls[b.id]);
  if (!sel.length) return toast('Cochez au moins un BL.', true);
  // lignes : par BL, quantités livrées plafonnées au reste à facturer de la commande (les BL déjà pris dans cette facture comptent)
  const orders = [], restBy = {}, lines = [], servDone = new Set();
  for (const b of sel) {
    const o = db.orders.find((x) => x.id === b.orderId);
    if (!o) return toast(`Commande du BL ${b.number} introuvable.`, true);
    if (o.status === 'annulee') return toast(`La commande ${o.number} du BL ${b.number} est annulée.`, true);
    if (!restBy[o.id]) { orders.push(o); const inv = invoicedLines(db, o); restBy[o.id] = Object.fromEntries(o.lines.map((l) => [l.id, Math.max(0, (+l.qty || 0) - (inv[l.id] || 0))])); }
    const rest = restBy[o.id], qty = {};
    for (const l of b.lines || []) { const q = Math.min(rest[l.lineId] || 0, (+l.qty || 0) - (qty[l.lineId] || 0)); if (q > 0) { qty[l.lineId] = (qty[l.lineId] || 0) + q; rest[l.lineId] -= q; } }
    if (!servDone.has(o.id)) { servDone.add(o.id); for (const l of o.lines) if (l.service && rest[l.id] > 0) { qty[l.id] = rest[l.id]; rest[l.id] = 0; } } // prestations (transport…) : avec le 1er BL de la commande
    const st = studioIds(o);
    for (const g of groupInvoiceLines(o.lines, qty)) { const ol = o.lines.find((x) => x.id === g.lineIds[0]) || {};
      lines.push({ ...g, pu: puHTo(ol), article: ol.article || '', staff: ol.staff || '', ...(ol.service ? { service: true } : {}), ...(ol.artType ? { artType: ol.artType } : {}), ...(g.lineIds.some((id) => st.has(id)) ? { studio: true } : {}),
        orderId: o.id, orderNumber: o.number, blId: b.id, blNumber: b.number, blDate: b.date, clientPO: b.clientPO || o.clientPO || '' }); }
  }
  if (!lines.length) return toast('Rien à facturer sur ces BL : leurs quantités sont déjà facturées.', true);
  await newInvoice(orders[0], null, { orders, bls: sel, lines });
}

async function newInvoice(o, bl, multi) {
  const today = isoToday();
  let lines = [], blIds = [], src = 'free';
  const MO = multi ? multi.orders : o ? [o] : [];
  const notInv = o ? db.bls.filter((b) => b.orderId === o.id && b.status !== 'annule' && !db.invoices.some((i) => i.status !== 'annulee' && (i.blIds || []).includes(b.id))) : [];
  if (multi) { lines = multi.lines; blIds = multi.bls.map((b) => b.id); }
  else if (o) {
    const inv = invoicedLines(db, o);
    const restQ = {}; for (const l of o.lines) restQ[l.id] = Math.max(0, (+l.qty || 0) - (inv[l.id] || 0));
    const sources = [['rest', 'Tout le reste à facturer de la commande'], ...notInv.map((b) => ['bl:' + b.id, `Selon le BL ${b.number} du ${isoToFr(b.date)}`])];
    if (bl) src = 'bl:' + bl.id; else src = 'rest';
    if (!bl && notInv.length) { const r0 = await ask({ title: `Facture · commande ${o.number}`, fields: [{ k: 'src', label: 'Que facturer ?', type: 'select', value: 'rest', options: sources }] }); if (!r0) return; src = r0.src; }
    let qty = {};
    if (src === 'rest') qty = restQ;
    else { const b = db.bls.find((x) => x.id === src.slice(3)); blIds = [b.id]; for (const l of b.lines) qty[l.lineId] = Math.min(restQ[l.lineId] || 0, +l.qty || 0); for (const l of o.lines) if (l.service) qty[l.id] = restQ[l.id]; }
    const st = studioIds(o);
    lines = groupInvoiceLines(o.lines, qty).map((g) => { const ol = o.lines.find((x) => x.id === g.lineIds[0]) || {};
      return { ...g, pu: puHTo(ol), article: ol.article || '', staff: ol.staff || '', ...(ol.service ? { service: true } : {}), ...(ol.artType ? { artType: ol.artType } : {}), ...(g.lineIds.some((id) => st.has(id)) ? { studio: true } : {}) }; });
    if (!lines.length) return toast('Rien à facturer : tout est déjà facturé.', true);
  }
  const client0 = o ? clientSnap(db.clients.find((c) => c.id === o.client.id) || o.client) : null;
  const advBy = Object.fromEntries(MO.map((x) => [x.id, r3(Math.max(0, advancesTotal(x) - advanceUsed(db, x)))]));
  const advLeft = r3(Object.values(advBy).reduce((s2, a) => s2 + a, 0));
  await loadArticles(); await loadRefs().catch(() => {});
  const draft = { lines: lines.length ? lines : [blankLine(false)], tva: G.tva, timbre: G.timbre, fodec: +G.fodec || 0, pricesTTC: false, orderId: o ? o.id : '', fixed: !!o, groups: !!multi };
  // ERP 0.7.0 : vente locale (DT, TVA 19 %, timbre) ou à l'exportation (EUR / USD, TVA 0 %, sans timbre — comptable 21/10/2026)
  const r00 = await ask({ title: 'Type de facture', fields: [{ k: 'kind', label: 'Vente', type: 'select', value: 'DT', options: [['DT', 'Locale — dinars (TVA ' + G.tva + ' %' + (+G.fodec ? ', FODEC ' + G.fodec + ' %' : '') + ', timbre ' + dt(G.timbre) + ' DT)'], ['EUR', 'Exportation — euros (TVA 0 %)'], ['USD', 'Exportation — dollars US (TVA 0 %)']] }] });
  if (!r00) return;
  const EXP = r00.kind !== 'DT';
  if (EXP) { draft.tva = 0; draft.timbre = 0; draft.fodec = 0; if (lines.length) toast('Facture export : vérifiez les prix H.T., ils doivent être saisis dans la devise choisie.'); }
  const r = await ask({ title: multi ? `Facture · ${client0.name} · ${blIds.length} BL (${MO.map((x) => x.number).join(', ')})` : o ? `Facture · commande ${o.number}${blIds.length ? ' · ' + db.bls.find((b) => b.id === blIds[0]).number : ''}` : 'Facture', wide: true, okLabel: 'Valider la facture', fields: [
    ...(o ? [] : [{ k: 'client', label: 'Client', list: db.clients.map((c) => c.name) }, { k: 'clientPO', label: 'N° bon de commande client (facultatif)' }]),
    { k: 'date', label: 'Date de facture', type: 'date', value: today }, { k: 'due', label: 'Échéance', type: 'date', value: addDays(today, G.dueDays) },
    { k: 'lines', type: 'invlines', value: draft },
    { k: 'advance', label: `Avance à déduire (DT)${o ? ` — disponible : ${dt(advLeft)}${MO.length > 1 && MO.some((x) => advBy[x.id]) ? ' (' + MO.filter((x) => advBy[x.id]).map((x) => x.number + ' ' + dt(advBy[x.id])).join(', ') + ')' : ''}` : ''}`, type: 'number', value: String(advLeft) },
    { k: 'paymentMode', label: 'Mode de règlement prévu', type: 'select', value: G.paymentModes[0] || '', options: [['', '—'], ...G.paymentModes.map((m) => [m, m])] },
    ...(EXP ? [{ k: 'incoterm', label: 'Incoterm 2020 (facultatif)', type: 'select', value: '', options: [['', '—'], ...['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF'].map((x) => [x, x])] }] : []),
    { k: 'ttnRef', label: 'Référence El Fatoora / TTN (si déjà attribuée)', value: '' },
    { k: 'note', label: 'Mention (facultatif)', value: G.invoiceNote || '' }] });
  if (!r) return;
  const L = r.lines.lines.filter((l) => String(l.designation).trim() && +l.qty > 0);
  if (!L.length) return toast('La facture doit contenir au moins une ligne.', true);
  let client = client0;
  if (!o) { if (!r.client.trim()) return toast('Indiquez le client.', true); client = clientSnap(await ensureClient(D, r.client)); }
  if (!CO.mf && !confirm('Le matricule fiscal de votre société n’est pas renseigné (Paramètres › Société & factures). Créer la facture quand même ?')) return;
  const POs = [...new Set((multi ? multi.bls.map((b) => b.clientPO || (db.orders.find((x) => x.id === b.orderId) || {}).clientPO || '') : [o ? o.clientPO || '' : r.clientPO.trim()]).filter(Boolean))];
  const inv = { date: r.date, due: r.due, orderId: o ? o.id : '', orderNumber: multi ? MO.map((x) => x.number).join(', ') : o ? o.number : '', clientPO: POs.join(', '), blIds, blNumbers: blIds.map((id) => db.bls.find((b) => b.id === id).number), client,
    ...(multi ? { orderIds: MO.map((x) => x.id), orderNumbers: MO.map((x) => x.number), blDates: blIds.map((id) => db.bls.find((b) => b.id === id).date) } : {}),
    lines: L.map(({ studio, ...l }) => ({ ...l, qty: +l.qty, pu: r3(+l.pu), remise: Math.min(100, Math.max(0, +l.remise || 0)) })), tva: EXP ? 0 : +r.lines.tva, timbre: EXP ? 0 : +r.lines.timbre, fodec: EXP ? 0 : +G.fodec || 0, pricesTTC: false, advance: 0, payments: [], paymentMode: r.paymentMode, note: r.note.trim(), status: 'validee',
    ...(EXP ? { currency: r00.kind, export: true, incoterm: r.incoterm || '' } : {}), ...(r.ttnRef.trim() ? { ttnRef: r.ttnRef.trim() } : {}) };
  inv.advance = EXP ? 0 : r3(Math.min(Math.max(0, +r.advance || 0), advLeft || (o ? 0 : 0), invoiceTotals(inv).net));
  if (multi && inv.advance > 0) { let rest = inv.advance; inv.advanceBy = {}; for (const x of MO) { const a = r3(Math.min(rest, advBy[x.id] || 0)); if (a > 0) { inv.advanceBy[x.id] = a; rest = r3(rest - a); } } }
  inv.number = await nextNumber(D, cat, 'invoice', r.date);
  let saved;
  try { saved = await put('invoices', inv); }
  catch (e) { if (/vente à perte/i.test(e.message) && confirm(e.message + '\n\nConfirmer la vente à perte ?')) saved = await put('invoices', { ...inv, confirmer_perte: true }); else throw e; }
  tab = 'invoices'; selId = saved.id; render(); toast(`Facture ${saved.number} créée.`);
  await pdfFacture(saved);
}


/* ------------------------------------------------------------------ ERP 0.9.1 : modification des lignes, impression DIGITAL-TEX */
// Facture modifiable tant qu'elle n'est pas réglée (ni avance encaissée après coup, ni règlement, ni avoir, ni réf. TTN). Le serveur contrôle aussi.
const invEditable = (i) => i && i.status !== 'annulee' && !(i.payments || []).length && !i.ttnRef;
const blEditable = (b) => b && b.status !== 'annule' && !db.invoices.some((i) => i.status !== 'annulee' && (i.blIds || []).includes(b.id));
const codeClient = (c) => { const x = db.clients.find((y) => y.id === (c && c.id)); return (x && (x.code || '')) || ''; };
async function pdfFacture(i) {
  busy('Préparation de la facture…');
  try { const bytes = await buildDocDT(dataFacture(i, { clientCode: codeClient(i.client) })); busy(false); await D.docs.save('factures', `${i.number} - ${i.client.name}`, bytes); }
  finally { busy(false); }
}
async function pdfBL(b) {
  busy('Préparation du BL…');
  try { const o = db.orders.find((x) => x.id === b.orderId); const bytes = await buildDocDT(dataBL(b, o, G, { clientCode: codeClient(b.client) })); busy(false); await D.docs.save('bl', `${b.number} - ${b.client.name}`, bytes); }
  finally { busy(false); }
}
// quantités par taille d'une ligne de facture issue de la commande (plafond : commandé − facturé sur les autres factures)
function capsFor(inv) {
  const OS = invOrderIds(inv).map((id) => db.orders.find((x) => x.id === id)).filter(Boolean); if (!OS.length) return null;
  const cap = {};
  for (const o of OS) { const other = invoicedLines(db, o, inv.id); for (const l of o.lines) cap[l.id] = { max: Math.max(0, (+l.qty || 0) - (other[l.id] || 0)), label: [l.size, l.color].filter(Boolean).join(' · ') || l.designation }; }
  for (const l of inv.lines || []) for (const id of l.lineIds || []) if (!cap[id]) cap[id] = { max: +(l.qtyBy || {})[id] || 0, label: id.split('|').pop() };
  return cap;
}
async function editInvoice(i0) {
  const i = db.invoices.find((x) => x.id === i0.id) || i0;
  if (!invEditable(i)) return toast('Cette facture est réglée (règlement ou avoir) : établissez un avoir.', true);
  const cap = capsFor(i) || {};
  const ttc = i.pricesTTC !== false, kI = (l) => (ttc ? (1 + (+i.tva || 0) / 100) * (l.service || l.artType === 'prestation' ? 1 : 1 + (+i.fodec || 0) / 100) : 1);
  const st = new Set(invOrderIds(i).flatMap((id) => [...studioIds(db.orders.find((x) => x.id === id))]));
  const x0 = { lines: JSON.parse(JSON.stringify(i.lines || [])).map((l) => ({ ...l, _pu0: l.pu, _ht0: r3((+l.pu || 0) / kI(l)), pu: r3((+l.pu || 0) / kI(l)), ...((l.lineIds || []).some((id) => st.has(id)) ? { studio: true } : {}) })), tva: +i.tva || 0, timbre: +i.timbre || 0, fodec: +i.fodec || 0, pricesTTC: false, locked: true, caps: cap, orderId: i.orderId || '', groups: invBlIds(i).length > 1 };
  const r = await ask({ title: `Modifier la facture ${i.number}`, wide: true, okLabel: 'Enregistrer les modifications',
    text: 'Vous pouvez corriger la désignation, la quantité, le PRIX H.T. et la remise, ou supprimer une ligne (lignes « infographie » : prix et remise seulement). Le numéro, la date, le client et les taux ne changent pas. Chaque modification est tracée (journal d’audit). Une facture réglée se corrige par un avoir.',
    fields: [{ k: 'lines', type: 'invlines', value: x0 }] });
  if (!r) return;
  const L = r.lines.lines.filter((l) => +l.qty > 0);
  if (!L.length) return toast('Une facture garde au moins une ligne : pour tout retirer, annulez la facture.', true);
  if (L.some((l) => !String(l.designation).trim())) return toast('Chaque ligne doit avoir une désignation.', true);
  const rec = { ...i, lines: L.map(({ studio, _pu0, _ht0, ...l }) => {
    const y = { ...l, qty: +l.qty, pu: _pu0 !== undefined && r3(+l.pu) === _ht0 ? _pu0 : r3(+l.pu * kI(l)), remise: Math.min(100, Math.max(0, +l.remise || 0)) };
    if ((l.lineIds || []).length === 1) y.qtyBy = { [l.lineIds[0]]: y.qty }; // une seule taille : la quantité saisie est celle de la taille
    if ((l.lineIds || []).length > 1) { // libellé « (M×6, L×4) » remis à jour
      const o = db.orders.find((z) => z.id === lineOrderId(i, l)), sz = (l.lineIds || []).map((id) => [o && (o.lines.find((z) => z.id === id) || {}).size, +y.qtyBy[id] || 0]).filter(([a, q]) => a && q > 0);
      if (sz.length) y.designation = String(y.designation).replace(/\s*\([^()]*×[^()]*\)\s*$/, '') + ` (${sz.map(([a, q]) => `${a}×${q}`).join(', ')})`;
      y.lineIds = l.lineIds.filter((id) => +y.qtyBy[id] > 0); y.qtyBy = Object.fromEntries(y.lineIds.map((id) => [id, +l.qtyBy[id]]));
    }
    return y;
  }) };
  rec.advance = r3(Math.min(+i.advance || 0, invoiceTotals(rec).net));
  try { await put('invoices', rec); }
  catch (e) {
    if (/vente à perte/i.test(e.message) && confirm(e.message + '\n\nConfirmer la vente à perte ?')) await put('invoices', { ...rec, confirmer_perte: true });
    else throw e;
  }
  render(true); toast(`Facture ${i.number} modifiée.`);
}

/* ------------------------------------------------------------------ fenêtre de saisie */
// 0.10.1 : fenêtres de saisie avec barre ─ (réduire) ☐ (plein écran / fenêtre) ✕ (fermer) ; les grandes s'ouvrent en plein écran.
// Éditeur de lignes : Réf (suggestions produits finis + articles) | Désignation | Service | [Couleur | Taille] | Qté | PRIX H.T. | Remise % | Total H.T.
let ASK_OPEN = false;
const blankLine = (cs) => ({ article: '', designation: '', staff: '', qty: 1, pu: 0, remise: 0, ...(cs ? { color: '', size: '' } : {}) });
function ask({ title, text = '', fields = [], okLabel = 'Valider', wide = false }) {
  if (ASK_OPEN) { toast('Une fenêtre de saisie est déjà ouverte (ou réduite en bas de l’écran) : terminez-la d’abord.', true); const m = $('#dlgmin'); if (m) m.classList.add('flash'); return Promise.resolve(null); }
  ASK_OPEN = true;
  return new Promise((resolve) => {
    const dlg = $('#dlg'), v = {}; let full = wide, mini = false;
    for (const f of fields) v[f.k] = f.type === 'checks' ? Object.fromEntries(f.rows.map((r) => [r.id, (f.value || []).includes(r.id)])) : f.type === 'table' ? Object.fromEntries(f.rows.map((r) => [r.id, r.max])) : f.type === 'invlines' ? JSON.parse(JSON.stringify(f.value)) : f.type === 'check' ? false : (f.value ?? '');
    const staffs = staffList(cat);
    const invT = (x) => { const X = invoiceTotals({ ...x, pricesTTC: false }); return x.noTotals ? `<div class="tot sm"><div class="big"><span>Total H.T.</span><b>${M(X.ht)}</b></div></div>` : `<div class="tot sm"><div><span>Total H.T.</span><b>${M(X.ht)}</b></div>${X.remise ? `<div><span>dont remises</span><b>${M(X.remise)}</b></div>` : ''}${X.fodec ? `<div><span>FODEC ${+x.fodec} %</span><b>${M(X.fodec)}</b></div>` : ''}<div><span>TVA ${+x.tva} %</span><b>${M(X.tva)}</b></div><div><span>Total TTC</span><b>${M(X.ttc)}</b></div><div><span>Timbre</span><b>${M(X.timbre)}</b></div><div class="big"><span>Net à payer</span><b>${M(X.net)}</b></div></div>`; };
    const lineHT = (l) => r3((+l.qty || 0) * (+l.pu || 0) * (1 - Math.min(100, Math.max(0, +l.remise || 0)) / 100));
    const field = (f) => {
      if (f.type === 'select') return `<label>${esc(f.label)}<select data-k="${f.k}">${f.options.map(([k, l]) => `<option value="${esc(k)}" ${k === v[f.k] ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
      if (f.type === 'date') return `<label>${esc(f.label)}<input data-date data-k="${f.k}" value="${esc(v[f.k])}" ${f.k === 'date' ? 'required' : ''}></label>`;
      if (f.type === 'check') return `<label class="chk"><input type="checkbox" data-k="${f.k}"> ${esc(f.label)}</label>`;
      if (f.type === 'checks') return `<div class="w2"><table class="t ed"><thead><tr><th style="width:34px"><input type="checkbox" data-ckall="${f.k}" title="Tout cocher / décocher" ${f.rows.every((r) => v[f.k][r.id]) ? 'checked' : ''}></th>${f.cols.map((c) => `<th class="${c.n ? 'n' : ''}">${esc(c.l)}</th>`).join('')}</tr></thead><tbody>${f.rows.map((r) => `<tr class="ckrow ${v[f.k][r.id] ? 'on' : ''}"><td><input type="checkbox" data-ck="${f.k}" data-id="${esc(r.id)}" ${v[f.k][r.id] ? 'checked' : ''}></td>${r.cells.map((c, i) => `<td class="${f.cols[i].n ? 'n' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table>
        <p class="hint" data-cksum="${f.k}">${f.sum ? f.sum(v[f.k]) : ''}</p></div>`;
      if (f.type === 'table') return `<div class="w2"><table class="t ed"><thead><tr><th>Ligne</th><th class="n">Reste</th><th class="n">À livrer</th></tr></thead><tbody>${f.rows.map((r) => `<tr><td>${esc(r.label)}</td><td class="n mute">${r.max}</td><td class="n"><input type="number" min="0" max="${r.max}" step="1" data-tk="${f.k}" data-id="${esc(r.id)}" value="${v[f.k][r.id]}"></td></tr>`).join('')}</tbody></table>
        <div class="row"><button type="button" class="btn sm ghost" data-all="${f.k}">Tout livrer</button><button type="button" class="btn sm ghost" data-none="${f.k}">Tout à zéro</button></div></div>`;
      if (f.type === 'invlines') { const x = v[f.k], cs = !!x.cs, rem = x.remise !== false;
        const row = (l, i) => { const lk = !!l.studio;
          return `<tr ${ficheAttr(l.article, l.orderId || x.orderId)}><td class="refc"><input data-il="${i}" data-c="article" value="${esc(l.article || '')}" placeholder="Réf." autocomplete="off" ${lk ? 'readonly' : ''}></td>
            <td><input data-il="${i}" data-c="designation" value="${esc(l.designation)}" ${lk ? 'readonly' : ''}>${lk ? '<span class="tag" title="Commande saisie en Infographie : seuls le prix et la remise se modifient">infographie</span>' : ''}</td>
            <td><select data-il="${i}" data-c="staff" ${lk ? 'disabled' : ''}><option value="">—</option>${[...new Set([...staffs, l.staff].filter(Boolean))].map((s2) => `<option ${s2 === l.staff ? 'selected' : ''}>${esc(s2)}</option>`).join('')}</select></td>
            ${cs ? `<td><input data-il="${i}" data-c="color" value="${esc(l.color || '')}" class="w-s"></td><td><input data-il="${i}" data-c="size" value="${esc(l.size || '')}" class="w-xs"></td>` : ''}
            <td class="n">${l.qtyBy && Object.keys(l.qtyBy).length > 1 ? `<button type="button" class="btn sm ghost" data-ilsz="${i}" title="Quantités par taille" ${lk ? 'disabled' : ''}>${l.qty}${lk ? '' : ' ✎'}</button>` : `<input type="number" min="0" step="1" data-il="${i}" data-c="qty" value="${l.qty}" ${lk ? 'readonly' : ''}>`}</td>
            <td class="n"><input type="number" min="0" step="0.001" data-il="${i}" data-c="pu" value="${l.pu}"></td>
            ${rem ? `<td class="n"><input type="number" min="0" max="100" step="1" data-il="${i}" data-c="remise" value="${l.remise || 0}"></td>` : ''}
            <td class="n b" data-lt="${i}">${dt(lineHT(l))}</td><td>${lk ? '' : `<button type="button" class="ib" data-ildel="${i}" title="Supprimer la ligne">✕</button>`}</td></tr>`; };
        const ncol = 7 + (cs ? 2 : 0) + (rem ? 1 : 0);
        const body = x.lines.some((l) => l.blId) ? invoiceGroups({ lines: x.lines }).map((g) => `<tr class="grp"><td colspan="${ncol}">${esc(g.titre)}</td></tr>${g.lignes.map(({ l, i }) => row(l, i)).join('')}`).join('') : x.lines.map(row).join('');
        return `<div class="w2 lines-ed"><table class="t ed"><thead><tr><th>Réf.</th><th>Désignation</th><th>Service</th>${cs ? '<th>Couleur</th><th>Taille</th>' : ''}<th class="n">Qté</th><th class="n">PRIX H.T.</th>${rem ? '<th class="n">Remise %</th>' : ''}<th class="n">Total H.T.</th><th></th></tr></thead><tbody>${body}</tbody></table>
          <div class="row">${x.fixed ? '' : '<button type="button" class="btn sm ghost" data-iladd>+ Ligne</button>'}${x.locked || x.noTotals ? (x.locked ? '<span class="hint">Taux et timbre de la facture émise : inchangés.</span>' : '') : `<label class="inl">TVA %<input type="number" step="0.5" min="0" data-ix="tva" value="${x.tva}"></label><label class="inl">Timbre DT<input type="number" step="0.1" min="0" data-ix="timbre" value="${x.timbre}"></label>`}<span class="hint">Cliquez dans Réf. : tous les produits s’affichent ; tapez pour filtrer, ↑ ↓ pour choisir, Entrée pour valider.</span></div>
          <div data-invtot>${invT(x)}</div></div>`; }
      return `<label class="${f.list ? 'w2' : ''}">${esc(f.label)}<input data-k="${f.k}" type="${f.type === 'number' ? 'number' : 'text'}" ${f.type === 'number' ? 'step="0.001" min="0"' : ''} value="${esc(v[f.k])}" placeholder="${esc(f.placeholder || '')}" ${f.list ? `list="dl-${f.k}"` : ''} autocomplete="off">${f.list ? `<datalist id="dl-${f.k}">${f.list.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>` : ''}</label>`;
    };
    const draw = () => {
      dlg.innerHTML = `<form class="dlg-b ${full ? 'full' : wide ? 'wide' : ''}" novalidate><div class="dlg-h"><h3>${esc(title)}</h3><div class="wbtn"><button type="button" data-wmin title="Réduire">─</button><button type="button" data-wmax title="${full ? 'Fenêtre' : 'Plein écran'}">${full ? '❐' : '☐'}</button><button type="button" data-x title="Fermer" class="wx">✕</button></div></div>
        <div class="dlg-c">${text ? `<p class="hint">${esc(text)}</p>` : ''}<div class="g2">${fields.map(field).join('')}</div></div>
        <div class="row dlg-f"><button type="button" class="btn ghost" data-x>Annuler</button><button type="submit" class="btn">${esc(okLabel)}</button></div></form>`;
      attachDatePickers(dlg); const f0 = dlg.querySelector('input[data-k]:not([data-date]),select[data-k]'); if (f0) setTimeout(() => f0.focus(), 30);
    };
    const inv = () => fields.find((f) => f.type === 'invlines');
    // 0.13.0 : sélecteur de référence commun (liste complète au clic, filtrée à la frappe, 6 lignes, ↑ ↓ Entrée)
    const RP = attachRefPicker(dlg, {
      getItems: () => REFS, prix: true,
      estRef: (el) => el.dataset.c === 'article' && el.dataset.il !== undefined,
      choisir: (el, r) => { const x = v[inv().k], l = x.lines[+el.dataset.il]; if (!l) return;
        Object.assign(l, { article: r.ref, designation: r.designation, ...(r.ht !== null && r.ht !== undefined ? { pu: r3(+r.ht) } : {}), ...(r.service ? { service: true, artType: 'prestation' } : { service: false, artType: r.artType || (r.type === 'Produit fini' ? 'produit_fini' : '') }) });
        draw(); setTimeout(() => { const nx = dlg.querySelector(`[data-il="${el.dataset.il}"][data-c="qty"]`); if (nx) { nx.focus(); nx.select && nx.select(); } }, 60); },
    });
    const closePop = () => RP.fermer();
    const done = (r) => { RP.detacher(); ASK_OPEN = false; const m = $('#dlgmin'); if (m) m.remove(); dlg.hidden = true; dlg.classList.remove('mini'); dlg.innerHTML = ''; dlg.oninput = dlg.onchange = dlg.onclick = dlg.onsubmit = null; dlg.removeEventListener('focusout', fo); window.removeEventListener('keydown', ek); resolve(r); };
    const ek = (e) => { if (mini) return; if (e.key === 'Escape') { if (RP.ouvert()) { closePop(); return; } if (!document.querySelector('.dp-pop') && confirm('Fermer sans enregistrer ?')) done(null); } };
    const fo = () => {};
    const minimize = () => { mini = true; closePop(); dlg.classList.add('mini'); const bar = document.createElement('button'); bar.id = 'dlgmin'; bar.type = 'button'; bar.innerHTML = `<span>▲</span> ${esc(title)} <small>(réduite — cliquez pour reprendre)</small>`; bar.onclick = () => { mini = false; dlg.classList.remove('mini'); bar.remove(); }; document.body.appendChild(bar); };
    const upd = (e) => {
      const t = e.target, ds = t.dataset;
      if (ds.k) v[ds.k] = t.type === 'checkbox' ? t.checked : t.matches('[data-date]') ? t.dataset.iso : t.value;
      else if (ds.tk) v[ds.tk][ds.id] = Math.min(+t.max, Math.max(0, Math.floor(+t.value || 0)));
      else if (ds.ck || ds.ckall) { const k0 = ds.ck || ds.ckall, f = fields.find((x) => x.k === k0); if (e.type !== 'change') return;
        if (ds.ckall) for (const r of f.rows) v[k0][r.id] = t.checked; else v[k0][ds.id] = t.checked;
        dlg.querySelectorAll(`[data-ck="${k0}"]`).forEach((c) => { c.checked = !!v[k0][c.dataset.id]; c.closest('tr').classList.toggle('on', c.checked); });
        const all = dlg.querySelector(`[data-ckall="${k0}"]`); if (all) all.checked = f.rows.every((r) => v[k0][r.id]);
        const sm = dlg.querySelector(`[data-cksum="${k0}"]`); if (sm && f.sum) sm.innerHTML = f.sum(v[k0]); }
      else if (ds.il !== undefined) { const x = v[inv().k], l = x.lines[+ds.il]; l[ds.c] = ['designation', 'article', 'staff', 'color', 'size'].includes(ds.c) ? t.value : +t.value || 0;
        if (ds.c === 'article' && e.type === 'input') l.article = t.value.trim().toUpperCase();
        if (ds.c === 'article' && e.type === 'change') { const r = REFS.find((y) => y.ref === t.value.trim().toUpperCase()); if (r && !l.designation) { setTimeout(() => { if (!RP.ouvert()) { Object.assign(l, { article: r.ref, designation: r.designation, ...(r.ht != null ? { pu: r3(+r.ht) } : {}), service: !!r.service }); draw(); } }, 160); } }
        const c = dlg.querySelector(`[data-lt="${ds.il}"]`); if (c) c.textContent = dt(lineHT(l)); dlg.querySelector('[data-invtot]').innerHTML = invT(x); }
      else if (ds.ix) { const x = v[inv().k]; x[ds.ix] = +t.value || 0; dlg.querySelector('[data-invtot]').innerHTML = invT(x); }
    };
    dlg.oninput = upd; dlg.onchange = upd; dlg.addEventListener('focusout', fo);
    dlg.onclick = (e) => { const ckr = e.target.closest('tr.ckrow'); if (ckr && !e.target.matches('input')) { const c = ckr.querySelector('input[data-ck]'); if (c) c.click(); return; }
      const b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-x')) { if (!e.isTrusted || b.classList.contains('wx') ? confirm('Fermer sans enregistrer ?') : true) done(null); }
      else if (b.hasAttribute('data-wmin')) minimize();
      else if (b.hasAttribute('data-wmax')) { const fm = dlg.querySelector('form'); full = !full; fm.classList.toggle('full', full); b.textContent = full ? '❐' : '☐'; b.title = full ? 'Fenêtre' : 'Plein écran'; }
      else if (b.dataset.all) { const f = fields.find((x) => x.k === b.dataset.all); for (const r of f.rows) v[f.k][r.id] = r.max; draw(); }
      else if (b.dataset.none) { const f = fields.find((x) => x.k === b.dataset.none); for (const r of f.rows) v[f.k][r.id] = 0; draw(); }
      else if (b.hasAttribute('data-iladd')) { const x = v[inv().k]; x.lines.push(blankLine(x.cs)); draw(); const l = dlg.querySelectorAll('[data-c="article"]'); if (l.length) l[l.length - 1].focus(); }
      else if (b.dataset.ildel !== undefined) { v[inv().k].lines.splice(+b.dataset.ildel, 1); draw(); }
      else if (b.dataset.ilsz !== undefined) { // quantités par taille d'une ligne regroupée (plafond : reste à facturer de la commande)
        const x = v[inv().k], l = x.lines[+b.dataset.ilsz], caps = x.caps || {};
        for (const id of l.lineIds || []) {
          const c = caps[id] || { max: Infinity, label: id }, cur0 = +(l.qtyBy || {})[id] || 0;
          const a = prompt(`${l.designation}\nQuantité pour « ${c.label} »${Number.isFinite(c.max) ? ` (au plus ${c.max})` : ''} :`, String(cur0));
          if (a === null) break;
          const q2 = Math.max(0, Math.floor(+a || 0)); if (q2 > c.max) { alert(`${c.max} au plus pour « ${c.label} ».`); continue; }
          l.qtyBy[id] = q2;
        }
        l.qty = Object.values(l.qtyBy || {}).reduce((s2, q2) => s2 + (+q2 || 0), 0); draw();
      } };
    dlg.ondblclick = (e) => { const tr = e.target.closest('tr[data-fiche]'); if (tr && !e.target.matches('input,select') && (tr.dataset.fiche || tr.dataset.fo)) ouvrirFiche(tr.dataset.fiche, tr.dataset.fo); };
    dlg.onsubmit = (e) => { e.preventDefault(); done(JSON.parse(JSON.stringify(v))); };
    window.addEventListener('keydown', ek);
    dlg.hidden = false; draw();
  });
}
async function ouvrirFiche(ref, oid) {
  if (!D.fichiers) return toast('Fiches techniques disponibles dans l’ERP web.', true);
  try { await D.fichiers.fiche(ref || '', oid || ''); }
  catch (e) { toast(/fiche_absente|aucune fiche/i.test(e.message) ? `Aucune fiche technique enregistrée pour ${ref || 'cette commande'}.` : e.message, true); }
}

/* ------------------------------------------------------------------ utilitaires */
function busy(m) { const b = $('#busy'); if (!m) { b.hidden = true; return; } b.hidden = false; $('#busy span').textContent = m; }
let tt; function toast(m, err) { const t = $('#toast'); t.textContent = m; t.className = 'show' + (err ? ' err' : ''); clearTimeout(tt); tt = setTimeout(() => { t.className = ''; }, err ? 6000 : 3800); }
$('#close').onclick = () => window.close();
if (!D || !D.db) document.body.innerHTML = '<p style="padding:40px;font:16px system-ui">La gestion est disponible uniquement dans l’application Windows Uniform Studio 3D.</p>';
else load().catch((e) => toast('Chargement impossible : ' + e.message, true));
