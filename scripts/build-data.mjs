#!/usr/bin/env node
// Builds data/elements.json from PubChem's periodic table dataset.
//
//   node scripts/build-data.mjs                 # download fresh data from PubChem PUG-REST
//   node scripts/build-data.mjs path/to/file    # use a local PubChem CSV or JSON export
//
// PubChem publishes the dataset at:
//   https://pubchem.ncbi.nlm.nih.gov/rest/pug/periodictable/JSON
//   https://pubchem.ncbi.nlm.nih.gov/rest/pug/periodictable/CSV
// A copy of the CSV is kept in data/PubChemElements_all.csv so the build is reproducible offline.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBCHEM_JSON = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/periodictable/JSON';

// Elements with no stable isotopes and no IUPAC standard atomic weight. For these PubChem
// reports the mass of a selected (usually longest-lived) isotope. Th, Pa and U do have
// standard atomic weights, so they are not included.
const ISOTOPE_MASS = new Set([43, 61, 84, 85, 86, 87, 88, 89, ...range(93, 118)]);

// IUPAC/CIAAW standard atomic weights (ciaaw.org, including the 2024 revisions to Zr, Gd
// and Lu). PubChem rounds some of these coarsely (Li is listed as 7.0), so they replace
// PubChem's AtomicMass for every element that has one. Where CIAAW gives an interval
// (H, Li, B, C, N, O, Mg, Si, S, Cl, Ar, Br, Tl, Pb) this is its conventional value.
const STANDARD_ATOMIC_WEIGHT = {
  1: 1.008, 2: 4.002602, 3: 6.94, 4: 9.0121831, 5: 10.81, 6: 12.011, 7: 14.007,
  8: 15.999, 9: 18.998403162, 10: 20.1797, 11: 22.98976928, 12: 24.305, 13: 26.9815384,
  14: 28.085, 15: 30.973761998, 16: 32.06, 17: 35.45, 18: 39.95, 19: 39.0983, 20: 40.078,
  21: 44.955907, 22: 47.867, 23: 50.9415, 24: 51.9961, 25: 54.938043, 26: 55.845,
  27: 58.933194, 28: 58.6934, 29: 63.546, 30: 65.38, 31: 69.723, 32: 72.630, 33: 74.921595,
  34: 78.971, 35: 79.904, 36: 83.798, 37: 85.4678, 38: 87.62, 39: 88.905838, 40: 91.222,
  41: 92.90637, 42: 95.95, 44: 101.07, 45: 102.90549, 46: 106.42, 47: 107.8682, 48: 112.414,
  49: 114.818, 50: 118.710, 51: 121.760, 52: 127.60, 53: 126.90447, 54: 131.293,
  55: 132.90545196, 56: 137.327, 57: 138.90547, 58: 140.116, 59: 140.90766, 60: 144.242,
  62: 150.36, 63: 151.964, 64: 157.249, 65: 158.925354, 66: 162.500, 67: 164.930329,
  68: 167.259, 69: 168.934219, 70: 173.045, 71: 174.96669, 72: 178.486, 73: 180.94788,
  74: 183.84, 75: 186.207, 76: 190.23, 77: 192.217, 78: 195.084, 79: 196.966570,
  80: 200.592, 81: 204.38, 82: 207.2, 83: 208.98040, 90: 232.0377, 91: 231.03588,
  92: 238.02891,
};

function range(a, b) {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.length > 1);
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

function parsePubChemJson(json) {
  const cols = json.Table.Columns.Column;
  return json.Table.Row.map((r) => Object.fromEntries(cols.map((c, i) => [c, r.Cell[i] ?? ''])));
}

function num(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function periodOf(z) {
  return z <= 2 ? 1 : z <= 10 ? 2 : z <= 18 ? 3 : z <= 36 ? 4 : z <= 54 ? 5 : z <= 86 ? 6 : 7;
}

// Group 1–18, or null for the 15 lanthanides / actinides (La–Lu, Ac–Lr).
function groupOf(z) {
  const p = periodOf(z);
  if (p === 1) return z === 1 ? 1 : 18;
  if (p <= 3) {
    const o = z - (p === 2 ? 3 : 11) + 1;
    return o <= 2 ? o : o + 10;
  }
  if (p <= 5) return z - (p === 4 ? 19 : 37) + 1;
  const start = p === 6 ? 55 : 87;
  const o = z - start + 1;
  if (o <= 2) return o;
  if (o <= 17) return null;
  return o - 14;
}

function blockOf(z, group) {
  if (z === 2 || group === 1 || group === 2) return 's';
  if (group >= 13) return 'p';
  if (group >= 3 || z === 71 || z === 103) return 'd';
  return 'f';
}

function yearOf(v) {
  const n = num(v);
  return n == null ? (v ? String(v) : null) : n;
}

async function loadRows(src) {
  if (!src) {
    console.log(`Downloading ${PUBCHEM_JSON}`);
    const res = await fetch(PUBCHEM_JSON);
    if (!res.ok) throw new Error(`PubChem request failed: ${res.status}`);
    return { rows: parsePubChemJson(await res.json()), origin: PUBCHEM_JSON };
  }
  const text = await readFile(src, 'utf8');
  const rows = src.endsWith('.json') ? parsePubChemJson(JSON.parse(text)) : parseCsv(text);
  return { rows, origin: path.basename(src) };
}

async function main() {
  const src = process.argv[2];
  const { rows, origin } = await loadRows(src);
  const elements = rows.map((r) => {
    const z = Number(r.AtomicNumber);
    const group = groupOf(z);
    return {
      z,
      symbol: r.Symbol,
      name: r.Name,
      mass: STANDARD_ATOMIC_WEIGHT[z] ?? num(r.AtomicMass),
      isotopeMass: ISOTOPE_MASS.has(z),
      group,
      period: periodOf(z),
      block: blockOf(z, group),
      category: r.GroupBlock || null,
      config: r.ElectronConfiguration || null,
      en: num(r.Electronegativity),
      radius: num(r.AtomicRadius),
      ie: num(r.IonizationEnergy),
      ea: num(r.ElectronAffinity),
      ox: r.OxidationStates || null,
      state: r.StandardState || null,
      mp: num(r.MeltingPoint),
      bp: num(r.BoilingPoint),
      density: num(r.Density),
      year: yearOf(r.YearDiscovered),
      cpk: r.CPKHexColor ? `#${r.CPKHexColor}` : null,
    };
  }).sort((a, b) => a.z - b.z);

  if (elements.length !== 118) throw new Error(`Expected 118 elements, got ${elements.length}`);
  for (const el of elements) {
    if (!el.isotopeMass && !(el.z in STANDARD_ATOMIC_WEIGHT)) throw new Error(`No standard atomic weight for ${el.symbol}`);
  }

  const out = {
    meta: {
      source: 'PubChem',
      sourceUrl: 'https://pubchem.ncbi.nlm.nih.gov/periodic-table/',
      dataset: PUBCHEM_JSON,
      builtFrom: origin,
      built: new Date().toISOString().slice(0, 10),
      notes: [
        'AtomicRadius in PubChem is the van der Waals radius (pm).',
        'IonizationEnergy and ElectronAffinity are in eV; MeltingPoint and BoilingPoint in K; Density in g/cm³.',
        'Masses are IUPAC/CIAAW standard atomic weights (conventional values where CIAAW gives an interval); PubChem is used only for isotopeMass elements.',
        'isotopeMass marks elements whose listed mass is for a selected isotope rather than a standard atomic weight.',
      ],
    },
    elements,
  };
  const dest = path.join(ROOT, 'data', 'elements.json');
  await writeFile(dest, JSON.stringify(out, null, 1) + '\n');
  console.log(`Wrote ${elements.length} elements to ${path.relative(ROOT, dest)}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
