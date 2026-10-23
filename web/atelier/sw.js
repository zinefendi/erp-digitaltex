// Atelier DIGITAL-TEX — service worker de la PWA (CDC §4.6.4).
// Coquille en cache pour que la dernière liste et les fiches consultées restent lisibles
// en cas de coupure Wi-Fi ; les appels /api/ ne sont JAMAIS servis du cache (les validations
// et pointages sont mis en file par atelier.js et envoyés au retour du réseau).
const CACHE = 'atelier-v1';
const COQUILLE = [
  '/atelier/', '/atelier/index.html', '/atelier/atelier.js', '/atelier/atelier.css',
  '/atelier/manifest.webmanifest', '/atelier/icon-192.png', '/atelier/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(COQUILLE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((cles) => Promise.all(cles.filter((k) => k !== CACHE).map((k) => k.delete(cles ? k : CACHE)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || !url.pathname.startsWith('/atelier/')) return; // API et POST : réseau direct
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((c) => c || fetch(e.request).then((r) => {
      if (r.ok) { const copie = r.clone(); caches.open(CACHE).then((k) => k.put(e.request, copie)); }
      return r;
    }))
  );
});
