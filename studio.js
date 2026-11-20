/* Character Studio — manual character creation, rigging and animation.
   Everything is authored by hand: no generation, no prompts, no AI. */
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () => Math.random().toString(36).slice(2, 9);
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const round = n => Math.round(n * 100) / 100;

/* ---------------- styles ---------------- */
const STYLES = {
  cartoon: { n: '2D Cartoon', mode: '2d', icon: '🎨', tint: '#ffd166',
    about: 'Bold outlines, warm palettes, readable shapes.',
    w: 420, h: 560, bg: '#ffffff',
    pal: ['#20263a', '#ffcf9e', '#f0a878', '#c97a55', '#ffe3c9', '#3a2a20', '#a5673f', '#3b6fe0', '#e5484d', '#ffb020', '#2ec4b6', '#ffffff'] },
  anime: { n: '2D Anime', mode: '2d', icon: '✦', tint: '#f3a6ff',
    about: 'Slim proportions, cel shading, expressive faces.',
    w: 420, h: 560, bg: '#fdfbff',
    pal: ['#2a2035', '#ffe0c8', '#f3c4a8', '#d59a7c', '#fff2e6', '#1b1b2e', '#6b4a3a', '#7c5cff', '#ff7fa8', '#4cc9f0', '#ffe066', '#ffffff'] },
  fantasy: { n: 'Fantasy', mode: '2d', icon: '⚔', tint: '#9ae6b4',
    about: 'Armour, capes, horns and creature parts.',
    w: 420, h: 560, bg: '#f4f7ef',
    pal: ['#1c2430', '#e6c9a8', '#c9a27c', '#9c7550', '#f3e2c8', '#2f1f2e', '#7a4b2a', '#4f7a3a', '#c9a227', '#8e44ad', '#c0392b', '#e8f0ff'] },
  realistic: { n: 'Realistic', mode: '2d', icon: '◍', tint: '#a3bffa',
    about: 'Natural proportions, soft gradients, muted cloth.',
    w: 420, h: 560, bg: '#f2f0ee',
    pal: ['#241f1c', '#e8c4a8', '#c99b7c', '#9d735a', '#f4e3d3', '#2a211b', '#6b4a34', '#3f5168', '#7a3b3b', '#b08a4f', '#6f8f6a', '#f7f5f2'] },
  pixel: { n: 'Pixel Art', mode: 'pixel', icon: '▦', tint: '#7ee787',
    about: 'Low-resolution canvas, hard pixels, 16-colour palette.',
    w: 84, h: 112, bg: '#f2f2f2',
    pal: ['#1a1c2c', '#f4d6b0', '#e0a97a', '#a86b45', '#fcebd2', '#2b1d14', '#7a4a24', '#3b5dc9', '#c0392b', '#ffcd75', '#38b764', '#ffffff'] },
  '3d': { n: '3D Character', mode: '3d', icon: '◈', tint: '#7c8cff',
    about: 'Primitive 3D rig with orbit camera and glTF export.',
    w: 640, h: 560, bg: '#101725',
    pal: ['#e8c4a8', '#c99b7c', '#2b3550', '#3b6fe0', '#e5484d', '#ffb020', '#2ec4b6', '#8b95ad', '#ffffff', '#1a1f2e'] },
  '3dcartoon': { n: '3D Cartoon', mode: '3d', icon: '◊', tint: '#ffb86b',
    about: 'Chunky stylised 3D shapes, big head, bright materials.',
    w: 640, h: 560, bg: '#141a2a',
    pal: ['#ffd9c2', '#f0a878', '#3348e0', '#7c8cff', '#ff7fa8', '#ffd166', '#2ec4b6', '#c3cee6', '#ffffff', '#1a1f2e'] }
};

const LOOK = {
  cartoon: { line: '#1b2030', lw: 3, shade: .22, hl: .20, round: 1 },
  anime: { line: '#2a2035', lw: 2, shade: .16, hl: .24, round: 1 },
  fantasy: { line: '#171a26', lw: 3, shade: .28, hl: .14, round: .85 },
  realistic: { line: 'rgba(32,26,22,.45)', lw: 1.4, shade: .30, hl: .10, round: .6 },
  pixel: { line: 'rgba(0,0,0,0)', lw: 0, shade: 0, hl: 0, round: 0 }
};
const lookOf = () => LOOK[proj.style] || LOOK.cartoon;

/* ---------------- state ---------------- */
let projects = [];
let proj = null;
let sel = null;                 // {kind:'part'|'layer'|'node', id}
let tool = 'select';
let color = '#20263a';
let brushSize = 6;
let brushOpacity = 1;
let zoom = 1;
let viewFrame = 0;
let playing = false;
let playRaf = 0;
let speed = 1;
let onion = false;
let previewMode = false;
let undoStack = [];
let redoStack = [];
let marquee = null;             // {x,y,w,h}
let clipPixels = null;          // copied selection
let drag = null;
let pendingShape = null;
let activeLayerId = null;
let syncAllPoses = true;
let libOpen = false;

const STORE = 'charlab:projects';
const LAST = 'charlab:last';
const BASE_W = 420, BASE_H = 560;

/* ---------------- helpers ---------------- */
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('on'), 2200);
}
const snapshot = p => JSON.stringify(p, (k, v) => (k === '_c' ? undefined : v));
const clone = o => JSON.parse(JSON.stringify(o));
const deep = p => JSON.parse(snapshot(p));
const curAnim = () => proj.anims[proj.curAnim];
function curFrame() {
  const a = curAnim();
  viewFrame = clamp(viewFrame, 0, a.frames.length - 1);
  return a.frames[viewFrame];
}
const is3D = () => proj.mode === '3d';
const poseField = () => (is3D() ? 'pose3' : 'pose');

function pushUndo() {
  if (!proj) return;
  undoStack.push(snapshot(proj));
  if (undoStack.length > 40) undoStack.shift();
  redoStack.length = 0;
}
function undo() {
  if (!undoStack.length) return toast('Nothing to undo');
  redoStack.push(snapshot(proj));
  restore(undoStack.pop());
}
function redo() {
  if (!redoStack.length) return toast('Nothing to redo');
  undoStack.push(snapshot(proj));
  restore(redoStack.pop());
}
function restore(json) {
  const p = JSON.parse(json);
  const i = projects.findIndex(x => x.id === p.id);
  if (i >= 0) p.thumb = projects[i].thumb;
  proj = p;
  dropCaches();
  sel = null;
  viewFrame = clamp(viewFrame, 0, curAnim().frames.length - 1);
  activeLayerId = null;
  syncEditor();
  draw();
}
function dropCaches() {
  (proj.anims || []).forEach(a => (a.frames || []).forEach(f => (f.layers || []).forEach(l => { delete l._c; })));
}

/* ---------------- project data ---------------- */
function newLayer(name, src) {
  return { id: uid(), name: name || 'Paint', visible: true, opacity: 1, src: src || null };
}
function blankFrame(fps) {
  return { dur: Math.round(1000 / (fps || 8)), pose: {}, pose3: {}, layers: [newLayer('Paint 1')] };
}
function newAnim(name, frames, fps) {
  fps = fps || 8;
  const f = [];
  for (let i = 0; i < Math.max(1, frames || 1); i++) f.push(blankFrame(fps));
  return { id: uid(), name: name || 'Idle', fps, loop: true, frames: f };
}

function makeDefaultRig() {
  const P = (name, parent, shape, x, y, w, h, col, anchor) =>
    ({ id: uid(), name, parent: parent || null, shape, x, y, w, h, color: col, anchor: anchor == null ? 0 : anchor, opacity: 1, visible: true });
  const skin = '#ffcf9e', skin2 = '#e8b184', hair = '#3a2a20', shirt = '#3b6fe0', pants = '#28324f', shoe = '#20242f', ink = '#20263a';
  const list = [];
  const add = (...a) => { const p = P(...a); list.push(p); return p; };
  const hips = add('Hips', null, 'none', 210, 388, 0, 0, ink, 0);
  const torso = add('Torso', hips.id, 'rect', 0, -8, 88, 116, shirt, 1);
  const head = add('Head', torso.id, 'ellipse', 0, -112, 84, 94, skin, 1);
  add('Hair', head.id, 'blob', 0, -93, 92, 42, hair, 0);
  add('Eye L', head.id, 'ellipse', -18, -40, 13, 15, ink, .5);
  add('Eye R', head.id, 'ellipse', 18, -40, 13, 15, ink, .5);
  add('Brow L', head.id, 'capsule', -18, -56, 20, 5, hair, .5);
  add('Brow R', head.id, 'capsule', 18, -56, 20, 5, hair, .5);
  add('Nose', head.id, 'capsule', 0, -24, 8, 14, skin2, .5);
  add('Mouth', head.id, 'capsule', 0, -6, 24, 7, '#b5544a', .5);
  const armL = add('Arm L', torso.id, 'capsule', -46, -104, 22, 74, shirt, 0);
  const foreL = add('Forearm L', armL.id, 'capsule', 0, 70, 18, 58, skin, 0);
  add('Hand L', foreL.id, 'ellipse', 0, 54, 22, 24, skin, .5);
  const armR = add('Arm R', torso.id, 'capsule', 46, -104, 22, 74, shirt, 0);
  const foreR = add('Forearm R', armR.id, 'capsule', 0, 70, 18, 58, skin, 0);
  add('Hand R', foreR.id, 'ellipse', 0, 54, 22, 24, skin, .5);
  const legL = add('Leg L', hips.id, 'capsule', -21, -6, 30, 90, pants, 0);
  const shinL = add('Shin L', legL.id, 'capsule', 0, 88, 26, 74, pants, 0);
  add('Foot L', shinL.id, 'capsule', 6, 70, 38, 20, shoe, .5);
  const legR = add('Leg R', hips.id, 'capsule', 21, -6, 30, 90, pants, 0);
  const shinR = add('Shin R', legR.id, 'capsule', 0, 88, 26, 74, pants, 0);
  add('Foot R', shinR.id, 'capsule', -6, 70, 38, 20, shoe, .5);
  return list;
}

function default3d(style) {
  const N = (name, parent, shape, x, y, z, w, h, d, col) =>
    ({ id: uid(), name, parent: parent || null, shape, x, y, z, w, h, d, color: col, rx: 0, ry: 0, rz: 0, visible: true });
  const cartoon = style === '3dcartoon';
  const k = cartoon ? 1.18 : 1;
  const skin = cartoon ? '#ffd9c2' : '#e8c4a8';
  const shirt = '#3348e0', pants = '#3d4a68', shoe = '#232a3a', ink = '#20263a';
  const list = [];
  const add = (name, parent, shape, x, y, z, w, h, d, col) => { const n = N(name, parent, shape, x, y, z, w, h, d, col); list.push(n); return n; };
  const hips = add('Hips', null, 'none', 0, 0.98 * k, 0, 0, 0, 0, ink);
  const torso = add('Torso', hips.id, 'box', 0, 0.32 * k, 0, 0.5 * k, 0.64 * k, 0.3 * k, shirt);
  add('Head', torso.id, 'sphere', 0, 0.52 * k, 0, 0.36 * k, 0.4 * k, 0.36 * k, skin);
  add('Hair', torso.id, 'sphere', 0, 0.62 * k, -0.02, 0.4 * k, 0.26 * k, 0.38 * k, '#3a2a20');
  add('Eye L', torso.id, 'sphere', -0.075 * k, 0.53 * k, 0.19 * k, 0.07, 0.08, 0.05, '#20263a');
  add('Eye R', torso.id, 'sphere', 0.075 * k, 0.53 * k, 0.19 * k, 0.07, 0.08, 0.05, '#20263a');
  const armL = add('Arm L', torso.id, 'box', -0.31 * k, 0, 0, 0.12 * k, 0.46 * k, 0.14 * k, shirt);
  add('Forearm L', armL.id, 'box', 0, -0.39 * k, 0, 0.11 * k, 0.32 * k, 0.13 * k, skin);
  const armR = add('Arm R', torso.id, 'box', 0.31 * k, 0, 0, 0.12 * k, 0.46 * k, 0.14 * k, shirt);
  add('Forearm R', armR.id, 'box', 0, -0.39 * k, 0, 0.11 * k, 0.32 * k, 0.13 * k, skin);
  const legL = add('Leg L', hips.id, 'box', -0.145 * k, -0.25 * k, 0, 0.17 * k, 0.54 * k, 0.2 * k, pants);
  const shinL = add('Shin L', legL.id, 'box', 0, -0.46 * k, 0, 0.16 * k, 0.5 * k, 0.19 * k, pants);
  add('Foot L', shinL.id, 'box', 0, -0.27 * k, 0.07 * k, 0.2 * k, 0.13 * k, 0.32 * k, shoe);
  const legR = add('Leg R', hips.id, 'box', 0.145 * k, -0.25 * k, 0, 0.17 * k, 0.54 * k, 0.2 * k, pants);
  const shinR = add('Shin R', legR.id, 'box', 0, -0.46 * k, 0, 0.16 * k, 0.5 * k, 0.19 * k, pants);
  add('Foot R', shinR.id, 'box', 0, -0.27 * k, 0.07 * k, 0.2 * k, 0.13 * k, 0.32 * k, shoe);
  return list;
}

function makeProject(style, name) {
  const st = STYLES[style] || STYLES.cartoon;
  const p = {
    v: 1, id: uid(), name: name || 'Untitled character', style, mode: st.mode,
    w: st.w, h: st.h, bg: st.bg, pal: st.pal.slice(),
    parts: st.mode === '3d' ? [] : makeDefaultRig(),
    nodes: st.mode === '3d' ? default3d(style) : [],
    anims: [newAnim('Idle', 6, 8)],
    curAnim: 0, fps: 8,
    cam: { yaw: -26, pitch: 16, dist: 4.6, target: 1.05 },
    updated: Date.now(), thumb: null
  };
  if (st.mode === '3d') {
    p.anims[0].frames = [blankFrame(8)];
    p.anims[0].frames[0].layers = [];
    p.anims[0].interp = true;
  }
  return p;
}

/* ---------------- library ---------------- */
function readStore() {
  try { projects = JSON.parse(localStorage.getItem(STORE)) || []; }
  catch (e) { projects = []; }
  if (!Array.isArray(projects)) projects = [];
}
function writeStore() {
  try { localStorage.setItem(STORE, JSON.stringify(projects)); return true; }
  catch (e) { toast('Storage is full — export the project to keep it'); return false; }
}
function makeThumb() {
  if (!proj) return null;
  const c = document.createElement('canvas');
  c.width = 132; c.height = 176;
  const ctx = c.getContext('2d');
  renderFrameTo(ctx, c.width, c.height, curFrame(), { transparent: false });
  try { return c.toDataURL('image/png'); } catch (e) { return null; }
}
function saveProject(silent) {
  if (!proj) return;
  proj.updated = Date.now();
  proj.thumb = makeThumb() || proj.thumb;
  const copy = deep(proj);
  const i = projects.findIndex(p => p.id === proj.id);
  if (i >= 0) projects[i] = copy; else projects.unshift(copy);
  writeStore();
  try { localStorage.setItem(LAST, proj.id); } catch (e) {}
  if (!silent) toast('Project saved');
  renderLibrary();
}
let saveTimer = 0;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveProject(true), 900);
}

function openProject(id) {
  const p = projects.find(x => x.id === id);
  if (!p) return;
  proj = clone(p);
  dropCaches();
  undoStack = []; redoStack = [];
  sel = null; viewFrame = 0; zoom = 1; playing = false; marquee = null;
  activeLayerId = null;
  proj.curAnim = clamp(proj.curAnim || 0, 0, proj.anims.length - 1);
  $('#lib').hidden = true; libOpen = false;
  syncEditor();
  fitView();
  draw();
  toast('Opened ' + proj.name);
}
function deleteProject(id) {
  const p = projects.find(x => x.id === id);
  if (!p) return;
  confirmModal('Delete character?', '“' + p.name + '” will be removed from this browser. Export first if you want to keep a copy.', () => {
    projects = projects.filter(x => x.id !== id);
    writeStore(); renderLibrary();
    if (proj && proj.id === id) { proj = null; showLibrary(); }
    toast('Deleted');
  });
}
function duplicateProject(id) {
  const p = projects.find(x => x.id === id);
  if (!p) return;
  const c = clone(p);
  c.id = uid(); c.name = p.name + ' copy'; c.updated = Date.now();
  c.thumb = p.thumb;
  projects.unshift(c); writeStore(); renderLibrary();
  toast('Duplicated “' + p.name + '”');
}
function renameProject(id) {
  const p = projects.find(x => x.id === id);
  if (!p) return;
  textModal('Rename character', 'Name', p.name, v => {
    p.name = v || p.name; p.updated = Date.now();
    writeStore(); renderLibrary();
    if (proj && proj.id === id) { proj.name = p.name; $('#pname').value = p.name; }
  });
}

function renderLibrary() {
  const grid = $('#libgrid');
  if (!grid) return;
  const cards = projects.slice().sort((a, b) => b.updated - a.updated).map(p => {
    const st = STYLES[p.style] || STYLES.cartoon;
    return `<div class="pcard" data-id="${p.id}" tabindex="0" role="button" aria-label="Open ${esc(p.name)}">
      <div class="thumb">${p.thumb ? `<img alt="" src="${p.thumb}">` : ''}</div>
      <div class="meta"><b>${esc(p.name)}</b><small>${st.n} · ${new Date(p.updated).toLocaleDateString()}</small></div>
      <div class="row">
        <button class="btn sm" data-act="open" data-id="${p.id}">Open</button>
        <button class="btn sm" data-act="dup" data-id="${p.id}">Duplicate</button>
        <button class="btn sm" data-act="ren" data-id="${p.id}">Rename</button>
        <button class="btn sm danger" data-act="del" data-id="${p.id}">Delete</button>
      </div>
    </div>`;
  }).join('');
  grid.innerHTML = `<button class="pcard new" id="newCheat" type="button"><strong>+</strong>New character</button>` + cards;
  $('#libempty').hidden = projects.length > 0;
  grid.querySelectorAll('[data-act]').forEach(b => {
    b.onclick = ev => {
      ev.stopPropagation();
      const id = b.dataset.id;
      if (b.dataset.act === 'open') openProject(id);
      else if (b.dataset.act === 'dup') duplicateProject(id);
      else if (b.dataset.act === 'ren') renameProject(id);
      else if (b.dataset.act === 'del') deleteProject(id);
    };
  });
  grid.querySelectorAll('.pcard[data-id]').forEach(c => {
    c.onclick = ev => { if (!ev.target.closest('button')) openProject(c.dataset.id); };
    c.onkeydown = ev => { if (ev.key === 'Enter') openProject(c.dataset.id); };
  });
  const nc = $('#newCheat');
  if (nc) nc.onclick = newCharacterModal;
}
function showLibrary() {
  playing = false;
  cancelAnimationFrame(playRaf);
  $('#lib').hidden = false;
  libOpen = true;
  renderLibrary();
}

/* ---------------- modals ---------------- */
let modalRun = null;
function openModal(title, body, actions, onOpen) {
  $('#mtitle').textContent = title;
  $('#mbody').innerHTML = body;
  const foot = $('#mfoot');
  foot.innerHTML = '';
  (actions || []).forEach(a => {
    const b = document.createElement('button');
    b.className = 'btn ' + (a.cls || '');
    b.textContent = a.label;
    b.type = 'button';
    b.onclick = () => { if (a.keep !== true) closeModal(); a.run && a.run(); };
    foot.appendChild(b);
  });
  $('#modal').hidden = false;
  modalRun = onOpen || null;
  if (onOpen) onOpen();
  setTimeout(() => { const f = $('#mbody input,#mbody select'); if (f) f.focus(); }, 40);
}
function closeModal() { $('#modal').hidden = true; modalRun = null; }
function textModal(title, label, value, done) {
  openModal(title, `<label for="tmIn">${esc(label)}</label><input id="tmIn" type="text" value="${esc(value)}" maxlength="40">`,
    [{ label: 'Cancel' }, { label: 'Save', cls: 'pri', run: () => done($('#tmIn').value.trim()) }],
    () => { const i = $('#tmIn'); i.focus(); i.select(); i.onkeydown = e => { if (e.key === 'Enter') { const v = i.value.trim(); closeModal(); done(v); } }; });
}
function confirmModal(title, text, done) {
  openModal(title, `<p class="hint" style="margin-top:0">${esc(text)}</p>`,
    [{ label: 'Cancel' }, { label: 'Confirm', cls: 'danger', run: done }]);
}

function newCharacterModal() {
  const cards = Object.keys(STYLES).map(k => {
    const s = STYLES[k];
    return `<button class="stylecard${k === 'cartoon' ? ' on' : ''}" data-style="${k}" type="button">
      <span class="ib" style="background:${s.tint}22;border:1px solid ${s.tint}55;color:${s.tint}">${s.icon}</span>
      <span><b>${s.n}</b><small>${s.about}</small></span></button>`;
  }).join('');
  openModal('Create a character', `
    <label for="ncName">Character name</label>
    <input id="ncName" type="text" maxlength="40" value="New character">
    <label>Art style</label>
    <div class="stylegrid" id="ncStyles">${cards}</div>
    <p class="hint">The style sets the canvas, palette and shading. Every part is added and posed by hand afterwards.</p>`,
    [{ label: 'Cancel' }, {
      label: 'Create', cls: 'pri', run: () => {
        const b = $('#ncStyles');
        const style = b && b.dataset.pick ? b.dataset.pick : 'cartoon';
        const name = $('#ncName').value.trim() || 'New character';
        proj = makeProject(style, name);
        projects.unshift(deep(proj)); writeStore();
        sel = null; viewFrame = 0; zoom = 1; undoStack = []; redoStack = [];
        activeLayerId = null;
        $('#lib').hidden = true; libOpen = false;
        syncEditor(); fitView(); draw(); saveProject(true);
        toast('Created ' + name);
      }
    }],
    () => {
      const grid = $('#ncStyles');
      grid.dataset.pick = 'cartoon';
      grid.querySelectorAll('[data-style]').forEach(c => {
        c.onclick = () => {
          grid.dataset.pick = c.dataset.style;
          grid.querySelectorAll('[data-style]').forEach(x => x.classList.toggle('on', x === c));
        };
      });
    });
}

/* ---------------- small ui helpers ---------------- */
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
function setBadge() {
  const st = STYLES[proj.style] || STYLES.cartoon;
  $('#styleBadge').textContent = st.n;
  $('#modeName').textContent = st.n;
  $('#modeLab').textContent = st.mode === '3d' ? '3D scene' : st.mode === 'pixel' ? 'Pixel canvas' : '2D rig + paint';
  $('#view').classList.toggle('pixel', st.mode === 'pixel');
}
function syncEditor() {
  if (!proj) return;
  $('#pname').value = proj.name;
  if (!activeLayerId && !is3D()) {
    const f = curAnim().frames[clamp(viewFrame, 0, curAnim().frames.length - 1)];
    if (f && f.layers && f.layers.length) activeLayerId = f.layers[f.layers.length - 1].id;
  }
  setBadge();
  syncAnimationUI();
  renderPartsPanel();
  renderDrawPanel();
  renderLayersPanel();
  renderColorsPanel();
  render3DPanel();
  renderProps();
  renderFrames();
  updateZoomLabel();
}
function updateZoomLabel() {
  $('#zoomLab').textContent = Math.round(zoom * 100) + '%';
}

/* ---------------- boot ---------------- */
function boot() {
  readStore();
  $('#importFile').onchange = e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const p = JSON.parse(r.result);
        if (!p || !p.anims || !p.anims.length) throw 0;
        p.id = p.id || uid(); p.updated = Date.now();
        projects.unshift(p); writeStore(); renderLibrary();
        toast('Imported ' + (p.name || 'project'));
      } catch (err) { toast('That file is not a Character Studio project'); }
    };
    r.readAsText(f);
  };
  $('#newChar').onclick = newCharacterModal;
  $('#btnLibrary').onclick = () => {
    if (libOpen) { $('#lib').hidden = true; libOpen = false; return; }
    saveProject(true); showLibrary();
  };
  $('#interpChk') && ($('#interpChk').onchange = () => { curAnim().interp = $('#interpChk').checked; saveSoon(); });
  $('#btnSave').onclick = () => saveProject(false);
  $('#btnExport').onclick = exportModal;
  $('#pname').oninput = () => { if (proj) { proj.name = $('#pname').value; saveSoon(); } };
  $('#mx').onclick = closeModal;
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  $('#playBtn').onclick = togglePlay;
  $('#stopBtn').onclick = stopPlay;
  $('#animsel').onchange = () => { saveProject(true); proj.curAnim = +$('#animsel').value; viewFrame = 0; syncEditor(); draw(); };
  $('#animAdd').onclick = addAnimationModal;
  $('#animDup').onclick = duplicateAnimation;
  $('#animDel').onclick = deleteAnimation;
  $('#fps').onchange = () => { const v = clamp(+$('#fps').value || 8, 1, 60); curAnim().fps = v; curAnim().frames.forEach(f => { f.dur = Math.round(1000 / v); }); renderFrames(); draw(); saveSoon(); };
  $('#loopChk').onchange = () => { curAnim().loop = $('#loopChk').checked; saveSoon(); };
  $('#speed').oninput = () => { speed = +$('#speed').value / 100; $('#speedLab').textContent = speed.toFixed(1) + '×'; };
  $('#frameAdd').onclick = () => addFrame(false);
  $('#frameDup').onclick = () => addFrame(true);
  $('#frameDel').onclick = deleteFrame;
  $('#dur').onchange = () => { const f = curFrame(); f.dur = clamp(+$('#dur').value || 125, 16, 5000); renderFrames(); saveSoon(); };
  $('#onionChk').onchange = () => { onion = $('#onionChk').checked; $('#btnOnion').setAttribute('aria-pressed', String(onion)); draw(); };
  $('#btnOnion').onclick = () => { onion = !onion; $('#onionChk').checked = onion; $('#btnOnion').setAttribute('aria-pressed', String(onion)); draw(); };
  $('#zoomIn').onclick = () => { zoom = clamp(zoom * 1.15, .2, 8); applyZoom(); };
  $('#zoomOut').onclick = () => { zoom = clamp(zoom / 1.15, .2, 8); applyZoom(); };
  $('#zoomFit').onclick = fitView;
  $('#btnPreview').onclick = () => {
    previewMode = !previewMode;
    $('#btnPreview').setAttribute('aria-pressed', String(previewMode));
    if (previewMode) { if (!playing) togglePlay(); } else stopPlay();
    draw();
  };
  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    $$('#tabs [data-tab]').forEach(x => x.classList.toggle('on', x === b));
    [['Parts', '#tabParts'], ['Draw', '#tabDraw'], ['Layers', '#tabLayers'], ['Colors', '#tabColors'], ['3D', '#tabObj3d']].forEach(([k, id]) => { $(id).hidden = k !== b.dataset.tab; });
  });
  $('#view').addEventListener('pointerdown', canvasDown);
  $('#view').addEventListener('pointermove', canvasMove);
  $('#view').addEventListener('pointerup', canvasUp);
  $('#view').addEventListener('pointercancel', canvasUp);
  $('#view').addEventListener('wheel', canvasWheel, { passive: false });
  $('#view').addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('keydown', keyDown);
  window.addEventListener('resize', () => { fitView(); renderFrames(); });
  window.addEventListener('beforeunload', () => { if (proj) saveProject(true); });

  if (projects.length) {
    let last = null;
    try { last = localStorage.getItem(LAST); } catch (e) {}
    const target = projects.find(p => p.id === last) || projects.slice().sort((a, b) => b.updated - a.updated)[0];
    proj = clone(target);
    dropCaches();
    syncEditor(); requestAnimationFrame(() => { fitView(); draw(); });
  } else {
    showLibrary();
    setBadgeFallback();
  }
}
function setBadgeFallback() {
  $('#styleBadge').textContent = 'No project';
  $('#modeName').textContent = 'Library';
}

/* ================= canvas, 2D renderer ================= */
const view = document.getElementById('view');
let baseScale = 1;

function fitView() {
  if (!proj) return;
  const wrap = $('#canvaswrap');
  const aw = Math.max(80, wrap.clientWidth - 40);
  const ah = Math.max(80, wrap.clientHeight - 40);
  baseScale = Math.max(.05, Math.min(aw / proj.w, ah / proj.h));
  zoom = 1;
  applyZoom();
}
function applyZoom() {
  if (!proj) return;
  const w = Math.max(16, Math.round(proj.w * baseScale * zoom));
  const h = Math.max(16, Math.round(proj.h * baseScale * zoom));
  view.style.width = w + 'px';
  view.style.height = h + 'px';
  updateZoomLabel();
}

function draw() {
  if (!proj) return;
  if (view.width !== proj.w || view.height !== proj.h) { view.width = proj.w; view.height = proj.h; }
  const ctx = view.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, proj.w, proj.h);
  if (is3D()) {
    render3D(ctx, proj.w, proj.h);
  } else {
    const f = (playing && pbFrame) ? pbFrame : curFrame();
    const prev = viewFrame > 0 ? curAnim().frames[viewFrame - 1] : null;
    render2D(ctx, proj.w, proj.h, f, {
      onion: onion && !playing && !previewMode && !!prev,
      onionFrame: prev,
      pose: playing ? pbPose : null
    });
    if (!previewMode && !playing) drawOverlay(ctx);
  }
}

function render2D(ctx, w, h, frame, opts) {
  opts = opts || {};
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (!opts.transparent) { ctx.fillStyle = proj.bg; ctx.fillRect(0, 0, w, h); }
  ctx.setTransform(w / proj.w, 0, 0, h / proj.h, 0, 0);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (opts.onion && opts.onionFrame) {
    ctx.globalAlpha = .22;
    drawRig(ctx, opts.onionFrame.pose || {});
    drawRaster(ctx, opts.onionFrame);
    ctx.globalAlpha = 1;
  }
  drawRig(ctx, opts.pose || frame.pose || {});
  drawRaster(ctx, frame);
  ctx.restore();
}

function drawRig(ctx, pose) {
  if (!proj.parts || !proj.parts.length) return;
  const lk = lookOf();
  const kids = {};
  proj.parts.forEach(p => { (kids[p.parent || 'root'] = kids[p.parent || 'root'] || []).push(p); });
  const rec = part => {
    if (part.visible === false) return;
    const ps = pose[part.id] || {};
    ctx.save();
    ctx.translate(part.x + (+ps.x || 0), part.y + (+ps.y || 0));
    ctx.rotate((+ps.a || 0) * D2R);
    const sx = +ps.sx || 1, sy = +ps.sy || 1;
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    const op = part.opacity == null ? 1 : part.opacity;
    ctx.globalAlpha = ctx.globalAlpha * op;
    if (part.shape && part.shape !== 'none') partShape(ctx, part, lk);
    (kids[part.id] || []).forEach(rec);
    ctx.restore();
  };
  (kids.root || []).forEach(rec);
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function shapePath(ctx, shape, w, h, top, bot) {
  const cx = 0, midY = (top + bot) / 2;
  switch (shape) {
    case 'ellipse':
      ctx.ellipse(cx, midY, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case 'triangle':
      ctx.moveTo(cx, top);
      ctx.lineTo(cx + w / 2, bot);
      ctx.quadraticCurveTo(cx, bot + h * .06, cx - w / 2, bot);
      ctx.closePath();
      break;
    case 'star': {
      const spikes = 5, outer = Math.min(w, h) / 2, inner = outer * .45;
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 ? inner : outer;
        const a = (Math.PI / spikes) * i - Math.PI / 2;
        const x = cx + Math.cos(a) * r, y = midY + Math.sin(a) * r * (h / w || 1);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      break;
    }
    case 'blob': {
      ctx.moveTo(cx - w / 2, bot);
      ctx.bezierCurveTo(cx - w / 2 - 4, top + h * .30, cx - w * .40, top - 4, cx - w * .10, top - 2);
      ctx.bezierCurveTo(cx + w * .18, top - 8, cx + w * .46, top + h * .10, cx + w * .44, top + h * .52);
      ctx.bezierCurveTo(cx + w * .42, bot - h * .12, cx + w * .18, bot + 2, cx, bot);
      ctx.bezierCurveTo(cx - w * .18, bot + 2, cx - w * .44, bot + 2, cx - w / 2, bot);
      ctx.closePath();
      break;
    }
    case 'rect':
      roundRect(ctx, cx - w / 2, top, w, h, Math.min(10, w * .14));
      break;
    case 'capsule':
    default:
      roundRect(ctx, cx - w / 2, top, w, h, Math.min(w, h) / 2);
      break;
  }
}
function partShape(ctx, part, lk) {
  const w = Math.max(1, +part.w || 1), h = Math.max(1, +part.h || 1);
  const a = part.anchor == null ? 0 : +part.anchor;
  const top = -h * a, bot = h * (1 - a);
  ctx.beginPath();
  shapePath(ctx, part.shape, w, h, top, bot);
  ctx.fillStyle = part.color || '#888';
  ctx.fill();
  if (lk.shade > 0 || lk.hl > 0) {
    ctx.save();
    ctx.clip();
    const g = ctx.createLinearGradient(-w / 2, top, w / 2, bot);
    g.addColorStop(0, 'rgba(255,255,255,' + lk.hl + ')');
    g.addColorStop(.45, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(10,14,26,' + lk.shade + ')');
    ctx.fillStyle = g;
    ctx.fillRect(-w, top - 4, w * 2, h + 8);
    ctx.restore();
  }
  if (lk.lw > 0) {
    ctx.strokeStyle = lk.line;
    ctx.lineWidth = lk.lw;
    ctx.stroke();
  }
}

const imgCache = new Map();
function layerSource(layer) {
  if (layer._c) return layer._c;
  if (!layer.src) return null;
  let im = imgCache.get(layer.src);
  if (!im) {
    im = new Image();
    im.onload = () => { if (!playing) draw(); };
    im.src = layer.src;
    imgCache.set(layer.src, im);
    if (imgCache.size > 80) { const k = imgCache.keys().next().value; imgCache.delete(k); }
  }
  return im.complete && im.naturalWidth ? im : null;
}
function drawRaster(ctx, frame) {
  if (!frame || !frame.layers) return;
  frame.layers.forEach(layer => {
    if (layer.visible === false) return;
    const src = layerSource(layer);
    if (!src) return;
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * (layer.opacity == null ? 1 : layer.opacity);
    ctx.drawImage(src, 0, 0, proj.w, proj.h);
    ctx.restore();
  });
}

function renderFrameTo(ctx, w, h, frame, opts) {
  if (is3D()) { render3D(ctx, w, h, Object.assign({ pose: (frame && frame.pose3) || {} }, opts || {})); return; }
  render2D(ctx, w, h, frame, opts || {});
}

function drawOverlay(ctx) {
  ctx.save();
  const lk = '#7c8cff';
  if (sel && sel.kind === 'part') {
    const m = partMatrices(curFrame().pose || {}).find(x => x.part.id === sel.id);
    if (m) {
      const p = m.part, a = p.anchor == null ? 0 : +p.anchor;
      const pts = [[-p.w / 2, -p.h * a], [p.w / 2, -p.h * a], [p.w / 2, p.h * (1 - a)], [-p.w / 2, p.h * (1 - a)]]
        .map(([x, y]) => m.m.transformPoint(new DOMPoint(x, y)));
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.strokeStyle = lk; ctx.lineWidth = 1.5 / Math.max(.4, zoom); ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
      const o = m.m.transformPoint(new DOMPoint(0, 0));
      ctx.beginPath(); ctx.arc(o.x, o.y, 3.5 / Math.max(.4, zoom), 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.strokeStyle = lk; ctx.stroke();
    }
  }
  if (marquee) {
    ctx.strokeStyle = '#2ec4b6'; ctx.lineWidth = 1.4 / Math.max(.4, zoom);
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(marquee.x, marquee.y, marquee.w, marquee.h);
    ctx.setLineDash([]);
  }
  if (pendingShape) {
    ctx.strokeStyle = color; ctx.lineWidth = brushSize; ctx.globalAlpha = brushOpacity;
    const a = pendingShape.a, b = pendingShape.b;
    ctx.beginPath();
    if (pendingShape.tool === 'line') { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    else if (pendingShape.tool === 'rect') ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    else ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, 7);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (drag && drag.mode === 'selmove' && drag.float) {
    ctx.save(); ctx.globalAlpha = .9;
    ctx.drawImage(drag.float, drag.dx, drag.dy);
    ctx.restore();
  }
  ctx.restore();
}

/* ---------- rig maths ---------- */
function partMatrices(pose) {
  pose = pose || {};
  const kids = {};
  (proj.parts || []).forEach(p => { (kids[p.parent || 'root'] = kids[p.parent || 'root'] || []).push(p); });
  const out = [];
  const walk = (part, parent) => {
    const ps = pose[part.id] || {};
    let m = parent.translate(part.x + (+ps.x || 0), part.y + (+ps.y || 0)).rotate(+ps.a || 0);
    out.push({ part, m });
    (kids[part.id] || []).forEach(c => walk(c, m));
  };
  (kids.root || []).forEach(p => walk(p, new DOMMatrix()));
  return out;
}
function findPartAt(pt) {
  const mats = partMatrices(curFrame().pose || {});
  let hit = null;
  mats.forEach(({ part, m }) => {
    if (!part.shape || part.shape === 'none' || part.visible === false) return;
    const a = part.anchor == null ? 0 : +part.anchor;
    const lp = m.inverse().transformPoint(new DOMPoint(pt.x, pt.y));
    if (lp.x >= -part.w / 2 - 3 && lp.x <= part.w / 2 + 3 && lp.y >= -part.h * a - 3 && lp.y <= part.h * (1 - a) + 3) {
      hit = { part, pivot: m.transformPoint(new DOMPoint(0, 0)) };
    }
  });
  return hit;
}

/* ---------- selection ---------- */
function select(kind, id) {
  sel = kind ? { kind, id } : null;
  if (kind === 'layer') activeLayerId = id;
  renderPartsPanel(); renderLayersPanel(); render3DPanel(); renderProps(); draw();
}
const selPart = () => (sel && sel.kind === 'part' ? proj.parts.find(p => p.id === sel.id) : null);
const selNode = () => (sel && sel.kind === 'node' ? proj.nodes.find(n => n.id === sel.id) : null);
const selLayer = () => (sel && sel.kind === 'layer' ? curFrame().layers.find(l => l.id === sel.id) : null);

/* ---------- pose helpers ---------- */
function poseOf(id) {
  const f = curFrame();
  const k = poseField();
  f[k] = f[k] || {};
  f[k][id] = f[k][id] || {};
  return f[k][id];
}
function poseFor(frame, id) {
  const k = poseField();
  frame[k] = frame[k] || {};
  frame[k][id] = frame[k][id] || {};
  return frame[k][id];
}
function setPoseAll(id, key, val) {
  const frames = syncAllPoses ? curAnim().frames : [curFrame()];
  frames.forEach(f => { poseFor(f, id)[key] = val; });
}

/* ---------- painting ---------- */
function activeLayer() {
  const f = curFrame();
  if (!f.layers.length) f.layers.push(newLayer('Paint 1'));
  let l = f.layers.find(x => x.id === activeLayerId) || f.layers[f.layers.length - 1];
  activeLayerId = l.id;
  return l;
}
function layerCtx(layer) {
  if (!layer._c) {
    if (!layer._c) {
      const c = document.createElement('canvas');
      c.width = proj.w; c.height = proj.h;
      layer._c = c;
      if (layer.src) {
        const im = new Image();
        im.onload = () => { c.getContext('2d').drawImage(im, 0, 0, proj.w, proj.h); if (!playing) draw(); };
        im.src = layer.src;
      }
    }
  }
  return layer._c.getContext('2d');
}
function commitLayer(layer) {
  if (!layer || !layer._c) return;
  try { layer.src = layer._c.toDataURL('image/png'); } catch (e) {}
}
function commitFrame(frame) { (frame.layers || []).forEach(commitLayer); }
function canvasPoint(e) {
  const r = view.getBoundingClientRect();
  return { x: (e.clientX - r.left) * proj.w / Math.max(1, r.width), y: (e.clientY - r.top) * proj.h / Math.max(1, r.height) };
}
function stamp(ctx, x, y, size) {
  const s = Math.max(1, size);
  if (s <= 3 || proj.mode === 'pixel') {
    ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), Math.round(s), Math.round(s));
  } else {
    ctx.beginPath(); ctx.arc(x, y, s / 2, 0, 7); ctx.fill();
  }
}
function paintTo(ctx, a, b) {
  ctx.save();
  ctx.globalAlpha = brushOpacity;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = brushSize;
  if (tool === 'eraser') { ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = '#000'; ctx.fillStyle = '#000'; }
  if (proj.mode === 'pixel' || brushSize <= 3) {
    const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy), steps = Math.max(1, Math.ceil(dist / Math.max(1, brushSize * .6)));
    for (let i = 0; i <= steps; i++) stamp(ctx, a.x + dx * i / steps, a.y + dy * i / steps, brushSize);
  } else {
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  ctx.restore();
}

function floodFill(ctx, px, py) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const x = Math.floor(px), y = Math.floor(py);
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  const at = (xx, yy) => (yy * w + xx) * 4;
  const i0 = at(x, y);
  const t = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]];
  const rgb = hexToRgb(color);
  if (!rgb) return;
  if (t[0] === rgb.r && t[1] === rgb.g && t[2] === rgb.b && t[3] === Math.round(brushOpacity * 255)) return;
  const tol = 40 * 40 * 4;
  const seen = new Uint8Array(w * h);
  const stack = [x, y];
  while (stack.length) {
    const cy = stack.pop(), cx = stack.pop();
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
    const p = cy * w + cx;
    if (seen[p]) continue; seen[p] = 1;
    const i = p * 4;
    const dr = d[i] - t[0], dg = d[i + 1] - t[1], db = d[i + 2] - t[2], da = d[i + 3] - t[3];
    if (dr * dr + dg * dg + db * db + da * da > tol) continue;
    d[i] = rgb.r; d[i + 1] = rgb.g; d[i + 2] = rgb.b; d[i + 3] = Math.round(brushOpacity * 255);
    stack.push(cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1);
  }
  ctx.putImageData(img, 0, 0);
}
function hexToRgb(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(h || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: n >> 16, g: n >> 8 & 255, b: n & 255 };
}
function pickColor(pt) {
  const c = document.createElement('canvas'); c.width = proj.w; c.height = proj.h;
  const cx = c.getContext('2d');
  render2D(cx, proj.w, proj.h, curFrame(), { transparent: false });
  try {
    const d = cx.getImageData(clamp(Math.floor(pt.x), 0, proj.w - 1), clamp(Math.floor(pt.y), 0, proj.h - 1), 1, 1).data;
    const hex = '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('');
    setColor(hex);
    toast('Picked ' + hex);
  } catch (e) {}
}
function setColor(hex) {
  color = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex : color;
  $$('#tabColors [data-c]').forEach(b => b.classList.toggle('on', b.dataset.c.toLowerCase() === color.toLowerCase()));
  const ci = $('#cpick'); if (ci) ci.value = color;
  $$('#tabDraw [data-c]').forEach(b => b.classList.toggle('on', b.dataset.c.toLowerCase() === color.toLowerCase()));
}

/* ---------- pointer handling ---------- */
function canvasDown(e) {
  if (!proj) return;
  view.setPointerCapture && view.setPointerCapture(e.pointerId);
  if (is3D()) {
    drag = { mode: 'orbit', x: e.clientX, y: e.clientY, yaw: proj.cam.yaw, pitch: proj.cam.pitch, moved: false };
    return;
  }
  const pt = canvasPoint(e);
  if (e.button === 1) { drag = { mode: 'pan', x: e.clientX, y: e.clientY, sl: $('#canvaswrap').scrollLeft, st: $('#canvaswrap').scrollTop }; return; }
  if (tool === 'select') {
    const hit = findPartAt(pt);
    if (hit) {
      select('part', hit.part.id);
      const ps = poseOf(hit.part.id);
      drag = {
        mode: 'pose', id: hit.part.id, pivot: hit.pivot, pt,
        startAng: Math.atan2(pt.y - hit.pivot.y, pt.x - hit.pivot.x) * R2D,
        baseA: +ps.a || 0, baseX: +ps.x || 0, baseY: +ps.y || 0, moved: false
      };
      pushUndo();
    } else { select(null); }
    draw();
    return;
  }
  if (tool === 'picker') { pickColor(pt); return; }
  if (tool === 'marquee') {
    if (marquee && pt.x > marquee.x && pt.x < marquee.x + marquee.w && pt.y > marquee.y && pt.y < marquee.y + marquee.h) {
      const l = activeLayer(); const ctx = layerCtx(l);
      const sx = Math.round(marquee.x), sy = Math.round(marquee.y), sw = Math.round(marquee.w), sh = Math.round(marquee.h);
      if (sw > 0 && sh > 0) {
        pushUndo();
        const f = document.createElement('canvas'); f.width = sw; f.height = sh;
        f.getContext('2d').putImageData(ctx.getImageData(sx, sy, sw, sh), 0, 0);
        ctx.clearRect(sx, sy, sw, sh);
        drag = { mode: 'selmove', layer: l, pt, float: f, dx: sx, dy: sy, ox: sx, oy: sy };
      }
    } else {
      marquee = { x: pt.x, y: pt.y, w: 0, h: 0 };
      drag = { mode: 'marquee', pt };
    }
    draw();
    return;
  }
  if (tool === 'line' || tool === 'rect' || tool === 'ellipse') {
    pendingShape = { tool, a: pt, b: pt };
    drag = { mode: 'shape', pt };
    draw();
    return;
  }
  // brush / eraser / fill
  const l = activeLayer();
  const ctx = layerCtx(l);
  pushUndo();
  if (tool === 'fill') {
    floodFill(ctx, pt.x, pt.y);
    commitLayer(l);
    draw(); renderFramesSoon(); saveSoon();
    return;
  }
  drag = { mode: 'paint', layer: l, ctx, last: pt };
  paintTo(ctx, pt, pt);
  draw();
}

function canvasMove(e) {
  if (!proj) return;
  const pt = is3D() ? null : canvasPoint(e);
  if (pt) $('#posLab').textContent = Math.round(pt.x) + ', ' + Math.round(pt.y);
  if (!drag) return;
  if (drag.mode === 'orbit') {
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) drag.moved = true;
    proj.cam.yaw = drag.yaw + (e.clientX - drag.x) * .55;
    proj.cam.pitch = clamp(drag.pitch + (e.clientY - drag.y) * .4, -70, 80);
    draw(); return;
  }
  if (drag.mode === 'pan') {
    const w = $('#canvaswrap');
    w.scrollLeft = drag.sl - (e.clientX - drag.x); w.scrollTop = drag.st - (e.clientY - drag.y);
    return;
  }
  if (drag.mode === 'pose') {
    const ps = poseOf(drag.id);
    if (e.shiftKey) {
      const dx = (pt.x - drag.pt.x), dy = (pt.y - drag.pt.y);
      ps.x = Math.round(drag.baseX + dx); ps.y = Math.round(drag.baseY + dy);
    } else {
      const ang = Math.atan2(pt.y - drag.pivot.y, pt.x - drag.pivot.x) * R2D;
      let a = drag.baseA + (ang - drag.startAng);
      a = ((a + 180) % 360 + 360) % 360 - 180;
      ps.a = Math.round(a);
    }
    drag.moved = true;
    draw();
    const ai = $('#pAngle'); if (ai) ai.value = Math.round(+ps.a || 0);
    const xi = $('#pX'); if (xi) xi.value = Math.round(+ps.x || 0);
    const yi = $('#pY'); if (yi) yi.value = Math.round(+ps.y || 0);
    return;
  }
  if (drag.mode === 'paint') {
    paintTo(drag.ctx, drag.last, pt);
    drag.last = pt;
    draw(); return;
  }
  if (drag.mode === 'shape') {
    pendingShape.b = pt; draw(); return;
  }
  if (drag.mode === 'marquee') {
    marquee = { x: Math.min(drag.pt.x, pt.x), y: Math.min(drag.pt.y, pt.y), w: Math.abs(pt.x - drag.pt.x), h: Math.abs(pt.y - drag.pt.y) };
    draw(); return;
  }
  if (drag.mode === 'selmove') {
    drag.dx = drag.ox + (pt.x - drag.pt.x); drag.dy = drag.oy + (pt.y - drag.pt.y);
    draw(); return;
  }
}

function canvasUp(e) {
  if (!drag) return;
  const d = drag; drag = null;
  if (d.mode === 'orbit') {
    if (!d.moved && e) {
      const hit = pickNode(e.clientX, e.clientY);
      select(hit ? 'node' : null, hit ? hit.id : null);
    }
    saveSoon(); return;
  }
  if (d.mode === 'pose') {
    if (d.moved) { renderFramesSoon(); renderProps(); saveSoon(); }
    return;
  }
  if (d.mode === 'paint') {
    commitLayer(d.layer); renderFramesSoon(); saveSoon();
    $('#emptyHint').hidden = true;
    draw(); return;
  }
  if (d.mode === 'shape') {
    if (pendingShape) {
      const { a, b } = pendingShape;
      const l = activeLayer(), ctx = layerCtx(l);
      pushUndo();
      ctx.save(); ctx.globalAlpha = brushOpacity; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = brushSize; ctx.lineCap = 'round';
      ctx.beginPath();
      if (pendingShape.tool === 'line') { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      else if (pendingShape.tool === 'rect') { ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); ctx.fill(); }
      else { ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, 7); ctx.fill(); }
      ctx.restore();
      commitLayer(l); renderFramesSoon(); saveSoon();
      pendingShape = null;
    }
    draw(); return;
  }
  if (d.mode === 'marquee') { draw(); return; }
  if (d.mode === 'selmove') {
    const ctx = layerCtx(d.layer);
    ctx.drawImage(d.float, d.dx, d.dy);
    marquee = { x: d.dx, y: d.dy, w: d.float.width, h: d.float.height };
    commitLayer(d.layer); renderFramesSoon(); saveSoon();
    draw(); return;
  }
}

function canvasWheel(e) {
  if (!proj) return;
  e.preventDefault();
  if (is3D()) {
    proj.cam.dist = clamp(proj.cam.dist * (e.deltaY > 0 ? 1.08 : .93), 1.8, 14);
    draw(); saveSoon(); return;
  }
  zoom = clamp(zoom * (e.deltaY > 0 ? .92 : 1.08), .2, 8);
  applyZoom();
}

/* ---------- part kit ---------- */
const KIT = [
  ['Head', 'ellipse', 84, 92, 1], ['Hair', 'blob', 94, 68, 1], ['Eye', 'ellipse', 13, 15, .5],
  ['Brow', 'capsule', 20, 5, .5], ['Nose', 'capsule', 8, 14, .5], ['Mouth', 'capsule', 24, 7, .5],
  ['Ear', 'ellipse', 18, 26, .5], ['Torso', 'capsule', 92, 120, 1], ['Arm', 'capsule', 24, 78, 0],
  ['Forearm', 'capsule', 20, 62, 0], ['Hand', 'ellipse', 24, 26, .5], ['Leg', 'capsule', 30, 88, 0],
  ['Shin', 'capsule', 26, 78, 0], ['Foot', 'capsule', 36, 20, .5], ['Tail', 'capsule', 18, 90, 0],
  ['Wing', 'triangle', 80, 110, 1], ['Horn', 'triangle', 22, 44, 0], ['Animal ear', 'triangle', 30, 34, 1],
  ['Fang', 'triangle', 10, 14, .5], ['Antenna', 'capsule', 6, 40, 0], ['Claw', 'triangle', 16, 22, 0],
  ['Cape', 'blob', 120, 180, 1], ['Hat', 'capsule', 96, 26, .5], ['Helmet', 'capsule', 94, 46, 1],
  ['Weapon', 'rect', 12, 120, 0], ['Shield', 'ellipse', 62, 78, .5], ['Robot eye', 'ellipse', 22, 16, .5],
  ['Star', 'star', 60, 60, .5]
];
function partTree() {
  const kids = {};
  proj.parts.forEach(p => { (kids[p.parent || 'root'] = kids[p.parent || 'root'] || []).push(p); });
  const out = [];
  const rec = (id, d) => (kids[id] || []).forEach(p => { out.push({ p, d }); rec(p.id, d + 1); });
  rec('root', 0);
  return out;
}
function addPart(name) {
  const t = KIT.find(k => k[0] === name) || KIT[0];
  const parent = selPart();
  pushUndo();
  const part = {
    id: uid(), name: t[0], parent: parent ? parent.id : null, shape: t[1],
    x: parent ? 0 : 210, y: parent ? 0 : 372,
    w: t[2], h: t[3], color: color, anchor: t[4], opacity: 1, visible: true
  };
  proj.parts.push(part);
  select('part', part.id);
  renderFramesSoon(); saveSoon();
  toast('Added ' + t[0]);
}
function deletePart(id) {
  const ids = new Set();
  const rec = i => { ids.add(i); proj.parts.filter(p => p.parent === i).forEach(p => rec(p.id)); };
  rec(id);
  pushUndo();
  proj.parts = proj.parts.filter(p => !ids.has(p.id));
  sel = null;
  select(null); renderFramesSoon(); saveSoon();
  toast(ids.size > 1 ? 'Removed part and its children' : 'Removed part');
}
function duplicatePart(id) {
  const src = proj.parts.find(p => p.id === id);
  if (!src) return;
  pushUndo();
  const ids = {};
  const group = [];
  const rec = p => { group.push({ p, copy: Object.assign({}, p, { id: uid() }) }); proj.parts.filter(c => c.parent === p.id).forEach(rec); };
  rec(src);
  group.forEach(({ p, copy }) => { ids[p.id] = copy.id; });
  group.forEach(({ p, copy }) => { copy.parent = p.parent ? (ids[p.parent] || p.parent) : null; copy.x = p === src ? p.x + 14 : p.x; copy.y = p === src ? p.y + 14 : p.y; proj.parts.push(copy); });
  select('part', ids[src.id]);
  renderFramesSoon(); saveSoon();
}

/* ---------- panels ---------- */
function renderPartsPanel() {
  const box = $('#tabParts');
  if (!proj) { box.innerHTML = ''; return; }
  if (is3D()) {
    box.innerHTML = `<h3>Parts</h3><p class="hint">3D characters are built from solid primitives. Use the <b>3D</b> tab to add boxes, spheres and cylinders, then pose them in the timeline.</p>
      <p class="hint">Orbit the scene by dragging the canvas, and scroll to zoom.</p>`;
    return;
  }
  const rows = partTree().map(({ p, d }) => `<div class="partrow${sel && sel.id === p.id ? ' on' : ''}" data-pid="${p.id}" style="margin-left:${d * 10}px">
      <i style="background:${p.color}"></i><span>${esc(p.name)}</span><b>${p.shape === 'none' ? 'joint' : esc(p.shape)}</b></div>`).join('') || '<p class="hint">No parts yet. Add one below to start a rig.</p>';
  box.innerHTML = `<h3>Rig parts</h3>${rows}
    <div class="grp"><h3>Add part</h3>
      <div class="field"><select id="kitSel" aria-label="Part to add">${KIT.map(k => `<option>${k[0]}</option>`).join('')}</select></div>
      <button class="btn wide" id="kitAdd" type="button">+ Add part</button>
      <p class="hint" style="margin-top:8px">New parts attach to the selected part. Drag a part on the canvas to rotate it, Shift-drag to move it.</p>
      <button class="btn wide ghost" id="rigBlank" type="button">Clear rig</button>
    </div>`;
  box.querySelectorAll('[data-pid]').forEach(r => r.onclick = () => select('part', r.dataset.pid));
  $('#kitAdd').onclick = () => addPart($('#kitSel').value);
  $('#rigBlank').onclick = () => confirmModal('Clear the rig?', 'Every part is removed. You can undo this with Ctrl+Z.', () => {
    pushUndo(); proj.parts = []; sel = null; select(null); renderFramesSoon(); saveSoon();
  });
}

function renderDrawPanel() {
  const box = $('#tabDraw');
  if (!proj) { box.innerHTML = ''; return; }
  if (is3D()) {
    box.innerHTML = `<h3>Tools</h3><p class="hint">The 3D editor uses primitive objects and keyframed rotation. Drag on the canvas to orbit the camera, scroll to zoom.</p>`;
    return;
  }
  const tools = [
    ['select', '✥', 'Select / pose'], ['brush', '✎', 'Brush'], ['eraser', '⌫', 'Eraser'], ['fill', '◧', 'Fill bucket'],
    ['picker', '⊙', 'Colour picker'], ['line', '╱', 'Line'], ['rect', '▭', 'Rectangle'], ['ellipse', '◯', 'Ellipse'],
    ['marquee', '⬚', 'Select area']
  ];
  box.innerHTML = `<h3>Tools</h3>
    <div class="toolgrid">${tools.map(([k, i, t]) => `<button class="tool${tool === k ? ' on' : ''}" data-tool="${k}" type="button" title="${t}">${i}</button>`).join('')}</div>
    <p class="hint" style="margin-top:8px" id="toolHint">${tools.find(t => t[0] === tool)[2]}</p>
    <div class="grp"><h3>Brush</h3>
      <div class="field"><label for="bsize">Size</label><input id="bsize" type="range" min="1" max="40" value="${brushSize}"></div>
      <div class="field"><label for="bop">Opacity</label><input id="bop" type="range" min="10" max="100" value="${Math.round(brushOpacity * 100)}"></div>
      <div class="field"><label for="bcol">Colour</label><input id="bcol" type="color" value="${color}"></div>
      <div class="swatches">${proj.pal.map(c => `<button data-c="${c}" style="background:${c}" title="${c}" aria-label="Use ${c}"></button>`).join('')}</div>
    </div>
    <div class="grp"><h3>Paint layers</h3><div id="drawLayers"></div>
      <button class="btn wide" id="dAddLayer" type="button">+ Add layer</button>
      <p class="hint" style="margin-top:8px">Paint goes on the selected layer of the current frame. In Pixel style keep the brush at 1–2 px for clean pixels.</p>
    </div>`;
  box.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => {
    tool = b.dataset.tool;
    view.classList.toggle('cross', tool !== 'select');
    view.classList.toggle('grab', tool === 'select');
    renderDrawPanel(); draw();
  });
  box.querySelectorAll('[data-c]').forEach(b => b.onclick = () => setColor(b.dataset.c));
  $('#bsize').oninput = e => { brushSize = +e.target.value; };
  $('#bop').oninput = e => { brushOpacity = +e.target.value / 100; };
  $('#bcol').oninput = e => setColor(e.target.value);
  $('#dAddLayer').onclick = () => addLayer();
  renderLayerList($('#drawLayers'), true);
}

function renderLayersPanel() {
  const box = $('#tabLayers');
  if (!proj) { box.innerHTML = ''; return; }
  if (is3D()) { box.innerHTML = `<h3>Layers</h3><p class="hint">3D scenes are made of objects; manage them in the 3D tab.</p>`; return; }
  box.innerHTML = `<h3>Layers · frame ${viewFrame + 1}</h3><div id="layerList"></div>
    <button class="btn wide" id="lAdd" type="button">+ Add layer</button>
    <p class="hint" style="margin-top:8px">Layers belong to the current frame. Painting on a new layer keeps previous work editable.</p>
    <div class="grp"><h3>Frame</h3>
      <button class="btn wide" id="lDup" type="button">Duplicate frame</button>
      <button class="btn wide" id="lClear" type="button" style="margin-top:6px">Clear all layers</button>
    </div>`;
  renderLayerList($('#layerList'), false);
  $('#lAdd').onclick = addLayer;
  $('#lDup').onclick = () => addFrame(true);
  $('#lClear').onclick = () => {
    pushUndo();
    curFrame().layers.forEach(l => { if (l._c) l._c.getContext('2d').clearRect(0, 0, proj.w, proj.h); l.src = null; });
    draw(); renderFramesSoon(); saveSoon();
  };
}
function renderLayerList(box, compact) {
  if (!box) return;
  const f = curFrame();
  if (!f.layers.length) { box.innerHTML = '<p class="hint">No paint layer. Add one to draw.</p>'; return; }
  box.innerHTML = f.layers.slice().reverse().map(l => `<div class="layrow${activeLayerId === l.id ? ' on' : ''}" data-lid="${l.id}">
      <button class="eye" data-vis="${l.id}" title="Show or hide">${l.visible === false ? '◌' : '◉'}</button>
      <span>${esc(l.name)}</span>${compact ? '' : `<b class="mini">${Math.round((l.opacity == null ? 1 : l.opacity) * 100)}%</b>`}</div>`).join('');
  box.querySelectorAll('[data-lid]').forEach(r => r.onclick = e => {
    if (e.target.dataset.vis) return;
    activeLayerId = r.dataset.lid; select('layer', activeLayerId);
  });
  box.querySelectorAll('[data-vis]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const l = f.layers.find(x => x.id === b.dataset.vis);
    if (l) { l.visible = l.visible === false; draw(); renderLayerList(box, compact); saveSoon(); }
  });
}
function addLayer() {
  pushUndo();
  const f = curFrame();
  const l = newLayer('Paint ' + (f.layers.length + 1));
  f.layers.push(l);
  activeLayerId = l.id;
  select('layer', l.id);
  renderLayersPanel(); renderDrawPanel(); draw(); saveSoon();
}

function renderColorsPanel() {
  const box = $('#tabColors');
  if (!proj) { box.innerHTML = ''; return; }
  box.innerHTML = `<h3>Colour</h3>
    <div class="field"><label for="cpick">Current</label><input id="cpick" type="color" value="${color}"></div>
    <div class="swatches">${proj.pal.map(c => `<button data-c="${c}" style="background:${c}" title="${c}"></button>`).join('')}</div>
    <button class="btn wide" id="cAdd" type="button">Add current colour to palette</button>
    <div class="grp"><h3>Canvas</h3>
      <div class="field"><label for="cbg">Background</label><input id="cbg" type="color" value="${/^#[0-9a-f]{6}$/i.test(proj.bg) ? proj.bg : '#ffffff'}"></div>
      <p class="hint">Background colour is used in the editor and in opaque exports.</p>
    </div>
    <div class="grp"><h3>Palette</h3><button class="btn wide ghost" id="cReset" type="button">Reset palette to style default</button></div>`;
  box.querySelectorAll('[data-c]').forEach(b => b.onclick = () => setColor(b.dataset.c));
  $('#cpick').oninput = e => setColor(e.target.value);
  $('#cAdd').onclick = () => {
    if (!proj.pal.includes(color)) proj.pal.push(color);
    renderColorsPanel(); renderDrawPanel(); saveSoon(); toast('Colour added');
  };
  $('#cbg').oninput = e => { proj.bg = e.target.value; draw(); renderFramesSoon(); saveSoon(); };
  $('#cReset').onclick = () => { proj.pal = (STYLES[proj.style] || STYLES.cartoon).pal.slice(); renderColorsPanel(); renderDrawPanel(); saveSoon(); };
}

function renderProps() {
  if (!proj) { $('#props').innerHTML = '<p class="empty">Open a character to edit it.</p>'; return; }
  if (is3D()) { renderProps3D(); return; }
  const p = selPart();
  if (p) {
    const ps = poseOf(p.id);
    $('#props').innerHTML = `<h3>Part</h3>
      <div class="selhead"><span class="sw" style="background:${p.color}"></span><div><b>${esc(p.name)}</b><small>${esc(p.shape)}</small></div></div>
      <div class="field"><label for="pName">Name</label><input id="pName" type="text" value="${esc(p.name)}"></div>
      <div class="field"><label for="pShape">Shape</label><select id="pShape">${['capsule', 'ellipse', 'rect', 'triangle', 'blob', 'star', 'none'].map(s => `<option value="${s}"${p.shape === s ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="field"><label for="pColor">Colour</label><input id="pColor" type="color" value="${/^#[0-9a-f]{6}$/i.test(p.color) ? p.color : '#888888'}"></div>
      <div class="field"><label for="pW">Width</label><input id="pW" type="number" value="${p.w}" min="1" max="2000"></div>
      <div class="field"><label for="pH">Height</label><input id="pH" type="number" value="${p.h}" min="1" max="2000"></div>
      <div class="field"><label for="pAnchor">Anchor</label><input id="pAnchor" type="range" min="0" max="1" step=".05" value="${p.anchor == null ? 0 : p.anchor}"></div>
      <div class="field"><label for="pAngle">Angle</label><input id="pAngle" type="number" value="${Math.round(+ps.a || 0)}" step="5"></div>
      <div class="field"><label for="pX">Offset X</label><input id="pX" type="number" value="${Math.round(+ps.x || 0)}"></div>
      <div class="field"><label for="pY">Offset Y</label><input id="pY" type="number" value="${Math.round(+ps.y || 0)}"></div>
      <div class="field"><label for="pOp">Opacity</label><input id="pOp" type="range" min="0" max="100" value="${Math.round((p.opacity == null ? 1 : p.opacity) * 100)}"></div>
      <div class="field"><label for="pVis">Visible</label><input id="pVis" type="checkbox"${p.visible === false ? '' : ' checked'}></div>
      <div class="field"><label for="pSync">Pose all frames</label><input id="pSync" type="checkbox"${syncAllPoses ? ' checked' : ''}></div>
      <div class="grp">
        <button class="btn wide" id="pDup" type="button">Duplicate part</button>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="btn" id="pUp" type="button" style="flex:1">Raise</button>
          <button class="btn" id="pDown" type="button" style="flex:1">Lower</button>
        </div>
        <button class="btn wide danger" id="pDel" type="button" style="margin-top:6px">Delete part</button>
      </div>
      <p class="hint">Angle, offset and scale are keyed on the current frame. Tick “Pose all frames” to edit the rest pose.</p>`;
    const upd = () => { draw(); renderFramesSoon(); saveSoon(); };
    $('#pName').onchange = e => { p.name = e.target.value.trim() || p.name; renderPartsPanel(); upd(); };
    $('#pShape').onchange = e => { p.shape = e.target.value; upd(); renderProps(); };
    $('#pColor').oninput = e => { p.color = e.target.value; renderPartsPanel(); upd(); };
    $('#pW').oninput = e => { p.w = clamp(+e.target.value || 1, 1, 2000); upd(); };
    $('#pH').oninput = e => { p.h = clamp(+e.target.value || 1, 1, 2000); upd(); };
    $('#pAnchor').oninput = e => { p.anchor = +e.target.value; upd(); };
    $('#pAngle').oninput = e => { setPoseAll(p.id, 'a', +e.target.value || 0); upd(); };
    $('#pX').oninput = e => { setPoseAll(p.id, 'x', +e.target.value || 0); upd(); };
    $('#pY').oninput = e => { setPoseAll(p.id, 'y', +e.target.value || 0); upd(); };
    $('#pOp').oninput = e => { p.opacity = +e.target.value / 100; upd(); };
    $('#pVis').onchange = e => { p.visible = e.target.checked; upd(); };
    $('#pSync').onchange = e => { syncAllPoses = e.target.checked; };
    $('#pDup').onclick = () => duplicatePart(p.id);
    $('#pDel').onclick = () => deletePart(p.id);
    $('#pUp').onclick = () => movePart(p, -1);
    $('#pDown').onclick = () => movePart(p, 1);
    return;
  }
  const l = selLayer();
  if (l) {
    $('#props').innerHTML = `<h3>Layer</h3>
      <div class="selhead"><span class="sw" style="background:#2a3346"></span><div><b>${esc(l.name)}</b><small>frame ${viewFrame + 1}</small></div></div>
      <div class="field"><label for="lName">Name</label><input id="lName" type="text" value="${esc(l.name)}"></div>
      <div class="field"><label for="lOp">Opacity</label><input id="lOp" type="range" min="0" max="100" value="${Math.round((l.opacity == null ? 1 : l.opacity) * 100)}"></div>
      <div class="field"><label for="lVis">Visible</label><input id="lVis" type="checkbox"${l.visible === false ? '' : ' checked'}></div>
      <div class="grp"><button class="btn wide danger" id="lDel" type="button">Delete layer</button></div>`;
    $('#lName').onchange = e => { l.name = e.target.value.trim() || l.name; renderLayersPanel(); renderDrawPanel(); saveSoon(); };
    $('#lOp').oninput = e => { l.opacity = +e.target.value / 100; draw(); saveSoon(); };
    $('#lVis').onchange = e => { l.visible = e.target.checked; draw(); renderLayerList($('#drawLayers'), true); saveSoon(); };
    $('#lDel').onclick = () => {
      pushUndo();
      const f = curFrame();
      f.layers = f.layers.filter(x => x.id !== l.id);
      if (!f.layers.length) f.layers.push(newLayer('Paint 1'));
      activeLayerId = f.layers[f.layers.length - 1].id;
      sel = null; select(null); renderDrawPanel(); draw(); renderFramesSoon(); saveSoon();
    };
    return;
  }
  $('#props').innerHTML = `<h3>Character</h3>
    <div class="kv"><span>Style</span><b>${(STYLES[proj.style] || STYLES.cartoon).n}</b></div>
    <div class="kv"><span>Canvas</span><b>${proj.w} × ${proj.h}</b></div>
    <div class="kv"><span>Parts</span><b>${proj.parts.length}</b></div>
    <div class="kv"><span>Animations</span><b>${proj.anims.length}</b></div>
    <div class="kv"><span>Frame</span><b>${viewFrame + 1} of ${curAnim().frames.length}</b></div>
    <p class="hint" style="margin-top:12px">Select a part on the canvas to edit its shape, colour and pose. Select a paint layer to change its opacity.</p>
    <div class="grp"><h3>Shortcuts</h3>
      <div class="kv"><span>Select / pose</span><b>V</b></div>
      <div class="kv"><span>Brush</span><b>B</b></div>
      <div class="kv"><span>Eraser</span><b>E</b></div>
      <div class="kv"><span>Fill</span><b>G</b></div>
      <div class="kv"><span>Picker</span><b>I</b></div>
      <div class="kv"><span>Undo / redo</span><b>Ctrl+Z / Y</b></div>
      <div class="kv"><span>Frame</span><b>← →</b></div>
      <div class="kv"><span>Play / pause</span><b>Space</b></div>
    </div>`;
}

function movePart(p, dir) {
  const sibs = proj.parts.filter(x => x.parent === p.parent);
  const i = sibs.indexOf(p), j = i + dir;
  if (j < 0 || j >= sibs.length) return;
  const a = proj.parts.indexOf(sibs[i]), b = proj.parts.indexOf(sibs[j]);
  proj.parts[a] = sibs[j]; proj.parts[b] = p;
  pushUndo();
  draw(); renderPartsPanel(); saveSoon();
}

/* ================= 3D ================= */
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
  rx(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1]; },
  ry(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1]; },
  rz(a) { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },
  pt(m, p) {
    return {
      x: m[0] * p.x + m[1] * p.y + m[2] * p.z + m[3],
      y: m[4] * p.x + m[5] * p.y + m[6] * p.z + m[7],
      z: m[8] * p.x + m[9] * p.y + m[10] * p.z + m[11]
    };
  },
  dir(m, p) {
    return {
      x: m[0] * p.x + m[1] * p.y + m[2] * p.z,
      y: m[4] * p.x + m[5] * p.y + m[6] * p.z,
      z: m[8] * p.x + m[9] * p.y + m[10] * p.z
    };
  }
};

const GEO = { box: makeBox(), sphere: makeSphere(10, 6), cyl: makeCyl(10) };
function makeBox() {
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
function makeSphere(seg, rings) {
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
function makeCyl(seg) {
  const v = [], n = [], idx = [];
  for (let i = 0; i < seg; i++) {
    const a = 2 * Math.PI * i / seg;
    const nx = Math.cos(a), nz = Math.sin(a);
    const base = v.length;
    v.push(nx * .5, -.5, nz * .5, nx, 0, nz);
    v.push(nx * .5, .5, nz * .5, nx, 0, nz);
    if (i > 0) idx.push(base - 2, base, base - 1, base - 1, base, base + 1);
  }
  const capA = v.length / 3;
  v.push(0, .5, 0); n.push(0, 1, 0);
  for (let i = 0; i < seg; i++) { const a = 2 * Math.PI * i / seg; v.push(Math.cos(a) * .5, .5, Math.sin(a) * .5); n.push(0, 1, 0); }
  for (let i = 0; i < seg; i++) idx.push(capA, capA + 1 + i, capA + 1 + (i + 1) % seg);
  const capB = v.length / 3;
  v.push(0, -.5, 0); n.push(0, -1, 0);
  for (let i = 0; i < seg; i++) { const a = 2 * Math.PI * i / seg; v.push(Math.cos(a) * .5, -.5, Math.sin(a) * .5); n.push(0, -1, 0); }
  for (let i = 0; i < seg; i++) idx.push(capB, capB + 1 + (i + 1) % seg, capB + 1 + i);
  return { v, n, idx };
}

function camSpace(p, cam) {
  const yaw = cam.yaw * D2R, pitch = cam.pitch * D2R;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const x1 = p.x * cy - p.z * sy;
  const z1 = p.x * sy + p.z * cy;
  const y1 = p.y * cp - z1 * sp;
  const z2 = p.y * sp + z1 * cp;
  return { x: x1, y: y1, z: z2 + cam.dist };
}
function shadeHex(hex, k) {
  const rgb = hexToRgb(hex) || { r: 150, g: 150, b: 150 };
  const f = v => clamp(Math.round(v * k), 0, 255);
  return 'rgb(' + f(rgb.r) + ',' + f(rgb.g) + ',' + f(rgb.b) + ')';
}
function nodeWorlds(pose, rotOut) {
  const kids = {}, map = {};
  pose = pose || {};
  proj.nodes.forEach(n => { (kids[n.parent || 'root'] = kids[n.parent || 'root'] || []).push(n); });
  const rec = (n, parent, prot) => {
    const p = pose[n.id] || {};
    const rx = M4.rx(((+n.rx || 0) + (+p.rx || 0)) * D2R);
    const ry = M4.ry(((+n.ry || 0) + (+p.ry || 0)) * D2R);
    const rz = M4.rz(((+n.rz || 0) + (+p.rz || 0)) * D2R);
    let base = M4.mul(parent, M4.trans(+n.x || 0, +n.y || 0, +n.z || 0));
    base = M4.mul(M4.mul(M4.mul(base, rx), ry), rz);
    if (rotOut) rotOut[n.id] = M4.mul(M4.mul(M4.mul(prot, rx), ry), rz);
    map[n.id] = M4.mul(base, M4.scale(+n.w || 1, +n.h || 1, +n.d || 1));
    (kids[n.id] || []).forEach(c => rec(c, base, rotOut ? rotOut[n.id] : null));
  };
  (kids.root || []).forEach(n => rec(n, M4.id(), M4.id()));
  return map;
}
function pose3Now() {
  if (playing) return pbPose3 || (pbFrame ? (pbFrame.pose3 || {}) : {});
  return curFrame().pose3 || {};
}
function render3D(ctx, w, h, opts) {
  opts = opts || {};
  const cam = proj.cam;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (!opts.transparent) {
    ctx.fillStyle = proj.bg;
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w * .5, h * .26, 10, w * .5, h * .3, Math.max(w, h) * .7);
    g.addColorStop(0, 'rgba(120,146,255,.16)');
    g.addColorStop(1, 'rgba(0,0,0,.28)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  const f = h * 1.06, cx = w / 2, cy = h * .56, ty = cam.target == null ? 1.05 : cam.target;
  const pose = opts.pose || pose3Now();
  const rots = {};
  const worlds = nodeWorlds(pose, rots);
  const light = { x: .42, y: .78, z: .46 };
  const faces = [], selected = [];
  proj.nodes.forEach(node => {
    if (node.visible === false || !node.shape || node.shape === 'none') return;
    const geo = GEO[node.shape] || GEO.box;
    const m = worlds[node.id];
    if (!m) return;
    const rot = rots[node.id] || M4.id();
    for (let i = 0; i < geo.idx.length; i += 3) {
      const pts = [], norms = [];
      for (let k = 0; k < 3; k++) {
        const vi = geo.idx[i + k] * 3;
        const wp = M4.pt(m, { x: geo.v[vi], y: geo.v[vi + 1], z: geo.v[vi + 2] });
        pts.push(camSpace(wp, cam));
        norms.push(M4.dir(rot, { x: geo.n[vi], y: geo.n[vi + 1], z: geo.n[vi + 2] }));
      }
      if (pts.some(p => p.z <= .05)) continue;
      const n = norms[0];
      const l = Math.max(0, n.x * light.x + n.y * light.y + n.z * light.z);
      const k = .54 + .58 * l;
      const scr = pts.map(p => ({ x: cx + p.x * f / p.z, y: cy - (p.y - ty) * f / p.z }));
      const depth = (pts[0].z + pts[1].z + pts[2].z) / 3;
      const face = { scr, depth, color: shadeHex(node.color, k) };
      if (sel && sel.kind === 'node' && node.id === sel.id) selected.push(face);
      faces.push(face);
    }
  });
  const c0 = camSpace({ x: 0, y: 0, z: 0 }, cam);
  if (c0.z > .2) {
    const px = cx + c0.x * f / c0.z, py = cy - (c0.y - ty) * f / c0.z;
    const rx = f / c0.z * .95, ry = rx * .2;
    const sg = ctx.createRadialGradient(px, py, 1, px, py, rx);
    sg.addColorStop(0, 'rgba(0,0,0,.45)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save(); ctx.translate(px, py); ctx.scale(1, ry / rx); ctx.translate(-px, -py);
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(px, py, rx, 0, 7); ctx.fill(); ctx.restore();
  }
  faces.sort((a, b) => b.depth - a.depth);
  faces.forEach(fa => {
    ctx.beginPath();
    ctx.moveTo(fa.scr[0].x, fa.scr[0].y);
    ctx.lineTo(fa.scr[1].x, fa.scr[1].y);
    ctx.lineTo(fa.scr[2].x, fa.scr[2].y);
    ctx.closePath();
    ctx.fillStyle = fa.color;
    ctx.fill();
    ctx.strokeStyle = fa.color;
    ctx.lineWidth = .7;
    ctx.stroke();
  });
  selected.forEach(fa => {
    ctx.beginPath();
    ctx.moveTo(fa.scr[0].x, fa.scr[0].y);
    ctx.lineTo(fa.scr[1].x, fa.scr[1].y);
    ctx.lineTo(fa.scr[2].x, fa.scr[2].y);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(124,140,255,.9)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  });
  ctx.restore();
}
function nodeScreen(n, w, h) {
  const worlds = nodeWorlds(pose3Now());
  const m = worlds[n.id];
  if (!m) return null;
  const f = h * 1.06, ty = proj.cam.target == null ? 1.05 : proj.cam.target;
  const cp = camSpace({ x: m[3], y: m[7], z: m[11] }, proj.cam);
  if (cp.z <= .1) return null;
  return { x: w / 2 + cp.x * f / cp.z, y: h * .56 - (cp.y - ty) * f / cp.z };
}
function pickNode(clientX, clientY) {
  const r = view.getBoundingClientRect();
  const lx = (clientX - r.left) * proj.w / Math.max(1, r.width);
  const ly = (clientY - r.top) * proj.h / Math.max(1, r.height);
  let best = null, bd = 48 * 48;
  proj.nodes.forEach(n => {
    if (!n.shape || n.shape === 'none') return;
    const p = nodeScreen(n, proj.w, proj.h);
    if (!p) return;
    const d = (p.x - lx) ** 2 + (p.y - ly) ** 2;
    if (d < bd) { bd = d; best = n; }
  });
  return best;
}

function render3DPanel() {
  const box = $('#tabObj3d');
  if (!proj) { box.innerHTML = ''; return; }
  if (!is3D()) {
    box.innerHTML = `<h3>3D</h3><p class="hint">This character is ${esc((STYLES[proj.style] || {}).n || '2D')}. Create a character with a 3D style to build models from primitives, or keep drawing here.</p>`;
    return;
  }
  const kids = {};
  proj.nodes.forEach(n => { (kids[n.parent || 'root'] = kids[n.parent || 'root'] || []).push(n); });
  const rows = [];
  const rec = (id, d) => (kids[id] || []).forEach(n => { rows.push({ n, d }); rec(n.id, d + 1); });
  rec('root', 0);
  box.innerHTML = `<h3>Scene objects</h3>${rows.map(({ n, d }) => `<div class="partrow${sel && sel.id === n.id ? ' on' : ''}" data-nid="${n.id}" style="margin-left:${d * 10}px">
      <i style="background:${n.color}"></i><span>${esc(n.name)}</span><b>${esc(n.shape)}</b></div>`).join('') || '<p class="hint">No objects yet.</p>'}
    <div class="grp"><h3>Add primitive</h3>
      <div class="toolgrid" style="grid-template-columns:repeat(3,1fr)">
        <button class="tool" data-add="box" type="button" title="Add box">▣</button>
        <button class="tool" data-add="sphere" type="button" title="Add sphere">●</button>
        <button class="tool" data-add="cyl" type="button" title="Add cylinder">▮</button>
      </div>
      <p class="hint" style="margin-top:8px">Objects attach to the selected object, so rotating a parent moves the whole limb.</p>
      <button class="btn wide" id="camReset" type="button" style="margin-top:8px">Reset camera</button>
    </div>`;
  box.querySelectorAll('[data-nid]').forEach(r => r.onclick = () => select('node', r.dataset.nid));
  box.querySelectorAll('[data-add]').forEach(b => b.onclick = () => addNode(b.dataset.add));
  $('#camReset').onclick = () => { proj.cam = { yaw: -26, pitch: 16, dist: 4.6, target: 1.05 }; draw(); saveSoon(); };
}
function addNode(shape) {
  pushUndo();
  const parent = selNode();
  const node = {
    id: uid(), name: shape[0].toUpperCase() + shape.slice(1), parent: parent ? parent.id : null,
    shape, x: 0, y: parent ? -0.5 : 1, z: 0,
    w: .4, h: .6, d: .4, color: color, rx: 0, ry: 0, rz: 0, visible: true
  };
  proj.nodes.push(node);
  select('node', node.id);
  saveSoon();
  toast('Added ' + node.name);
}
function deleteNode(id) {
  const ids = new Set();
  const rec = i => { ids.add(i); proj.nodes.filter(n => n.parent === i).forEach(n => rec(n.id)); };
  rec(id);
  pushUndo();
  proj.nodes = proj.nodes.filter(n => !ids.has(n.id));
  sel = null; select(null); saveSoon();
}
function duplicateNode(id) {
  const src = proj.nodes.find(n => n.id === id);
  if (!src) return;
  pushUndo();
  const copy = Object.assign({}, src, { id: uid(), name: src.name + ' copy', x: (src.x || 0) + .4 });
  proj.nodes.push(copy);
  select('node', copy.id); saveSoon();
}
function renderProps3D() {
  const n = selNode();
  if (!n) {
    $('#props').innerHTML = `<h3>Character</h3>
      <div class="kv"><span>Style</span><b>${esc((STYLES[proj.style] || STYLES.cartoon).n)}</b></div>
      <div class="kv"><span>Objects</span><b>${proj.nodes.length}</b></div>
      <div class="kv"><span>Animations</span><b>${proj.anims.length}</b></div>
      <div class="kv"><span>Frame</span><b>${viewFrame + 1} of ${curAnim().frames.length}</b></div>
      <p class="hint" style="margin-top:12px">Select an object in the 3D panel, then rotate it in the timeline. Drag the canvas to orbit the camera, scroll to zoom.</p>
      <div class="grp"><h3>Camera</h3>
        <div class="field"><label for="cyaw">Yaw</label><input id="cyaw" type="range" min="-180" max="180" value="${Math.round(proj.cam.yaw)}"></div>
        <div class="field"><label for="cpitch">Pitch</label><input id="cpitch" type="range" min="-70" max="80" value="${Math.round(proj.cam.pitch)}"></div>
        <div class="field"><label for="cdist">Zoom</label><input id="cdist" type="range" min="1.8" max="14" step=".1" value="${proj.cam.dist}"></div>
      </div>`;
    $('#cyaw').oninput = e => { proj.cam.yaw = +e.target.value; draw(); };
    $('#cpitch').oninput = e => { proj.cam.pitch = +e.target.value; draw(); };
    $('#cdist').oninput = e => { proj.cam.dist = +e.target.value; draw(); };
    return;
  }
  const ps = poseOf(n.id);
  $('#props').innerHTML = `<h3>3D object</h3>
    <div class="selhead"><span class="sw" style="background:${n.color}"></span><div><b>${esc(n.name)}</b><small>${esc(n.shape)}</small></div></div>
    <div class="field"><label for="nw">Width</label><input id="nw" type="number" step=".05" value="${round(n.w)}"></div>
    <div class="field"><label for="nh">Height</label><input id="nh" type="number" step=".05" value="${round(n.h)}"></div>
    <div class="field"><label for="nd">Depth</label><input id="nd" type="number" step=".05" value="${round(n.d)}"></div>
    <div class="field"><label for="nx">X</label><input id="nx" type="number" step=".05" value="${round(n.x || 0)}"></div>
    <div class="field"><label for="ny">Y</label><input id="ny" type="number" step=".05" value="${round(n.y || 0)}"></div>
    <div class="field"><label for="nz">Z</label><input id="nz" type="number" step=".05" value="${round(n.z || 0)}"></div>
    <div class="field"><label for="ncol">Material</label><input id="ncol" type="color" value="${/^#[0-9a-f]{6}$/i.test(n.color) ? n.color : '#8899aa'}"></div>
    <div class="field"><label for="nrx">Pose X°</label><input id="nrx" type="number" step="5" value="${Math.round(+ps.rx || 0)}"></div>
    <div class="field"><label for="nry">Pose Y°</label><input id="nry" type="number" step="5" value="${Math.round(+ps.ry || 0)}"></div>
    <div class="field"><label for="nrz">Pose Z°</label><input id="nrz" type="number" step="5" value="${Math.round(+ps.rz || 0)}"></div>
    <div class="field"><label for="nvis">Visible</label><input id="nvis" type="checkbox"${n.visible === false ? '' : ' checked'}></div>
    <div class="field"><label for="nsync">Pose all frames</label><input id="nsync" type="checkbox"${syncAllPoses ? ' checked' : ''}></div>
    <div class="grp">
      <button class="btn wide" id="nDup" type="button">Duplicate object</button>
      <button class="btn wide danger" id="nDel" type="button" style="margin-top:6px">Delete object</button>
    </div>`;
  const upd = () => { draw(); renderFramesSoon(); saveSoon(); };
  $('#nw').oninput = e => { n.w = clamp(+e.target.value || .1, .05, 6); upd(); };
  $('#nh').oninput = e => { n.h = clamp(+e.target.value || .1, .05, 6); upd(); };
  $('#nd').oninput = e => { n.d = clamp(+e.target.value || .1, .05, 6); upd(); };
  $('#nx').oninput = e => { n.x = +e.target.value || 0; upd(); };
  $('#ny').oninput = e => { n.y = +e.target.value || 0; upd(); };
  $('#nz').oninput = e => { n.z = +e.target.value || 0; upd(); };
  $('#ncol').oninput = e => { n.color = e.target.value; render3DPanel(); upd(); };
  $('#nrx').oninput = e => { setPoseAll(n.id, 'rx', +e.target.value || 0); upd(); };
  $('#nry').oninput = e => { setPoseAll(n.id, 'ry', +e.target.value || 0); upd(); };
  $('#nrz').oninput = e => { setPoseAll(n.id, 'rz', +e.target.value || 0); upd(); };
  $('#nvis').onchange = e => { n.visible = e.target.checked; upd(); };
  $('#nsync').onchange = e => { syncAllPoses = e.target.checked; };
  $('#nDup').onclick = () => duplicateNode(n.id);
  $('#nDel').onclick = () => deleteNode(n.id);
}

/* ================= timeline ================= */
let framesRaf = 0;
function renderFramesSoon() {
  cancelAnimationFrame(framesRaf);
  framesRaf = requestAnimationFrame(renderFrames);
}
function syncAnimationUI() {
  const a = curAnim();
  $('#animsel').innerHTML = proj.anims.map((x, i) => `<option value="${i}"${i === proj.curAnim ? ' selected' : ''}>${esc(x.name)}</option>`).join('');
  $('#fps').value = a.fps || 8;
  $('#loopChk').checked = a.loop !== false;
  $('#interpChk').checked = !!a.interp;
  const total = a.frames.reduce((s, f) => s + (f.dur || 0), 0);
  $('#animInfo').textContent = a.frames.length + ' frames · ' + (total / 1000).toFixed(2) + 's';
  $('#frameCount').textContent = a.frames.length;
  $('#frameNo').textContent = viewFrame + 1;
  $('#frameLabFoot').textContent = 'Frame ' + (viewFrame + 1) + ' · ' + a.name;
  const f = a.frames[viewFrame] || a.frames[0];
  $('#dur').value = f ? f.dur : 125;
  $('#playBtn').textContent = playing ? '❚❚ Pause' : '▶ Play';
}
function renderFrames() {
  const box = $('#frames');
  if (!box || !proj) return;
  const a = curAnim();
  box.innerHTML = '';
  a.frames.forEach((f, i) => {
    const d = document.createElement('div');
    d.className = 'frame' + (i === viewFrame ? ' on' : '');
    d.title = 'Frame ' + (i + 1) + ' · ' + f.dur + 'ms';
    const c = document.createElement('canvas');
    c.width = 52; c.height = 66;
    const cx = c.getContext('2d');
    if (is3D()) render3D(cx, 52, 66, { pose: f.pose3 || {} });
    else renderFrameTo(cx, 52, 66, f, { transparent: false });
    const n = document.createElement('span'); n.textContent = i + 1;
    const du = document.createElement('i'); du.className = 'dur'; du.textContent = Math.round(f.dur / 1000 * 100) / 100 + 's';
    d.appendChild(c); d.appendChild(n); d.appendChild(du);
    d.onclick = () => { stopPlay(); viewFrame = i; draw(); syncAnimationUI(); markFrames(); };
    box.appendChild(d);
  });
  syncAnimationUI();
}
function markFrames() {
  $$('#frames .frame').forEach((el, i) => el.classList.toggle('on', i === viewFrame));
  $('#frameNo').textContent = viewFrame + 1;
  $('#frameLabFoot').textContent = 'Frame ' + (viewFrame + 1) + ' · ' + curAnim().name;
  const f = curFrame();
  if (f) $('#dur').value = f.dur;
}
function addFrame(dup) {
  pushUndo();
  const a = curAnim();
  const src = curFrame();
  const f = blankFrame(a.fps);
  f.dur = src.dur;
  f.pose = clone(src.pose || {});
  f.pose3 = clone(src.pose3 || {});
  if (dup) {
    f.layers = src.layers.map(l => ({ id: uid(), name: l.name, visible: l.visible !== false, opacity: l.opacity == null ? 1 : l.opacity, src: l.src || null }));
  }
  if (is3D()) f.layers = [];
  a.frames.splice(viewFrame + 1, 0, f);
  viewFrame++;
  activeLayerId = null;
  sel = null;
  renderFrames(); renderProps(); draw(); saveSoon();
}
function deleteFrame() {
  const a = curAnim();
  if (a.frames.length <= 1) return toast('An animation needs at least one frame');
  pushUndo();
  a.frames.splice(viewFrame, 1);
  viewFrame = clamp(viewFrame, 0, a.frames.length - 1);
  activeLayerId = null; sel = null;
  renderFrames(); renderProps(); draw(); saveSoon();
}
function addAnimationModal() {
  const cats = [
    ['Basic', ['Idle', 'Walking', 'Running', 'Jumping', 'Double jump', 'Crouching', 'Sitting', 'Falling', 'Landing']],
    ['Combat', ['Punching', 'Kicking', 'Attacking', 'Blocking', 'Dodging', 'Taking damage', 'Death']],
    ['Extras', ['Dancing', 'Waving', 'Laughing', 'Crying', 'Celebrating', 'Swimming', 'Climbing']],
    ['Custom', ['Custom']]
  ];
  const opts = cats.map(([g, list]) => `<optgroup label="${g}">${list.map(n => `<option>${n}</option>`).join('')}</optgroup>`).join('');
  openModal('New animation', `
    <label for="anName">Animation name</label>
    <input id="anName" type="text" maxlength="30" value="Walking">
    <label for="anCat">Category</label>
    <select id="anCat">${opts}</select>
    <div class="two" style="margin-top:4px">
      <div><label for="anFrames">Frames</label><input id="anFrames" type="number" min="1" max="60" value="8"></div>
      <div><label for="anFps">FPS</label><input id="anFps" type="number" min="1" max="60" value="8"></div>
    </div>
    <p class="hint">You get that many blank frames with the current pose copied in. Pose each one by hand in the timeline.</p>`,
    [{ label: 'Cancel' }, {
      label: 'Create animation', cls: 'pri', run: () => {
        const name = $('#anName').value.trim() || $('#anCat').value || 'Animation';
        const n = clamp(+$('#anFrames').value || 6, 1, 60);
        const fps = clamp(+$('#anFps').value || 8, 1, 60);
        pushUndo();
        const a = { id: uid(), name, fps, loop: true, interp: is3D(), frames: [] };
        const srcPose = clone(curFrame().pose || {}), srcPose3 = clone(curFrame().pose3 || {});
        for (let i = 0; i < n; i++) {
          const f = blankFrame(fps);
          f.dur = Math.round(1000 / fps);
          f.pose = clone(srcPose); f.pose3 = clone(srcPose3);
          if (is3D()) f.layers = [];
          a.frames.push(f);
        }
        proj.anims.push(a);
        proj.curAnim = proj.anims.length - 1;
        viewFrame = 0; activeLayerId = null; sel = null;
        syncEditor(); renderFrames(); draw(); saveSoon();
        toast('Added “' + name + '”');
      }
    }]);
  const cat = $('#anCat');
  cat.onchange = () => { $('#anName').value = cat.value; };
}
function duplicateAnimation() {
  pushUndo();
  const a = clone(curAnim());
  a.id = uid(); a.name = a.name + ' copy';
  proj.anims.push(a);
  proj.curAnim = proj.anims.length - 1;
  viewFrame = 0; activeLayerId = null; sel = null;
  syncEditor(); renderFrames(); draw(); saveSoon();
  toast('Animation duplicated');
}
function deleteAnimation() {
  if (proj.anims.length <= 1) return toast('Keep at least one animation');
  confirmModal('Delete animation?', '“' + curAnim().name + '” and its frames are removed. Undo still works.', () => {
    pushUndo();
    proj.anims.splice(proj.curAnim, 1);
    proj.curAnim = clamp(proj.curAnim - 1, 0, proj.anims.length - 1);
    viewFrame = 0; sel = null;
    syncEditor(); renderFrames(); draw(); saveSoon();
  });
}

/* ---------- playback ---------- */
let pbFrame = null, pbPose = null, pbPose3 = null, pbIdx = 0, pbAcc = 0, pbLast = 0;
function startPlay() {
  if (!proj) return;
  if (playing) return;
  playing = true;
  pbIdx = viewFrame; pbAcc = 0; pbLast = 0;
  pbFrame = curAnim().frames[pbIdx] || null;
  pbPose = null; pbPose3 = null;
  $('#playBtn').textContent = '❚❚ Pause';
  playRaf = requestAnimationFrame(tick);
}
function stopPlay() {
  playing = false;
  cancelAnimationFrame(playRaf);
  pbFrame = null; pbPose = null; pbPose3 = null;
  $('#playBtn').textContent = '▶ Play';
  if (proj) { viewFrame = clamp(viewFrame, 0, curAnim().frames.length - 1); draw(); markFrames(); }
}
function togglePlay() { playing ? stopPlay() : startPlay(); }
function tick(ts) {
  if (!playing) return;
  const a = curAnim();
  const dt = (pbLast ? Math.min(80, ts - pbLast) : 16) * speed;
  pbLast = ts;
  pbAcc += dt;
  let f = a.frames[pbIdx];
  while (f && pbAcc >= f.dur) {
    pbAcc -= f.dur;
    pbIdx++;
    if (pbIdx >= a.frames.length) {
      if (a.loop === false) { viewFrame = a.frames.length - 1; stopPlay(); return; }
      pbIdx = 0;
    }
    f = a.frames[pbIdx];
  }
  viewFrame = pbIdx;
  pbFrame = f;
  if (a.interp) {
    const nx = a.frames[(pbIdx + 1) % a.frames.length];
    const t = f && f.dur ? clamp(pbAcc / f.dur, 0, 1) : 0;
    if (is3D()) pbPose3 = blendPose(f.pose3 || {}, (nx && nx.pose3) || {}, t, ['rx', 'ry', 'rz', 'tx', 'ty', 'tz']);
    else pbPose = blendPose(f.pose || {}, (nx && nx.pose) || {}, t, ['a', 'x', 'y', 'sx', 'sy']);
  } else { pbPose = null; pbPose3 = null; }
  draw(); markFrames();
  playRaf = requestAnimationFrame(tick);
}
function blendPose(a, b, t, keys) {
  const out = {};
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  ids.forEach(id => {
    const A = a[id] || {}, B = b[id] || {};
    const o = {};
    keys.forEach(k => {
      if (A[k] == null && B[k] == null) return;
      const av = +A[k] || 0, bv = +B[k] || 0;
      o[k] = av + (bv - av) * t;
    });
    out[id] = o;
  });
  return out;
}

/* ---------- keyboard ---------- */
function keyDown(e) {
  const tag = (document.activeElement || {}).tagName;
  const typing = /INPUT|SELECT|TEXTAREA/.test(tag || '');
  if (e.key === 'Escape') { if ($('#modal').hidden === false) closeModal(); return; }
  if (typing) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (!proj) return;
  if (mod && e.key.toLowerCase() === 'c') { copySelection(); return; }
  if (mod && e.key.toLowerCase() === 'v') { pasteSelection(); return; }
  if (e.key === ' ') { e.preventDefault(); togglePlay(); return; }
  if (e.key === 'ArrowRight') { stopPlay(); viewFrame = Math.min(curAnim().frames.length - 1, viewFrame + 1); draw(); markFrames(); return; }
  if (e.key === 'ArrowLeft') { stopPlay(); viewFrame = Math.max(0, viewFrame - 1); draw(); markFrames(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (sel && sel.kind === 'part') { e.preventDefault(); deletePart(sel.id); }
    else if (sel && sel.kind === 'node') { e.preventDefault(); deleteNode(sel.id); }
    else if (marquee && tool === 'marquee' && !is3D()) {
      e.preventDefault(); pushUndo();
      const ctx = layerCtx(activeLayer());
      ctx.clearRect(marquee.x, marquee.y, marquee.w, marquee.h);
      commitLayer(activeLayer()); draw(); renderFramesSoon(); saveSoon();
    }
    return;
  }
  const k = e.key.toLowerCase();
  const map = { v: 'select', b: 'brush', e: 'eraser', g: 'fill', i: 'picker', l: 'line', r: 'rect', o: 'ellipse', m: 'marquee' };
  if (map[k] && !is3D()) { tool = map[k]; renderDrawPanel(); draw(); }
}
function copySelection() {
  if (!marquee || is3D()) return;
  const ctx = layerCtx(activeLayer());
  try {
    clipPixels = ctx.getImageData(Math.round(marquee.x), Math.round(marquee.y), Math.round(marquee.w), Math.round(marquee.h));
    toast('Copied selection');
  } catch (e) {}
}
function pasteSelection() {
  if (!clipPixels || is3D()) return;
  pushUndo();
  const ctx = layerCtx(activeLayer());
  const x = marquee ? Math.round(marquee.x) : 0, y = marquee ? Math.round(marquee.y) : 0;
  ctx.putImageData(clipPixels, x, y);
  marquee = { x, y, w: clipPixels.width, h: clipPixels.height };
  commitLayer(activeLayer()); draw(); renderFramesSoon(); saveSoon();
  toast('Pasted');
}

/* ================= export ================= */
function slug(s) { return String(s || 'character').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'character'; }
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function exportModal() {
  if (!proj) return toast('Open a character first');
  const d = is3D();
  const opts = [
    ['frame', 'PNG — current frame'],
    ['sheet', 'Sprite sheet — current animation'],
    ['gif', 'GIF — current animation'],
    ['project', 'Project file (.json) — editable'],
    ['anim', 'Animation data (.json) — for engines']
  ];
  if (d) { opts.push(['gltf', 'glTF model (.gltf) — animated']); opts.push(['glb', 'GLB model (.glb) — animated']); }
  openModal('Export character', `
    <label for="exFmt">What to export</label>
    <select id="exFmt">${opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
    <div class="two" style="margin-top:4px">
      <div><label for="exScale">Scale</label><input id="exScale" type="number" min="1" max="8" value="2"></div>
      <div><label for="exTrans">Background</label><select id="exTrans"><option value="1">Transparent</option><option value="0">Canvas colour</option></select></div>
    </div>
    <p class="hint">${d ? 'glTF/GLB include the node hierarchy, materials and each timeline animation. FBX is not generated in the browser.' : 'Sprite sheets and GIFs use every frame in the current animation. PNG exports the current frame.'}</p>`,
    [{ label: 'Cancel' }, { label: 'Export', cls: 'pri', run: doExport }]);
}
function doExport() {
  const fmt = $('#exFmt').value;
  const scale = clamp(+$('#exScale').value || 1, 1, 8);
  const transparent = $('#exTrans').value === '1';
  const base = slug(proj.name);
  try {
    if (fmt === 'project') {
      download(new Blob([JSON.stringify(deep(proj), null, 2)], { type: 'application/json' }), base + '.charlab.json');
      toast('Project exported'); return;
    }
    if (fmt === 'anim') {
      const data = {
        format: 'character-studio-animations@1',
        character: proj.name, style: proj.style, mode: proj.mode,
        canvas: { w: proj.w, h: proj.h },
        parts: is3D() ? proj.nodes : proj.parts,
        animations: proj.anims.map(x => ({
          name: x.name, fps: x.fps, loop: x.loop !== false, interp: !!x.interp,
          frames: x.frames.map(f => ({ duration: f.dur, pose: is3D() ? f.pose3 : f.pose }))
        }))
      };
      download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), base + '-animations.json');
      toast('Animation data exported'); return;
    }
    if (fmt === 'gltf' || fmt === 'glb') {
      if (!is3D()) throw new Error('glTF export needs a 3D character');
      const model = buildGLTF(fmt === 'glb');
      download(new Blob([model.data], { type: fmt === 'glb' ? 'model/gltf-binary' : 'model/gltf+json' }), base + (fmt === 'glb' ? '.glb' : '.gltf'));
      toast(fmt.toUpperCase() + ' exported'); return;
    }
    if (fmt === 'gif') return exportGIF(scale, transparent, base);
    if (fmt === 'sheet') return exportSheet(scale, transparent, base);
    exportPNG(scale, transparent, base);
  } catch (err) { console.error(err); toast('Export failed: ' + err.message); }
}
function renderExport(frame, scale, transparent) {
  const c = document.createElement('canvas');
  c.width = proj.w * scale; c.height = proj.h * scale;
  const ctx = c.getContext('2d');
  if (is3D()) render3D(ctx, c.width, c.height, { transparent, pose: frame.pose3 || {} });
  else renderFrameTo(ctx, c.width, c.height, frame, { transparent });
  return c;
}
function exportPNG(scale, transparent, base) {
  const c = renderExport(curFrame(), scale, transparent);
  c.toBlob(b => { if (b) download(b, base + '-frame-' + (viewFrame + 1) + '.png'); toast('PNG exported'); }, 'image/png');
}
function exportSheet(scale, transparent, base) {
  const a = curAnim();
  const n = a.frames.length;
  const cols = Math.min(n, 6), rows = Math.ceil(n / cols);
  const c = document.createElement('canvas');
  c.width = proj.w * scale * cols; c.height = proj.h * scale * rows;
  const ctx = c.getContext('2d');
  a.frames.forEach((f, i) => {
    const fc = renderExport(f, scale, transparent);
    ctx.drawImage(fc, (i % cols) * proj.w * scale, Math.floor(i / cols) * proj.h * scale);
  });
  c.toBlob(b => { if (b) download(b, base + '-' + slug(a.name) + '-sheet.png'); toast('Sprite sheet exported (' + n + ' frames)'); }, 'image/png');
}

/* GIF89a encoder */
function gifPalette() {
  const p = [];
  for (let r = 0; r < 6; r++) for (let g = 0; g < 7; g++) for (let b = 0; b < 6; b++) p.push(Math.round(r * 255 / 5), Math.round(g * 255 / 6), Math.round(b * 255 / 5));
  while (p.length < 768) p.push(0);
  return p;
}
function quantIndex(r, g, b, transparent, alpha) {
  if (transparent && alpha < 110) return 255;
  const ri = Math.round(r / 255 * 5), gi = Math.round(g / 255 * 6), bi = Math.round(b / 255 * 5);
  return clamp((ri * 7 + gi) * 6 + bi, 0, 254);
}
function lzw(px, minCode) {
  const clear = 1 << minCode, eoi = clear + 1;
  let size = minCode + 1, next = eoi + 1;
  let dict = new Map();
  const out = [];
  let acc = 0, bits = 0;
  const put = c => { acc |= c << bits; bits += size; while (bits >= 8) { out.push(acc & 255); acc >>>= 8; bits -= 8; } };
  put(clear);
  let prefix = px[0] || 0;
  for (let i = 1; i < px.length; i++) {
    const k = px[i], key = (prefix << 8) | k;
    const v = dict.get(key);
    if (v !== undefined) { prefix = v; continue; }
    put(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > (1 << size) && size < 12) size++;
    } else {
      put(clear); dict = new Map(); size = minCode + 1; next = eoi + 1;
    }
    prefix = k;
  }
  put(prefix); put(eoi);
  if (bits > 0) out.push(acc & 255);
  return out;
}
function exportGIF(scale, transparent, base) {
  const a = curAnim();
  const w = proj.w * scale, h = proj.h * scale;
  const bytes = [];
  const push = (...v) => v.forEach(x => bytes.push(x & 255));
  const word = n => push(n & 255, n >> 8 & 255);
  'GIF89a'.split('').forEach(ch => push(ch.charCodeAt(0)));
  word(w); word(h); push(0xF7, 0, 0);
  gifPalette().forEach(v => push(v));
  push(0x21, 0xFF, 0x0B); 'NETSCAPE2.0'.split('').forEach(ch => push(ch.charCodeAt(0)));
  push(0x03, 0x01, 0x00, 0x00, 0x00);
  a.frames.forEach(f => {
    const c = renderExport(f, scale, transparent);
    const data = c.getContext('2d').getImageData(0, 0, w, h).data;
    const px = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) px[p] = quantIndex(data[i], data[i + 1], data[i + 2], transparent, data[i + 3]);
    const delay = Math.max(2, Math.round((f.dur || 125) / 10));
    push(0x21, 0xF9, 0x04, transparent ? 0x09 : 0x04);
    word(delay);
    push(transparent ? 255 : 0, 0x00);
    push(0x2C); word(0); word(0); word(w); word(h); push(0x00);
    const compressed = lzw(px, 8);
    push(8);
    for (let i = 0; i < compressed.length; i += 255) {
      const chunk = compressed.slice(i, i + 255);
      push(chunk.length);
      chunk.forEach(v => push(v));
    }
    push(0x00);
  });
  push(0x3B);
  download(new Blob([new Uint8Array(bytes)], { type: 'image/gif' }), base + '-' + slug(a.name) + '.gif');
  toast('GIF exported (' + a.frames.length + ' frames)');
}

const b64 = u8 => {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  return btoa(s);
};
function buildGLTF(binary) {
  const buf = [];
  let offset = 0;
  const bufferViews = [], accessors = [];
  const addView = (typed, target) => {
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    while (offset % 4) { buf.push(0); offset++; }
    const start = offset;
    for (let i = 0; i < bytes.length; i++) buf.push(bytes[i]);
    offset += bytes.length;
    bufferViews.push({ buffer: 0, byteOffset: start, byteLength: bytes.length, target });
    return bufferViews.length - 1;
  };
  const materials = [], meshes = [], nodes = [];
  const matOf = {};
  proj.nodes.forEach(n => {
    const col = hexToRgb(n.color) || { r: 150, g: 150, b: 150 };
    const key = (n.color || '').toLowerCase();
    if (!(key in matOf)) {
      matOf[key] = materials.length;
      materials.push({ name: 'mat' + materials.length, pbrMetallicRoughness: { baseColorFactor: [col.r / 255, col.g / 255, col.b / 255, 1], metallicFactor: 0, roughnessFactor: .82 }, doubleSided: true });
    }
    const g = GEO[n.shape] || GEO.box;
    const sx = n.w || 1, sy = n.h || 1, sz = n.d || 1;
    const pos = new Float32Array(g.v.length);
    for (let i = 0; i < g.v.length; i += 3) {
      pos[i] = g.v[i] * sx; pos[i + 1] = g.v[i + 1] * sy; pos[i + 2] = g.v[i + 2] * sz;
    }
    const nor = new Float32Array(g.n);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], pos[i + k]); max[k] = Math.max(max[k], pos[i + k]); }
    const pv = addView(pos, 34962), nv = addView(nor, 34962), iv = addView(new Uint16Array(g.idx), 34963);
    const pa = accessors.push({ bufferView: pv, componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max }) - 1;
    const na = accessors.push({ bufferView: nv, componentType: 5126, count: nor.length / 3, type: 'VEC3' }) - 1;
    const ia = accessors.push({ bufferView: iv, componentType: 5123, count: g.idx.length, type: 'SCALAR' }) - 1;
    const meshIdx = meshes.length;
    meshes.push({ name: n.name + 'Mesh', primitives: [{ attributes: { POSITION: pa, NORMAL: na }, indices: ia, material: matOf[key] }] });
    nodes.push({
      name: n.name, mesh: meshIdx,
      translation: [n.x || 0, n.y || 0, n.z || 0],
      rotation: eulerQuat(n.rx || 0, n.ry || 0, n.rz || 0)
    });
  });
  const indexOf = {};
  proj.nodes.forEach((n, i) => { indexOf[n.id] = i; });
  proj.nodes.forEach((n, i) => {
    if (n.parent && indexOf[n.parent] != null) {
      const p = nodes[indexOf[n.parent]];
      (p.children = p.children || []).push(i);
    }
  });
  const roots = proj.nodes.map((n, i) => (n.parent && indexOf[n.parent] != null ? -1 : i)).filter(i => i >= 0);
  const animations = [];
  proj.anims.forEach(anim => {
    const times = [];
    let t = 0;
    anim.frames.forEach(f => { times.push(round(t * 1000) / 1000); t += (f.dur || 100) / 1000; });
    const samplers = [], channels = [];
    proj.nodes.forEach(n => {
      const vals = anim.frames.map(f => {
        const p = (f.pose3 || {})[n.id] || {};
        return eulerQuat((n.rx || 0) + (+p.rx || 0), (n.ry || 0) + (+p.ry || 0), (n.rz || 0) + (+p.rz || 0));
      });
      const changed = vals.some(v => v.some((x, i) => Math.abs(x - vals[0][i]) > 1e-4));
      if (!changed) return;
      const nIdx = indexOf[n.id];
      if (nIdx == null) return;
      const input = new Float32Array(times);
      const output = new Float32Array(vals.flat());
      const iv = addView(input, 34962), ov = addView(output, 34962);
      const ia = accessors.push({ bufferView: iv, componentType: 5126, count: input.length, type: 'SCALAR', min: [times[0]], max: [times[times.length - 1]] }) - 1;
      const oa = accessors.push({ bufferView: ov, componentType: 5126, count: output.length / 4, type: 'VEC4' }) - 1;
      samplers.push({ input: ia, output: oa, interpolation: 'LINEAR' });
      channels.push({ sampler: samplers.length - 1, target: { node: nIdx, path: 'rotation' } });
    });
    if (channels.length) animations.push({ name: anim.name, samplers, channels });
  });
  const bin = new Uint8Array(buf);
  const gltf = {
    asset: { version: '2.0', generator: 'Character Studio (manual)' },
    scene: 0,
    scenes: [{ name: proj.name, nodes: roots }],
    nodes, meshes, materials, accessors, bufferViews,
    buffers: [{ byteLength: bin.length, uri: 'data:application/octet-stream;base64,' + b64(bin) }],
    animations
  };
  if (!binary) return { data: JSON.stringify(gltf, null, 2) };
  const enc = new TextEncoder();
  let json = enc.encode(JSON.stringify(gltf));
  while (json.length % 4) json = new Uint8Array([...json, 0x20]);
  let binPad = bin;
  if (binPad.length % 4) { const p = new Uint8Array(binPad.length + (4 - binPad.length % 4)); p.set(binPad); binPad = p; }
  const total = 12 + 8 + json.length + 8 + binPad.length;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  out.set([0x67, 0x6C, 0x54, 0x46], 0);
  dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, json.length, true); out.set([0x4A, 0x53, 0x4F, 0x4E], 16);
  out.set(json, 20);
  const off = 20 + json.length;
  dv.setUint32(off, binPad.length, true); out.set([0x42, 0x49, 0x4E, 0x00], off + 4);
  out.set(binPad, off + 8);
  return { data: out };
}
function eulerQuat(rx, ry, rz) {
  const cx = Math.cos(rx * D2R / 2), sx = Math.sin(rx * D2R / 2);
  const cy = Math.cos(ry * D2R / 2), sy = Math.sin(ry * D2R / 2);
  const cz = Math.cos(rz * D2R / 2), sz = Math.sin(rz * D2R / 2);
  return [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz
  ];
}

boot();
/* PART C */
