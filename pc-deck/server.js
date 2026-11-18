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
const ICONS = path.join(PUBLIC, 'icons');
const DECK_FILE = path.join(ROOT, 'deck.json');
const TOKEN_FILE = path.join(ROOT, '.token');
const PORT = Number(process.env.PORT) || 8787;
const LAN = process.argv.includes('--lan');
const HOST = LAN ? '0.0.0.0' : '127.0.0.1';

const KEYS_PER_PAGE = 15;   // matriz 3×5
const KEYS_PER_FOLDER = 14; // a primeira tecla da pasta é "voltar"
const MAX_FOLDER_DEPTH = 3;

const now = () => new Date().toLocaleTimeString();
const httpError = (status, message) => Object.assign(new Error(message), { status });

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

// Pareamento e editor só para quem está no próprio PC (não via tailscale serve / LAN).
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

// ---------- atalhos de teclado ----------
// Nomes aceitos em "keys": "ctrl+shift+m", "media_play_pause", ["win+r", "enter"] (sequência).
const VK = {
  ctrl: 0x11, shift: 0x10, alt: 0x12, win: 0x5b,
  enter: 0x0d, esc: 0x1b, tab: 0x09, space: 0x20, backspace: 0x08, delete: 0x2e, insert: 0x2d,
  home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22, up: 0x26, down: 0x28, left: 0x25, right: 0x27,
  printscreen: 0x2c, capslock: 0x14,
  minus: 0xbd, equal: 0xbb, comma: 0xbc, period: 0xbe, slash: 0xbf, semicolon: 0xba,
  quote: 0xde, backquote: 0xc0, bracketleft: 0xdb, bracketright: 0xdd, backslash: 0xdc,
  media_play_pause: 0xb3, media_next: 0xb0, media_prev: 0xb1, media_stop: 0xb2,
  volume_mute: 0xad, volume_down: 0xae, volume_up: 0xaf,
};
for (let c = 0; c < 26; c++) VK[String.fromCharCode(97 + c)] = 0x41 + c;
for (let d = 0; d < 10; d++) VK[String(d)] = 0x30 + d;
for (let f = 1; f <= 24; f++) VK[`f${f}`] = 0x6f + f;
const KEY_ALIASES = { control: 'ctrl', escape: 'esc', del: 'delete', windows: 'win', cmd: 'win', meta: 'win', return: 'enter' };
const MODIFIERS = new Set(['ctrl', 'shift', 'alt', 'win']);

function parseCombo(combo) {
  if (typeof combo !== 'string' || !combo.trim()) throw new Error('atalho vazio');
  const parts = combo.toLowerCase().split('+').map((p) => p.trim()).map((p) => KEY_ALIASES[p] || p);
  if (parts.length > 4) throw new Error(`atalho longo demais: "${combo}"`);
  for (const p of parts) if (!(p in VK)) throw new Error(`tecla desconhecida "${p}" em "${combo}"`);
  if (parts.every((p) => MODIFIERS.has(p)) && parts.length > 1) throw new Error(`"${combo}" só tem modificadores`);
  return parts.map((p) => VK[p]);
}
function parseKeys(keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  if (!list.length || list.length > 10) throw new Error('use de 1 a 10 atalhos em sequência');
  return list.map(parseCombo);
}

// Um PowerShell fica aberto com o código de teclado já compilado: o toque chega ao PC sem atraso.
const KEYBOARD_HELPER = `
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Threading;
public static class DeckKeys {
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint type);
  static uint Ext(byte v) { return ((v >= 0x21 && v <= 0x2E) || v == 0x5B || v == 0x5C || (v >= 0xA6 && v <= 0xB7)) ? 1u : 0u; }
  public static void Combo(byte[] vks) {
    foreach (byte v in vks) { keybd_event(v, (byte)MapVirtualKey(v, 0), Ext(v), UIntPtr.Zero); Thread.Sleep(10); }
    for (int i = vks.Length - 1; i >= 0; i--) { byte v = vks[i]; keybd_event(v, (byte)MapVirtualKey(v, 0), Ext(v) | 2u, UIntPtr.Zero); Thread.Sleep(10); }
  }
}
"@
[Console]::Out.WriteLine('ready'); [Console]::Out.Flush()
while ($null -ne ($line = [Console]::In.ReadLine())) {
  try {
    foreach ($combo in $line.Split(';')) { [DeckKeys]::Combo([byte[]]@($combo.Split(',') | ForEach-Object { [int]$_ })); Start-Sleep -Milliseconds 60 }
    [Console]::Out.WriteLine('ok')
  } catch { [Console]::Out.WriteLine('err ' + $_.Exception.Message) }
  [Console]::Out.Flush()
}`;

let keyboard = null;
function startKeyboard() {
  if (keyboard) return keyboard;
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', KEYBOARD_HELPER], { windowsHide: true });
  const kb = { child, waiting: [], ready: null };
  kb.ready = new Promise((resolve, reject) => { kb.onReady = resolve; kb.onFail = reject; });
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line === 'ready') { kb.onReady(); continue; }
      const w = kb.waiting.shift();
      if (w) line === 'ok' ? w.resolve() : w.reject(new Error(line.replace(/^err\s*/, '') || 'falha no teclado'));
    }
  });
  const dead = (e) => {
    if (keyboard === kb) keyboard = null;
    kb.onFail(e || new Error('o ajudante de teclado fechou'));
    for (const w of kb.waiting.splice(0)) w.reject(new Error('o ajudante de teclado fechou'));
  };
  child.on('exit', () => dead());
  child.on('error', dead);
  keyboard = kb;
  return kb;
}

async function sendKeys(combos) {
  const kb = startKeyboard();
  await kb.ready;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('o teclado não respondeu')), 5000);
    kb.waiting.push({
      resolve: () => { clearTimeout(timer); resolve(); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    kb.child.stdin.write(combos.map((c) => c.join(',')).join(';') + '\n');
  });
}

// ---------- deck ----------
function loadDeck() {
  return JSON.parse(fs.readFileSync(DECK_FILE, 'utf8'));
}
function deckVersion() {
  try { return Math.round(fs.statSync(DECK_FILE).mtimeMs); } catch { return 0; }
}

// percorre teclas de páginas e de pastas
function* walk(buttons) {
  for (const b of buttons || []) {
    yield b;
    if (Array.isArray(b.folder)) yield* walk(b.folder);
  }
}
const allButtons = (deck) => deck.pages.flatMap((p) => [...walk(p.buttons)]);
const findButton = (deck, id) => allButtons(deck).find((b) => b.id === id) || null;
const kindOf = (b) => (Array.isArray(b.folder) ? 'folder' : b.action?.type === 'idea' ? 'idea' : 'action');

function publicButton(b) {
  const out = { id: b.id, label: b.label, image: b.image || null, kind: kindOf(b) };
  if (b.live) out.live = b.live.type;
  if (out.kind === 'folder') out.buttons = b.folder.map(publicButton);
  return out;
}

function publicDeck(deck) {
  return {
    title: deck.title || 'PC Deck',
    version: deckVersion(),
    pages: deck.pages.map((p) => ({ name: p.name, buttons: p.buttons.map(publicButton) })),
  };
}

// Valida o deck inteiro. Devolve a lista de problemas (vazia = ok).
const ID_RE = /^[\w-]{1,40}$/;
const AUMID_RE = /^[\w.\-]+(![\w.\-]+)?$/;
const ICON_RE = /^\/icons\/[\w.\-]+\.(png|svg|jpg|jpeg|webp)$/i;
const PROC_RE = /^[\w .\-]{1,64}$/;

function validateDeck(deck) {
  const errs = [];
  const err = (where, msg) => errs.push(`${where}: ${msg}`);
  if (!deck || typeof deck !== 'object') return ['o deck não é um objeto'];
  if (typeof deck.title !== 'string' || !deck.title.trim() || deck.title.length > 40) err('título', 'use de 1 a 40 caracteres');
  if (!deck.browsers || typeof deck.browsers !== 'object') err('navegadores', 'faltando');
  else for (const [k, v] of Object.entries(deck.browsers)) {
    if (!ID_RE.test(k) || typeof v !== 'string' || !v.trim()) err(`navegador "${k}"`, 'nome ou caminho inválido');
  }
  if (!Array.isArray(deck.pages) || !deck.pages.length || deck.pages.length > 20) { err('páginas', 'use de 1 a 20 páginas'); return errs; }

  const ids = new Set();
  const checkButtons = (list, where, depth, max) => {
    if (!Array.isArray(list)) return err(where, 'lista de teclas inválida');
    if (list.length > max) err(where, `no máximo ${max} teclas`);
    list.forEach((b, i) => {
      const at = `${where} › ${b?.label || `tecla ${i + 1}`}`;
      if (!b || typeof b !== 'object') return err(at, 'tecla inválida');
      if (!ID_RE.test(b.id || '')) err(at, 'id inválido');
      else if (ids.has(b.id)) err(at, `id "${b.id}" repetido`);
      else ids.add(b.id);
      if (typeof b.label !== 'string' || !b.label.trim() || b.label.length > 60) err(at, 'nome deve ter de 1 a 60 caracteres');
      if (b.image != null) {
        if (typeof b.image !== 'string' || !ICON_RE.test(b.image)) err(at, 'ícone deve ser um arquivo em /icons/');
        else if (!fs.existsSync(path.join(ICONS, path.basename(b.image)))) err(at, `ícone ${b.image} não existe`);
      }
      if (b.live != null) {
        if (b.live.type === 'process') {
          if (!PROC_RE.test(b.live.name || '')) err(at, 'tecla viva: nome do processo inválido');
          if (b.live.path != null && (typeof b.live.path !== 'string' || b.live.path.length > 200)) err(at, 'tecla viva: trecho do caminho inválido');
        } else if (b.live.type !== 'media') err(at, 'tecla viva: tipo deve ser "process" ou "media"');
      }
      if (Array.isArray(b.folder)) {
        if (b.action) err(at, 'pasta não tem ação');
        if (depth >= MAX_FOLDER_DEPTH) err(at, `no máximo ${MAX_FOLDER_DEPTH} níveis de pasta`);
        else checkButtons(b.folder, at, depth + 1, KEYS_PER_FOLDER);
      } else {
        try { checkAction(deck, b.action); } catch (e) { err(at, e.message); }
      }
    });
  };
  deck.pages.forEach((p, i) => {
    const where = `página "${p?.name || i + 1}"`;
    if (!p || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 30) err(where, 'nome deve ter de 1 a 30 caracteres');
    checkButtons(p?.buttons, where, 0, KEYS_PER_PAGE);
  });
  return errs;
}

function checkAction(deck, a) {
  if (!a || typeof a !== 'object') throw new Error('sem ação');
  switch (a.type) {
    case 'app': if (!AUMID_RE.test(a.aumid || '')) throw new Error('app: AppID inválido'); return;
    case 'exe':
      if (typeof a.path !== 'string' || !a.path.trim()) throw new Error('programa: caminho vazio');
      if (a.args != null && (!Array.isArray(a.args) || !a.args.every((s) => typeof s === 'string'))) throw new Error('programa: argumentos devem ser uma lista de textos');
      return;
    case 'url':
      if (!/^https?:\/\/\S+$/i.test(a.url || '')) throw new Error('site: endereço deve começar com http:// ou https://');
      if (!deck.browsers?.[a.browser]) throw new Error(`site: navegador "${a.browser}" não configurado`);
      return;
    case 'keys': parseKeys(a.keys); return;
    case 'idea':
      if (typeof a.file !== 'string' || !/\.(md|txt)$/i.test(a.file.trim())) throw new Error('ideia: o arquivo deve terminar em .md ou .txt');
      return;
    default: throw new Error(`tipo de ação desconhecido: ${a.type}`);
  }
}

// ---------- ações (só o que está no deck.json; o celular manda apenas o id) ----------
const expandEnv = (s) => s.replace(/%(\w+)%/g, (_, v) => process.env[v] || '');

function launch(file, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { detached: true, stdio: 'ignore', windowsHide: false });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

function runAction(deck, action) {
  checkAction(deck, action);
  switch (action.type) {
    case 'app': // qualquer app do Iniciar pelo AppUserModelID (Store: "Pacote!App"; desktop: "com.empresa.app")
      return launch('explorer.exe', [`shell:AppsFolder\\${action.aumid}`]);
    case 'exe':
      return launch(expandEnv(action.path), action.args || []);
    case 'url':
      return launch(deck.browsers[action.browser], [action.url]);
    case 'keys':
      return sendKeys(parseKeys(action.keys));
    default:
      throw new Error('esta tecla não executa nada no PC');
  }
}

// ---------- captura de ideias ----------
// O celular manda só o texto; o arquivo de destino é o definido no deck.json.
function appendIdea(action, text) {
  const clean = String(text || '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
  if (!clean) throw httpError(400, 'A ideia está vazia.');
  if (clean.length > 4000) throw httpError(413, 'A ideia passou de 4.000 caracteres.');
  const file = path.resolve(expandEnv(action.file.trim()));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const body = clean.split('\n').map((l, i) => (i ? `  ${l}` : l)).join('\n');
  let prefix = '';
  try {
    const st = fs.statSync(file);
    if (st.size > 0) {
      const fd = fs.openSync(file, 'r');
      const last = Buffer.alloc(1);
      fs.readSync(fd, last, 0, 1, st.size - 1);
      fs.closeSync(fd);
      if (last[0] !== 0x0a) prefix = '\n';
    }
  } catch {}
  fs.appendFileSync(file, `${prefix}- **${stamp}** ${body}\n`, 'utf8');
  return file;
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
  const t = cpuTimes();
  const dt = t.total - lastCpu.total;
  if (dt > 0) cpuPct = Math.round((1 - (t.idle - lastCpu.idle) / dt) * 1000) / 10;
  lastCpu = t;
}, 2000).unref();

// lê linhas JSON de um processo contínuo
function jsonLines(child, onLine) {
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try { onLine(JSON.parse(line)); } catch {}
    }
  });
}

let sampler = null;
let lastStatsRequest = 0;

function ensureSampler() {
  lastStatsRequest = Date.now();
  if (sampler) return;
  sampler = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SAMPLER], { windowsHide: true });
  jsonLines(sampler, (o) => Object.assign(stats, o, { at: Date.now() }));
  const s = sampler;
  s.on('exit', () => { if (sampler === s) sampler = null; });
  s.on('error', () => { if (sampler === s) sampler = null; });
}

// ---------- teclas vivas ----------
// Outro PowerShell contínuo, só enquanto há teclas vivas e um celular olhando:
// diz quais apps estão abertos e o que está tocando (a mesma mídia do controle de volume do Windows).
const LIVE_SAMPLER = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$names = @($env:PCDECK_PROCS -split '\\|' | Where-Object { $_ })
$mgr = $null
if ($env:PCDECK_MEDIA -eq '1') {
  try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
    function Await($op, [type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); if ($task.Wait(3000)) { $task.Result } else { $null } }
    $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
    $null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
    # o PowerShell não converte o stream do WinRT sozinho; por reflexão o .NET faz a conversão
    $asStream = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [type[]]@([Windows.Storage.Streams.IInputStream]))
    $mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  } catch { $mgr = $null }
}
$lastKey = $null
while ($true) {
  $procs = @()
  if ($names.Count) { $procs = @(Get-Process -Name $names | ForEach-Object { "$($_.ProcessName)|$($_.Path)" } | Sort-Object -Unique) }
  $media = $null
  if ($mgr) {
    try {
      $s = $mgr.GetCurrentSession()
      if ($s) {
        $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
        $media = @{ title = [string]$p.Title; artist = [string]$p.Artist; status = [string]$s.GetPlaybackInfo().PlaybackStatus; app = [string]$s.SourceAppUserModelId }
        $key = "$($p.Title)|$($p.Artist)|$($s.SourceAppUserModelId)"
        if ($key -ne $lastKey) {
          $lastKey = $key
          $media.art = ''
          if ($p.Thumbnail) {
            $rs = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
            if ($rs) {
              $st = $asStream.Invoke($null, @($rs))
              $ms = New-Object IO.MemoryStream
              $st.CopyTo($ms); $st.Dispose()
              $media.art = [Convert]::ToBase64String($ms.ToArray())
            }
          }
          if ($media.art -eq '') { $lastKey = $null } # capa às vezes chega depois do título: tenta de novo
        }
      } else { $lastKey = $null }
    } catch {}
  }
  try {
    [Console]::Out.WriteLine((@{ procs = $procs; media = $media } | ConvertTo-Json -Compress -Depth 4))
    [Console]::Out.Flush()
  } catch { exit } # o agente fechou: encerra junto
  Start-Sleep -Seconds 2
}`;

const live = { procs: [], media: null, art: null, at: 0 };
let liveSampler = null;
let liveSpec = '';

function liveNeeds(deck) {
  const names = new Set();
  let media = false;
  for (const b of allButtons(deck)) {
    if (b.live?.type === 'process' && PROC_RE.test(b.live.name || '')) names.add(b.live.name);
    if (b.live?.type === 'media') media = true;
  }
  return { names: [...names].sort(), media };
}

function ensureLiveSampler(deck) {
  const need = liveNeeds(deck);
  const spec = `${need.names.join('|')}#${need.media ? 1 : 0}`;
  if (!need.names.length && !need.media) { stopLiveSampler(); return; }
  if (liveSampler && spec === liveSpec) return;
  stopLiveSampler();
  liveSpec = spec;
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', LIVE_SAMPLER], {
    windowsHide: true,
    env: { ...process.env, PCDECK_PROCS: need.names.join('|'), PCDECK_MEDIA: need.media ? '1' : '0' },
  });
  liveSampler = child;
  jsonLines(child, (o) => {
    live.procs = [].concat(o.procs || []).map((s) => {
      const i = String(s).indexOf('|');
      return { n: String(s).slice(0, i), p: String(s).slice(i + 1) };
    });
    const m = o.media && o.media.title ? o.media : null;
    if (!m) live.art = null;
    else if (typeof m.art === 'string') {
      const buf = m.art ? Buffer.from(m.art, 'base64') : null;
      live.art = buf && buf.length ? { id: crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12), buf, type: sniffImage(buf) } : null;
    }
    if (m) delete m.art;
    live.media = m;
    live.at = Date.now();
  });
  child.on('exit', () => { if (liveSampler === child) { liveSampler = null; liveSpec = ''; } });
  child.on('error', () => { if (liveSampler === child) { liveSampler = null; liveSpec = ''; } });
}
function stopLiveSampler() {
  if (liveSampler) { liveSampler.kill(); liveSampler = null; liveSpec = ''; }
}

function sniffImage(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.slice(0, 4).toString() === 'RIFF') return 'image/webp';
  if (buf.slice(0, 3).toString() === 'GIF') return 'image/gif';
  if (buf.slice(0, 2).toString() === 'BM') return 'image/bmp';
  return 'application/octet-stream';
}

function liveState(deck) {
  const fresh = Date.now() - live.at < 10_000;
  const out = {};
  for (const b of allButtons(deck)) {
    if (b.live?.type === 'process') {
      const name = b.live.name.toLowerCase();
      const pathHas = (b.live.path || '').toLowerCase();
      out[b.id] = {
        on: fresh ? live.procs.some((p) => String(p.n).toLowerCase() === name && (!pathHas || String(p.p || '').toLowerCase().includes(pathHas))) : null,
      };
    } else if (b.live?.type === 'media') {
      const m = fresh ? live.media : null;
      out[b.id] = m ? { title: m.title, artist: m.artist, playing: m.status === 'Playing', art: live.art?.id || null } : { title: null };
    }
  }
  return out;
}

setInterval(() => {
  if (Date.now() - lastStatsRequest > 30_000) {
    if (sampler) { sampler.kill(); sampler = null; }
    stopLiveSampler();
  }
}, 10_000).unref();

function readStats(deck) {
  ensureSampler();
  ensureLiveSampler(deck);
  const total = os.totalmem();
  const used = total - os.freemem();
  const fresh = Date.now() - stats.at < 10_000;
  return {
    cpu: cpuPct,
    cpuCores: os.cpus().length,
    gpuName,
    gpu: fresh ? stats.gpu : null,
    ram: { used, total, pct: Math.round((used / total) * 1000) / 10 },
    live: liveState(deck),
    deckVersion: deckVersion(),
  };
}

// ---------- editor (só no próprio PC) ----------
let startApps = { at: 0, list: [] };
function listStartApps() {
  if (Date.now() - startApps.at < 60_000) return Promise.resolve(startApps.list);
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress'],
    { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
      let list = [];
      try { list = [].concat(JSON.parse(out)).map((a) => ({ name: a.Name, aumid: a.AppID })).filter((a) => AUMID_RE.test(a.aumid || '')); } catch {}
      if (!err && list.length) startApps = { at: Date.now(), list };
      resolve(list);
    });
  });
}

function listProcesses() {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -or $_.Path -like "*Program*" } | Select-Object -ExpandProperty ProcessName -Unique | Sort-Object | ConvertTo-Json -Compress'],
    { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, out) => {
      try { resolve([].concat(JSON.parse(out)).filter((n) => PROC_RE.test(n))); } catch { resolve([]); }
    });
  });
}

const slug = (s) => String(s || 'icone').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'icone';

function freeIconName(base, ext) {
  let name = `${base}.${ext}`;
  for (let i = 2; fs.existsSync(path.join(ICONS, name)); i++) name = `${base}-${i}.${ext}`;
  return name;
}

function saveIcon(base, buf) {
  const type = buf.slice(0, 512).toString('utf8').includes('<svg') ? 'image/svg+xml' : sniffImage(buf);
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' }[type];
  if (!ext) throw httpError(415, 'Use PNG, JPG, WEBP ou SVG.');
  if (buf.length > 2 * 1024 * 1024) throw httpError(413, 'Ícone acima de 2 MB.');
  const name = freeIconName(slug(base), ext);
  fs.writeFileSync(path.join(ICONS, name), buf);
  return `/icons/${name}`;
}

function iconFromApp(aumid, base) {
  if (!AUMID_RE.test(aumid || '')) throw httpError(400, 'AppID inválido.');
  const name = freeIconName(slug(base || aumid.split('!')[0].split('.').pop()), 'png');
  const out = path.join(ICONS, name);
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
      path.join(ROOT, 'tools', 'app-icon.ps1'), '-Aumid', aumid, '-Out', out, '-Size', '256'],
    { windowsHide: true, timeout: 20_000 }, (err) => {
      if (err || !fs.existsSync(out)) return reject(httpError(502, 'O Windows não devolveu o ícone desse app.'));
      resolve(`/icons/${name}`);
    });
  });
}

async function iconFromSite(url, base) {
  let host;
  try { host = new URL(url).hostname; } catch { throw httpError(400, 'Endereço inválido.'); }
  const r = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=256`, {
    headers: { 'User-Agent': 'PCDeck/1.0' }, signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw httpError(502, 'Não achei o ícone desse site.');
  return saveIcon(base || host.replace(/^www\./, '').split('.')[0], Buffer.from(await r.arrayBuffer()));
}

function writeDeck(deck) {
  const tmp = `${DECK_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(deck, null, 2) + '\n', 'utf8');
  try { fs.copyFileSync(DECK_FILE, `${DECK_FILE}.bak`); } catch {}
  fs.renameSync(tmp, DECK_FILE);
}

function readJson(req, limit = 64 * 1024) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return Promise.reject(httpError(415, 'Envie JSON.'));
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(httpError(413, 'Envio grande demais.')); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(httpError(400, 'JSON inválido.')); }
    });
    req.on('error', reject);
  });
}

async function handleEditor(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  switch (route) {
    case 'GET /api/editor/deck': return send(res, 200, { deck: loadDeck(), version: deckVersion() });
    case 'POST /api/editor/deck': {
      const { deck } = await readJson(req, 1024 * 1024);
      const errors = validateDeck(deck);
      if (errors.length) return send(res, 422, { error: 'O deck tem problemas.', errors });
      writeDeck(deck);
      console.log(`[${now()}] ✎ deck salvo pelo editor`);
      return send(res, 200, { ok: true, version: deckVersion() });
    }
    case 'GET /api/editor/icons': {
      const files = fs.readdirSync(ICONS).filter((f) => ICON_RE.test(`/icons/${f}`)).sort();
      return send(res, 200, files.map((f) => `/icons/${f}`));
    }
    case 'POST /api/editor/icon': {
      const { name, data } = await readJson(req, 3 * 1024 * 1024);
      const m = /^data:[\w/+.-]+;base64,(.+)$/.exec(data || '');
      if (!m) throw httpError(400, 'Arquivo inválido.');
      return send(res, 200, { image: saveIcon(name, Buffer.from(m[1], 'base64')) });
    }
    case 'POST /api/editor/icon-from-app': {
      const { aumid, name } = await readJson(req);
      return send(res, 200, { image: await iconFromApp(aumid, name) });
    }
    case 'POST /api/editor/icon-from-site': {
      const { url: site, name } = await readJson(req);
      return send(res, 200, { image: await iconFromSite(site, name) });
    }
    case 'GET /api/editor/apps': return send(res, 200, await listStartApps());
    case 'GET /api/editor/processes': return send(res, 200, await listProcesses());
    case 'GET /api/editor/keynames': return send(res, 200, Object.keys(VK));
    case 'POST /api/editor/test': {
      const { action, browsers } = await readJson(req);
      if (action?.type === 'idea') return send(res, 400, { error: 'A captura de ideia se testa pelo celular.' });
      try {
        await runAction({ browsers: browsers || loadDeck().browsers }, action);
      } catch (e) {
        // no editor (só no PC) dá para mostrar o motivo técnico
        return send(res, 400, { error: e.code === 'ENOENT' ? 'programa não encontrado nesse caminho' : e.message });
      }
      return send(res, 200, { ok: true });
    }
  }
  return send(res, 404, { error: 'rota não existe' });
}

// ---------- http ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.md': 'text/plain; charset=utf-8',
};

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    // nenhuma página do agente pode ser embutida em outro site (anti-clickjacking)
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "frame-ancestors 'none'",
    ...extra,
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
    const ext = path.extname(file).toLowerCase();
    // SVG enviado pelo editor não pode rodar script nem enviar formulário se for aberto direto
    const extra = ext === '.svg'
      ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; frame-ancestors 'none'; sandbox" }
      : {};
    send(res, 200, data, MIME[ext] || 'application/octet-stream', extra);
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
    if (e.status) return send(res, e.status, { error: e.message });
    console.error(`[${now()}] erro interno: ${e.message}`);
    if (!res.headersSent) send(res, 500, { error: 'erro interno' });
    else res.destroy();
  });
});

async function handle(req, res) {
  let url;
  try { url = new URL(req.url, 'http://x'); } catch { return send(res, 400, { error: 'bad request' }); }

  if (!allowedHost(req)) return send(res, 421, { error: 'host não permitido' });
  if (req.method !== 'GET' && !sameOrigin(req)) return send(res, 403, { error: 'origem não permitida' });

  // ---- só no próprio PC ----
  const localOnly = url.pathname === '/pair' || url.pathname === '/api/pairing'
    || url.pathname === '/editar' || url.pathname.startsWith('/api/editor/');
  if (localOnly && !isLocalDirect(req)) return send(res, 403, { error: 'abra esta página no próprio PC' });

  if (url.pathname === '/pair') return serveStatic({ url: '/pair.html' }, res);
  if (url.pathname === '/editar') return serveStatic({ url: '/editor.html' }, res);
  if (url.pathname === '/api/pairing') {
    if (req.method === 'POST' && url.searchParams.get('rotate') === '1') {
      // exige JSON: um <form> comum (de outro site ou de um SVG) não consegue mandar esse tipo
      if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'Envie JSON.' });
      fs.rmSync(TOKEN_FILE, { force: true });
      TOKEN = loadToken();
    }
    return send(res, 200, { urls: pairingUrls(), lan: LAN, port: PORT });
  }
  if (url.pathname.startsWith('/api/editor/')) return handleEditor(req, res, url);

  // ---- celular pareado ----
  if (url.pathname.startsWith('/api/')) {
    if (!authorized(req)) {
      await new Promise((r) => setTimeout(r, 400)); // freia tentativa de força bruta
      return send(res, 401, { error: 'não pareado' });
    }
    let deck;
    try { deck = loadDeck(); } catch (e) { return send(res, 500, { error: `deck.json inválido: ${e.message}` }); }

    if (req.method === 'GET' && url.pathname === '/api/deck') {
      if (allButtons(deck).some((b) => b.action?.type === 'keys')) startKeyboard(); // aquece o teclado
      return send(res, 200, publicDeck(deck));
    }
    if (req.method === 'GET' && url.pathname === '/api/ping') return send(res, 200, { ok: true, host: os.hostname() });
    if (req.method === 'GET' && url.pathname === '/api/stats') return send(res, 200, readStats(deck));

    const art = url.pathname.match(/^\/api\/live\/art\/([0-9a-f]{12})$/);
    if (req.method === 'GET' && art) {
      if (!live.art || live.art.id !== art[1]) return send(res, 404, { error: 'capa mudou' });
      return send(res, 200, live.art.buf, live.art.type, { 'Cache-Control': 'private, max-age=86400' });
    }

    const idea = url.pathname.match(/^\/api\/idea\/([\w-]+)$/);
    if (req.method === 'POST' && idea) {
      const button = findButton(deck, idea[1]);
      if (!button || kindOf(button) !== 'idea') return send(res, 404, { error: 'tecla de ideia não existe' });
      const { text } = await readJson(req, 32 * 1024);
      try {
        const file = appendIdea(button.action, text);
        console.log(`[${now()}] 💡 ideia salva em ${file}`);
        return send(res, 200, { ok: true });
      } catch (e) {
        if (e.status) throw e;
        console.error(`[${now()}] ✖ ideia: ${e.message}`);
        return send(res, 500, { error: 'Não consegui gravar o arquivo de ideias. Veja a janela do agente no PC.' });
      }
    }

    const m = url.pathname.match(/^\/api\/run\/([\w-]+)$/);
    if (req.method === 'POST' && m) {
      const button = findButton(deck, m[1]);
      if (!button) return send(res, 404, { error: 'botão não existe' });
      try {
        await runAction(deck, button.action);
        console.log(`[${now()}] ▶ ${button.label}`);
        return send(res, 200, { ok: true });
      } catch (e) {
        console.error(`[${now()}] ✖ ${button.label}: ${e.message}`);
        // o celular recebe uma frase útil; o detalhe técnico fica no console do PC
        const hint = e.code === 'ENOENT'
          ? 'O programa não foi encontrado no PC. Confira o caminho no editor.'
          : 'Veja o erro na janela do agente no PC.';
        return send(res, 500, { error: hint });
      }
    }
    return send(res, 404, { error: 'rota não existe' });
  }

  if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
  serveStatic(req, res);
}

// falha cedo se o deck.json estiver quebrado; avisa (sem parar) se tiver tecla com problema
const startupProblems = validateDeck(loadDeck());
for (const p of startupProblems) console.warn(`⚠ deck.json — ${p}`);

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`A porta ${PORT} já está em uso: provavelmente o PC Deck já está rodando em outra janela. Feche a outra antes.`);
  else console.error(e.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`PC Deck rodando em http://${HOST}:${PORT}`);
  console.log(`Pareamento: abra http://127.0.0.1:${PORT}/pair neste PC e escaneie o QR com o celular.`);
  console.log(`Editor:     abra http://127.0.0.1:${PORT}/editar neste PC.`);
  if (LAN) console.warn('AVISO: no modo --lan a chave viaja sem criptografia; qualquer aparelho da rede pode capturá-la. Use só em rede de casa; prefira `tailscale serve` (HTTPS).');
  if (!LAN) console.log('Modo seguro: só localhost. Para o celular, use `tailscale serve --bg ' + PORT + '` (ou rode com --lan).');
});
