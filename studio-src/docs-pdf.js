// Uniform Studio 3D — documents commerciaux en PDF (A4 portrait) : bon de livraison, facture, reçu d'avance.
// Polices standard PDF (jeu Windows-1252) : le symbole « د.ت » est écrit « DT ».
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const W = 595.28, H = 841.89, M = 40;
const INK = rgb(0.08, 0.15, 0.23), BLUE = rgb(0.12, 0.31, 0.49), MUTE = rgb(0.42, 0.47, 0.52), RULE = rgb(0.82, 0.86, 0.9), BAND = rgb(0.93, 0.95, 0.97), WHITE = rgb(1, 1, 1);
const WIN = /[^\u0020-\u007e\u00a0-\u00ff\u20ac\u2018\u2019\u201c\u201d\u2022\u2026\u2013\u2014\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u02c6\u02dc\u2030\u2039\u203a\u2122]/g;
const T = (s) => String(s ?? '').replace(/[\u202f\u00a0]/g, ' ').replace(/[\u0600-\u06ff.]*د\.ت[\u0600-\u06ff.]*/g, 'DT').replace(WIN, '?');
export const fr = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
export const r3 = (v) => Math.round((+v || 0) * 1000) / 1000;
export const dt = (v, dec = 3) => { const n = (Math.round((+v || 0) * 10 ** dec) / 10 ** dec).toFixed(dec); let [i, d] = n.split('.'); const neg = i.startsWith('-'); if (neg) i = i.slice(1); i = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' '); return (neg ? '-' : '') + i + (d ? ',' + d : ''); };

/* ---------- montant en lettres (dinars et millimes) ---------- */
const U = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const D = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];
function lt100(n) {
  if (n < 20) return U[n];
  const d = Math.floor(n / 10), u = n % 10;
  if (d === 7 || d === 9) { const r = 10 + u; return D[d] + (r === 11 && d === 7 ? ' et ' : '-') + U[r]; }
  if (u === 0) return D[d] + (d === 8 ? 's' : '');
  return D[d] + (u === 1 && d !== 8 ? ' et un' : '-' + U[u]);
}
function lt1000(n) {
  const c = Math.floor(n / 100), r = n % 100;
  const cs = c === 0 ? '' : c === 1 ? 'cent' : U[c] + ' cent' + (r === 0 ? 's' : '');
  return [cs, r ? lt100(r) : ''].filter(Boolean).join(' ') || 'zéro';
}
export function words(n) {
  n = Math.floor(Math.abs(n)); if (n === 0) return 'zéro';
  const parts = [], b = Math.floor(n / 1e9), m = Math.floor((n % 1e9) / 1e6), k = Math.floor((n % 1e6) / 1000), r = n % 1000;
  if (b) parts.push(lt1000(b) + (b > 1 ? ' milliards' : ' milliard'));
  if (m) parts.push(lt1000(m) + (m > 1 ? ' millions' : ' million'));
  if (k) parts.push(k === 1 ? 'mille' : lt1000(k).replace(/cents$/, 'cent') + ' mille');
  if (r) parts.push(lt1000(r));
  return parts.join(' ');
}
export function amountWords(v, cur = 'DT') {
  if (cur === 'EUR' || cur === 'USD') {
    const t = Math.round((+v || 0) * 100), un = Math.floor(t / 100), ce = t % 100, nom = cur === 'EUR' ? 'euro' : 'dollar';
    let s = `${words(un)} ${nom}${un > 1 ? 's' : ''}${cur === 'USD' ? ' américain' + (un > 1 ? 's' : '') : ''}`;
    if (ce) s += ` et ${words(ce)} cent${cur === 'EUR' ? 'ime' : ''}${ce > 1 ? 's' : ''}`;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  const t = Math.round((+v || 0) * 1000), di = Math.floor(t / 1000), mi = t % 1000;
  let s = `${words(di)} dinar${di > 1 ? 's' : ''}`;
  if (mi) s += ` et ${words(mi)} millime${mi > 1 ? 's' : ''}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
// 0.7.0 : factures export en EUR ou USD (2 décimales), DT en 3 décimales
export const cur = (inv) => (inv && (inv.currency === 'EUR' || inv.currency === 'USD') ? inv.currency : 'DT');
export const money = (v, c = 'DT') => (c === 'DT' ? dt(v) : dt(v, 2)) + ' ' + c;

/* ---------- calculs de facture ---------- */
// ERP 0.9.1 : même calcul que le serveur (api/lib/calculs.js · totauxFacture), FODEC compris
// (taux figé sur la facture, sur le HT des produits hors prestations, ajouté avant la TVA).
export function invoiceTotals(inv) {
  const t = (+inv.tva || 0) / 100, f = (+inv.fodec || 0) / 100, ttcMode = inv.pricesTTC !== false;
  const rem = (l) => Math.min(100, Math.max(0, +l.remise || 0)) / 100, presta = (l) => !!(l.service || l.artType === 'prestation');
  const L = inv.lines || [];
  const lines = L.map((l) => {
    const q = +l.qty || 0, k = ttcMode ? (1 + t) * (presta(l) ? 1 : 1 + f) : 1, puHT = (+l.pu || 0) / k;
    return { ...l, puHT: r3(puHT), totHT: r3(q * puHT * (1 - rem(l))), brutHT: r3(q * puHT) };
  });
  const remise = r3(lines.reduce((s, l) => s + l.brutHT - l.totHT, 0));
  let ht, fodec = 0, tva, ttc;
  if (ttcMode) {
    const ex = (arr) => arr.reduce((s, l) => s + (+l.qty || 0) * (+l.pu || 0) * (1 - rem(l)), 0);
    ttc = r3(ex(L));
    if (!f) ht = r3(ttc / (1 + t));
    else { const htP = r3(ex(L.filter((l) => !presta(l))) / ((1 + t) * (1 + f))); ht = r3(htP + ex(L.filter(presta)) / (1 + t)); fodec = r3(htP * f); }
    tva = r3(ttc - ht - fodec);
  } else {
    ht = r3(lines.reduce((s, l) => s + l.totHT, 0));
    fodec = r3(lines.filter((l) => !presta(l)).reduce((s, l) => s + l.totHT, 0) * f);
    tva = r3((ht + fodec) * t); ttc = r3(ht + fodec + tva);
  }
  const timbre = r3(inv.timbre || 0);
  return { lines, ht, remise, fodec, tva, ttc, timbre, net: r3(ttc + timbre) };
}

/* ---------- mise en page commune ---------- */
async function embed(pdf, dataUrl) {
  if (!dataUrl) return null;
  try { const b = new Uint8Array(await (await fetch(dataUrl)).arrayBuffer()); return b[0] === 0x89 ? await pdf.embedPng(b) : await pdf.embedJpg(b); } catch (e) { return null; }
}
class Doc {
  async init(title) {
    this.pdf = await PDFDocument.create(); this.pdf.setTitle(T(title)); this.pdf.setCreator('Uniform Studio 3D'); this.pdf.setProducer('Uniform Studio 3D');
    this.B = await this.pdf.embedFont(StandardFonts.HelveticaBold); this.R = await this.pdf.embedFont(StandardFonts.Helvetica); this.I = await this.pdf.embedFont(StandardFonts.HelveticaOblique);
    return this;
  }
  page() { this.p = this.pdf.addPage([W, H]); this.y = M; this.pages = (this.pages || 0) + 1; return this.p; }
  t(s, x, y, size = 9, f = this.R, color = INK) { this.p.drawText(T(s), { x, y: H - y, size, font: f, color }); }
  w(s, size, f = this.R) { return f.widthOfTextAtSize(T(s), size); }
  right(s, xr, y, size = 9, f = this.R, color = INK) { this.t(s, xr - this.w(s, size, f), y, size, f, color); }
  center(s, x, w, y, size = 9, f = this.R, color = INK) { this.t(s, x + (w - this.w(s, size, f)) / 2, y, size, f, color); }
  fit(s, size, f, w) { s = T(s); while (s.length > 2 && this.w(s, size, f) > w) s = s.slice(0, -2) + '.'; return s; }
  wrap(s, size, f, w, max = 4) { const out = []; for (const para of T(s).split(/\n/)) { let row = ''; for (const wd of para.split(/\s+/)) { const tr = row ? row + ' ' + wd : wd; if (this.w(tr, size, f) > w && row) { out.push(row); row = wd; } else row = tr; } out.push(row); } return out.slice(0, max); }
  rect(x, y, w, h, o) { this.p.drawRectangle({ x, y: H - y - h, width: w, height: h, ...o }); }
  line(x1, y1, x2, y2, th = 0.6, c = RULE) { this.p.drawLine({ start: { x: x1, y: H - y1 }, end: { x: x2, y: H - y2 }, thickness: th, color: c }); }

  async header(co, title, number, rows) {
    this.page();
    const logo = await embed(this.pdf, co.logo);
    let y = M;
    if (logo) { const k = Math.min(150 / logo.width, 54 / logo.height); this.p.drawImage(logo, { x: M, y: H - y - logo.height * k, width: logo.width * k, height: logo.height * k }); y += logo.height * k + 6; }
    else { this.t(co.name || 'Votre société', M, y + 16, 16, this.B, BLUE); y += 24; }
    const info = [logo ? co.name : '', co.address, co.city, [co.phone && 'Tél. ' + co.phone, co.email].filter(Boolean).join(' · '), co.web, co.mf && 'MF : ' + co.mf].filter(Boolean);
    for (const l of info) { this.t(l, M, y + 9, 8.2, l === co.name ? this.B : this.R, l === co.name ? INK : MUTE); y += 11; }
    // titre à droite
    const xr = W - M;
    this.right(title, xr, M + 18, 20, this.B, BLUE);
    this.right('N° ' + number, xr, M + 36, 12, this.B);
    let ry = M + 54;
    for (const [k, v] of rows) { if (!v) continue; this.right(v, xr, ry, 9, this.B); this.right(k + ' ', xr - this.w(v, 9, this.B), ry, 9, this.R, MUTE); ry += 13; }
    this.y = Math.max(y, ry) + 10;
  }
  clientBox(c, extra = []) {
    const x = W / 2 + 10, w = W - M - x, lines = [c.name, c.contact, c.address, c.city, c.phone && 'Tél. ' + c.phone, c.mf && 'MF : ' + c.mf, ...extra].filter(Boolean);
    const h = 22 + lines.length * 12;
    this.rect(x, this.y, w, h, { borderColor: RULE, borderWidth: 0.8, color: WHITE });
    this.t('CLIENT', x + 10, this.y + 14, 7.5, this.B, MUTE);
    let yy = this.y + 28; for (const [i, l] of lines.entries()) { this.t(this.fit(l, i ? 9 : 10.5, i ? this.R : this.B, w - 20), x + 10, yy, i ? 9 : 10.5, i ? this.R : this.B); yy += 12; }
    this.y += h + 16;
  }
  table(cols, rows, { zebra = true } = {}) {
    // cols: [{ label, w, align }]
    const x0 = M, total = W - 2 * M, scale = total / cols.reduce((s, c) => s + c.w, 0);
    const cw = cols.map((c) => c.w * scale);
    const head = () => {
      this.rect(x0, this.y, total, 20, { color: BLUE });
      let x = x0; for (const [i, c] of cols.entries()) { const tx = c.align === 'r' ? null : x + 6; if (tx === null) this.right(c.label, x + cw[i] - 6, this.y + 13.5, 8, this.B, WHITE); else this.t(c.label, tx, this.y + 13.5, 8, this.B, WHITE); x += cw[i]; }
      this.y += 20;
    };
    head();
    for (const [ri, r] of rows.entries()) {
      const wrapped = r.map((v, i) => (cols[i].wrap ? this.wrap(v, 8.6, this.R, cw[i] - 12, 3) : [this.fit(v, 8.6, cols[i].bold ? this.B : this.R, cw[i] - 12)]));
      const h = Math.max(18, 7 + 11 * Math.max(...wrapped.map((x) => x.length)));
      if (this.y + h > H - 150) { this.footerNote(); this.page(); this.y = M; head(); }
      if (zebra && ri % 2) this.rect(x0, this.y, total, h, { color: BAND });
      let x = x0;
      for (const [i, c] of cols.entries()) {
        let yy = this.y + 12.5;
        for (const l of wrapped[i]) { if (c.align === 'r') this.right(l, x + cw[i] - 6, yy, 8.6, c.bold ? this.B : this.R); else this.t(l, x + 6, yy, 8.6, c.bold || (i === 0 && r.bold) ? this.B : this.R); yy += 11; }
        x += cw[i];
      }
      this.y += h; this.line(x0, this.y, x0 + total, this.y, 0.5);
    }
    this.y += 10;
  }
  totals(rows, { x = W / 2 + 40 } = {}) {
    const w = W - M - x;
    for (const [k, v, strong] of rows) {
      if (strong) { this.rect(x, this.y, w, 22, { color: BLUE }); this.t(k, x + 8, this.y + 14.5, 9.5, this.B, WHITE); this.right(v, x + w - 8, this.y + 14.5, 10.5, this.B, WHITE); this.y += 24; }
      else { this.t(k, x + 8, this.y + 12, 9, this.R, MUTE); this.right(v, x + w - 8, this.y + 12, 9, this.B); this.y += 17; this.line(x, this.y - 2, x + w, this.y - 2, 0.4); }
    }
    this.y += 8;
  }
  para(s, size = 8.6, f = this.R, color = INK, w = W - 2 * M) { for (const l of this.wrap(s, size, f, w, 8)) { this.t(l, M, this.y + size, size, f, color); this.y += size * 1.35; } this.y += 4; }
  signatures(a, b) {
    const y = Math.max(this.y + 10, H - 160), w = (W - 2 * M - 20) / 2;
    for (const [i, l] of [a, b].entries()) { const x = M + i * (w + 20); this.rect(x, y, w, 70, { borderColor: RULE, borderWidth: 0.8 }); this.t(l, x + 8, y + 14, 8, this.B, MUTE); }
    this.y = y + 80;
  }
  footerNote() {}
  footer(co) {
    const parts = [co.name, co.mf && 'MF ' + co.mf, co.rc && 'RC ' + co.rc, co.bank && co.bank, co.rib && 'RIB ' + co.rib].filter(Boolean).join(' · ');
    const n = this.pdf.getPageCount();
    const ment = co.mentions ? this.wrap(co.mentions, 6.8, this.R, W - 2 * M, 3) : [];
    this.pdf.getPages().forEach((pg, i) => {
      ment.forEach((l, k) => pg.drawText(l, { x: M, y: 44 + (ment.length - k) * 8.5, size: 6.8, font: this.R, color: MUTE }));
      pg.drawLine({ start: { x: M, y: 40 }, end: { x: W - M, y: 40 }, thickness: 0.5, color: RULE });
      const s = T(parts); let size = 7.2; while (size > 5 && this.R.widthOfTextAtSize(s, size) > W - 2 * M - 60) size -= 0.3;
      pg.drawText(s, { x: M, y: 28, size, font: this.R, color: MUTE });
      const pn = `Page ${i + 1}/${n}`; pg.drawText(pn, { x: W - M - this.R.widthOfTextAtSize(pn, 7.2), y: 28, size: 7.2, font: this.R, color: MUTE });
    });
  }
  save() { return this.pdf.save({ useObjectStreams: true }); }
}

const clientExtra = (doc) => [doc.clientPO && 'BC client : ' + doc.clientPO];

/* ---------- bon de livraison ---------- */
export async function buildBL(co, bl) {
  const d = await new Doc().init(`Bon de livraison ${bl.number}`);
  await d.header(co, 'BON DE LIVRAISON', bl.number, [['Date :', fr(bl.date)], ['Commande :', bl.orderNumber], ['BC client :', bl.clientPO]]);
  d.clientBox(bl.client || {}, []);
  const rows = (bl.lines || []).filter((l) => +l.qty > 0).map((l) => [l.designation, l.staff || '', l.color || '', l.size || '', String(l.qty)]);
  d.table([{ label: 'Désignation', w: 46, wrap: true }, { label: 'Staff', w: 16 }, { label: 'Couleur', w: 14 }, { label: 'Taille', w: 12 }, { label: 'Qté', w: 9, align: 'r', bold: true }], rows);
  const q = (bl.lines || []).reduce((s, l) => s + (+l.qty || 0), 0);
  d.totals([['Nombre total de pièces', String(q), true]]);
  if (bl.note) d.para('Observations : ' + bl.note, 8.6, d.I, MUTE);
  d.signatures('Livré par (nom, date, signature)', 'Reçu par le client (nom, date, signature, cachet)');
  d.footer(co);
  return d.save();
}

/* ---------- facture ---------- */
export async function buildInvoice(co, inv) {
  const d = await new Doc().init(`Facture ${inv.number}`);
  const C = cur(inv), m = (v) => money(v, C), exp = !!inv.export;
  await d.header(co, exp ? 'FACTURE / INVOICE' : 'FACTURE', inv.number, [['Date :', fr(inv.date)], ['Échéance :', fr(inv.due)], ['Commande :', inv.orderNumber], ['BL :', (inv.blNumbers || []).join(', ')], ['BC client :', inv.clientPO], ['Incoterm :', inv.incoterm], ['Devise :', C !== 'DT' ? C : '']]);
  d.clientBox(inv.client || {}, []);
  const X = invoiceTotals(inv), hasRem = (inv.lines || []).some((l) => +l.remise);
  const n = (v) => (C === 'DT' ? dt(v) : dt(v, 2));
  const cols = [{ label: 'Désignation', w: hasRem ? 40 : 46, wrap: true }, { label: 'Qté', w: 8, align: 'r' }, { label: 'P.U. HT', w: 14, align: 'r' }];
  if (hasRem) cols.push({ label: 'Remise', w: 9, align: 'r' });
  cols.push({ label: 'Total HT', w: 16, align: 'r', bold: true });
  d.table(cols, X.lines.map((l) => [l.designation, String(+l.qty || 0), n(l.puHT), ...(hasRem ? [l.remise ? `${+l.remise} %` : ''] : []), n(l.totHT)]));
  const paid = r3((+inv.advance || 0) + (inv.payments || []).reduce((s, p) => s + (+p.amount || 0), 0));
  const rows = [['Total HT', m(X.ht)], ...(X.fodec ? [[`FODEC ${+inv.fodec} %`, m(X.fodec)]] : []), [`TVA ${+inv.tva || 0} %${exp && !+inv.tva ? ' (exportation)' : ''}`, m(X.tva)], ['Total TTC', m(X.ttc)]];
  if (X.timbre) rows.push(['Droit de timbre', m(X.timbre)]);
  rows.push(['NET À PAYER', m(X.net), true]);
  if (+inv.advance) rows.push(['Avance(s) déduite(s)', '- ' + m(inv.advance)]);
  for (const p of inv.payments || []) rows.push([`${p.ras ? 'Retenue à la source' : 'Règlement'} ${fr(p.date)}${p.mode && !p.ras ? ' · ' + p.mode : ''}`, '- ' + m(p.amount)]);
  if (paid) rows.push(['RESTE À PAYER', m(Math.max(0, X.net - paid)), true]);
  const yT = d.y; d.totals(rows);
  // montant en lettres à gauche des totaux
  const yy = d.y; d.y = yT; d.t('Arrêtée la présente facture à la somme de :', M, d.y + 12, 8.2, d.R, MUTE); d.y += 16;
  for (const l of d.wrap(amountWords(X.net, C) + '.', 9, d.B, W / 2 - M - 10, 5)) { d.t(l, M, d.y + 9, 9, d.B); d.y += 12; }
  if (exp) { d.y += 6; d.t('Vente à l’exportation', M, d.y + 9, 9, d.B, BLUE); d.y += 12; d.t('TVA non applicable — article 11 du Code de la TVA', M, d.y + 9, 8, d.R, MUTE); d.y += 12; }
  if (inv.paymentMode) { d.y += 6; d.t('Mode de règlement : ' + inv.paymentMode, M, d.y + 9, 8.6); d.y += 12; }
  if (co.rib) { d.t('RIB : ' + co.rib + (co.bank ? ' (' + co.bank + ')' : ''), M, d.y + 9, 8.6); d.y += 12; }
  if (inv.ttnRef) { d.t('Référence El Fatoora (TTN) : ' + inv.ttnRef, M, d.y + 9, 8.6, d.B); d.y += 12; }
  d.y = Math.max(d.y, yy) + 4;
  if (inv.note) d.para(inv.note, 8.2, d.I, MUTE);
  d.signatures('Cachet et signature', 'Bon pour accord du client');
  d.footer(co);
  return d.save();
}

/* ---------- reçu d'avance ---------- */
export async function buildReceipt(co, order, adv) {
  const d = await new Doc().init(`Reçu ${adv.receipt}`);
  await d.header(co, 'REÇU D’AVANCE', adv.receipt, [['Date :', fr(adv.date)], ['Commande :', order.number], ['BC client :', order.clientPO]]);
  d.clientBox(order.client || {}, []);
  const total = r3(order.total || 0), paid = r3((order.advances || []).filter((a) => a.date <= adv.date || a.id === adv.id).reduce((s, a) => s + (+a.amount || 0), 0));
  d.para(`Nous reconnaissons avoir reçu de ${order.client && order.client.name ? order.client.name : 'notre client'} la somme de :`, 10);
  d.y += 2; d.rect(M, d.y, W - 2 * M, 34, { color: BAND }); d.t(dt(adv.amount) + ' DT', M + 12, d.y + 22, 16, d.B, BLUE); d.right(adv.mode + (adv.ref ? ' · ' + adv.ref : ''), W - M - 12, d.y + 21, 10, d.B); d.y += 44;
  d.para(amountWords(adv.amount) + '.', 9.5, d.B);
  d.para(`à titre d’avance sur la commande ${order.number}${order.clientPO ? ' (bon de commande client ' + order.clientPO + ')' : ''}.`, 9.5);
  d.y += 6;
  d.totals([['Montant de la commande (TTC)', dt(total) + ' DT'], ['Total des avances reçues', dt(paid) + ' DT'], ['Reste à payer', dt(Math.max(0, total - paid)) + ' DT', true]], { x: M + 200 });
  d.signatures('Cachet et signature', 'Le client');
  d.footer(co);
  return d.save();
}
