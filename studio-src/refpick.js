// ERP 0.13.0 — sélecteur de référence produit, commun à toutes les saisies de lignes
// (Gestion : commande, BL, facture ; Ventes : devis, proforma).
// Au clic (ou à l'entrée) dans la case Réf. : liste de TOUS les produits enregistrés ; la liste se filtre à chaque
// caractère tapé (référence, désignation, type). 6 lignes visibles, ascenseur au-delà ;
// ↑ / ↓ (et Page préc. / suiv.) déplacent le curseur, Entrée valide, Échap ferme, clic = choix.
// Compilé dans le bundle Gestion (import) et, à part, pour l'ERP web (window.RefPick) :
//   npx esbuild src/refpick.js --bundle --minify --target=es2020 --format=iife --global-name=RefPick --outfile=…/erp/web/refpick.js

const VISIBLES = 6;
const MAX = 400; // au-delà, l'utilisateur affine la saisie
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const fmt = (v) => (v === null || v === undefined || v === '' ? '—' : (+v).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }));

const CSS = `#refpop{position:fixed;z-index:9999;background:#fff;border:1px solid var(--rule,#dbe3ea);border-radius:10px;box-shadow:0 14px 34px rgba(0,0,0,.2);width:min(640px,96vw);font:13px "Instrument Sans",system-ui,"Segoe UI",sans-serif;color:var(--ink,#16263a);overflow:hidden}
#refpop .rp-b{overflow-y:auto;overscroll-behavior:contain}
#refpop table{width:100%;border-collapse:collapse}
#refpop th{position:sticky;top:0;background:#f6f8fa;text-align:left;font:700 11px "Instrument Sans",system-ui,sans-serif;text-transform:uppercase;letter-spacing:.05em;color:var(--ink2,#5a6b7c);padding:7px 9px;border-bottom:1px solid var(--rule,#dbe3ea);z-index:1}
#refpop td{padding:6px 9px;border-bottom:1px solid #eef2f6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:330px}
#refpop td.n,#refpop th.n{text-align:right}
#refpop tr[data-pk]{cursor:pointer}
#refpop tr[data-pk]:hover td{background:#f3f7fb}
#refpop tr.on td{background:var(--b2,#29669d);color:#fff}
#refpop tr.on td .rp-m{color:#dbe7f3}
#refpop .rp-ref{font-family:ui-monospace,Consolas,monospace;font-weight:700}
#refpop .rp-m{color:var(--ink2,#5a6b7c);font-size:12px}
#refpop mark{background:#fff1b8;color:inherit;padding:0;border-radius:2px}
#refpop tr.on mark{background:rgba(255,255,255,.28)}
#refpop .rp-f{display:flex;justify-content:space-between;gap:10px;padding:5px 10px;background:#f6f8fa;border-top:1px solid var(--rule,#dbe3ea);font-size:11.5px;color:var(--ink2,#5a6b7c)}
#refpop .rp-v{padding:14px 12px;color:var(--ink2,#5a6b7c)}`;

function css() {
  if (document.getElementById('refpick-css')) return;
  const st = document.createElement('style'); st.id = 'refpick-css'; st.textContent = CSS; document.head.appendChild(st);
}

/** Filtre et classe : la référence qui commence par la saisie d'abord, puis contient, puis désignation. Tous les mots doivent être trouvés. */
export function filtrer(items, q) {
  const n = norm(q).trim();
  if (!n) return items.slice().sort((a, b) => String(a.ref).localeCompare(String(b.ref), 'fr')).slice(0, MAX);
  const mots = n.split(/\s+/).filter(Boolean), out = [];
  for (const it of items) {
    const r = norm(it.ref), h = `${r} ${norm(it.designation)} ${norm(it.type)}`;
    if (!mots.every((m) => h.includes(m))) continue;
    out.push([r.startsWith(n) ? 0 : r.includes(n) ? 1 : 2, it]);
  }
  return out.sort((a, b) => a[0] - b[0] || String(a[1].ref).localeCompare(String(b[1].ref), 'fr')).slice(0, MAX).map((x) => x[1]);
}
const surligne = (txt, q) => {
  const s = String(txt ?? ''), mots = norm(q).trim().split(/\s+/).filter(Boolean);
  if (!mots.length) return esc(s);
  const ns = norm(s), marques = new Array(s.length).fill(false);
  for (const m of mots) { let i = ns.indexOf(m); while (i >= 0) { for (let k = i; k < i + m.length; k++) marques[k] = true; i = ns.indexOf(m, i + m.length); } }
  let html = '', ouvert = false;
  for (let i = 0; i < s.length; i++) { if (marques[i] && !ouvert) { html += '<mark>'; ouvert = true; } if (!marques[i] && ouvert) { html += '</mark>'; ouvert = false; } html += esc(s[i]); }
  return html + (ouvert ? '</mark>' : '');
};

/**
 * Attache le sélecteur à un conteneur (délégation d'événements : le contenu peut être redessiné).
 * opt = { getItems(): [{ref, designation, type, ht}], estRef(input): bool, choisir(input, item), prix: bool | () => bool }
 * Retourne { fermer, ouvert, detacher }.
 */
export function attachRefPicker(root, opt) {
  css();
  let pop = null, inp = null, liste = [], k = -1;
  const prix = () => (typeof opt.prix === 'function' ? opt.prix() : opt.prix !== false);
  const estRef = (el) => !!(el && el.matches && el.matches('input') && !el.readOnly && !el.disabled && opt.estRef(el));
  const fermer = () => { if (pop) { pop.remove(); pop = null; } inp = null; k = -1; };
  const placer = () => {
    if (!pop || !inp) return;
    const rc = inp.getBoundingClientRect(), h = pop.offsetHeight, w = pop.offsetWidth;
    pop.style.left = Math.max(4, Math.min(rc.left, innerWidth - w - 6)) + 'px';
    pop.style.top = (rc.bottom + 2 + h > innerHeight - 4 && rc.top - h - 2 > 4 ? rc.top - h - 2 : rc.bottom + 2) + 'px';
  };
  const curseur = (n, voir = true) => {
    if (!pop || !liste.length) return;
    k = Math.max(0, Math.min(liste.length - 1, n));
    pop.querySelectorAll('tr[data-pk]').forEach((tr) => tr.classList.toggle('on', +tr.dataset.pk === k));
    const tr = pop.querySelector(`tr[data-pk="${k}"]`), b = pop.querySelector('.rp-b');
    if (voir && tr && b) { // garder la ligne choisie visible sous l'en-tête collant
      const th = (pop.querySelector('thead') || { offsetHeight: 0 }).offsetHeight;
      if (tr.offsetTop - th < b.scrollTop) b.scrollTop = tr.offsetTop - th;
      else if (tr.offsetTop + tr.offsetHeight > b.scrollTop + b.clientHeight) b.scrollTop = tr.offsetTop + tr.offsetHeight - b.clientHeight;
    }
  };
  const dessiner = () => {
    const q = inp.value, P = prix(), tous = opt.getItems() || [];
    liste = filtrer(tous, q);
    if (!pop) {
      pop = document.createElement('div'); pop.id = 'refpop'; pop.setAttribute('role', 'listbox');
      pop.addEventListener('mousedown', (e) => { e.preventDefault(); const tr = e.target.closest('tr[data-pk]'); if (tr) choisir(+tr.dataset.pk); });
      (inp.closest('dialog') || document.body).appendChild(pop); // dans une fenêtre modale (<dialog>), sinon la liste passe dessous
    } else if (pop.parentNode !== (inp.closest('dialog') || document.body)) (inp.closest('dialog') || document.body).appendChild(pop);
    if (!tous.length) pop.innerHTML = '<div class="rp-v">Aucun produit enregistré (Produits finis, articles et prestations).</div>';
    else if (!liste.length) pop.innerHTML = `<div class="rp-v">Aucun produit ne correspond à « ${esc(q)} ».</div><div class="rp-f"><span>Corrigez la saisie ou laissez une ligne libre.</span><span>Échap : fermer</span></div>`;
    else {
      pop.innerHTML = `<div class="rp-b"><table><thead><tr><th>Réf.</th><th>Désignation</th><th>Type</th>${P ? '<th class="n">PRIX H.T.</th>' : ''}</tr></thead><tbody>${liste.map((r, i) => `<tr data-pk="${i}" role="option"><td class="rp-ref">${surligne(r.ref, q)}</td><td title="${esc(r.designation)}">${surligne(r.designation, q)}</td><td class="rp-m">${esc(r.type || '')}</td>${P ? `<td class="n">${fmt(r.ht)}</td>` : ''}</tr>`).join('')}</tbody></table></div>
        <div class="rp-f"><span>${liste.length >= MAX ? `${MAX} premiers résultats — affinez la saisie` : `${liste.length} produit${liste.length > 1 ? 's' : ''}${q.trim() ? ` sur ${tous.length}` : ''}`}</span><span>↑ ↓ choisir · Entrée valider · Échap fermer</span></div>`;
      const b = pop.querySelector('.rp-b'), tr = pop.querySelector('tbody tr'), th = pop.querySelector('thead');
      b.style.maxHeight = ((th ? th.offsetHeight : 30) + (tr ? tr.offsetHeight : 30) * VISIBLES) + 'px';
      curseur(0);
    }
    placer();
  };
  const ouvrir = (el) => { inp = el; dessiner(); };
  const choisir = (i) => { const it = liste[i], el = inp; if (!it || !el) return; fermer(); opt.choisir(el, it); };

  const onFocus = (e) => { if (estRef(e.target)) ouvrir(e.target); };
  const onClick = (e) => { if (estRef(e.target) && (!pop || inp !== e.target)) ouvrir(e.target); };
  const onInput = (e) => { if (estRef(e.target)) ouvrir(e.target); };
  const onKey = (e) => {
    if (!estRef(e.target)) return;
    const pas = { ArrowDown: 1, ArrowUp: -1, PageDown: VISIBLES, PageUp: -VISIBLES }[e.key];
    if (pas) { e.preventDefault(); if (!pop || inp !== e.target) ouvrir(e.target); else curseur(k + pas); return; }
    if (e.key === 'Enter' && pop) { e.preventDefault(); e.stopPropagation(); if (k >= 0) choisir(k); else fermer(); return; }
    if (e.key === 'Escape' && pop) { e.preventDefault(); e.stopPropagation(); fermer(); return; }
    if (e.key === 'Tab') fermer();
  };
  const onBlur = (e) => { if (estRef(e.target)) setTimeout(() => { if (inp && document.activeElement !== inp) fermer(); }, 120); };
  const onScroll = (e) => { if (pop && !pop.contains(e.target)) placer(); };
  root.addEventListener('focusin', onFocus);
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  root.addEventListener('keydown', onKey, true);
  root.addEventListener('focusout', onBlur);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', fermer);
  return {
    fermer, ouvert: () => !!pop,
    detacher() {
      fermer();
      root.removeEventListener('focusin', onFocus); root.removeEventListener('click', onClick); root.removeEventListener('input', onInput);
      root.removeEventListener('keydown', onKey, true); root.removeEventListener('focusout', onBlur);
      window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', fermer);
    },
  };
}
