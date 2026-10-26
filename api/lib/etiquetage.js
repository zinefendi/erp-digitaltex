'use strict';
// Étiquetage (lot 0.15.0) — fonctions pures partagées par l'API (PDF d'aperçu, Excel) et l'application
// DT Étiquettes (rendu 203 dpi pour la TSC TTP-244 Pro) : codes-barres EAN-13 / Code 128, QR, texte arabe
// (formes de présentation + ordre visuel), symboles d'entretien ISO 3758 dessinés en traits, fibres FR/AR.
// Aucune dépendance au réseau ; aucune donnée de prix.
const crypto = require('crypto');
const qrcode = require('qrcode-generator');

// ------------------------------------------------------------------ codes uniques des étiquettes
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/** Code d'étiquette : 10 caractères base32 aléatoires (50 bits, non devinable). */
function codeEtiquette() {
  const b = crypto.randomBytes(10);
  let s = '';
  for (let i = 0; i < 10; i++) s += B32[b[i] & 31];
  return s;
}

// ------------------------------------------------------------------ EAN-13
/** Clé de contrôle EAN-13 (12 premiers chiffres). */
function cleEan13(douze) {
  const d = String(douze);
  if (!/^\d{12}$/.test(d)) throw new Error('EAN-13 : 12 chiffres attendus');
  let s = 0;
  for (let i = 0; i < 12; i++) s += (+d[i]) * (i % 2 ? 3 : 1);
  return String((10 - (s % 10)) % 10);
}
const eanValide = (c) => /^\d{13}$/.test(c) && cleEan13(c.slice(0, 12)) === c[12];

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = L.map((x) => [...x].map((b) => (b === '0' ? '1' : '0')).reverse().join(''));
const R = L.map((x) => [...x].map((b) => (b === '0' ? '1' : '0')).join(''));
const PARITE = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
/** Modules (chaîne de 0/1, 95 modules hors zones de silence) d'un EAN-13. */
function modulesEan13(code) {
  if (!eanValide(code)) throw new Error('EAN-13 invalide : ' + code);
  const p = PARITE[+code[0]];
  let m = '101';
  for (let i = 1; i <= 6; i++) m += (p[i - 1] === 'L' ? L : G)[+code[i]];
  m += '01010';
  for (let i = 7; i <= 12; i++) m += R[+code[i]];
  return m + '101';
}

// ------------------------------------------------------------------ Code 128 (jeu B, ASCII 32–126)
const C128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];
/** Modules (0/1) d'un Code 128 B. */
function modules128(txt) {
  const s = String(txt);
  if (!/^[\x20-\x7e]{1,40}$/.test(s)) throw new Error('Code 128 : caractères ASCII imprimables uniquement');
  const vals = [104, ...[...s].map((ch) => ch.charCodeAt(0) - 32)];
  let chk = vals[0];
  for (let i = 1; i < vals.length; i++) chk += vals[i] * i;
  vals.push(chk % 103, 106);
  let m = '';
  for (const v of vals) { const w = C128[v]; for (let i = 0; i < w.length; i++) m += (i % 2 ? '0' : '1').repeat(+w[i]); }
  return m;
}
/** Modules d'un code-barres selon son type. */
const modulesCode = (type, code) => (type === 'EAN13' ? modulesEan13(code) : modules128(code));

/** Prochain code-barres (dans la transaction) : EAN-13 si un préfixe GS1 est saisi, sinon Code 128 interne « DT » + 8 chiffres. */
async function attribuerCodeBarres(c) {
  const pref = String((await c.query(`select valeur from parametres.options where code = 'gs1_prefixe'`)).rows[0]?.valeur || '').replace(/\D/g, '');
  if (pref.length >= 6 && pref.length <= 11) {
    const n = Number((await c.query(`update pf.compteur_codes_barres set dernier = dernier + 1 where type = 'EAN13' returning dernier`)).rows[0].dernier);
    const place = 12 - pref.length;
    if (String(n).length > place) throw Object.assign(new Error('Capacité du préfixe GS1 épuisée : demandez un nouveau préfixe à GS1 Tunisie.'), { statusCode: 400, code: 'gs1_epuise' });
    const douze = pref + String(n).padStart(place, '0');
    return { code: douze + cleEan13(douze), type: 'EAN13' };
  }
  const n = Number((await c.query(`update pf.compteur_codes_barres set dernier = dernier + 1 where type = 'CODE128' returning dernier`)).rows[0].dernier);
  return { code: 'DT' + String(n).padStart(8, '0'), type: 'CODE128' };
}

// ------------------------------------------------------------------ QR
/** Matrice QR (tableau de lignes de booléens), correction M. */
function matriceQR(texte) {
  const q = qrcode(0, 'M');
  q.addData(String(texte), 'Byte');
  q.make();
  const n = q.getModuleCount();
  const m = [];
  for (let r = 0; r < n; r++) { const l = []; for (let c = 0; c < n; c++) l.push(q.isDark(r, c)); m.push(l); }
  return m;
}

// ------------------------------------------------------------------ arabe : formes de présentation + ordre visuel
// Table des lettres : [isolée, finale, initiale, médiane] (formes Unicode FExx) ; les lettres non liantes
// à gauche n'ont pas de forme initiale / médiane.
const FORMES = {
  0x0621: [0xFE80], 0x0622: [0xFE81, 0xFE82], 0x0623: [0xFE83, 0xFE84], 0x0624: [0xFE85, 0xFE86], 0x0625: [0xFE87, 0xFE88],
  0x0626: [0xFE89, 0xFE8A, 0xFE8B, 0xFE8C], 0x0627: [0xFE8D, 0xFE8E], 0x0628: [0xFE8F, 0xFE90, 0xFE91, 0xFE92], 0x0629: [0xFE93, 0xFE94],
  0x062A: [0xFE95, 0xFE96, 0xFE97, 0xFE98], 0x062B: [0xFE99, 0xFE9A, 0xFE9B, 0xFE9C], 0x062C: [0xFE9D, 0xFE9E, 0xFE9F, 0xFEA0],
  0x062D: [0xFEA1, 0xFEA2, 0xFEA3, 0xFEA4], 0x062E: [0xFEA5, 0xFEA6, 0xFEA7, 0xFEA8], 0x062F: [0xFEA9, 0xFEAA], 0x0630: [0xFEAB, 0xFEAC],
  0x0631: [0xFEAD, 0xFEAE], 0x0632: [0xFEAF, 0xFEB0], 0x0633: [0xFEB1, 0xFEB2, 0xFEB3, 0xFEB4], 0x0634: [0xFEB5, 0xFEB6, 0xFEB7, 0xFEB8],
  0x0635: [0xFEB9, 0xFEBA, 0xFEBB, 0xFEBC], 0x0636: [0xFEBD, 0xFEBE, 0xFEBF, 0xFEC0], 0x0637: [0xFEC1, 0xFEC2, 0xFEC3, 0xFEC4],
  0x0638: [0xFEC5, 0xFEC6, 0xFEC7, 0xFEC8], 0x0639: [0xFEC9, 0xFECA, 0xFECB, 0xFECC], 0x063A: [0xFECD, 0xFECE, 0xFECF, 0xFED0],
  0x0641: [0xFED1, 0xFED2, 0xFED3, 0xFED4], 0x0642: [0xFED5, 0xFED6, 0xFED7, 0xFED8], 0x0643: [0xFED9, 0xFEDA, 0xFEDB, 0xFEDC],
  0x0644: [0xFEDD, 0xFEDE, 0xFEDF, 0xFEE0], 0x0645: [0xFEE1, 0xFEE2, 0xFEE3, 0xFEE4], 0x0646: [0xFEE5, 0xFEE6, 0xFEE7, 0xFEE8],
  0x0647: [0xFEE9, 0xFEEA, 0xFEEB, 0xFEEC], 0x0648: [0xFEED, 0xFEEE], 0x0649: [0xFEEF, 0xFEF0], 0x064A: [0xFEF1, 0xFEF2, 0xFEF3, 0xFEF4],
};
const LAM_ALEF = { 0x0622: [0xFEF5, 0xFEF6], 0x0623: [0xFEF7, 0xFEF8], 0x0625: [0xFEF9, 0xFEFA], 0x0627: [0xFEFB, 0xFEFC] };
const estArabe = (cp) => cp >= 0x0600 && cp <= 0x06FF;
const lieAvant = (cp) => FORMES[cp] && FORMES[cp].length === 4; // se lie à la lettre suivante
const diacritique = (cp) => cp >= 0x064B && cp <= 0x0652;

/** Remplace chaque lettre par sa forme contextuelle (ordre logique conservé). */
function formerArabe(txt) {
  const cps = [...String(txt)].map((c) => c.codePointAt(0)).filter((c) => !diacritique(c));
  const out = [];
  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i];
    if (!FORMES[cp]) { out.push(cp); continue; }
    const prev = cps[i - 1], next = cps[i + 1];
    const liePrec = prev !== undefined && lieAvant(prev);
    if (cp === 0x0644 && LAM_ALEF[next]) { out.push(LAM_ALEF[next][liePrec ? 1 : 0]); i++; continue; }
    const lieSuiv = lieAvant(cp) && next !== undefined && FORMES[next];
    const f = FORMES[cp];
    if (liePrec && lieSuiv) out.push(f[3]); else if (liePrec) out.push(f[1] || f[0]); else if (lieSuiv) out.push(f[2]); else out.push(f[0]);
  }
  return String.fromCodePoint(...out);
}
/** Texte prêt à dessiner de gauche à droite : formes arabes + segments arabes inversés, chiffres et latin conservés. */
function arabeVisuel(txt) {
  const f = formerArabe(txt);
  // découpe en segments RTL (arabe + espaces voisins) et LTR (chiffres, latin, %), puis ordre RTL global
  const segs = [];
  for (const ch of [...f]) {
    const cp = ch.codePointAt(0);
    const rtl = estArabe(cp) || (cp >= 0xFE70 && cp <= 0xFEFF);
    const neutre = ch === ' ' || ch === '.' || ch === '،' || ch === ':';
    const t = neutre ? 'n' : rtl ? 'r' : 'l';
    if (segs.length && (segs[segs.length - 1].t === t || (t === 'n'))) segs[segs.length - 1].s += ch;
    else segs.push({ t, s: ch });
  }
  return segs.reverse().map((x) => (x.t === 'l' ? x.s : [...x.s].reverse().join(''))).join('');
}

/** Dessine un texte arabe aligné à droite sur xDroite. La police (fontkit) met déjà en forme et ordonne un segment
 *  purement arabe ; les nombres / latin (« 65% ») sont dessinés à part pour ne pas être inversés. Les segments sont
 *  posés de droite à gauche dans l'ordre logique. Renvoie la largeur dessinée. */
function dessinerArabe(page, txt, xDroite, y, size, font, opts = {}) {
  const segs = String(txt).match(/[\u0600-\u06FF]+(?:[ \u00A0]+[\u0600-\u06FF]+)*|[^\u0600-\u06FF\s]+|\s+/g) || [];
  let x = xDroite;
  for (const sg of segs) {
    const w = font.widthOfTextAtSize(sg, size);
    x -= w;
    if (sg.trim()) page.drawText(sg, { x, y, size, font, ...opts });
  }
  return xDroite - x;
}

// ------------------------------------------------------------------ fibres et entretien
/** Contrôle des fibres d'un tissu : [{fibre, pct}] → total 100, tri décroissant. */
function nettoyerFibres(fibres, codesConnus) {
  if (!Array.isArray(fibres) || !fibres.length) throw Object.assign(new Error('Composition : indiquez au moins une fibre.'), { statusCode: 400, code: 'fibres_absentes' });
  const out = fibres.map((f) => ({ fibre: String(f.fibre || '').trim().toLowerCase(), pct: Math.round((+f.pct || 0) * 10) / 10 }));
  for (const f of out) {
    if (codesConnus && !codesConnus.includes(f.fibre)) throw Object.assign(new Error(`Fibre inconnue : « ${f.fibre} » (Paramètres › Étiquettes).`), { statusCode: 400, code: 'fibre_inconnue' });
    if (!(f.pct > 0 && f.pct <= 100)) throw Object.assign(new Error('Composition : chaque pourcentage est entre 0 et 100.'), { statusCode: 400, code: 'pct_invalide' });
  }
  const tot = Math.round(out.reduce((s, f) => s + f.pct, 0) * 10) / 10;
  if (tot !== 100) throw Object.assign(new Error(`Composition : le total des fibres doit faire 100 % (actuellement ${tot} %).`), { statusCode: 400, code: 'total_fibres' });
  return out.sort((a, b) => b.pct - a.pct);
}

// Symboles d'entretien (ISO 3758) : code → libellé FR. Dessin en traits (dessinerSymbole).
const SYMBOLES = {
  lavage: { lav95: 'Lavage 95 °C', lav70: 'Lavage 70 °C', lav60: 'Lavage 60 °C', lav60_doux: 'Lavage 60 °C délicat', lav40: 'Lavage 40 °C', lav40_doux: 'Lavage 40 °C délicat',
    lav40_tres_doux: 'Lavage 40 °C très délicat', lav30: 'Lavage 30 °C', lav30_doux: 'Lavage 30 °C délicat', lav30_tres_doux: 'Lavage 30 °C très délicat', main: 'Lavage à la main', lav_non: 'Ne pas laver' },
  blanchiment: { blanch_oui: 'Tout blanchiment', blanch_oxy: 'Blanchiment oxygéné seulement', blanch_non: 'Ne pas blanchir' },
  sechage: { tamb_normal: 'Séchage en tambour normal', tamb_doux: 'Séchage en tambour doux', tamb_non: 'Ne pas sécher en tambour', ligne: 'Séchage sur fil', plat: 'Séchage à plat' },
  repassage: { rep3: 'Repassage 200 °C', rep2: 'Repassage 150 °C', rep1: 'Repassage 110 °C', rep_non: 'Ne pas repasser' },
  pro: { sec_p: 'Nettoyage à sec (P)', sec_p_doux: 'Nettoyage à sec doux (P)', sec_f: 'Nettoyage à sec (F)', sec_non: 'Pas de nettoyage à sec' },
};
const TRAITEMENTS = ['lavage', 'blanchiment', 'sechage', 'repassage', 'pro'];
/** Contrôle d'un jeu d'entretien : un code connu par traitement, dans l'ordre ISO. */
function nettoyerEntretien(e) {
  const out = {};
  for (const t of TRAITEMENTS) {
    const v = e && e[t];
    if (!v || !SYMBOLES[t][v]) throw Object.assign(new Error(`Entretien incomplet : choisissez le symbole « ${t} ».`), { statusCode: 400, code: 'entretien_incomplet' });
    out[t] = v;
  }
  out.texte_fr = String((e && e.texte_fr) || '').slice(0, 300);
  out.texte_ar = String((e && e.texte_ar) || '').slice(0, 300);
  return out;
}

/**
 * Dessine un symbole d'entretien avec un « crayon » abstrait (indépendant du support : PDF ou canvas).
 * p = { ligne(x1,y1,x2,y2), rect(x,y,w,h), cercle(cx,cy,r), point(cx,cy,r), texte(t,x,y,taille), poly([[x,y]…]) } ;
 * repère : (x, y) coin haut-gauche, côté `s`, y vers le bas.
 */
function dessinerSymbole(p, code, x, y, s) {
  const croix = () => { p.ligne(x + s * 0.08, y + s * 0.08, x + s * 0.92, y + s * 0.92); p.ligne(x + s * 0.92, y + s * 0.08, x + s * 0.08, y + s * 0.92); };
  const barres = (n) => { for (let i = 0; i < n; i++) p.ligne(x + s * 0.12, y + s * (0.9 + i * 0.08), x + s * 0.88, y + s * (0.9 + i * 0.08)); };
  if (code.startsWith('lav') || code === 'main') {
    // cuve : bord supérieur ondulé simplifié + flancs évasés + fond
    p.poly([[x + s * 0.06, y + s * 0.3], [x + s * 0.16, y + s * 0.82], [x + s * 0.84, y + s * 0.82], [x + s * 0.94, y + s * 0.3]]);
    p.poly([[x + s * 0.06, y + s * 0.3], [x + s * 0.22, y + s * 0.22], [x + s * 0.38, y + s * 0.3], [x + s * 0.5, y + s * 0.22], [x + s * 0.62, y + s * 0.3], [x + s * 0.78, y + s * 0.22], [x + s * 0.94, y + s * 0.3]]);
    if (code === 'lav_non') { croix(); return; }
    if (code === 'main') { p.texte('main', x + s * 0.2, y + s * 0.68, s * 0.24); return; }
    const t = code.match(/\d+/)[0];
    p.texte(t, x + s * (t.length > 1 ? 0.3 : 0.4), y + s * 0.7, s * 0.34);
    barres(code.endsWith('tres_doux') ? 2 : code.endsWith('doux') ? 1 : 0);
    return;
  }
  if (code.startsWith('blanch')) {
    p.poly([[x + s * 0.5, y + s * 0.1], [x + s * 0.94, y + s * 0.86], [x + s * 0.06, y + s * 0.86], [x + s * 0.5, y + s * 0.1]]);
    if (code === 'blanch_oxy') { p.ligne(x + s * 0.4, y + s * 0.8, x + s * 0.56, y + s * 0.4); p.ligne(x + s * 0.52, y + s * 0.8, x + s * 0.68, y + s * 0.4); }
    if (code === 'blanch_non') croix();
    return;
  }
  if (code.startsWith('tamb') || code === 'ligne' || code === 'plat') {
    p.rect(x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8);
    if (code === 'ligne') { p.poly([[x + s * 0.1, y + s * 0.28], [x + s * 0.5, y + s * 0.42], [x + s * 0.9, y + s * 0.28]]); return; }
    if (code === 'plat') { p.ligne(x + s * 0.25, y + s * 0.5, x + s * 0.75, y + s * 0.5); return; }
    p.cercle(x + s * 0.5, y + s * 0.5, s * 0.3);
    if (code === 'tamb_non') { croix(); return; }
    if (code === 'tamb_normal') { p.point(x + s * 0.42, y + s * 0.5, s * 0.05); p.point(x + s * 0.58, y + s * 0.5, s * 0.05); } else p.point(x + s * 0.5, y + s * 0.5, s * 0.05);
    return;
  }
  if (code.startsWith('rep')) {
    p.poly([[x + s * 0.12, y + s * 0.8], [x + s * 0.88, y + s * 0.8], [x + s * 0.8, y + s * 0.4], [x + s * 0.4, y + s * 0.4], [x + s * 0.3, y + s * 0.5], [x + s * 0.18, y + s * 0.6], [x + s * 0.12, y + s * 0.8]]);
    p.ligne(x + s * 0.4, y + s * 0.4, x + s * 0.45, y + s * 0.26); p.ligne(x + s * 0.45, y + s * 0.26, x + s * 0.8, y + s * 0.26);
    if (code === 'rep_non') { croix(); return; }
    const n = +code.slice(3);
    for (let i = 0; i < n; i++) p.point(x + s * (0.5 - (n - 1) * 0.07 + i * 0.14), y + s * 0.62, s * 0.045);
    return;
  }
  if (code.startsWith('sec')) {
    p.cercle(x + s * 0.5, y + s * 0.46, s * 0.36);
    if (code === 'sec_non') { croix(); return; }
    p.texte(code.includes('_f') ? 'F' : 'P', x + s * 0.38, y + s * 0.58, s * 0.34);
    if (code.endsWith('doux')) barres(1);
  }
}

/** Libellé lisible de la composition : « 65 % Polyester 35 % Coton » et sa version arabe. */
function texteFibres(fibres, dico) {
  const fr = fibres.map((f) => `${String(f.pct).replace('.', ',')} % ${(dico[f.fibre] && dico[f.fibre].fr) || f.fibre}`).join(' · ');
  const ar = fibres.map((f) => `${(dico[f.fibre] && dico[f.fibre].ar) || f.fibre} ${String(f.pct).replace('.', ',')}%`).join(' · ');
  return { fr, ar };
}

const SEXES = { B: 'Bébé', E: 'Enfant (unisexe)', F: 'Femme', H: 'Homme', U: 'Unisexe' };
const SEXES_AR = { B: 'رضيع', E: 'طفل', F: 'نساء', H: 'رجال', U: 'للجنسين' };

module.exports = { codeEtiquette, cleEan13, eanValide, modulesEan13, modules128, modulesCode, attribuerCodeBarres, matriceQR,
  formerArabe, arabeVisuel, dessinerArabe, nettoyerFibres, SYMBOLES, TRAITEMENTS, nettoyerEntretien, dessinerSymbole, texteFibres, SEXES, SEXES_AR };
