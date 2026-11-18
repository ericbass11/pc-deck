// PC Deck — agente local que executa os atalhos pedidos pelo celular.
// Sem dependências: só Node >= 18.
//
//   node server.js          -> escuta só em 127.0.0.1 (use com `tailscale serve`)
//   node server.js --lan    -> escuta também na rede local (HTTP, sem instalar como PWA)

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DECK_FILE = path.join(ROOT, 'deck.json');
const TOKEN_FILE = path.join(ROOT, '.token');
const PORT = Number(process.env.PORT) || 8787;
const LAN = process.argv.includes('--lan');
const HOST = LAN ? '0.0.0.0' : '127.0.0.1';

// ---------- token de pareamento ----------
function loadToken() {
  try {
    const t = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    if (t.length >= 32) return t;
  } catch {}
  const t = crypto.randomBytes(24).toString('base64url');
  fs.writeFileSync(TOKEN_FILE, t);
  return t;
}
let TOKEN = loadToken();

function authorized(req) {
  const h = req.headers.authorization || '';
  const given = Buffer.from(h.startsWith('Bearer ') ? h.slice(7) : '');
  const want = Buffer.from(TOKEN);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

// Página de pareamento só para quem está no próprio PC (não via tailscale serve / LAN).
function isLocalDirect(req) {
  const ip = req.socket.remoteAddress || '';
  const loopback = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  return loopback && !req.headers['x-forwarded-for'] && !req.headers['tailscale-user-login'];
}

// Anti DNS rebinding: só aceita pedidos endereçados ao próprio agente.
// Um site malicioso pode apontar o domínio dele para 127.0.0.1, mas o Host continua sendo o domínio dele.
// Nomes *.ts.net são controlados pelo Tailscale, e IP literal não dá para "sequestrar".
function allowedHost(req) {
  let name;
  try { name = new URL(`http://${req.headers.host || ''}`).hostname.toLowerCase(); } catch { return false; }
  if (name === 'localhost' || name.endsWith('.localhost')) return true;
  if (name.endsWith('.ts.net')) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(name)) return true; // IPv4 literal
  if (name.startsWith('[') && name.endsWith(']')) return true; // IPv6 literal
  return false;
}

// Bloqueia POST vindo de outro site (ex.: formulário escondido que gira a chave).
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // navegadores sempre mandam Origin em POST; sem Origin = cliente não-navegador
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

// ---------- deck ----------
function loadDeck() {
  return JSON.parse(fs.readFileSync(DECK_FILE, 'utf8'));
}

function publicDeck(deck) {
  return {
    title: deck.title || 'PC Deck',
    pages: deck.pages.map((p) => ({
      name: p.name,
      buttons: p.buttons.map(({ id, label, image }) => ({ id, label, image })),
    })),
  };
}

function findButton(deck, id) {
  for (const p of deck.pages) for (const b of p.buttons) if (b.id === id) return b;
  return null;
}

// ---------- ações (só o que está no deck.json; o celular manda apenas o id) ----------
function launch(file, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { detached: true, stdio: 'ignore', windowsHide: false });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

function runAction(deck, action) {
  switch (action.type) {
    case 'app': // qualquer app do Iniciar pelo AppUserModelID (Store: "Pacote!App"; desktop: "com.empresa.app")
      if (!/^[\w.\-]+(![\w.\-]+)?$/.test(action.aumid)) throw new Error('aumid inválido');
      return launch('explorer.exe', [`shell:AppsFolder\\${action.aumid}`]);
    case 'exe':
      return launch(action.path.replace(/%(\w+)%/g, (_, v) => process.env[v] || ''), action.args || []);
    case 'url': {
      if (!/^https?:\/\//i.test(action.url)) throw new Error('url inválida');
      const browser = deck.browsers?.[action.browser];
      if (!browser) throw new Error(`navegador "${action.browser}" não configurado`);
      return launch(browser, [action.url]);
    }
    default:
      throw new Error(`tipo de ação desconhecido: ${action.type}`);
  }
}

// ---------- monitor de CPU / RAM / GPU ----------
// Um PowerShell contínuo lê os contadores do Windows (os mesmos do Gerenciador de Tarefas).
// Só roda enquanto algum celular está pedindo /api/stats; desliga após 30 s sem pedidos.
const SAMPLER = `
$inv = [Globalization.CultureInfo]::InvariantCulture
Get-Counter -Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage' -SampleInterval 2 -Continuous -ErrorAction SilentlyContinue | ForEach-Object {
  $gpu = ($_.CounterSamples | Measure-Object CookedValue -Sum).Sum
  if ($null -eq $gpu) { $gpu = 0 }
  [Console]::Out.WriteLine('{"gpu":' + [math]::Min(100,[math]::Round($gpu,1)).ToString($inv) + '}')
  [Console]::Out.Flush()
}`;
// Obs.: contadores de CPU têm nome traduzido no Windows em PT-BR; por isso a CPU é medida no Node.

const stats = { gpu: null, at: 0 };

// nome curto da GPU para a linha de detalhe da faixa (lido uma vez)
let gpuName = null;
execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
  '(Get-CimInstance Win32_VideoController | Select-Object -First 1).Name'], { windowsHide: true }, (err, out) => {
  if (!err && out.trim()) gpuName = out.trim().replace(/\(R\)|\(TM\)|Corporation|NVIDIA|AMD/gi, '').replace(/\s+/g, ' ').trim();
});

// CPU pelos tempos dos núcleos (independe do idioma do Windows)
function cpuTimes() {
  let idle = 0, total = 0;
  for (const c of os.cpus()) {
    for (const v of Object.values(c.times)) total += v;
    idle += c.times.idle;
  }
  return { idle, total };
}
let lastCpu = cpuTimes();
let cpuPct = null;
setInterval(() => {
  const now = cpuTimes();
  const dt = now.total - lastCpu.total;
  if (dt > 0) cpuPct = Math.round((1 - (now.idle - lastCpu.idle) / dt) * 1000) / 10;
  lastCpu = now;
}, 2000).unref();
let sampler = null;
let lastStatsRequest = 0;

function ensureSampler() {
  lastStatsRequest = Date.now();
  if (sampler) return;
  sampler = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SAMPLER], { windowsHide: true });
  let buf = '';
  sampler.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      try { Object.assign(stats, JSON.parse(line), { at: Date.now() }); } catch {}
    }
  });
  sampler.on('exit', () => { sampler = null; });
  sampler.on('error', () => { sampler = null; });
}

setInterval(() => {
  if (sampler && Date.now() - lastStatsRequest > 30_000) { sampler.kill(); sampler = null; }
}, 10_000).unref();

function readStats() {
  ensureSampler();
  const total = os.totalmem();
  const used = total - os.freemem();
  const fresh = Date.now() - stats.at < 10_000;
  return {
    cpu: cpuPct,
    cpuCores: os.cpus().length,
    gpuName,
    gpu: fresh ? stats.gpu : null,
    ram: { used, total, pct: Math.round((used / total) * 1000) / 10 },
  };
}

// ---------- http ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json',
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function serveStatic(req, res) {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return send(res, 400, { error: 'bad request' }); }
  const file = path.normalize(path.join(PUBLIC, rel === '/' ? 'index.html' : rel));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, { error: 'forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'not found' });
    send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
  });
}

let tailscaleHost = null;
execFile('tailscale', ['status', '--json'], { windowsHide: true }, (err, out) => {
  if (err) return;
  try { tailscaleHost = JSON.parse(out).Self.DNSName.replace(/\.$/, ''); } catch {}
});

function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254'))
    .map((i) => i.address);
}

function pairingUrls() {
  const urls = [];
  if (tailscaleHost) urls.push({ label: 'Tailscale (HTTPS, instala como app)', url: `https://${tailscaleHost}/#t=${TOKEN}` });
  if (LAN) for (const ip of lanAddresses()) urls.push({ label: `Rede local ${ip} (HTTP)`, url: `http://${ip}:${PORT}/#t=${TOKEN}` });
  return urls;
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error(`[${new Date().toLocaleTimeString()}] erro interno: ${e.message}`);
    if (!res.headersSent) send(res, 500, { error: 'erro interno' });
    else res.destroy();
  });
});

async function handle(req, res) {
  let url;
  try { url = new URL(req.url, 'http://x'); } catch { return send(res, 400, { error: 'bad request' }); }

  if (!allowedHost(req)) return send(res, 421, { error: 'host não permitido' });
  if (req.method !== 'GET' && !sameOrigin(req)) return send(res, 403, { error: 'origem não permitida' });

  if (url.pathname === '/pair' || url.pathname === '/api/pairing') {
    if (!isLocalDirect(req)) return send(res, 403, { error: 'abra o pareamento no próprio PC' });
    if (url.pathname === '/pair') return serveStatic({ url: '/pair.html' }, res);
    if (req.method === 'POST' && url.searchParams.get('rotate') === '1') {
      fs.rmSync(TOKEN_FILE, { force: true });
      TOKEN = loadToken();
    }
    return send(res, 200, { urls: pairingUrls(), lan: LAN, port: PORT });
  }

  if (url.pathname.startsWith('/api/')) {
    if (!authorized(req)) {
      await new Promise((r) => setTimeout(r, 400)); // freia tentativa de força bruta
      return send(res, 401, { error: 'não pareado' });
    }
    let deck;
    try { deck = loadDeck(); } catch (e) { return send(res, 500, { error: `deck.json inválido: ${e.message}` }); }

    if (req.method === 'GET' && url.pathname === '/api/deck') return send(res, 200, publicDeck(deck));
    if (req.method === 'GET' && url.pathname === '/api/ping') return send(res, 200, { ok: true, host: os.hostname() });
    if (req.method === 'GET' && url.pathname === '/api/stats') return send(res, 200, readStats());

    const m = url.pathname.match(/^\/api\/run\/([\w-]+)$/);
    if (req.method === 'POST' && m) {
      const button = findButton(deck, m[1]);
      if (!button) return send(res, 404, { error: 'botão não existe' });
      try {
        await runAction(deck, button.action);
        console.log(`[${new Date().toLocaleTimeString()}] ▶ ${button.label}`);
        return send(res, 200, { ok: true });
      } catch (e) {
        console.error(`[${new Date().toLocaleTimeString()}] ✖ ${button.label}: ${e.message}`);
        // o celular recebe uma frase útil; o detalhe técnico fica no console do PC
        const hint = e.code === 'ENOENT'
          ? 'O programa não foi encontrado no PC. Confira o caminho no deck.json.'
          : 'Veja o erro na janela do agente no PC.';
        return send(res, 500, { error: hint });
      }
    }
    return send(res, 404, { error: 'rota não existe' });
  }

  if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
  serveStatic(req, res);
}

loadDeck(); // falha cedo se o deck.json estiver quebrado
server.listen(PORT, HOST, () => {
  console.log(`PC Deck rodando em http://${HOST}:${PORT}`);
  console.log(`Pareamento: abra http://127.0.0.1:${PORT}/pair neste PC e escaneie o QR com o celular.`);
  if (!LAN) console.log('Modo seguro: só localhost. Para o celular, use `tailscale serve --bg ' + PORT + '` (ou rode com --lan).');
});
