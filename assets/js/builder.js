import { loadData } from './data.js';
import { renderSVG } from './render.js';
import { SCHEMES, THEMES, RAMPS } from './schemes.js';
import { PROPERTIES, CORNER_FIELDS, LINE_FIELDS, HEAT_FIELDS, displayValue } from './properties.js';
import { PRESETS, presetById } from './presets.js';
import { makeState, defaultState, encodeState, decodeState } from './state.js';
import { downloadSVG, downloadPNG, copyPNG } from './export.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const STORAGE_KEY = 'ptb:last';
const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

let data;
let state;
let tool = 'highlight';
let current = 0; // palette index used by the highlight tool
let inspected = null;
const undoStack = [];
const redoStack = [];

// ---- state helpers ---------------------------------------------------------

const getPath = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = value;
}

function snapshot() {
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > 100) undoStack.shift();
  redoStack.length = 0;
}

function commit(mutate) {
  snapshot();
  mutate(state);
  update();
}

function restore(from, to) {
  if (!from.length) return;
  to.push(JSON.stringify(state));
  state = makeState(JSON.parse(from.pop()));
  syncControls();
  update();
}

function loadInitialState() {
  const hash = new URLSearchParams(location.hash.slice(1));
  try {
    if (hash.get('s')) return decodeState(hash.get('s'));
  } catch (e) {
    console.warn('Bad share link', e);
  }
  const preset = presetById(hash.get('preset'));
  if (preset) return makeState(preset.state);
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return makeState(JSON.parse(saved));
  } catch { /* storage unavailable */ }
  return makeState(presetById('families').state);
}

// ---- rendering -------------------------------------------------------------

function svgString() {
  return renderSVG(state, data);
}

function update() {
  $('#canvas').innerHTML = renderSVG(state, data, { fluid: true });
  $('#heat-opts').hidden = !SCHEMES[state.scheme]?.heat;
  renderPalette();
  if (inspected) showStats(inspected);
  $('#undo').disabled = !undoStack.length;
  $('#redo').disabled = !redoStack.length;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
  history.replaceState(null, '', `#s=${encodeState(state)}`);
}

function status(msg) {
  const el = $('#status');
  el.textContent = msg;
  clearTimeout(status.t);
  status.t = setTimeout(() => (el.textContent = ''), 3000);
}

// ---- controls --------------------------------------------------------------

function fillSelect(sel, entries) {
  sel.innerHTML = entries.map(([v, label]) => `<option value="${v}">${label}</option>`).join('');
}

function setupControls() {
  fillSelect($('#preset'), [['', 'Choose a starting table…'], ...PRESETS.map((p) => [p.id, p.title])]);
  fillSelect($('#scheme'), Object.entries(SCHEMES).map(([k, s]) => [k, s.label]));
  fillSelect($('#heat-prop'), HEAT_FIELDS.map((k) => [k, PROPERTIES[k].label]));
  fillSelect($('#ramp'), Object.entries(RAMPS).map(([k, r]) => [k, r.label]));
  fillSelect($('#theme'), Object.entries(THEMES).map(([k, t]) => [k, t.label]));
  fillSelect($('#corner'), CORNER_FIELDS.map((k) => [k, k === 'none' ? 'Nothing' : PROPERTIES[k].label]));
  fillSelect($('#line'), LINE_FIELDS.map((k) => [k, k === 'none' ? 'Nothing' : PROPERTIES[k].label]));

  for (const input of $$('[data-bind]')) {
    const path = input.dataset.bind;
    const read = () => {
      if (input.type === 'checkbox') return input.checked;
      if (input.dataset.type === 'number') return Number(input.value);
      return input.value;
    };
    if (input.type === 'text' || input.tagName === 'TEXTAREA') {
      // Typing shouldn't flood the undo stack: snapshot once when editing starts.
      input.addEventListener('focus', () => snapshot());
      input.addEventListener('input', () => { setPath(state, path, read()); update(); });
    } else {
      input.addEventListener('change', () => commit((s) => {
        // Keep the tile's corner value in step with the heatmap when it was showing the same property.
        if (path === 'heatProperty' && s.corner === s.heatProperty && CORNER_FIELDS.includes(read())) s.corner = read();
        setPath(s, path, read());
        syncControls();
      }));
    }
  }

  $('#preset').addEventListener('change', (e) => {
    const p = presetById(e.target.value);
    if (!p) return;
    commit(() => { state = makeState(p.state); });
    syncControls();
    e.target.value = '';
    status(`Loaded “${p.title}”`);
  });

  $$('#tools button').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $('#clear-hl').addEventListener('click', () => commit((s) => { s.highlights = {}; }));
  $('#clear-blank').addEventListener('click', () => commit((s) => { s.blanks = []; }));
  $('#reset').addEventListener('click', () => {
    if (!confirm('Reset every setting to the defaults?')) return;
    commit(() => { state = defaultState(); });
    syncControls();
  });
  $('#undo').addEventListener('click', () => restore(undoStack, redoStack));
  $('#redo').addEventListener('click', () => restore(redoStack, undoStack));

  $('#dl-svg').addEventListener('click', () => downloadSVG(svgString(), state.title));
  $('#dl-png').addEventListener('click', async () => {
    status('Rendering PNG…');
    try {
      await downloadPNG(svgString(), state.title, Number($('#png-scale').value));
      status('PNG downloaded');
    } catch (e) { status(e.message); }
  });
  $('#copy-png').addEventListener('click', async () => {
    try {
      await copyPNG(svgString(), Number($('#png-scale').value));
      status('Image copied. Paste it into your slides.');
    } catch (e) { status(e.message); }
  });
  $('#share').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      status('Link copied. It recreates this exact table.');
    } catch { status('Copy the address bar to share this table'); }
  });

  $('#canvas').addEventListener('click', onCanvasClick);
  $('#stats-close').addEventListener('click', closeStats);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeStats();
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      e.preventDefault();
      if (e.shiftKey) restore(redoStack, undoStack); else restore(undoStack, redoStack);
    }
  });
}

function syncControls() {
  for (const input of $$('[data-bind]')) {
    const v = getPath(state, input.dataset.bind);
    if (input.type === 'checkbox') input.checked = !!v;
    else input.value = v ?? '';
  }
}

function setTool(t) {
  tool = t;
  $$('#tools button').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
  $('#canvas').dataset.tool = t;
  $('#swatches').classList.toggle('muted', t !== 'highlight');
}

function renderPalette() {
  $('#swatches').innerHTML = state.palette.map((p, i) =>
    `<button type="button" class="swatch${i === current ? ' active' : ''}" data-i="${i}" style="--c:${p.color}" title="${attr(p.label)}" aria-label="Highlight color: ${attr(p.label)}"></button>`).join('');
  $$('#swatches .swatch').forEach((b) => b.addEventListener('click', () => {
    current = Number(b.dataset.i);
    setTool('highlight');
    renderPalette();
  }));

  const box = $('#palette');
  if (box.contains(document.activeElement)) return; // don't clobber an input being edited
  box.innerHTML = state.palette.map((p, i) => `
    <div class="pal-row${i === current ? ' active' : ''}">
      <input type="radio" name="pal" value="${i}" ${i === current ? 'checked' : ''} aria-label="Use this color">
      <input type="color" value="${p.color}" data-i="${i}" aria-label="Color">
      <input type="text" value="${attr(p.label)}" data-i="${i}" placeholder="Legend label" aria-label="Legend label">
    </div>`).join('');
  $$('#palette input[type=radio]').forEach((r) => r.addEventListener('change', () => { current = Number(r.value); setTool('highlight'); renderPalette(); }));
  $$('#palette input[type=color]').forEach((c) => {
    c.addEventListener('focus', () => snapshot());
    c.addEventListener('input', () => { state.palette[c.dataset.i].color = c.value; update(); });
  });
  $$('#palette input[type=text]').forEach((t) => {
    t.addEventListener('focus', () => snapshot());
    t.addEventListener('input', () => { state.palette[t.dataset.i].label = t.value; update(); });
  });
}

// ---- canvas interaction ----------------------------------------------------

function membersOfGroup(g) {
  return data.elements.filter((el) => el.group === g || (g === 3 && state.layout === '32' && (el.z === 71 || el.z === 103))).map((el) => el.z);
}
const membersOfPeriod = (p) => data.elements.filter((el) => el.period === p).map((el) => el.z);
const membersOfSeries = (s) => data.elements.filter((el) => (s === 'La' ? el.z >= 57 && el.z <= 71 : el.z >= 89 && el.z <= 103)).map((el) => el.z);

// Toggle a set: if every member already has it, remove; otherwise apply to all.
function applyTool(zs, label) {
  if (tool === 'blank') {
    commit((s) => {
      const all = zs.every((z) => s.blanks.includes(z));
      s.blanks = all ? s.blanks.filter((z) => !zs.includes(z)) : [...new Set([...s.blanks, ...zs])];
      status(`${all ? 'Unblanked' : 'Blanked'} ${label}`);
    });
    return;
  }
  commit((s) => {
    const all = zs.every((z) => s.highlights[z] === current);
    for (const z of zs) {
      if (all) delete s.highlights[z];
      else s.highlights[z] = current;
    }
    status(`${all ? 'Removed highlight from' : 'Highlighted'} ${label}`);
  });
}

function onCanvasClick(e) {
  const el = e.target.closest('.el');
  const grp = e.target.closest('.grp');
  const per = e.target.closest('.per');
  const series = e.target.closest('.series');
  if (el) {
    const z = Number(el.dataset.z);
    if (tool === 'inspect') showStats(z);
    else applyTool([z], data.elements[z - 1].name);
  } else if (grp) {
    applyTool(membersOfGroup(Number(grp.dataset.group)), `group ${grp.dataset.group}`);
  } else if (per) {
    applyTool(membersOfPeriod(Number(per.dataset.period)), `period ${per.dataset.period}`);
  } else if (series) {
    applyTool(membersOfSeries(series.dataset.series), series.dataset.series === 'La' ? 'the lanthanides' : 'the actinides');
  }
}

// ---- stats pane ------------------------------------------------------------

function closeStats() {
  inspected = null;
  $('#stats').hidden = true;
  $$('#canvas .el.inspected').forEach((n) => n.classList.remove('inspected'));
}

function showStats(z) {
  inspected = z;
  const el = data.elements[z - 1];
  $$('#canvas .el.inspected').forEach((n) => n.classList.remove('inspected'));
  $(`#canvas .el[data-z="${z}"]`)?.classList.add('inspected');
  const k = (v, unit = '') => (v === '' || v == null ? '<span class="na">—</span>' : `${v}${unit ? ` <small>${unit}</small>` : ''}`);
  const kelvinC = (v) => (v == null ? k(null) : `${k(v.toFixed(v % 1 ? 2 : 0), 'K')} <small>(${(v - 273.15).toFixed(1)} °C)</small>`);
  const rows = [
    ['Atomic number', el.z],
    ['Atomic mass', el.mass == null ? k(null) : k(el.mass, el.isotopeMass ? 'u (isotope †)' : 'u')],
    ['Category', k(el.category)],
    ['Group', k(el.group ?? (el.period === 6 ? 'Lanthanide series' : 'Actinide series'))],
    ['Period', el.period],
    ['Block', k(el.block)],
    ['Electron configuration', k(el.config)],
    ['Electronegativity', k(displayValue('en', el), 'Pauling')],
    ['Atomic radius', k(displayValue('radius', el), 'pm (van der Waals)')],
    ['1st ionization energy', k(displayValue('ie', el), 'eV')],
    ['Electron affinity', k(displayValue('ea', el), 'eV')],
    ['Oxidation states', k(displayValue('ox', el))],
    ['Standard state', k(el.state)],
    ['Melting point', kelvinC(el.mp)],
    ['Boiling point', kelvinC(el.bp)],
    ['Density', k(displayValue('density', el), 'g/cm³')],
    ['Discovered', k(el.year)],
  ];
  $('#stats-body').innerHTML = `
    <div class="stats-head">
      <div class="stats-tile"><span>${el.z}</span><b>${el.symbol}</b></div>
      <div><h2>${el.name}</h2><p>${el.category || ''}</p></div>
    </div>
    <dl>${rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>
    <p class="stats-src">Source: <a href="https://pubchem.ncbi.nlm.nih.gov/element/${el.z}" target="_blank" rel="noopener">PubChem · ${el.name}</a></p>`;
  $('#stats').hidden = false;
}

// ---- boot ------------------------------------------------------------------

async function main() {
  setupControls();
  setTool(tool);
  try {
    data = await loadData();
  } catch (e) {
    $('#canvas').innerHTML = `<p class="loading">${e.message}. Serve this folder over HTTP (see README).</p>`;
    return;
  }
  state = loadInitialState();
  syncControls();
  update();
}

main();
