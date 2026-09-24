// Renders a periodic table configuration to a standalone SVG string.
// Pure function of (state, data) so it works in the browser, for thumbnails, and in Node tests.

import { SCHEMES, THEMES, RAMPS, tileColors, textOn, mix, grayscale, rampColor, heatScale } from './schemes.js';
import { PROPERTIES, displayValue } from './properties.js';

export const FONT = "'Segoe UI', 'Helvetica Neue', Helvetica, Arial, 'DejaVu Sans', sans-serif";
const W = 96, H = 88, GAP = 6, PX = W + GAP, PY = H + GAP, M = 40;

const CAS = ['IA', 'IIA', 'IIIB', 'IVB', 'VB', 'VIB', 'VIIB', 'VIIIB', 'VIIIB', 'VIIIB', 'IB', 'IIB', 'IIIA', 'IVA', 'VA', 'VIA', 'VIIA', 'VIIIA'];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = (n) => Math.round(n * 10) / 10;

// Rough text width estimate for a sans-serif face; used to shrink text that would overflow.
function textWidth(text, size, bold = false) {
  let w = 0;
  for (const ch of String(text)) {
    if ('iIl.,:;|!\'’ '.includes(ch)) w += 0.3;
    else if ('mwMW'.includes(ch)) w += 0.88;
    else if (ch >= 'A' && ch <= 'Z') w += 0.68;
    else w += 0.56;
  }
  return w * size * (bold ? 1.08 : 1);
}

function fit(text, size, maxW, bold = false) {
  const w = textWidth(text, size, bold);
  return w > maxW ? Math.max(6, size * (maxW / w)) : size;
}

function text(x, y, str, { size, weight = 400, fill, anchor = 'start', extra = '' }) {
  return `<text x="${r1(x)}" y="${r1(y)}" font-size="${r1(size)}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${extra}>${esc(str)}</text>`;
}

// Electron configuration with superscript electron counts, e.g. [Ne]3s2 3p4.
function configText(x, y, config, size, fill, maxW) {
  const parts = [];
  const re = /\[[A-Za-z]+\]|(\d+[spdfg])(\d+)?|\s+|[^\s]/g;
  let m, est = 0;
  while ((m = re.exec(config))) {
    if (m[1]) {
      parts.push({ t: m[1] });
      est += textWidth(m[1], size);
      if (m[2]) { parts.push({ t: m[2], sup: true }); est += textWidth(m[2], size * 0.68); }
    } else {
      parts.push({ t: m[0] === ' ' || /^\s+$/.test(m[0]) ? ' ' : m[0] });
      est += textWidth(m[0], size);
    }
  }
  const s = est > maxW ? Math.max(5, size * (maxW / est)) : size;
  const up = s * 0.38;
  let raised = false;
  const spans = parts.map((p) => {
    let dy = '';
    if (p.sup && !raised) { dy = ` dy="${r1(-up)}"`; raised = true; }
    else if (!p.sup && raised) { dy = ` dy="${r1(up)}"`; raised = false; }
    const fs = p.sup ? ` font-size="${r1(s * 0.68)}"` : '';
    return `<tspan${dy}${fs}>${esc(p.t)}</tspan>`;
  }).join('');
  return `<text x="${r1(x)}" y="${r1(y)}" font-size="${r1(s)}" fill="${fill}" text-anchor="middle" xml:space="preserve">${spans}</text>`;
}

function wrap(str, size, maxW) {
  const words = str.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && textWidth(next, size) > maxW) { lines.push(line); line = w; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// ---- layout --------------------------------------------------------------

function isF(z) {
  return (z >= 57 && z <= 71) || (z >= 89 && z <= 103);
}

export function computeLayout(state, elements) {
  const wide = state.layout === '32';
  const ncols = wide ? 32 : 18;
  const periodW = state.showPeriodLabels ? 48 : 0;
  const X0 = M + periodW;
  const width = X0 + ncols * PX - GAP + M;
  let y = M;
  const L = { wide, ncols, X0, width };

  if (state.title) { L.titleY = y + 38; y += 54; }
  if (state.subtitle) { L.subtitleY = y + 24; y += 42; }
  if (state.title || state.subtitle) y += 22;
  if (state.groupLabels !== 'none') { L.headerY = y + 22; y += 36; }
  L.Y0 = y;

  const groupCol = (g) => (!wide ? g - 1 : g <= 2 ? g - 1 : g + 13);
  L.groupCol = groupCol;

  L.tiles = elements.map((el) => {
    let col, row, fRow = null;
    if (wide) {
      row = el.period - 1;
      if (el.group != null) col = groupCol(el.group);
      else if (el.z === 71 || el.z === 103) col = groupCol(3);
      else col = 2 + el.z - (el.period === 6 ? 57 : 89);
    } else if (el.group != null) {
      col = el.group - 1; row = el.period - 1;
    } else {
      fRow = el.period === 6 ? 0 : 1;
      col = 3 + el.z - (el.period === 6 ? 57 : 89);
    }
    return { el, col, row, fRow };
  });

  const mainBottom = L.Y0 + 7 * PY - GAP;
  y = mainBottom;
  if (state.showKey) { L.keyY = y + 32; y += 48; } else y += 24;

  if (!wide) {
    L.fY0 = y;
    y += 2 * PY - GAP;
    L.placeholders = [
      { series: 'La', label: '57–71', col: 2, row: 5 },
      { series: 'Ac', label: '89–103', col: 2, row: 6 },
    ];
  } else {
    L.placeholders = [];
  }

  for (const t of L.tiles) {
    t.x = X0 + t.col * PX;
    t.y = t.fRow != null ? L.fY0 + t.fRow * PY : L.Y0 + t.row * PY;
  }
  for (const p of L.placeholders) { p.x = X0 + p.col * PX; p.y = L.Y0 + p.row * PY; }

  const lastEmptyCol = wide ? 25 : 11;
  L.legend = { x: X0 + 2 * PX + 18, y: L.Y0 + 2, w: (lastEmptyCol - 1) * PX - GAP - 36, h: 3 * PY - GAP - 6 };
  L.contentBottom = y;
  return L;
}

// ---- colors --------------------------------------------------------------

function highlightColors(color, theme) {
  if (theme.gray) {
    const g = grayscale(color);
    return { fill: mix(g, '#ffffff', 0.25), stroke: '#000000' };
  }
  if (theme === THEMES.dark) return { fill: mix(color, theme.bg, 0.35), stroke: color };
  return { fill: mix(color, '#ffffff', 0.4), stroke: mix(color, '#000000', 0.28) };
}

function makeColorer(state, elements, theme) {
  const scheme = SCHEMES[state.scheme] || SCHEMES.none;
  const cats = Object.fromEntries(scheme.categories.map((c) => [c.key, c]));
  let heat = null;
  if (scheme.heat && PROPERTIES[state.heatProperty]) {
    heat = heatScale(elements, state.heatProperty);
    heat.ramp = theme.gray ? RAMPS.gray : RAMPS[state.ramp] || RAMPS.warm;
  }
  const neutral = { fill: theme.tileFill, stroke: theme.tileStroke };

  return {
    scheme, heat,
    base(el) {
      if (heat) {
        const t = heat.t(el);
        if (t == null) return { ...neutral, dashed: true };
        const fill = rampColor(heat.ramp, t);
        return { fill, stroke: mix(fill, '#000000', 0.3) };
      }
      const cat = cats[scheme.categorize(el)];
      return cat ? tileColors(cat.color, theme) : neutral;
    },
    usedCategories() {
      const used = new Set(elements.map((el) => scheme.categorize(el)));
      return scheme.categories.filter((c) => used.has(c.key));
    },
  };
}

// ---- tiles ---------------------------------------------------------------

function tileSVG(t, state, theme, colorer, hl) {
  const { el } = t;
  const hIdx = state.highlights[el.z];
  const palette = state.palette[hIdx];
  let c = colorer.base(el);
  let strokeW = 1.5;
  if (palette) { c = highlightColors(palette.color, theme); strokeW = 3; }
  const blank = state.blanks.includes(el.z);
  const dim = state.dimOthers && hl.any && !palette;
  const fg = textOn(c.fill, theme);
  const f = state.fields;

  const parts = [];
  parts.push(`<rect x="${strokeW / 2}" y="${strokeW / 2}" width="${W - strokeW}" height="${H - strokeW}" rx="4" fill="${c.fill}" stroke="${c.stroke}" stroke-width="${strokeW}"${c.dashed ? ' stroke-dasharray="4 3"' : ''}/>`);

  const showNum = f.number && (!blank || state.blankKeepsNumber);
  if (showNum) parts.push(text(7, 17, el.z, { size: 13.5, weight: 500, fill: fg }));

  const cornerVal = !blank && state.corner !== 'none' ? displayValue(state.corner, el) : '';
  if (cornerVal) parts.push(text(W - 6, 17, cornerVal, { size: fit(cornerVal, 12, W - (showNum ? 42 : 12), true), weight: 600, fill: fg, anchor: 'end' }));

  if (!blank) {
    const lines = [];
    const nameOrMass = f.name || f.mass || state.line !== 'none';
    if (f.symbol) lines.push({ kind: 'symbol', str: el.symbol, size: nameOrMass ? 31 : 40, lh: nameOrMass ? 32 : 42, weight: 700 });
    if (f.name) lines.push({ kind: 'text', str: el.name, size: 11.5, lh: 15 });
    if (f.mass && el.mass != null) {
      const dag = el.isotopeMass && state.showIsotopeNote ? '†' : '';
      lines.push({ kind: 'text', str: el.mass.toFixed(state.massDecimals) + dag, size: 12, lh: 15 });
    }
    if (state.line !== 'none') {
      const v = displayValue(state.line, el);
      if (v) lines.push({ kind: state.line === 'config' ? 'config' : 'text', str: v, size: state.line === 'config' ? 12 : 11, lh: 15, weight: state.line === 'config' ? 400 : 600 });
    }
    const top = showNum || cornerVal ? 20 : 6;
    const avail = H - 5 - top;
    const total = lines.reduce((s, l) => s + l.lh, 0);
    let y = top + Math.max(0, (avail - total) / 2);
    for (const l of lines) {
      const base = y + l.lh * (l.kind === 'symbol' ? 0.86 : 0.78);
      if (l.kind === 'config') parts.push(configText(W / 2, base, l.str, l.size, fg, W - 8));
      else parts.push(text(W / 2, base, l.str, { size: fit(l.str, l.size, W - 8, l.weight >= 600), weight: l.weight || 400, fill: fg, anchor: 'middle' }));
      y += l.lh;
    }
  }

  const title = `${el.name} (${el.symbol}), atomic number ${el.z}`;
  return `<g class="el" data-z="${el.z}" transform="translate(${t.x},${t.y})"${dim ? ' opacity="0.28"' : ''}><title>${esc(title)}</title>${parts.join('')}</g>`;
}

function placeholderSVG(p, theme, state, hl) {
  const fill = theme.placeholder;
  const dim = state.dimOthers && hl.any ? ' opacity="0.28"' : '';
  return `<g class="series" data-series="${p.series}" transform="translate(${p.x},${p.y})"${dim}>` +
    `<rect x="0.75" y="0.75" width="${W - 1.5}" height="${H - 1.5}" rx="4" fill="${fill}" stroke="${theme.tileStroke}" stroke-width="1.5"/>` +
    text(W / 2, 40, p.label, { size: fit(p.label, 19, W - 10, true), weight: 700, fill: theme.text, anchor: 'middle' }) +
    text(W / 2, 62, 'See below', { size: 12, fill: theme.muted, anchor: 'middle' }) + '</g>';
}

// ---- legend --------------------------------------------------------------

function legendItems(state, colorer, theme, hl) {
  const items = [];
  if (!colorer.heat) {
    for (const c of colorer.usedCategories()) items.push({ label: c.label, ...tileColors(c.color, theme) });
  }
  if (state.showHighlightLegend) {
    for (const idx of hl.used) {
      const p = state.palette[idx];
      if (p && p.label) items.push({ label: p.label, ...highlightColors(p.color, theme), thick: true });
    }
  }
  return items;
}

function legendSVG(L, state, colorer, theme, hl) {
  if (!state.showLegend) return '';
  const box = L.legend;
  const out = [];
  let top = box.y;

  if (colorer.heat) {
    const h = colorer.heat;
    const barW = Math.min(box.w - 180, 560);
    const titleSize = fit(h.label, 21, box.w, true);
    out.push(text(box.x, top + 24, h.label, { size: titleSize, weight: 700, fill: theme.title }));
    const stops = Array.from({ length: 11 }, (_, i) => `<stop offset="${i * 10}%" stop-color="${rampColor(h.ramp, i / 10)}"/>`).join('');
    // Ids are shared by every SVG on a page, so name the gradient after its (deterministic) colors.
    const gid = `heat-${h.ramp.stops[0].slice(1)}-${h.ramp.stops[6].slice(1)}`;
    out.push(`<defs><linearGradient id="${gid}" x1="0" x2="1" y1="0" y2="0">${stops}</linearGradient></defs>`);
    const by = top + 42;
    out.push(`<rect x="${box.x}" y="${by}" width="${barW}" height="24" rx="4" fill="url(#${gid})" stroke="${theme.tileStroke}"/>`);
    const p = PROPERTIES[state.heatProperty];
    const lo = p.format(h.min), hi = p.format(h.max);
    out.push(text(box.x, by + 46, lo, { size: 16, weight: 600, fill: theme.text }));
    out.push(text(box.x + barW, by + 46, hi, { size: 16, weight: 600, fill: theme.text, anchor: 'end' }));
    out.push(text(box.x + barW / 2, by + 46, h.log ? 'log scale' : 'lower → higher', { size: 14, fill: theme.muted, anchor: 'middle' }));
    const nx = box.x + barW + 28;
    out.push(`<rect x="${nx}" y="${by}" width="24" height="24" rx="4" fill="${theme.tileFill}" stroke="${theme.tileStroke}" stroke-width="1.5" stroke-dasharray="4 3"/>`);
    out.push(text(nx + 32, by + 18, 'No data', { size: 16, fill: theme.text }));
    top = by + 70;
  }

  const items = legendItems(state, colorer, theme, hl);
  if (!items.length) return out.join('');
  const availH = box.y + box.h - top;
  const maxCols = L.wide ? 4 : 3;
  const cols = Math.min(maxCols, Math.max(1, Math.ceil(items.length / Math.max(1, Math.floor(availH / 40)))), items.length <= 4 ? 1 : 3);
  const rows = Math.ceil(items.length / cols);
  const itemH = Math.min(44, availH / rows);
  const colW = box.w / cols;
  const sw = Math.min(24, itemH * 0.6);
  items.forEach((it, i) => {
    const cx = box.x + Math.floor(i / rows) * colW;
    const cy = top + (i % rows) * itemH;
    const size = fit(it.label, Math.min(20, itemH * 0.5), colW - sw - 26, true);
    out.push(`<rect x="${r1(cx)}" y="${r1(cy + (itemH - sw) / 2)}" width="${r1(sw)}" height="${r1(sw)}" rx="4" fill="${it.fill}" stroke="${it.stroke}" stroke-width="${it.thick ? 2.5 : 1.5}"/>`);
    out.push(text(cx + sw + 12, cy + itemH / 2 + size * 0.36, it.label, { size, weight: 700, fill: theme.title }));
  });
  return out.join('');
}

// ---- notes ---------------------------------------------------------------

function keyLabel(key) {
  const p = PROPERTIES[key];
  return p.label.charAt(0).toLowerCase() + p.label.slice(1) + (p.unit ? ` (${p.unit})` : '');
}

function tileKey(state) {
  const f = state.fields;
  const bits = [];
  if (f.number) bits.push('atomic number');
  if (f.symbol) bits.push('symbol');
  if (f.name) bits.push('element name');
  if (f.mass) bits.push('atomic mass (u)');
  if (state.line !== 'none') bits.push(keyLabel(state.line));
  let s = bits.length ? `Each tile: ${bits.join(' • ')}` : '';
  if (state.corner !== 'none') s += `${s ? '; ' : 'Each tile: '}top right: ${keyLabel(state.corner)}`;
  return s;
}

function noteLines(state, colorer, data) {
  const lines = [];
  for (const n of (state.notes || '').split('\n')) if (n.trim()) lines.push({ str: n.trim() });
  if (state.showSchemeNotes) {
    for (const n of colorer.scheme.notes) lines.push({ str: n });
    if (state.layout !== '32') lines.push({ str: 'The detached rows belong to periods 6 and 7.' });
    if ([state.line, state.corner].includes('ion')) lines.push({ str: 'Ion charges shown are typical for main-group elements; many elements form other ions too.' });
    if ([state.line, state.corner].includes('state')) lines.push({ str: '* Predicted state; not yet measured.' });
  }
  const massShown = state.fields.mass && state.showIsotopeNote;
  if (massShown) lines.push({ str: '† Mass of a selected isotope, rather than an average atomic mass.', gap: 8 });
  if (state.showSource) {
    const src = `Element data: ${data.meta.source} (pubchem.ncbi.nlm.nih.gov).${state.fields.mass ? ` Masses displayed to ${state.massDecimals} decimal places; source precision varies.` : ''}`;
    lines.push({ str: src, faint: true, gap: 6 });
  }
  return lines;
}

// ---- main ----------------------------------------------------------------

export function renderSVG(state, data, opts = {}) {
  const elements = data.elements;
  const theme = THEMES[state.theme] || THEMES.light;
  const L = computeLayout(state, elements);
  const colorer = makeColorer(state, elements, theme);
  const usedIdx = [...new Set(Object.values(state.highlights))].filter((i) => state.palette[i]).sort((a, b) => a - b);
  const hl = { any: usedIdx.length > 0, used: usedIdx };

  const out = [];
  if (L.titleY) out.push(text(L.X0, L.titleY, state.title, { size: 40, weight: 800, fill: theme.title }));
  if (L.subtitleY) out.push(text(L.X0, L.subtitleY, state.subtitle, { size: 24, fill: theme.muted }));

  if (L.headerY) {
    for (let g = 1; g <= 18; g++) {
      const x = L.X0 + L.groupCol(g) * PX;
      const label = state.groupLabels === 'cas' ? CAS[g - 1] : String(g);
      out.push(`<g class="grp" data-group="${g}"><rect x="${x}" y="${L.headerY - 26}" width="${W}" height="34" fill="transparent"/>` +
        text(x + W / 2, L.headerY, label, { size: state.groupLabels === 'cas' ? 19 : 22, weight: 700, fill: theme.groupNum, anchor: 'middle' }) + '</g>');
    }
  }
  if (state.showPeriodLabels) {
    for (let p = 1; p <= 7; p++) {
      const y = L.Y0 + (p - 1) * PY;
      out.push(`<g class="per" data-period="${p}"><rect x="${M}" y="${y}" width="40" height="${H}" fill="transparent"/>` +
        text(M + 18, y + H / 2 + 9, p, { size: 25, weight: 700, fill: theme.periodNum, anchor: 'middle' }) + '</g>');
    }
  }

  out.push(legendSVG(L, state, colorer, theme, hl));
  for (const t of L.tiles) out.push(tileSVG(t, state, theme, colorer, hl));
  for (const p of L.placeholders) out.push(placeholderSVG(p, theme, state, hl));

  if (L.keyY) {
    const key = tileKey(state);
    if (key) out.push(text(L.X0, L.keyY, key, { size: fit(key, 19, L.width - L.X0 - M), fill: theme.text }));
  }

  if (L.fY0 != null) {
    const lx = L.X0 + 3 * PX - 22;
    [['Period 6', 'Lanthanides', 6], ['Period 7', 'Actinides', 7]].forEach(([a, b, p], i) => {
      const y = L.fY0 + i * PY;
      out.push(`<g class="per" data-period="${p}">` +
        text(lx, y + 38, a, { size: 20, weight: 700, fill: theme.periodNum, anchor: 'end' }) +
        text(lx, y + 64, b, { size: 17, fill: theme.text, anchor: 'end' }) + '</g>');
    });
  }

  let y = L.contentBottom + 24;
  const noteW = L.width - L.X0 - M;
  for (const line of noteLines(state, colorer, data)) {
    const size = line.faint ? 16 : 18;
    y += line.gap || 0;
    for (const w of wrap(line.str, size, noteW)) {
      y += size + 10;
      out.push(text(L.X0, y, w, { size, fill: line.faint ? theme.faint : theme.text }));
    }
  }
  const height = Math.round(y + M);

  const bg = state.transparent ? '' : `<rect width="100%" height="100%" fill="${theme.bg}"/>`;
  const dims = opts.fluid ? '' : ` width="${L.width}" height="${height}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.width} ${height}"${dims} font-family="${esc(FONT)}" role="img" aria-label="${esc(state.title || 'Periodic table')}">` +
    bg + out.join('') + '</svg>';
}
