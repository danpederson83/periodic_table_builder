import { loadData } from './data.js';
import { analyzeBond, renderBondSVG, bondKind, BOND_EXAMPLES } from './bonding.js';
import { tileColorsFor } from './render.js';
import { makeState } from './state.js';
import { THEMES } from './schemes.js';
import { downloadSVG, downloadPNG, copyPNG } from './export.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const STORAGE_KEY = 'ptb:bonds';

const DEFAULTS = { a: 'Na', b: 'Cl', view: 'both', style: 'bohr', marks: 'color', theme: 'light', labels: true, transparent: false };
const CHOICES = { view: ['both', 'before', 'after'], style: ['bohr', 'dots', 'lines'], marks: ['color', 'cross'], theme: Object.keys(THEMES) };

let data;
let state;
const bySymbol = (sym) => data.elements.find((el) => el.symbol === sym);

// ---- state ---------------------------------------------------------------------

// Share links are readable: #a=Mg&b=O&view=after. Only settings that differ from the defaults are written.
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (!h.has('a')) return null;
  const out = { ...DEFAULTS };
  for (const [k, v] of h) {
    if (k === 'a' || k === 'b') { if (bySymbol(v)) out[k] = v; }
    else if (CHOICES[k]?.includes(v)) out[k] = v;
    else if (k === 'labels' || k === 'transparent') out[k] = v === '1';
  }
  return out;
}

function writeHash() {
  const h = new URLSearchParams({ a: state.a, b: state.b });
  for (const [k, v] of Object.entries(state)) {
    if (k === 'a' || k === 'b' || v === DEFAULTS[k]) continue;
    h.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : v);
  }
  history.replaceState(null, '', `#${h}`);
}

function loadInitialState() {
  const fromHash = readHash();
  if (fromHash) return fromHash;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && bySymbol(saved.a) && bySymbol(saved.b)) return { ...DEFAULTS, ...saved };
  } catch { /* storage unavailable */ }
  return { ...DEFAULTS };
}

// ---- rendering -------------------------------------------------------------------

function current() {
  return analyzeBond(bySymbol(state.a), bySymbol(state.b));
}

function svgString(res, opts = {}) {
  // Nuclei are colored like the element's tile in the default (element families) table.
  const table = makeState({ theme: state.theme });
  return renderBondSVG(res, {
    theme: state.theme, transparent: state.transparent, view: state.view, style: state.style, marks: state.marks, caption: state.labels,
    nucleus: (el) => tileColorsFor(el.z, table, data), ...opts,
  });
}

function update() {
  const res = current();
  const explain = $('#explain');
  if (!res.ok) {
    $('#diagram').innerHTML = `<div class="no-bond"><h2>No simple bond to draw</h2><p>${esc(res.reason)}</p><p>Try one of the examples on the left.</p></div>`;
    explain.hidden = true;
  } else {
    $('#diagram').innerHTML = svgString(res, { fluid: true });
    explain.hidden = false;
    explain.innerHTML = `
      <h2>${esc(res.formula)} <span class="bond-type ${res.type}">${res.type === 'ionic' ? 'Ionic bond' : 'Covalent bond'}</span></h2>
      <p class="bond-name">${esc(res.name[0].toUpperCase() + res.name.slice(1))}</p>
      <ol>${res.explain.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      ${res.notes.map((s) => `<p class="note">${esc(s)}</p>`).join('')}`;
  }
  $$('#dl-svg, #dl-png, #copy-png').forEach((b) => { b.disabled = !res.ok; });
  $$('#examples button').forEach((b) => b.classList.toggle('active', b.dataset.a === state.a && b.dataset.b === state.b));
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  writeHash();
}

function status(msg) {
  const el = $('#status');
  el.textContent = msg;
  clearTimeout(status.t);
  status.t = setTimeout(() => (el.textContent = ''), 3000);
}

// ---- controls ------------------------------------------------------------------------

function elementOptions() {
  // The last group can be picked, but only explains why it isn't drawn.
  const groups = [['metal', 'Metals'], ['nonmetal', 'Nonmetals'], ['metalloid', 'Metalloids'], ['noble', 'Noble gases'], ['other', 'Transition metals and others (not drawn)']];
  return groups.map(([kind, label]) => `<optgroup label="${label}">${data.elements
    .filter((el) => bondKind(el) === kind)
    .map((el) => `<option value="${el.symbol}">${el.symbol} · ${esc(el.name)}</option>`).join('')}</optgroup>`).join('');
}

function syncControls() {
  for (const input of $$('[data-bind]')) {
    const v = state[input.dataset.bind];
    if (input.type === 'checkbox') input.checked = v;
    else input.value = v;
  }
}

function setupControls() {
  $('#el-a').innerHTML = $('#el-b').innerHTML = elementOptions();
  $('#theme').innerHTML = Object.entries(THEMES).map(([k, t]) => `<option value="${k}">${t.label}</option>`).join('');
  $('#examples').innerHTML = BOND_EXAMPLES.map(([a, b]) => {
    const res = analyzeBond(bySymbol(a), bySymbol(b));
    return `<button type="button" data-a="${a}" data-b="${b}" title="${esc(res.name)}">${esc(res.formula)}</button>`;
  }).join('');

  for (const input of $$('[data-bind]')) {
    input.addEventListener('change', () => {
      state[input.dataset.bind] = input.type === 'checkbox' ? input.checked : input.value;
      update();
    });
  }
  $('#examples').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    Object.assign(state, { a: b.dataset.a, b: b.dataset.b });
    syncControls();
    update();
  });
  window.addEventListener('hashchange', () => {
    const next = readHash();
    if (!next) return;
    state = next;
    syncControls();
    update();
  });

  const fileName = () => {
    const res = current();
    return `${res.name} ${res.type} bond`;
  };
  $('#share').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      status('Link copied');
    } catch {
      status('Copy the address bar to share');
    }
  });
  $('#dl-svg').addEventListener('click', () => downloadSVG(svgString(current()), fileName()));
  $('#dl-png').addEventListener('click', async () => {
    status('Rendering PNG…');
    try {
      const scale = Number($('#png-scale').value);
      await downloadPNG(svgString(current()), fileName(), scale);
      status('PNG downloaded');
    } catch (err) { status(err.message); }
  });
  $('#copy-png').addEventListener('click', async () => {
    try {
      await copyPNG(svgString(current()), Number($('#png-scale').value));
      status('Image copied. Paste it into your slides.');
    } catch (err) { status(err.message); }
  });
}

// ---- boot ---------------------------------------------------------------------------

async function main() {
  try {
    data = await loadData();
  } catch (e) {
    $('#diagram').innerHTML = `<p class="loading">${esc(e.message)}. Serve this folder over HTTP (see README).</p>`;
    return;
  }
  state = loadInitialState();
  setupControls();
  syncControls();
  update();
}

main();
