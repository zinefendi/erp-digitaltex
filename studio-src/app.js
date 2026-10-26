// Patron Studio — UI layer (vanilla, Shadow DOM so it never clashes with a WordPress theme)
import { Engine, FONTS, loadWebFonts, removeBackground, loadImage, makeZip } from './engine.js';
import { MATERIALS } from './garments.js';
import { ARTICLES, cloUrl, applyCatalog, SECTIONS, setSections, families, familyOf, GENDERS, SLEEVES, prefetchGLB, SIDE_KEYS, sideLabel } from './articles.js';
import { analyzeImage, textLineHeightMm, toDST, stitchPreview } from './embroidery.js';
const GARMENTS = ARTICLES;
import { LocalStore, WPStore } from './store.js';
import css from './styles.css';
import { buildSheetsPDF } from './sheet-pdf.js';
import { attachDatePickers, isoToday, isoToFr, addDays } from './datepick.js';
import { buildReceipt } from './docs-pdf.js';
import { staffList, gset, nextNumber, peekNumber, ensureClient, clientSnap, linesFromItems, orderTotal, advancesTotal, rid as gid, r3 } from './gestion-core.js';
import ICONS from './icons.json';

const I = {
  garment: '<path d="M8 3 3 6l2 5 3-1v11h8V10l3 1 2-5-5-3a4 4 0 0 1-8 0Z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  ai: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2"/><circle cx="12" cy="12" r="3"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  scene: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 15c4-3 7-3 10 0s6 2 8 0"/>',
  export: '<path d="M12 3v12M7 10l5 5 5-5M4 19h16"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  save: '<path d="M5 3h11l3 3v15H5Z"/><path d="M8 3v5h8V3M8 21v-7h8v7"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3 3.6M6.3 7.6C3.7 9.3 2 12 2 12s4 7 10 7a9 9 0 0 0 4-.9"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
  rotate: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l3 12h11l2-8H6"/>',
  wand: '<path d="m4 20 12-12M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1ZM19 11l.7 1.3L21 13l-1.3.7L19 15l-.7-1.3L17 13l1.3-.7Z"/>',
  flip: '<path d="M12 3v18M8 7 3 12l5 5M16 7l5 5-5 5"/>',
  center: '<path d="M12 3v18M7 8h10v8H7Z"/>',
  play: '<path d="M7 4v16l13-8Z"/>',
  key: '<circle cx="7" cy="15" r="4"/><path d="m10 12 10-10M17 5l2 2M15 7l2 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  minus: '<path d="M5 12h14"/>',
  rotl: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  rotr: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  upl: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  bag: '<path d="M5 8h14l-1 13H6Z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  needle: '<path d="M4 20 18 6"/><path d="M16 4a2 2 0 1 1 4 4l-2 2-4-4Z"/><path d="M7 13c-3 1-4 4-2 6"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.6-1-1.7-1.5-3-1.5-1.7 0-3 .9-3 2.2 0 3 6 1.6 6 4.6 0 1.3-1.3 2.2-3 2.2-1.4 0-2.6-.6-3.2-1.6M12 6v2M12 16v2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.8a3.3 3.3 0 0 1 0 6.4M18 14.6c2 .7 3.2 2.5 3.5 5.4"/>',
  doc: '<path d="M6 3h9l4 4v14H6Z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};
const ico = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${I[n]}</svg>`;
const SIL = {
  tee: '<path d="M16 6 6 11l3 8 5-2v23h20V17l5 2 3-8-10-5a6 6 0 0 1-12 0Z"/>',
  oversized: '<path d="M15 6 3 13l3 9 7-3v21h22V19l7 3 3-9-12-7a6 6 0 0 1-12 0Z"/>',
  boxy: '<path d="M15 8 4 13l3 8 6-2v17h22V19l6 2 3-8-11-5a6 6 0 0 1-12 0Z"/>',
  crop: '<path d="M16 8 7 12l3 7 4-2v12h20V17l4 2 3-7-9-4a6 6 0 0 1-12 0Z"/>',
  longsleeve: '<path d="M16 6 8 10 4 36l5 1 5-20v23h20V17l5 20 5-1-4-26-8-4a6 6 0 0 1-12 0Z"/>',
  sweatshirt: '<path d="M16 6 8 10 4 36l5 1 5-20v20h20V17l5 20 5-1-4-26-8-4a6 6 0 0 1-12 0Z"/><path d="M14 37v3h20v-3"/>',
  hoodie: '<path d="M17 7c0-4 14-4 14 0l9 4 4 26-5 1-5-20v19H14V18l-5 20-5-1 4-26Z"/><path d="M18 30h12l2 6H16Z"/>',
  ziphoodie: '<path d="M17 7c0-4 14-4 14 0l9 4 4 26-5 1-5-20v19H14V18l-5 20-5-1 4-26Z"/><path d="M24 9v30"/>',
  cap: '<path d="M8 30a16 16 0 0 1 32 0Z"/><path d="M24 14v16M8 30h36c0 3-6 5-14 4"/>',
  cap5: '<path d="M8 30a16 16 0 0 1 32 0Z"/><path d="M18 16l2 14M30 16l-2 14M8 30h36c0 3-6 5-14 4"/>',
};
Object.assign(SIL, {
  polo_h: '<path d="M16 6 6 11l3 8 5-2v23h20V17l5 2 3-8-10-5-4 4-2-1-2 1-4-4Z"/><path d="M22 10v8M26 10v8M22 12h4"/>',
  polo_f: '<path d="M17 7 8 11l3 7 4-2c0 4-1 8-1 12 0 4 1 8 1 10h18c0-2 1-6 1-10s-1-8-1-12l4 2 3-7-9-4-4 4-2-1-2 1-4-4Z"/><path d="M22 11v7M26 11v7"/>',
  tee_h: SIL.tee,
  tee_f: '<path d="M17 7 8 11l3 7 4-2c0 4-1 8-1 12 0 4 1 8 1 10h18c0-2 1-6 1-10s-1-8-1-12l4 2 3-7-9-4a6 6 0 0 1-12 0Z"/>',
  bermuda: '<path d="M12 6h24l3 32H27l-3-20-3 20H9Z"/><path d="M12 10h24"/>',
  chef: '<path d="M16 6 8 10 4 36l5 1 5-20v23h20V17l5 20 5-1-4-26-8-4-8 6Z"/><circle cx="20" cy="18" r="1"/><circle cx="20" cy="25" r="1"/><circle cx="28" cy="18" r="1"/><circle cx="28" cy="25" r="1"/>',
  apron: '<path d="M18 6h12v8l8 4-2 22H12l-2-22 8-4Z"/><path d="M18 6c0-4 12-4 12 0M14 28h20"/>',
});
for (const [k, v] of Object.entries(ICONS)) SIL[k] = v.svg;
const icoSvg = (k) => `<svg viewBox="0 0 48 44" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${SIL[k] || SIL.tee}</svg>`;
const sil = (id) => { const a = ARTICLES[id]; const k = a && a.icon && SIL[a.icon] ? a.icon : SIL[id] ? id : a && SIL[a.base] ? a.base : 'tee'; return icoSvg(k); };

const COLORS = [
  ['Blanc cassé', '#f4f2ee'], ['Blanc', '#ffffff'], ['Noir', '#161616'], ['Anthracite', '#3b3d40'], ['Gris chiné', '#a7a9ab'], ['Marine', '#1d2b4f'], ['Bleu roi', '#2b55b8'], ['Ciel', '#9cc3e6'],
  ['Rouge', '#c43c2c'], ['Bordeaux', '#5f1f2a'], ['Rose', '#efb6c4'], ['Orange', '#e9772f'], ['Moutarde', '#d9a52b'], ['Sable', '#d9c8a9'], ['Kaki', '#5b5e3a'], ['Forêt', '#2f4a36'],
  ['Sauge', '#9aae95'], ['Lavande', '#b7a8d6'], ['Chocolat', '#4b3226'], ['Crème', '#efe4cc'], ['Turquoise', '#2c8f8c'], ['Violet', '#4e2f72'], ['Lime', '#c4d94a'], ['Corail', '#ee7a68'],
];
let PALETTE = COLORS;
const AI_STYLES = [
  ['streetwear', 'Streetwear', 'bold streetwear graphic, screen-print style, limited colors'],
  ['vintage', 'Vintage', 'distressed vintage 70s t-shirt print, faded texture'],
  ['minimal', 'Minimal', 'minimalist line-art logo, single color, clean vector'],
  ['japan', 'Japonais', 'japanese ukiyo-e inspired illustration, bold outlines'],
  ['y2k', 'Y2K', 'y2k chrome and bubble typography, playful'],
  ['mascot', 'Mascotte', 'cartoon mascot character, thick outlines, sticker style'],
  ['gothic', 'Gothique', 'blackletter gothic metal band merch style'],
  ['photo', 'Réaliste', 'detailed realistic illustration'],
];

const T = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dl = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); };
const fileToDataURL = (f) => new Promise((r, j) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = j; fr.readAsDataURL(f); });

export async function mountStudio(host, cfgIn = {}) {
  const cfg = {
    mode: 'standalone', brand: 'Uniform Studio 3D', isPro: true, aiEnabled: true, credits: null, loggedIn: false, watermark: false,
    shopEnabled: false, loginUrl: '', upgradeUrl: '', currency: '€', basePrice: 0, ...cfgIn,
  };
  if (Array.isArray(cfg.sections) && cfg.sections.length) setSections(cfg.sections); // v3.2 : sections gérées dans les Paramètres
  if (Array.isArray(cfg.families)) for (const e of cfg.catalog || []) { const f = cfg.families.find((x) => x.key === e.family && x.section === e.section); if (f) { e.familyLabel = f.label; if (f.icon) e.familyIcon = f.icon; } }
  applyCatalog((cfg.catalog || []).filter((e) => !e.hidden)); // v3.1 : produits masqués dans les paramètres
  const SHOP = cfg.shopEnabled && cfg.shop && cfg.shop.articles ? cfg.shop : null;
  const ATELIER = cfg.mode === 'atelier'; // v3 Windows : la commande devient un PDF unique de fiches techniques
  // v2.4.0 : toutes les tailles sont du texte (« M », « 38 », « Taille unique ») — les tailles en chiffres bloquaient l'étape 4.
  if (SHOP) for (const A of Object.values(SHOP.articles)) { A.sizes = (A.sizes || []).map((z) => String(z)); if (A.sp) A.sp = Object.fromEntries(Object.entries(A.sp).map(([k, v]) => [String(k), +v])); }
  PALETTE = SHOP && SHOP.colors && SHOP.colors.length ? SHOP.colors : COLORS;
  const colorName = (hex) => { const f = PALETTE.find((c) => c[1].toLowerCase() === String(hex).toLowerCase()) || COLORS.find((c) => c[1].toLowerCase() === String(hex).toLowerCase()); return f ? f[0] : 'Couleur personnalisée'; };
  // ERP : compte sans le droit « prix » → aucun montant n'est affiché (le serveur fixe les prix)
  const NOPRICE = !!cfg.noPrice;
  const money = (v) => { if (NOPRICE) return ''; const m = (SHOP && SHOP.money) || { sym: cfg.currency || '€', pos: 'right_space', dec: 2, ds: ',', ts: ' ' }; let n = (Math.round(v * 10 ** m.dec) / 10 ** m.dec).toFixed(m.dec); let [i, d] = n.split('.'); i = i.replace(/\B(?=(\d{3})+(?!\d))/g, m.ts); n = d ? i + m.ds + d : i; return { left: m.sym + n, right: n + m.sym, left_space: m.sym + ' ' + n, right_space: n + ' ' + m.sym }[m.pos] || n + ' ' + m.sym; };
  loadWebFonts();
  const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
  root.innerHTML = '';
  const style = document.createElement('style'); style.textContent = css; root.appendChild(style);
  const store = cfg.mode === 'wp' && cfg.loggedIn ? new WPStore(cfg) : new LocalStore();
  const lsKey = 'patron-studio:';
  const S = { order: { lines: [], comment: '' }, tab: 'garment', project: { id: 'p' + Date.now(), name: 'Sans titre' }, aiImgs: [], textDraft: '', aiStyle: 'streetwear', bgRemoveTol: 38, dirty: false, myImages: [], emb: {}, pref: { gender: 'h', sleeve: 'ml' }, section: null, cartCount: (SHOP && SHOP.cartCount) || 0 };
  const RATE = { print: SHOP && SHOP.printPrice !== undefined ? +SHOP.printPrice : 4, setup: SHOP && SHOP.embSetup !== undefined ? +SHOP.embSetup : 10, piece: SHOP && SHOP.embPiece !== undefined ? +SHOP.embPiece : 0.5, minTextMm: 5 };

  const app = T(`<div class="app">
    <header class="top">
      ${cfg.homeUrl ? `<a class="pill home" href="${esc(cfg.homeUrl)}" title="Retour à la page d’accueil du site">${ico('home')}<span class="txt keep">Accueil</span></a>` : ''}
      <div class="brand"><i></i><span>${esc(cfg.brand)}</span></div>
      ${SHOP ? `<button class="price" data-a="price" title="Détail du prix"><b data-price>—</b><small data-pricesub>par pièce</small></button>` : ''}
      <div class="namebox top-name"><label class="nb-lbl" for="ps-pname">Nom de votre création <em>(facultatif)</em><button type="button" class="nb-i" data-a="namehelp" aria-label="À quoi sert ce champ ?">i</button></label>
        <div class="nb-row"><input id="ps-pname" data-pname type="text" maxlength="60" placeholder="Ex. : Polos équipe cuisine" value="" autocomplete="off"><button class="nb-save" data-a="save" title="Enregistrer pour retrouver votre création plus tard">${ico('save')}<span>Enregistrer</span></button>${ATELIER && window.uniformDesktop && window.uniformDesktop.catalogue ? `<button class="nb-save nb-set" data-a="settings" title="Paramètres : produits, modèles 3D (GLB), zones, tailles, prix, couleurs">${ico('layers')}<span>Paramètres</span></button>` : ''}${ATELIER && window.uniformDesktop && window.uniformDesktop.db ? `<button class="nb-save nb-set" data-a="gestion" title="Gestion : commandes, avances, bons de livraison, factures, clients (Ctrl+G)">${ico('doc')}<span>Gestion</span></button>` : ''}</div>
        <div class="nb-tip" role="tooltip">Facultatif : votre création est jointe automatiquement à votre commande. Enregistrez-la seulement pour la retrouver plus tard (onglet Projets).</div></div>
      <div class="spacer"></div>
      ${cfg.credits !== null ? `<span class="credits" data-credits>◆ ${cfg.credits} crédits IA</span>` : ''}
      <button class="pill" data-a="undo" title="Annuler (Ctrl+Z)" disabled>${ico('undo')}</button>
      <button class="pill" data-a="redo" title="Rétablir (Ctrl+Maj+Z)" disabled>${ico('redo')}</button>
      ${SHOP && ATELIER ? `<button class="pill chalk atl-pill" data-a="atlist" title="Commande en cours : générer le PDF des fiches techniques">${ico('export')}<span class="txt keep">Fiches PDF</span><b data-cartn class="atl-n" ${S.cartCount ? '' : 'hidden'}>0</b></button>` : SHOP ? `<a class="pill cartc" data-cartc href="${esc(SHOP.cartUrl || '#')}" title="Voir le panier" ${S.cartCount ? '' : 'hidden'}>${ico('bag')}<b data-cartn>${S.cartCount}</b></a>
      <button class="pill chalk" data-tab="order">${ico('cart')}<span class="txt keep">Commander</span></button>` : `<button class="pill chalk" data-a="goexport">${ico('export')}<span class="txt">Exporter</span></button>`}
      ${cfg.homeUrl ? `<a class="pill close" href="${esc(cfg.homeUrl)}" title="Fermer et revenir à la page d’accueil" aria-label="Fermer et revenir à la page d’accueil">${ico('x')}</a>` : ''}
    </header>
    <nav class="rail" aria-label="Outils"></nav>
    <aside class="panel"><div class="sheet-handle"><i></i></div><div class="pbody"></div></aside>
    <main class="stage">
      <div class="mat"></div><div class="tape"><canvas></canvas></div>
      <div class="view"></div>
      <div class="badge"></div>
      <button class="wmchip" data-a="pass" hidden>Retirer le filigrane</button>
      <div class="seltools" hidden>
        <button data-a="sdown" title="Réduire">${ico('minus')}<span>Réduire</span></button><button data-a="sup" title="Agrandir">${ico('plus')}<span>Agrandir</span></button>
        <i></i><button data-a="rl" title="Pivoter à gauche (15°)">${ico('rotl')}</button><button data-a="rr" title="Pivoter à droite (15°)">${ico('rotr')}</button><button data-a="r0" title="Remettre droit">0°</button>
        <i></i><button data-a="sdel" title="Supprimer" class="del">${ico('trash')}</button></div>
      <div class="variants" hidden></div>
      <div class="hint">Glissez le vêtement pour le tourner · glissez le logo pour le déplacer · coins : agrandir · poignée ronde : pivoter</div>
      <div class="hud">
        <div class="seg sides"><button data-side="front" class="on">Devant</button><button data-side="back">Dos</button><button data-side="left" class="hide">Manche G.</button><button data-side="right" class="hide">Manche D.</button></div>
        <div class="seg views">
          <button data-view="front">Face</button><button data-view="threequarter">¾</button><button data-view="side">Profil</button>
          <button data-view="high">Plongée</button><button data-view="hero">Héro</button><button data-view="detail">Détail</button>
          <button data-a="spin" title="Rotation automatique">${ico('rotate')}</button>
        </div>
      </div>
      <div class="toast"></div>
      <div class="busy"><div class="spin"></div><div class="busymsg">Un instant…</div><div class="progress hide"><i></i></div></div>
    </main>
    <nav class="mobtabs" aria-label="Outils"></nav>
    <div class="modal"><div class="dialog"></div></div>
  </div>`);
  root.appendChild(app);
  const $ = (s) => app.querySelector(s), $$ = (s) => [...app.querySelectorAll(s)];

  // --- local GLB models (standalone) ---
  const glbDB = (op, key, val) => new Promise((res) => { try { const r = indexedDB.open('patron-studio-models', 1); r.onupgradeneeded = () => r.result.createObjectStore('m'); r.onsuccess = () => { const t = r.result.transaction('m', op === 'get' || op === 'all' ? 'readonly' : 'readwrite'); const s = t.objectStore('m'); let q; if (op === 'put') q = s.put(val, key); else if (op === 'delete') q = s.delete(key); else if (op === 'all') { const out = {}; s.openCursor().onsuccess = (ev) => { const c = ev.target.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); }; return; } else q = s.get(key); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }; r.onerror = () => res(null); } catch (e) { res(null); } });
  const glbSaveMeta = async () => { const id = cfg.mode === 'standalone' ? null : null; void id; const M = engineRef.e?.modelInfo(); const gid = engineRef.e?.garmentId; if (cfg.mode !== 'standalone' || !M) return; const rec = await glbDB('get', gid); if (rec) await glbDB('put', gid, { ...rec, rot: M.rot || 0, dy: M.dy || 0, originalColors: !!M.originalColors }); };
  const engineRef = {};
  const models = { ...(cfg.models || {}) };
  try { window.__psModelUrls = Object.fromEntries(Object.entries(models).filter(([, m]) => m && m.url).map(([k, m]) => [k, new URL(m.url, location.href).href])); } catch (e) { /* */ }
  if (cfg.mode === 'standalone') {
    const all = await glbDB('all');
    for (const [k, v] of Object.entries(all || {})) if (v && v.buf) models[k] = { url: URL.createObjectURL(new Blob([v.buf], { type: 'model/gltf-binary' })), rot: v.rot || 0, dy: v.dy || 0, originalColors: !!v.originalColors, name: v.name };
  }
  // Every visitor starts with a blank studio: black long-sleeve men's polo, no artwork.
  const BLACK = ((PALETTE.find(([n]) => /^noir$/i.test(String(n).trim())) || PALETTE.find(([, h]) => h.toLowerCase() === '#161616') || ['Noir', '#161616'])[1]);
  const startId = () => {
    const want = cfg.startGarment || 'polo_h_ml';
    if (ARTICLES[want]) return want;
    const all = Object.entries(ARTICLES);
    const m = all.find(([, a]) => a.family === 'polo' && a.gender === 'h' && a.sleeve === 'ml') || all.find(([, a]) => a.family === 'polo') || all[0];
    return m[0];
  };
  const engine = new Engine($('.view'), { models, startGarment: startId(), startColor: cfg.startColor || BLACK, deferGLB: true, watermark: cfg.watermark && !cfg.isPro, wmView: false, watermarkText: cfg.watermarkText || 'VETHYPRO' });
  engineRef.e = engine;
  // ERP 0.15.0 : une demande « ouvrir-fiche » peut arriver pendant le chargement du modèle 3D : on la garde pour la fin du montage
  let FICHE_DEMANDE = null, FICHE_OUVRIR = null;
  const FICHE_PRET = () => { if (FICHE_OUVRIR && FICHE_DEMANDE) { const v = FICHE_DEMANDE; FICHE_DEMANDE = null; FICHE_OUVRIR(v); } };
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || !e.data.erp || e.data.type !== 'ouvrir-fiche') return;
    try { sessionStorage.removeItem('erp.fiche3d'); } catch (_) { /* */ }
    FICHE_DEMANDE = +e.data.version_id; FICHE_PRET();
  });
  try { const d = JSON.parse(sessionStorage.getItem('erp.fiche3d') || 'null'); if (d && d.version_id) { sessionStorage.removeItem('erp.fiche3d'); FICHE_DEMANDE = +d.version_id; } } catch (_) { /* */ }
  engine.setBackground({ type: 'studio', color: '#e9eef3' });
  engine.on('loading', (L) => { if (L.on) busy(true, `Chargement du modèle 3D ${L.name}…`, L.p); else busy(false); });
  engine.on('error', (m) => toast(m, true));
  try { localStorage.removeItem(lsKey + 'autosave'); } catch (e) { /* private mode */ }
  engine.setColor(cfg.startColor || BLACK);
  await engine.setGarment(startId());
  if (cfg.color) engine.setColor(cfg.color);
  if (cfg.garment) await engine.setGarment(cfg.garment);

  /* ---------- tabs ---------- */
  const TABS = [['garment', 'Produit'], ['graphics', 'Image'], ['text', 'Texte'], ['ai', 'IA'], ['marking', 'Marquage'], ['layers', 'Calques'], ['scene', 'Scène'], ['export', 'Export'], ['projects', 'Projets']];
  if (SHOP) TABS.push(['order', 'Commander']);
  const STEP = { garment: 1, graphics: 2, text: 2, marking: 3, order: 4 };
  const TICON = { garment: 'garment', graphics: 'image', text: 'text', ai: 'ai', marking: 'needle', layers: 'layers', scene: 'scene', export: 'export', projects: 'folder', order: 'cart' };
  const aiShown = cfg.mode === 'atelier' ? false : (cfg.mode !== 'wp' || cfg.aiEnabled);
  const RAIL = TABS.map((t) => t[0]).filter((k) => !(SHOP && k === 'scene') && !(k === 'ai' && !aiShown) && !(k === 'marking' && !SHOP));
  const tabBtn = (k, cls = '') => `<button data-tab="${k}" class="${cls}" title="${TABS.find((t) => t[0] === k)[1]}" ${STEP[k] && SHOP ? `data-step="${STEP[k]}"` : ''}>${ico(TICON[k])}<span>${TABS.find((t) => t[0] === k)[1]}</span></button>`;
  $('.rail').innerHTML = RAIL.map((k) => tabBtn(k)).join('');
  // Phone: the four steps of the order path, the order tab last.
  const MOB = SHOP ? ['garment', 'graphics', 'text', ...(aiShown ? ['ai'] : []), 'marking', 'order'] : ['garment', 'graphics', 'text', 'ai', 'layers', 'export', 'projects'];
  $('.mobtabs').innerHTML = MOB.map((k) => tabBtn(k, k === 'order' ? 'order' : '')).join('');
  const isMobile = () => app.clientWidth <= 900;
  function setTab(k, toggle) {
    const panel = $('.panel');
    if (isMobile() && toggle && S.tab === k && panel.classList.contains('open')) { closeSheet(); return; }
    S.tab = k; if (k === 'marking') S.markSeen = true; $$('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === k && !b.classList.contains('pill') && !b.classList.contains('btn')));
    panel.classList.toggle('tall', k === 'order');
    panel.classList.add('open'); render(); panel.scrollTop = 0;
  }

  function closeSheet() { $('.panel').classList.remove('open'); $$('[data-tab]').forEach((b) => b.classList.remove('on')); }
  /* ---------- toast / busy / modal ---------- */
  let tt; function toast(m, err) { const t = $('.toast'); t.textContent = m; t.classList.toggle('err', !!err); t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 3200); }
  function busy(on, msg, prog) { $('.busy').classList.toggle('show', on); if (msg) $('.busymsg').textContent = msg; $('.progress').classList.toggle('hide', prog === undefined); if (prog !== undefined) $('.progress i').style.width = Math.round(prog * 100) + '%'; }
  function modal(html) { const m = $('.modal'); m.classList.remove('wide', 'xwide'); $('.dialog').innerHTML = html; m.classList.add('show'); m.onclick = (e) => { if (e.target === m || e.target.closest('[data-close]')) m.classList.remove('show'); }; return $('.dialog'); }
  /* ---------- v2.4.0 : session propre à chaque client ----------
   * La page du studio peut être servie depuis le cache du site (même copie pour tout le monde).
   * Au démarrage, on lit un petit état frais (~300 octets) : jeton de sécurité, panier, Pass.
   * Toute requête refusée pour jeton expiré (403) relit l'état puis réessaie UNE seule fois. */
  let sessP = null;
  function refreshSession() {
    if (cfg.mode !== 'wp' || !cfg.sessionUrl) return Promise.resolve(null);
    if (!sessP) sessP = fetch(cfg.sessionUrl + '&_=' + Date.now(), { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null)).then((j) => {
        if (j && j.nonce) {
          cfg.nonce = j.nonce;
          if (SHOP && typeof j.cartCount === 'number') { S.cartCount = j.cartCount; const cc = $('[data-cartc]'); if (cc) { cc.hidden = !S.cartCount; $('[data-cartn]').textContent = S.cartCount; } }
          if (j.pass) cfg.pass = j.pass;
          if (j.isPro && !cfg.isPro) setPro(j.pass);
        }
        return j;
      }).catch(() => null).finally(() => { setTimeout(() => { sessP = null; }, 1500); });
    return sessP;
  }
  async function api(url, opts = {}, retried = false) {
    const r = await fetch(url, { credentials: 'same-origin', ...opts, headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': cfg.nonce, ...(opts.headers || {}) } });
    if (r.status === 403 && !retried && cfg.mode === 'wp') {
      const j = await r.clone().json().catch(() => ({}));
      if (/nonce|cookie|session/i.test(String(j.code || '') + String(j.message || ''))) { await refreshSession(); return api(url, opts, true); }
    }
    return r;
  }
  if (store.cfg) store.api = api; // projets enregistrés (clients connectés)

  /* ---------- Pass Pro 3D ---------- */
  const wmOn = () => engine.watermark;
  const deviceId = () => { try { let d = localStorage.getItem(lsKey + 'device'); if (!d) { d = 'd' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(lsKey + 'device', d); } return d; } catch (e) { return ''; } };
  function setPro(info) {
    cfg.isPro = true; cfg.pass = info || cfg.pass; engine.setWatermark(false); app.classList.add('is-pro'); const c = $('.wmchip'); if (c) c.hidden = true;
    if (S.tab === 'export') render();
  }
  async function passStatus() {
    if (cfg.mode !== 'wp' || !cfg.passRest || cfg.isPro) return;
    try { const r = await fetch(cfg.passRest + '/status', { credentials: 'same-origin', cache: 'no-store' }); const j = await r.json(); if (j && j.pro) setPro(j); } catch (e) { /* offline */ }
  }
  const passHref = () => cfg.upgradeUrl || ((cfg.homeUrl || '/').replace(/\/?$/, '/') + 'pass-pro-3d/');
  function needPro(what) {
    if (!wmOn()) return false;
    const price = cfg.passPrice || '20 DT', wm = esc(cfg.watermarkText || 'VETHYPRO');
    const d = modal(`<div class="passm"><div class="passm-tag">Pass Pro 3D · ${esc(price)}</div><h3>Sans filigrane</h3>
      <p class="lead" style="color:var(--ink-2)">${what ? esc(what) + ' porte' : 'Vos visuels portent'} le filigrane gris « ${wm} ». Le Pass Pro 3D le retire de vos images HD, de la vidéo 360° et des fichiers exportés.</p>
      <ul><li>Aperçu 3D, images HD et pack couleurs sans filigrane</li><li>Vidéo 360° propre pour vos réseaux</li><li>Fichiers d’impression PNG 300 DPI</li><li>Code personnel envoyé par e-mail et WhatsApp</li></ul>
      <div class="row">${cfg.upgradeUrl ? `<a class="btn" href="${esc(passHref())}" target="_blank" rel="noopener" data-passlink style="text-decoration:none">Acheter le Pass · ${esc(price)}</a>` : ''}<button class="btn ghost" data-close>Plus tard</button></div>
      ${cfg.passRest ? `<form class="passm-code" data-passform><label>J’ai déjà un code</label><div class="row"><input data-passcode placeholder="VTP-XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="btn ghost" type="submit">Activer</button></div><p class="note" data-passmsg></p></form>` : ''}</div>`);
    const f = d.querySelector('[data-passform]');
    if (f) f.onsubmit = async (e) => {
      e.preventDefault(); const msg = f.querySelector('[data-passmsg]'), code = f.querySelector('[data-passcode]').value.trim();
      if (!code) { msg.textContent = 'Saisissez votre code.'; return; }
      msg.textContent = 'Vérification…';
      try {
        const r = await fetch(cfg.passRest + '/activate', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, device: deviceId() }) });
        const j = await r.json(); if (!r.ok) throw new Error(j.message || 'Code refusé.');
        setPro(j); $('.modal').classList.remove('show'); toast(`Pass Pro activé jusqu’au ${j.expires}. Filigrane retiré.`);
      } catch (er) { msg.textContent = er.message; msg.style.color = '#b4442f'; }
    };
    return true;
  }
  /** Non-Pro export: we still deliver the file (watermarked) and suggest the Pass. */
  let nudged = 0;
  function wmNudge(what) { if (!wmOn()) return; if (Date.now() - nudged > 60000) { nudged = Date.now(); setTimeout(() => needPro(what), 900); } else toast(`Filigrane « ${cfg.watermarkText || 'VETHYPRO'} » : retirez-le avec le Pass Pro 3D.`); }

  const sideLow = (sd) => sideLabel(sd, ARTICLES[engine.garmentId]).toLowerCase();
  const sideAu = (sd) => ({ front: 'devant', back: 'au dos' }[sd] || (/^côté/.test(sideLow(sd)) ? 'sur le ' : 'sur la ') + sideLow(sd));
  const viewOf = (sd) => (['front', 'back', 'left', 'right'].includes(sd) ? sd : 'front');
  const cmTxt = (inch) => (Math.round(inch * 25.4) / 10).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  /* ---------- badge / tape ---------- */
  function updateBadge() {
    const A = engine.area(), L = engine.layers.find((l) => l.id === engine.selected);
    let h = `<b>${GARMENTS[engine.garmentId].name}</b> · ${sideLow(engine.side)}${SHOP ? ' · ' + (markOf(engine.side) === 'embroidery' ? 'broderie' : 'impression') : ''}<br>zone ${cmTxt(A.wIn)} × ${cmTxt(A.hIn)} cm`;
    if (L) { const dpi = engine.layerDpi(L); h += `<br>motif ${(L.w * 2.54).toFixed(1)} × ${(L.w * L.ar * 2.54).toFixed(1)} cm` + (L.type === 'image' ? ` · <span class="${dpi < 150 ? 'warn' : ''}">${dpi} dpi${dpi < 150 ? ' — trop petit pour une impression nette' : ''}</span>` : ''); }
    $('.badge').innerHTML = h;
    drawTape();
  }
  let rulerRI = null;
  function drawTape(ri) {
    if (ri !== undefined) rulerRI = ri;
    const c = $('.tape canvas'); const h = c.clientHeight; if (!h) return;
    const top = c.getBoundingClientRect().top;
    const R = rulerRI || { ppc: h / 60, y0: top + 20 };
    const ppc = R.ppc, y0 = R.y0 - top;
    c.width = 60; c.height = h * 2; const x = c.getContext('2d'); x.scale(2, 2);
    x.fillStyle = '#ffffff'; x.font = '600 8px "JetBrains Mono", monospace'; x.textAlign = 'center';
    const mm = ppc >= 25; // mm ticks only when readable
    const step = ppc < 9 ? 5 : ppc < 16 ? 2 : 1; // label every n cm
    const from = Math.floor(-y0 / ppc) - 1, to = Math.ceil((h - y0) / ppc) + 1;
    for (let cm = from; cm <= to; cm++) {
      const y = y0 + cm * ppc;
      if (y >= -2 && y <= h + 2) { const L = cm % 5 === 0 ? 14 : 10; x.globalAlpha = 1; x.fillRect(30 - L, Math.round(y), L, 1); if (cm > 0 && cm % step === 0) { x.save(); x.translate(9, y); x.rotate(-Math.PI / 2); x.fillText(String(cm), 0, 3); x.restore(); } }
      x.globalAlpha = .75;
      if (mm) for (let k = 1; k < 10; k++) { const yy = y + k * ppc / 10; if (yy < 0 || yy > h) continue; x.fillRect(30 - (k === 5 ? 7 : 4), Math.round(yy), k === 5 ? 7 : 4, 1); }
      else if (ppc >= 10) { const yy = y + ppc / 2; if (yy >= 0 && yy <= h) x.fillRect(26, Math.round(yy), 4, 1); }
    }
    x.globalAlpha = 1;
    if (y0 > 4 && y0 < h - 4) { x.fillStyle = '#b9a16b'; x.beginPath(); x.moveTo(30, y0 - 4); x.lineTo(23, y0); x.lineTo(30, y0 + 4); x.fill(); }
    x.fillStyle = '#29669d'; x.fillRect(0, 0, 30, 15); x.fillStyle = '#ffffff'; x.font = '700 8px "JetBrains Mono", monospace'; x.fillText('cm', 15, 11);
  }

  /* ---------- panels ---------- */
  // v2.4.0 : chaque écran est protégé — une erreur affiche « Réessayer » au lieu d'un panneau vide.
  function render() {
    try { renderPanel(); } catch (err) {
      try { console.error('[Uniform Studio 3D]', err); } catch (e) { /* */ }
      $('.pbody').innerHTML = `<div class="sec"><h2>Un instant…</h2><p class="lead">Cette étape n’a pas pu s’afficher.</p><button class="btn full big" data-a="retry">Réessayer</button><p class="note">Si le problème continue, rechargez la page : votre panier est conservé.</p></div>`;
    }
  }
  function renderPanel() {
    const b = $('.pbody'); const k = S.tab;
    if (k === 'garment') b.innerHTML = pGarment();
    else if (k === 'graphics') b.innerHTML = pGraphics();
    else if (k === 'text') b.innerHTML = pText();
    else if (k === 'ai') b.innerHTML = pAI();
    else if (k === 'layers') b.innerHTML = pLayers();
    else if (k === 'scene') b.innerHTML = pScene();
    else if (k === 'export') b.innerHTML = pExport();
    else if (k === 'order') b.innerHTML = pOrder();
    else if (k === 'marking') b.innerHTML = pMarking();
    else if (k === 'projects') { b.innerHTML = `<div class="sec"><h2>Projets</h2><p class="lead">Chargement…</p></div>`; pProjects().then((h) => { if (S.tab === 'projects') b.innerHTML = h; }); }
    if (isMobile() && (k === 'layers' || k === 'text' || k === 'graphics')) { /* keep */ }
  }
  const FAM = () => { const L = families(); if (!Array.isArray(cfg.families)) return L; const ix = (f) => { const i = cfg.families.findIndex((x) => x.key === f.key && x.section === f.section); return i < 0 ? 1e6 : i; }; return L.slice().sort((a, b) => ix(a) - ix(b)); };
  const curFam = () => familyOf(engine.garmentId);
  const sectionOf = (id) => (ARTICLES[id] || {}).section || 'haut';
  // Variant switch inside a family: keep what the customer already chose (gender, sleeve, style).
  const variantIds = (f) => f.ids.map((id) => [id, ARTICLES[id]]);
  const pickInFamily = (f, want = {}) => {
    const v = variantIds(f), P = { ...S.pref, ...want };
    const score = ([, a]) => (P.gender && a.gender === P.gender ? 2 : 0) + (P.sleeve && a.sleeve === P.sleeve ? 1 : 0) + (P.style && a.style === P.style ? 1 : 0);
    return v.slice().sort((a, b) => score(b) - score(a))[0][0];
  };
  function variantBar() {
    const f = curFam(), el = $('.variants'); if (!el) return;
    const v = f ? variantIds(f) : [];
    if (!f || v.length < 2) { el.hidden = true; el.innerHTML = ''; return; }
    const a = ARTICLES[engine.garmentId];
    const opts = (field, labels) => { const vals = [...new Set(v.map(([, x]) => x[field]).filter(Boolean))]; return vals.length > 1 ? vals.map((val) => `<button data-variant="${field}:${esc(val)}" class="${a[field] === val ? 'on' : ''}">${esc(labels ? labels[val] || val : val)}</button>`).join('') : ''; };
    const g = opts('gender', GENDERS), sl = opts('sleeve', SLEEVES), st = opts('style');
    const groups = [g, sl, st].filter(Boolean);
    const rest = groups.length ? '' : v.map(([id, x]) => `<button data-garment="${id}" class="${id === engine.garmentId ? 'on' : ''}">${esc(x.name)}</button>`).join('');
    el.innerHTML = groups.map((h) => `<div class="vg">${h}</div>`).join('') + (rest ? `<div class="vg">${rest}</div>` : '');
    el.hidden = false;
  }
  function pGarment() {
    const fams = FAM();
    const secs = Object.entries(SECTIONS).filter(([k]) => fams.some((f) => f.section === k)); // ordre des Paramètres
    for (const f of fams) if (!secs.some(([k]) => k === f.section)) secs.push([f.section, f.section]);
    const cur = curFam();
    const sec = S.section && secs.some(([k]) => k === S.section) ? S.section : sectionOf(engine.garmentId);
    const list = fams.filter((f) => f.section === sec);
    const a = ARTICLES[engine.garmentId];
    return `<div class="sec">${nameBlock()}<h2>${SHOP ? '<i class="stepn">1</i>' : ''}Choisissez votre produit</h2>
      <div class="cats">${secs.map(([k, n]) => `<button data-section="${k}" class="${k === sec ? 'on' : ''}">${esc(n)}</button>`).join('')}</div>
      <div class="fams">${list.map((f) => `<button class="fam ${cur && cur.key === f.key && cur.section === f.section ? 'on' : ''}" data-family="${esc(f.section + ':' + f.key)}">${icoSvg(cur && cur.key === f.key ? a.icon : ARTICLES[pickInFamily(f)].icon || f.icon)}<b>${esc(f.label)}</b>${f.ids.length > 1 ? `<em>${f.ids.length} modèles</em>` : ''}</button>`).join('')}</div>
      <div class="picked">${sil(engine.garmentId)}<div><b>${esc(a.name)}</b><em>${variantIds(cur || { ids: [engine.garmentId] }).length > 1 ? 'Changez la variante sous l’aperçu 3D' : 'Modèle sélectionné'}</em></div></div>
      <div class="lbl">Couleur du tissu <span>${esc(colorName(engine.color))}</span></div>
      <div class="swatches">${PALETTE.map(([n, h]) => `<button class="sw ${engine.color.toLowerCase() === h ? 'on' : ''}" style="background:${h}" data-color="${h}" title="${n}" aria-label="${n}"></button>`).join('')}
        ${SHOP ? '' : `<label class="sw custom" title="Couleur personnalisée"><input type="color" data-customcolor value="${engine.color}"></label>`}</div>
      ${trimBlock()}
      ${engine.g.isGLB && !SHOP ? `<div class="toggle"><span>Garder les couleurs d'origine du modèle</span><input type="checkbox" data-origcolors ${engine.g.originalColors ? 'checked' : ''}></div>` : ''}
      ${!engine.modelInfo() && cfg.mode === 'standalone' ? `<p class="note">Version simplifiée. Importez le modèle GLB exporté de CLO (<a href="${cloUrl(GARMENTS[engine.garmentId])}" target="_blank" rel="noopener">${esc((GARMENTS[engine.garmentId].clo || {}).name || 'CLO-SET')}</a>) dans l'onglet Scène.</p>` : ''}
      ${SHOP ? '' : `<div class="lbl">Matière</div><div class="chips">${Object.entries(MATERIALS).map(([id, m]) => `<button class="chip ${engine.material === id ? 'on' : ''}" data-material="${id}">${m.name}</button>`).join('')}</div>`}
      ${SHOP ? nextBtn('graphics', 'Étape 2 : ajouter un logo ou un texte') : ''}
      <div style="height:16px"></div></div>`;
  }
  // v3.3 : couleurs du col et des poignets (palette gérée dans Paramètres › Couleurs)
  const TRIM_PAL = (k) => { const L = SHOP && SHOP.trimColors && SHOP.trimColors[k]; return Array.isArray(L) && L.length ? L : PALETTE; };
  const trimOpts = () => { const e = catE(engine.garmentId) || {}, T = e.trims || {}, av = engine.trimsAvailable(); return { collar: T.collar !== false && av.collar && (T.collar === true || /polo|tee|tshirt|t-shirt|sweat|chef/i.test(e.family + ' ' + e.id + ' ' + (e.base || ''))), cuffs: T.cuffs !== false && av.cuffs && (T.cuffs === true || (ARTICLES[engine.garmentId] || {}).sleeve === 'ml'), cuffCm: +T.cuffCm || 6 }; };
  const trimName = (k, hex) => { const f = TRIM_PAL(k).find((c) => c[1].toLowerCase() === String(hex).toLowerCase()); return f ? f[0] : colorName(hex); };
  function trimBlock() {
    const o = trimOpts(); if (!o.collar && !o.cuffs) return '';
    const row = (k, lab) => { if (!o[k]) return ''; const cur = engine.trims[k] || ''; return `<div class="lbl">${lab} <span>${cur ? esc(trimName(k, cur)) : 'comme le tissu'}</span></div>
      <div class="swatches trims"><button class="sw same ${cur ? '' : 'on'}" data-trim="${k}:" title="Même couleur que le tissu" aria-label="Même couleur que le tissu">=</button>${TRIM_PAL(k).map(([n, h]) => `<button class="sw ${cur.toLowerCase() === h.toLowerCase() ? 'on' : ''}" style="background:${h}" data-trim="${k}:${h}" title="${esc(n)}" aria-label="${esc(n)}"></button>`).join('')}</div>`; };
    return row('collar', 'Couleur du col') + row('cuffs', 'Couleur des poignets');
  }
  const trimSummary = () => { const o = trimOpts(), T = engine.trims, out = []; if (o.collar && T.collar) out.push({ k: 'collar', label: 'Col', name: trimName('collar', T.collar), hex: T.collar }); if (o.cuffs && T.cuffs) out.push({ k: 'cuffs', label: 'Poignets', name: trimName('cuffs', T.cuffs), hex: T.cuffs }); return out; };
  // v2.4.0 : nom de la création + Enregistrer, côte à côte (sur téléphone, dans les étapes 1 et 4)
  const nameBlock = () => `<div class="namebox in-panel"><label class="nb-lbl">Nom de votre création <em>(facultatif)</em></label>
      <div class="nb-row"><input data-pname type="text" maxlength="60" placeholder="Ex. : Polos équipe cuisine" value="${esc(S.project.name === 'Sans titre' ? '' : S.project.name)}" autocomplete="off" aria-label="Nom de votre création (facultatif)"><button class="nb-save" data-a="save" title="Enregistrer pour retrouver votre création plus tard">${ico('save')}<span>Enregistrer</span></button></div>
      <p class="nb-help">Facultatif : votre création est jointe automatiquement à votre commande. Enregistrez-la seulement pour la retrouver plus tard (onglet Projets).</p></div>`;
  // v3.2 : staff (équipe du client) — liste gérée dans Paramètres › Staff
  const STAFF = () => staffList(cfg);
  const DEFSTAFF = () => { const v = (cfg.atelier && cfg.atelier.service) || ''; return STAFF().includes(v) ? v : ''; };
  // v3.2.1 : « Autre staff… » — saisie d'un staff hors liste (prompt() est bloqué sous Electron)
  const askStaff = (sel, done) => { sel.style.display = 'none'; const w = document.createElement('span'); w.className = 'stf-new'; w.innerHTML = '<input maxlength="40" placeholder="Nom du staff (ex. : SPA)"><button type="button" class="btn sm primary">OK</button>'; sel.after(w); const i = w.querySelector('input'); i.focus(); const ok = () => { const v = i.value.trim().toUpperCase(); w.remove(); sel.style.display = ''; if (v) done(v); }; w.querySelector('button').onclick = ok; i.onkeydown = (e) => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') { i.value = ''; ok(); } }; };
  const staffBlock = () => { const L = STAFF(), v = S.order.staff ?? AT.lastStaff ?? DEFSTAFF();
    return `<div class="lbl">Staff concerné <span>équipe du client</span></div>
      <div class="field"><select data-ostaff aria-label="Staff concerné par ce produit"><option value="">— Choisir le staff —</option>${L.map((x) => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('')}${v && !L.includes(v) ? `<option selected>${esc(v)}</option>` : ''}<option value="__autre">Autre staff…</option></select></div>
      <p class="nb-help" style="margin-top:-2px">Imprimé dans la case « Service / Staff » de la fiche. Liste modifiable dans Paramètres › Staff.</p>`; };
  const nextBtn = (tab, label) => `<div style="height:14px"></div><button class="btn full big next" data-tab="${tab}">${label}${ico('arrow')}</button>`;
  const skipLink = `<p class="skip"><button data-tab="order">Produit uni, sans marquage ? Passer à la commande</button></p>`;
  function pGraphics() {
    const L = selLayer('image');
    const faces = SIDE_KEYS.filter((sd) => engine.g.printAreas[sd]);
    const two = faces.length > 1;
    const ACC = 'image/*,.svg,.pdf,.ai,application/pdf,application/postscript,application/illustrator';
    const zone = (sd) => { const n = engine.layers.filter((l) => l.side === sd && l.type === 'image').length;
      return `<label class="drop ${two && engine.side === sd ? 'cur' : ''}" data-drop="${sd}">${ico('upl')}<b>${two ? 'Logo ' + sideLow(sd) : 'Envoyer mon logo'}</b><small>Cliquez ou déposez le fichier ici</small>${n ? `<em class="cnt">${ico('check')}${n} logo${n > 1 ? 's' : ''} placé${n > 1 ? 's' : ''}</em>` : ''}<input type="file" accept="${ACC}" data-file="${sd}" hidden></label>`; };
    return `<div class="sec"><h2>${SHOP ? '<i class="stepn">2</i>' : ''}Ajoutez votre logo</h2><p class="lead">Fichier JPG, PNG, SVG, PDF ou AI.${two ? ` Un fichier par zone (${faces.map(sideLow).join(', ')}) : chacun se place sur sa zone.` : ''}</p>
      <div class="drops ${two ? 'two' : ''}">${faces.map(zone).join('')}</div>
      ${S.myImages.length ? `<div class="lbl">Mes images <span>toucher pour placer</span></div><div class="mine">${S.myImages.map((m, i) => `<button data-mine="${i}" style="background-image:url('${m.thumb}')" title="${esc(m.name)}" aria-label="Placer ${esc(m.name)}"></button>`).join('')}</div>` : ''}
      <div class="toggle"><span>Retirer le fond à l'import</span><input type="checkbox" data-autobg ${S.autoBg ? 'checked' : ''}></div>
      ${L ? imageProps(L) : `<div class="note">Sur le vêtement : faites glisser le logo pour le déplacer, tirez un coin pour l’agrandir et la poignée ronde pour le faire pivoter. Sur téléphone, pincez avec deux doigts.</div>`}
      ${SHOP ? nextBtn('marking', 'Étape 3 : impression ou broderie') + skipLink : ''}
      <div style="height:12px"></div></div>`;
  }
  function transformProps(L) {
    const A = engine.area(L.side);
    return `<div class="field"><label>Taille <span>${(L.w * 2.54).toFixed(1)} cm</span></label><div class="stepper"><button class="ib" data-a="sdown" title="Réduire">${ico('minus')}</button><input type="range" min="0.5" max="${Math.max(A.wIn, A.hIn) * 1.3}" step="0.05" value="${L.w}" data-lp="w"><button class="ib" data-a="sup" title="Agrandir">${ico('plus')}</button></div></div>
      <div class="field"><label>Rotation <span>${Math.round(L.rot || 0)}°</span></label><div class="stepper"><button class="ib" data-a="rl" title="Pivoter à gauche">${ico('rotl')}</button><input type="range" min="-180" max="180" step="1" value="${L.rot || 0}" data-lp="rot"><button class="ib" data-a="rr" title="Pivoter à droite">${ico('rotr')}</button></div></div>
      <div class="field"><label>Opacité <span>${Math.round((L.opacity ?? 1) * 100)} %</span></label><input type="range" min="0.05" max="1" step="0.01" value="${L.opacity ?? 1}" data-lp="opacity"></div>
      <div class="row"><button class="btn ghost" data-la="center">${ico('center')}Centrer</button><button class="btn ghost" data-la="top">Haut de zone</button></div>
      <div class="row" style="margin-top:8px"><button class="btn ghost" data-la="dup">${ico('copy')}Dupliquer</button>${SIDE_KEYS.filter((x) => x !== L.side && engine.g.printAreas[x]).length ? `<select class="btn ghost" data-lmove aria-label="Déplacer vers une autre zone"><option value="">Déplacer vers…</option>${SIDE_KEYS.filter((x) => x !== L.side && engine.g.printAreas[x]).map((x) => `<option value="${x}">${esc(sideLabel(x, ARTICLES[engine.garmentId]))}</option>`).join('')}</select>` : ''}</div>
      <div class="row" style="margin-top:8px"><button class="btn ghost" data-la="del" style="color:var(--danger)">${ico('trash')}Supprimer</button></div>`;
  }
  function imageProps(L) {
    return `<div class="props"><div class="lbl">Motif sélectionné <span>${engine.layerDpi(L)} dpi</span></div>${transformProps(L)}
      <div class="row" style="margin-top:8px"><button class="btn ghost" data-la="flip">${ico('flip')}Miroir</button><button class="btn" data-la="rmbg">${ico('wand')}Retirer le fond</button></div>
      <div class="field" style="margin-top:10px"><label>Tolérance du détourage <span>${S.bgRemoveTol}</span></label><input type="range" min="8" max="90" value="${S.bgRemoveTol}" data-tol></div></div>`;
  }
  function pText() {
    const L = selLayer('text');
    const fontBtns = (cur) => `<div class="fontlist">${FONTS.map((f) => `<button data-font="${f}" class="${cur === f ? 'on' : ''}" style="font-family:'${f}'">${f}</button>`).join('')}</div>`;
    if (!L) return `<div class="sec"><h2>${SHOP ? '<i class="stepn">2</i>' : ''}Ajoutez un texte</h2><p class="lead">Nom de l’entreprise, prénom, slogan…</p>
      <div class="field"><textarea data-newtext rows="2" placeholder="Votre texte">${esc(S.textDraft)}</textarea></div>
      <div class="lbl">Police</div>${fontBtns(S.newFont || 'Anton')}
      <div style="height:10px"></div><button class="btn full" data-a="addtext">${ico('text')}Ajouter le texte ${sideAu(engine.side)}</button>
      ${SHOP && engine.layers.length ? nextBtn('marking', 'Étape 3 : impression ou broderie') : ''}<div style="height:14px"></div></div>`;
    return `<div class="sec"><h2>Texte</h2><p class="lead">Modifiez le texte sélectionné. <button class="chip" data-a="deselect" style="height:26px">+ Nouveau texte</button></p>
      <div class="field"><textarea data-tp="text" rows="2">${esc(L.text)}</textarea></div>
      <div class="lbl">Police</div>${fontBtns(L.font)}
      <div class="lbl">Style</div>
      <div class="row"><input type="color" data-tp="color" value="${L.color}"><div class="chips" style="flex:1">${['left', 'center', 'right'].map((a) => `<button class="chip ${L.align === a ? 'on' : ''}" data-align="${a}">${{ left: 'Gauche', center: 'Centre', right: 'Droite' }[a]}</button>`).join('')}</div></div>
      <div class="field" style="margin-top:12px"><label>Courbure <span>${L.arc}°</span></label><input type="range" min="-180" max="180" step="1" value="${L.arc}" data-tp="arc"></div>
      <div class="field"><label>Espacement des lettres <span>${L.spacing}</span></label><input type="range" min="-10" max="60" step="1" value="${L.spacing}" data-tp="spacing"></div>
      <div class="toggle"><span>Contour</span><input type="checkbox" data-tp="stroke" ${L.stroke ? 'checked' : ''}></div>
      ${L.stroke ? `<div class="row"><input type="color" data-tp="strokeColor" value="${L.strokeColor}"><input type="range" min="1" max="30" value="${L.strokeW}" data-tp="strokeW"></div>` : ''}
      <div class="props">${transformProps(L)}</div>${SHOP ? nextBtn('marking', 'Étape 3 : impression ou broderie') : ''}<div style="height:14px"></div></div>`;
  }
  function pAI() {
    const ok = cfg.aiEnabled && (cfg.mode === 'wp' || localStorage.getItem(lsKey + 'openai'));
    return `<div class="sec"><h2>Créer avec l'IA</h2><p class="lead">Décrivez votre motif en une phrase. L'IA génère un visuel sur fond transparent, prêt à placer.</p>
      <div class="field"><textarea data-aiprompt rows="3" placeholder="Ex. : un tigre rugissant entouré de flammes, texte « TUNIS 1987 » en dessous">${esc(S.aiPrompt || '')}</textarea></div>
      <div class="lbl">Style</div><div class="styles">${AI_STYLES.map(([k, n]) => `<button class="chip ${S.aiStyle === k ? 'on' : ''}" data-aistyle="${k}">${n}</button>`).join('')}</div>
      <div style="height:12px"></div>
      ${ok ? `<button class="btn full chalk" data-a="aigen">${ico('ai')}Générer 2 propositions${cfg.credits !== null ? ' · 1 crédit' : ''}</button>`
        : cfg.mode === 'wp' ? `<div class="empty">La génération IA n'est pas activée sur ce site.</div>`
        : `<div class="empty">Ajoutez votre clé API OpenAI pour activer l'IA. Elle reste sur cet appareil.</div><div class="field" style="margin-top:10px"><input type="password" data-openai placeholder="sk-…"></div><button class="btn full" data-a="savekey">${ico('key')}Enregistrer la clé</button>`}
      ${S.aiImgs.length ? `<div class="lbl">Propositions <span>toucher pour placer</span></div><div class="ai-out">${S.aiImgs.map((u, i) => `<button data-aipick="${i}" style="background-image:url('${u}')" aria-label="Placer la proposition ${i + 1}"></button>`).join('')}</div>` : ''}
      <div style="height:14px"></div></div>`;
  }
  function pLayers() {
    const ls = [...engine.layers].reverse();
    const item = (L) => {
      const bm = engine.bitmaps.get(L.id);
      const th = L.type === 'image' ? `style="background-image:url('${L.src.startsWith('data:') && L.src.length > 200000 ? (bm?.toDataURL ? bm.toDataURL('image/png', 0.4) : L.src) : L.src}')"` : '';
      const dpi = engine.layerDpi(L);
      return `<div class="layer ${engine.selected === L.id ? 'on' : ''}">
        <div class="th" ${th}>${L.type === 'text' ? 'Aa' : ''}</div>
        <div class="nm" data-sel="${L.id}"><b>${esc(L.type === 'text' ? L.text : L.name)}</b><em class="${L.type === 'image' && dpi < 150 ? 'warn' : ''}">${sideLow(L.side)} · ${(L.w * 2.54).toFixed(1)} cm${L.type === 'image' ? ' · ' + dpi + ' dpi' : ''}</em></div>
        <button class="ib" data-up="${L.id}" title="Monter">${ico('up')}</button><button class="ib" data-down="${L.id}" title="Descendre">${ico('down')}</button>
        <button class="ib" data-vis="${L.id}" title="Afficher / masquer">${ico(L.visible ? 'eye' : 'eyeoff')}</button>
        <button class="ib" data-del="${L.id}" title="Supprimer">${ico('trash')}</button></div>`;
    };
    return `<div class="sec"><h2>Calques</h2><p class="lead">Le calque du haut s'imprime par-dessus les autres.</p>
      ${ls.length ? `<div class="layers">${ls.map(item).join('')}</div>` : `<div class="empty">Aucun calque. Ajoutez une image, un texte ou un motif IA.</div>`}
      <div style="height:14px"></div></div>`;
  }
  function pScene() {
    const bgs = [['#e9eef3', 'Studio'], ['#ffffff', 'Blanc'], ['#16201C', 'Nuit'], ['#29669d', 'Vethypro'], ['#dfe8f1', 'Ciel'], ['#e9d7c3', 'Lin'], ['#c9d6e3', 'Brume'], ['#111111', 'Noir']];
    return `<div class="sec"><h2>Scène</h2><p class="lead">Fond et éclairage des mockups exportés.</p>
      <div class="lbl">Fond</div><div class="swatches">${bgs.map(([h, n]) => `<button class="sw ${engine.bg.type !== 'transparent' && engine.bg.color === h ? 'on' : ''}" style="background:${h}" data-bg="${h}" title="${n}" aria-label="${n}"></button>`).join('')}</div>
      <div class="row" style="margin-top:10px"><button class="chip ${engine.bg.type === 'transparent' ? 'on' : ''}" data-bgt="transparent">Transparent</button><button class="chip ${engine.bg.type === 'gradient' ? 'on' : ''}" data-bgt="gradient">Dégradé</button><label class="chip" style="display:flex;align-items:center;gap:6px">Perso <input type="color" data-bgc value="${engine.bg.color}" style="width:22px;height:22px;padding:0;border:0"></label></div>
      <div class="field" style="margin-top:14px"><label>Exposition <span>${engine.renderer.toneMappingExposure.toFixed(2)}</span></label><input type="range" min="0.5" max="1.8" step="0.01" value="${engine.renderer.toneMappingExposure}" data-exposure></div>
      <div class="toggle"><span>Ombre au sol</span><input type="checkbox" data-shadow ${engine.floor.visible ? 'checked' : ''}></div>
      <div class="toggle"><span>Afficher la zone d'impression</span><input type="checkbox" data-guide ${engine.showGuide ? 'checked' : ''}></div>
      ${cfg.mode === 'standalone' ? `<div class="lbl">Modèle 3D (GLB)</div><p class="note">Remplacez le modèle de « ${esc(GARMENTS[engine.garmentId].name)} » par votre export CLO3D (.glb). Il reste sur cet appareil.</p>
      <div class="row"><label class="btn ghost" style="cursor:pointer">Importer un .glb<input type="file" accept=".glb,.gltf,model/gltf-binary" data-glb hidden></label>${engine.modelInfo() ? `<button class="btn ghost" data-a="rmglb">Retirer</button>` : ''}</div>
      ${engine.modelInfo() ? `<div class="field" style="margin-top:10px"><label>Rotation du modèle <span>${engine.modelInfo().rot || 0}°</span></label><input type="range" min="0" max="270" step="90" value="${engine.modelInfo().rot || 0}" data-glbrot></div>
      <div class="field"><label>Hauteur de la zone d'impression <span>${cmTxt(engine.modelInfo().dy || 0)} cm</span></label><input type="range" min="-6" max="6" step="0.25" value="${engine.modelInfo().dy || 0}" data-glbdy></div>` : ''}` : ''}
      <div style="height:14px"></div></div>`;
  }
  function pExport() {
    const sides = Object.keys(engine.g.printAreas).filter((s) => engine.layers.some((l) => l.side === s));
    const lk = wmOn() ? 'locked' : '';
    const passBox = wmOn()
      ? `<a class="passbar" href="${esc(passHref())}" target="_blank" rel="noopener" data-passlink><b>Pass Pro 3D · ${esc(cfg.passPrice || '20 DT')} <i>›</i></b><span>Exportez vos images, la vidéo 360° et les fichiers sans le filigrane « ${esc(cfg.watermarkText || 'VETHYPRO')} ».</span></a><button class="passcode" data-a="pass">J’ai déjà un code</button>`
      : (cfg.pass && cfg.pass.expires ? `<div class="passbar ok"><b>Pass Pro 3D actif</b><span>Sans filigrane jusqu’au ${esc(cfg.pass.expires)}.</span></div>` : '');
    return `<div class="sec"><h2>Exporter</h2><p class="lead">Fichiers d'impression et visuels pour vendre.</p>${passBox}
      <div class="lbl">Fichiers d'impression</div>
      ${sides.length ? sides.map((s) => { const A = engine.area(s); return `<button class="btn full ghost ${lk}" data-print="${s}" style="margin-bottom:8px;justify-content:space-between;height:auto;min-height:48px;padding:8px 14px"><span style="display:inline-flex;align-items:center;gap:8px;white-space:nowrap">${ico('export')}PNG ${sideLow(s)}</span><em style="font-style:normal;font-family:'JetBrains Mono';font-size:11px;color:var(--ink-2);text-align:right;line-height:1.4">${cmTxt(A.wIn)} × ${cmTxt(A.hIn)} cm · 300 dpi<br>${A.wIn * 300}×${A.hIn * 300} px</em></button>`; }).join('') : `<div class="empty">Ajoutez un motif pour obtenir un fichier d'impression.</div>`}
      <p class="note">PNG transparent, dimension exacte de la zone d'impression, position conservée — compatible Printful, Printify et sérigraphie.</p>
      <div class="lbl">Mockups</div>
      <div class="row"><button class="btn" data-a="mockup">${ico('image')}Image HD</button><button class="btn ghost ${lk}" data-a="colorset">Toutes couleurs</button></div>
      <div class="row" style="margin-top:8px"><button class="btn ghost ${lk}" data-a="video">${ico('play')}Vidéo 360°</button><button class="btn ghost" data-a="share">Partager</button></div>
      <div class="lbl">Pack couleurs</div>
      <div class="chips" data-colorpick>${COLORS.slice(0, 16).map(([n, h], i) => `<button class="sw ${S.setColors?.includes(i) ?? i < 6 ? 'on' : ''}" data-ci="${i}" style="width:26px;background:${h}" title="${n}"></button>`).join('')}</div>
      <div style="height:16px"></div></div>`;
  }
  async function pProjects() {
    let list = [];
    try { list = await store.list(); } catch (e) { return `<div class="sec"><h2>Projets</h2><div class="empty">${esc(e.message)}</div></div>`; }
    return `<div class="sec"><h2>Projets</h2><p class="lead">${cfg.mode === 'wp' && cfg.loggedIn ? 'Enregistrés dans votre compte.' : 'Enregistrés sur cet appareil.'}${cfg.mode === 'wp' && !cfg.loggedIn && cfg.loginUrl ? ` <a href="${esc(cfg.loginUrl)}">Connectez-vous</a> pour les retrouver partout.` : ''}</p>
      <div class="row" style="margin-bottom:12px"><button class="btn" data-a="new">Nouveau projet</button><button class="btn ghost" data-a="save">${ico('save')}Enregistrer</button></div>
      ${list.length ? `<div class="projects">${list.map((p) => `<div class="proj"><button data-open="${esc(p.id)}" style="display:block;width:100%;text-align:left"><img src="${esc(p.thumb || '')}" alt=""><div><b>${esc(p.name)}</b><em>${new Date(p.updated).toLocaleDateString('fr-FR')}</em></div></button><button class="ib del" data-pdel="${esc(p.id)}" title="Supprimer">${ico('trash')}</button></div>`).join('')}</div>` : `<div class="empty">Aucun projet enregistré pour l'instant.</div>`}
      <div style="height:14px"></div></div>`;
  }
  const selLayer = (type) => { const L = engine.layers.find((l) => l.id === engine.selected); return L && (!type || L.type === type) ? L : null; };

  /* ---------- actions ---------- */
  let pdfjs = null;
  async function pdfToCanvas(file) {
    if (!pdfjs) { const base = cfg.pdfjsBase || 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/'; pdfjs = await import(/* webpackIgnore: true */ new URL(base + 'pdf.min.mjs', location.href).href); pdfjs.GlobalWorkerOptions.workerSrc = new URL(base + 'pdf.worker.min.mjs', location.href).href; }
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const page = await doc.getPage(1); const v0 = page.getViewport({ scale: 1 }); const sc = 2400 / Math.max(v0.width, v0.height);
    const vp = page.getViewport({ scale: sc }); const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp, background: 'rgba(0,0,0,0)' }).promise;
    return c;
  }
  const thumbOf = (src) => { const c = document.createElement('canvas'); const k = 120 / Math.max(src.width || 1, src.height || 1); c.width = Math.max(1, Math.round((src.width || 1) * k)); c.height = Math.max(1, Math.round((src.height || 1) * k)); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); return c.toDataURL('image/png'); };
  async function placeImage(src, name, side) {
    if (side && engine.g.printAreas[side] && side !== engine.side) { engine.setSide(side); engine.setView(viewOf(side)); }
    const L = await engine.addImageLayer(src, { name, side });
    const bm = engine.bitmaps.get(L.id); L._an = bm ? analyzeImage(bm) : { photo: false };
    if (markOf(L.side) === 'embroidery' && L._an.photo) { engine.setMarking(L.side, 'print'); toast('Photo détectée : impossible de réaliser en broderie. Ce côté passe en impression.', true); }
    else if (L._an.opaque && !L._an.photo) toast('Astuce : « Retirer le fond » supprime le fond blanc du logo.');
    return L;
  }
  async function addFiles(files, side) {
    for (const f of files) {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      const isPdf = f.type === 'application/pdf' || ext === 'pdf' || ext === 'ai' || f.type === 'application/postscript' || f.type === 'application/illustrator';
      if (!(f.type || '').startsWith('image/') && !isPdf && !['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'].includes(ext)) { toast(`${f.name} : format non pris en charge (JPG, PNG, SVG, PDF ou AI).`, true); continue; }
      busy(true, 'Import de l’image…');
      try {
        let src;
        if (isPdf) {
          try { src = await pdfToCanvas(f); }
          catch (er) { throw new Error(ext === 'ai' ? 'ce fichier AI n’est pas lisible. Dans Illustrator, enregistrez-le avec « Créer un fichier compatible PDF », ou exportez-le en PDF ou PNG' : 'PDF illisible'); }
        } else src = await fileToDataURL(f);
        if (!isPdf && (f.type === 'image/svg+xml' || ext === 'svg')) { const im = await loadImage(src); const c = document.createElement('canvas'); const sc = 3000 / Math.max(im.width || 300, im.height || 300); c.width = (im.width || 300) * sc; c.height = (im.height || 300) * sc; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); src = c; }
        if (S.autoBg) { const im = src instanceof HTMLCanvasElement ? src : await loadImage(src); src = removeBackground(im, S.bgRemoveTol); }
        const name = f.name.replace(/\.\w+$/, '');
        const L = await placeImage(src, name, side);
        const bm = engine.bitmaps.get(L.id);
        if (!S.myImages.some((m) => m.src === L.src)) S.myImages.push({ name, src: L.src, thumb: bm ? thumbOf(bm) : L.src });
      } catch (e) { toast('Impossible de lire ' + f.name + (e && e.message ? ' : ' + e.message : ''), true); }
      busy(false);
    }
    if (S.tab === 'graphics') render();
  }
  async function newProduct() {
    $('.modal').classList.remove('show');
    engine.reset(); S.emb = {}; S.order = { lines: [], comment: '', staff: AT.lastStaff }; S.textDraft = ''; S.aiImgs = []; S.markSeen = false; S.section = null; S.pref = { gender: 'h', sleeve: 'ml' };
    S.project = { id: 'p' + Date.now(), name: 'Sans titre' }; setNameInputs('');
    engine.setColor(cfg.startColor || BLACK); await engine.setGarment(startId()); engine.setSide('front'); engine.setView('front');
    variantBar(); updatePrice(); setTab('garment');
    toast(ATELIER ? 'Nouveau produit : choisissez le modèle. La commande est conservée.' : 'Nouveau produit : choisissez le modèle. Votre panier est conservé.');
  }
  async function aiGenerate() {
    const prompt = (S.aiPrompt || '').trim(); if (prompt.length < 3) { toast('Décrivez le motif en quelques mots.', true); return; }
    const style = AI_STYLES.find((s) => s[0] === S.aiStyle);
    const full = `Isolated t-shirt print graphic, centered, no garment, no mockup, transparent background, high contrast, print-ready. Subject: ${prompt}. Style: ${style[2]}.`;
    busy(true, 'L’IA dessine votre motif… (20–60 s)');
    try {
      let imgs = [];
      if (cfg.mode === 'wp') {
        const r = await api(cfg.restUrl + '/ai/generate', { method: 'POST', body: JSON.stringify({ prompt: full }) });
        const j = await r.json(); if (!r.ok) throw new Error(j.message || 'Erreur IA');
        imgs = j.images; if (j.credits !== undefined) { cfg.credits = j.credits; const c = $('[data-credits]'); if (c) c.textContent = `◆ ${j.credits} crédits IA`; }
      } else {
        const key = localStorage.getItem(lsKey + 'openai');
        const r = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify({ model: localStorage.getItem(lsKey + 'model') || 'gpt-image-2', prompt: full, n: 2, size: '1024x1024', background: 'transparent', output_format: 'png' }) });
        const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || 'Erreur IA');
        imgs = j.data.map((d) => (d.b64_json ? 'data:image/png;base64,' + d.b64_json : d.url));
      }
      S.aiImgs = imgs; render(); toast('Touchez une proposition pour la placer.');
    } catch (e) { toast(e.message, true); }
    busy(false);
  }
  async function exportPrint(side) {
    busy(true, 'Préparation du fichier 300 DPI…');
    try { const r = await engine.exportPrintFile(side); dl(r.blob, `${slug()}-${FSLUG[side] || side}-${r.dpi}dpi.png`); toast(`Fichier ${r.w}×${r.h}px exporté (${r.dpi} DPI).`); } catch (e) { toast('Export impossible : ' + e.message, true); }
    busy(false); wmNudge('Le fichier d’impression');
  }
  const slug = () => (S.project.name || 'design').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design';
  async function saveProject(silent) {
    S.project.name = (S.project.name || '').trim() || 'Sans titre';
    const data = engine.serialize();
    const p = { ...S.project, ...data, name: S.project.name, thumb: await engine.thumbnail() };
    try { const saved = await store.save(p); S.project.id = saved.id; S.project.remoteId = saved.remoteId; if (!silent) toast(cfg.mode === 'wp' && !cfg.loggedIn ? 'Création enregistrée sur cet appareil (onglet Projets).' : 'Création enregistrée (onglet Projets).'); } catch (e) { toast(e.message, true); }
    if (S.tab === 'projects') render();
  }
  function autosave() { /* the studio always starts blank: nothing kept between visits */ }
  /* ---------- marquage : impression / broderie par face ---------- */
  var SIDE_FR = new Proxy({}, { get: (_, sd) => sideLabel(sd, ARTICLES[engine.garmentId]) }); // v3.3 : Devant, Dos, Manche gauche, Manche droite (ou Côté)
  var FSLUG = { front: 'devant', back: 'dos', left: 'gauche', right: 'droite' };
  const facesUsed = () => SIDE_KEYS.filter((sd) => engine.g.printAreas[sd] && engine.layers.some((l) => l.side === sd && l.visible !== false));
  const layerInfo = (L) => {
    if (L.type === 'image') {
      if (L._an === undefined) { const bm = engine.bitmaps.get(L.id); L._an = bm ? analyzeImage(bm) : { photo: false }; }
      return L._an.photo ? { ok: false, why: `« ${L.name} » est une photo ou contient des dégradés` } : { ok: true };
    }
    const bm = engine.bitmaps.get(L.id); const lines = String(L.text || '').split('\n').length;
    const hmm = bm ? textLineHeightMm(bm, L.w * 25.4, lines) : 99;
    return hmm < RATE.minTextMm ? { ok: false, why: `Texte « ${String(L.text).slice(0, 18)} » trop petit (${hmm.toFixed(1)} mm de haut, minimum ${RATE.minTextMm} mm)` } : { ok: true };
  };
  const faceCheck = (sd) => { const bad = engine.layers.filter((l) => l.side === sd && l.visible !== false).map(layerInfo).filter((r) => !r.ok); return { ok: !bad.length, why: bad.map((b) => b.why) }; };
  const markOf = (sd) => engine.marking[sd] || 'print';
  // stitch count per embroidered face (computed in the background, debounced)
  let embT = null;
  function refreshEmb(now) {
    clearTimeout(embT);
    const run = () => {
      for (const sd of SIDE_KEYS) {
        if (markOf(sd) !== 'embroidery' || !facesUsed().includes(sd)) { delete S.emb[sd]; continue; }
        try { const d = engine.digitizeSide(sd); S.emb[sd] = { stitches: Math.max(100, Math.round(d.stitches / 100) * 100), colors: d.colors, w: d.widthMm, h: d.heightMm, design: d }; } catch (e) { delete S.emb[sd]; }
      }
      updatePrice(); if (S.tab === 'marking' || S.tab === 'order') render();
    };
    if (now) run(); else embT = setTimeout(run, 450);
  }
  // the price rule: plain product + 4 DT per printed face; embroidery = programme (once) + per piece
  function marks() {
    const out = { perPiece: 0, setup: 0, lines: [] };
    for (const sd of facesUsed()) {
      if (markOf(sd) === 'embroidery') {
        const E = S.emb[sd]; const k = E ? E.stitches / 1000 : 0;
        out.perPiece += k * RATE.piece; out.setup += k * RATE.setup;
        out.lines.push({ side: sd, mode: 'embroidery', stitches: E ? E.stitches : null, piece: k * RATE.piece, setup: k * RATE.setup });
      } else { out.perPiece += RATE.print; out.lines.push({ side: sd, mode: 'print', piece: RATE.print }); }
    }
    return out;
  }
  const hasEmb = () => facesUsed().some((sd) => markOf(sd) === 'embroidery');
  function updatePrice() {
    const el = $('[data-price]'); if (!el) return; const A = shopArt();
    if (!A) { el.textContent = '—'; $('[data-pricesub]').textContent = 'indisponible'; return; }
    const M = marks(); el.textContent = (priceVaries(A) ? 'dès ' : '') + money(A.price + M.perPiece);
    $('[data-pricesub]').textContent = (hasEmb() ? 'estimé / pièce' : 'par pièce') + (M.setup ? ` + ${money(M.setup)}` : '');
    updateSteps();
  }
  function priceModal() {
    const A = shopArt(); if (!A) return;
    const M = marks();
    const row = (l, v, cls = '') => `<div class="prow ${cls}"><span>${l}</span><b>${v}</b></div>`;
    modal(`<h3>Détail du prix</h3><p class="lead" style="color:var(--ink-2);margin:0 0 10px">${esc(A.name)}</p>
      <div class="ptable">${row(priceVaries(A) ? 'Produit uni (plus petite taille)' : 'Produit uni', money(A.price))}
      ${M.lines.map((l) => l.mode === 'print' ? row(`Impression ${SIDE_FR[l.side].toLowerCase()}`, '+ ' + money(l.piece)) : row(`Broderie ${SIDE_FR[l.side].toLowerCase()}${l.stitches ? ` · ${l.stitches.toLocaleString('fr-FR')} points` : ''}`, '+ ' + money(l.piece))).join('')}
      ${row('Prix par pièce', money(A.price + M.perPiece), 'tot')}
      ${M.setup ? row('Programme de broderie (une seule fois)', money(M.setup), 'once') : ''}</div>
      ${hasEmb() ? `<p class="note">Broderie : ${money(RATE.setup)} les 1000 points pour créer le programme (payé une fois), puis ${money(RATE.piece)} les 1000 points par pièce brodée. Le nombre de points est estimé ; notre atelier le confirme avant la production.</p>` : ''}
      ${priceVaries(A) ? `<p class="note">Prix du produit uni selon la taille : ${A.sizes.map((z) => `${esc(z)} ${esc(money(sizePrice(A, z)))}`).join(' · ')}</p>` : ''}
      ${(SHOP.surcharge && Object.keys(SHOP.surcharge).length) ? `<p class="note">Supplément selon la taille : ${Object.entries(SHOP.surcharge).map(([z, v]) => `${esc(z)} +${esc(money(v))}`).join(' · ')}</p>` : ''}
      <div class="row" style="margin-top:12px"><button class="btn" data-close>Fermer</button></div>`);
  }
  function pMarking() {
    const used = facesUsed();
    const face = (sd) => {
      const has = used.includes(sd), chk = faceCheck(sd), m = markOf(sd), E = S.emb[sd];
      if (!engine.g.printAreas[sd]) return '';
      return `<div class="face ${has ? '' : 'empty'}"><div class="face-h"><b>${SIDE_FR[sd]}</b>${has ? '' : '<em>aucun marquage</em>'}</div>
        ${has ? `<div class="radio">
          <label class="${m === 'print' ? 'on' : ''}"><input type="radio" name="mk-${sd}" value="print" data-mark="${sd}" ${m === 'print' ? 'checked' : ''}><span><b>Impression</b><em>+ ${esc(money(RATE.print))} / pièce</em></span></label>
          <label class="${m === 'embroidery' ? 'on' : ''} ${chk.ok ? '' : 'off'}"><input type="radio" name="mk-${sd}" value="embroidery" data-mark="${sd}" ${m === 'embroidery' ? 'checked' : ''} ${chk.ok ? '' : 'disabled'}><span><b>Broderie</b><em>${chk.ok ? (m === 'embroidery' && E ? `${E.stitches.toLocaleString('fr-FR')} points estimés` : 'prix selon le nombre de points') : 'Impossible de réaliser en broderie'}</em></span></label>
        </div>
        ${chk.ok ? '' : `<p class="warnbox"><b>Impossible de réaliser en broderie.</b> ${chk.why.map(esc).join(' · ')}.</p>`}
        ${m === 'embroidery' && E ? `<div class="embsum">${NOPRICE ? `<span>Broderie estimée <b>${esc(String(E.stitches))} points</b></span>` : `<span>Programme (une fois) <b>${esc(money((E.stitches / 1000) * RATE.setup))}</b></span><span>Par pièce <b>+ ${esc(money((E.stitches / 1000) * RATE.piece))}</b></span>`}<button class="chip" data-a="embview" data-side="${sd}">Voir les points</button></div>` : ''}`
        : `<button class="chip" data-a="goface" data-face="${sd}">Ajouter un marquage ${sideAu(sd)}</button>`}</div>`;
    };
    return `<div class="sec"><h2><i class="stepn">3</i>Impression ou broderie ?</h2><p class="lead">Choisissez pour chaque face. Les textes et les logos aux couleurs unies peuvent être brodés ; les photos et les dégradés sont imprimés.</p>
      ${used.length ? SIDE_KEYS.map(face).join('') : `<div class="empty">Ajoutez d’abord un logo ou un texte, ou commandez le produit uni.</div>`}
      ${nextBtn('order', 'Étape 4 : tailles et quantités')}
      <div style="height:14px"></div></div>`;
  }
  function updateSteps() {
    const done = { 1: true, 2: engine.layers.length > 0, 3: S.markSeen && engine.layers.length > 0, 4: false };
    $$('[data-step]').forEach((b) => b.classList.toggle('done', !!done[b.dataset.step]));
  }

  /* ---------- commande (tailles × couleurs) ---------- */
  const shopArt = () => (SHOP ? SHOP.articles[engine.garmentId] : null);
  const hasBack = () => engine.layers.some((l) => l.side !== 'front' && l.visible !== false);
  const sizePrice = (A, z) => (A.sp && A.sp[z] !== undefined ? +A.sp[z] : A.price + ((SHOP.surcharge || {})[String(z).toUpperCase()] || 0));
  const priceVaries = (A) => !!A.sp && Object.values(A.sp).some((v) => +v !== +A.price);
  const unitPrice = (size) => { const A = shopArt(); if (!A) return 0; return sizePrice(A, size) + marks().perPiece; };
  function syncOrder() {
    const A = shopArt(), O = S.order;
    if (!A) return;
    if (O.article !== engine.garmentId) { O.article = engine.garmentId; O.lines.forEach((l) => { Object.keys(l.sizes).forEach((z) => { if (!A.sizes.includes(z)) delete l.sizes[z]; }); }); }
    if (!O.lines.length) O.lines.push({ color: engine.color.toLowerCase(), sizes: {} });
    if (A.sizes.length === 1 && O.lines.every((l) => !Object.keys(l.sizes).length) && O.lines.length === 1) { /* single size: preset nothing, user types qty */ }
  }
  const orderTotals = () => { let q = 0, t = 0; for (const l of S.order.lines) for (const [z, n] of Object.entries(l.sizes)) { if (n > 0) { q += n; t += n * unitPrice(z); } } const setup = q ? marks().setup : 0; return { q, t: t + setup, setup }; };
  function pOrder() {
    const A = shopArt();
    if (!A) return `<div class="sec"><h2>Commander</h2><div class="empty">« ${esc(GARMENTS[engine.garmentId].name)} » n'est pas disponible à la commande en ligne. Choisissez un autre article dans l'onglet Vêtement.</div></div>`;
    syncOrder();
    const sur = SHOP.surcharge || {};
    const sides = SIDE_KEYS.filter((sd) => engine.layers.some((l) => l.side === sd && l.visible !== false));
    const used = S.order.lines.map((l) => l.color);
    const free = PALETTE.filter(([, h]) => !used.includes(h.toLowerCase()));
    const line = (l, li) => `<div class="oline ${engine.color.toLowerCase() === l.color ? 'on' : ''}">
        <div class="oline-h"><button class="dot" data-oprev="${li}" style="background:${esc(l.color)}" title="Voir sur le modèle 3D"></button><b data-oprev="${li}">${esc(colorName(l.color))}</b>
        <small data-osub="${li}">${Object.values(l.sizes).reduce((a, n) => a + (n || 0), 0)} pcs</small>
        ${S.order.lines.length > 1 ? `<button class="ib" data-odel="${li}" title="Retirer cette couleur">${ico('x')}</button>` : ''}</div>
        <div class="sizes">${A.sizes.map((z) => `<label class="size ${l.sizes[z] > 0 ? 'has' : ''}"><span>${esc(z)}${sizePrice(A, z) > A.price ? `<i>+${esc(money(sizePrice(A, z) - A.price))}</i>` : (sur[String(z).toUpperCase()] ? `<i>+${esc(money(sur[String(z).toUpperCase()]))}</i>` : '')}</span><input type="number" inputmode="numeric" min="0" max="9999" step="1" placeholder="0" value="${l.sizes[z] || ''}" data-oq="${li}" data-oz="${esc(z)}" aria-label="Quantité ${esc(colorName(l.color))} taille ${esc(z)}"></label>`).join('')}</div></div>`;
    const T = orderTotals();
    return `<div class="sec"><h2><i class="stepn">4</i>Tailles et quantités</h2>
      <div class="order-head">${sil(engine.garmentId)}<div><b>${esc(A.name)}</b><em ${NOPRICE ? 'hidden' : ''}>${priceVaries(A) ? 'dès ' : ''}${esc(money(A.price + marks().perPiece))} / pièce${hasEmb() ? ' (estimé)' : ''}</em><em>${sides.length ? sides.map((x) => `${SIDE_FR[x]} : ${markOf(x) === 'embroidery' ? 'broderie' : 'impression'}`).join(' · ') : 'Produit uni, sans marquage'}</em>${trimSummary().length ? `<em>${trimSummary().map((t) => `${t.label} ${esc(t.name)}`).join(' · ')}</em>` : ''}</div></div>
      <div class="lbl">Quantité par taille et par couleur</div>
      ${S.order.lines.map(line).join('')}
      ${free.length ? (S.addingColor ? `<div class="picker"><div class="lbl" style="margin-top:0">Ajouter une couleur <button class="ib" data-a="ocancel">${ico('x')}</button></div><div class="swatches">${free.map(([n, h]) => `<button class="sw" style="background:${h}" data-oadd="${h}" title="${esc(n)}" aria-label="${esc(n)}"></button>`).join('')}</div></div>` : `<button class="addcolor" data-a="oaddcolor">${ico('plus')} Ajouter une autre couleur</button>`) : ''}
      ${nameBlock()}
      ${ATELIER ? staffBlock() : ''}
      <div class="lbl">Commentaire</div>
      <div class="field"><textarea data-ocomment rows="3" maxlength="1000" placeholder="Ex. : prénoms au dos, date de livraison souhaitée…">${esc(S.order.comment)}</textarea></div>
      <div class="osum">${SHOP.minQty > 1 ? `<p class="omin" data-omin ${T.q >= SHOP.minQty ? 'hidden' : ''}>Minimum ${SHOP.minQty} pièces par commande.</p>` : ''}
        <div class="osum-row small" data-osetup ${T.setup && !NOPRICE ? '' : 'hidden'}><span>dont programme de broderie (une fois)</span><span data-osetupv>${esc(money(T.setup))}</span></div>
        <div class="osum-row"><span data-oq-total>${T.q} pièce${T.q > 1 ? 's' : ''}</span><b data-ot-total>${NOPRICE ? '' : esc(money(T.t)) + (hasEmb() ? ' <small>estimé</small>' : '')}</b></div>
        <button class="btn full big" data-a="cart" ${T.q < 1 ? 'disabled' : ''}>${ico('cart')}${ATELIER ? 'Ajouter à la commande' : 'Ajouter au panier'}</button>
        ${ATELIER && AT.items.length ? `<button class="btn ghost full" data-a="atlist" style="margin-top:8px">Voir la commande (${AT.items.length} produit${AT.items.length > 1 ? 's' : ''}) · Générer le PDF</button>` : ''}</div>
      </div>`;
  }
  function refreshTotals() {
    const T = orderTotals(), b = $('.pbody');
    const q = b.querySelector('[data-oq-total]'); if (q) q.textContent = `${T.q} pièce${T.q > 1 ? 's' : ''}`;
    const t = b.querySelector('[data-ot-total]'); if (t) t.innerHTML = NOPRICE ? '' : esc(money(T.t)) + (hasEmb() ? ' <small>estimé</small>' : '');
    const so = b.querySelector('[data-osetup]'); if (so) { so.hidden = !T.setup || NOPRICE; b.querySelector('[data-osetupv]').textContent = money(T.setup); }
    const m = b.querySelector('[data-omin]'); if (m) m.hidden = T.q >= SHOP.minQty;
    const btn = b.querySelector('[data-a=cart]'); if (btn) btn.disabled = T.q < 1;
    S.order.lines.forEach((l, i) => { const e = b.querySelector(`[data-osub="${i}"]`); if (e) e.textContent = Object.values(l.sizes).reduce((a, n) => a + (n || 0), 0) + ' pcs'; });
  }
  const blobToDataURL = (b) => fileToDataURL(b);
  async function jpegMockup(size) {
    const png = await engine.exportMockup(size, { clean: true }); const im = await loadImage(URL.createObjectURL(png));
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0);
    return c.toDataURL('image/jpeg', 0.86);
  }
  // v2.4.0 : données de la fiche technique (vues devant/dos, motifs détourés, cotes en cm)
  async function viewShot(side, size) {
    engine.tween = null; engine.setView(viewOf(side), false);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return jpegMockup(size);
  }
  async function artPreview(side) {
    const A = engine.area(side); const dpi = Math.max(40, Math.min(80, Math.floor(900 / Math.max(A.wIn, A.hIn))));
    const r = await engine.exportPrintFile(side, dpi, { clean: true }); const im = await loadImage(URL.createObjectURL(r.blob));
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data; let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let i = 0; i < c.width; i++) if (d[(y * c.width + i) * 4 + 3] > 12) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    const pad = 2, w = x1 - x0 + 1, h = y1 - y0 + 1, o = document.createElement('canvas'); o.width = w + pad * 2; o.height = h + pad * 2;
    o.getContext('2d').drawImage(c, x0, y0, w, h, pad, pad, w, h);
    const ppc = r.w / (A.wIn * 2.54); // px par cm
    return { img: o.toDataURL('image/png'), wCm: +(w / ppc).toFixed(1), hCm: +(h / ppc).toFixed(1), xCm: +(x0 / ppc).toFixed(1), yCm: +(y0 / ppc).toFixed(1), zoneW: +(A.wIn * 2.54).toFixed(1), zoneH: +(A.hIn * 2.54).toFixed(1) };
  }
  function sheetSpec() {
    const out = {};
    for (const sd of facesUsed()) {
      const A = engine.area(sd);
      out[sd] = { mode: markOf(sd), stitches: S.emb[sd] ? S.emb[sd].stitches : null, layers: engine.layers.filter((l) => l.side === sd && l.visible !== false).map((L) => {
        const w = L.w * 2.54, h = L.w * (L.ar || 1) * 2.54;
        return { type: L.type, label: L.type === 'text' ? String(L.text || '').slice(0, 60) : String(L.name || 'Logo').slice(0, 60), font: L.type === 'text' ? L.font : '', color: L.type === 'text' ? L.color : '',
          w: +w.toFixed(1), h: +h.toFixed(1), dx: +((L.x - A.wIn / 2) * 2.54).toFixed(1), top: +((L.y * 2.54) - h / 2).toFixed(1), rot: Math.round(L.rot || 0) };
      }) };
    }
    return out;
  }
  const fitLabel = () => { const a = ARTICLES[engine.garmentId] || {}; const g = a.gender === 'h' ? 'Homme' : a.gender === 'f' ? 'Femme' : 'Mixte'; const sl = a.sleeve === 'ml' ? 'manches longues' : a.sleeve === 'mc' ? 'manches courtes' : ''; return g + (sl ? ' · ' + sl : ''); };
  const collectionLabel = () => { const a = ARTICLES[engine.garmentId] || {}; return [a.group, a.familyLabel].filter(Boolean).join(' · '); };
  async function addToCart() {
    const A = shopArt();
    if (!A) { toast('Cet article n’est pas disponible à la commande.', true); return; }
    const T = orderTotals();
    if (T.q < 1) { toast('Indiquez au moins une quantité.', true); return; }
    if (T.q < (SHOP.minQty || 1)) { toast(`Commande minimum : ${SHOP.minQty} pièces.`, true); return; }
    const lines = S.order.lines.map((l) => ({ color: l.color, colorName: colorName(l.color), sizes: Object.fromEntries(Object.entries(l.sizes).filter(([, n]) => n > 0)) })).filter((l) => Object.keys(l.sizes).length);
    const keep = engine.color, sel = engine.selected;
    busy(true, 'Préparation des fichiers d’impression…');
    try {
      engine.select(null);
      const files = {};
      for (const sd of Object.keys(engine.g.printAreas)) if (engine.layers.some((l) => l.side === sd && l.visible !== false)) { const r = await engine.exportPrintFile(sd, 300, { clean: true }); files[sd] = await blobToDataURL(r.blob); }
      const mockups = {}, views = {};
      const camP = engine.camera.position.clone(), camT = engine.controls.target.clone(), keepSide = engine.side;
      const hasBackZone = !!engine.g.printAreas.back;
      const sideUsed = ['left', 'right'].filter((sd) => facesUsed().includes(sd)); // v3.3 : vues des manches marquées
      try {
        for (const [i, l] of lines.entries()) {
          busy(true, `Aperçu ${i + 1}/${lines.length} : ${l.colorName}…`); engine.setColor(l.color);
          const v = { front: await viewShot('front', 800) };
          if (hasBackZone) v.back = await viewShot('back', 800);
          for (const sd of sideUsed) v[sd] = await viewShot(sd, 600);
          views[l.color] = v; mockups[l.color] = v.front;
        }
      } finally { engine.setColor(keep); engine.camera.position.copy(camP); engine.controls.target.copy(camT); engine.controls.update(); if (keepSide !== engine.side) engine.setSide(keepSide); }
      busy(true, 'Préparation de la fiche technique…');
      const art = {};
      for (const sd of facesUsed()) { try { const a = await artPreview(sd); if (a) art[sd] = a; } catch (er) { /* aperçu facultatif */ } }
      busy(true, 'Ajout au panier…');
      const marking = {}, emb = {};
      for (const sd of facesUsed()) {
        marking[sd] = markOf(sd);
        if (marking[sd] === 'embroidery') {
          busy(true, 'Préparation du fichier de broderie…');
          const d = engine.digitizeSide(sd); const st = Math.max(100, Math.round(d.stitches / 100) * 100);
          const dst = toDST(d, ('UNIF ' + A.name).toUpperCase());
          let bin = ''; for (let i = 0; i < dst.length; i += 0x8000) bin += String.fromCharCode.apply(null, dst.subarray(i, i + 0x8000));
          emb[sd] = { stitches: st, colors: d.colors, w: Math.round(d.widthMm), h: Math.round(d.heightMm), dst: btoa(bin), preview: stitchPreview(d, 700).toDataURL('image/png') };
        }
      }
      const originals = [...new Set(engine.layers.filter((l) => l.type === 'image' && typeof l.src === 'string' && /^data:image\/(png|jpeg);/.test(l.src) && l.src.length < 12e6).map((l) => l.src))].slice(0, 6);
      const body = { article: engine.garmentId, name: S.project.name === 'Sans titre' ? '' : S.project.name, design: engine.serialize(), lines, comment: S.order.comment, files, mockups, marking, emb, originals, views, art, spec: sheetSpec(), fit: fitLabel(), collection: collectionLabel(), trims: trimSummary() };
      if (ATELIER) { await atAdd(body, A, T); return; }
      const r = await api(cfg.restUrl + '/cart', { method: 'POST', body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message || 'Erreur panier (' + r.status + ')');
      busy(false);
      try { document.dispatchEvent(new CustomEvent('patron-studio:added', { detail: j })); } catch (er) { /* old browsers */ }
      S.order.lines = []; S.order.comment = '';
      S.cartCount = j.cart_count || S.cartCount + (j.added || 0); const cc = $('[data-cartc]'); if (cc) { cc.hidden = !S.cartCount; $('[data-cartn]').textContent = S.cartCount; }
      modal(`<div class="added"><div class="ok">${ico('check')}</div><h3>Produit ajouté au panier</h3>
        <p style="color:var(--ink-2);margin:0 0 4px">${esc(A.name)} : ${j.added} pièce${j.added > 1 ? 's' : ''} · ${esc(j.price_html || '')}</p>
        <p style="color:var(--ink-2);margin:0 0 16px;font-size:13px">Votre panier contient ${S.cartCount} pièce${S.cartCount > 1 ? 's' : ''}. Vos fichiers sont joints à la commande.</p>
        <p style="margin:0 0 10px;font-weight:600">Souhaitez-vous ajouter un autre produit ?</p>
        <div class="col"><button class="btn big" data-a="newproduct">${ico('plus')}Oui, créer un autre produit</button>
        <a class="btn ghost big" style="text-decoration:none" href="${esc(j.cart_url)}">Non, voir mon panier et payer</a></div></div>`);    } catch (e) { engine.setColor(keep); busy(false); toast(e.message, true); }
    if (sel && engine.layers.some((l) => l.id === sel)) engine.select(sel);
  }

  /* ---------- v3 atelier : commande locale → un seul PDF de fiches techniques ----------
   * v3.2 : n° de commande automatique, n° de bon de commande client, dates au calendrier, staff par produit,
   *        avances (avec reçu PDF), commande enregistrée dans la Gestion (BL, factures). */
  const DESK = window.uniformDesktop || null;
  const G = gset(cfg);
  const newOrder = () => ({ id: '', number: '', clientPO: '', client: '', clientId: '', date: isoToday(), delivery: '', printBox: (cfg.atelier && cfg.atelier.printBox) || 'flex', advances: [], note: '' });
  const AT = { items: [], order: newOrder(), lastStaff: undefined };
  try {
    const o = JSON.parse(localStorage.getItem(lsKey + 'atelier-order') || 'null');
    if (o && o.v === 32) Object.assign(AT.order, o.order || {});
    else if (o) { if (o.client) AT.order.client = o.client; if (o.printBox) AT.order.printBox = o.printBox; } // ancienne version : on garde client et case
  } catch (e) { /* */ }
  const atSaveOrder = () => { try { localStorage.setItem(lsKey + 'atelier-order', JSON.stringify({ v: 32, order: AT.order })); } catch (e) { /* */ } };
  const atCount = () => { S.cartCount = AT.items.length; const n = $('[data-cartn]'); if (n) { n.hidden = !AT.items.length; n.textContent = AT.items.length; } };
  const catE = (id) => ((cfg.catalog || []).find((x) => x.id === id) || {});
  const atTotal = () => r3(AT.items.reduce((s, p) => s + (p.total || 0), 0));
  const atPaid = () => advancesTotal(AT.order);
  async function atAdd(body, A, T) {
    const a = ARTICLES[body.article] || {};
    const unit = {}; for (const z of A.sizes) unit[z] = r3(unitPrice(z));
    const p = {
      uid: gid(), article: body.article, design: body.design, garment: A.name || a.name, name: body.name, fit: body.fit, collection: body.collection, sizes: A.sizes, comment: body.comment,
      staff: S.order.staff ?? AT.lastStaff ?? DEFSTAFF(),
      tissu: (catE(body.article).tissu || ''), compo: (catE(body.article).compo || ''),
      marks: Object.fromEntries(Object.entries(body.marking).map(([sd, m]) => [sd, { mode: m, stitches: body.emb[sd] ? body.emb[sd].stitches : null }])),
      art: Object.fromEntries(Object.entries(body.art).map(([sd, v]) => [sd, { ...v, img: body.marking[sd] === 'embroidery' && body.emb[sd] ? body.emb[sd].preview : v.img }])),
      spec: body.spec, trims: body.trims || [], sideNames: (ARTICLES[body.article] || {}).sideNames || 'manches',
      colors: body.lines.map((l) => ({ name: l.colorName, hex: l.color, q: l.sizes, views: body.views[l.color] || {} })),
      files: body.files, dst: Object.fromEntries(Object.entries(body.emb).map(([sd, e]) => [sd, e.dst])), thumb: body.mockups[body.lines[0].color],
      unit, setup: r3(T.setup || 0), total: r3(T.t),
    };
    p.qty = p.colors.reduce((n, c) => n + Object.values(c.q).reduce((x, y) => x + y, 0), 0);
    AT.lastStaff = p.staff;
    AT.items.push(p); atCount(); busy(false);
    S.order.lines = []; S.order.comment = '';
    modal(`<div class="added"><div class="ok">${ico('check')}</div><h3>Produit ajouté à la commande</h3>
      <p style="color:var(--ink-2);margin:0 0 14px">${esc(p.garment)}${p.staff ? ' · staff ' + esc(p.staff) : ''} : ${p.qty} pièce${p.qty > 1 ? 's' : ''} · ${p.colors.length} couleur${p.colors.length > 1 ? 's' : ''}${NOPRICE ? '' : ' · ' + esc(money(p.total))}. La commande contient ${AT.items.length} produit${AT.items.length > 1 ? 's' : ''}.</p>
      <div class="col"><button class="btn big" data-a="newproduct">${ico('plus')}Ajouter un autre produit</button>
      <button class="btn ghost big" data-a="atlist">Terminer : générer le PDF des fiches</button></div></div>`);
  }
  const staffSel = (i, v) => { const L = STAFF(); return `<select class="atl-staff" data-atstaff="${i}" aria-label="Staff">${`<option value="">— Staff —</option>`}${L.map((x) => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('')}${v && !L.includes(v) ? `<option selected>${esc(v)}</option>` : ''}<option value="__autre">Autre staff…</option></select>`; };
  async function atList() {
    const o = AT.order, n = AT.items.length, pages = AT.items.reduce((k, p) => k + p.colors.length, 0);
    const autoNo = o.number || (DESK && DESK.db ? await peekNumber(DESK, cfg, 'order', o.date) : '');
    const db = DESK && DESK.db ? await DESK.db.get() : { clients: [] };
    const tot = atTotal(), paid = atPaid();
    const advRows = (o.advances || []).map((a, i) => `<div class="adv-r"><span>${esc(isoToFr(a.date))}</span><b>${esc(money(a.amount))}</b><span>${esc(a.mode)}${a.ref ? ' · ' + esc(a.ref) : ''}</span><small>${a.receipt ? esc(a.receipt) : ''}</small>
        ${a.receipt && DESK && DESK.docs ? `<button class="ib" data-advpdf="${i}" title="Reçu PDF">${ico('doc')}</button>` : ''}<button class="ib" data-advdel="${i}" title="Supprimer cette avance">${ico('x')}</button></div>`).join('');
    const d = modal(`<div class="atl"><h3 style="margin:0 0 4px">Commande · fiches techniques</h3>
      <p class="lead" style="color:var(--ink-2);margin:0 0 12px">Un seul PDF : une fiche par produit et par couleur. La commande est enregistrée dans la Gestion (avances, BL, factures).</p>
      <div class="grid3">
        <div class="field"><label class="lbl" style="margin:0">N° de commande <em class="auto">automatique</em></label><input type="text" value="${esc(autoNo)}" readonly class="ro" title="Numéro attribué automatiquement (Paramètres › Société & factures pour la numérotation)"></div>
        <div class="field"><label class="lbl" style="margin:0">N° bon de commande client</label><input type="text" data-ato="clientPO" value="${esc(o.clientPO)}" placeholder="Ex. : BC-2026-118" maxlength="40"></div>
        <div class="field"><label class="lbl" style="margin:0">Client</label><input type="text" data-ato="client" value="${esc(o.client)}" placeholder="Société - Nom du contact" list="atl-clients" autocomplete="off"><datalist id="atl-clients">${(db.clients || []).map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist></div>
      </div>
      <div class="grid3">
        <div class="field"><label class="lbl" style="margin:0">Date de création</label><input data-date data-ato="date" value="${esc(o.date)}" required></div>
        <div class="field"><label class="lbl" style="margin:0">Livraison voulue par le client</label><input data-date data-ato="delivery" value="${esc(o.delivery)}" data-min="${esc(o.date)}"></div>
        <div class="field"><label class="lbl" style="margin:0">Case « Impression »</label><select data-ato="printBox">${[['flex', 'FLEX'], ['serigraphie', 'SÉRIGRAPHIE'], ['sublimation', 'SUBLIMATION'], ['none', 'Aucune']].map(([k, l]) => `<option value="${k}" ${o.printBox === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
      <div class="lbl">Produits (${n})</div>
      ${n ? `<div class="atl-items">${AT.items.map((p, i) => `<div class="atl-it"><img src="${esc(p.thumb || '')}" alt=""><div><b>${i + 1}. ${esc(p.name || p.garment)}</b><small>${esc(p.garment)} · ${p.colors.map((c) => esc(c.name)).join(', ')} · ${p.qty} pcs${NOPRICE ? '' : ' · ' + esc(money(p.total || 0))}</small></div>
        ${staffSel(i, p.staff)}<button class="ib" data-atup="${i}" title="Monter" ${i ? '' : 'disabled'}>↑</button><button class="ib" data-atdel="${i}" title="Retirer">${ico('x')}</button></div>`).join('')}</div>`
        : `<div class="empty">Aucun produit. Créez un produit puis « Ajouter à la commande » (étape 4).</div>`}
      ${NOPRICE ? '' : `<div class="adv">
        <div class="adv-h"><b>${ico('coin')} Avances</b><span>Total commande <b>${esc(money(tot))}</b> · Avances <b>${esc(money(paid))}</b> · Reste <b class="${tot - paid > 0.0005 ? 'due' : 'okk'}">${esc(money(Math.max(0, tot - paid)))}</b></span></div>
        ${advRows ? `<div class="adv-l">${advRows}</div>` : ''}
        <div class="adv-f">
          <input type="number" min="0" step="0.001" data-advamt placeholder="Montant" aria-label="Montant de l’avance">
          <select data-advmode aria-label="Mode de paiement">${G.paymentModes.map((m) => `<option>${esc(m)}</option>`).join('')}</select>
          <input data-date data-advdate value="${isoToday()}" required aria-label="Date de l’avance">
          <input type="text" data-advref placeholder="N° chèque / virement" maxlength="40" aria-label="Référence">
          <button class="btn" data-a="advadd" ${n ? '' : 'disabled'}>${ico('plus')}Ajouter l’avance</button>
          ${tot > 0 ? `<span class="adv-q">${[30, 50].map((k) => `<button class="chip" data-advpct="${k}">${k} %</button>`).join('')}</span>` : ''}
        </div>
      </div>`}
      <div class="row" style="margin-top:14px;gap:8px;flex-wrap:wrap"><button class="btn big" data-a="atpdf" ${n ? '' : 'disabled'}>${ico('export')}Générer le PDF${pages ? ` · ${pages} fiche${pages > 1 ? 's' : ''}` : ''}</button>
      <button class="btn ghost" data-a="atfiles" ${n ? '' : 'disabled'}>Fichiers atelier (.zip)</button>
      ${DESK && DESK.db ? `<button class="btn ghost" data-a="atsave" ${n ? '' : 'disabled'}>Enregistrer dans la Gestion</button>` : ''}<button class="btn ghost" data-close>Continuer</button></div>
      ${n || o.id ? `<p class="note" style="margin-top:10px">${o.id ? `Commande enregistrée dans la Gestion. ` : ''}<button class="linkbtn" data-a="atclear">Nouvelle commande (vider la liste)</button></p>` : ''}</div>`);
    $('.modal').classList.add('wide', 'xwide');
    attachDatePickers(root);
    d.querySelectorAll('[data-ato]').forEach((i) => { const ev = i.matches('[data-date]') || i.tagName === 'SELECT' ? 'change' : 'input'; i.addEventListener(ev, () => {
      o[i.dataset.ato] = i.matches('[data-date]') ? i.dataset.iso : i.value; atSaveOrder();
      if (i.dataset.ato === 'date') { const dl = d.querySelector('[data-ato="delivery"]'); dl.dataset.min = o.date; if (o.delivery && o.delivery < o.date) { o.delivery = ''; dl.dataset.iso = ''; dl.value = ''; atSaveOrder(); } }
    }); });
    d.querySelectorAll('[data-atstaff]').forEach((sel) => sel.addEventListener('change', () => { const it = AT.items[+sel.dataset.atstaff]; if (sel.value === '__autre') { sel.value = it.staff || ''; askStaff(sel, (v) => { it.staff = v; AT.lastStaff = v; const o = document.createElement('option'); o.textContent = v; o.selected = true; sel.insertBefore(o, sel.lastElementChild); }); return; } it.staff = sel.value; AT.lastStaff = sel.value; }));
    d.onclick = async (e) => {
      const t = e.target.closest('button'); if (!t) return; const ds = t.dataset;
      if (ds.atdel !== undefined) { if (!confirm('Retirer ce produit de la commande ?')) return; AT.items.splice(+ds.atdel, 1); atCount(); atList(); }
      else if (ds.atup !== undefined) { const i = +ds.atup; [AT.items[i - 1], AT.items[i]] = [AT.items[i], AT.items[i - 1]]; atList(); }
      else if (ds.advpct !== undefined) { d.querySelector('[data-advamt]').value = r3(atTotal() * (+ds.advpct) / 100); }
      else if (ds.a === 'advadd') await advAdd(d);
      else if (ds.advdel !== undefined) { const a = o.advances[+ds.advdel]; if (!confirm(`Supprimer l’avance de ${money(a.amount)} du ${isoToFr(a.date)} ?${a.receipt ? `\nLe reçu ${a.receipt} sera annulé.` : ''}`)) return; o.advances.splice(+ds.advdel, 1); atSaveOrder(); if (o.id) await atPersist(true); atList(); }
      else if (ds.advpdf !== undefined) await advReceipt(o.advances[+ds.advpdf]);
      else if (ds.a === 'atpdf') atPDF();
      else if (ds.a === 'atfiles') atFiles();
      else if (ds.a === 'atsave') { if (await atPersist()) { toast(`Commande ${AT.order.number} enregistrée dans la Gestion.`); atList(); } }
      else if (ds.a === 'atclear') {
        if (!confirm(o.id ? 'Commencer une nouvelle commande ? La commande actuelle reste enregistrée dans la Gestion.' : 'Vider la commande en cours ?')) return;
        AT.items = []; AT.order = newOrder(); atSaveOrder(); atCount(); atList();
      }
      else if (ds.a === 'newproduct') newProduct();
    };
  }
  async function advAdd(d) {
    const amt = r3(+d.querySelector('[data-advamt]').value || 0);
    if (!(amt > 0)) { toast('Indiquez le montant de l’avance.', true); return; }
    const tot = atTotal(), paid = atPaid();
    if (tot > 0 && paid + amt > tot + 0.0005 && !confirm(`Le total des avances (${money(paid + amt)}) dépasse le montant de la commande (${money(tot)}). Continuer ?`)) return;
    const a = { id: gid(), date: d.querySelector('[data-advdate]').dataset.iso || isoToday(), amount: amt, mode: d.querySelector('[data-advmode]').value, ref: d.querySelector('[data-advref]').value.trim(), receipt: '' };
    if (DESK && DESK.db) a.receipt = await nextNumber(DESK, cfg, 'receipt', a.date);
    AT.order.advances.push(a); atSaveOrder();
    if (DESK && DESK.db) await atPersist(true);
    toast(`Avance de ${money(amt)} enregistrée${a.receipt ? ' · reçu ' + a.receipt : ''}.`);
    atList();
  }
  async function advReceipt(a) {
    try {
      if (!AT.order.id) await atPersist(true);
      busy(true, 'Préparation du reçu…');
      const db = await DESK.db.get(), ord = db.orders.find((x) => x.id === AT.order.id);
      const bytes = await buildReceipt(cfg.company || {}, ord, a); busy(false);
      await DESK.docs.save('factures', `Recu ${a.receipt} - ${ord.client.name || ''}`, bytes);
    } catch (e) { busy(false); toast('Reçu impossible : ' + e.message, true); }
  }
  /** Enregistre (ou met à jour) la commande dans la Gestion. Attribue le numéro automatique à la 1re fois. */
  async function atPersist(quiet) {
    if (!DESK || !DESK.db) return false;
    const o = AT.order;
    if (!String(o.client || '').trim()) { if (!quiet) toast('Indiquez le client de la commande.', true); else toast('Indiquez le client : la commande sera enregistrée dans la Gestion ensuite.', true); return false; }
    try {
      const c = await ensureClient(DESK, o.client); o.clientId = c.id;
      if (!o.number) o.number = await nextNumber(DESK, cfg, 'order', o.date);
      const db = await DESK.db.get(); const prev = o.id ? db.orders.find((x) => x.id === o.id) : null;
      const studioLines = linesFromItems(AT.items);
      const keep = prev ? (prev.lines || []).filter((l) => l.src !== 'studio') : []; // lignes ajoutées à la main dans la Gestion
      const rec = { ...(prev || {}), id: o.id || undefined, number: o.number, clientPO: o.clientPO, client: clientSnap(c), date: o.date, delivery: o.delivery, printBox: o.printBox,
        lines: [...studioLines, ...keep], advances: o.advances, products: AT.items.map((p) => ({ uid: p.uid, article: p.article, garment: p.garment, name: p.name, staff: p.staff, qty: p.qty, total: p.total, marks: p.marks, thumb: p.thumb && p.thumb.length < 120000 ? p.thumb : '' })), status: (prev && prev.status) || 'en_cours' };
      rec.total = orderTotal(rec);
      const saved = await DESK.db.put('orders', rec); o.id = saved.id; atSaveOrder();
      return true;
    } catch (e) { toast('Enregistrement impossible : ' + e.message, true); return false; }
  }
  const atSlug = () => ('fiches-techniques-' + (AT.order.number || new Date().toISOString().slice(0, 10)) + (AT.order.client ? '-' + AT.order.client : '')).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  async function atSave(bytes, name, mime) {
    if (DESK && DESK.saveFile) { const r = await DESK.saveFile(name, bytes); if (r && r.path) { toast('Enregistré : ' + r.path); return; } if (r && r.canceled) return; }
    dl(new Blob([bytes], { type: mime }), name);
  }
  async function atPDF() {
    if (!AT.items.length) return;
    if (DESK && DESK.db) { if (!(await atPersist())) return; }
    else if (!AT.order.number) AT.order.number = 'CMD-' + isoToday().replace(/-/g, '');
    const noStaff = AT.items.filter((p) => !p.staff).length;
    if (noStaff && STAFF().length && !confirm(`${noStaff} produit${noStaff > 1 ? 's n’ont' : ' n’a'} pas de staff : la case « Service / Staff » restera vide. Générer quand même ?`)) return;
    busy(true, 'Préparation des fiches techniques…');
    try {
      const tplUrl = (cfg.atelier && cfg.atelier.template) || 'fiche-technique-modele.pdf';
      const tpl = await (await fetch(tplUrl)).arrayBuffer();
      const o = AT.order, tot = atTotal(), paid = atPaid();
      const order = { ...o, date: isoToFr(o.date), delivery: isoToFr(o.delivery), advance: G.showAdvanceOnSheet && paid > 0 ? { paid: money(paid), total: money(tot), rest: money(Math.max(0, tot - paid)) } : null };
      const bytes = await buildSheetsPDF(tpl, order, AT.items, (m) => busy(true, m));
      busy(false); await atSave(bytes, atSlug() + '.pdf', 'application/pdf');
      atList();
    } catch (e) { busy(false); toast('PDF impossible : ' + e.message, true); }
  }
  async function atFiles() {
    busy(true, 'Préparation des fichiers atelier…');
    try {
      const files = [];
      for (const [i, p] of AT.items.entries()) {
        const base = String(i + 1).padStart(2, '0') + '-' + (p.article || 'produit');
        for (const [sd, u] of Object.entries(p.files || {})) files.push({ name: `${base}-${p.marks[sd] && p.marks[sd].mode === 'embroidery' ? 'motif' : 'impression'}-${FSLUG[sd] || sd}-300dpi.png`, blob: await (await fetch(u)).blob() });
        for (const [sd, b64] of Object.entries(p.dst || {})) { const bin = atob(b64), a = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) a[k] = bin.charCodeAt(k); files.push({ name: `${base}-broderie-${FSLUG[sd] || sd}.dst`, blob: new Blob([a]) }); }
      }
      const zip = await makeZip(files); busy(false);
      await atSave(new Uint8Array(await zip.arrayBuffer()), atSlug().replace('fiches-techniques', 'fichiers-atelier') + '.zip', 'application/zip');
    } catch (e) { busy(false); toast('Fichiers impossibles : ' + e.message, true); }
  }
  // v3.2 : paramètres enregistrés dans l'autre fenêtre → le studio recharge le catalogue sans perdre la commande
  if (DESK && DESK.onNotify) DESK.onNotify(async (ch) => {
    if (ch !== 'catalogue-saved') return;
    try {
      const c = await (await fetch('catalogue.json', { cache: 'no-store' })).json();
      for (const k of ['staff', 'sections', 'families', 'company', 'gestion', 'shop', 'catalog', 'models']) if (c[k] !== undefined) cfg[k] = c[k];
      Object.assign(G, gset(cfg));
      if (Array.isArray(cfg.sections) && cfg.sections.length) setSections(cfg.sections);
      toast('Paramètres mis à jour : le staff, les sections et la société sont appliqués. Redémarrez le studio (Affichage › Recharger) pour les nouveaux produits et prix — pensez à générer la commande avant.');
      if (S.tab === 'order' || S.tab === 'garment') render();
    } catch (e) { /* */ }
  });

  /* ---------- events ---------- */
  app.addEventListener('click', async (e) => {
    const t = e.target.closest('button,[data-sel]'); if (!t) return;
    const d = t.dataset;
    if (d.tab) return setTab(d.tab, !t.classList.contains('pill') && !t.classList.contains('btn'));
    if (d.oprev !== undefined) { const l = S.order.lines[+d.oprev]; if (l) { engine.setColor(l.color); render(); } return; }
    if (d.odel !== undefined) { S.order.lines.splice(+d.odel, 1); render(); return; }
    if (d.oadd) { S.order.lines.push({ color: d.oadd.toLowerCase(), sizes: {} }); S.addingColor = false; engine.setColor(d.oadd); render(); const b = $('.pbody'); const ls = b.querySelectorAll('.oline'); const last = ls[ls.length - 1]; if (last) { last.scrollIntoView({ block: 'nearest' }); } return; }
    if (d.garment) { await engine.setGarment(d.garment); const a = ARTICLES[d.garment]; if (a.gender) S.pref.gender = a.gender; if (a.sleeve) S.pref.sleeve = a.sleeve; render(); updateBadge(); return; }
    if (d.section) { S.section = d.section; render(); return; }
    if (d.family) { const [sec, key] = d.family.split(':'); const f = FAM().find((x) => x.section === sec && x.key === key); if (f) { await engine.setGarment(pickInFamily(f)); S.section = sec; render(); updateBadge(); if (isMobile() && f.ids.length > 1) toast('Choisissez la variante sous l’aperçu.'); } return; }
    if (d.variant) { const [field, val] = d.variant.split(':'); const f = curFam(); if (!f) return; S.pref[field] = val; const cur = ARTICLES[engine.garmentId]; const want = { gender: cur.gender, sleeve: cur.sleeve, style: cur.style, [field]: val }; const v = variantIds(f); const exact = v.find(([, a]) => ['gender', 'sleeve', 'style'].every((k) => !want[k] || !a[k] || a[k] === want[k])); const id = exact ? exact[0] : pickInFamily(f, { [field]: val }); await engine.setGarment(id); render(); updateBadge(); return; }
    if (d.mine !== undefined) { const m = S.myImages[+d.mine]; if (m) { busy(true, 'Placement…'); try { await placeImage(m.src, m.name); } catch (er) { toast('Image indisponible.', true); } busy(false); } return; }
    if (d.color) { engine.setColor(d.color); if (S.order.lines.length === 1 && !Object.values(S.order.lines[0].sizes).some((n) => n > 0)) S.order.lines[0].color = d.color.toLowerCase(); render(); return; }
    if (d.material) { engine.setMaterial(d.material); render(); return; }
    if (d.trim !== undefined) { const [k, h] = d.trim.split(':'); const o = trimOpts(); const T = { ...engine.trims, cuffCm: o.cuffCm }; if (h) T[k] = h; else delete T[k]; engine.setTrims(T); render(); return; }
    if (d.a === 'embview') { const E = S.emb[d.side]; if (E) modal(`<h3>Aperçu des points · ${SIDE_FR[d.side]}</h3><p class="note">${E.stitches.toLocaleString('fr-FR')} points estimés · ${E.colors} couleur${E.colors > 1 ? 's' : ''} · ${Math.round(E.w)} × ${Math.round(E.h)} mm</p><img src="${stitchPreview(E.design, 640).toDataURL('image/png')}" style="width:100%;border-radius:12px;border:1px solid var(--rule)" alt="Aperçu des points de broderie"><p class="note">Simulation : notre atelier vérifie et ajuste le programme avant la production.</p><div class="row"><button class="btn" data-close>Fermer</button></div>`); return; }
    if (d.side) { engine.setSide(d.side); engine.setView(viewOf(d.side)); return; }
    if (d.view) { engine.setView(d.view); return; }
    if (d.font) { const L = selLayer('text'); if (L) { await engine.updateLayer(L.id, { font: d.font }, true); } else S.newFont = d.font; render(); return; }
    if (d.align) { const L = selLayer('text'); await engine.updateLayer(L.id, { align: d.align }, true); render(); return; }
    if (d.aistyle) { S.aiStyle = d.aistyle; render(); return; }
    if (d.aipick !== undefined) { busy(true, 'Placement…'); try { await engine.addImageLayer(S.aiImgs[+d.aipick], { name: 'Motif IA' }); toast('Motif placé. Faites-le glisser sur le vêtement.'); } catch (er) { toast('Image indisponible.', true); } busy(false); return; }
    if (d.sel) { engine.select(d.sel); return; }
    if (d.up) { engine.moveLayer(d.up, 1); return; } if (d.down) { engine.moveLayer(d.down, -1); return; }
    if (d.vis) { const L = engine.layers.find((l) => l.id === d.vis); engine.updateLayer(L.id, { visible: !L.visible }, true); render(); return; }
    if (d.del) { engine.removeLayer(d.del); return; }
    if (d.print) return exportPrint(d.print);
    if (d.bg) { engine.setBackground({ type: 'studio', color: d.bg }); render(); return; }
    if (d.bgt) { engine.setBackground(d.bgt === 'transparent' ? { type: 'transparent', color: engine.bg.color } : { type: 'gradient', color: '#f6f5f1', color2: engine.bg.color === '#f6f5f1' ? '#9aa59f' : engine.bg.color }); render(); return; }
    if (d.ci !== undefined) { S.setColors ||= [0, 1, 2, 3, 4, 5]; const i = +d.ci; S.setColors = S.setColors.includes(i) ? S.setColors.filter((x) => x !== i) : [...S.setColors, i]; t.classList.toggle('on'); return; }
    if (d.open) { busy(true, 'Ouverture…'); try { const p = await store.get(d.open); await engine.load(p.data || p); S.project = { id: p.id, remoteId: p.remoteId, name: p.name }; setNameInputs(p.name === 'Sans titre' ? '' : p.name); toast('Projet ouvert.'); setTab('garment'); } catch (er) { toast(er.message, true); } busy(false); return; }
    if (d.pdel) { if (confirm('Supprimer ce projet ?')) { await store.remove(d.pdel); render(); } return; }
    if (d.la) {
      const L = selLayer(); if (!L) return; const A = engine.area(L.side);
      if (d.la === 'center') engine.updateLayer(L.id, { x: A.wIn / 2 }, true);
      else if (d.la === 'top') engine.updateLayer(L.id, { y: (L.w * L.ar) / 2 + 0.25 }, true);
      else if (d.la === 'dup') engine.duplicateLayer(L.id);
      else if (d.la === 'del') engine.removeLayer(L.id);
      else if (d.la === 'flip') engine.updateLayer(L.id, { flip: !L.flip }, true);
      else if (d.la === 'swap') { const ns = L.side === 'front' ? 'back' : 'front'; const B = engine.area(ns); await engine.updateLayer(L.id, { side: ns, x: B.wIn / 2, w: Math.min(L.w, B.wIn * 0.9) }, true); engine.setSide(ns); engine.setView(ns); }
      else if (d.la === 'rmbg') { busy(true, 'Détourage…'); const bm = engine.bitmaps.get(L.id); const c = removeBackground(bm, S.bgRemoveTol); engine.pushHistory(); L.src = c.toDataURL('image/png'); engine.bitmaps.set(L.id, c); engine.redraw(); busy(false); toast('Fond retiré.'); render(); }
      return;
    }
    const a = d.a; if (!a) return;
    if (a === 'undo') engine.undo(); else if (a === 'redo') engine.redo();
    else if (a === 'save') saveProject();
    else if (a === 'goexport') setTab('export');
    else if (a === 'cart') addToCart();
    else if (a === 'price') { if (!NOPRICE) priceModal(); }
    else if (a === 'sup' || a === 'sdown') { engine.scaleSelected(a === 'sup' ? 1.1 : 1 / 1.1); syncProps(); }
    else if (a === 'rl' || a === 'rr') { engine.rotateSelected(a === 'rr' ? 15 : -15); syncProps(); }
    else if (a === 'r0') { const L = selLayer(); if (L) { engine.updateLayer(L.id, { rot: 0 }, true); syncProps(); } }
    else if (a === 'sdel') { if (engine.selected) engine.removeLayer(engine.selected); }
    else if (a === 'newproduct') newProduct();
    else if (a === 'goface') { engine.setSide(d.face); engine.setView(viewOf(d.face)); setTab('graphics'); }
    else if (a === 'oaddcolor') { S.addingColor = true; render(); }
    else if (a === 'ocancel') { S.addingColor = false; render(); }
    else if (a === 'spin') { engine.autoRotate = !engine.autoRotate; t.classList.toggle('on', engine.autoRotate); if (!engine.autoRotate) engine.pivot.rotation.y = 0; }
    else if (a === 'addtext') { if (!(S.textDraft || '').trim()) { toast('Écrivez votre texte d’abord.', true); return; } await engine.addTextLayer({ text: S.textDraft.trim(), font: S.newFont || 'Anton' }); S.textDraft = ''; render(); }
    else if (a === 'deselect') { engine.select(null); render(); }
    else if (a === 'aigen') aiGenerate();
    else if (a === 'savekey') { const v = $('[data-openai]').value.trim(); if (!v.startsWith('sk-')) return toast('Clé invalide : elle commence par « sk- ».', true); localStorage.setItem(lsKey + 'openai', v); render(); toast('Clé enregistrée sur cet appareil.'); }
    else if (a === 'mockup') { busy(true, 'Rendu HD…'); const b = await engine.exportMockup(2400); dl(b, `${slug()}-mockup.png`); busy(false); toast('Mockup exporté.'); wmNudge('L’image HD'); }
    else if (a === 'pass') needPro('');
    else if (a === 'colorset') { const sel = (S.setColors || [0, 1, 2, 3, 4, 5]).map((i) => ({ name: COLORS[i][0], hex: COLORS[i][1] })); busy(true, `Rendu de ${sel.length} couleurs…`); const z = await engine.exportColorSet(sel); dl(z, `${slug()}-couleurs.zip`); busy(false); toast(`${sel.length} mockups exportés.`); render(); wmNudge('Le pack couleurs'); }
    else if (a === 'video') { busy(true, 'Enregistrement de la vidéo 360°…', 0); try { const v = await engine.recordTurntable(6, (k) => busy(true, 'Enregistrement de la vidéo 360°…', k)); dl(v.blob, `${slug()}-360.${v.ext}`); toast('Vidéo exportée.'); wmNudge('La vidéo 360°'); } catch (er) { toast(er.message, true); } busy(false); }
    else if (a === 'share') { const b = await engine.exportMockup(1600); const f = new File([b], `${slug()}.png`, { type: 'image/png' }); if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: S.project.name }); } catch (er) { /* cancelled */ } } else { dl(b, f.name); toast('Partage non disponible : image téléchargée.'); } }
    else if (a === 'rmglb') { const id = engine.garmentId; delete engine.opts.models[id]; await glbDB('delete', id); await engine.setGarment(id); render(); toast('Modèle retiré.'); }
    else if (a === 'retry') render();
    else if (a === 'atlist') atList();
    else if (a === 'settings') { if (DESK && DESK.openWindow) DESK.openWindow('parametres'); else { if (AT.items.length && !confirm('La commande en cours sera perdue en ouvrant les paramètres. Continuer ?')) return; location.href = 'parametres.html'; } }
    else if (a === 'gestion') { if (DESK && DESK.openWindow) DESK.openWindow('gestion'); }
    else if (a === 'namehelp') { const nb = t.closest('.namebox'); if (nb) nb.classList.toggle('tip-on'); }
    else if (a === 'new') { if (engine.layers.length && !confirm('Commencer un nouveau projet ? Les modifications non enregistrées seront perdues.')) return; newProduct(); }
  });
  app.addEventListener('input', async (e) => {
    const t = e.target, d = t.dataset;
    if (d.origcolors !== undefined) { engine.g.setOriginalColors(t.checked, engine.color); engine.modelInfo().originalColors = t.checked; await glbSaveMeta(); return; }
    if (d.glbrot !== undefined || d.glbdy !== undefined) { const M = engine.modelInfo(); if (d.glbrot !== undefined) M.rot = +t.value; else M.dy = +t.value; t.previousElementSibling.querySelector('span').textContent = d.glbrot !== undefined ? t.value + '°' : cmTxt(+t.value) + ' cm'; clearTimeout(S.glbT); S.glbT = setTimeout(async () => { await engine.setGarment(engine.garmentId); await glbSaveMeta(); }, 250); return; }
    if (d.customcolor !== undefined) { engine.setColor(t.value); autosave(); return; }
    if (d.lp) { const L = selLayer(); if (!L) return; if (!S.histPending) { engine.pushHistory(); S.histPending = true; } L[d.lp] = parseFloat(t.value); engine.redraw(); engine.emit('layer', L); const lab = t.previousElementSibling?.querySelector('span'); if (lab) lab.textContent = d.lp === 'w' ? (L.w * 2.54).toFixed(1) + ' cm' : d.lp === 'rot' ? Math.round(L.rot) + '°' : Math.round(L.opacity * 100) + ' %'; return; }
    if (d.tp) { const L = selLayer('text'); if (!L) return; const v = t.type === 'checkbox' ? t.checked : t.type === 'range' ? parseFloat(t.value) : t.value; if (!S.histPending) { engine.pushHistory(); S.histPending = true; } await engine.updateLayer(L.id, { [d.tp]: v }); if (t.type === 'checkbox') render(); else { const lab = t.previousElementSibling?.querySelector('span'); if (lab) lab.textContent = d.tp === 'arc' ? v + '°' : v; } return; }
    if (d.newtext !== undefined) { S.textDraft = t.value; return; }
    if (d.oq !== undefined) { const l = S.order.lines[+d.oq]; if (!l) return; const n = Math.max(0, Math.min(9999, parseInt(t.value, 10) || 0)); if (n) l.sizes[d.oz] = n; else delete l.sizes[d.oz]; t.parentElement.classList.toggle('has', n > 0); refreshTotals(); return; }
    if (d.ocomment !== undefined) { S.order.comment = t.value; return; }
    if (d.lmove !== undefined) { const L = selLayer(); const ns = t.value; if (!L || !ns || !engine.g.printAreas[ns]) return; const B = engine.area(ns); await engine.updateLayer(L.id, { side: ns, x: B.wIn / 2, y: Math.min(B.hIn / 2, L.w * (L.ar || 1) / 2 + B.hIn * 0.08), w: Math.min(L.w, B.wIn * 0.9) }, true); engine.setSide(ns); engine.setView(viewOf(ns)); render(); return; }
    if (d.ostaff !== undefined) { if (t.value === '__autre') { t.value = S.order.staff || ''; askStaff(t, (v) => { S.order.staff = v; AT.lastStaff = v; render(); }); return; } S.order.staff = t.value; AT.lastStaff = t.value; return; }
    if (d.mark !== undefined) { if (!faceCheck(d.mark).ok && t.value === 'embroidery') { toast('Impossible de réaliser en broderie.', true); render(); return; } engine.setMarking(d.mark, t.value); engine.setSide(d.mark); engine.setView(viewOf(d.mark)); if (t.value === 'embroidery') { busy(true, 'Calcul des points de broderie…'); await new Promise((r) => setTimeout(r, 30)); refreshEmb(true); busy(false); } else { delete S.emb[d.mark]; updatePrice(); render(); } return; }
    if (d.aiprompt !== undefined) { S.aiPrompt = t.value; return; }
    if (d.tol !== undefined) { S.bgRemoveTol = +t.value; t.previousElementSibling.querySelector('span').textContent = t.value; return; }
    if (d.autobg !== undefined) { S.autoBg = t.checked; return; }
    if (d.bgc !== undefined) { engine.setBackground({ type: 'studio', color: t.value }); return; }
    if (d.exposure !== undefined) { engine.renderer.toneMappingExposure = +t.value; t.previousElementSibling.querySelector('span').textContent = (+t.value).toFixed(2); return; }
    if (d.shadow !== undefined) { engine.floor.visible = t.checked; return; }
    if (d.guide !== undefined) { engine.showGuide = t.checked; engine.redraw(); return; }
  });
  app.addEventListener('change', async (e) => {
    if (e.target.dataset.glb !== undefined && e.target.files[0]) {
      const f = e.target.files[0]; const id = engine.garmentId;
      busy(true, 'Chargement du modèle 3D…');
      try { const buf = await f.arrayBuffer(); await glbDB('put', id, { buf, name: f.name, rot: 0, dy: 0 }); engine.opts.models[id] = { url: URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' })), rot: 0, dy: 0, name: f.name }; await engine.setGarment(id); render(); toast('Modèle 3D installé pour « ' + GARMENTS[id].name + ' ».'); }
      catch (er) { toast('Fichier GLB illisible : ' + er.message, true); }
      busy(false); e.target.value = ''; return;
    }
    if (e.target.dataset.file !== undefined) { addFiles([...e.target.files], e.target.dataset.file || engine.side); e.target.value = ''; } S.histPending = false; autosave(); });
  app.addEventListener('pointerup', () => { S.histPending = false; });
  const panel = $('.panel');
  panel.addEventListener('dragover', (e) => { const z = e.target.closest('[data-drop]'); if (z) { e.preventDefault(); z.classList.add('over'); } });
  panel.addEventListener('dragleave', (e) => { const z = e.target.closest('[data-drop]'); if (z) z.classList.remove('over'); });
  panel.addEventListener('drop', (e) => { const z = e.target.closest('[data-drop]'); if (z) { e.preventDefault(); z.classList.remove('over'); addFiles([...e.dataTransfer.files], z.dataset.drop || engine.side); } });
  $('.stage').addEventListener('dragover', (e) => e.preventDefault());
  $('.stage').addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files.length) addFiles([...e.dataTransfer.files], engine.side); });
  host.addEventListener('paste', (e) => { const f = [...(e.clipboardData?.files || [])]; if (f.length) addFiles(f); });
  function setNameInputs(v, except) { app.querySelectorAll('[data-pname]').forEach((i) => { if (i !== except) i.value = v; }); }
  app.addEventListener('input', (e) => { const t = e.target; if (t && t.dataset && t.dataset.pname !== undefined) { S.project.name = t.value.trim() || 'Sans titre'; setNameInputs(t.value, t); } });
  $('.sheet-handle').addEventListener('click', closeSheet);
  // Phone: the sheet floats over the stage; the 3D view shrinks to the space left above it and re-frames.
  const sheetSync = () => { const open = isMobile() && panel.classList.contains('open'); app.classList.toggle('sheet-open', open); app.style.setProperty('--sheet-h', (open ? panel.getBoundingClientRect().height : 0) + 'px'); };
  new ResizeObserver(sheetSync).observe(panel); panel.addEventListener('transitionend', sheetSync); new ResizeObserver(sheetSync).observe(app);
  // Swipe the handle down to close.
  let sy = null; $('.sheet-handle').addEventListener('touchstart', (e) => { sy = e.touches[0].clientY; }, { passive: true });
  $('.sheet-handle').addEventListener('touchend', (e) => { if (sy !== null && e.changedTouches[0].clientY - sy > 40) closeSheet(); sy = null; });
  const keyHandler = (e) => {
    if (!host.isConnected) return document.removeEventListener('keydown', keyHandler);
    const tag = (e.composedPath()[0]?.tagName || '').toLowerCase(); if (['input', 'textarea', 'select'].includes(tag)) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? engine.redo() : engine.undo(); }
    else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && engine.selected) { e.preventDefault(); engine.removeLayer(engine.selected); }
    else if (e.key.startsWith('Arrow') && engine.selected) { e.preventDefault(); const L = selLayer(), s = e.shiftKey ? 0.5 : 0.1; engine.updateLayer(L.id, { x: L.x + (e.key === 'ArrowRight' ? s : e.key === 'ArrowLeft' ? -s : 0), y: L.y + (e.key === 'ArrowDown' ? s : e.key === 'ArrowUp' ? -s : 0) }); }
  };
  document.addEventListener('keydown', keyHandler);

  // keep the slider values in the panel in step with on-stage handle edits (no full re-render while dragging)
  function syncProps() {
    const L = selLayer(); const b = $('.pbody'); if (!L || !b) return;
    const w = b.querySelector('[data-lp=w]'), r = b.querySelector('[data-lp=rot]');
    if (w) { w.value = L.w; const lab = w.closest('.field').querySelector('label span'); if (lab) lab.textContent = (L.w * 2.54).toFixed(1) + ' cm'; }
    if (r) { r.value = L.rot || 0; const lab = r.closest('.field').querySelector('label span'); if (lab) lab.textContent = Math.round(L.rot || 0) + '°'; }
  }
  const selTools = () => { const t = $('.seltools'); if (t) t.hidden = !selLayer(); app.classList.toggle('has-sel', !!selLayer()); };
  // v3.3 : boutons Devant / Dos / Manche G. / Manche D. selon les zones du produit
  function sidesBar() { const art = ARTICLES[engine.garmentId]; $$('[data-side]').forEach((b) => { if (!b.closest('.sides')) return; const sd = b.dataset.side; b.classList.toggle('hide', !engine.g.printAreas[sd]); b.textContent = sideLabel(sd, art, true); }); }
  /* ---------- engine events ---------- */
  engine.on('layers', () => {
    for (const sd of SIDE_KEYS) if (markOf(sd) === 'embroidery' && !faceCheck(sd).ok) { engine.marking[sd] = 'print'; delete S.emb[sd]; engine.redraw(); toast('Impossible de réaliser en broderie : ce côté passe en impression.', true); }
    if (['layers', 'export', 'order', 'marking'].includes(S.tab)) render(); updateBadge(); updatePrice(); refreshEmb(); });
  engine.on('select', () => selTools());
  engine.on('layers', () => selTools());
  engine.on('select', (id) => { const L = engine.layers.find((l) => l.id === id); if (L) { if (L.type === 'text' && S.tab !== 'text' && S.tab !== 'layers') setTab('text'); else if (L.type === 'image' && !['graphics', 'layers'].includes(S.tab)) setTab('graphics'); else render(); } else if (['text', 'graphics', 'layers'].includes(S.tab)) render(); updateBadge(); });
  let lr; engine.on('layer', () => { updateBadge(); refreshEmb(); syncProps(); clearTimeout(lr); lr = setTimeout(() => { if (S.tab === 'layers') render(); }, 250); });
  setTimeout(sidesBar, 0);
  engine.on('side', (s) => { sidesBar(); $$('[data-side]').forEach((b) => b.classList.toggle('on', b.dataset.side === s)); updateBadge(); if (['graphics', 'text'].includes(S.tab) && !engine.selected) render(); });
  engine.on('facing', (f) => { if (!engine.dragging && f !== engine.side && !engine.selected) engine.setSide(f); });
  engine.on('history', () => { $('[data-a=undo]').disabled = !engine.undoStack?.length; $('[data-a=redo]').disabled = !engine.redoStack?.length; });
  engine.on('garment', () => { { const o = trimOpts(), T = { ...engine.trims, cuffCm: o.cuffCm }; if (!o.collar) delete T.collar; if (!o.cuffs) delete T.cuffs; engine.setTrims(T); }
    updateBadge(); variantBar(); updatePrice(); refreshEmb(); sidesBar(); if (S.tab === 'garment' || S.tab === 'scene' || S.tab === 'order') render(); });
  setTimeout(() => { const h = $('.hint'); if (h) h.style.opacity = 0; }, 5000);

  const wmChip = () => { const c = $('.wmchip'); if (c) c.hidden = true; }; // pas de filigrane pendant la création : il n'apparaît qu'à l'export
  /* ---------- protection : clic droit, glisser, impression, capture ---------- */
  const guard = (e) => { const t = e.composedPath()[0]; const tag = (t && t.tagName || '').toLowerCase(); if (['input', 'textarea', 'select'].includes(tag) || (t && t.isContentEditable)) return; e.preventDefault(); };
  ['contextmenu', 'dragstart', 'selectstart', 'copy'].forEach((ev) => root.addEventListener(ev, guard, true));
  host.addEventListener('contextmenu', (e) => e.preventDefault());
  const veil = (on) => app.classList.toggle('veil', on);
  let veilT; const veilFor = (ms) => { veil(true); clearTimeout(veilT); veilT = setTimeout(() => veil(false), ms); };
  const shotKeys = (e) => {
    if (!host.isConnected) return;
    const k = (e.key || '').toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (k === 'printscreen' || e.code === 'PrintScreen') { e.preventDefault(); veilFor(1500); try { navigator.clipboard && navigator.clipboard.writeText(''); } catch (er) { /* */ } toast('Capture d’écran désactivée dans le studio. Utilisez Exporter.', true); }
    else if (mod && (k === 'p' || (e.shiftKey && ['s', 'i', 'c', 'j'].includes(k)) || k === 'u')) { e.preventDefault(); if (k === 'p' || k === 's') toast('Utilisez Exporter pour obtenir vos fichiers.', true); }
    else if (e.metaKey && e.shiftKey && ['3', '4', '5', '6'].includes(k)) { veilFor(2500); }
    else if (k === 'f12') e.preventDefault();
  };
  document.addEventListener('keydown', shotKeys, true); document.addEventListener('keyup', (e) => { if ((e.key || '').toLowerCase() === 'printscreen') { veilFor(1200); try { navigator.clipboard && navigator.clipboard.writeText(''); } catch (er) { /* */ } } }, true);
  // Outil Capture (Win+Maj+S), changement d'appli ou d'onglet : l'aperçu se voile tant que la page n'a plus le focus.
  let pickerOpen = 0; root.addEventListener('click', (e) => { const t = e.composedPath()[0]; if (t && t.tagName === 'INPUT' && t.type === 'file') { pickerOpen = Date.now(); } }, true);
  window.addEventListener('blur', () => { if (Date.now() - pickerOpen > 1500 && !document.querySelector('iframe:focus')) veil(true); });
  window.addEventListener('focus', () => { if (!cfg.isPro) passStatus(); clearTimeout(veilT); veilT = setTimeout(() => veil(false), 250); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) veil(true); });
  window.addEventListener('beforeprint', () => veil(true)); window.addEventListener('afterprint', () => veil(false));
  wmChip(); refreshSession().then((j) => { if (!j) passStatus(); });
  if (!isMobile()) setTab('garment'); else { S.tab = 'garment'; render(); }
  updateBadge(); variantBar(); updatePrice();
  // v2.4.1 : quand le studio est prêt et inactif, précharge les variantes proches (même famille), une à la fois.
  const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 2500));
  const warm = () => { const f = familyOf(engine.garmentId); const ids = (f ? f.ids : []).filter((id) => id !== engine.garmentId && models[id] && models[id].url).slice(0, 3); let i = 0; const next = () => { if (i < ids.length) { prefetchGLB(models[ids[i++]].url); setTimeout(() => idle(next), 1500); } }; idle(next); };
  setTimeout(warm, 3000); engine.on('garment', () => setTimeout(warm, 2500));
  new ResizeObserver(() => drawTape()).observe($('.tape')); engine.on('ruler', (ri) => drawTape(ri));
  /* ---------- ERP 0.15.0 : mode « fiche technique » (ouverte depuis la Bibliothèque des fiches) ----------
   * La composition est enregistrée dans la version brouillon de la fiche sur le serveur (config 3D + vignette) ;
   * une version proposée ou validée s'ouvre en lecture seule (la modifier = « Nouvelle version » dans l'ERP). */
  const FICHE = { v: null, ligne: 0 };
  const ficheApi = async (method, url, body) => {
    const r = await fetch('/api' + url, { method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.message || 'Erreur du serveur (' + r.status + ')'); return d;
  };
  const ficheBar = document.createElement('div');
  ficheBar.className = 'fiche-bar'; ficheBar.hidden = true;
  ficheBar.style.cssText = 'position:absolute;left:50%;top:64px;transform:translateX(-50%);z-index:40;display:flex;gap:8px;align-items:center;background:#fff;border:1px solid #d9cfc4;border-radius:12px;padding:6px 8px 6px 14px;box-shadow:0 4px 18px rgba(0,0,0,.12);font:13px/1.3 inherit;max-width:94%';
  app.appendChild(ficheBar);
  const ficheDessiner = () => {
    const v = FICHE.v; if (!v) { ficheBar.hidden = true; return; }
    const br = v.statut === 'brouillon';
    ficheBar.hidden = false;
    ficheBar.innerHTML = `<span>Fiche <b>${esc(v.reference)}</b> · v${v.numero} · ${br ? 'brouillon' : '<b>' + esc(v.statut) + '</b> (lecture seule)'}</span>
      ${br ? `<button class="btn" data-fiche="enr" style="padding:6px 10px">Enregistrer dans la fiche</button><button class="btn ghost" data-fiche="prop" style="padding:6px 10px">Proposer au commercial</button>` : ''}
      <button class="btn ghost" data-fiche="quit" style="padding:6px 10px" title="Quitter le mode fiche">✕</button>`;
  };
  async function ficheOuvrir(vid) {
    if (!vid || (FICHE.v && FICHE.v.id === vid)) return;
    busy(true, 'Ouverture de la fiche…');
    try {
      const v = await ficheApi('GET', '/fiches/versions/' + vid);
      FICHE.v = v; FICHE.ligne = v.version_ligne;
      if (v.config_studio && v.config_studio.layers) await engine.load(v.config_studio);
      S.project = { id: 'fiche-' + v.fiche_id, name: v.reference }; setNameInputs(v.reference);
      ficheDessiner(); setTab('garment'); toast(`Fiche ${v.reference} v${v.numero} ouverte.`);
    } catch (er) { toast(er.message, true); }
    busy(false);
  }
  async function ficheEnregistrer(silent) {
    const v = FICHE.v; if (!v || v.statut !== 'brouillon') return false;
    busy(true, 'Enregistrement dans la fiche…');
    try {
      const r = await ficheApi('PUT', '/fiches/versions/' + v.id, { version_ligne: FICHE.ligne, config_studio: engine.serialize(), vignette: await engine.thumbnail() });
      const nv = (r.versions || []).find((x) => x.id === v.id); FICHE.ligne = nv ? nv.version_ligne : FICHE.ligne + 1;
      if (!silent) toast('Composition enregistrée dans la fiche ' + v.reference + '.');
      try { window.parent.postMessage({ erp: true, type: 'fiche-enregistree', fiche_id: v.fiche_id }, location.origin); } catch (_) { /* */ }
      return true;
    } catch (er) { toast(er.message, true); return false; } finally { busy(false); }
  }
  ficheBar.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-fiche]'); if (!b) return;
    if (b.dataset.fiche === 'enr') return ficheEnregistrer(false);
    if (b.dataset.fiche === 'prop') { if (await ficheEnregistrer(true)) { try { window.parent.postMessage({ erp: true, type: 'fiche-proposer', fiche_id: FICHE.v.fiche_id, version_id: FICHE.v.id }, location.origin); } catch (_) { /* */ } } return; }
    if (b.dataset.fiche === 'quit') { FICHE.v = null; ficheDessiner(); }
  });
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || !e.data.erp) return;
    if (e.data.type === 'fiche-proposee' && FICHE.v && FICHE.v.id === +e.data.version_id) { FICHE.v.statut = 'proposee'; ficheDessiner(); }
  });
  FICHE_OUVRIR = ficheOuvrir;
  FICHE_PRET();
  return { engine, setTab, cfg, makeZip };
}
