'use strict';
// PDF des fiches techniques (lot 0.15.0) :
//  * proposition : PDF du studio (ou page générée) + cartouche « Fiche P00126H · v2 · client · proposée par … le … »,
//    petit QR → app.vethypro.com/f/<fiche>, identifiant caché dans les métadonnées (Keywords « DTX-FICHE:<fiche>:v<n> »)
//    pour rouvrir la version en 3D (« Ouvrir un PDF… ») ; AUCUN prix ;
//  * validation : copie tamponnée « Validée par <commercial> le JJ/MM/AAAA — commande CMD-… » (le PDF proposé est conservé).
const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const E = require('./etiquetage');

const POLICE = path.join(__dirname, '..', 'assets', 'DejaVuSans.ttf');
const POLICE_G = path.join(__dirname, '..', 'assets', 'DejaVuSans-Bold.ttf');
const URL_BASE = process.env.ERP_URL_PUBLIQUE || 'https://app.vethypro.com';
const MM = 72 / 25.4;
const BLEU = rgb(0.16, 0.4, 0.62), ORANGE = rgb(0.88, 0.29, 0.09), GRIS = rgb(0.35, 0.35, 0.35);
const fr = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

async function polices(doc) {
  doc.registerFontkit(fontkit);
  return { r: await doc.embedFont(fs.readFileSync(POLICE), { subset: true }), g: await doc.embedFont(fs.readFileSync(POLICE_G), { subset: true }) };
}
function dessinerQR(page, texte, x, y, taille) {
  const m = E.matriceQR(texte), n = m.length, c = taille / (n + 2);
  page.drawRectangle({ x, y, width: taille, height: taille, color: rgb(1, 1, 1) });
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (m[r][k]) page.drawRectangle({ x: x + (k + 1) * c, y: y + taille - (r + 2) * c, width: c, height: c, color: rgb(0, 0, 0) });
}

/** Lit l'identifiant caché d'un PDF de fiche : { fiche, version } ou null. */
async function lireIdentifiant(octets) {
  try {
    const doc = await PDFDocument.load(octets, { updateMetadata: false, ignoreEncryption: true });
    const k = String(doc.getKeywords() || '') + ' ' + String(doc.getSubject() || '');
    const m = k.match(/DTX-FICHE:(\d+):v(\d+)/);
    return m ? { fiche: Number(m[1]), version: Number(m[2]) } : null;
  } catch (_) { return null; }
}

/** PDF de proposition (page de garde générée si le studio n'a pas fourni de PDF). */
async function pdfProposition(base, d) {
  const doc = base ? await PDFDocument.load(base, { ignoreEncryption: true }) : await PDFDocument.create();
  const P = await polices(doc);
  if (!base) {
    const page = doc.addPage([210 * MM, 297 * MM]);
    const H = page.getHeight();
    page.drawText('FICHE TECHNIQUE', { x: 18 * MM, y: H - 26 * MM, size: 20, font: P.g, color: BLEU });
    page.drawText('DIGITAL-TEX', { x: 150 * MM, y: H - 26 * MM, size: 14, font: P.g, color: ORANGE });
    const lignes = [['Produit (patronage)', d.reference + '  ·  ' + d.reference + '.MDL'], ['Désignation', d.designation || '—'], ['Client', d.client || 'Basique'],
      ['Sexe', E.SEXES[d.sexe] || d.sexe || '—'], ['Tailles', (d.taillant || []).join(' · ') || '—'], ['Version', 'v' + d.version],
      ['Marquages', (d.marquages || []).map((m) => [m.type, m.libelle, (m.faces || []).join ? (m.faces || []).join('/') : m.faces].filter(Boolean).join(' ')).join(' ; ') || 'Aucun']];
    let y = H - 44 * MM;
    for (const [k, v] of lignes) { page.drawText(k, { x: 18 * MM, y, size: 10, font: P.g, color: GRIS }); page.drawText(String(v).slice(0, 95), { x: 62 * MM, y, size: 11, font: P.r }); y -= 8 * MM; }
    if (d.vignette && /^data:image\/(png|jpe?g);base64,/.test(d.vignette)) {
      try {
        const b = Buffer.from(d.vignette.split(',')[1], 'base64');
        const img = /png/.test(d.vignette.slice(0, 20)) ? await doc.embedPng(b) : await doc.embedJpg(b);
        const s = Math.min((174 * MM) / img.width, (150 * MM) / img.height);
        page.drawImage(img, { x: 18 * MM + (174 * MM - img.width * s) / 2, y: 40 * MM, width: img.width * s, height: img.height * s });
      } catch (_) { /* vignette illisible : la fiche reste valable sans image */ }
    }
  }
  // cartouche + QR sur chaque page (bas de page), sans aucun montant
  for (const page of doc.getPages()) {
    const W = page.getWidth();
    const h = 13 * MM, x = 8 * MM, y = 5 * MM, w = W - 16 * MM;
    page.drawRectangle({ x, y, width: w, height: h, color: rgb(1, 1, 1), borderColor: BLEU, borderWidth: 0.8 });
    page.drawText(`Fiche ${d.reference} · v${d.version} · ${d.client || 'Basique'}`, { x: x + 3 * MM, y: y + 7.6 * MM, size: 9, font: P.g, color: BLEU });
    page.drawText(`Proposée par ${d.propose_par} le ${fr(d.date)} — à valider par le commercial`, { x: x + 3 * MM, y: y + 2.8 * MM, size: 8, font: P.r, color: GRIS });
    dessinerQR(page, `${URL_BASE}/f/${d.fiche_id}`, x + w - 12.5 * MM, y + 0.5 * MM, 12 * MM);
  }
  doc.setTitle(`Fiche technique ${d.reference} v${d.version}`);
  doc.setSubject(`DTX-FICHE:${d.fiche_id}:v${d.version}`);
  doc.setKeywords([`DTX-FICHE:${d.fiche_id}:v${d.version}`, d.reference]);
  doc.setProducer('ERP DIGITAL-TEX'); doc.setCreator('ERP DIGITAL-TEX — Infographie');
  return doc.save();
}

/** Copie tamponnée « Validée par X le JJ/MM/AAAA » (identifiant caché conservé). */
async function tamponValidation(octets, { par, date, commande }) {
  const doc = await PDFDocument.load(octets, { ignoreEncryption: true });
  const P = await polices(doc);
  for (const page of doc.getPages()) {
    // recouvre le cartouche du bas (« à valider par le commercial ») sans toucher au QR ni à l'en-tête du document
    const W = page.getWidth();
    const x = 8 * MM, y = 5 * MM, h = 13 * MM, w = W - 16 * MM - 14 * MM;
    page.drawRectangle({ x, y, width: w, height: h, color: rgb(1, 1, 1), borderColor: rgb(0.18, 0.49, 0.31), borderWidth: 1.4 });
    page.drawText('VALIDÉE', { x: x + 3 * MM, y: y + 7.4 * MM, size: 11, font: P.g, color: rgb(0.18, 0.49, 0.31) });
    page.drawText(`par ${par} le ${fr(date)}`, { x: x + 24 * MM, y: y + 7.6 * MM, size: 9, font: P.r });
    page.drawText(`Commande ${commande}`, { x: x + 3 * MM, y: y + 2.6 * MM, size: 9, font: P.g, color: GRIS });
  }
  doc.setProducer('ERP DIGITAL-TEX');
  return doc.save();
}

module.exports = { lireIdentifiant, pdfProposition, tamponValidation, dessinerQR, polices, MM, StandardFonts };
