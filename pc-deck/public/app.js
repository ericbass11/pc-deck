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
let stack = [];      // pastas abertas, da mais externa para a mais interna
let lastLive = {};   // último estado das teclas vivas
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
function lcdMessage(title, text, tone = 'err') {
  stripMsg.querySelector('b').textContent = title;
  stripMsg.querySelector('span').textContent = text;
  strip.classList.toggle('msg-ok', tone === 'ok');
  strip.classList.add('msg');
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => strip.classList.remove('msg'), 3600);
}

function buzz(ms) { try { navigator.vibrate?.(ms); } catch {} }

// ---------- navegação: páginas e pastas ----------
function currentButtons() {
  return stack.length ? stack[stack.length - 1].buttons : deck.pages[page].buttons;
}

function findIn(buttons, id) {
  for (const b of buttons) {
    if (b.id === id) return b;
    if (b.buttons) { const f = findIn(b.buttons, id); if (f) return f; }
  }
  return null;
}

// depois de recarregar o deck, reabre as mesmas pastas (se ainda existirem)
function restoreStack() {
  const ids = stack.map((f) => f.id);
  stack = [];
  for (const id of ids) {
    const f = findIn(stack.length ? stack[stack.length - 1].buttons : deck.pages[page].buttons, id);
    if (!f || f.kind !== 'folder') break;
    stack.push(f);
  }
}

function openFolder(btn) {
  stack.push(btn);
  buzz(8);
  render();
}
function closeFolder() {
  stack.pop();
  render();
}

function renderPages() {
  pagesEl.innerHTML = '';
  if (stack.length || deck.pages.length < 2) return;
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

function iconImg(src) {
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.draggable = false;
  return img;
}

// tela da pasta: miniaturas das 4 primeiras teclas, como uma pasta de celular
function folderFace(btn) {
  const mini = document.createElement('span');
  mini.className = 'mini';
  for (const child of btn.buttons.slice(0, 4)) {
    const cell = document.createElement('span');
    if (child.image) cell.append(iconImg(child.image));
    else if (child.kind === 'folder') cell.append(iconImg('/icons/pasta.svg'));
    mini.append(cell);
  }
  return mini;
}

function makeKey(btn) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'key';
  const lcd = document.createElement('span');
  lcd.className = 'lcd';
  if (btn) {
    el.dataset.id = btn.id;
    el.dataset.kind = btn.kind;
    el.setAttribute('aria-label', btn.kind === 'folder' ? `Pasta ${btn.label}` : btn.label);
    el.title = btn.label;

    if (btn.kind === 'folder' && !btn.image) lcd.append(folderFace(btn));
    else if (btn.image) lcd.append(iconImg(btn.image));
    else {
      const t = document.createElement('span');
      t.className = 'lcd-label';
      t.textContent = btn.label;
      lcd.append(t);
    }
    if (btn.kind === 'folder') lcd.insertAdjacentHTML('beforeend', '<span class="folder-tab" aria-hidden="true"></span>');

    if (btn.live) {
      el.dataset.live = btn.live;
      if (btn.live === 'process') lcd.insertAdjacentHTML('beforeend', '<span class="live-led" aria-hidden="true"></span>');
      if (btn.live === 'media') {
        lcd.insertAdjacentHTML('beforeend',
          '<span class="np" aria-hidden="true"><img class="np-art" alt="" draggable="false"><span class="np-text"></span><span class="np-pause"></span></span>');
      }
    }

    wireTravel(el);
    el.addEventListener('click', () => {
      if (btn.kind === 'folder') return openFolder(btn);
      if (btn.kind === 'back') return closeFolder();
      if (btn.kind === 'idea') return openIdea(btn, el);
      press(el, btn);
    });
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
  const folder = stack[stack.length - 1];
  document.title = deck.title;
  $('#title').textContent = folder ? folder.label : deck.title;
  $('#title').classList.toggle('in-folder', !!folder);
  renderPages();
  keysEl.innerHTML = '';
  const slots = [];
  if (folder) slots.push({ id: '__back', label: 'Voltar', image: '/icons/voltar.svg', kind: 'back' });
  slots.push(...currentButtons().slice(0, KEYS_PER_PAGE - slots.length));
  for (let i = 0; i < KEYS_PER_PAGE; i++) keysEl.append(makeKey(slots[i]));
  applyLive(lastLive);
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
    flashKey(el, 'ok');
    setOnline(true);
    if (btn.live) setTimeout(pollStats, 500); // mostra logo o novo estado da tecla viva
  } catch (e) {
    flashKey(el, 'err');
    buzz([40, 60, 40]);
    if (e.fromPc) {
      lcdMessage(`${btn.label} não funcionou`, e.message);
    } else {
      setOnline(false);
      lcdMessage('PC fora do ar', 'Confira se o agente está rodando no PC.');
    }
  } finally {
    el.classList.remove('busy');
    enterFullscreenOnce(); // depois do toque, para não deslocar a tecla no meio dele
  }
}

function flashKey(el, tone) {
  if (!el) return;
  el.classList.remove('ok', 'err');
  void el.offsetWidth;
  el.classList.add(tone);
  setTimeout(() => el.classList.remove(tone), 950);
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
    try { deck = deck || JSON.parse(localStorage.getItem('pcdeck.deck')); } catch {}
    setOnline(false);
  }
  if (deck) restoreStack();
  render();
}

// ---------- teclas vivas ----------
let art = { id: null, url: null, loading: null };

async function loadArt(id) {
  if (art.id === id || art.loading === id) return;
  art.loading = id;
  try {
    const r = await api(`/api/live/art/${id}`);
    if (!r.ok) return;
    const url = URL.createObjectURL(await r.blob());
    if (art.url) URL.revokeObjectURL(art.url);
    art = { id, url, loading: null };
    applyLive(lastLive);
  } catch {} finally { if (art.loading === id) art.loading = null; }
}

function applyLive(map) {
  for (const el of keysEl.querySelectorAll('[data-live]')) {
    const st = map[el.dataset.id];
    const label = el.title;
    if (el.dataset.live === 'process') {
      const on = st?.on;
      el.classList.toggle('live-on', on === true);
      el.classList.toggle('live-off', on === false);
      el.setAttribute('aria-label', on == null ? label : `${label}: ${on ? 'aberto' : 'fechado'}`);
    } else if (el.dataset.live === 'media') {
      const has = !!st?.title;
      el.classList.toggle('np-on', has);
      el.classList.toggle('np-paused', has && !st.playing);
      if (!has) { el.setAttribute('aria-label', label); continue; }
      el.querySelector('.np-text').textContent = st.artist ? `${st.title} · ${st.artist}` : st.title;
      const img = el.querySelector('.np-art');
      const showArt = st.art && art.id === st.art;
      el.classList.toggle('np-art-on', !!showArt);
      if (showArt && img.src !== art.url) img.src = art.url;
      if (st.art && art.id !== st.art) loadArt(st.art);
      el.setAttribute('aria-label', `${label}: ${st.playing ? 'tocando' : 'pausado'} ${st.title}${st.artist ? `, ${st.artist}` : ''}`);
    }
  }
}

// ---------- faixa LCD: CPU / RAM / GPU ----------
function setSeg(key, pct, detail) {
  const seg = document.querySelector(`.seg[data-k="${key}"]`);
  const has = typeof pct === 'number';
  seg.querySelector('b').textContent = has ? Math.round(pct) : '–';
  seg.querySelector('.seg-bar span').style.width = has ? `${Math.max(0, Math.min(100, pct))}%` : '0';
  seg.querySelector('.seg-detail').textContent = detail || ' ';
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
      lastLive = s.live || {};
      applyLive(lastLive);
      if (deck && s.deckVersion && s.deckVersion !== deck.version) load(); // mudou no editor do PC
    }
  } catch {
    ['cpu', 'ram', 'gpu'].forEach((k) => setSeg(k, null));
  }
  statsTimer = setTimeout(pollStats, 2000);
}

// ---------- capturar ideia por voz ----------
const ideaEl = $('#idea');
const ideaText = $('#idea-text');
const ideaState = $('#idea-state');
const ideaMic = $('#idea-mic');
const ideaSave = $('#idea-save');
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
let listening = false;
let ideaBtn = null;
let ideaKeyEl = null;
let committed = ''; // texto já confirmado pelo ditado (ou digitado)

function setIdeaState(text, mode = '') {
  ideaState.textContent = text;
  ideaEl.dataset.mode = mode;
}

function openIdea(btn, el) {
  ideaBtn = btn;
  ideaKeyEl = el;
  ideaText.value = '';
  committed = '';
  $('#idea-title').textContent = btn.label;
  ideaEl.hidden = false;
  ideaSave.disabled = false;
  if (SR) {
    ideaMic.hidden = false;
    startListening();
  } else {
    ideaMic.hidden = true;
    setIdeaState('Digite a ideia. O microfone do teclado também funciona.');
    ideaText.focus();
  }
}

function closeIdea() {
  stopListening();
  ideaEl.hidden = true;
  ideaBtn = null;
  enterFullscreenOnce();
}

function startListening() {
  if (!SR || listening) return;
  listening = true;
  committed = ideaText.value ? `${ideaText.value.trimEnd()} ` : '';
  ideaMic.setAttribute('aria-pressed', 'true');
  ideaMic.setAttribute('aria-label', 'Parar de ouvir');
  setIdeaState('Ouvindo… fale a sua ideia', 'rec');
  listenOnce();
}

// uma frase por vez (o modo contínuo repete palavras no Chrome do Android); reinicia sozinho
function listenOnce() {
  rec = new SR();
  rec.lang = 'pt-BR';
  rec.continuous = false;
  rec.interimResults = true;
  rec.onresult = (e) => {
    let final = '';
    let interim = '';
    for (const r of e.results) (r.isFinal ? (final += r[0].transcript) : (interim += r[0].transcript));
    if (final) committed += `${final.trim()} `;
    ideaText.value = committed + interim;
    ideaText.scrollTop = ideaText.scrollHeight;
  };
  rec.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return; // silêncio: segue ouvindo
    listening = false;
    const why = {
      'not-allowed': 'Microfone bloqueado. Libere nas permissões do site ou digite.',
      'service-not-allowed': 'Microfone bloqueado. Libere nas permissões do site ou digite.',
      network: 'O ditado precisa de internet. Digite a ideia.',
      'audio-capture': 'Não achei o microfone. Digite a ideia.',
    }[e.error] || 'O ditado parou. Toque no microfone ou digite.';
    setIdeaState(why, 'warn');
  };
  rec.onend = () => {
    if (listening && !ideaEl.hidden) setTimeout(() => { if (listening) listenOnce(); }, 120);
    else markStopped();
  };
  try { rec.start(); } catch { listening = false; markStopped(); }
}

function stopListening() {
  listening = false;
  try { rec?.stop(); } catch {}
  markStopped();
}

function markStopped() {
  ideaMic.setAttribute('aria-pressed', 'false');
  ideaMic.setAttribute('aria-label', 'Ouvir de novo');
  if (ideaEl.dataset.mode === 'rec') setIdeaState('Pausado. Revise, toque no microfone para continuar ou salve.');
}

ideaMic.addEventListener('click', () => (listening ? stopListening() : startListening()));
ideaText.addEventListener('focus', () => { if (listening) stopListening(); });
$('#idea-cancel').addEventListener('click', closeIdea);
ideaSave.addEventListener('click', async () => {
  stopListening();
  const text = ideaText.value.trim();
  if (!text) { setIdeaState('Fale ou digite algo antes de salvar.', 'warn'); return; }
  ideaSave.disabled = true;
  setIdeaState('Salvando no PC…');
  try {
    const r = await api(`/api/idea/${encodeURIComponent(ideaBtn.id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (r.status === 401) { closeIdea(); showUnpaired(); return; }
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || 'O PC recusou a ideia.');
    const keyEl = ideaKeyEl;
    closeIdea();
    flashKey(keyEl, 'ok');
    buzz(15);
    lcdMessage('Ideia salva', 'Está no arquivo de ideias do PC.', 'ok');
  } catch (e) {
    ideaSave.disabled = false;
    setIdeaState(e.message === 'Failed to fetch' ? 'PC fora do ar. A ideia continua aqui; tente de novo.' : e.message, 'warn');
  }
});

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
    if (!e.target.closest('.key, .fs-btn, .idea')) enterFullscreenOnce();
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
  else if (listening) stopListening();
  pollStats();
});
power.addEventListener('click', load);

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

load();
pollStats();
keepAwake();
