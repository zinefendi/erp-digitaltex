// Uniform Studio 3D — sélecteur de date en français (calendrier uniquement, pas de saisie au clavier).
// Usage : <input data-date value="2026-10-19"> → affiché « 19/10/2026 », valeur ISO dans input.dataset.iso.
// Fonctionne dans le document et dans un shadow root (studio). Émet « input » et « change » à chaque choix.
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const pad = (n) => String(n).padStart(2, '0');
export const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const isoToFr = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
export const frToIso = (fr) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(fr || '').trim()); return m ? `${m[3]}-${pad(m[2])}-${pad(m[1])}` : ''; };
export const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const isoOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

const CSS = `
.dp-pop{position:fixed;z-index:99999;width:276px;background:#fff;color:#16263a;border:1px solid #cfdbe6;border-radius:14px;box-shadow:0 18px 40px rgba(20,35,52,.22);padding:10px;font:13px/1.3 "Instrument Sans",system-ui,"Segoe UI",sans-serif;user-select:none}
.dp-h{display:flex;align-items:center;gap:6px;margin-bottom:6px}
.dp-h b{flex:1;text-align:center;font-size:14px;text-transform:capitalize}
.dp-h select{font:inherit;border:1px solid #dbe3ea;border-radius:7px;padding:3px 4px;background:#fff;color:inherit;min-height:0;width:auto}
.dp-nav{border:0;background:#eef3f8;color:#1f4f7d;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:16px;line-height:1}
.dp-nav:hover{background:#dfeaf5}
.dp-g{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}
.dp-g i{font-style:normal;text-align:center;font-size:11px;font-weight:700;color:#8796a5;padding:4px 0}
.dp-g button{border:0;background:transparent;height:32px;border-radius:8px;cursor:pointer;font:inherit;color:inherit}
.dp-g button:hover{background:#eaf2fa}
.dp-g button.o{color:#b3bfcb}
.dp-g button.t{box-shadow:inset 0 0 0 1.5px #29669d;font-weight:700}
.dp-g button.s{background:#29669d;color:#fff;font-weight:700}
.dp-g button.we:not(.s){color:#8a5a3c}
.dp-g button[disabled]{opacity:.3;cursor:default;background:transparent}
.dp-f{display:flex;gap:6px;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px solid #edf1f5}
.dp-f button{border:1px solid #cfdbe6;background:#fff;color:#1f4f7d;border-radius:8px;padding:5px 10px;cursor:pointer;font:600 12.5px "Instrument Sans",system-ui,"Segoe UI",sans-serif}
.dp-f button.p{background:#29669d;border-color:#29669d;color:#fff}
input[data-date]{cursor:pointer;caret-color:transparent;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' fill='none' stroke='%2329669d' stroke-width='1.8' stroke-linecap='round'%3E%3Crect x='2.5' y='3.5' width='13' height='12' rx='2'/%3E%3Cpath d='M2.5 7.5h13M6 2v3M12 2v3'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 9px center;padding-right:34px!important}
`;

function ensureStyle(root) {
  const host = root.host ? root : document.head;
  if ((root.host ? root : document).querySelector && (root.host ? root : document).querySelector('style[data-dp]')) return;
  const st = document.createElement('style'); st.dataset.dp = '1'; st.textContent = CSS; host.appendChild(st);
}

let open = null;
function close() { if (open) { open.pop.remove(); document.removeEventListener('mousedown', open.out, true); window.removeEventListener('keydown', open.key, true); window.removeEventListener('resize', close); open = null; } }

function show(input, root) {
  close();
  const iso = input.dataset.iso || '';
  const base = iso || input.dataset.min || isoToday();
  let y = +base.slice(0, 4), m = +base.slice(5, 7) - 1;
  const pop = document.createElement('div'); pop.className = 'dp-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Choisir une date');
  const min = input.dataset.min || '', max = input.dataset.max || '';
  const draw = () => {
    const first = new Date(y, m, 1), start = (first.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate(), prevDays = new Date(y, m, 0).getDate();
    const today = isoToday(), cur = input.dataset.iso || '';
    let cells = '';
    for (let i = 0; i < 42; i++) {
      let d, mm = m, yy = y, o = '';
      if (i < start) { d = prevDays - start + i + 1; mm = m - 1; o = 'o'; } else if (i >= start + days) { d = i - start - days + 1; mm = m + 1; o = 'o'; } else d = i - start + 1;
      if (mm < 0) { mm = 11; yy--; } if (mm > 11) { mm = 0; yy++; }
      const v = isoOf(yy, mm, d), dis = (min && v < min) || (max && v > max);
      cells += `<button type="button" data-v="${v}" class="${o} ${v === today ? 't' : ''} ${v === cur ? 's' : ''} ${i % 7 >= 5 ? 'we' : ''}" ${dis ? 'disabled' : ''} aria-label="${d} ${MOIS[mm]} ${yy}">${d}</button>`;
      if (i === 34 && start + days <= 35) break;
    }
    const years = []; for (let k = y - 3; k <= y + 4; k++) years.push(k);
    pop.innerHTML = `<div class="dp-h"><button type="button" class="dp-nav" data-n="-1" aria-label="Mois précédent">‹</button><b>${MOIS[m]}</b>
      <select data-y aria-label="Année">${years.map((k) => `<option ${k === y ? 'selected' : ''}>${k}</option>`).join('')}</select>
      <button type="button" class="dp-nav" data-n="1" aria-label="Mois suivant">›</button></div>
      <div class="dp-g">${JOURS.map((j) => `<i>${j}</i>`).join('')}${cells}</div>
      <div class="dp-f"><button type="button" data-today>Aujourd’hui</button>${input.hasAttribute('required') ? '' : '<button type="button" data-clear>Effacer</button>'}<button type="button" class="p" data-close>Fermer</button></div>`;
  };
  const set = (v) => {
    input.dataset.iso = v; input.value = isoToFr(v);
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
    close(); input.focus();
  };
  pop.addEventListener('mousedown', (e) => e.stopPropagation());
  pop.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; e.preventDefault();
    if (b.dataset.n) { m += +b.dataset.n; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } draw(); }
    else if (b.dataset.v) set(b.dataset.v);
    else if (b.hasAttribute('data-today')) { const t = isoToday(); if ((!min || t >= min) && (!max || t <= max)) set(t); else { y = +t.slice(0, 4); m = +t.slice(5, 7) - 1; draw(); } }
    else if (b.hasAttribute('data-clear')) set('');
    else if (b.hasAttribute('data-close')) close();
  });
  pop.addEventListener('change', (e) => { if (e.target.matches('[data-y]')) { y = +e.target.value; draw(); } });
  draw();
  (root.host ? root : document.body).appendChild(pop);
  const r = input.getBoundingClientRect(), ph = pop.offsetHeight, pw = pop.offsetWidth;
  let top = r.bottom + 6; if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
  let left = Math.min(r.left, window.innerWidth - pw - 8);
  pop.style.top = top + 'px'; pop.style.left = Math.max(8, left) + 'px';
  const out = (e) => { const path = e.composedPath ? e.composedPath() : []; if (!path.includes(pop) && !path.includes(input)) close(); };
  const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('mousedown', out, true); window.addEventListener('keydown', key, true); window.addEventListener('resize', close);
  open = { pop, out, key, input };
}

/** Active les calendriers sur tous les input[data-date] de root (document ou shadowRoot). */
export function attachDatePickers(root = document) {
  ensureStyle(root);
  for (const el of root.querySelectorAll('input[data-date]:not([data-dp-on])')) {
    el.dataset.dpOn = '1'; el.readOnly = true; el.autocomplete = 'off'; el.type = 'text';
    if (!el.placeholder) el.placeholder = 'jj/mm/aaaa';
    const v = el.dataset.iso || el.getAttribute('value') || '';
    const iso = /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : frToIso(v);
    el.dataset.iso = iso; el.value = isoToFr(iso);
    el.title ||= 'Cliquez pour choisir la date dans le calendrier';
    el.addEventListener('click', () => show(el, root));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); show(el, root); }
      else if (e.key !== 'Tab') e.preventDefault(); // pas de saisie manuelle
    });
    el.addEventListener('paste', (e) => e.preventDefault());
  }
}
export const closeDatePicker = close;
