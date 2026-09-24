// Element properties that can be shown on tiles, used for heatmaps, or listed in the stats pane.

const fmt = (decimals) => (v) => (v == null ? '' : Number(v).toFixed(decimals));

// Typical ion charge for main-group elements (a classroom simplification).
function ionCharge(el) {
  if (el.z === 1) return '1+';
  switch (el.group) {
    case 1: return el.z <= 87 ? '1+' : '';
    case 2: return el.z <= 88 ? '2+' : '';
    case 13: return el.z >= 13 && el.z <= 49 ? '3+' : '';
    case 15: return el.z <= 15 ? '3−' : '';
    case 16: return el.z <= 34 ? '2−' : '';
    case 17: return el.z <= 53 ? '1−' : '';
    case 18: return el.z <= 86 ? '0' : '';
    default: return '';
  }
}

function valenceElectrons(el) {
  if (el.z === 2) return 2;
  if (el.group === 1 || el.group === 2) return el.group;
  if (el.group >= 13) return el.group - 10;
  return null;
}

function stateLabel(el) {
  if (!el.state) return '';
  return el.state.replace(/^Expected to be a /, '') + (el.state.startsWith('Expected') ? '*' : '');
}

export const PROPERTIES = {
  mass: { label: 'Atomic mass', unit: 'u', get: (el) => el.mass, format: fmt(3) },
  en: { label: 'Electronegativity', unit: 'Pauling', get: (el) => el.en, format: fmt(2), heat: true },
  radius: { label: 'Atomic radius (van der Waals)', unit: 'pm', get: (el) => el.radius, format: fmt(0), heat: true },
  ie: { label: 'First ionization energy', unit: 'eV', get: (el) => el.ie, format: fmt(2), heat: true },
  ea: { label: 'Electron affinity', unit: 'eV', get: (el) => el.ea, format: fmt(2), heat: true },
  density: { label: 'Density', unit: 'g/cm³', get: (el) => el.density, format: (v) => (v == null ? '' : v < 0.01 ? v.toExponential(1) : v < 10 ? v.toFixed(2) : v.toFixed(1)), heat: true, log: true },
  mp: { label: 'Melting point', unit: 'K', get: (el) => el.mp, format: fmt(0), heat: true },
  bp: { label: 'Boiling point', unit: 'K', get: (el) => el.bp, format: fmt(0), heat: true },
  year: { label: 'Year discovered', unit: '', get: (el) => (typeof el.year === 'number' ? el.year : null), format: (v) => (v == null ? '' : String(v)), display: (el) => (el.year == null ? '' : String(el.year)), heat: true },
  valence: { label: 'Valence electrons (main group)', unit: '', get: valenceElectrons, format: (v) => (v == null ? '' : String(v)) },
  ion: { label: 'Common ion charge (main group)', unit: '', get: ionCharge, format: (v) => v || '' },
  ox: { label: 'Oxidation states', unit: '', get: (el) => el.ox, format: (v) => (v || '').replace(/-/g, '−') },
  config: { label: 'Electron configuration', unit: '', get: (el) => el.config, format: (v) => (v || '').replace(/\s*\([^)]*\)/g, '') },
  state: { label: 'State at room temperature', unit: '', get: stateLabel, format: (v) => v || '' },
  block: { label: 'Block', unit: '', get: (el) => el.block, format: (v) => v || '' },
  category: { label: 'Category (PubChem)', unit: '', get: (el) => el.category, format: (v) => v || '' },
};

// Properties offered as a tile's corner value (short) and as an extra text line (can be long).
export const CORNER_FIELDS = ['none', 'en', 'radius', 'ie', 'ea', 'density', 'mp', 'bp', 'valence', 'ion', 'block', 'year'];
export const LINE_FIELDS = ['none', 'config', 'ox', 'state', 'category', 'en', 'radius', 'ie', 'ea', 'density', 'mp', 'bp', 'valence', 'ion', 'year'];
export const HEAT_FIELDS = Object.keys(PROPERTIES).filter((k) => PROPERTIES[k].heat);

export function displayValue(key, el) {
  const p = PROPERTIES[key];
  if (!p) return '';
  if (p.display) return p.display(el);
  return p.format(p.get(el));
}

export function unitLabel(key) {
  const p = PROPERTIES[key];
  return p.unit ? `${p.label} (${p.unit})` : p.label;
}
