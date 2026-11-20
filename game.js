/* Map Studio — build a map, then play it. No AI, everything authored by hand. */
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const deep = o => JSON.parse(JSON.stringify(o));
const LS_MAPS = 'mapstudio:maps', LS_LAST = 'mapstudio:last';
const CHAR_KEY = 'charlab:projects';

const OBJ = {
  ground:   { label: 'Ground',   w: 260, h: 28,  color: '#33406b', solid: 1, ic: '▬' },
  platform: { label: 'Platform', w: 200, h: 20,  color: '#3d5bd8', solid: 1, ic: '▭' },
  mover:    { label: 'Mover',    w: 160, h: 20,  color: '#8b5cf6', solid: 1, ic: '⇄', range: 240, speed: 80, elev: 0 },
  block:    { label: 'Block',    w: 80,  h: 80,  color: '#43507e', solid: 1, ic: '■', elev: 0 },
  spike:    { label: 'Spike',    w: 44,  h: 28,  color: '#e5484d', hazard: 1, ic: '▲', elev: 0 },
  coin:     { label: 'Coin',     w: 24,  h: 24,  color: '#ffd166', pickup: 1, val: 1, ic: '●', elev: 40 },
  gem:      { label: 'Gem',      w: 28,  h: 28,  color: '#2ec4b6', pickup: 1, val: 5, ic: '◆', elev: 40 },
  door:     { label: 'Door',     w: 52,  h: 76,  color: '#c9a227', solid: 1, interact: 1, need: 3, ic: '▯', elev: 0 },
  checkpoint:{ label: 'Checkpoint', w: 26, h: 58, color: '#2ec4b6', interact: 1, ic: '⚑', elev: 0 },
  enemy:    { label: 'Enemy',    w: 40,  h: 40,  color: '#ff6b6b', hazard: 1, ic: '☠', range: 160, speed: 70, elev: 0 },
  npc:      { label: 'NPC',      w: 36,  h: 60,  color: '#9d9aff', interact: 1, txt: 'Hello, traveler!', ic: '☺', elev: 0 },
  goal:     { label: 'Goal',     w: 56,  h: 84,  color: '#2fbf71', interact: 1, ic: '★', elev: 0 },
  spawn:    { label: 'Spawn',    w: 34,  h: 52,  color: '#ffffff', ic: '⌖' },
  decor:    { label: 'Decor',    w: 64,  h: 64,  color: '#4a568f', ic: '◇', elev: 0 }
};
const MODES = { side: '2D side-scroll', top: '2D top-down', three: '3D' };
const CAMS = { side: 'Side-scroll follow', top: 'Top-down follow', third: '3rd person orbit', first: '1st person', free: 'Free orbit' };
const CAM_FOR = { side: 'side', top: 'top', three: 'third' };
const KEYS = ['left', 'right', 'up', 'down', 'jump', 'run', 'interact', 'pause'];
const KEY_LABEL = { left: 'Move left', right: 'Move right', up: 'Up / forward', down: 'Down / back', jump: 'Jump', run: 'Run', interact: 'Interact', pause: 'Pause' };
const DEFAULT_KEYS = { left: 'a', right: 'd', up: 'w', down: 's', jump: ' ', run: 'shift', interact: 'e', pause: 'escape' };
const BG_PRESETS = { dark: '#101a33', light: '#dfe8f6' };
function bgIsLight(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return false;
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 150;
}

let maps = [], cur = null, charLib = [];
let selId = null, tool = 'select', placeType = null, keyWatch = null;
let zoom = 1, camX = 0, camY = 0, dpr = 1, drag = null, pan = null, moved = false;
const view = $('#view'), vctx = view.getContext('2d');

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2200);
}
function keyName(e) {
  if (e.key === ' ') return ' ';
  return String(e.key || '').toLowerCase();
}
function prettyKey(k) {
  if (k === ' ') return 'Space';
  if (k === 'escape') return 'Esc';
  if (k === 'shift') return 'Shift';
  return k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1);
}

/* ---------------- maps ---------------- */
function blankMap(name, mode) {
  return {
    v: 1, id: uid(), name: name || 'Untitled map', mode: mode || 'side',
    w: 2400, h: mode === 'side' ? 900 : 1600, bg: '#101a33', bgMode: 'dark',
    spawn: { x: 140, y: mode === 'side' ? 760 : 300 },
    camera: CAM_FOR[mode || 'side'],
    gravity: 2200,
    charId: null,
    rules: { coins: true, hazard: true, enemies: true, checks: true, movers: true, gravity: true, hud: true },
    keys: Object.assign({}, DEFAULT_KEYS),
    objects: [], updated: Date.now(), thumb: null
  };
}
function starterMap(name, mode) {
  const m = blankMap(name, mode);
  const O = (type, x, y, over) => {
    const d = OBJ[type];
    return Object.assign({ id: uid(), type, x, y, w: d.w, h: d.h, elev: d.elev == null ? 0 : d.elev, color: d.color }, over || {});
  };
  if (mode === 'side') {
    m.w = 2600; m.h = 900; m.spawn = { x: 120, y: 730 };
    m.objects = [
      O('ground', 0, 820, { w: 900, h: 80 }),
      O('ground', 980, 820, { w: 760, h: 80 }),
      O('ground', 1900, 820, { w: 700, h: 80 }),
      O('platform', 360, 700), O('platform', 690, 600, { w: 170 }), O('platform', 1030, 700, { w: 220 }),
      O('mover', 1350, 620, { range: 240, speed: 85 }),
      O('coin', 400, 650), O('coin', 452, 650), O('coin', 504, 650),
      O('coin', 720, 550), O('coin', 770, 550),
      O('gem', 1420, 560),
      O('spike', 960, 792),
      O('enemy', 620, 780, { range: 220 }),
      O('checkpoint', 1760, 762),
      O('door', 1980, 744, { need: 3 }),
      O('goal', 2380, 736),
      O('decor', 300, 760, { w: 70, h: 60 })
    ];
  } else if (mode === 'top') {
    m.w = 1800; m.h = 1300; m.spawn = { x: 180, y: 180 };
    m.objects = [
      O('block', 420, 260, { w: 220, h: 120 }),
      O('block', 820, 520, { w: 160, h: 260 }),
      O('block', 1200, 250, { w: 260, h: 140 }),
      O('spike', 700, 900), O('spike', 748, 900), O('spike', 796, 900),
      O('coin', 250, 600), O('coin', 300, 600), O('coin', 350, 600),
      O('gem', 1300, 900),
      O('enemy', 500, 700, { range: 260 }),
      O('checkpoint', 900, 1040),
      O('door', 1450, 1080, { need: 3 }),
      O('goal', 1640, 1100)
    ];
  } else {
    m.w = 1800; m.h = 1800; m.spawn = { x: 900, y: 160 };
    m.objects = [
      O('checkpoint', 860, 280),
      O('coin', 700, 400), O('coin', 760, 420), O('coin', 820, 440),
      O('block', 520, 520, { w: 260, h: 180 }),
      O('platform', 1020, 560, { w: 260, h: 220, elev: 90 }),
      O('gem', 1120, 760, { elev: 150 }),
      O('block', 1360, 780, { w: 220, h: 200 }),
      O('decor', 250, 900, { w: 60, h: 260, eh: 300 }),
      O('decor', 1550, 500, { w: 60, h: 300, eh: 260 }),
      O('door', 980, 980, { need: 3 }),
      O('enemy', 660, 1020, { range: 240 }),
      O('coin', 1120, 1180),
      O('checkpoint', 900, 1280),
      O('goal', 980, 1600)
    ];
  }
  return m;
}
function loadMaps() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_MAPS) || '[]');
    maps = Array.isArray(raw) ? raw.filter(m => m && m.id) : [];
  } catch (e) { maps = []; }
  maps.forEach(m => {
    m.rules = Object.assign({ coins: true, hazard: true, enemies: true, checks: true, movers: true, gravity: true, hud: true }, m.rules || {});
    m.keys = Object.assign({}, DEFAULT_KEYS, m.keys || {});
    m.gravity = m.gravity == null ? 2200 : m.gravity;
    m.objects = m.objects || [];
    if (m.bgMode !== 'light' && m.bgMode !== 'custom') m.bgMode = 'dark';
  });
}
function saveMaps() {
  if (cur) { cur.updated = Date.now(); thumbFor(cur); }
  try { localStorage.setItem(LS_MAPS, JSON.stringify(maps)); } catch (e) { toast('Storage is full'); }
  if (cur) localStorage.setItem(LS_LAST, cur.id);
}
function thumbFor(m) { m.thumb = renderThumb(m); }
function openMap(m) {
  cur = m;
  if (!cur.spawn) cur.spawn = { x: 140, y: 300 };
  selId = null; placeType = null; setTool('select');
  syncAll(); fit();
  $('#lib').hidden = true;
  localStorage.setItem(LS_LAST, cur.id);
}
function syncAll() {
  if (!cur) return;
  $('#mapName').value = cur.name;
  $('#modeBadge').textContent = MODES[cur.mode] || cur.mode;
  $('#footObj').textContent = cur.objects.length;
  $('#footSpawn').textContent = Math.round(cur.spawn.x) + ', ' + Math.round(cur.spawn.y);
  $('#objCount').textContent = cur.objects.length;
  $('#setObjN').textContent = cur.objects.length;
  $('#spawnX').textContent = Math.round(cur.spawn.x);
  $('#spawnY').textContent = Math.round(cur.spawn.y);
  $('#setMode').value = cur.mode;
  $('#setW').value = cur.w; $('#setH').value = cur.h;
  $('#setBgMode').value = cur.bgMode || 'dark';
  $('#setBg').value = /^#[0-9a-f]{6}$/i.test(cur.bg) ? cur.bg : '#101a33';
  $('#setBg').disabled = cur.bgMode !== 'custom';
  $('#setGravity').value = cur.gravity;
  fillCameraSelect();
  renderObjList(); renderPalette(); renderRules(); renderChars(); renderInspector(); refreshKeys();
  draw();
}
function fillCameraSelect() {
  const sel = $('#setCam');
  const opts = cur.mode === 'three' ? ['third', 'first', 'free'] : ['side', 'top', 'free'];
  if (!opts.includes(cur.camera)) cur.camera = opts[0];
  sel.innerHTML = opts.map(k => `<option value="${k}">${CAMS[k]}</option>`).join('');
  sel.value = cur.camera;
}

/* ---------------- editor canvas ---------------- */
function resizeView() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = view.clientWidth || 800, h = view.clientHeight || 500;
  view.width = Math.round(w * dpr); view.height = Math.round(h * dpr);
  draw();
}
function fit() {
  if (!cur) return;
  const w = view.clientWidth || 800, h = view.clientHeight || 500;
  zoom = clamp(Math.min((w - 80) / cur.w, (h - 80) / cur.h), 0.08, 2);
  camX = cur.w / 2 - w / (2 * zoom);
  camY = cur.h / 2 - h / (2 * zoom);
  $('#zoomLab').textContent = Math.round(zoom * 100) + '%';
  draw();
}
function draw() {
  if (!cur) return;
  const w = view.clientWidth || 0, h = view.clientHeight || 0;
  if (!w) return;
  vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  vctx.clearRect(0, 0, w, h);
  vctx.fillStyle = '#080b12'; vctx.fillRect(0, 0, w, h);
  // world
  vctx.save();
  vctx.translate(-camX * zoom, -camY * zoom);
  vctx.scale(zoom, zoom);
  const bg = /^#[0-9a-f]{6}$/i.test(cur.bg) ? cur.bg : '#101a33';
  const lightBg = bgIsLight(bg);
  vctx.fillStyle = bg; vctx.fillRect(0, 0, cur.w, cur.h);
  const sky = vctx.createLinearGradient(0, 0, 0, cur.h);
  if (lightBg) { sky.addColorStop(0, 'rgba(255,255,255,.5)'); sky.addColorStop(1, 'rgba(20,35,60,.10)'); }
  else { sky.addColorStop(0, 'rgba(255,255,255,.06)'); sky.addColorStop(1, 'rgba(0,0,0,.22)'); }
  vctx.fillStyle = sky; vctx.fillRect(0, 0, cur.w, cur.h);
  if ($('#gridChk').checked) {
    vctx.strokeStyle = lightBg ? 'rgba(30,50,90,.16)' : 'rgba(150,170,220,.10)'; vctx.lineWidth = 1 / zoom;
    vctx.beginPath();
    for (let x = 0; x <= cur.w; x += 60) { vctx.moveTo(x, 0); vctx.lineTo(x, cur.h); }
    for (let y = 0; y <= cur.h; y += 60) { vctx.moveTo(0, y); vctx.lineTo(cur.w, y); }
    vctx.stroke();
  }
  vctx.strokeStyle = 'rgba(124,140,255,.5)'; vctx.lineWidth = 2 / zoom;
  vctx.strokeRect(0, 0, cur.w, cur.h);
  // objects, back to front
  const list = cur.objects.slice();
  if (cur.mode === 'three') list.sort((a, b) => (a.y + a.h) - (b.y + b.h));
  list.forEach(o => paintObj(vctx, o, zoom >= .42 && o.type !== 'coin' && o.type !== 'gem' && o.type !== 'decor'));
  // spawn marker
  const sp = cur.spawn;
  const markClr = lightBg ? '#12203a' : '#ffffff';
  vctx.save();
  vctx.globalAlpha = .95;
  vctx.strokeStyle = markClr; vctx.lineWidth = 2 / zoom;
  vctx.setLineDash([6 / zoom, 4 / zoom]);
  const pw = 34, ph = 54;
  vctx.strokeRect(sp.x - pw / 2, sp.y - ph, pw, ph);
  vctx.setLineDash([]);
  vctx.fillStyle = markClr;
  vctx.beginPath(); vctx.arc(sp.x, sp.y - ph, 4 / zoom + 1, 0, 7); vctx.fill();
  vctx.beginPath(); vctx.moveTo(sp.x, sp.y - ph - 14); vctx.lineTo(sp.x + 9, sp.y - ph - 9); vctx.lineTo(sp.x, sp.y - ph - 4); vctx.closePath(); vctx.fill();
  vctx.font = `${11 / zoom}px Inter,system-ui`; vctx.textAlign = 'center';
  vctx.fillText('SPAWN', sp.x, sp.y - ph - 20);
  vctx.restore();
  // selection
  const sel = objById(selId);
  if (sel) {
    vctx.save();
    vctx.strokeStyle = '#e5484d'; vctx.lineWidth = 2.5 / zoom;
    vctx.strokeRect(sel.x, sel.y, sel.w, sel.h);
    vctx.fillStyle = '#e5484d';
    vctx.font = `600 ${11 / zoom}px Inter,system-ui`; vctx.textAlign = 'left';
    vctx.fillText(OBJ[sel.type] ? OBJ[sel.type].label : sel.type, sel.x, sel.y - 6 / zoom);
    vctx.restore();
  }
  vctx.restore();
}
function paintObj(c, o, showLabel) {
  const d = OBJ[o.type] || OBJ.block;
  const col = o.color || d.color;
  c.save();
  c.lineJoin = 'round';
  const x = o.x, y = o.y, w = o.w, h = o.h;
  const flat = cur.mode !== 'side';
  switch (o.type) {
    case 'spike': {
      c.fillStyle = col;
      c.beginPath(); c.moveTo(x, y + h); c.lineTo(x + w / 2, y); c.lineTo(x + w, y + h); c.closePath(); c.fill();
      break;
    }
    case 'coin': {
      c.fillStyle = col; c.beginPath(); c.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.arc(x + w * .38, y + h * .36, Math.min(w, h) * .13, 0, 7); c.fill();
      break;
    }
    case 'gem': {
      c.fillStyle = col; c.beginPath();
      c.moveTo(x + w / 2, y); c.lineTo(x + w, y + h * .45); c.lineTo(x + w / 2, y + h); c.lineTo(x, y + h * .45);
      c.closePath(); c.fill();
      break;
    }
    case 'goal': {
      c.fillStyle = 'rgba(47,191,113,.18)'; c.strokeStyle = col; c.lineWidth = 2;
      c.beginPath(); c.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, 7); c.fill(); c.stroke();
      c.fillStyle = col; c.font = `700 ${Math.min(w, h) * .5}px Inter,system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('★', x + w / 2, y + h / 2 + 1);
      break;
    }
    case 'door': {
      c.fillStyle = col; roundRect(c, x, y, w, h, 6); c.fill();
      c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(x + w * .62, y + h * .2, w * .1, h * .12);
      c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(x + w * .14, y + h * .12, w * .24, h * .7);
      break;
    }
    case 'checkpoint': {
      c.strokeStyle = '#cfd8f5'; c.lineWidth = 2; c.beginPath(); c.moveTo(x + 3, y + h); c.lineTo(x + 3, y); c.stroke();
      c.fillStyle = col; c.beginPath(); c.moveTo(x + 4, y + 2); c.lineTo(x + w, y + h * .22); c.lineTo(x + 4, y + h * .42); c.closePath(); c.fill();
      break;
    }
    case 'enemy': {
      c.fillStyle = col; roundRect(c, x, y, w, h, 7); c.fill();
      c.fillStyle = '#121826';
      c.beginPath(); c.arc(x + w * .34, y + h * .42, w * .09, 0, 7); c.arc(x + w * .66, y + h * .42, w * .09, 0, 7); c.fill();
      c.fillRect(x + w * .32, y + h * .68, w * .36, h * .08);
      break;
    }
    case 'npc': {
      c.fillStyle = col; roundRect(c, x, y + h * .34, w, h * .66, 6); c.fill();
      c.beginPath(); c.arc(x + w / 2, y + h * .22, w * .24, 0, 7); c.fill();
      break;
    }
    case 'decor': {
      c.strokeStyle = col; c.fillStyle = 'rgba(255,255,255,.06)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x + w / 2, y); c.lineTo(x + w, y + h / 2); c.lineTo(x + w / 2, y + h); c.lineTo(x, y + h / 2); c.closePath();
      c.fill(); c.stroke();
      break;
    }
    case 'mover': {
      c.fillStyle = col; roundRect(c, x, y, w, h, 6); c.fill();
      c.fillStyle = 'rgba(255,255,255,.75)'; c.font = `700 ${h * .72}px Inter,system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('⇄', x + w / 2, y + h / 2 + 1);
      break;
    }
    default: {
      const grad = c.createLinearGradient(0, y, 0, y + h);
      grad.addColorStop(0, 'rgba(255,255,255,.22)'); grad.addColorStop(.25, 'rgba(255,255,255,0)'); grad.addColorStop(1, 'rgba(0,0,0,.28)');
      c.fillStyle = col; roundRect(c, x, y, w, h, Math.min(10, h * .3)); c.fill();
      c.fillStyle = grad; roundRect(c, x, y, w, h, Math.min(10, h * .3)); c.fill();
      break;
    }
  }
  if (showLabel) {
    c.globalAlpha = .85;
    c.fillStyle = 'rgba(7,10,18,.62)';
    const label = (d.label || o.type) + (o.elev ? ' · e' + Math.round(o.elev) : '');
    c.font = `600 ${10.5 / zoom}px Inter,system-ui`;
    const tw = c.measureText(label).width + 8 / zoom;
    const th = 13 / zoom;
    roundRect(c, x, y - th - 2, tw, th, 3); c.fill();
    c.fillStyle = 'rgba(230,238,255,.9)'; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(label, x + 4, y - th / 2 - 2);
    c.globalAlpha = 1;
  }
  c.restore();
}
function roundRect(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function objById(id) { return cur && cur.objects.find(o => o.id === id) || null; }
function worldPt(e) {
  const r = view.getBoundingClientRect();
  return { x: (e.clientX - r.left) / zoom + camX, y: (e.clientY - r.top) / zoom + camY };
}
function snapVal(v) { return $('#snapChk').checked ? Math.round(v / 24) * 24 : Math.round(v); }
function hitTest(p) {
  const list = cur.objects.slice().reverse();
  for (const o of list) if (p.x >= o.x && p.x <= o.x + o.w && p.y >= o.y && p.y <= o.y + o.h) return o;
  return null;
}
function addObject(type, x, y) {
  const d = OBJ[type];
  if (type === 'spawn') { cur.spawn = { x: snapVal(x), y: snapVal(y) }; syncAll(); return; }
  const o = {
    id: uid(), type, x: snapVal(x - d.w / 2), y: snapVal(y - d.h / 2),
    w: d.w, h: d.h, elev: d.elev == null ? 0 : d.elev, color: d.color
  };
  if (d.range) { o.range = d.range; o.speed = d.speed; }
  if (type === 'door') o.need = 3;
  if (type === 'npc') o.txt = d.txt;
  cur.objects.push(o);
  selId = o.id;
  renderObjList(); renderInspector(); syncCounts(); draw(); saveSoon();
}
let saveT = null;
function saveSoon() { clearTimeout(saveT); saveT = setTimeout(() => { if (cur) { saveMaps(); } }, 700); }
function syncCounts() {
  $('#footObj').textContent = cur.objects.length;
  $('#objCount').textContent = cur.objects.length;
  $('#setObjN').textContent = cur.objects.length;
  $('#footSpawn').textContent = Math.round(cur.spawn.x) + ', ' + Math.round(cur.spawn.y);
  $('#spawnX').textContent = Math.round(cur.spawn.x);
  $('#spawnY').textContent = Math.round(cur.spawn.y);
}

/* ---------------- panels ---------------- */
function renderPalette() {
  const box = $('#pal');
  box.innerHTML = Object.keys(OBJ).map(k => {
    const d = OBJ[k];
    return `<button type="button" data-t="${k}" class="${placeType === k ? 'on' : ''}"><i style="background:${d.color}"></i>${d.label}</button>`;
  }).join('');
}
function renderObjList() {
  const box = $('#objList');
  if (!cur.objects.length) { box.innerHTML = '<p class="hint" style="margin:0">Nothing yet. Pick an object above and click the map.</p>'; return; }
  box.innerHTML = cur.objects.map(o => {
    const d = OBJ[o.type] || { label: o.type, color: '#888' };
    return `<div class="orow ${o.id === selId ? 'on' : ''}" data-id="${o.id}"><i style="background:${o.color || d.color}"></i><b>${d.label}</b><span>${Math.round(o.x)}, ${Math.round(o.y)}</span></div>`;
  }).join('');
}
function renderInspector() {
  const box = $('#insp');
  const o = objById(selId);
  if (!o) {
    box.innerHTML = `<h3 style="font-size:10.5px;letter-spacing:.11em;text-transform:uppercase;color:var(--dim);margin:0 0 10px">Map</h3>
      <div class="kv"><span>Name</span><b>${esc(cur.name)}</b></div>
      <div class="kv"><span>Type</span><b>${MODES[cur.mode]}</b></div>
      <div class="kv"><span>Size</span><b>${cur.w} × ${cur.h}</b></div>
      <div class="kv"><span>Camera</span><b>${CAMS[cur.camera]}</b></div>
      <div class="kv"><span>Character</span><b>${esc(charName())}</b></div>
      <div class="kv"><span>Objects</span><b>${cur.objects.length}</b></div>
      <div class="grp"><h3>Test it</h3>
      <p class="hint">Press Play to run this map with full physics, collisions and your character's animations.</p>
      <button class="btn pri" id="inspPlay" type="button" style="width:100%;justify-content:center">▶ Play map</button></div>
      <div class="grp"><h3>Shortcuts</h3>
      <div class="kv"><span>Move a selection</span><b>Drag / arrows</b></div>
      <div class="kv"><span>Delete</span><b>Del</b></div>
      <div class="kv"><span>Pan</span><b>Right-drag</b></div>
      <div class="kv"><span>Zoom</span><b>Wheel</b></div>
      <div class="kv"><span>Play / stop</span><b>Ctrl+Enter</b></div></div>`;
    const p = $('#inspPlay'); if (p) p.onclick = startGame;
    return;
  }
  const d = OBJ[o.type] || {};
  const num = (k, label, step) => `<label class="f" for="i_${k}">${label}</label><input class="f" id="i_${k}" data-k="${k}" type="number" step="${step || 1}" value="${Math.round(o[k] || 0)}">`;
  box.innerHTML = `<h3 style="font-size:10.5px;letter-spacing:.11em;text-transform:uppercase;color:var(--dim);margin:0 0 10px">${d.label || o.type}</h3>
    <div class="two">${num('x', 'X')}${num('y', cur.mode === 'three' ? 'Z (depth)' : 'Y')}</div>
    <div class="two">${num('w', 'Width')}${num('h', 'Height')}</div>
    ${cur.mode === 'three' ? num('elev', 'Elevation') : ''}
    <label class="f" for="i_color">Colour</label><input class="f" id="i_color" data-k="color" type="color" value="${/^#[0-9a-f]{6}$/i.test(o.color || '') ? o.color : '#888888'}">
    ${o.type === 'mover' || o.type === 'enemy' ? `<div class="two">${num('range', 'Range')}${num('speed', 'Speed')}</div>` : ''}
    ${o.type === 'door' ? num('need', 'Coins needed') : ''}
    ${o.type === 'coin' || o.type === 'gem' ? num('val', 'Value') : ''}
    ${o.type === 'npc' ? `<label class="f" for="i_txt">Line</label><input class="f" id="i_txt" data-k="txt" type="text" value="${esc(o.txt || '')}">` : ''}
    <div class="grp">
      <div class="two"><button class="btn sm" id="iDup" type="button">Duplicate</button><button class="btn sm" id="iDel" type="button">Delete</button></div>
      <p class="hint" style="margin-top:8px">${o.type === 'door' ? 'Door opens with E when the player has enough coins.' : o.type === 'goal' ? 'Touching the goal completes the map.' : o.type === 'spike' || o.type === 'enemy' ? 'Hazards respawn the player at the last checkpoint.' : 'Drag on the map to move this object.'}</p>
    </div>`;
  box.querySelectorAll('input[data-k]').forEach(inp => {
    inp.oninput = () => {
      const k = inp.dataset.k;
      o[k] = k === 'color' || k === 'txt' ? inp.value : (+inp.value || 0);
      if (k === 'color' || k === 'txt') { renderObjList(); }
      draw(); saveSoon();
    };
  });
  $('#iDup').onclick = () => {
    const copy = deep(o); copy.id = uid(); copy.x += 24; copy.y += 24;
    cur.objects.push(copy); selId = copy.id; renderObjList(); renderInspector(); syncCounts(); draw(); saveSoon();
  };
  $('#iDel').onclick = () => deleteObj(o.id);
  const pp = $('#inspPlay'); if (pp) pp.onclick = startGame;
}
function deleteObj(id) {
  const i = cur.objects.findIndex(o => o.id === id);
  if (i < 0) return;
  cur.objects.splice(i, 1);
  if (selId === id) selId = null;
  renderObjList(); renderInspector(); syncCounts(); draw(); saveSoon();
}
function charName() {
  const c = charLib.find(x => x.id === cur.charId);
  return c ? c.name : 'Default avatar';
}
function renderChars() {
  const box = $('#charList');
  const items = [{ id: null, name: 'Default avatar', style: 'built-in', thumb: null }].concat(charLib);
  box.innerHTML = items.map(c => {
    const img = c.thumb ? `<img src="${c.thumb}" alt="">` : `<div class="noimg">${c.id ? 'no preview' : '◍'}</div>`;
    const style = c.style ? (c.style === '3d' ? '3D' : c.style === 'pixel' ? 'Pixel' : 'Character Studio') : 'built-in';
    return `<button type="button" class="ccard ${cur.charId === c.id ? 'on' : ''}" data-cid="${c.id || ''}">${img}<b>${esc(c.name)}</b><small>${style}</small></button>`;
  }).join('');
  $('#charEmpty').hidden = charLib.length > 0;
  $('#charName').textContent = charName();
}
function renderRules() {
  const r = cur.rules;
  $('#rCoins').checked = !!r.coins; $('#rHazard').checked = !!r.hazard; $('#rEnemies').checked = !!r.enemies;
  $('#rChecks').checked = !!r.checks; $('#rMovers').checked = !!r.movers; $('#rGravity').checked = !!r.gravity;
  $('#rHud').checked = !!r.hud;
  $('#setGravity').disabled = cur.mode !== 'side' ? false : !r.gravity;
}
function refreshKeys() {
  const box = $('#ctrlList');
  box.innerHTML = KEYS.map(k => `<div class="ctrl"><span>${KEY_LABEL[k]}</span><kbd data-key="${k}" class="${keyWatch === k ? 'wait' : ''}">${keyWatch === k ? 'press…' : prettyKey(cur.keys[k] || DEFAULT_KEYS[k])}</kbd></div>`).join('');
}
function loadChars() {
  try {
    const raw = JSON.parse(localStorage.getItem(CHAR_KEY) || '[]');
    charLib = Array.isArray(raw) ? raw.filter(c => c && c.id) : [];
  } catch (e) { charLib = []; }
}
function renderThumb(m) {
  const c = document.createElement('canvas'); c.width = 360; c.height = 200;
  const g = c.getContext('2d');
  g.fillStyle = /^#[0-9a-f]{6}$/i.test(m.bg) ? m.bg : '#101a33'; g.fillRect(0, 0, 360, 200);
  const s = Math.min(340 / m.w, 180 / m.h);
  g.translate(180 - m.w * s / 2, 100 - m.h * s / 2); g.scale(s, s);
  const list = m.objects.slice();
  if (m.mode === 'three') list.sort((a, b) => (a.y + a.h) - (b.y + b.h));
  const oldCur = cur; cur = m;
  list.forEach(o => paintObj(g, o, false));
  cur = oldCur;
  if (m.spawn) {
    g.strokeStyle = '#fff'; g.lineWidth = 3 / s; g.strokeRect(m.spawn.x - 14, m.spawn.y - 46, 28, 46);
  }
  return c.toDataURL('image/png');
}

/* ---------------- tools & pointer ---------------- */
function setTool(t) {
  tool = t;
  if (t !== 'place') placeType = null;
  $('#tSelect').setAttribute('aria-pressed', t === 'select');
  $('#tPan').setAttribute('aria-pressed', t === 'pan');
  $('#tErase').setAttribute('aria-pressed', t === 'erase');
  $('#btnSpawnTool').setAttribute('aria-pressed', t === 'spawn');
  $('#toolLab').textContent = t === 'place' ? 'Place · ' + ((OBJ[placeType] || {}).label || '') : t === 'spawn' ? 'Place spawn' : t[0].toUpperCase() + t.slice(1);
  view.className = t === 'pan' ? 'pan' : t === 'erase' ? 'erase' : t === 'place' || t === 'spawn' ? 'place' : '';
  renderPalette();
}
function pickPlace(type) {
  placeType = type;
  tool = 'place';
  $('#tSelect').setAttribute('aria-pressed', false);
  $('#tPan').setAttribute('aria-pressed', false);
  $('#tErase').setAttribute('aria-pressed', false);
  $('#btnSpawnTool').setAttribute('aria-pressed', false);
  $('#toolLab').textContent = 'Place · ' + (OBJ[type] || {}).label;
  view.className = 'place';
  renderPalette();
}
view.addEventListener('contextmenu', e => e.preventDefault());
view.addEventListener('pointerdown', e => {
  if (!cur) return;
  view.setPointerCapture && view.setPointerCapture(e.pointerId);
  const p = worldPt(e);
  if (e.button === 1 || e.button === 2 || tool === 'pan') {
    pan = { x: e.clientX, y: e.clientY, cx: camX, cy: camY };
    view.style.cursor = 'grabbing';
    return;
  }
  if (tool === 'spawn') {
    cur.spawn = { x: snapVal(p.x), y: snapVal(p.y) };
    syncCounts(); draw(); saveSoon();
    setTool('select');
    return;
  }
  if (tool === 'erase') {
    const hit = hitTest(p);
    if (hit) deleteObj(hit.id);
    return;
  }
  if (tool === 'place' && placeType) {
    addObject(placeType, p.x, p.y);
    return;
  }
  const hit = hitTest(p);
  selId = hit ? hit.id : null;
  renderObjList(); renderInspector(); draw();
  if (hit) drag = { id: hit.id, dx: p.x - hit.x, dy: p.y - hit.y };
});
view.addEventListener('pointermove', e => {
  if (!cur) return;
  if (pan) {
    camX = pan.cx - (e.clientX - pan.x) / zoom;
    camY = pan.cy - (e.clientY - pan.y) / zoom;
    draw();
    return;
  }
  if (drag) {
    const o = objById(drag.id);
    if (!o) return;
    const p = worldPt(e);
    o.x = snapVal(p.x - drag.dx); o.y = snapVal(p.y - drag.dy);
    moved = true;
    renderObjList(); draw();
    return;
  }
  const p = worldPt(e);
  $('#footHint').textContent = Math.round(p.x) + ', ' + Math.round(p.y);
});
view.addEventListener('pointerup', e => {
  if (pan) { pan = null; view.style.cursor = ''; draw(); return; }
  if (drag) {
    drag = null;
    if (moved) { renderInspector(); saveSoon(); }
    moved = false;
  }
});
view.addEventListener('pointercancel', () => { pan = null; drag = null; moved = false; });
view.addEventListener('wheel', e => {
  if (!cur) return;
  e.preventDefault();
  const r = view.getBoundingClientRect();
  const before = worldPt(e);
  const f = e.deltaY < 0 ? 1.12 : 0.89;
  zoom = clamp(zoom * f, 0.06, 3);
  camX = before.x - (e.clientX - r.left) / zoom;
  camY = before.y - (e.clientY - r.top) / zoom;
  $('#zoomLab').textContent = Math.round(zoom * 100) + '%';
  draw();
}, { passive: false });

/* ---------------- panels wiring ---------------- */
function bindPanels() {
  $$('.tabs button').forEach(b => {
    b.onclick = () => {
      $$('.tabs button').forEach(x => x.classList.toggle('on', x === b));
      ['objects', 'map', 'character', 'rules'].forEach(t => $('#tab' + t[0].toUpperCase() + t.slice(1)).classList.toggle('on', t === b.dataset.tab));
    };
  });
  $('#pal').onclick = e => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    pickPlace(b.dataset.t);
  };
  $('#objList').onclick = e => {
    const r = e.target.closest('.orow'); if (!r) return;
    selId = r.dataset.id; setTool('select');
    renderObjList(); renderInspector(); draw();
  };
  $('#btnClear').onclick = () => {
    if (!cur.objects.length) return;
    confirmModal('Clear this map?', 'Every object on the map will be removed. The spawn point stays.', () => {
      cur.objects = []; selId = null; renderObjList(); renderInspector(); syncCounts(); draw(); saveSoon();
    });
  };
  $('#tSelect').onclick = () => setTool('select');
  $('#tPan').onclick = () => setTool('pan');
  $('#tErase').onclick = () => setTool('erase');
  $('#btnSpawnTool').onclick = () => setTool(tool === 'spawn' ? 'select' : 'spawn');
  $('#zoomIn').onclick = () => { zoom = clamp(zoom * 1.15, .06, 3); $('#zoomLab').textContent = Math.round(zoom * 100) + '%'; draw(); };
  $('#zoomOut').onclick = () => { zoom = clamp(zoom / 1.15, .06, 3); $('#zoomLab').textContent = Math.round(zoom * 100) + '%'; draw(); };
  $('#zoomFit').onclick = fit;
  $('#gridChk').onchange = draw;
  $('#mapName').oninput = e => { cur.name = e.target.value; saveSoon(); renderInspector(); };
  $('#setMode').onchange = e => {
    cur.mode = e.target.value;
    cur.camera = CAM_FOR[cur.mode];
    if (cur.mode === 'side' && cur.h > 2000) cur.h = 900;
    syncAll(); saveSoon(); toast('Map is now ' + MODES[cur.mode]);
  };
  $('#setW').oninput = e => { cur.w = clamp(+e.target.value || 800, 480, 8000); draw(); saveSoon(); };
  $('#setH').oninput = e => { cur.h = clamp(+e.target.value || 600, 360, 8000); draw(); saveSoon(); };
  $('#setBgMode').onchange = e => {
    cur.bgMode = e.target.value;
    if (cur.bgMode !== 'custom') cur.bg = BG_PRESETS[cur.bgMode] || BG_PRESETS.dark;
    $('#setBg').value = cur.bg;
    $('#setBg').disabled = cur.bgMode !== 'custom';
    draw(); saveSoon();
    toast(cur.bgMode === 'light' ? 'Light background' : cur.bgMode === 'dark' ? 'Dark background' : 'Pick a background colour');
  };
  $('#setBg').oninput = e => { cur.bg = e.target.value; cur.bgMode = 'custom'; $('#setBgMode').value = 'custom'; $('#setBg').disabled = false; draw(); saveSoon(); };
  $('#setCam').onchange = e => { cur.camera = e.target.value; saveSoon(); renderInspector(); };
  $('#setGravity').oninput = e => { cur.gravity = clamp(+e.target.value || 0, 0, 6000); saveSoon(); };
  const ruleMap = { rCoins: 'coins', rHazard: 'hazard', rEnemies: 'enemies', rChecks: 'checks', rMovers: 'movers', rGravity: 'gravity', rHud: 'hud' };
  Object.keys(ruleMap).forEach(id => {
    $('#' + id).onchange = e => { cur.rules[ruleMap[id]] = e.target.checked; renderRules(); saveSoon(); };
  });
  $('#charList').onclick = e => {
    const b = e.target.closest('[data-cid]'); if (!b) return;
    cur.charId = b.dataset.cid || null;
    renderChars(); renderInspector(); saveSoon();
  };
  $('#btnOpenStudio').onclick = () => { window.location.href = 'studio.html'; };
  $('#ctrlList').onclick = e => {
    const k = e.target.closest('[data-key]'); if (!k) return;
    keyWatch = k.dataset.key; refreshKeys();
  };
  $('#btnResetKeys').onclick = () => { cur.keys = Object.assign({}, DEFAULT_KEYS); refreshKeys(); saveSoon(); toast('Controls reset'); };
  $('#btnSave').onclick = () => { saveMaps(); toast('Map saved'); renderInspector(); };
  $('#btnPlay').onclick = startGame;
  $('#btnLibrary').onclick = () => { saveMaps(); showLibrary(); };
  $('#libClose').onclick = () => { $('#lib').hidden = true; };
  $('#mx').onclick = closeModal;
  $('#modal').onclick = e => { if (e.target === $('#modal')) closeModal(); };
  $('#btnLibrary').onclick = () => { saveMaps(); showLibrary(); };
}
window.addEventListener('keydown', e => {
  if (!$('#game').hidden) return;
  if (keyWatch) {
    e.preventDefault();
    const k = keyName(e);
    if (k === 'escape' && keyWatch !== 'pause') { keyWatch = null; refreshKeys(); return; }
    cur.keys[keyWatch] = k; keyWatch = null; refreshKeys(); saveSoon();
    return;
  }
  if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selId) { e.preventDefault(); deleteObj(selId); }
  }
  if (e.key === 'v' || e.key === 'V') setTool('select');
  if (e.key === 'h' || e.key === 'H') setTool('pan');
  if (e.key === 'p' || e.key === 'P') setTool('place');
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); startGame(); }
  if (selId && e.key.startsWith('Arrow')) {
    const o = objById(selId); if (!o) return;
    e.preventDefault();
    const step = e.shiftKey ? 24 : 1;
    if (e.key === 'ArrowLeft') o.x -= step;
    if (e.key === 'ArrowRight') o.x += step;
    if (e.key === 'ArrowUp') o.y -= step;
    if (e.key === 'ArrowDown') o.y += step;
    renderObjList(); renderInspector(); draw(); saveSoon();
  }
});

/* ---------------- modal + library ---------------- */
function openModal(title, body, buttons, after) {
  $('#mtitle').textContent = title;
  $('#mbody').innerHTML = body;
  const foot = $('#mfoot'); foot.innerHTML = '';
  (buttons || []).forEach(b => {
    const btn = document.createElement('button');
    btn.className = 'btn' + (b.cls ? ' ' + b.cls : '');
    btn.type = 'button'; btn.textContent = b.label;
    btn.onclick = () => { if (b.run) b.run(); if (!b.keep) closeModal(); };
    foot.appendChild(btn);
  });
  $('#modal').hidden = false;
  if (after) after();
}
function closeModal() { $('#modal').hidden = true; $('#mbody').innerHTML = ''; $('#mfoot').innerHTML = ''; }
function confirmModal(title, text, onYes) {
  openModal(title, `<p class="hint" style="margin:0">${esc(text)}</p>`, [
    { label: 'Cancel' },
    { label: 'Delete', cls: 'pri', run: onYes }
  ]);
}
function showLibrary() {
  renderLibrary();
  $('#lib').hidden = false;
}
function renderLibrary() {
  const box = $('#libgrid');
  const sorted = maps.slice().sort((a, b) => (b.updated || 0) - (a.updated || 0));
  box.innerHTML = `<button type="button" class="mcard new" id="libNew"><span>+</span>New map</button>` + sorted.map(m => {
    const c = charLib.find(x => x.id === m.charId);
    return `<div class="mcard" data-id="${m.id}">
      <div class="shot">${m.thumb ? `<img src="${m.thumb}" alt="">` : MODES[m.mode]}</div>
      <b>${esc(m.name)}</b>
      <small>${MODES[m.mode]} · ${m.objects.length} objects${c ? ' · ' + esc(c.name) : ''}</small>
      <div class="row"><button class="btn sm" type="button" data-act="open">Open</button><button class="btn sm" type="button" data-act="play">Play</button><button class="btn sm" type="button" data-act="dup">Copy</button><button class="btn sm" type="button" data-act="del">Del</button></div>
    </div>`;
  }).join('');
  $('#libempty').hidden = maps.length > 0;
  $('#libNew').onclick = newMapModal;
  box.querySelectorAll('.mcard[data-id]').forEach(card => {
    card.onclick = e => {
      const act = (e.target.closest('[data-act]') || {}).dataset;
      const m = maps.find(x => x.id === card.dataset.id);
      if (!m) return;
      if (act && act.act === 'play') { openMap(m); startGame(); return; }
      if (act && act.act === 'del') { deleteMap(m); return; }
      if (act && act.act === 'dup') {
        const copy = deep(m); copy.id = uid(); copy.name = m.name + ' copy'; copy.updated = Date.now();
        maps.push(copy); saveMaps(); renderLibrary(); toast('Map duplicated'); return;
      }
      openMap(m);
    };
  });
}
function deleteMap(m) {
  confirmModal('Delete map?', '“' + m.name + '” will be removed. This cannot be undone.', () => {
    maps = maps.filter(x => x.id !== m.id);
    if (cur && cur.id === m.id) cur = null;
    saveMaps(); renderLibrary();
    if (!maps.length) $('#lib').hidden = false;
    toast('Map deleted');
  });
}
function newMapModal() {
  openModal('New map', `
    <label>Map name</label>
    <input id="nmName" type="text" maxlength="48" value="My map">
    <label>Game type</label>
    <div class="modes" id="nmModes">
      <button type="button" data-mode="side" class="on">2D side-scroll</button>
      <button type="button" data-mode="top">2D top-down</button>
      <button type="button" data-mode="three">3D</button>
    </div>
    <label style="display:flex;align-items:center;gap:8px;text-transform:none;letter-spacing:0;font-size:12.5px;color:var(--ink);font-weight:600;margin-top:14px"><input id="nmStarter" type="checkbox" checked style="width:16px;height:16px;accent-color:var(--acc)"> Start with a sample layout I can edit</label>
    <p class="hint">You can switch the game type later in the Map tab. Objects, spawn, character and rules are saved per map.</p>`,
    [{ label: 'Cancel' }, {
      label: 'Create map', cls: 'pri', run: () => {
        const name = ($('#nmName').value || '').trim() || 'My map';
        const mode = $('#nmModes').dataset.pick || 'side';
        const m = $('#nmStarter').checked ? starterMap(name, mode) : blankMap(name, mode);
        m.charId = charLib.length ? charLib[0].id : null;
        maps.push(m);
        saveMaps(); openMap(m); renderLibrary();
        toast('Created ' + name);
      }
    }], () => {
      $('#nmModes').dataset.pick = 'side';
      $('#nmModes').querySelectorAll('[data-mode]').forEach(b => {
        b.onclick = () => {
          $('#nmModes').dataset.pick = b.dataset.mode;
          $('#nmModes').querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b));
        };
      });
    });
}

/* ================= PLAY MODE ================= */
let G = null, gLoop = 0, gView = null, gctx = null, gDpr = 1;
let charCache = new Map();

function startGame() {
  if (!cur) { toast('Create a map first'); return; }
  if (typeof cur.objects === 'undefined') return;
  saveMaps();
  const map = deep(cur);
  map.thumb = null;
  const char = charLib.find(c => c.id === map.charId) || null;
  G = {
    map: map, char: char, mode: map.mode, rules: map.rules, keymap: map.keys,
    keys: { left: false, right: false, up: false, down: false, jump: false, run: false, interact: false },
    camMode: map.camera, paused: false, over: false, t: 0, last: 0,
    coins: 0, hp: 3, taken: new Set(), opened: new Set(), checkpoints: new Set(),
    spawn: { x: map.spawn.x, y: map.spawn.y },
    respawnAt: { x: map.spawn.x, y: map.spawn.y },
    flash: 0, shake: 0, hintT: 0, message: '',
    player: null, cam: { x: 0, y: 0, yaw: 0.5, pitch: 0.32, dist: 430, offX: 0, offY: 0 },
    pressed: {}
  };
  const P = G.player = {
    x: map.spawn.x, y: map.spawn.y, z: map.spawn.y, vx: 0, vy: 0, vz: 0,
    w: 28, h: 54, onGround: false, groundId: null, face: 1, yaw: 0.5,
    state: 'idle', animT: 0, animName: '', jumpHeld: false
  };
  if (G.mode === 'three') {
    P.z = map.spawn.y; P.y = 0; P.x = map.spawn.x;
    G.cam.yaw = 0; G.cam.pitch = 0.3;
  } else if (G.mode === 'top') {
    P.x = map.spawn.x - P.w / 2;
    P.y = map.spawn.y - P.h / 2;
  } else {
    P.x = map.spawn.x - P.w / 2;
    P.y = map.spawn.y - P.h;
  }
  $('#game').hidden = false;
  $('#pause').hidden = true; $('#win').hidden = true;
  gView = $('#gview'); gctx = gView.getContext('2d');
  sizeGame();
  buildHud();
  bindGameInput();
  flash('Use ' + prettyKey(map.keys.left) + '/' + prettyKey(map.keys.right) + ' to move · ' + prettyKey(map.keys.jump) + ' to jump · ' + prettyKey(map.keys.interact) + ' to interact');
  G.last = performance.now();
  cancelAnimationFrame(gLoop);
  gLoop = requestAnimationFrame(gameFrame);
}
function endGame() {
  cancelAnimationFrame(gLoop); gLoop = 0;
  if (document.pointerLockElement === gView) document.exitPointerLock();
  $('#game').hidden = true;
  $('#pause').hidden = true; $('#win').hidden = true;
  G = null;
  syncAll();
}
function restartGame() {
  if (!G) return;
  const m = G.map;
  const wasPaused = G.paused;
  startGameFrom(m, wasPaused);
}
function startGameFrom(map, keep) {
  const saveCur = cur;
  cur = map;
  startGame();
  cur = saveCur;
  if (keep) setPaused(false);
}
function sizeGame() {
  gDpr = Math.min(2, window.devicePixelRatio || 1);
  gView.width = Math.round(innerWidth * gDpr);
  gView.height = Math.round(innerHeight * gDpr);
}
function bindGameInput() {
  if (bindGameInput.done) return;
  bindGameInput.done = true;
  window.addEventListener('keydown', gameKeyDown);
  window.addEventListener('keyup', gameKeyUp);
  window.addEventListener('resize', () => { if (G) sizeGame(); });
  gView.addEventListener('pointerdown', e => {
    if (!G) return;
    if (G.mode === 'three' && G.camMode !== 'side') {
      if (!document.pointerLockElement) {
        try { gView.requestPointerLock(); } catch (err) { }
      }
      G.lookDrag = { x: e.clientX, y: e.clientY };
    } else {
      G.lookDrag = { x: e.clientX, y: e.clientY, ox: G.cam.offX, oy: G.cam.offY };
    }
  });
  window.addEventListener('pointermove', e => {
    if (!G || !G.lookDrag) return;
    if (G.mode === 'three') {
      if (document.pointerLockElement === gView) {
        G.cam.yaw -= e.movementX * 0.0032;
        G.cam.pitch = clamp(G.cam.pitch + e.movementY * 0.0026, -0.35, 1.15);
      } else {
        const dx = e.clientX - G.lookDrag.x, dy = e.clientY - G.lookDrag.y;
        G.cam.yaw -= dx * 0.005;
        G.cam.pitch = clamp(G.cam.pitch + dy * 0.004, -0.35, 1.15);
        G.lookDrag.x = e.clientX; G.lookDrag.y = e.clientY;
      }
    } else {
      G.cam.offX = (G.cam.offX || 0) - (e.clientX - G.lookDrag.x) / (G.zoom2 || 1);
      G.cam.offY = (G.cam.offY || 0) - (e.clientY - G.lookDrag.y) / (G.zoom2 || 1);
      G.lookDrag.x = e.clientX; G.lookDrag.y = e.clientY;
    }
  });
  window.addEventListener('pointerup', () => { if (G) G.lookDrag = null; });
  gView.addEventListener('wheel', e => {
    if (!G || G.mode !== 'three') return;
    e.preventDefault();
    G.cam.dist = clamp((G.cam.dist || 430) * (e.deltaY < 0 ? 1.08 : 0.92), 120, 1200);
  }, { passive: false });
  $('#gPause').onclick = () => setPaused(!G.paused);
  $('#pResume').onclick = () => setPaused(false);
  $('#pRestart').onclick = () => { setPaused(false); restartGame(); };
  $('#pExit').onclick = endGame;
  $('#gRestart').onclick = () => restartGame();
  $('#gExit').onclick = endGame;
  $('#wReplay').onclick = () => { $('#win').hidden = true; restartGame(); };
  $('#wExit').onclick = endGame;
  $$('#touch button').forEach(b => {
    const k = b.dataset.k;
    b.addEventListener('pointerdown', e => { e.preventDefault(); if (G) { G.keys[k] = true; G.pressed[k] = true; } });
    b.addEventListener('pointerup', () => { if (G) G.keys[k] = false; });
    b.addEventListener('pointerleave', () => { if (G) G.keys[k] = false; });
  });
}
function gameKeyDown(e) {
  if (!G) return;
  const k = keyName(e);
  const KM = G.keymap;
  if (k === KM.pause || k === 'escape') { e.preventDefault(); setPaused(!G.paused); return; }
  ['left', 'right', 'up', 'down', 'jump', 'run', 'interact'].forEach(a => {
    if (k === KM[a]) { G.keys[a] = true; G.pressed[a] = true; e.preventDefault(); }
  });
  if (k === 'r' && G.paused) { restartGame(); }
}
function gameKeyUp(e) {
  if (!G) return;
  const k = keyName(e);
  ['left', 'right', 'up', 'down', 'jump', 'run', 'interact'].forEach(a => {
    if (k === G.keymap[a]) G.keys[a] = false;
  });
}
function setPaused(on) {
  if (!G || G.over) return;
  G.paused = !!on;
  $('#pause').hidden = !G.paused;
  $('#pauseSub').textContent = G.map.name;
  if (G.paused) {
    if (document.pointerLockElement === gView) document.exitPointerLock();
    const m = G.map.mode === 'three';
    $('#pauseKeys').innerHTML = `
      <span><b>${m ? 'WASD' : prettyKey(G.keymap.left) + ' / ' + prettyKey(G.keymap.right)}</b> move</span>
      <span><b>${prettyKey(G.keymap.jump)}</b> jump</span>
      <span><b>${prettyKey(G.keymap.run)}</b> run</span>
      <span><b>${prettyKey(G.keymap.interact)}</b> interact</span>
      <span><b>${prettyKey(G.keymap.pause)}</b> pause</span>
      <span><b>${m ? 'Mouse' : 'Drag'}</b> look / pan</span>`;
    G.last = performance.now();
  }
}
function flash(text) {
  G.message = text; G.hintT = 3.4;
  const el = $('#toast2'); el.textContent = text; el.classList.add('on');
}
function buildHud() {
  const r = G.rules;
  const hud = $('#hud');
  if (!r.hud) { hud.innerHTML = ''; return; }
  hud.innerHTML = `
    ${r.coins ? `<div class="pill">◎ Coins <b id="hudCoins">0</b></div>` : ''}
    ${r.hazard ? `<div class="pill hearts">♥ <b id="hudHp">3</b></div>` : ''}
    <div class="pill" id="hudGoal">◈ Find the goal</div>`;
}
function updateHud() {
  const c = $('#hudCoins'); if (c) c.textContent = G.coins;
  const h = $('#hudHp'); if (h) h.textContent = Math.max(0, G.hp);
  const g = $('#hudGoal'); if (g) {
    const need = G.map.objects.filter(o => o.type === 'door' && !G.opened.has(o.id));
    g.textContent = need.length ? '✧ Door needs ' + (need[0].need || 0) + ' coins' : '◈ Head to the goal';
  }
}
function moverOffset(o) {
  if (!G.rules.movers) return 0;
  const phase = (o.id.charCodeAt(0) + o.id.charCodeAt(1) % 7) % 6.28;
  return Math.sin(G.t * ((o.speed || 80) / 100) + phase) * ((o.range || 200) / 2);
}
function solidList() {
  const out = [];
  G.map.objects.forEach(o => {
    if (!(OBJ[o.type] || {}).solid) return;
    if (o.type === 'door' && G.opened.has(o.id)) return;
    if (o.type === 'mover') {
      out.push({ o: o, x: o.x + moverOffset(o), y: o.y, w: o.w, h: o.h, dx: moverOffset(o) - (o._lastOff || 0) });
    } else out.push({ o: o, x: o.x, y: o.y, w: o.w, h: o.h, dx: 0 });
  });
  return out;
}
function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function tp(pt) { return pt.x >= 0 && pt.x <= 1 && pt.y >= 0 && pt.y <= 1 && pt.z > 0.5; }

/* ---------------- game loop ---------------- */
function gameFrame(t) {
  gLoop = requestAnimationFrame(gameFrame);
  if (!G) return;
  const dt = Math.min(0.04, Math.max(0.001, (t - (G.last || t)) / 1000));
  G.last = t;
  if (G.paused || G.over) { G.pressed = {}; return; }
  G.t += dt;
  if (G.hintT > 0) { G.hintT -= dt; if (G.hintT <= 0) $('#toast2').classList.remove('on'); }
  G.flash = Math.max(0, G.flash - dt * 3);
  G.shake = Math.max(0, G.shake - dt * 3);
  if (G.mode === 'three') update3D(dt); else update2D(dt);
  if (!G) return;
  renderGame();
  G.pressed = {};
}
function pRect(p) { return { x: p.x, y: p.y, w: p.w, h: p.h }; }
function moveX(p, amt, solids) {
  p.x += amt;
  const box = pRect(p);
  for (const s of solids) {
    if (!overlap(box, s)) continue;
    if (amt > 0) p.x = s.x - p.w; else if (amt < 0) p.x = s.x + s.w;
    p.vx = 0;
    box.x = p.x;
  }
}
function moveY(p, amt, solids) {
  p.y += amt;
  const box = pRect(p);
  for (const s of solids) {
    if (!overlap(box, s)) continue;
    if (amt > 0) { p.y = s.y - p.h; p.vy = 0; p.onGround = true; p.groundId = s.o.id; }
    else if (amt < 0) { p.y = s.y + s.h; p.vy = 0; }
    box.y = p.y;
  }
}
function animState(p) {
  if (!p.onGround && Math.abs(p.vy) > 60) return p.vy < 0 ? 'jump' : 'fall';
  const sp = Math.abs(p.vx || 0);
  if (sp > 340) return 'run';
  if (sp > 20) return 'walk';
  return 'idle';
}
function pickAnim(ch, state) {
  if (!ch || !ch.anims || !ch.anims.length) return null;
  const a = ch.anims;
  const find = re => a.find(x => re.test(String(x.name || '')));
  if (state === 'run') return find(/run|sprint/i) || find(/walk/i) || find(/idle/i) || a[0];
  if (state === 'walk') return find(/walk/i) || find(/run/i) || a[0];
  if (state === 'jump') return find(/jump|fall|air/i) || find(/idle/i) || a[0];
  if (state === 'fall') return find(/fall|jump|air/i) || find(/idle/i) || a[0];
  return find(/idle|stand/i) || a[0];
}
function currentFrame(ch, state, dt) {
  const anim = pickAnim(ch, state);
  if (!anim || !anim.frames || !anim.frames.length) return null;
  const P = G.player;
  if (P.animName !== anim.id + ':' + state) { P.animName = anim.id + ':' + state; P.animT = 0; P.animFrame = 0; }
  P.animT += dt * 1000;
  const dur = anim.frames[P.animFrame] && anim.frames[P.animFrame].dur || 125;
  if (P.animT >= dur) { P.animT -= dur; P.animFrame = (P.animFrame + 1) % anim.frames.length; }
  return anim.frames[P.animFrame] || anim.frames[0];
}
function update2D(dt) {
  const p = G.player, r = G.rules, K = G.keys;
  const run = !!K.run;
  const solids = solidList();
  // carry with a moving platform
  if (p.groundId) {
    const s = solids.find(x => x.o.id === p.groundId);
    if (s && s.dx) p.x += s.dx;
  }
  p.groundId = null;
  if (G.mode === 'side') {
    const dir = (K.right ? 1 : 0) - (K.left ? 1 : 0);
    const target = dir * (run ? 440 : 255);
    p.vx += (target - p.vx) * Math.min(1, dt * 16);
    if (Math.abs(p.vx) < 3) p.vx = 0;
    if (dir) p.face = dir;
    if (r.gravity) {
      p.vy += (G.map.gravity || 2200) * dt;
      if (K.jump && p.onGround) { p.vy = -Math.sqrt(2 * (G.map.gravity || 2200) * 150); p.onGround = false; }
      moveX(p, p.vx * dt, solids);
      moveY(p, p.vy * dt, solids);
    } else {
      p.vy = 0;
      const dirY = (K.down ? 1 : 0) - (K.up ? 1 : 0);
      moveX(p, p.vx * dt, solids);
      moveY(p, dirY * (run ? 300 : 190) * dt, solids);
      p.onGround = true;
    }
  } else {
    let dx = (K.right ? 1 : 0) - (K.left ? 1 : 0);
    let dy = (K.down ? 1 : 0) - (K.up ? 1 : 0);
    if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
    const sp = run ? 340 : 205;
    p.vx = dx * sp; p.vy = dy * sp;
    if (dx) p.face = dx > 0 ? 1 : -1;
    moveX(p, p.vx * dt, solids);
    moveY(p, p.vy * dt, solids);
    p.onGround = true;
  }
  p.x = clamp(p.x, 0, G.map.w - p.w);
  if (G.mode === 'top') p.y = clamp(p.y, 0, G.map.h - p.h);
  if (p.y > G.map.h + 400) respawn();
  p.state = animState(p);
  currentFrame(G.char, p.state, dt);
  collectAndInteract(dt);
  updateCamera2D(dt);
  updateHud();
  if (!G.over) updatePrompt();
}
function patrolX(o) {
  if (!G.rules.enemies) return o.x + o.w / 2;
  const phase = (o.id.charCodeAt(0) % 9) + 1;
  return o.x + o.w / 2 + Math.sin(G.t * ((o.speed || 60) / 80) + phase) * ((o.range || 140) / 2);
}
function collectAndInteract(dt) {
  const p = G.player, pr = pRect(p);
  const K = G.keys;
  let near = null;
  G.map.objects.forEach(o => {
    if (o.type === 'coin' || o.type === 'gem') {
      if (!G.rules.coins || G.taken.has(o.id)) return;
      if (overlap(pr, o)) {
        G.taken.add(o.id); G.coins += o.val || (o.type === 'gem' ? 5 : 1);
        flash('+' + (o.val || 1) + ' coin' + ((o.val || 1) > 1 ? 's' : ''));
      }
      return;
    }
    if (o.type === 'checkpoint' && G.rules.checks) {
      if (overlap(pr, o) && !G.checkpoints.has(o.id)) {
        G.checkpoints.add(o.id);
        G.respawnAt = { x: o.x + o.w / 2, y: o.y + o.h };
        flash('Checkpoint reached');
      }
      return;
    }
    if (o.type === 'goal') {
      if (overlap(pr, o)) winGame();
      return;
    }
    if (o.type === 'spike') {
      if (G.rules.hazard && overlap(pr, o)) hurt('Spikes!');
      return;
    }
    if (o.type === 'enemy' && G.rules.enemies) {
      const eb = { x: patrolX(o) - o.w / 2, y: o.y, w: o.w, h: o.h };
      if (overlap(pr, eb)) hurt('Hit by an enemy!');
      return;
    }
    if (o.type === 'door') {
      const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
      const dx = (p.x + p.w / 2) - cx, dy = (p.y + p.h / 2) - cy;
      if (Math.hypot(dx, dy) < 105) {
        if (G.opened.has(o.id)) return;
        near = o;
        if (G.pressed.interact) {
          if (G.coins >= (o.need || 0)) { G.opened.add(o.id); flash('Door opened'); }
          else flash('You need ' + ((o.need || 0) - G.coins) + ' more coins');
        }
      }
      return;
    }
    if (o.type === 'npc') {
      const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
      if (Math.hypot((p.x + p.w / 2) - cx, (p.y + p.h / 2) - cy) < 100) {
        near = o;
        if (G.pressed.interact) flash(o.txt || 'Hello!');
      }
    }
  });
  G.near = near;
  // falling out of the world
  if (G.mode === 'side' && G.rules.gravity && p.y > G.map.h + 300) respawn();
}
let hurtCool = 0;
function hurt(reason) {
  if (!G || G.over) return;
  if (performance.now() - hurtCool < 900) return;
  hurtCool = performance.now();
  if (G.rules.hazard) G.hp--;
  G.flash = 1; G.shake = 1;
  respawn();
  if (G.rules.hazard && G.hp <= 0) {
    G.hp = 3;
    G.respawnAt = { x: G.map.spawn.x, y: G.map.spawn.y };
    flash('Out of health — back to the start');
  } else flash(reason + ' Respawning…');
}
function respawn() {
  if (!G) return;
  const p = G.player;
  p.x = G.respawnAt.x - p.w / 2;
  if (G.mode === 'side') p.y = G.respawnAt.y - p.h;
  else if (G.mode === 'top') p.y = G.respawnAt.y - p.h / 2;
  else { p.x = G.respawnAt.x; p.z = G.respawnAt.y; p.y = 0; }
  p.vx = 0; p.vy = 0; p.vz = 0;
  p.onGround = false; p.groundId = null;
}
function winGame() {
  if (!G || G.over) return;
  G.over = true;
  if (document.pointerLockElement === gView) document.exitPointerLock();
  $('#win').hidden = false;
  $('#winSub').textContent = 'Finished “' + G.map.name + '” in ' + G.t.toFixed(1) + 's with ' + G.coins + ' coins.';
}
function updateCamera2D(dt) {
  const W = innerWidth, H = innerHeight;
  const p = G.player;
  let tx, ty;
  if (G.mode === 'side') {
    tx = p.x + p.w / 2 - W / 2;
    ty = p.y + p.h / 2 - H / 2 - 40;
  } else {
    tx = p.x + p.w / 2 - W / 2;
    ty = p.y + p.h / 2 - H / 2;
  }
  tx += G.cam.offX || 0; ty += G.cam.offY || 0;
  const maxX = Math.max(0, G.map.w - W), maxY = Math.max(0, G.map.h - H);
  tx = maxX > 0 ? clamp(tx, 0, maxX) : (G.map.w - W) / 2;
  ty = maxY > 0 ? clamp(ty, 0, maxY) : (G.map.h - H) / 2;
  G.cam.x += (tx - G.cam.x) * Math.min(1, dt * 9);
  G.cam.y += (ty - G.cam.y) * Math.min(1, dt * 9);
  G.zoom2 = 1;
}
function updatePrompt() {
  const el = $('#prompt');
  const o = G.near;
  if (!o) { el.hidden = true; return; }
  el.hidden = false;
  if (o.type === 'door') el.textContent = G.coins >= (o.need || 0) ? prettyKey(G.keymap.interact) + ' — open door' : 'Door locked · needs ' + (o.need || 0) + ' coins';
  else if (o.type === 'npc') el.textContent = prettyKey(G.keymap.interact) + ' — talk';
  else el.hidden = true;
}

/* ---------------- 2D rendering ---------------- */
function renderGame() {
  const W = innerWidth, H = innerHeight;
  if (gView.width !== Math.round(W * gDpr) || gView.height !== Math.round(H * gDpr)) sizeGame();
  const c = gctx;
  c.setTransform(gDpr, 0, 0, gDpr, 0, 0);
  c.clearRect(0, 0, W, H);
  if (G.mode === 'three') render3D(c, W, H);
  else render2DWorld(c, W, H);
}
function render2DWorld(c, W, H) {
  const p = G.player;
  const bg = /^#[0-9a-f]{6}$/i.test(G.map.bg) ? G.map.bg : '#101a33';
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, shade(bg, 1.35)); g.addColorStop(.55, bg); g.addColorStop(1, shade(bg, .6));
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // parallax hills
  c.save();
  c.globalAlpha = .25; c.fillStyle = shade(bg, .7);
  for (let i = 0; i < 8; i++) {
    const hx = ((i * 640 - G.cam.x * .3) % (W + 640)) - 320;
    c.beginPath(); c.ellipse(hx, H, 380, 180 + (i % 3) * 50, 0, Math.PI, 0); c.fill();
  }
  c.restore();
  const shake = G.shake > 0 ? G.shake : 0;
  c.save();
  c.translate(-G.cam.x + (Math.random() - .5) * shake * 6, -G.cam.y + (Math.random() - .5) * shake * 6);
  // objects
  const list = G.map.objects.slice();
  if (G.mode === 'three') list.sort((a, b) => (a.y + a.h) - (b.y + b.h));
  list.forEach(o => {
    if ((o.type === 'coin' || o.type === 'gem') && G.taken.has(o.id)) return;
    if (o.type === 'coin' || o.type === 'gem') {
      const t = Math.sin(G.t * 4 + o.x) * 2;
      c.save(); c.translate(0, t);
      paintObj(c, o, false);
      c.restore();
      return;
    }
    if (o.type === 'mover') {
      const off = moverOffset(o);
      const copy = Object.assign({}, o, { x: o.x + off });
      paintObj(c, copy, false);
      return;
    }
    if (o.type === 'door' && G.opened.has(o.id)) {
      c.save(); c.globalAlpha = .3; paintObj(c, o, false); c.restore();
      return;
    }
    if (o.type === 'checkpoint') {
      const copy = G.checkpoints.has(o.id) ? Object.assign({}, o, { color: '#ffd166' }) : o;
      paintObj(c, copy, false);
      return;
    }
    if (o.type === 'enemy') {
      const copy = Object.assign({}, o, { x: patrolX(o) - o.w / 2 });
      paintObj(c, copy, false);
      // angry eyes
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(copy.x + copy.w * .34, copy.y + copy.h * .42, 2.4, 0, 7); c.arc(copy.x + copy.w * .66, copy.y + copy.h * .42, 2.4, 0, 7); c.fill();
      return;
    }
    if (o.type === 'goal') {
      c.save();
      const pulse = 1 + Math.sin(G.t * 3) * .06;
      c.translate(o.x + o.w / 2, o.y + o.h / 2); c.scale(pulse, pulse);
      c.translate(-(o.x + o.w / 2), -(o.y + o.h / 2));
      paintObj(c, o, false);
      c.restore();
      return;
    }
    paintObj(c, o, false);
  });
  // player
  drawShadow(c, p.x + p.w / 2, p.y + p.h, p.onGround);
  drawPlayer2D(c, p);
  c.restore();
  // interaction bubble
  if (G.near && G.near.type === 'npc' && G.hintT <= 0) { }
  if (G.flash > 0) {
    c.fillStyle = 'rgba(229,72,77,' + (G.flash * .3) + ')'; c.fillRect(0, 0, W, H);
  }
}
function drawShadow(c, x, y, onGround) {
  c.save();
  c.globalAlpha = onGround ? .32 : .14;
  c.fillStyle = '#000';
  c.beginPath(); c.ellipse(x, y + 3, 22, 6, 0, 0, 7); c.fill();
  c.restore();
}
function shade(hex, k) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (isNaN(n)) return hex;
  const r = clamp(((n >> 16) & 255) * k, 0, 255) | 0;
  const g = clamp(((n >> 8) & 255) * k, 0, 255) | 0;
  const b = clamp((n & 255) * k, 0, 255) | 0;
  return `rgb(${r},${g},${b})`;
}
function charBounds(ch) {
  if (!ch || !ch.parts || !ch.parts.length) return null;
  if (charCache.has(ch.id)) return charCache.get(ch.id);
  const kids = {};
  ch.parts.forEach(p => { (kids[p.parent || 'root'] = kids[p.parent || 'root'] || []).push(p); });
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const walk = (p, tx, ty) => {
    const px = tx + (+p.x || 0), py = ty + (+p.y || 0);
    if (p.shape && p.shape !== 'none' && p.visible !== false) {
      const w = +p.w || 0, h = +p.h || 0, a = p.anchor == null ? 0 : +p.anchor;
      x0 = Math.min(x0, px - w / 2); x1 = Math.max(x1, px + w / 2);
      y0 = Math.min(y0, py - h * a); y1 = Math.max(y1, py + h * (1 - a));
    }
    (kids[p.id] || []).forEach(k => walk(k, px, py));
  };
  (kids.root || []).forEach(p => walk(p, 0, 0));
  const b = x0 > x1 ? null : { cx: (x0 + x1) / 2, top: y0, h: Math.max(1, y1 - y0) };
  if (b) charCache.set(ch.id, b);
  return b;
}
function drawPlayer2D(c, p) {
  const ch = G.char;
  const frame = ch ? currentFrame(ch, p.state, 0) : null;
  const b = ch ? charBounds(ch) : null;
  const targetH = 58;
  if (ch && b && b.h > 4) {
    const s = targetH / b.h;
    const cx = p.x + p.w / 2;
    const feet = p.y + p.h;
    c.save();
    c.translate(cx, feet);
    c.scale(p.face * s, s);
    c.translate(-b.cx, -b.top);
    drawRig2D(c, ch, frame ? (frame.pose || {}) : {}, 1);
    c.restore();
  } else {
    drawDefault2D(c, p);
  }
}
function drawRig2D(c, ch, pose, depth) {
  const kids = {};
  (ch.parts || []).forEach(p => { (kids[p.parent || 'root'] = kids[p.parent || 'root'] || []).push(p); });
  const walk = (part) => {
    if (part.visible === false) return;
    const ps = pose[part.id] || {};
    c.save();
    c.translate((+part.x || 0) + (+ps.x || 0), (+part.y || 0) + (+ps.y || 0));
    c.rotate((+ps.a || 0) * Math.PI / 180);
    const sx = +ps.sx || 1, sy = +ps.sy || 1;
    if (sx !== 1 || sy !== 1) c.scale(sx, sy);
    if (part.shape && part.shape !== 'none') partShape2D(c, part);
    (kids[part.id] || []).forEach(walk);
    c.restore();
  };
  (kids.root || []).forEach(walk);
}
function partShape2D(c, part) {
  const w = Math.max(1, +part.w || 1), h = Math.max(1, +part.h || 1);
  const a = part.anchor == null ? 0 : +part.anchor;
  const top = -h * a, bot = h * (1 - a);
  c.beginPath();
  const shape = part.shape || 'capsule';
  if (shape === 'ellipse') c.ellipse(0, (top + bot) / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (shape === 'triangle') { c.moveTo(0, top); c.lineTo(w / 2, bot); c.lineTo(-w / 2, bot); c.closePath(); }
  else if (shape === 'star') {
    const spikes = 5, outer = Math.min(w, h) / 2, inner = outer * .45, cy = (top + bot) / 2;
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 ? inner : outer, ang = (Math.PI / spikes) * i - Math.PI / 2;
      const x = Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.closePath();
  } else if (shape === 'blob') {
    c.moveTo(-w / 2, bot);
    c.bezierCurveTo(-w / 2 - 4, top + h * .3, -w * .4, top - 4, -w * .1, top - 2);
    c.bezierCurveTo(w * .18, top - 8, w * .46, top + h * .1, w * .44, top + h * .52);
    c.bezierCurveTo(w * .42, bot - h * .12, w * .18, bot + 2, 0, bot);
    c.bezierCurveTo(-w * .18, bot + 2, -w * .44, bot + 2, -w / 2, bot);
    c.closePath();
  } else {
    roundRect(c, -w / 2, top, w, h, shape === 'rect' ? Math.min(10, w * .14) : Math.min(w, h) / 2);
  }
  c.fillStyle = part.color || '#888';
  c.fill();
  const g = c.createLinearGradient(-w / 2, top, w / 2, bot);
  g.addColorStop(0, 'rgba(255,255,255,.18)'); g.addColorStop(.45, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(10,14,26,.22)');
  c.save(); c.clip(); c.fillStyle = g; c.fillRect(-w, top - 4, w * 2, h + 8); c.restore();
  c.strokeStyle = 'rgba(16,22,36,.85)'; c.lineWidth = 2.2;
  c.stroke();
}
function drawDefault2D(c, p) {
  const bob = p.onGround && Math.abs(p.vx) > 30 ? Math.abs(Math.sin(G.t * 10)) * 3 : 0;
  const air = p.onGround ? 0 : 4;
  const x = p.x + p.w / 2, feet = p.y + p.h;
  c.save(); c.translate(x, feet);
  const run = Math.sin(G.t * 14) * (Math.abs(p.vx) > 30 ? 5 : 0);
  c.fillStyle = '#28324f';
  c.fillRect(-10 + run * .4, -22, 8, 22); c.fillRect(2 - run * .4, -22, 8, 22);
  c.fillStyle = '#3b6fe0'; roundRect(c, -13, -54 - air, 26, 34, 8); c.fill();
  c.fillStyle = '#ffcf9e'; c.beginPath(); c.arc(0, -64 - air, 12, 0, 7); c.fill();
  c.fillStyle = '#3a2a20'; c.beginPath(); c.arc(0, -68 - air, 12, Math.PI, 0); c.fill();
  c.fillStyle = '#20263a';
  c.beginPath(); c.arc(-4 * p.face, -64 - air, 1.8, 0, 7); c.arc(4 * p.face, -64 - air, 1.8, 0, 7); c.fill();
  c.strokeStyle = 'rgba(12,16,28,.7)'; c.lineWidth = 2; c.stroke();
  c.restore();
}

/* ================= 3D PLAY ================= */
const M4 = {
  id: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  mul(a, b) {
    const o = new Array(16);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      o[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c] + a[r * 4 + 3] * b[12 + c];
    }
    return o;
  },
  trans(x, y, z) { return [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1]; },
  scale(x, y, z) { return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]; },
  ry(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1]; },
  rx(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1]; },
  rz(a) { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },
  pt(m, p) {
    return {
      x: m[0] * p.x + m[1] * p.y + m[2] * p.z + m[3],
      y: m[4] * p.x + m[5] * p.y + m[6] * p.z + m[7],
      z: m[8] * p.x + m[9] * p.y + m[10] * p.z + m[11]
    };
  }
};
const GEO3 = { box: makeBox3(), sphere: makeSphere3(8, 5) };
function makeBox3() {
  const v = [], n = [], idx = [];
  const sides = [
    [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1], [0, 0, 1]],
    [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1], [0, 0, -1]],
    [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1], [1, 0, 0]],
    [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, 0, 0]],
    [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1], [0, 1, 0]],
    [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], [0, -1, 0]]
  ];
  sides.forEach(([a, b, c, d, nn]) => {
    const base = v.length;
    [a, b, c, d].forEach(p => { v.push(p[0] * .5, p[1] * .5, p[2] * .5); n.push(nn[0], nn[1], nn[2]); });
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return { v, n, idx };
}
function makeSphere3(seg, rings) {
  const v = [], n = [], idx = [];
  for (let y = 0; y <= rings; y++) {
    const th = Math.PI * y / rings;
    for (let x = 0; x <= seg; x++) {
      const ph = 2 * Math.PI * x / seg;
      const nx = Math.sin(th) * Math.cos(ph), ny = Math.cos(th), nz = Math.sin(th) * Math.sin(ph);
      v.push(nx * .5, ny * .5, nz * .5); n.push(nx, ny, nz);
    }
  }
  for (let y = 0; y < rings; y++) for (let x = 0; x < seg; x++) {
    const a = y * (seg + 1) + x, b = a + seg + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return { v, n, idx };
}
function nodeWorlds3(nodes, pose, root) {
  const kids = {}, map = {};
  nodes.forEach(n => { (kids[n.parent || 'root'] = kids[n.parent || 'root'] || []).push(n); });
  const rec = (n, parent) => {
    const ps = pose[n.id] || {};
    const rx = M4.rx(((+n.rx || 0) + (+ps.rx || 0)) * Math.PI / 180);
    const ry = M4.ry(((+n.ry || 0) + (+ps.ry || 0)) * Math.PI / 180);
    const rz = M4.rz(((+n.rz || 0) + (+ps.rz || 0)) * Math.PI / 180);
    let base = M4.mul(parent, M4.trans(+n.x || 0, +n.y || 0, +n.z || 0));
    base = M4.mul(M4.mul(M4.mul(base, rx), ry), rz);
    map[n.id] = M4.mul(base, M4.scale(+n.w || 1, +n.h || 1, +n.d || 1));
    (kids[n.id] || []).forEach(c => rec(c, base));
  };
  (kids.root || []).forEach(n => rec(n, root || M4.id()));
  return map;
}
function defaultNodes3() {
  const N = (name, parent, shape, x, y, z, w, h, d, col) => ({ id: name, name, parent: parent || null, shape, x, y, z, w, h, d, color: col, rx: 0, ry: 0, rz: 0 });
  const shirt = '#3b6fe0', pants = '#2b3550', skin = '#ffcf9e';
  const out = [];
  out.push(N('hips', null, 'none', 0, 0, 0, 0, 0, 0, shirt));
  out.push(N('torso', 'hips', 'box', 0, 1.25, 0, .5, .64, .3, shirt));
  out.push(N('head', 'torso', 'sphere', 0, .52, 0, .36, .4, .36, skin));
  out.push(N('hair', 'torso', 'sphere', 0, .62, -.02, .4, .26, .38, '#3a2a20'));
  out.push(N('eyeL', 'torso', 'sphere', -.075, .53, .19, .07, .08, .05, '#20263a'));
  out.push(N('eyeR', 'torso', 'sphere', .075, .53, .19, .07, .08, .05, '#20263a'));
  out.push(N('armL', 'torso', 'box', -.31, 0, 0, .12, .46, .14, shirt));
  out.push(N('armR', 'torso', 'box', .31, 0, 0, .12, .46, .14, shirt));
  out.push(N('legL', 'hips', 'box', -.145, .25, 0, .17, .54, .2, pants));
  out.push(N('legR', 'hips', 'box', .145, .25, 0, .17, .54, .2, pants));
  return out;
}
function objHeight3(o) {
  if (o.eh) return +o.eh;
  if (['ground', 'platform', 'mover'].indexOf(o.type) >= 0) return 40;
  if (o.type === 'spike') return 30;
  if (o.type === 'door') return o.h || 140;
  return 140;
}
function moverOffset3(o) { return moverOffset(o); }
function solids3() {
  const out = [];
  G.map.objects.forEach(o => {
    if (!(OBJ[o.type] || {}).solid) return;
    if (o.type === 'door' && G.opened.has(o.id)) return;
    const x = o.x + (o.type === 'mover' ? moverOffset3(o) : 0);
    out.push({
      o: o, x0: x, x1: x + o.w, z0: o.y, z1: o.y + o.h,
      y0: +(o.elev || 0), y1: +(o.elev || 0) + objHeight3(o)
    });
  });
  return out;
}
function update3D(dt) {
  const p = G.player, K = G.keys, r = G.rules;
  const yaw = G.cam.yaw;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  let mx = 0, mz = 0;
  if (K.up) { mx += fx; mz += fz; }
  if (K.down) { mx -= fx; mz -= fz; }
  if (K.right) { mx += rx; mz += rz; }
  if (K.left) { mx -= rx; mz -= rz; }
  const len = Math.hypot(mx, mz);
  if (len > 0) { mx /= len; mz /= len; }
  const sp = K.run ? 400 : 240;
  p.vx += (mx * sp - p.vx) * Math.min(1, dt * 14);
  p.vz += (mz * sp - p.vz) * Math.min(1, dt * 14);
  if (len > 0) p.yaw = Math.atan2(mx, mz);
  const solids = solids3();
  p.y += p.vy * dt;
  p.vy -= 2300 * dt;
  p.onGround = false;
  p.x += p.vx * dt;
  collide3(solids, 'x');
  p.z += p.vz * dt;
  collide3(solids, 'z');
  collide3(solids, 'y');
  if (p.y <= 0) { p.y = 0; p.vy = 0; p.onGround = true; }
  if (p.onGround && K.jump) { p.vy = Math.sqrt(2 * 2300 * 150); p.onGround = false; }
  p.x = clamp(p.x, 40, G.map.w - 40);
  p.z = clamp(p.z, 40, G.map.h - 40);
  if (p.y < -500) respawn();
  p.state = p.onGround ? (Math.hypot(p.vx, p.vz) > 340 ? 'run' : Math.hypot(p.vx, p.vz) > 25 ? 'walk' : 'idle') : 'jump';
  const frame = currentFrame(G.char, p.state, dt);
  p.pose3 = (frame && frame.pose3) || {};
  interact3(dt);
  updateCamera3D(dt);
  updateHud();
  if (!G.over) updatePrompt3();
}
function collide3(solids, axis) {
  const p = G.player, r = 20, h = 92;
  for (const s of solids) {
    if (p.x + r <= s.x0 || p.x - r >= s.x1) continue;
    if (p.z + r <= s.z0 || p.z - r >= s.z1) continue;
    if (p.y + h <= s.y0 || p.y >= s.y1) continue;
    if (axis === 'y') {
      if (p.vy <= 0 && p.y < s.y1 && p.y + h > s.y1 - 8) { p.y = s.y1; p.vy = 0; p.onGround = true; }
      else if (p.vy > 0) { p.y = s.y0 - h; p.vy = 0; }
      else { p.y = s.y1; p.vy = 0; p.onGround = true; }
    } else if (axis === 'x') {
      if (p.vx > 0) p.x = s.x0 - r; else if (p.vx < 0) p.x = s.x1 + r;
      p.vx = 0;
    } else {
      if (p.vz > 0) p.z = s.z0 - r; else if (p.vz < 0) p.z = s.z1 + r;
      p.vz = 0;
    }
  }
}
function near3(o, dist) {
  const p = G.player;
  return Math.hypot(p.x - (o.x + o.w / 2), p.z - (o.y + o.h / 2)) < (dist || 110);
}
function interact3(dt) {
  const p = G.player;
  let near = null;
  G.map.objects.forEach(o => {
    if (o.type === 'coin' || o.type === 'gem') {
      if (!G.rules.coins || G.taken.has(o.id)) return;
      if (near3(o, 52) && Math.abs((p.y + 40) - ((o.elev || 0) + 30)) < 90) {
        G.taken.add(o.id); G.coins += o.val || (o.type === 'gem' ? 5 : 1);
        flash('+' + (o.val || 1) + ' coin' + ((o.val || 1) > 1 ? 's' : ''));
      }
      return;
    }
    if (o.type === 'checkpoint' && G.rules.checks) {
      if (near3(o, 70) && !G.checkpoints.has(o.id)) {
        G.checkpoints.add(o.id);
        G.respawnAt = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
        flash('Checkpoint reached');
      }
      return;
    }
    if (o.type === 'goal') { if (near3(o, 80)) winGame(); return; }
    if (o.type === 'npc' && near3(o, 120)) {
      near = o;
      if (G.pressed.interact) flash(o.txt || 'Hello!');
      return;
    }
    if (o.type === 'door' && !G.opened.has(o.id) && near3(o, 130)) {
      near = o;
      if (G.pressed.interact) {
        if (G.coins >= (o.need || 0)) { G.opened.add(o.id); flash('Door opened'); }
        else flash('You need ' + ((o.need || 0) - G.coins) + ' more coins');
      }
      return;
    }
    if (o.type === 'spike' || (o.type === 'enemy' && G.rules.enemies)) {
      if (!G.rules.hazard) return;
      const x = o.x + (o.type === 'enemy' ? moverOffset3(o) : 0);
      if (p.x > x - 24 && p.x < x + o.w + 24 && p.z > o.y - 24 && p.z < o.y + o.h + 24 && p.y < (o.elev || 0) + objHeight3(o)) hurt(o.type === 'spike' ? 'Spikes!' : 'Hit by an enemy!');
    }
  });
  G.near = near;
}
function updatePrompt3() {
  const el = $('#prompt'), o = G.near;
  if (!o) { el.hidden = true; return; }
  el.hidden = false;
  if (o.type === 'door') el.textContent = G.coins >= (o.need || 0) ? prettyKey(G.keymap.interact) + ' — open door' : 'Door locked · needs ' + (o.need || 0) + ' coins';
  else el.textContent = prettyKey(G.keymap.interact) + ' — talk';
}
function buildCam3() {
  const p = G.player, yaw = G.cam.yaw, pitch = G.cam.pitch;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const f = { x: Math.sin(yaw) * cp, y: -sp, z: Math.cos(yaw) * cp };
  const r = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
  const u = { x: Math.sin(yaw) * sp, y: cp, z: Math.cos(yaw) * sp };
  const target = { x: p.x, y: p.y + 70, z: p.z };
  let pos;
  if (G.camMode === 'first') pos = { x: p.x, y: p.y + 78, z: p.z };
  else {
    const dist = G.camMode === 'free' ? Math.max(500, G.cam.dist) : (G.cam.dist || 430);
    pos = { x: target.x - f.x * dist, y: target.y - f.y * dist, z: target.z - f.z * dist };
  }
  if (pos.y < 30) pos.y = 30;
  return { pos, f, r, u, focal: Math.min(innerWidth, innerHeight) * 1.15 };
}
function project3(pt, cam) {
  const dx = pt.x - cam.pos.x, dy = pt.y - cam.pos.y, dz = pt.z - cam.pos.z;
  const xc = dx * cam.r.x + dz * cam.r.z;
  const yc = dx * cam.u.x + dy * cam.u.y + dz * cam.u.z;
  const zc = dx * cam.f.x + dy * cam.f.y + dz * cam.f.z;
  if (zc <= 6) return null;
  const W = cam.W || innerWidth, H = cam.H || innerHeight;
  return { x: W / 2 + xc * cam.focal / zc, y: H / 2 - yc * cam.focal / zc, z: zc };
}
function clipPoly3(pts, cam) {
  const N = 6;
  const cs = pts.map(p => {
    const dx = p.x - cam.pos.x, dy = p.y - cam.pos.y, dz = p.z - cam.pos.z;
    return { x: dx * cam.r.x + dz * cam.r.z, y: dx * cam.u.x + dy * cam.u.y + dz * cam.u.z, z: dx * cam.f.x + dy * cam.f.y + dz * cam.f.z };
  });
  const out = [];
  for (let i = 0; i < cs.length; i++) {
    const a = cs[i], b = cs[(i + 1) % cs.length];
    const ain = a.z > N, bin = b.z > N;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (N - a.z) / (b.z - a.z);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: N });
    }
  }
  const W = cam.W || innerWidth, H = cam.H || innerHeight;
  return out.map(p => ({ x: W / 2 + p.x * cam.focal / p.z, y: H / 2 - p.y * cam.focal / p.z, z: p.z }));
}
function updateCamera3D(dt) {
  if (G.camMode === 'first') { G.cam3 = buildCam3(); return; }
  G.cam3 = buildCam3();
}
function pushQuad(polys, cam, a, b, c, d, color, shadeK) {
  const pa = project3(a, cam), pb = project3(b, cam), pc = project3(c, cam), pd = project3(d, cam);
  if (!pa || !pb || !pc || !pd) return;
  const depth = (pa.z + pb.z + pc.z + pd.z) / 4;
  polys.push({ pts: [pa, pb, pc, pd], depth, color: shadeHex(color, shadeK) });
}
function shadeHex(hex, k) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (isNaN(n)) return hex;
  const r = clamp(((n >> 16) & 255) * k, 0, 255) | 0;
  const g = clamp(((n >> 8) & 255) * k, 0, 255) | 0;
  const b = clamp((n & 255) * k, 0, 255) | 0;
  return `rgb(${r},${g},${b})`;
}
function boxPolys(polys, cam, x0, y0, z0, x1, y1, z1, color) {
  const P = {
    a: { x: x0, y: y0, z: z0 }, b: { x: x1, y: y0, z: z0 }, c: { x: x1, y: y0, z: z1 }, d: { x: x0, y: y0, z: z1 },
    e: { x: x0, y: y1, z: z0 }, f: { x: x1, y: y1, z: z0 }, g: { x: x1, y: y1, z: z1 }, h: { x: x0, y: y1, z: z1 }
  };
  pushQuad(polys, cam, P.e, P.f, P.g, P.h, color, 1.05);
  pushQuad(polys, cam, P.a, P.d, P.c, P.b, color, .55);
  pushQuad(polys, cam, P.d, P.h, P.g, P.c, color, .8);
  pushQuad(polys, cam, P.a, P.b, P.f, P.e, color, .9);
  pushQuad(polys, cam, P.a, P.e, P.h, P.d, color, .7);
  pushQuad(polys, cam, P.b, P.c, P.g, P.f, color, .78);
}

/* ---------------- 3D rendering ---------------- */
function render3D(c, W, H) {
  const cam = G.cam3 || buildCam3();
  cam.W = W; cam.H = H; cam.focal = Math.min(W, H) * 1.15;
  const bg = /^#[0-9a-f]{6}$/i.test(G.map.bg) ? G.map.bg : '#0b1224';
  const lightBg = bgIsLight(bg);
  const sky = c.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, shade(bg, 1.5)); sky.addColorStop(.55, shade(bg, 1.1)); sky.addColorStop(1, shade(bg, .55));
  c.fillStyle = sky; c.fillRect(0, 0, W, H);
  // ground plane (clipped against the near plane so it never vanishes)
  const gp = clipPoly3([{ x: -900, y: 0, z: -900 }, { x: G.map.w + 900, y: 0, z: -900 }, { x: G.map.w + 900, y: 0, z: G.map.h + 900 }, { x: -900, y: 0, z: G.map.h + 900 }], cam);
  if (gp.length > 2) {
    c.fillStyle = shade(bg, 1.02);
    c.beginPath(); c.moveTo(gp[0].x, gp[0].y); gp.slice(1).forEach(p => c.lineTo(p.x, p.y)); c.closePath(); c.fill();
  }
  c.save();
  c.strokeStyle = lightBg ? 'rgba(30,55,105,.25)' : 'rgba(150,180,255,.14)'; c.lineWidth = 1;
  for (let x = 0; x <= G.map.w; x += 120) {
    const a = project3({ x: x, y: .5, z: 0 }, cam), b = project3({ x: x, y: .5, z: G.map.h }, cam);
    if (!a || !b) continue;
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
  }
  for (let z = 0; z <= G.map.h; z += 120) {
    const a = project3({ x: 0, y: .5, z: z }, cam), b = project3({ x: G.map.w, y: .5, z: z }, cam);
    if (!a || !b) continue;
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
  }
  c.restore();

  // player shadow
  const sp3 = project3({ x: G.player.x, y: 1, z: G.player.z }, cam);
  if (sp3) {
    const rr = 34 * cam.focal / sp3.z;
    c.fillStyle = lightBg ? 'rgba(20,35,65,.28)' : 'rgba(4,7,14,.45)';
    c.beginPath(); c.ellipse(sp3.x, sp3.y, rr, rr * .34, 0, 0, 7); c.fill();
  }
  const polys = [];
  // map objects
  G.map.objects.forEach(o => {
    const x = o.x + (o.type === 'mover' ? moverOffset3(o) : 0);
    const z0 = o.y, z1 = o.y + o.h;
    const elev = +(o.elev || 0);
    if ((o.type === 'coin' || o.type === 'gem') && G.taken.has(o.id)) return;
    if (o.type === 'coin' || o.type === 'gem') {
      const s = o.type === 'gem' ? 16 : 13;
      const cy = elev + 34 + Math.sin(G.t * 3 + o.x) * 5;
      boxPolys(polys, cam, x + o.w / 2 - s, cy - s, z0 + o.h / 2 - s, x + o.w / 2 + s, cy + s, z0 + o.h / 2 + s, o.color || '#ffd166');
      return;
    }
    if (o.type === 'spike') {
      boxPolys(polys, cam, x, elev, z0, x + o.w, elev + 30, z1, o.color || '#e5484d');
      return;
    }
    if (o.type === 'goal') {
      boxPolys(polys, cam, x, elev, z0, x + o.w, elev + o.h, z1, o.color || '#2fbf71');
      boxPolys(polys, cam, x + o.w / 2 - 10, elev + o.h, z0 + o.h / 2 - 10, x + o.w / 2 + 10, elev + o.h + 40, z0 + o.h / 2 + 10, '#ffd166');
      return;
    }
    if (o.type === 'checkpoint') {
      boxPolys(polys, cam, x + o.w / 2 - 3, elev, z0 + o.h / 2 - 3, x + o.w / 2 + 3, elev + o.h, z0 + o.h / 2 + 3, '#cfd8f5');
      boxPolys(polys, cam, x + o.w / 2, elev + o.h - 22, z0 + o.h / 2, x + o.w / 2 + o.w, elev + o.h, z0 + o.h / 2 + 3, G.checkpoints.has(o.id) ? '#ffd166' : (o.color || '#2ec4b6'));
      return;
    }
    if (o.type === 'enemy') {
      boxPolys(polys, cam, x, elev + 8, z0, x + o.w, elev + objHeight3(o), z1, o.color || '#ff6b6b');
      return;
    }
    if (o.type === 'npc') {
      boxPolys(polys, cam, x, elev, z0, x + o.w, elev + o.h, z1, o.color || '#9d9aff');
      return;
    }
    if (o.type === 'decor') {
      boxPolys(polys, cam, x, elev, z0, x + o.w, elev + o.h, z1, o.color || '#4a568f');
      return;
    }
    if (o.type === 'door') {
      boxPolys(polys, cam, x, elev, z0, x + o.w, elev + o.h, z1, G.opened.has(o.id) ? '#6b5a22' : (o.color || '#c9a227'));
      return;
    }
    if (o.solid || o.type === 'ground' || o.type === 'platform' || o.type === 'block' || o.type === 'mover') {
      boxPolys(polys, cam, x, elev, z0, x + o.w, elev + objHeight3(o), z1, '#' + (o.color || '#43507e').replace('#', ''));
    }
  });
  // player
  if (G.camMode !== 'first') charPolys3(polys, cam, G.player, G.player.pose3 || {});
  polys.sort((a, b) => b.depth - a.depth);
  c.lineJoin = 'round';
  polys.forEach(f => {
    c.beginPath();
    c.moveTo(f.pts[0].x, f.pts[0].y);
    for (let i = 1; i < f.pts.length; i++) c.lineTo(f.pts[i].x, f.pts[i].y);
    c.closePath();
    c.fillStyle = f.color;
    c.fill();
    c.strokeStyle = f.color;
    c.lineWidth = .8;
    c.stroke();
  });
  // first person crosshair
  if (G.camMode === 'first') {
    c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 2;
    c.beginPath(); c.arc(W / 2, H / 2, 6, 0, 7); c.stroke();
    c.beginPath(); c.moveTo(W / 2 - 12, H / 2); c.lineTo(W / 2 - 7, H / 2); c.moveTo(W / 2 + 7, H / 2); c.lineTo(W / 2 + 12, H / 2); c.stroke();
  }
  if (G.flash > 0) { c.fillStyle = 'rgba(229,72,77,' + (G.flash * .26) + ')'; c.fillRect(0, 0, W, H); }
  if (G.camMode !== 'first' && !document.pointerLockElement) {
    c.fillStyle = 'rgba(8,12,20,.5)'; c.font = '600 12px Inter,system-ui'; c.textAlign = 'center';
    c.fillText('Click to capture the mouse · Esc to pause', W / 2, H - 24);
  }
}
function charPolys3(polys, cam, p, pose) {
  const ch = G.char;
  const nodes = ch && ch.nodes && ch.nodes.length ? ch.nodes : defaultNodes3();
  const sc = 46;
  const root = M4.mul(M4.trans(p.x, p.y, p.z), M4.mul(M4.ry(p.yaw || 0), M4.scale(sc, sc, sc)));
  const worlds = nodeWorlds3(nodes, pose || {}, root);
  const light = { x: .42, y: .8, z: .45 };
  nodes.forEach(n => {
    if (!n.shape || n.shape === 'none' || n.visible === false) return;
    const m = worlds[n.id];
    if (!m) return;
    const geo = n.shape === 'sphere' ? GEO3.sphere : GEO3.box;
    const col = n.color || '#8899bb';
    for (let i = 0; i < geo.idx.length; i += 3) {
      const wp = [];
      for (let k = 0; k < 3; k++) {
        const vi = geo.idx[i + k] * 3;
        wp.push(M4.pt(m, { x: geo.v[vi], y: geo.v[vi + 1], z: geo.v[vi + 2] }));
      }
      const s0 = project3(wp[0], cam), s1 = project3(wp[1], cam), s2 = project3(wp[2], cam);
      if (!s0 || !s1 || !s2) continue;
      const ux = wp[1].x - wp[0].x, uy = wp[1].y - wp[0].y, uz = wp[1].z - wp[0].z;
      const vx = wp[2].x - wp[0].x, vy = wp[2].y - wp[0].y, vz = wp[2].z - wp[0].z;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const l = Math.max(0, nx * light.x + ny * light.y + nz * light.z);
      const k = .6 + .5 * l;
      polys.push({ pts: [s0, s1, s2], depth: (s0.z + s1.z + s2.z) / 3, color: shadeHex(col, k) });
    }
  });
}

/* ---------------- boot ---------------- */
function boot() {
  loadMaps();
  loadChars();
  bindPanels();
  resizeView();
  if (window.ResizeObserver) {
    try { new ResizeObserver(() => { if (cur && $('#game').hidden) draw(); }).observe($('#wrap')); } catch (e) { }
  }
  window.addEventListener('resize', () => { if (cur && $('#game').hidden) draw(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G && !G.paused) setPaused(true); });
  const last = localStorage.getItem(LS_LAST);
  const m = maps.find(x => x.id === last) || maps[0];
  if (m) openMap(m);
  else { renderLibrary(); $('#lib').hidden = false; }
  if (!maps.length) $('#libempty').hidden = false;
}
boot();
