/* =============================================================
   Service worker — « réseau d'abord », cache de secours.

   Prudence volontaire : l'app est protégée par mot de passe, donc
   une réponse 401/403 ne doit JAMAIS être mise en cache — sinon
   l'écran de connexion resterait figé à la place du dashboard.
   Seules les réponses 200 de même origine sont conservées, et
   jamais les appels /api/ (cours, état synchronisé).
   ============================================================= */

const CACHE = 'wealth-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const nom of await caches.keys()) {
      if (nom !== CACHE) await caches.delete(nom);
    }
    await self.clients.claim();
  })());
});

/* « Réseau d'abord » ne suffisait pas : `fetch(request)` respecte le cache
   HTTP du navigateur, qui pouvait donc resservir un ancien `app.js` sans
   jamais interroger le serveur. Sur iPhone, une app ajoutée à l'écran
   d'accueil garde ce cache très longtemps — on déployait sans rien voir
   changer.

   On force donc une requête conditionnelle : le serveur répond 304 si rien
   n'a bougé, ce qui ne coûte presque rien, et le fichier complet sinon.

   Les navigations sont laissées telles quelles : passer un `init` à `fetch`
   avec une requête en mode `navigate` lève une exception. Ce n'est pas
   génant, le HTML est déjà revalidé à chaque chargement. */
function recuperer(request) {
  if (request.mode === 'navigate') return fetch(request);
  return fetch(request.url, {
    cache: 'no-cache',
    credentials: 'same-origin',
    headers: request.headers,
  });
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;      // toujours frais

  event.respondWith((async () => {
    try {
      const reseau = await recuperer(request);
      // On ne garde que ce qui est réellement servi : pas les 401/403.
      if (reseau.ok && reseau.status === 200) {
        const cache = await caches.open(CACHE);
        cache.put(request, reseau.clone());
      }
      return reseau;
    } catch (e) {
      // Hors connexion : on ressert la dernière version connue.
      const secours = await caches.match(request);
      if (secours) return secours;
      throw e;
    }
  })());
});
