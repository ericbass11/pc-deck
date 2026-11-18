// PC Deck — editor visual (abre só no próprio PC, em /editar)
const KEYS = 15;
const FOLDER_KEYS = 14;
const IDEA_FILE = '%USERPROFILE%\\Documents\\PC Deck\\ideias.md';

const $ = (s, el = document) => el.querySelector(s);
const grid = $('#ed-grid');
const panel = $('#ed-panel');
const statusEl = $('#ed-status');
const saveBtn = $('#ed-save');
const revertBtn = $('#ed-revert');

let deck = null;
let savedJson = '';
let pageIdx = 0;
let path = [];     // ids das pastas abertas
let sel = null;    // índice da tecla selecionada na lista atual
let apps = [];
let keyNames = new Set();
let procsLoaded = false;

// ---------- utilidades ----------
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'value') el.value = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}

async function call(url, body) {
  const opts = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const r = await fetch(url, { ...opts, cache: 'no-store' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `Erro ${r.status}`), { data });
  return data;
}

let statusTimer;
function status(text, tone = '') {
  statusEl.textContent = text;
  statusEl.dataset.tone = tone;
  clearTimeout(statusTimer);
  if (tone === 'ok') statusTimer = setTimeout(updateDirty, 4000);
}

const slug = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);

function* walk(list) {
  for (const b of list) { yield b; if (Array.isArray(b.folder)) yield* walk(b.folder); }
}
const allIds = () => new Set(deck.pages.flatMap((p) => [...walk(p.buttons)].map((b) => b.id)));
function uniqueId(base) {
  const ids = allIds();
  const root = slug(base) || 'tecla';
  let id = root;
  for (let i = 2; ids.has(id); i++) id = `${root}-${i}`;
  return id;
}

const isFolder = (b) => Array.isArray(b?.folder);
const inFolder = () => path.length > 0;
const offset = () => (inFolder() ? 1 : 0);
const capacity = () => (inFolder() ? FOLDER_KEYS : KEYS);

// lista de teclas da página/pasta aberta (corrige o caminho se a pasta sumiu)
function listAt(p) {
  let list = deck.pages[pageIdx].buttons;
  for (const id of p) {
    const f = list.find((b) => b.id === id && isFolder(b));
    if (!f) return null;
    list = f.folder;
  }
  return list;
}
function currentList() {
  while (path.length && !listAt(path)) path.pop();
  return listAt(path);
}

// ---------- estado salvo x editado ----------
function updateDirty() {
  const dirty = JSON.stringify(deck) !== savedJson;
  saveBtn.disabled = !dirty;
  revertBtn.disabled = !dirty;
  if (dirty) status('Alterações não salvas', 'dirty');
  else if (statusEl.dataset.tone !== 'ok' && statusEl.dataset.tone !== 'err') status('Tudo salvo. O celular atualiza sozinho.');
}
const light = () => { renderGrid(); updateDirty(); };
const changed = () => { renderAll(); updateDirty(); };

window.addEventListener('beforeunload', (e) => {
  if (JSON.stringify(deck) !== savedJson) { e.preventDefault(); e.returnValue = ''; }
});

// ---------- visual das teclas (igual ao celular) ----------
function face(b) {
  const lcd = h('span', { class: 'lcd' });
  if (isFolder(b) && !b.image) {
    lcd.append(h('span', { class: 'mini' }, b.folder.slice(0, 4).map((c) =>
      h('span', {}, c.image || isFolder(c) ? h('img', { src: c.image || '/icons/pasta.svg', alt: '', draggable: false }) : null))));
  } else if (b.image) {
    lcd.append(h('img', { src: b.image, alt: '', draggable: false, class: 'halo' }), h('img', { src: b.image, alt: '', draggable: false, class: 'icon' }));
  } else {
    lcd.append(h('span', { class: 'lcd-label', text: b.label }));
  }
  if (isFolder(b)) lcd.append(h('span', { class: 'folder-tab' }));
  if (b.action?.type === 'routine') lcd.append(h('span', { class: 'routine-mark' }, h('i'), h('i'), h('i')));
  if (b.live) lcd.append(h('span', { class: `ed-live-tag ed-live-${b.live.type}`, title: 'Tecla viva' }));
  return lcd;
}

// ---------- grade ----------
let dragFrom = null;

function renderGrid() {
  const list = currentList();
  grid.innerHTML = '';
  for (let slot = 0; slot < KEYS; slot++) {
    if (inFolder() && slot === 0) { grid.append(backSlot()); continue; }
    const i = slot - offset();
    const b = list[i];
    grid.append(b ? keySlot(b, i) : emptySlot(i, i === list.length));
  }
  $('#ed-add-key').disabled = $('#ed-add-folder').disabled = list.length >= capacity();
}

function keySlot(b, i) {
  const el = h('button', {
    type: 'button', class: `key ed-key${i === sel ? ' sel' : ''}`, draggable: true,
    'aria-label': `${isFolder(b) ? 'Pasta' : 'Tecla'} ${b.label}`, 'aria-pressed': String(i === sel), title: b.label,
    onclick: () => { sel = i; renderAll(); },
    ondblclick: () => { if (isFolder(b)) openFolder(b); },
    ondragstart: (e) => { dragFrom = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); el.classList.add('dragging'); },
    ondragend: () => { dragFrom = null; el.classList.remove('dragging'); },
  }, face(b));
  dropTarget(el, () => i);
  return el;
}

function emptySlot(i, first) {
  const el = h('div', { class: `ed-empty${first ? ' first' : ''}` },
    first ? h('button', { type: 'button', class: 'ed-empty-add', 'aria-label': 'Nova tecla', text: '+', onclick: () => addKey('key') }) : null);
  dropTarget(el, () => currentList().length);
  return el;
}

function backSlot() {
  const el = h('button', {
    type: 'button', class: 'key ed-key ed-back', 'aria-label': 'Voltar', title: 'Voltar (solte aqui para tirar da pasta)',
    onclick: () => { path.pop(); sel = null; renderAll(); },
  }, h('span', { class: 'lcd' }, h('img', { src: '/icons/voltar.svg', alt: '', draggable: false })));
  el.addEventListener('dragover', (e) => { if (dragFrom != null) { e.preventDefault(); el.classList.add('drop'); } });
  el.addEventListener('dragleave', () => el.classList.remove('drop'));
  el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('drop'); moveToParent(dragFrom); });
  return el;
}

function dropTarget(el, indexOf) {
  el.addEventListener('dragover', (e) => { if (dragFrom != null) { e.preventDefault(); el.classList.add('drop'); } });
  el.addEventListener('dragleave', () => el.classList.remove('drop'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('drop');
    if (dragFrom == null) return;
    const list = currentList();
    const [item] = list.splice(dragFrom, 1);
    list.splice(Math.min(indexOf(), list.length), 0, item);
    sel = list.indexOf(item);
    changed();
  });
}

function moveToParent(from) {
  if (from == null || !inFolder()) return;
  const parent = listAt(path.slice(0, -1));
  const cap = path.length > 1 ? FOLDER_KEYS : KEYS;
  if (parent.length >= cap) return status('Não cabe: o nível de cima já está cheio.', 'err');
  const [item] = currentList().splice(from, 1);
  parent.push(item);
  sel = null;
  status(`"${item.label}" saiu da pasta.`, 'ok');
  changed();
}

function openFolder(b) {
  path.push(b.id);
  sel = null;
  renderAll();
}

function addKey(kind) {
  const list = currentList();
  if (list.length >= capacity()) return status('Esta página está cheia. Crie outra página ou uma pasta.', 'err');
  const b = kind === 'folder'
    ? { id: uniqueId('pasta'), label: 'Nova pasta', folder: [] }
    : { id: uniqueId('tecla'), label: 'Nova tecla', action: { type: 'app', aumid: '' } };
  list.push(b);
  sel = list.length - 1;
  changed();
  $('#f-label')?.select();
}
$('#ed-add-key').onclick = () => addKey('key');
$('#ed-add-folder').onclick = () => addKey('folder');

// ---------- páginas e caminho ----------
function renderPages() {
  const nav = $('#ed-pages');
  nav.innerHTML = '';
  deck.pages.forEach((p, i) => nav.append(h('button', {
    type: 'button', class: 'ed-tab', 'aria-current': i === pageIdx ? 'page' : null, text: p.name,
    onclick: () => { pageIdx = i; path = []; sel = null; renderAll(); },
  })));
  nav.append(h('button', {
    type: 'button', class: 'ed-tab ed-tab-add', text: '+ Página',
    onclick: () => {
      if (deck.pages.length >= 20) return status('No máximo 20 páginas.', 'err');
      deck.pages.push({ name: `Página ${deck.pages.length + 1}`, buttons: [] });
      pageIdx = deck.pages.length - 1; path = []; sel = null;
      changed();
    },
  }));
}

function renderCrumbs() {
  const el = $('#ed-crumbs');
  el.innerHTML = '';
  if (!inFolder()) { el.hidden = true; return; }
  el.hidden = false;
  el.append(h('button', { type: 'button', text: deck.pages[pageIdx].name, onclick: () => { path = []; sel = null; renderAll(); } }));
  let list = deck.pages[pageIdx].buttons;
  path.forEach((id, n) => {
    const f = list.find((b) => b.id === id);
    list = f.folder;
    el.append(h('span', { class: 'sep', text: '›' }));
    el.append(n === path.length - 1
      ? h('span', { class: 'here', text: f.label })
      : h('button', { type: 'button', text: f.label, onclick: () => { path = path.slice(0, n + 1); sel = null; renderAll(); } }));
  });
}

// ---------- painel de propriedades ----------
let fieldSeq = 0;
function field(label, control, hint) {
  const id = control.id || `f-${++fieldSeq}`;
  if (!control.id && /^(INPUT|SELECT|TEXTAREA)$/.test(control.tagName)) control.id = id;
  return h('div', { class: 'ed-field' },
    h('label', { for: control.id || null, text: label }),
    control,
    hint ? h('p', { class: 'ed-hint', text: hint }) : null);
}

function input(value, onInput, props = {}) {
  return h('input', { type: 'text', value: value ?? '', spellcheck: 'false', oninput: (e) => onInput(e.target.value), ...props });
}

function select(options, value, onChange, props = {}) {
  const s = h('select', { onchange: (e) => onChange(e.target.value), ...props },
    options.map(([v, label]) => h('option', { value: v, text: label })));
  s.value = value;
  return s;
}

function renderPanel() {
  panel.innerHTML = '';
  const list = currentList();
  const b = sel != null ? list[sel] : null;
  if (b) keyPanel(b, list);
  else pagePanel();
}

const ACTION_TYPES = [
  ['app', 'Abrir app instalado'],
  ['url', 'Abrir site'],
  ['exe', 'Abrir programa (.exe)'],
  ['keys', 'Atalho de teclado'],
  ['routine', 'Rotina (várias ações em sequência)'],
  ['system', 'Sistema: bloquear ou suspender o PC'],
  ['idea', 'Capturar ideia por voz'],
  ['folder', 'Pasta de teclas'],
];

function defaultAction(type) {
  switch (type) {
    case 'app': return { type, aumid: '' };
    case 'exe': return { type, path: '' };
    case 'url': return { type, browser: Object.keys(deck.browsers)[0] || 'chrome', url: 'https://' };
    case 'keys': return { type, keys: '' };
    case 'idea': return { type, file: IDEA_FILE };
    case 'routine': return { type, steps: [] };
    case 'system': return { type, command: 'lock' };
  }
}

// teclas que uma rotina pode apertar: as que executam algo direto (não pasta, ideia ou outra rotina)
function routineTargets(self) {
  const out = [];
  const visit = (list, trail) => {
    for (const b of list) {
      if (isFolder(b)) { visit(b.folder, [...trail, b.label]); continue; }
      if (b === self || ['idea', 'routine'].includes(b.action?.type)) continue;
      out.push({ id: b.id, label: trail.length ? `${b.label} (${trail.join(' › ')})` : b.label });
    }
  };
  deck.pages.forEach((p) => visit(p.buttons, deck.pages.length > 1 ? [p.name] : []));
  return out;
}

const STEP_TYPES = [['key', 'Apertar tecla do deck'], ['wait', 'Esperar'], ['keys', 'Atalho de teclado'], ['url', 'Abrir site']];

function routineFields(b) {
  const a = b.action;
  const targets = routineTargets(b);
  const box = h('div', { class: 'ed-steps' });
  const restep = () => { renderPanel(); light(); };

  a.steps.forEach((s, i) => {
    const types = STEP_TYPES.some(([t]) => t === s.type) ? STEP_TYPES : [...STEP_TYPES, [s.type, `Outro (${s.type})`]];
    const typeSel = select(types, s.type, (t) => {
      a.steps[i] = t === 'key' ? { type: 'key', id: targets[0]?.id || '' }
        : t === 'wait' ? { type: 'wait', ms: 1000 }
        : t === 'keys' ? { type: 'keys', keys: '' }
        : { type: 'url', browser: Object.keys(deck.browsers)[0] || 'chrome', url: 'https://' };
      restep();
    }, { 'aria-label': `Tipo do passo ${i + 1}` });

    let detail = null;
    if (s.type === 'key') {
      const opts = targets.map((t) => [t.id, t.label]);
      if (!targets.some((t) => t.id === s.id)) opts.unshift([s.id || '', s.id ? `"${s.id}" (não existe mais)` : 'Escolha a tecla…']);
      detail = select(opts, s.id || '', (v) => { s.id = v; light(); }, { 'aria-label': `Tecla do passo ${i + 1}` });
    } else if (s.type === 'wait') {
      detail = h('div', { class: 'ed-row ed-wait' },
        h('input', { type: 'number', min: '0', max: '10', step: '0.5', value: String(s.ms / 1000), 'aria-label': `Segundos do passo ${i + 1}`,
          oninput: (e) => { s.ms = Math.round(Math.max(0, Math.min(10, Number(e.target.value) || 0)) * 1000); light(); } }),
        h('span', { class: 'ed-hint', text: 'segundos' }));
    } else if (s.type === 'keys') {
      detail = input(Array.isArray(s.keys) ? s.keys.join(', ') : s.keys, (v) => {
        const parts = v.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
        s.keys = parts.length > 1 ? parts : parts[0] || '';
        light();
      }, { placeholder: 'ctrl+shift+m', 'aria-label': `Atalho do passo ${i + 1}` });
    } else if (s.type === 'url') {
      detail = h('div', { class: 'ed-row' },
        input(s.url, (v) => { s.url = v.trim(); light(); }, { type: 'url', 'aria-label': `Endereço do passo ${i + 1}` }),
        select(Object.keys(deck.browsers).map((k) => [k, k]), s.browser, (v) => { s.browser = v; light(); }, { 'aria-label': `Navegador do passo ${i + 1}` }));
    } else {
      detail = h('p', { class: 'ed-hint', text: 'Passo editado à mão no deck.json.' });
    }

    const move = (d) => { const [x] = a.steps.splice(i, 1); a.steps.splice(i + d, 0, x); restep(); };
    box.append(h('div', { class: 'ed-step' },
      h('span', { class: 'ed-step-n', text: String(i + 1) }),
      h('div', { class: 'ed-step-body' }, typeSel, detail),
      h('div', { class: 'ed-step-tools' },
        h('button', { type: 'button', class: 'ed-icon-btn', 'aria-label': `Subir passo ${i + 1}`, text: '↑', disabled: i === 0, onclick: () => move(-1) }),
        h('button', { type: 'button', class: 'ed-icon-btn', 'aria-label': `Descer passo ${i + 1}`, text: '↓', disabled: i === a.steps.length - 1, onclick: () => move(1) }),
        h('button', { type: 'button', class: 'ed-icon-btn ed-danger', 'aria-label': `Remover passo ${i + 1}`, text: '×', onclick: () => { a.steps.splice(i, 1); restep(); } }))));
  });

  if (!a.steps.length) box.append(h('p', { class: 'ed-hint', text: 'Nenhum passo ainda. Comece apertando teclas que já existem no deck.' }));
  box.append(h('div', { class: 'ed-row' },
    h('button', { type: 'button', class: 'ed-btn', text: '+ Passo', disabled: a.steps.length >= 12, onclick: () => {
      a.steps.push(targets.length ? { type: 'key', id: targets[0].id } : { type: 'wait', ms: 1000 });
      restep();
    } }),
    h('button', { type: 'button', class: 'ed-btn', text: '+ Espera', disabled: a.steps.length >= 12, onclick: () => { a.steps.push({ type: 'wait', ms: 1500 }); restep(); } })));

  panel.append(h('div', { class: 'ed-field' }, h('label', { text: 'Passos' }), box,
    h('p', { class: 'ed-hint', text: 'Rodam em ordem, com uma pausa curta entre eles. Use "Esperar" antes de um atalho de teclado para dar tempo do app abrir. Até 12 passos e 30 s de espera somados.' })));
}

function keyPanel(b, list) {
  const kind = isFolder(b) ? 'folder' : b.action?.type || 'app';
  panel.append(h('h2', { text: isFolder(b) ? 'Pasta' : 'Tecla' }));

  panel.append(field('Nome', input(b.label, (v) => { b.label = v; light(); }, { id: 'f-label', maxlength: 60 }),
    'No celular a tecla mostra só o ícone; o nome aparece no leitor de tela e quando não há ícone.'));

  // ícone
  const iconBox = h('div', { class: 'ed-icon-row' },
    h('span', { class: 'ed-icon-preview' }, b.image ? h('img', { src: b.image, alt: '' }) : h('span', { text: isFolder(b) ? 'miniaturas' : 'sem ícone' })),
    h('button', { type: 'button', class: 'ed-btn', text: 'Escolher…', onclick: () => openIcons(b) }),
    kind === 'app' ? h('button', { type: 'button', class: 'ed-btn', text: 'Ícone do app', onclick: () => iconFrom('app', b) }) : null,
    kind === 'url' ? h('button', { type: 'button', class: 'ed-btn', text: 'Ícone do site', onclick: () => iconFrom('site', b) }) : null,
    b.image ? h('button', { type: 'button', class: 'ed-btn ed-quiet', text: 'Remover', onclick: () => { delete b.image; renderPanel(); light(); } }) : null);
  panel.append(field('Ícone', iconBox, isFolder(b) ? 'Sem ícone, a pasta mostra as 4 primeiras teclas dela.' : null));

  // o que faz
  panel.append(field('O que faz', select(ACTION_TYPES, kind, (type) => {
    if (type === 'folder') {
      if (!isFolder(b)) { delete b.action; delete b.live; b.folder = []; }
    } else {
      if (isFolder(b)) {
        if (b.folder.length && !confirm(`Apagar as ${b.folder.length} teclas de dentro da pasta "${b.label}"?`)) return renderPanel();
        delete b.folder;
      }
      b.action = defaultAction(type);
      if (type !== 'keys' && b.live?.type === 'media') delete b.live;
      if (type === 'routine' || type === 'system') delete b.live;
    }
    renderPanel();
    light();
  }, { id: 'f-type' })));

  if (kind === 'folder') {
    panel.append(h('div', { class: 'ed-field' },
      h('p', { class: 'ed-hint', text: `${b.folder.length} de ${FOLDER_KEYS} teclas. No celular, a primeira tecla da pasta é "voltar".` }),
      h('button', { type: 'button', class: 'ed-btn', text: 'Abrir pasta', onclick: () => openFolder(b) })));
  } else {
    actionFields(b);
    if (kind !== 'routine' && kind !== 'system') liveFields(b);
  }

  // ações da tecla
  const row = h('div', { class: 'ed-row' });
  if (kind !== 'folder' && kind !== 'idea') {
    row.append(h('button', { type: 'button', class: 'ed-btn', text: 'Testar no PC', onclick: async () => {
      if (kind === 'system' && !confirm(b.action.command === 'sleep' ? 'Isso vai suspender o PC agora. Continuar?' : 'Isso vai bloquear a tela do PC agora. Continuar?')) return;
      if (kind === 'routine') status(`Rodando "${b.label}"…`);
      try { await call('/api/editor/test', { action: b.action, deck }); status(`"${b.label}" funcionou no PC.`, 'ok'); }
      catch (e) { status(e.message === 'erro interno' ? 'Não funcionou: veja a janela do agente.' : `Não funcionou: ${e.message}`, 'err'); }
    } }));
  }
  row.append(h('button', { type: 'button', class: 'ed-btn ed-danger', text: isFolder(b) ? 'Excluir pasta' : 'Excluir tecla', onclick: () => {
    if (isFolder(b) && b.folder.length && !confirm(`Excluir a pasta "${b.label}" e as ${b.folder.length} teclas dela?`)) return;
    list.splice(sel, 1);
    sel = null;
    changed();
  } }));
  panel.append(h('div', { class: 'ed-field' }, row));

  moveField(b, list);
}

function actionFields(b) {
  const a = b.action;
  if (a.type === 'app') {
    const current = apps.find((x) => x.aumid === a.aumid);
    const aumidInput = input(a.aumid, (v) => { a.aumid = v.trim(); light(); }, { id: 'f-aumid' });
    panel.append(field('App', input(current?.name || '', (v) => {
      const found = apps.find((x) => x.name.toLowerCase() === v.trim().toLowerCase());
      if (!found) return;
      a.aumid = found.aumid;
      aumidInput.value = found.aumid;
      if (/^Nova tecla$/i.test(b.label)) { b.label = found.name; $('#f-label').value = found.name; }
      light();
    }, { list: 'apps-list', placeholder: apps.length ? 'Digite o nome do app…' : 'Carregando apps…' }),
    'Os apps do menu Iniciar. Escolha um da lista.'));
    panel.append(field('AppID', aumidInput));
  } else if (a.type === 'exe') {
    panel.append(field('Caminho do programa', input(a.path, (v) => { a.path = v; light(); }, { placeholder: 'C:\\Program Files\\…\\app.exe' }),
      'Aceita variáveis como %LOCALAPPDATA%.'));
    panel.append(field('Argumentos', h('textarea', { rows: 2, spellcheck: 'false', value: (a.args || []).join('\n'), oninput: (e) => {
      const args = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
      if (args.length) a.args = args; else delete a.args;
      light();
    } }), 'Um por linha (opcional).'));
  } else if (a.type === 'url') {
    panel.append(field('Endereço', input(a.url, (v) => { a.url = v.trim(); light(); }, { type: 'url' })));
    panel.append(field('Navegador', select(Object.keys(deck.browsers).map((k) => [k, k]), a.browser, (v) => { a.browser = v; light(); })));
  } else if (a.type === 'keys') {
    const keysInput = input(Array.isArray(a.keys) ? a.keys.join(', ') : a.keys, (v) => setKeys(v), { id: 'f-keys', placeholder: 'ctrl+shift+m' });
    const hint = h('p', { class: 'ed-hint', id: 'f-keys-hint' });
    const setKeys = (v) => {
      const parts = v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      a.keys = parts.length > 1 ? parts : parts[0] || '';
      checkKeys(parts, hint);
      light();
    };
    const rec = h('button', { type: 'button', class: 'ed-btn', text: 'Gravar', onclick: () => recordKeys(rec, (combo) => { keysInput.value = combo; setKeys(combo); }) });
    const presets = select([
      ['', 'Atalhos prontos…'],
      ['media_play_pause', 'Mídia: tocar / pausar'], ['media_next', 'Mídia: próxima faixa'], ['media_prev', 'Mídia: faixa anterior'],
      ['volume_up', 'Volume +'], ['volume_down', 'Volume −'], ['volume_mute', 'Silenciar'],
      ['ctrl+shift+m', 'Teams: ligar/desligar microfone'], ['ctrl+shift+o', 'Teams: ligar/desligar câmera'],
      ['win+shift+s', 'Recortar tela'], ['win+d', 'Mostrar área de trabalho'], ['win+l', 'Bloquear o PC'],
      ['ctrl+c', 'Copiar'], ['ctrl+v', 'Colar'], ['alt+tab', 'Trocar de janela'],
    ], '', (v) => { if (!v) return; keysInput.value = v; setKeys(v); presets.value = ''; });
    panel.append(h('div', { class: 'ed-field' },
      h('label', { for: 'f-keys', text: 'Atalho' }),
      h('div', { class: 'ed-row' }, keysInput, rec),
      presets,
      hint));
    checkKeys(String(keysInput.value).split(',').map((s) => s.trim()).filter(Boolean), hint);
  } else if (a.type === 'idea') {
    panel.append(field('Arquivo de ideias', input(a.file, (v) => { a.file = v; light(); }),
      'Cada ideia vira uma linha com data e hora. Pode ser uma nota do seu cofre do Obsidian (.md).'));
    panel.append(h('p', { class: 'ed-hint', text: 'No celular, a tecla abre o ditado: fale, revise e toque em Salvar. O ditado do Chrome usa o serviço de voz do Google.' }));
  } else if (a.type === 'routine') {
    routineFields(b);
  } else if (a.type === 'system') {
    panel.append(field('Comando', select([['lock', 'Bloquear a tela'], ['sleep', 'Suspender o PC']], a.command, (v) => { a.command = v; light(); }),
      a.command === 'sleep'
        ? 'O PC suspende 1,5 s depois do toque. Enquanto ele dorme o celular fica offline; para acordar, use o teclado, o mouse ou o botão do PC.'
        : 'Bloqueia como o Win+L. Desbloquear pelo celular não é possível: o Windows isola a tela de bloqueio de qualquer programa, de propósito.'));
  }
}

function checkKeys(parts, hint) {
  const bad = [];
  for (const combo of parts) for (const k of combo.split('+').map((s) => s.trim())) if (k && !keyNames.has(k) && !['control', 'escape', 'del', 'windows', 'cmd', 'meta', 'return'].includes(k)) bad.push(k);
  hint.dataset.tone = bad.length ? 'err' : '';
  hint.textContent = bad.length
    ? `Tecla desconhecida: ${[...new Set(bad)].join(', ')}.`
    : 'Junte teclas com + (ctrl+shift+m). Para uma sequência, separe com vírgula (win+r, enter). A tecla vai para a janela que estiver em foco no PC.';
}

// grava a combinação apertada no teclado do PC
const CODE_NAMES = {
  Enter: 'enter', NumpadEnter: 'enter', Escape: 'esc', Tab: 'tab', Space: 'space', Backspace: 'backspace', Delete: 'delete', Insert: 'insert',
  Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  PrintScreen: 'printscreen', CapsLock: 'capslock', Minus: 'minus', Equal: 'equal', Comma: 'comma', Period: 'period', Slash: 'slash',
  Semicolon: 'semicolon', Quote: 'quote', Backquote: 'backquote', BracketLeft: 'bracketleft', BracketRight: 'bracketright', Backslash: 'backslash',
  MediaPlayPause: 'media_play_pause', MediaTrackNext: 'media_next', MediaTrackPrevious: 'media_prev', MediaStop: 'media_stop',
  AudioVolumeMute: 'volume_mute', AudioVolumeDown: 'volume_down', AudioVolumeUp: 'volume_up',
};
function codeName(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^(Digit|Numpad)\d$/.test(code)) return code.slice(-1);
  if (/^F\d{1,2}$/.test(code)) return code.toLowerCase();
  return CODE_NAMES[code] || null;
}

let recording = null;
function recordKeys(btn, done) {
  if (recording) return stopRecording();
  btn.textContent = 'Parar';
  btn.classList.add('rec');
  status('Aperte a combinação no teclado do PC…', 'dirty');
  const onKey = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'].includes(e.key)) return;
    const name = codeName(e.code);
    if (!name) { status('Essa tecla não pode ser gravada. Digite o nome no campo.', 'err'); return; }
    const mods = [e.ctrlKey && 'ctrl', e.shiftKey && 'shift', e.altKey && 'alt', e.metaKey && 'win'].filter(Boolean);
    done([...mods, name].join('+'));
    stopRecording();
    updateDirty();
  };
  recording = { btn, onKey };
  window.addEventListener('keydown', onKey, true);
}
function stopRecording() {
  if (!recording) return;
  window.removeEventListener('keydown', recording.onKey, true);
  recording.btn.textContent = 'Gravar';
  recording.btn.classList.remove('rec');
  recording = null;
}

function liveFields(b) {
  const type = b.live?.type || '';
  const opts = [['', 'Não'], ['process', 'Mostrar se o app está aberto']];
  if (b.action?.type === 'keys' || type === 'media') opts.push(['media', 'Mostrar a música ou vídeo tocando']);
  panel.append(field('Tecla viva', select(opts, type, (v) => {
    if (!v) delete b.live;
    else if (v === 'media') b.live = { type: 'media' };
    else {
      const guess = b.action?.type === 'exe' ? (b.action.path.split(/[\\/]/).pop() || '').replace(/\.exe$/i, '') : '';
      b.live = { type: 'process', name: guess };
    }
    renderPanel();
    light();
  })));
  if (type === 'process') {
    loadProcesses();
    panel.append(field('Processo', input(b.live.name, (v) => { b.live.name = v.trim(); light(); }, { list: 'procs-list', placeholder: 'ex.: Code, ms-teams, Docker Desktop' }),
      'Nome do processo no Gerenciador de Tarefas, sem .exe. Abra o app no PC para ele aparecer na lista. Um LED verde acende na tecla quando o app está aberto.'));
    panel.append(field('Trecho do caminho (opcional)', input(b.live.path || '', (v) => { if (v.trim()) b.live.path = v.trim(); else delete b.live.path; light(); }),
      'Separa apps com o mesmo nome de processo. Ex.: AnthropicPBC.Claude distingue o Claude Desktop do Claude Code.'));
  } else if (type === 'media') {
    panel.append(h('p', { class: 'ed-hint', text: 'A tecla mostra a capa, o título e se está tocando ou pausado. Combine com o atalho media_play_pause.' }));
  }
}

function moveField(b, list) {
  const dests = [];
  const cur = currentList();
  deck.pages.forEach((p, pi) => {
    if (p.buttons !== cur) dests.push({ label: `Página ${p.name}`, list: p.buttons, cap: KEYS });
    const visit = (items, trail, depth) => {
      for (const f of items) {
        if (!isFolder(f) || f === b) continue;
        if (f.folder !== cur && depth < 3) dests.push({ label: `Pasta ${[...trail, f.label].join(' › ')}`, list: f.folder, cap: FOLDER_KEYS });
        visit(f.folder, [...trail, f.label], depth + 1);
      }
    };
    visit(p.buttons, [p.name], 1);
  });
  if (!dests.length) return;
  const s = select([['', 'Escolha o destino…'], ...dests.map((d, i) => [String(i), d.label])], '', () => {});
  panel.append(field('Mover para', h('div', { class: 'ed-row' }, s, h('button', { type: 'button', class: 'ed-btn', text: 'Mover', onclick: () => {
    if (s.value === '') return;
    const d = dests[Number(s.value)];
    if (d.list.length >= d.cap) return status('O destino está cheio.', 'err');
    list.splice(sel, 1);
    d.list.push(b);
    sel = null;
    status(`"${b.label}" foi para ${d.label}.`, 'ok');
    changed();
  } }))));
}

function pagePanel() {
  const page = deck.pages[pageIdx];
  panel.append(h('h2', { text: 'Página' }));
  panel.append(field('Nome da página', input(page.name, (v) => { page.name = v; renderPages(); updateDirty(); }, { maxlength: 30 })));
  const row = h('div', { class: 'ed-row' },
    h('button', { type: 'button', class: 'ed-btn', text: '◀ Mover', disabled: pageIdx === 0, onclick: () => movePage(-1) }),
    h('button', { type: 'button', class: 'ed-btn', text: 'Mover ▶', disabled: pageIdx === deck.pages.length - 1, onclick: () => movePage(1) }),
    h('button', { type: 'button', class: 'ed-btn ed-danger', text: 'Excluir página', disabled: deck.pages.length < 2, onclick: () => {
      if (page.buttons.length && !confirm(`Excluir a página "${page.name}" e as ${page.buttons.length} teclas dela?`)) return;
      deck.pages.splice(pageIdx, 1);
      pageIdx = Math.max(0, pageIdx - 1); path = []; sel = null;
      changed();
    } }));
  panel.append(h('div', { class: 'ed-field' }, row));

  panel.append(h('h2', { text: 'Deck' }));
  panel.append(field('Título', input(deck.title, (v) => { deck.title = v; updateDirty(); }, { maxlength: 40 }), 'Aparece no topo do celular.'));

  panel.append(h('h2', { text: 'Navegadores' }));
  for (const name of Object.keys(deck.browsers)) {
    panel.append(field(name, input(deck.browsers[name], (v) => { deck.browsers[name] = v; updateDirty(); })));
  }
  panel.append(h('button', { type: 'button', class: 'ed-btn', text: '+ Navegador', onclick: () => {
    const name = slug(prompt('Nome do navegador (ex.: firefox):') || '');
    if (!name || deck.browsers[name]) return;
    deck.browsers[name] = '';
    changed();
  } }));
  panel.append(h('p', { class: 'ed-hint', text: 'Clique numa tecla da grade para editar.' }));
}

function movePage(dir) {
  const [p] = deck.pages.splice(pageIdx, 1);
  pageIdx += dir;
  deck.pages.splice(pageIdx, 0, p);
  changed();
}

// ---------- ícones ----------
const dialog = $('#ed-icons');
let iconTarget = null;
dialog.querySelector('[data-close]').onclick = () => dialog.close();

async function openIcons(b) {
  iconTarget = b;
  const box = $('#ed-icons-grid');
  box.innerHTML = '<p class="ed-hint">Carregando…</p>';
  dialog.showModal();
  try {
    const icons = await call('/api/editor/icons');
    box.innerHTML = '';
    for (const src of icons) {
      box.append(h('button', { type: 'button', class: `ed-icon-pick${src === b.image ? ' sel' : ''}`, title: src.replace('/icons/', ''),
        onclick: () => setIcon(src) }, h('img', { src, alt: src.replace('/icons/', '') })));
    }
  } catch (e) { box.innerHTML = ''; box.append(h('p', { class: 'ed-hint', text: e.message })); }
}

function setIcon(src) {
  if (!iconTarget) return;
  iconTarget.image = src;
  if (dialog.open) dialog.close();
  renderPanel();
  light();
}

$('#ed-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) return status('Ícone acima de 2 MB.', 'err');
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const { image } = await call('/api/editor/icon', { name: iconTarget?.label || file.name.replace(/\.\w+$/, ''), data: reader.result });
      status('Ícone enviado.', 'ok');
      setIcon(image);
    } catch (err) { status(err.message, 'err'); }
  };
  reader.readAsDataURL(file);
});

async function iconFrom(source, b) {
  status(source === 'app' ? 'Pedindo o ícone ao Windows…' : 'Buscando o ícone do site…');
  try {
    const { image } = source === 'app'
      ? await call('/api/editor/icon-from-app', { aumid: b.action.aumid, name: b.label })
      : await call('/api/editor/icon-from-site', { url: b.action.url, name: b.label });
    b.image = image;
    status('Ícone atualizado.', 'ok');
    renderPanel();
    light();
  } catch (e) { status(e.message, 'err'); }
}

// ---------- listas do PC (apps do Iniciar, processos) ----------
async function loadApps() {
  try {
    apps = await call('/api/editor/apps');
    const dl = $('#apps-list');
    dl.innerHTML = '';
    for (const a of apps) dl.append(h('option', { value: a.name }));
    if (sel != null && currentList()[sel]?.action?.type === 'app') renderPanel();
  } catch {}
}
async function loadProcesses() {
  if (procsLoaded) return;
  procsLoaded = true;
  try {
    const names = await call('/api/editor/processes');
    const dl = $('#procs-list');
    for (const n of names) dl.append(h('option', { value: n }));
  } catch { procsLoaded = false; }
}

// ---------- salvar ----------
function showErrors(errors) {
  const box = $('#ed-errors');
  box.innerHTML = '';
  box.hidden = !errors?.length;
  if (!errors?.length) return;
  box.append(h('p', { class: 'ed-errors-title', text: 'Corrija antes de salvar:' }), h('ul', {}, errors.map((e) => h('li', { text: e }))));
}

saveBtn.onclick = async () => {
  saveBtn.disabled = true;
  status('Salvando…');
  try {
    await call('/api/editor/deck', { deck });
    savedJson = JSON.stringify(deck);
    showErrors(null);
    status('Salvo. O celular atualiza sozinho em instantes.', 'ok');
    updateDirty();
  } catch (e) {
    showErrors(e.data?.errors);
    status(e.message, 'err');
    saveBtn.disabled = false;
  }
};

revertBtn.onclick = () => {
  if (!confirm('Descartar as alterações não salvas?')) return;
  deck = JSON.parse(savedJson);
  sel = null;
  if (pageIdx >= deck.pages.length) pageIdx = 0;
  showErrors(null);
  changed();
};

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !recording) { e.preventDefault(); if (!saveBtn.disabled) saveBtn.click(); }
});

function renderAll() {
  renderPages();
  renderCrumbs();
  renderGrid();
  renderPanel();
}

(async function init() {
  try {
    const [{ deck: d }, names] = await Promise.all([call('/api/editor/deck'), call('/api/editor/keynames')]);
    deck = d;
    savedJson = JSON.stringify(deck);
    keyNames = new Set(names);
    renderAll();
    updateDirty();
    loadApps();
  } catch (e) {
    status(`Não consegui abrir o deck: ${e.message}`, 'err');
  }
})();
