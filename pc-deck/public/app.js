// PC Deck — painel do celular
const KEYS_PER_PAGE = 15; // matriz 3×5 (5×3 deitado), como um Stream Deck MK.2

const $ = (s) => document.querySelector(s);
const keysEl = $('#keys');
const pagesEl = $('#pages');
const power = $('#power');
const powerText = $('#power-text');
const strip = $('.strip');
const stripMsg = $('#strip-msg');

// token vem do QR code: https://host/#t=TOKEN
(function captureToken() {
  const m = location.hash.match(/[#&]t=([\w-]+)/);
  if (m) {
    try { localStorage.setItem('pcdeck.token', m[1]); } catch {}
    history.replaceState(null, '', location.pathname);
  }
})();
const token = (() => { try { return localStorage.getItem('pcdeck.token'); } catch { return null; } })();

let deck = null;
let page = 0;
try { page = Number(localStorage.getItem('pcdeck.page')) || 0; } catch {}

function api(path, opts = {}) {
  return fetch(path, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    cache: 'no-store',
  });
}

function setOnline(online) {
  power.classList.toggle('online', online);
  power.classList.toggle('offline', !online);
  powerText.textContent = online ? 'online' : 'offline';
  power.setAttribute('aria-label', `Status da conexão: ${online ? 'online' : 'offline'}. Toque para reconectar.`);
}

function showUnpaired() {
  $('#unpaired').hidden = false;
  keysEl.hidden = true;
}

// mensagem escrita na própria faixa LCD, no lugar dos medidores
let msgTimer;
function lcdMessage(title, text) {
  stripMsg.querySelector('b').textContent = title;
  stripMsg.querySelector('span').textContent = text;
  strip.classList.add('msg');
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => strip.classList.remove('msg'), 3600);
}

function buzz(ms) { try { navigator.vibrate?.(ms); } catch {} }

function renderPages() {
  pagesEl.innerHTML = '';
  if (deck.pages.length < 2) return;
  deck.pages.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', `Página ${p.name}`);
    if (i === page) b.setAttribute('aria-current', 'page');
    b.onclick = () => { page = i; try { localStorage.setItem('pcdeck.page', i); } catch {} render(); };
    pagesEl.append(b);
  });
}

// curso físico: a tecla afunda e vibra no toque, a ação dispara ao soltar (click)
function wireTravel(el) {
  let downAt = 0;
  const release = () => {
    if (!el.classList.contains('pressed')) return;
    const held = performance.now() - downAt;
    setTimeout(() => el.classList.remove('pressed'), Math.max(0, 90 - held));
  };
  el.addEventListener('pointerdown', () => { downAt = performance.now(); el.classList.add('pressed'); buzz(10); });
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('pointerleave', release);
}

function makeKey(btn) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'key';
  const lcd = document.createElement('span');
  lcd.className = 'lcd';
  if (btn) {
    el.setAttribute('aria-label', btn.label);
    el.title = btn.label;
    const img = document.createElement('img');
    img.src = btn.image;
    img.alt = '';
    img.draggable = false;
    lcd.append(img);
    wireTravel(el);
    el.addEventListener('click', () => press(el, btn));
  } else {
    el.disabled = true;
    el.setAttribute('aria-hidden', 'true');
    el.tabIndex = -1;
  }
  const flash = document.createElement('span');
  flash.className = 'flash';
  lcd.append(flash);
  el.append(lcd);
  return el;
}

function render() {
  if (!deck) return;
  if (page >= deck.pages.length) page = 0;
  document.title = deck.title;
  $('#title').textContent = deck.title;
  renderPages();
  const buttons = deck.pages[page].buttons.slice(0, KEYS_PER_PAGE);
  keysEl.innerHTML = '';
  for (let i = 0; i < KEYS_PER_PAGE; i++) keysEl.append(makeKey(buttons[i]));
}

async function press(el, btn) {
  if (el.classList.contains('busy')) return;
  el.classList.remove('ok', 'err');
  void el.offsetWidth; // reinicia a animação se tocar duas vezes seguidas
  el.classList.add('busy');
  try {
    const r = await api(`/api/run/${encodeURIComponent(btn.id)}`, { method: 'POST' });
    if (r.status === 401) { showUnpaired(); return; }
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(body.error || 'O PC recusou o comando.'), { fromPc: true });
    el.classList.add('ok');
    setOnline(true);
  } catch (e) {
    el.classList.add('err');
    buzz([40, 60, 40]);
    if (e.fromPc) {
      lcdMessage(`${btn.label} não abriu`, e.message);
    } else {
      setOnline(false);
      lcdMessage('PC fora do ar', 'Confira se o agente está rodando no PC.');
    }
  } finally {
    el.classList.remove('busy');
    setTimeout(() => el.classList.remove('ok', 'err'), 950);
    enterFullscreenOnce(); // depois do toque, para não deslocar a tecla no meio dele
  }
}

async function load() {
  if (!token) { showUnpaired(); return; }
  try {
    const r = await api('/api/deck');
    if (r.status === 401) { showUnpaired(); return; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    deck = await r.json();
    try { localStorage.setItem('pcdeck.deck', JSON.stringify(deck)); } catch {}
    setOnline(true);
  } catch {
    try { deck = JSON.parse(localStorage.getItem('pcdeck.deck')); } catch {}
    setOnline(false);
  }
  render();
}

// ---------- faixa LCD: CPU / RAM / GPU ----------
function setSeg(key, pct, detail) {
  const seg = document.querySelector(`.seg[data-k="${key}"]`);
  const has = typeof pct === 'number';
  seg.querySelector('b').textContent = has ? Math.round(pct) : '–';
  seg.querySelector('.seg-bar span').style.width = has ? `${Math.max(0, Math.min(100, pct))}%` : '0';
  seg.querySelector('.seg-detail').textContent = detail || ' ';
  seg.classList.toggle('warn', has && pct >= 70 && pct < 90);
  seg.classList.toggle('hot', has && pct >= 90);
}

const gb = (b) => (b / 1024 ** 3).toFixed(1);
let statsTimer = null;

async function pollStats() {
  clearTimeout(statsTimer);
  if (!token || document.visibilityState !== 'visible') return;
  try {
    const r = await api('/api/stats');
    if (r.ok) {
      const s = await r.json();
      setSeg('cpu', s.cpu, s.cpu == null ? 'lendo…' : s.cpuCores ? `${s.cpuCores} núcleos` : '');
      setSeg('ram', s.ram.pct, `${gb(s.ram.used)} / ${gb(s.ram.total)} GB`);
      setSeg('gpu', s.gpu, s.gpu == null ? 'lendo…' : s.gpuName || '');
    }
  } catch {
    ['cpu', 'ram', 'gpu'].forEach((k) => setSeg(k, null));
  }
  statsTimer = setTimeout(pollStats, 2000);
}

// ---------- tela cheia ----------
// Instalado como app, o manifest já abre em tela cheia. No navegador, entra no primeiro toque
// (o Android só permite a partir de um gesto) e o botão ao lado da marca alterna.
const fsBtn = $('#fullscreen');
const fsSupported = document.fullscreenEnabled && !matchMedia('(display-mode: fullscreen)').matches;
let userLeftFullscreen = false;

const isFullscreen = () => !!document.fullscreenElement;

async function enterFullscreen() {
  if (isFullscreen() || !document.fullscreenEnabled) return;
  try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch {}
}
function enterFullscreenOnce() {
  if (fsSupported && !userLeftFullscreen) enterFullscreen();
}

if (fsSupported) {
  fsBtn.hidden = false;
  fsBtn.addEventListener('click', async () => {
    if (isFullscreen()) { userLeftFullscreen = true; await document.exitFullscreen().catch(() => {}); }
    else { userLeftFullscreen = false; await enterFullscreen(); }
  });
  // toque fora das teclas também entra (nas teclas, entra depois da ação, em press())
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.key, .fs-btn')) enterFullscreenOnce();
  }, { capture: true });
  const sync = () => {
    fsBtn.classList.toggle('on', isFullscreen());
    fsBtn.setAttribute('aria-label', isFullscreen() ? 'Sair da tela cheia' : 'Tela cheia');
  };
  document.addEventListener('fullscreenchange', sync);
  sync();
}

// mantém a tela acesa enquanto o deck está aberto
async function keepAwake() {
  try { if (document.visibilityState === 'visible') await navigator.wakeLock?.request('screen'); } catch {}
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { load(); keepAwake(); }
  pollStats();
});
power.addEventListener('click', load);

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

load();
pollStats();
keepAwake();
