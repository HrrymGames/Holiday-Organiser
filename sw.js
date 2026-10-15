// Offline support: serve the app from cache when there's no signal,
// but always try the network first so updates show up straight away.
const CACHE = "holiday-organiser-v3";
const SHELL = [
  "./", "index.html", "css/styles.css", "manifest.webmanifest",
  "js/app.js", "js/config.js", "js/stats.js", "js/charts.js",
  "js/store/index.js", "js/store/local.js", "js/store/firebase.js",
  "icons/icon.svg", "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // leave Firebase alone
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
