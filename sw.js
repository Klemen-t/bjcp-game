const CACHE_NAME = 'bjcp-game-v1';
// Afegeix aquí tots els fitxers que vols que es carreguin instantàniament
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './logo bo.png', 
  './icon-192.png',
  './icon-512.png'
  // Si tens fitxers .js o .css externs, afegeix-los aquí:
  // './script.js',
  // './style.css'
];

// Instal·lació: guarda els fitxers a la memòria del mòbil
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache obert! Guardant fitxers...');
        return cache.addAll(urlsToCache);
      })
  );
});

// Intercepció de peticions: serveix els fitxers des de la memòria
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Si el fitxer està a la memòria, el donem de seguida
        if (response) {
          return response;
        }
        // Si no, l'anem a buscar a Internet
        return fetch(event.request);
      })
  );
});

// Neteja de caches antics
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
