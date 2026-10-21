// Pilotage des onglets depuis le menu de l'ERP (le parent envoie {erp:true,type:'onglet',onglet:'orders'}).
(function () {
  'use strict';
  const PRIX = new URLSearchParams(location.search).get('prix') !== '0';
  // Société & factures : gérée dans Paramètres ERP › Société (une seule source de vérité)
  const soc = document.querySelector('.tabs [data-tab="company"]');
  if (soc) soc.style.display = 'none';
  if (!PRIX) { const t = document.querySelector('.tabs [data-tab="prices"]'); if (t) t.style.display = 'none'; }
  const aller = (o) => { const b = document.querySelector('.tabs [data-tab="' + o + '"]'); if (b && b.style.display !== 'none') b.click(); };
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || !e.data.erp) return;
    if (e.data.type === 'onglet') aller(e.data.onglet);
  });
  document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.addEventListener('click', () => {
    try { window.parent.postMessage({ erp: true, type: 'onglet-actif', page: location.pathname.split('/').pop(), onglet: b.dataset.tab }, location.origin); } catch (_) { /* */ }
  }));
  const o = new URLSearchParams(location.search).get('onglet');
  if (o) setTimeout(() => aller(o), 50);
  try { window.parent.postMessage({ erp: true, type: 'page-prete', page: location.pathname.split('/').pop() }, location.origin); } catch (_) { /* */ }
})();
