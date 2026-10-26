// Uniform Studio 3D — règles de gestion partagées (studio + fenêtre Gestion) :
// numérotation, lignes de commande, livraisons partielles, facturation, avances, statuts.
import { r3, invoiceTotals } from './docs-pdf.js';
export { r3, invoiceTotals };

export const GDEF = { orderPrefix: 'CMD', blPrefix: 'BL', invoicePrefix: 'FAC', receiptPrefix: 'REC', tva: 19, timbre: 1, pricesTTC: true, dueDays: 30, paymentModes: ['Espèces', 'Chèque', 'Virement', 'Carte bancaire', 'Traite'], invoiceNote: '', showAdvanceOnSheet: true };
export const DEFAULT_STAFF = ['JARDIN', 'RECEPTION', 'HOUSEKEEPING', 'ADMINISTRATION', 'ANIMATION', 'LINGERIE', 'CUISINE', 'F&B'];
// v3.2.1 : un catalogue enregistré par la 3.1 n'a pas de staff → liste type hôtel
export const staffList = (cfg) => (cfg && Array.isArray(cfg.staff) && cfg.staff.filter(Boolean).length ? cfg.staff.filter(Boolean) : DEFAULT_STAFF.slice());
export const gset = (cfg) => ({ ...GDEF, ...((cfg && cfg.gestion) || {}) });
export const fmtNo = (prefix, year, n) => `${prefix || ''}${prefix ? '-' : ''}${year}-${String(n).padStart(4, '0')}`;
export const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const norm = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Attribue le prochain numéro (commande, BL, facture, reçu) via le compteur annuel partagé. */
export async function nextNumber(D, cfg, kind, isoDate) {
  const g = gset(cfg), y = +(String(isoDate || '').slice(0, 4)) || new Date().getFullYear();
  const prefix = { order: g.orderPrefix, bl: g.blPrefix, invoice: g.invoicePrefix, receipt: g.receiptPrefix }[kind];
  return fmtNo(prefix, y, await D.db.next(kind, y));
}
export async function peekNumber(D, cfg, kind, isoDate) {
  const g = gset(cfg), y = +(String(isoDate || '').slice(0, 4)) || new Date().getFullYear();
  const prefix = { order: g.orderPrefix, bl: g.blPrefix, invoice: g.invoicePrefix, receipt: g.receiptPrefix }[kind];
  return fmtNo(prefix, y, await D.db.peek(kind, y));
}

/** Trouve ou crée le client (par nom, sans tenir compte des accents ni de la casse). */
export async function ensureClient(D, name, extra = {}) {
  name = String(name || '').trim(); if (!name) return null;
  const db = await D.db.get();
  let c = db.clients.find((x) => norm(x.name) === norm(name));
  if (!c) c = await D.db.put('clients', { name, contact: '', address: '', city: '', phone: '', email: '', mf: '', ...extra });
  return c;
}
export const clientSnap = (c) => (c ? { id: c.id, name: c.name, contact: c.contact || '', address: c.address || '', city: c.city || '', phone: c.phone || '', email: c.email || '', mf: c.mf || '' } : { name: '' });

/** Lignes de commande à partir des produits créés dans le studio (une ligne par couleur et par taille). */
export function linesFromItems(items) {
  const out = [];
  for (const p of items) {
    const SD = { front: 'devant', back: 'dos', left: 'manche G.', right: 'manche D.' };
    const marks = Object.entries(p.marks || {}).map(([sd, m]) => `${m.mode === 'embroidery' ? 'broderie' : 'impression'} ${SD[sd] || sd}`);
    const trims = (p.trims || []).map((t) => `${t.label.toLowerCase()} ${t.name}`);
    const des = `${p.garment}${p.name ? ' « ' + p.name + ' »' : ''}${marks.length ? ' · ' + marks.join(' + ') : ''}${trims.length ? ' · ' + trims.join(', ') : ''}`;
    for (const c of p.colors) for (const [z, q] of Object.entries(c.q)) if (+q > 0) out.push({ id: `${p.uid}|${c.hex}|${z}`, src: 'studio', item: p.uid, designation: des, article: p.article, staff: p.staff || '', color: c.name, size: z, qty: +q, pu: r3((p.unit && p.unit[z]) || 0) });
    if (p.setup > 0) out.push({ id: `${p.uid}|setup`, src: 'studio', item: p.uid, designation: `Programme de broderie · ${p.garment}${p.name ? ' « ' + p.name + ' »' : ''}`, staff: p.staff || '', color: '', size: '', qty: 1, pu: r3(p.setup), service: true });
  }
  return out;
}
export const orderTotal = (o) => r3((o.lines || []).reduce((s, l) => s + (+l.qty || 0) * (+l.pu || 0), 0));
export const advancesTotal = (o) => r3((o.advances || []).reduce((s, a) => s + (+a.amount || 0), 0));

/** Quantités déjà livrées par ligne de commande (tous les BL non annulés de la commande). */
export function delivered(db, order, exceptBl) {
  const m = {};
  for (const b of db.bls) if (b.orderId === order.id && b.id !== exceptBl && b.status !== 'annule') for (const l of b.lines || []) m[l.lineId] = (m[l.lineId] || 0) + (+l.qty || 0);
  return m;
}
export function deliveryState(db, order) {
  const d = delivered(db, order), goods = (order.lines || []).filter((l) => !l.service);
  const tot = goods.reduce((s, l) => s + (+l.qty || 0), 0), done = goods.reduce((s, l) => s + Math.min(+l.qty || 0, d[l.id] || 0), 0);
  return { tot, done, state: !tot ? 'none' : done <= 0 ? 'todo' : done >= tot ? 'done' : 'partial' };
}
// ERP 0.13.0 : une facture peut regrouper plusieurs BL (et donc plusieurs commandes) d'un même client.
// orderIds = commandes de la facture ; chaque ligne porte orderId / blId (sinon : la commande unique de la facture).
export const invOrderIds = (i) => (Array.isArray(i.orderIds) && i.orderIds.length ? i.orderIds : i.orderId ? [i.orderId] : []);
export const lineOrderId = (i, l) => (l && l.orderId) || (invOrderIds(i).length === 1 ? invOrderIds(i)[0] : i.orderId || '');
export const invoicesOf = (db, order) => db.invoices.filter((i) => i.status !== 'annulee' && invOrderIds(i).includes(order.id));
export function invoicedLines(db, order, exceptInv) {
  const m = {}; for (const i of invoicesOf(db, order)) if (i.id !== exceptInv) for (const l of i.lines || []) { if (lineOrderId(i, l) !== order.id) continue; for (const id of l.lineIds || []) m[id] = (m[id] || 0) + (l.qtyBy ? +l.qtyBy[id] || 0 : 0); }
  return m;
}
const advOf = (i, order) => (i.advanceBy && typeof i.advanceBy === 'object' ? +i.advanceBy[order.id] || 0 : invOrderIds(i).length <= 1 ? +i.advance || 0 : 0);
export const advanceUsed = (db, order, exceptInv) => r3(invoicesOf(db, order).filter((i) => i.id !== exceptInv).reduce((s, i) => s + advOf(i, order), 0));
/** BL d'une facture (multi-BL ou ancienne facture « selon le BL »), dans l'ordre de la facture. */
export const invBlIds = (i) => (Array.isArray(i.blIds) ? i.blIds : []);
/** BL non annulés et non facturés (facture non annulée). */
export const blInvoiced = (db, b) => db.invoices.find((i) => i.status !== 'annulee' && invBlIds(i).includes(b.id)) || null;
export const blsToInvoice = (db) => db.bls.filter((b) => b.status !== 'annule' && !blInvoiced(db, b));
/** Groupes d'affichage d'une facture multi-BL : [{ key, titre, lignes:[{l, i}] }] (lignes sans BL : groupe « Autres lignes »). */
export function invoiceGroups(inv, lines) {
  const L = lines || inv.lines || [];
  if (!L.some((l) => l.blId)) return [{ key: '', titre: '', lignes: L.map((l, i) => ({ l, i })) }];
  const g = new Map();
  L.forEach((l, i) => { const k = l.blId || ''; if (!g.has(k)) g.set(k, { key: k, titre: groupTitle(l), lignes: [] }); g.get(k).lignes.push({ l, i }); });
  return [...g.values()];
}
export const groupTitle = (l) => (l.blId ? [`BL n° ${l.blNumber || ''}${l.blDate ? ' du ' + String(l.blDate).split('-').reverse().join('/') : ''}`, l.orderNumber ? 'Commande n° ' + l.orderNumber : '', l.clientPO ? 'BC client ' + l.clientPO : ''].filter(Boolean).join(' — ') : 'Autres lignes');
export const paidOf = (inv) => r3((+inv.advance || 0) + (inv.payments || []).reduce((s, p) => s + (+p.amount || 0), 0));
export function invoiceState(inv) {
  if (inv.status === 'annulee') return 'annulee';
  const net = invoiceTotals(inv).net, paid = paidOf(inv);
  return paid >= net - 0.0005 ? 'payee' : paid > 0 ? 'partielle' : 'impayee';
}
export function orderState(db, o) {
  const inv = invoicesOf(db, o), d = deliveryState(db, o);
  if (o.status === 'annulee') return 'annulee';
  if (inv.length && inv.every((i) => invoiceState(i) === 'payee') && (d.state === 'done' || d.state === 'none')) return 'soldee';
  if (inv.length) return 'facturee';
  if (d.state === 'done') return 'livree';
  if (d.state === 'partial') return 'partielle';
  return 'en_cours';
}
export const STATE_LABEL = { en_cours: 'En cours', partielle: 'Livrée en partie', livree: 'Livrée', facturee: 'Facturée', soldee: 'Soldée', annulee: 'Annulée', payee: 'Payée', impayee: 'Non payée', partielle_f: 'Payée en partie', annule: 'Annulé', livre: 'Livré', brouillon: 'Brouillon' };

/** Prépare les lignes d'une facture : regroupe par désignation, staff, couleur et prix unitaire. */
export function groupInvoiceLines(orderLines, qtyById) {
  const g = new Map();
  for (const l of orderLines) {
    const q = qtyById ? +qtyById[l.id] || 0 : +l.qty || 0; if (q <= 0) continue;
    const k = [l.designation, l.staff, l.color, r3(l.pu)].join('¦');
    let x = g.get(k);
    if (!x) { x = { designation: [l.designation, l.staff && 'Staff ' + l.staff, l.color].filter(Boolean).join(' · '), sizes: [], qty: 0, pu: r3(l.pu), remise: 0, lineIds: [], qtyBy: {} }; g.set(k, x); }
    x.qty += q; x.lineIds.push(l.id); x.qtyBy[l.id] = q; if (l.size) x.sizes.push(`${l.size}×${q}`);
  }
  return [...g.values()].map((x) => ({ ...x, designation: x.designation + (x.sizes.length ? ` (${x.sizes.join(', ')})` : ''), sizes: undefined }));
}
