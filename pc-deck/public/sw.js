// Cache só da "casca" do app; a API sempre vai para a rede.
// Ícones novos (enviados pelo editor) entram no cache no primeiro uso, pelo fetch abaixo.
const CACHE = 'pcdeck-v10';
const SHELL = ['/', '/index.html', '/style.css', '/app.js', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png',
  '/icons/claude.png', '/icons/codex.png', '/icons/vscode.png', '/icons/youtube.png',
  '/icons/google.png', '/icons/outlook.png', '/icons/github.svg', '/icons/gemini.png', '/icons/teams.png', '/icons/explorer.png', '/icons/snipping.png', '/icons/termius.png', '/icons/docker.png',
  '/icons/voltar.svg', '/icons/pasta.svg', '/icons/ideia.svg', '/icons/musica.svg', '/icons/anterior.svg', '/icons/proxima.svg',
  '/icons/volume-menos.svg', '/icons/volume-mais.svg', '/icons/mudo.svg', '/icons/tocar-pausar.svg',
  '/icons/sol.svg', '/icons/codigo.svg', '/icons/cadeado.svg', '/icons/lua.svg',
  '/fonts/barlow-condensed-500.woff2', '/fonts/barlow-condensed-600.woff2', '/fonts/barlow-condensed-700.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // network-first: pega versão nova quando o PC está no ar, cai para o cache quando não está
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html')))
  );
});
