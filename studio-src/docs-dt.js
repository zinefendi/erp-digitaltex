// ERP 0.9.1 — impression des documents au format DIGITAL-TEX (modèle WinDev fourni le 22/10/2026) :
// facture, bon de livraison, avoir, devis, proforma. Même gabarit dans tous les modules (Gestion, Ventes, Comptabilité).
// Le fond (logo, cadres, intitulés, pied bancaire) est l'image du formulaire d'origine, titre effacé ; le texte est écrit par-dessus.
// Coordonnées en points depuis le HAUT de la page A4 (595,28 × 841,89), relevées sur les modèles.
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { invoiceTotals, amountWords, dt, fr, r3 } from './docs-pdf.js';

const W = 595.28, H = 841.89;
const NAVY = rgb(0.157, 0.161, 0.455), INK = rgb(0, 0, 0), MUTE = rgb(0.35, 0.37, 0.45), RED = rgb(0.75, 0.16, 0.13), WHITE = rgb(1, 1, 1);
const FONDS = { facture: '/studio/fond-dt-facture.jpg', bl: '/studio/fond-dt-bl.jpg' };
// colonnes du tableau (bords verticaux du modèle)
const COL = { code: [7.2, 70.5], des: [70.5, 372.3], qte: [372.3, 417.6], unite: [417.6, 444.4], pu: [444.4, 492.3], rem: [492.3, 528.3], mt: [528.3, 588.1] };
const CORPS_HAUT = 213, CORPS_BAS = 594; // zone des lignes (sous l'en-tête du tableau, au-dessus des cadres du bas)
const WIN = /[^\u0020-\u007e\u00a0-\u00ff\u20ac\u2018\u2019\u201c\u201d\u2022\u2026\u2013\u2014\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u2030\u2122]/g;
const T = (s) => String(s ?? '').replace(/[\u202f\u00a0\u2009]/g, ' ').replace(/[\u0600-\u06ff.]*د\.ت[\u0600-\u06ff.]*/g, 'DT').replace(/×/g, 'x').replace(WIN, '?');

const fonds = {};
async function fond(pdf, k) {
  if (!fonds[k]) fonds[k] = fetch(FONDS[k], { credentials: 'same-origin' }).then((r) => { if (!r.ok) throw new Error('Modèle d’impression introuvable (' + r.status + ')'); return r.arrayBuffer(); });
  try { return await pdf.embedJpg(await fonds[k]); } catch (e) { delete fonds[k]; throw e; }
}

/**
 * Document générique au format DIGITAL-TEX.
 * d = { titre, fond: 'facture'|'bl', numero, date, refs, client:{code,name,address,city,country,mf}, devise,
 *       lignes:[{code, designation, qte, unite, pu, remise, montant, service}], prix: bool,
 *       totaux:{ht, remise, fodec, tauxFodec, tva, tauxTva, ttc, acompte, net, timbre}, bc, lettres:{libelle, montant},
 *       extras:[[libellé, valeur]], livreur: bool, annule: bool, nomFichier }
 */
export async function buildDocDT(d) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(T(`${d.titre} ${d.numero || ''}`)); pdf.setCreator('ERP UNIFORM STUDIO — DIGITAL-TEX'); pdf.setProducer('ERP UNIFORM STUDIO');
  const R = await pdf.embedFont(StandardFonts.Helvetica), B = await pdf.embedFont(StandardFonts.HelveticaBold);
  const img = await fond(pdf, d.fond === 'bl' ? 'bl' : 'facture');
  const dec = d.devise === 'EUR' || d.devise === 'USD' ? 2 : 3;
  const n = (v) => dt(v, dec);
  const w = (s, sz, f) => f.widthOfTextAtSize(T(s), sz);
  const fit = (s, sz, f, max) => { s = T(s); while (s.length > 1 && f.widthOfTextAtSize(s, sz) > max) s = s.slice(0, -1); return s; };
  const wrap = (s, sz, f, max, lim = 6) => {
    const out = [];
    for (const para of T(s).split(/\n/)) { let row = ''; for (const wd of para.split(/\s+/).filter(Boolean)) { const tr = row ? row + ' ' + wd : wd; if (f.widthOfTextAtSize(tr, sz) > max && row) { out.push(row); row = wd; } else row = tr; } if (row) out.push(row); }
    return (out.length ? out : ['']).slice(0, lim).map((x) => fit(x, sz, f, max));
  };

  // ---- pagination des lignes
  const SZ = 8.6, LH = 10.6, GAP = 5;
  const rows = (d.lignes || []).map((l) => ({ l, des: l.titre ? wrap(l.designation, l.recap ? 7.8 : 8.4, l.recap ? R : B, COL.mt[1] - COL.code[0] - 12, 3) : wrap(l.designation, SZ, B, COL.des[1] - COL.des[0] - 10, 8) }));
  const pages = [[]]; let y = CORPS_HAUT;
  for (const r of rows) {
    const h = r.des.length * LH + GAP;
    if (y + h > CORPS_BAS - 12 && pages[pages.length - 1].length) { pages.push([]); y = CORPS_HAUT; }
    pages[pages.length - 1].push(r); y += h;
  }
  const NP = pages.length;

  pages.forEach((pageRows, pi) => {
    const p = pdf.addPage([W, H]);
    p.drawImage(img, { x: 0, y: 0, width: W, height: H });
    const t = (s, x, yy, sz = 9, f = R, color = INK) => { const v = T(s); if (v) p.drawText(v, { x, y: H - yy, size: sz, font: f, color }); };
    const right = (s, xr, yy, sz = 9, f = R, color = INK) => t(s, xr - w(s, sz, f), yy, sz, f, color);
    const center = (s, x0, x1, yy, sz = 9, f = R, color = INK) => t(s, (x0 + x1 - w(s, sz, f)) / 2, yy, sz, f, color);

    // titre (même style que le modèle : gras, bleu marine, sans dépasser le cadre client)
    let ts = 30; while (ts > 14 && w(d.titre, ts, B) > 262) ts -= 0.5;
    t(d.titre, 55, 135, ts, B, NAVY);

    // cadre client (entre les crochets)
    const c = d.client || {};
    const xc = 332, wc = 238;
    t(c.code || '', xc + 4, 38, 9, B);
    const nom = wrap(c.name || '', 10, B, wc - (c.code ? w(c.code, 9, B) + 14 : 0) - 6, 2);
    nom.forEach((l, i) => t(l, xc + 4 + (c.code ? w(c.code, 9, B) + 12 : 0), 38 + i * 13, 10, B));
    let ya = 38 + nom.length * 13 + 12;
    for (const l of [...wrap(c.address || '', 9.5, B, wc - 8, 2), ...wrap([c.city, c.country].filter(Boolean).join(' '), 9.5, B, wc - 8, 1)]) { if (ya > (c.mf ? 112 : 124)) break; t(l, xc + 4, ya, 9.5, B); ya += 12; }
    if (c.mf) t(c.mf, xc + 4, 127, 9.5, R); // au-dessus du crochet bas (lisible)

    // bandeau NUMERO / DATE / REFERENCES / FOLIO
    center(d.numero || '', 78.3, 162.7, 172, 10.5, R);
    center(fr(d.date), 162.7, 247.2, 172, 10.5, R);
    wrap(d.refs || '', 8.2, R, 504.6 - 247.2 - 10, 2).forEach((l, i) => t(l, 252, 166 + i * 9.5, 8.2, R));
    center(`${pi + 1}/${NP}`, 504.6, 587.3, 172, 8.5, R);

    // lignes
    let yy = CORPS_HAUT;
    for (const r of pageRows) {
      const l = r.l, b = yy + 8;
      if (l.titre) { // 0.13.0 : sous-titre « BL n° … — Commande n° … » ou ligne du récapitulatif des BL
        if (!l.recap) p.drawRectangle({ x: COL.code[0] + 1, y: H - (yy + r.des.length * LH + 1), width: COL.mt[1] - COL.code[0] - 2, height: r.des.length * LH + 2, color: rgb(0.918, 0.945, 0.98) });
        r.des.forEach((s, i) => t(s, COL.code[0] + 5, b + i * LH, l.recap ? 7.8 : 8.4, l.recap ? R : B, l.recap ? MUTE : NAVY));
        yy += r.des.length * LH + GAP; continue;
      }
      t(fit(l.code || '', 7.6, B, COL.code[1] - COL.code[0] - 6), COL.code[0] + 4, b + 1, 7.6, B);
      r.des.forEach((s, i) => t(s, COL.des[0] + 6, b + i * LH, SZ, B));
      right(String(r3(l.qte)).replace('.', ','), COL.qte[1] - 5, b, 9);
      center(fit(l.unite || '', 7.5, R, COL.unite[1] - COL.unite[0] - 4), COL.unite[0], COL.unite[1], b, 7.5);
      if (d.prix !== false && l.pu !== undefined && l.pu !== null) {
        right(n(l.pu), COL.pu[1] - 4, b, 8.6);
        right(`${+l.remise || 0} %`, COL.rem[1] - 5, b, 8.6);
        right(n(l.montant), COL.mt[1] - 5, b, 8.6);
      }
      yy += r.des.length * LH + GAP;
    }
    if (pi < NP - 1) { right('Suite page suivante…', COL.des[1] - 6, CORPS_BAS - 4, 8, R, MUTE); }

    // ---- bas de page : seulement sur la dernière page
    if (pi === NP - 1) {
      const X = d.totaux;
      if (X && d.prix !== false) {
        const base = [['Montant HT :', n(X.ht)], ['Montant remise :', n(X.remise || 0)], ['TVA % :', `${dt(X.tauxTva || 0, 2)} %`], ['Montant TVA :', n(X.tva)]];
        base.forEach(([k, v], i) => { const by = 640 + i * 11; t(k, 11, by, 8.2); right(v, 207, by, 8.2); });
        const v = 643.5;
        right(n(X.ht), 278, v, 9); right(n(X.tva), 346, v, 9); right(n(X.ttc), 414.5, v, 9);
        if (X.acompte) right(n(X.acompte), 489, v, 9);
        right(n(X.net), 584, v, 11, B);
        if (X.fodec) { t(`FODEC ${dt(X.tauxFodec || 0, 2).replace(/,00$/, '')} %`, 222, 666, 8.6, B); right(n(X.fodec), 345, 666, 9); }
        if (X.timbre) { t('Timbre', 376, 666, 8.6, B); right(n(X.timbre), 489, 666, 9); }
        if (d.devise && d.devise !== 'DT') t(`Montants en ${d.devise}`, 497, 666, 8, R, MUTE);
      }
      t(String(d.pieces ?? ''), 120, 715, 9.5, B);
      t('Bon de commande client N° :', 11, 734, 9, B);
      t(fit(d.bc || '', 9, R, 160), 145, 734, 9, R);
      if (d.lettres && d.prix !== false) {
        t(`ARRETEE LA PRESENTE ${d.lettres.libelle} A LA SOMME DE :`, 17, 757, 9, R);
        wrap(amountWords(d.lettres.montant, d.devise).toUpperCase() + '.', 9.5, B, 268, 4).forEach((l, i) => t(l, 26, 773 + i * 12, 9.5, B));
      }
      // colonne de droite : livreur / mentions
      let ye = 712;
      if (d.livreur) { t('Livreur :', 304, 749, 9, B); t('Matricule :', 304, 774, 9, B); ye = 790; }
      for (const [k, val] of d.extras || []) {
        if (!val || ye > 806) continue;
        const lines = wrap(`${k}${k ? ' : ' : ''}${val}`, 8.2, R, 280, 3);
        lines.forEach((l, i) => t(l, 304, ye + i * 10, 8.2, k ? R : B));
        ye += lines.length * 10 + 2;
      }
    }
    if (d.annule) {
      const s = 'ANNULÉ' + (/FACTURE|PROFORMA/.test(d.titre) ? 'E' : '');
      p.drawText(T(s), { x: 150, y: 330, size: 78, font: B, color: RED, rotate: degrees(30), opacity: 0.28 });
    }
  });
  return pdf.save({ useObjectStreams: true });
}

/* ------------------------------------------------------------------ adaptateurs */
const devDe = (x) => (x && (x.currency === 'EUR' || x.currency === 'USD') ? x.currency : 'DT');
const pieces = (lines) => r3((lines || []).filter((l) => !l.service && l.artType !== 'prestation').reduce((s, l) => s + (+l.qty || 0), 0));
const lignesDT = (X) => X.lines.map((l) => ({ code: l.article || '', designation: l.designation, qte: +l.qty || 0, unite: l.unite || '', pu: l.puHT, remise: +l.remise || 0, montant: l.totHT, service: !!l.service }));
const totauxDT = (inv, X, acompte = 0) => ({ ht: X.ht, remise: X.remise, fodec: X.fodec, tauxFodec: +inv.fodec || 0, tva: X.tva, tauxTva: +inv.tva || 0, ttc: X.ttc, timbre: X.timbre, acompte, net: r3(X.net - acompte) });

/** Facture de la Gestion → document DIGITAL-TEX. */
const frD = (d) => (d ? String(d).split('-').reverse().join('/') : '');
/** 0.13.0 : lignes de la facture regroupées par BL (sous-titre BL / commande / BC), précédées du récapitulatif des BL et commandes. */
export function lignesFactureDT(inv, X) {
  const L = lignesDT(X);
  if (!(inv.lines || []).some((l) => l.blId)) return L;
  const nums = inv.blNumbers || [], ids = inv.blIds || [];
  const info = ids.map((id, k) => { const l0 = (inv.lines || []).find((l) => l.blId === id) || {}; return { id, num: nums[k] || l0.blNumber || '', date: (inv.blDates || [])[k] || l0.blDate || '', cmd: l0.orderNumber || '', bc: l0.clientPO || '' }; });
  const out = [];
  if (info.length > 1) {
    out.push({ titre: true, designation: `RÉCAPITULATIF : ${info.length} BL — commande${new Set(info.map((b) => b.cmd)).size > 1 ? 's' : ''} ${[...new Set(info.map((b) => b.cmd).filter(Boolean))].join(', ')}` });
    for (const b of info) out.push({ titre: true, recap: true, designation: `BL n° ${b.num}${b.date ? ' du ' + frD(b.date) : ''}${b.cmd ? ' · Commande n° ' + b.cmd : ''}${b.bc ? ' · BC client ' + b.bc : ''}` });
  }
  const vus = new Set();
  (inv.lines || []).forEach((l, i) => {
    const k = l.blId || '';
    if (!vus.has(k)) { vus.add(k); const b = info.find((x) => x.id === k); out.push({ titre: true, designation: b ? `BL n° ${b.num}${b.date ? ' du ' + frD(b.date) : ''}${b.cmd ? ' — Commande n° ' + b.cmd : ''}${b.bc ? ' — BC client ' + b.bc : ''}` : 'Autres lignes' }); }
    out.push(L[i]);
  });
  return out;
}

export function dataFacture(inv, { clientCode } = {}) {
  const X = invoiceTotals(inv), C = devDe(inv), exp = !!inv.export || C !== 'DT';
  const cmds = (inv.orderNumbers || []).length ? inv.orderNumbers : inv.orderNumber ? [inv.orderNumber] : [];
  return {
    titre: exp ? 'FACTURE / INVOICE' : 'FACTURE', fond: 'facture', numero: inv.number, date: inv.date, devise: C,
    refs: [(inv.blNumbers || []).length ? 'BL ' + inv.blNumbers.join(', ') : '', cmds.length ? (cmds.length > 1 ? 'Commandes ' : 'Commande ') + cmds.join(', ') : '', C !== 'DT' ? 'Devise ' + C : '', inv.incoterm ? 'Incoterm ' + inv.incoterm : ''].filter(Boolean).join(' · '),
    client: { ...(inv.client || {}), code: clientCode || inv.client?.code || '' },
    lignes: lignesFactureDT(inv, X), totaux: totauxDT(inv, X, r3(+inv.advance || 0)), pieces: pieces(inv.lines), bc: inv.clientPO || '',
    lettres: { libelle: 'FACTURE', montant: X.net },
    extras: [['Échéance', fr(inv.due)], ['Mode de règlement', inv.paymentMode], ['Référence El Fatoora (TTN)', inv.ttnRef],
      ...(exp ? [['', 'Vente à l’exportation — TVA non applicable (article 11 du Code de la TVA)']] : []), ['Note', inv.note]],
    annule: inv.status === 'annulee',
  };
}

/** Bon de livraison : prix repris de la commande (HT, comme le modèle) ; sans le droit « prix », aucun montant. */
export function dataBL(bl, order, g = {}, { clientCode } = {}) {
  const ol = (id) => ((order && order.lines) || []).find((x) => x.id === id) || {};
  const exp = order && (order.export || devDe(order) !== 'DT');
  const lines = (bl.lines || []).filter((l) => +l.qty > 0).map((l) => { const o = ol(l.lineId); return { designation: [l.designation, l.staff && 'Staff ' + l.staff, l.color, l.size].filter(Boolean).join(' · '), qty: +l.qty, pu: o.pu, article: o.article || '', unite: o.unite || '' }; });
  const prix = lines.length > 0 && lines.every((l) => l.pu !== undefined && l.pu !== null);
  const inv = { tva: exp ? 0 : +g.tva || 0, fodec: exp ? 0 : +g.fodec || 0, timbre: exp ? 0 : +g.timbre || 0, pricesTTC: exp ? false : order?.pricesTTC !== false, lines: lines.map((l) => ({ ...l, pu: +l.pu || 0 })) };
  const X = invoiceTotals(inv);
  return {
    titre: 'BON DE LIVRAISON', fond: 'bl', numero: bl.number, date: bl.date, devise: devDe(order),
    refs: [bl.orderNumber ? 'Commande ' + bl.orderNumber : ''].filter(Boolean).join(' · '),
    client: { ...(bl.client || {}), code: clientCode || bl.client?.code || '' },
    lignes: lignesDT(X), prix, totaux: totauxDT(inv, X), pieces: pieces(lines), bc: bl.clientPO || '',
    lettres: { libelle: 'LIVRAISON', montant: X.net }, livreur: true,
    extras: [['Observations', bl.note]], annule: bl.status === 'annule',
  };
}

/** Devis, proforma, avoir (module Ventes) → document DIGITAL-TEX. */
export function dataVente(type, d, { clientCode, societe } = {}) {
  const inv = { tva: +d.tva || 0, fodec: +d.fodec || 0, timbre: +d.timbre || 0, pricesTTC: !!d.prix_ttc,
    lines: (d.lignes || []).map((l) => ({ designation: [l.designation, l.couleur, l.taille].filter(Boolean).join(' · '), qty: +l.qte || 0, pu: +l.pu || 0, remise: +l.remise || 0, article: l.produit || '', service: !!l.service })) };
  const X = invoiceTotals(inv), exp = d.type_client === 'export' || (d.devise && d.devise !== 'DT');
  const en = d.langue === 'en';
  const titre = { devis: en ? 'QUOTATION' : 'DEVIS', proformas: en ? 'PROFORMA INVOICE' : 'FACTURE PROFORMA', avoirs: en ? 'CREDIT NOTE' : 'AVOIR' }[type];
  const prix = d.ht !== undefined && d.net !== undefined;
  return {
    titre, fond: 'facture', numero: d.numero, date: d.date, devise: d.devise || 'DT', prix,
    refs: [type === 'avoirs' ? 'Facture ' + (d.facture_num || '') : '', d.ref_client ? 'Réf. ' + d.ref_client : '', d.origine_num ? 'Devis ' + d.origine_num : '', d.devise && d.devise !== 'DT' ? 'Devise ' + d.devise : '',
      d.incoterm ? `Incoterm ${d.incoterm}${d.lieu_incoterm ? ' ' + d.lieu_incoterm : ''} (Incoterms 2020)` : ''].filter(Boolean).join(' · '),
    client: { ...(d.client || {}), code: clientCode || '' },
    lignes: lignesDT(X), totaux: totauxDT(inv, X), pieces: pieces(inv.lines), bc: type === 'avoirs' ? '' : d.ref_client || '',
    lettres: { libelle: { devis: 'OFFRE', proformas: 'FACTURE PROFORMA', avoirs: 'FACTURE D’AVOIR' }[type], montant: X.net },
    extras: [['Motif', type === 'avoirs' ? d.motif : ''], ['Valable jusqu’au', type !== 'avoirs' ? fr(d.validite) : ''], ['Conditions', d.conditions],
      ...(exp ? [['', en ? 'Export sale — VAT 0 %' : 'Vente à l’exportation — TVA 0 %']] : []), ['Note', d.note], ['', type === 'avoirs' && societe?.mentions ? societe.mentions : '']],
    annule: ['annule', 'annulee'].includes(d.statut),
  };
}
