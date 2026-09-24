// Table configuration: defaults, merging, and (de)serialisation for share links.

export const DEFAULT_PALETTE = [
  { color: '#f2c14e', label: 'Highlight' },
  { color: '#e5534b', label: 'Red' },
  { color: '#4a8fe7', label: 'Blue' },
  { color: '#4fb56a', label: 'Green' },
  { color: '#9b6bd6', label: 'Purple' },
  { color: '#f08c3a', label: 'Orange' },
];

export function defaultState() {
  return {
    v: 1,
    title: 'Periodic table of the elements',
    subtitle: '',
    notes: '',
    showKey: true,
    showSource: true,
    showIsotopeNote: true,
    showSchemeNotes: true,
    showLegend: true,
    scheme: 'families',
    heatProperty: 'en',
    ramp: 'warm',
    fields: { number: true, symbol: true, name: true, mass: true },
    massDecimals: 3,
    corner: 'none',
    line: 'none',
    layout: '18',
    groupLabels: 'iupac',
    showPeriodLabels: true,
    palette: DEFAULT_PALETTE.map((p) => ({ ...p })),
    highlights: {},
    blanks: [],
    blankKeepsNumber: true,
    dimOthers: false,
    showHighlightLegend: true,
    theme: 'light',
    transparent: false,
  };
}

// Deep-ish merge of a partial state (e.g. a preset) over the defaults.
export function makeState(partial = {}) {
  const base = defaultState();
  const out = { ...base, ...partial };
  out.fields = { ...base.fields, ...(partial.fields || {}) };
  if (partial.palette) {
    out.palette = base.palette.map((p, i) => ({ ...p, ...(partial.palette[i] || {}) }));
  }
  out.highlights = { ...(partial.highlights || {}) };
  out.blanks = [...(partial.blanks || [])];
  return out;
}

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// Only store what differs from the defaults, to keep links short.
export function encodeState(state) {
  const base = defaultState();
  const diff = {};
  for (const [k, v] of Object.entries(state)) {
    if (JSON.stringify(v) !== JSON.stringify(base[k])) diff[k] = v;
  }
  return toBase64Url(JSON.stringify(diff));
}

export function decodeState(s) {
  return makeState(JSON.parse(fromBase64Url(s)));
}
