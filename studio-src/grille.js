// ERP 0.14.0 — fenêtre « couleurs × tailles » : saisie des quantités d'une ligne (commande, BL, facture, devis, proforma).
// Lignes = couleurs (liste des couleurs du catalogue, ou nom libre), colonnes = tailles de la grille du produit
// (taillant du produit fini), sinon grilles standard au choix. Totaux par couleur, par taille et total général.
// Tab / flèches / Entrée : déplacement comme un tableur ; saisie rapide « M12 L10 XL5 » sur la dernière couleur.
// Résultat : detail = [{ couleur, taille, qte }] (qte > 0 uniquement) ; la case Qté de la ligne reçoit le total.

export const GRILLES = [
  ['lettres7', 'Lettres XS → 3XL', ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL']],
  ['lettres8', 'Lettres XS → 4XL', ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL']],
  ['num', 'Numériques 36 → 56', ['36', '38', '40', '42', '44', '46', '48', '50', '52', '54', '56']],
  ['enfant', 'Enfant 2 → 16 ans', ['2A', '4A', '6A', '8A', '10A', '12A', '14A', '16A']],
  ['unique', 'Taille unique', ['TU']],
];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ent = (v) => Math.max(0, Math.floor(+String(v).replace(/[^\d]/g, '') || 0));

/** Total des pièces d'un détail. */
export const totalDetail = (d) => (Array.isArray(d) ? d.reduce((s, x) => s + (+x.qte || 0), 0) : 0);
/** Résumé lisible : « Blanc M×12 L×10 · Bleu marine M×8 » (ordre des tailles conservé). */
export function resumeDetail(d) {
  if (!Array.isArray(d) || !d.length) return '';
  const parC = new Map();
  for (const x of d) { if (!(+x.qte > 0)) continue; const k = x.couleur || ''; if (!parC.has(k)) parC.set(k, []); parC.get(k).push(`${x.taille || 'TU'}×${+x.qte}`); }
  return [...parC.entries()].map(([c, t]) => `${c ? c + ' ' : ''}${t.join(' ')}`).join(' · ');
}
/** Retire un ancien résumé « (… × …) » en fin de désignation. */
export const sansResume = (s) => String(s || '').replace(/\s*\([^()]*×[^()]*\)\s*$/, '').trim();

const CSS = `#grillepop{position:fixed;inset:0;z-index:10000;background:rgba(20,30,45,.38);display:flex;align-items:center;justify-content:center;font:14px "Instrument Sans",system-ui,"Segoe UI",sans-serif;color:var(--ink,#16263a)}
#grillepop .gp{background:#fff;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.28);width:min(940px,96vw);max-height:92vh;display:flex;flex-direction:column;overflow:hidden}
#grillepop .gp-h{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding:14px 18px;border-bottom:1px solid var(--rule,#dbe3ea)}
#grillepop .gp-h b{font:700 16px "Bricolage Grotesque","Instrument Sans",system-ui,sans-serif;display:block}
#grillepop .gp-h small{color:var(--ink2,#5a6b7c);font-size:12.5px}
#grillepop .gp-c{padding:12px 18px;overflow:auto}
#grillepop label.gp-l{display:flex;flex-direction:column;gap:3px;font-size:12px;font-weight:600;color:var(--ink2,#5a6b7c)}
#grillepop select,#grillepop input{font:14px "Instrument Sans",system-ui,sans-serif;color:var(--ink,#16263a);border:1px solid var(--rule,#dbe3ea);border-radius:8px;padding:6px 8px;background:#fff;min-height:34px}
#grillepop table{border-collapse:separate;border-spacing:0;width:100%}
#grillepop th{font:700 11.5px "Instrument Sans",system-ui,sans-serif;text-transform:uppercase;letter-spacing:.04em;color:var(--ink2,#5a6b7c);background:#f6f8fa;padding:7px 6px;border-bottom:1px solid var(--rule,#dbe3ea);text-align:center;white-space:nowrap}
#grillepop th.l,#grillepop td.l{text-align:left}
#grillepop td{padding:4px 5px;border-bottom:1px solid #eef2f6;text-align:center}
#grillepop td.q input{width:56px;text-align:right;font-variant-numeric:tabular-nums;padding:5px 6px;min-height:32px}
#grillepop td.q input:focus{outline:2px solid #9cc3e6;border-color:var(--b2,#29669d)}
#grillepop td.q input.v{background:#eef5fc;font-weight:700}
#grillepop td.t,#grillepop tfoot td{font-weight:700;font-variant-numeric:tabular-nums;text-align:right;padding-right:10px}
#grillepop tfoot td{background:#f6f8fa}
#grillepop td.tg{background:var(--b2,#29669d);color:#fff;border-radius:6px}
#grillepop .coul{display:flex;align-items:center;gap:8px;font-weight:600;white-space:nowrap}
#grillepop .dot{width:14px;height:14px;border-radius:50%;border:1px solid rgba(0,0,0,.25);flex:none}
#grillepop .x{border:1px solid var(--rule,#dbe3ea);background:#fff;border-radius:7px;width:28px;height:28px;cursor:pointer;color:var(--ink2,#5a6b7c)}
#grillepop .gp-a{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
#grillepop .gp-a input.r{flex:1;min-width:230px}
#grillepop .btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--b2,#29669d);background:var(--b2,#29669d);color:#fff;font:600 13px "Instrument Sans",system-ui,sans-serif;padding:8px 14px;border-radius:10px;cursor:pointer;white-space:nowrap}
#grillepop .btn.ghost{background:#fff;color:var(--b2,#29669d)} #grillepop .btn.sm{padding:5px 10px;font-size:12.5px}
#grillepop .gp-f{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 18px;border-top:1px solid var(--rule,#dbe3ea);background:#fbfcfd}
#grillepop .hint{color:var(--ink2,#5a6b7c);font-size:12px}
#grillepop .vide{color:var(--ink2,#5a6b7c);padding:16px;text-align:center}`;
function css() { if (document.getElementById('grille-css')) return; const s = document.createElement('style'); s.id = 'grille-css'; s.textContent = CSS; document.head.appendChild(s); }

/**
 * Ouvre la fenêtre. opt = { titre, tailles: [] (grille du produit), couleurs: [[nom, hex]], detail: [{couleur,taille,qte}], hote: élément où l'insérer }
 * Retourne une promesse : detail (tableau, éventuellement vide) ou null si annulé.
 */
export function ouvrirGrille(opt = {}) {
  css();
  return new Promise((resolve) => {
    const couleurs = (opt.couleurs || []).filter((c) => c && c[0]);
    const hexDe = (n) => (couleurs.find((c) => c[0].toLowerCase() === String(n).toLowerCase()) || [])[1] || '';
    const grilles = [...(opt.tailles && opt.tailles.length ? [['produit', `Grille du produit (${opt.tailles.join(' ')})`, opt.tailles.map(String)]] : []), ...GRILLES];
    const det = Array.isArray(opt.detail) ? opt.detail.filter((x) => +x.qte > 0) : [];
    // grille de départ : celle du produit ; sinon celle qui contient toutes les tailles déjà saisies ; sinon XS → 3XL
    const deja = [...new Set(det.map((x) => x.taille))];
    let g = grilles.find((x) => deja.every((t) => x[2].includes(t))) || grilles[0];
    let tailles = [...g[2], ...deja.filter((t) => !g[2].includes(t))];
    const lignes = []; // [{ c, q: {taille: n} }]
    for (const x of det) { let l = lignes.find((y) => y.c === (x.couleur || '')); if (!l) { l = { c: x.couleur || '', q: {} }; lignes.push(l); } l.q[x.taille || 'TU'] = (l.q[x.taille || 'TU'] || 0) + (+x.qte || 0); }
    if (!lignes.length) lignes.push({ c: couleurs.length === 1 ? couleurs[0][0] : '', q: {} });

    const hote = opt.hote || document.body;
    const el = document.createElement('div'); el.id = 'grillepop'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    const opts = (sel) => `<option value="">— Couleur —</option>${couleurs.map((c) => `<option ${c[0] === sel ? 'selected' : ''}>${esc(c[0])}</option>`).join('')}${sel && !hexDe(sel) ? `<option selected>${esc(sel)}</option>` : ''}<option value="__autre">Autre couleur…</option>`;
    const tot = () => lignes.reduce((s, l) => s + tailles.reduce((a, t) => a + (+l.q[t] || 0), 0), 0);
    const dessiner = (focus) => {
      const col = tailles.map((t) => lignes.reduce((s, l) => s + (+l.q[t] || 0), 0)), tg = col.reduce((a, b) => a + b, 0);
      el.innerHTML = `<div class="gp"><div class="gp-h"><div><b>${esc(opt.titre || 'Quantités par couleur et par taille')}</b><small>Une ligne par couleur · tapez les quantités dans les cases (vides = 0)</small></div>
          <label class="gp-l">Grille de tailles<select data-g>${grilles.map((x) => `<option value="${x[0]}" ${x[0] === g[0] ? 'selected' : ''}>${esc(x[1])}</option>`).join('')}</select></label></div>
        <div class="gp-c"><table><thead><tr><th class="l">Couleur</th>${tailles.map((t) => `<th>${esc(t)}</th>`).join('')}<th>Total</th><th></th></tr></thead><tbody>
          ${lignes.map((l, i) => `<tr><td class="l"><div class="coul"><span class="dot" style="background:${esc(hexDe(l.c) || 'transparent')}"></span><select data-c="${i}">${opts(l.c)}</select></div></td>
            ${tailles.map((t, k) => `<td class="q"><input data-i="${i}" data-k="${k}" inputmode="numeric" autocomplete="off" aria-label="${esc(l.c || 'Couleur')} ${esc(t)}" value="${+l.q[t] || ''}" class="${+l.q[t] ? 'v' : ''}"></td>`).join('')}
            <td class="t" data-tl="${i}">${tailles.reduce((a, t) => a + (+l.q[t] || 0), 0)}</td><td>${lignes.length > 1 ? `<button type="button" class="x" data-del="${i}" title="Retirer cette couleur">✕</button>` : ''}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td class="l">Total</td>${col.map((v, k) => `<td data-tc="${k}">${v || ''}</td>`).join('')}<td class="tg" data-tg>${tg}</td><td></td></tr></tfoot></table>
          <div class="gp-a"><button type="button" class="btn ghost sm" data-add>+ Couleur</button><input class="r" data-r placeholder="Saisie rapide pour la dernière couleur : M12 L10 XL5 puis Entrée"><button type="button" class="btn ghost sm" data-raz>Tout à zéro</button></div></div>
        <div class="gp-f"><span class="hint">Tab, flèches ou Entrée pour passer d’une case à l’autre · Échap pour annuler</span><span><button type="button" class="btn ghost" data-x>Annuler</button> <button type="button" class="btn" data-ok>Valider → Qté <span data-okt>${tg}</span></button></span></div></div>`;
      if (focus) { const n = el.querySelector(focus); if (n) { n.focus(); n.select && n.select(); } }
    };
    const majTotaux = () => {
      lignes.forEach((l, i) => { const c = el.querySelector(`[data-tl="${i}"]`); if (c) c.textContent = tailles.reduce((a, t) => a + (+l.q[t] || 0), 0); });
      tailles.forEach((t, k) => { const c = el.querySelector(`[data-tc="${k}"]`); if (c) c.textContent = lignes.reduce((s, l) => s + (+l.q[t] || 0), 0) || ''; });
      const tg = tot(); el.querySelector('[data-tg]').textContent = tg; el.querySelector('[data-okt]').textContent = tg;
    };
    const fin = (r) => { el.remove(); document.removeEventListener('keydown', esc_, true); resolve(r); };
    const valider = () => {
      const sansC = lignes.filter((l) => !l.c && tailles.some((t) => +l.q[t] > 0));
      if (sansC.length && couleurs.length && !confirm('Une ligne a des quantités sans couleur choisie. Valider quand même (couleur vide) ?')) return;
      const out = []; for (const l of lignes) for (const t of tailles) if (+l.q[t] > 0) out.push({ couleur: l.c, taille: t, qte: +l.q[t] });
      fin(out);
    };
    const esc_ = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fin(null); } };
    el.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.i !== undefined) { const v = ent(t.value); if (String(v || '') !== t.value) t.value = v || ''; lignes[+t.dataset.i].q[tailles[+t.dataset.k]] = v; t.classList.toggle('v', v > 0); majTotaux(); }
    });
    el.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.g !== undefined) { g = grilles.find((x) => x[0] === t.value) || g; const pris = [...new Set(lignes.flatMap((l) => Object.keys(l.q).filter((k) => +l.q[k] > 0)))]; tailles = [...g[2], ...pris.filter((x) => !g[2].includes(x))]; dessiner('[data-i="0"][data-k="0"]'); }
      if (t.dataset.c !== undefined) {
        const i = +t.dataset.c; let v = t.value;
        if (v === '__autre') { v = (prompt('Nom de la couleur :', '') || '').trim().slice(0, 60); if (!v) { dessiner(); return; } }
        if (v && lignes.some((l, j) => j !== i && l.c.toLowerCase() === v.toLowerCase())) { alert(`La couleur « ${v} » a déjà sa ligne.`); dessiner(); return; }
        lignes[i].c = v; dessiner(`[data-i="${i}"][data-k="0"]`);
      }
    });
    el.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t.dataset.r !== undefined && e.key === 'Enter') {
        e.preventDefault(); const l = lignes[lignes.length - 1]; let n = 0;
        // « M10 L6 XL5 », « 3XL2 », « 10A4 » (lettres collées) ou « 42:5 » / « 42x5 » (tailles numériques : séparateur obligatoire)
        for (const m of t.value.toUpperCase().matchAll(/(?:(\d{2,3})\s*[X×:=*]\s*(\d+)|(\d{0,2}[A-Z]+)\s*[X×:=*]?\s*(\d+))(?=[\s,;]|$)/g)) {
          let tt = m[1] || m[3]; const q = +(m[1] ? m[2] : m[4]);
          if (!tailles.includes(tt) && /^\d+A$/.test(tt) && tailles.includes(tt.slice(0, -1))) tt = tt.slice(0, -1);
          if (!tailles.includes(tt) && /^X{2,}L$/.test(tt) && tailles.includes(`${tt.length - 1}XL`)) tt = `${tt.length - 1}XL`;
          if (!tailles.includes(tt)) continue;
          l.q[tt] = q; n++;
        }
        dessiner('[data-r]'); if (!n) alert('Aucune taille reconnue. Exemple : M12 L10 XL5 (tailles de la grille affichée).');
        return;
      }
      if (t.dataset.i === undefined) return;
      const d = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0], Enter: [0, 1] }[e.key];
      if (!d) return;
      if ((e.key === 'ArrowRight' && t.selectionStart < t.value.length) || (e.key === 'ArrowLeft' && t.selectionStart > 0)) return;
      e.preventDefault();
      let i = +t.dataset.i + d[0], k = +t.dataset.k + d[1];
      if (e.key === 'Enter' && k >= tailles.length) { i += 1; k = 0; }
      if (e.key === 'Enter' && i >= lignes.length) { el.querySelector('[data-ok]').focus(); return; }
      const n = el.querySelector(`[data-i="${i}"][data-k="${k}"]`); if (n) { n.focus(); n.select(); }
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) { if (e.target === el) fin(null); return; }
      if (b.hasAttribute('data-x')) fin(null);
      else if (b.hasAttribute('data-ok')) valider();
      else if (b.hasAttribute('data-add')) { const libre = couleurs.find((c) => !lignes.some((l) => l.c === c[0])); lignes.push({ c: '', q: {} }); dessiner(`[data-c="${lignes.length - 1}"]`); }
      else if (b.dataset.del !== undefined) { lignes.splice(+b.dataset.del, 1); dessiner(); }
      else if (b.hasAttribute('data-raz')) { for (const l of lignes) l.q = {}; dessiner('[data-i="0"][data-k="0"]'); }
    });
    document.addEventListener('keydown', esc_, true);
    hote.appendChild(el);
    const k0 = Math.max(0, tailles.findIndex((t) => +lignes[0].q[t] > 0));
    dessiner(lignes[0].c || !couleurs.length ? `[data-i="0"][data-k="${k0}"]` : '[data-c="0"]');
  });
}

/** Éclate une ligne à détail en lignes simples (une par couleur × taille) : pour les commandes et les BL (stock par taille et couleur). */
export function eclater(l, faire) {
  if (!Array.isArray(l.detail) || !l.detail.length) return [faire(l, l.color ?? l.couleur ?? '', l.size ?? l.taille ?? '', l.qty ?? l.qte)];
  return l.detail.filter((x) => +x.qte > 0).map((x) => faire(l, x.couleur || '', x.taille || '', +x.qte));
}
