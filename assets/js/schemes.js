// Color schemes: each maps an element to a category (with a legend), or to a heatmap value.

import { PROPERTIES, unitLabel } from './properties.js';

// ---- color helpers -------------------------------------------------------

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

export function mix(a, b, t) {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex(x.map((v, i) => v + (y[i] - v) * t));
}

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function grayscale(hex) {
  const [r, g, b] = hexToRgb(hex);
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  return rgbToHex([y, y, y]);
}

// ---- themes --------------------------------------------------------------

export const THEMES = {
  light: {
    label: 'Light', bg: '#ffffff', title: '#13233a', text: '#1b2a3a', muted: '#4a5968', faint: '#6b7a89',
    groupNum: '#2a8a8f', periodNum: '#c0842f', tileFill: '#f7f9fb', tileStroke: '#c9d2db', placeholder: '#eef2f5',
  },
  dark: {
    label: 'Dark (slides)', bg: '#0f1822', title: '#f2f6fa', text: '#e8eef4', muted: '#a9b8c6', faint: '#8898a8',
    groupNum: '#5fcacd', periodNum: '#eaa84c', tileFill: '#1b2633', tileStroke: '#3b4b5d', placeholder: '#16202b',
  },
  print: {
    label: 'Print (grayscale)', bg: '#ffffff', title: '#000000', text: '#000000', muted: '#333333', faint: '#555555',
    groupNum: '#333333', periodNum: '#333333', tileFill: '#ffffff', tileStroke: '#555555', placeholder: '#f2f2f2', gray: true,
  },
};

// Turn a base hue into a tile fill + stroke that suits the theme.
export function tileColors(base, theme) {
  if (theme.gray) {
    const g = grayscale(base);
    return { fill: mix(g, '#ffffff', 0.55), stroke: '#444444' };
  }
  if (theme === THEMES.dark) return { fill: mix(base, theme.bg, 0.62), stroke: base };
  return { fill: mix(base, '#ffffff', 0.74), stroke: mix(base, '#000000', 0.08) };
}

export function textOn(fill, theme) {
  return luminance(fill) > 0.36 ? (theme.gray ? '#000000' : '#16283a') : '#ffffff';
}

// ---- categorical schemes -------------------------------------------------

const C = {
  red: '#e2785c', amber: '#e3b447', lime: '#9fc45a', sky: '#5bb6d8', indigo: '#8c91e3',
  violet: '#b58be0', pink: '#e27ba9', teal: '#4ebf9f', slate: '#8fb0c8', sand: '#c9a77c',
  rose: '#d9738a', olive: '#b5b35a', gray: '#a8b3bd', blue: '#5b8fe0', brown: '#b0806a',
};

const families = {
  label: 'Element families (groups)',
  categories: [
    { key: 'g1', label: '1 · Alkali metals', color: C.red },
    { key: 'g2', label: '2 · Alkaline earth metals', color: C.amber },
    { key: 'g13', label: '13 · Boron group', color: C.lime },
    { key: 'g14', label: '14 · Carbon group', color: C.sky },
    { key: 'g15', label: '15 · Nitrogen group', color: C.indigo },
    { key: 'g16', label: '16 · Oxygen group (chalcogens)', color: C.violet },
    { key: 'g17', label: '17 · Halogens', color: C.pink },
    { key: 'g18', label: '18 · Noble gases', color: C.teal },
    { key: 'tm', label: 'Groups 3–12 · Transition metals', color: C.slate },
  ],
  categorize(el) {
    if (el.z === 1) return null;
    if (el.group == null) return null;
    if (el.group >= 3 && el.group <= 12) return 'tm';
    return `g${el.group}`;
  },
  notes: ['Hydrogen is not an alkali metal. Transition metals are shown using the common classroom grouping (3–12).'],
};

const pubchem = {
  label: 'Element categories (PubChem)',
  categories: [
    { key: 'Alkali metal', label: 'Alkali metals', color: C.red },
    { key: 'Alkaline earth metal', label: 'Alkaline earth metals', color: C.amber },
    { key: 'Transition metal', label: 'Transition metals', color: C.slate },
    { key: 'Post-transition metal', label: 'Post-transition metals', color: C.sky },
    { key: 'Metalloid', label: 'Metalloids', color: C.lime },
    { key: 'Nonmetal', label: 'Reactive nonmetals', color: C.olive },
    { key: 'Halogen', label: 'Halogens', color: C.pink },
    { key: 'Noble gas', label: 'Noble gases', color: C.teal },
    { key: 'Lanthanide', label: 'Lanthanides', color: C.violet },
    { key: 'Actinide', label: 'Actinides', color: C.rose },
  ],
  categorize: (el) => el.category,
  notes: ['Categories follow PubChem’s element classification.'],
};

const metals = {
  label: 'Metals, nonmetals & metalloids',
  categories: [
    { key: 'metal', label: 'Metals', color: C.slate },
    { key: 'metalloid', label: 'Metalloids', color: C.lime },
    { key: 'nonmetal', label: 'Nonmetals', color: C.amber },
  ],
  categorize(el) {
    if (el.category === 'Metalloid') return 'metalloid';
    if (['Nonmetal', 'Halogen', 'Noble gas'].includes(el.category)) return 'nonmetal';
    return 'metal';
  },
  notes: ['Classification follows PubChem; the metalloid boundary is drawn differently in some textbooks.'],
};

const blocks = {
  label: 'Blocks (s, p, d, f)',
  categories: [
    { key: 's', label: 's-block', color: C.red },
    { key: 'p', label: 'p-block', color: C.amber },
    { key: 'd', label: 'd-block', color: C.sky },
    { key: 'f', label: 'f-block', color: C.lime },
  ],
  categorize: (el) => el.block,
  notes: ['Helium is placed in group 18 but is an s-block element. Lu and Lr are treated as d-block (IUPAC).'],
};

const states = {
  label: 'State at room temperature',
  categories: [
    { key: 'Solid', label: 'Solid', color: C.slate },
    { key: 'Liquid', label: 'Liquid', color: C.sky },
    { key: 'Gas', label: 'Gas', color: C.amber },
    { key: 'Unknown', label: 'Predicted (not measured)', color: C.gray },
  ],
  categorize(el) {
    if (!el.state || el.state.startsWith('Expected')) return 'Unknown';
    return el.state;
  },
  notes: ['States at 298 K and 1 atm, from PubChem. Superheavy elements have only predicted states.'],
};

const none = {
  label: 'None (plain tiles)',
  categories: [],
  categorize: () => null,
  notes: [],
};

const heatmap = { label: 'Property heatmap (trends)', heat: true, categories: [], categorize: () => null, notes: [] };

export const SCHEMES = { families, pubchem, metals, blocks, states, heatmap, none };

// ---- heatmap ramps -------------------------------------------------------

export const RAMPS = {
  warm: { label: 'Warm', stops: ['#fff6d8', '#fde0a1', '#f8b676', '#ec895c', '#d15f5d', '#a3446e', '#6c3376'] },
  cool: { label: 'Cool', stops: ['#f1f9fd', '#cde8f3', '#9fd0e6', '#6cb2d6', '#468fc2', '#2d6aa8', '#1c4580'] },
  green: { label: 'Green', stops: ['#f5fbe9', '#d9efbc', '#b1dc93', '#7fc47a', '#4ea56b', '#2d815d', '#195c4c'] },
  gray: { label: 'Grayscale', stops: ['#f7f7f7', '#dcdcdc', '#bdbdbd', '#969696', '#737373', '#525252', '#252525'] },
};

export function rampColor(ramp, t) {
  const stops = ramp.stops;
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  return mix(stops[i], stops[i + 1], x - i);
}

export function heatScale(elements, key) {
  const p = PROPERTIES[key];
  const vals = elements.map((el) => p.get(el)).filter((v) => typeof v === 'number' && (!p.log || v > 0));
  let min = Math.min(...vals), max = Math.max(...vals);
  const tf = p.log ? Math.log10 : (v) => v;
  const a = tf(min), b = tf(max);
  return {
    min, max, log: !!p.log, label: unitLabel(key),
    t(el) {
      const v = p.get(el);
      if (typeof v !== 'number' || (p.log && v <= 0)) return null;
      return b === a ? 0.5 : (tf(v) - a) / (b - a);
    },
  };
}
