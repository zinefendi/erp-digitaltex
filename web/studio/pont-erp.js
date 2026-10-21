// Pont ERP : remplace le pont Windows (preload Electron) quand le studio, la Gestion et le Catalogue
// tournent dans l'ERP web. Même interface « window.uniformDesktop », mais les données vivent sur le serveur.
(function () {
  'use strict';
  const API = '/api';
  const post = (type, data) => { try { window.parent.postMessage({ erp: true, type, ...data }, location.origin); } catch (_) { /* */ } };

  async function api(method, url, body, raw) {
    const opt = { method, credentials: 'same-origin', headers: {} };
    if (raw) { opt.headers['content-type'] = 'model/gltf-binary'; opt.body = raw; }
    else if (body !== undefined) { opt.headers['content-type'] = 'application/json'; opt.body = JSON.stringify(body); }
    let r;
    try { r = await fetch(API + url, opt); } catch (_) { throw new Error('Serveur injoignable : vérifiez la connexion Internet.'); }
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) post('session-expiree');
    if (!r.ok) throw new Error(d.message || 'Erreur du serveur (' + r.status + ')');
    return d;
  }
  const u8 = (b) => (b instanceof Uint8Array ? b : new Uint8Array(b));
  const telecharger = (name, bytes, type) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([u8(bytes)], { type: type || 'application/octet-stream' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  };
  const ouvrirPdf = (name, bytes) => {
    const url = URL.createObjectURL(new Blob([u8(bytes)], { type: 'application/pdf' }));
    const w = window.open(url, '_blank');
    if (!w) telecharger(name, bytes, 'application/pdf');
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  };

  // ---------- gestion : cache local + écritures enregistrement par enregistrement ----------
  let DB = null, REV = null;
  const ecouteurs = [];
  const KIND_OK = ['order', 'bl', 'invoice', 'receipt'];
  async function charger() { DB = await api('GET', '/commercial/gestion'); REV = DB.revision; return DB; }
  // un autre poste a modifié quelque chose → on recharge et on prévient l'écran
  setInterval(async () => {
    if (document.hidden || !ecouteurs.length) return;
    try { const r = await api('GET', '/commercial/revision'); if (REV !== null && r.revision !== REV) { await charger(); ecouteurs.forEach((f) => f()); } } catch (_) { /* hors ligne */ }
  }, 15000);

  let CAT_VERSION;
  window.uniformDesktop = {
    version: 'erp-web',
    erp: true,
    saveFile: async (name, bytes) => {
      const ext = String(name).split('.').pop().toLowerCase();
      if (ext === 'pdf') ouvrirPdf(name, bytes); else telecharger(name, bytes);
      return { path: name };
    },
    catalogue: {
      get: async () => { const r = await api('GET', '/infographie/catalogue'); CAT_VERSION = r.version; return { catalogue: r.catalogue, custom: true, dir: 'serveur app.vethypro.com', prix_visibles: r.prix_visibles }; },
      factory: () => api('GET', '/infographie/catalogue-usine'),
      save: async (c) => { const r = await api('PUT', '/infographie/catalogue', { catalogue: c, version: CAT_VERSION }); CAT_VERSION = r.version; post('catalogue-enregistre'); return { ok: true }; },
      reset: async () => { const f = await api('GET', '/infographie/catalogue-usine'); const r = await api('PUT', '/infographie/catalogue', { catalogue: f, version: CAT_VERSION }); CAT_VERSION = r.version; return { ok: true }; },
      saveModel: (id, bytes) => api('POST', '/infographie/modeles/' + encodeURIComponent(id), undefined, u8(bytes)),
      importFile: () => new Promise((res, rej) => {
        const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,.usc,application/json';
        i.onchange = async () => {
          try {
            const raw = JSON.parse(await i.files[0].text()); const c = raw.catalogue || raw;
            if (raw.glb) for (const [id, b64] of Object.entries(raw.glb)) {
              const bin = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
              const s = await api('POST', '/infographie/modeles/' + encodeURIComponent(id), undefined, bin);
              if (c.models[id]) c.models[id].url = s.url;
            }
            res({ catalogue: c });
          } catch (e) { rej(e); }
        };
        i.oncancel = () => res({ canceled: true }); i.click();
      }),
      exportFile: async (c) => { telecharger('catalogue-uniform-studio-3d-' + new Date().toISOString().slice(0, 10) + '.json', new TextEncoder().encode(JSON.stringify({ format: 'uniform-studio-3d', version: 1, catalogue: c })), 'application/json'); return { path: 'téléchargement' }; },
    },
    db: {
      get: async () => (DB || (await charger())),
      put: async (col, rec) => { const r = await api('PUT', '/commercial/' + col, rec); await charger(); post('donnees-modifiees'); return r; },
      del: async (col, id) => { await api('DELETE', '/commercial/' + col + '/' + encodeURIComponent(id)); await charger(); return true; },
      // numéro officiel attribué par le serveur : renvoie le rang N (le studio formate PREFIXE-AAAA-NNNN)
      next: async (kind, year) => {
        if (!KIND_OK.includes(kind)) throw new Error('Type de numéro inconnu');
        const d = (+year || new Date().getFullYear()) + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0');
        const r = await api('POST', '/commercial/numero', { kind, date: d });
        return +String(r.numero).split('-').pop();
      },
      peek: async (kind) => (await api('GET', '/commercial/numero/' + kind)).suivant,
      setCounter: async () => { throw new Error('Les compteurs sont gérés par le serveur (Paramètres › Numérotation) : ils ne se modifient pas.'); },
      exportFile: async () => { const d = await charger(); telecharger('gestion-' + new Date().toISOString().slice(0, 10) + '.json', new TextEncoder().encode(JSON.stringify({ format: 'uniform-studio-3d-gestion', version: 1, data: d })), 'application/json'); return { path: 'téléchargement' }; },
      importFile: async () => { throw new Error('Les données sont sur le serveur et sauvegardées chaque nuit : la restauration se fait par le Super administrateur.'); },
      onChange: (fn) => { ecouteurs.push(fn); },
    },
    docs: {
      save: async (kind, name, bytes, open) => { if (open === false) telecharger(name + '.pdf', bytes, 'application/pdf'); else ouvrirPdf(name + '.pdf', bytes); return { path: name + '.pdf' }; },
      open: async () => ({ ok: false }),
      folder: async () => { alert('Dans l’ERP web, les PDF s’ouvrent dans un nouvel onglet ou se téléchargent dans votre dossier Téléchargements.'); return true; },
    },
    // ERP 0.7.0 : articles et prestations hors Studio (sans prix pour les comptes sans le droit « prix »)
    articles: () => api('GET', '/commercial/articles'),
    openWindow: async (page) => { post('ouvrir', { page }); return true; },
    notify: async (ch, data) => { post('notify', { ch, data }); return true; },
    _rafraichir: async () => { try { await charger(); ecouteurs.forEach((f) => f()); } catch (_) { /* */ } },
    onNotify: (fn) => { window.addEventListener('message', (e) => { if (e.origin === location.origin && e.data && e.data.erp && e.data.type === 'notify') fn(e.data.ch, e.data.data); }); },
    reload: async () => { location.reload(); },
    onOpenSettings: () => {},
  };
})();

// L'ERP signale qu'un autre écran (studio, gestion) vient d'écrire : on recharge tout de suite.
window.addEventListener('message', async (e) => {
  if (e.origin !== location.origin || !e.data || !e.data.erp || e.data.type !== 'rafraichir') return;
  if (window.uniformDesktop && window.uniformDesktop._rafraichir) await window.uniformDesktop._rafraichir();
});
