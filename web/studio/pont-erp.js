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

  // 0.10.1 : fichiers (scans des moyens de paiement, fiches techniques) — corps brut, type vérifié par le serveur
  async function envoyerFichier(q, bytes, type) {
    let r;
    try { r = await fetch(API + '/fichiers?' + new URLSearchParams(q), { method: 'POST', credentials: 'same-origin', headers: { 'content-type': type || 'application/octet-stream' }, body: bytes }); }
    catch (_) { throw new Error('Serveur injoignable : vérifiez la connexion Internet.'); }
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) post('session-expiree');
    if (!r.ok) throw new Error(d.message || 'Erreur du serveur (' + r.status + ')');
    return d;
  }
  async function ouvrirFiche(reference, commande) {
    const w = window.open('', '_blank');
    try {
      const q = new URLSearchParams(); if (reference) q.set('reference', reference); if (commande) q.set('commande', commande);
      const r = await api('GET', '/fichiers/fiche?' + q);
      if (r.fichier) { if (w) w.location = API + '/fichiers/' + r.fichier.id; else window.open(API + '/fichiers/' + r.fichier.id, '_blank'); }
      else if (r.illustration && w) { w.document.title = 'Fiche ' + (reference || ''); w.document.body.style.margin = '0'; const i = w.document.createElement('img'); i.src = r.illustration; i.style.maxWidth = '100%'; w.document.body.appendChild(i); }
      return true;
    } catch (e) { if (w) w.close(); throw e; }
  }

  let CAT_VERSION;
  window.uniformDesktop = {
    version: 'erp-web',
    erp: true,
    saveFile: async (name, bytes) => {
      const ext = String(name).split('.').pop().toLowerCase();
      if (ext === 'pdf') ouvrirPdf(name, bytes); else telecharger(name, bytes);
      // 0.10.1 : le PDF des fiches techniques du Studio est aussi rangé sur le serveur, rattaché à la commande
      // (double-clic sur une ligne de commande, de BL ou de facture → la fiche s'ouvre, partout dans l'ERP)
      if (ext === 'pdf' && /^fiches-techniques-/.test(String(name))) {
        envoyerFichier({ nature: 'fiche_technique', cible_type: 'commande', commande_slug: String(name).replace(/\.pdf$/i, ''), nom: name }, bytes, 'application/pdf')
          .catch(() => { /* la commande n'est peut-être pas encore enregistrée : le PDF reste téléchargé */ });
      }
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
    // 0.10.1 : produits finis (saisie par référence), banques émettrices, fichiers
    produits: () => api('GET', '/produits').catch(() => []),
    codesArticle: () => api('GET', '/produits/codes-article').catch(() => []),
    banques: () => api('GET', '/parametres/banques').catch(() => []),
    fichiers: {
      envoyer: (nature, cible_type, cible_id, file) => file.arrayBuffer().then((b) => envoyerFichier({ nature, cible_type, cible_id: cible_id || '', nom: file.name }, new Uint8Array(b), file.type)),
      url: (id) => API + '/fichiers/' + id,
      fiche: ouvrirFiche,
    },
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
