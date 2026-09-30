// Ionic and covalent bonds between two main-group elements, drawn with Bohr models.
// analyzeBond works out what the two elements form (ions and their ratio, or shared pairs and the
// molecule's shape); renderBondSVG draws it before and after bonding.
// Pure (returns data and SVG strings) so it works in the browser and in Node tests.

import { THEMES, textOn, mix } from './schemes.js';
import { electronShells, ionShells, chargeLabel, bohrColors } from './bohr.js';

const FONT = "'Segoe UI', 'Helvetica Neue', Helvetica, Arial, 'DejaVu Sans', sans-serif";
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = (n) => Math.round(n * 10) / 10;
const TAU = 2 * Math.PI;
const DEG = Math.PI / 180;

// ---- text helpers ------------------------------------------------------------

const SUB = '₀₁₂₃₄₅₆₇₈₉';
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const subscript = (n) => (n === 1 ? '' : String(n).replace(/\d/g, (d) => SUB[d]));
// Ion as plain text: Na⁺, Mg²⁺, O²⁻.
export const ionText = (symbol, charge) => symbol + chargeLabel(charge).replace(/\d/g, (d) => SUP[d]).replace('+', '⁺').replace('−', '⁻');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const lower = (el) => el.name.toLowerCase();

// ---- classifying elements ------------------------------------------------------

const METALS = new Set(['Alkali metal', 'Alkaline earth metal', 'Post-transition metal']);
const NONMETALS = new Set(['Nonmetal', 'Halogen']);

// 'metal' | 'nonmetal' | 'metalloid' | 'noble' | 'other' (transition and f-block metals, and the
// superheavy elements, whose chemistry is predicted or doesn't follow the octet rule).
export function bondKind(el) {
  if (!el || el.z > 88 || !(el.block === 's' || el.block === 'p') || el.group == null) return 'other';
  if (el.category === 'Noble gas') return 'noble';
  if (METALS.has(el.category)) return 'metal';
  if (NONMETALS.has(el.category)) return 'nonmetal';
  if (el.category === 'Metalloid') return 'metalloid';
  return 'other';
}

// Outer-shell electrons of a main-group atom.
export function valence(el) {
  return el.group <= 2 ? el.group : el.group - 10;
}

// Covalent bonds an atom forms: the electrons it needs to fill its outer shell (2 for hydrogen,
// 8 for the rest). Boron has only 3 electrons to share, so it forms 3 (and ends up with 6).
export function bondCapacity(el) {
  if (el.z === 1) return 1;
  const v = valence(el);
  return v >= 4 ? 8 - v : v;
}

// The usual ion of a metal. Groups 1, 2 and 13 lose all their outer electrons; the heavier
// post-transition metals usually keep an s pair (the "inert pair").
const USUAL_CATION = { Tl: 1, Sn: 2, Pb: 2, Bi: 3 };
const OTHER_CATION = { Tl: 3, Sn: 4, Pb: 4 };
const ROMAN = ['', 'I', 'II', 'III', 'IV'];
export const cationCharge = (el) => USUAL_CATION[el.symbol] ?? (el.group <= 2 ? el.group : 3);
// Electrons a nonmetal gains: enough to fill its outer shell. Carbon doesn't form simple anions.
export const anionCharge = (el) => (el.z === 1 ? 1 : el.group >= 15 ? 18 - el.group : null);

const NOBLE_BY_ELECTRONS = { 2: 'helium', 10: 'neon', 18: 'argon', 36: 'krypton', 54: 'xenon', 86: 'radon' };

// Order of elements in binary covalent formulas (IUPAC's sequence, main-group part): H₂O, NH₃, Cl₂O, OF₂.
const FORMULA_ORDER = ['B', 'Si', 'Ge', 'C', 'Sb', 'As', 'P', 'N', 'H', 'Po', 'Te', 'Se', 'S', 'At', 'I', 'Br', 'Cl', 'O', 'F'];
const ROOTS = {
  H: 'hydr', B: 'bor', C: 'carb', N: 'nitr', O: 'ox', F: 'fluor', Si: 'silic', P: 'phosph', S: 'sulf',
  Cl: 'chlor', Ge: 'german', As: 'arsen', Se: 'selen', Br: 'brom', Sb: 'antimon', Te: 'tellur', I: 'iod', Po: 'polon', At: 'astat',
};
const PREFIX = ['', 'mono', 'di', 'tri', 'tetra'];
const COMMON_NAMES = {
  H2O: 'water', NH3: 'ammonia', CH4: 'methane', SiH4: 'silane', GeH4: 'germane', PH3: 'phosphine',
  AsH3: 'arsine', SbH3: 'stibine', BH3: 'borane',
};

function covalentName(parts, formulaKey) {
  if (COMMON_NAMES[formulaKey]) return COMMON_NAMES[formulaKey];
  const [[first, n1], [second, n2]] = parts;
  const ide = `${ROOTS[second.symbol]}ide`;
  // Hydrogen compounds are named without prefixes: hydrogen chloride, hydrogen sulfide.
  if (first.z === 1) return `hydrogen ${ide}`;
  const p2 = (PREFIX[n2] + ide).replace(/([ao])o/, '$1'); // mono + oxide → monoxide
  return `${n1 > 1 ? PREFIX[n1] : ''}${lower(first)} ${p2}`;
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

// ---- analysis ------------------------------------------------------------------

// What two elements form. Returns { ok: false, reason } when this tool can't draw it, otherwise
// { ok, type: 'ionic' | 'covalent', formula, name, title, dEN, atoms, layout, transfers | bonds,
// explain: [sentences], notes: [sentences], summary }.
// Atoms are in drawing order. Each has el, owner (0 = first element picked, 1 = second: sets the
// color of its electrons), and for ions its charge.
export function analyzeBond(a, b) {
  const fail = (reason) => ({ ok: false, reason });
  if (!a || !b) return fail('Pick two elements.');
  for (const el of [a, b]) {
    const kind = bondKind(el);
    if (kind === 'other') {
      return fail(el.z > 88
        ? `${el.name} is a superheavy element: only a few atoms have ever been made, so its bonding isn't known well enough to draw.`
        : `${el.name} is a ${el.block}-block metal. Its ions don't follow the simple octet rule (many have more than one charge), so this tool sticks to groups 1, 2 and 13–17.`);
    }
    if (kind === 'noble') return fail(`${el.name} is a noble gas: its outer shell is already full, so it doesn't normally form bonds.`);
  }
  const ka = bondKind(a), kb = bondKind(b);
  if (ka === 'metal' && kb === 'metal') {
    return fail(a === b
      ? `${a.name} atoms are held together by metallic bonding (a lattice of ions in a sea of electrons), not ionic or covalent bonds.`
      : `Two metals don't form ionic or covalent bonds: they mix as an alloy, held together by metallic bonding.`);
  }
  if (ka === 'metal' || kb === 'metal') {
    const [metal, other] = ka === 'metal' ? [a, b] : [b, a];
    if (bondKind(other) === 'metalloid') return fail(`${metal.name} and ${lower(other)} (a metalloid) don't form a simple ionic compound. Pair ${lower(metal)} with a nonmetal such as oxygen or chlorine.`);
    return ionic(metal, other, a);
  }
  return covalent(a, b);
}

function enNote(dEN) {
  return `Electronegativity difference: ${dEN.toFixed(2)}.`;
}

function ionic(cat, an, first) {
  const fail = (reason) => ({ ok: false, reason });
  const x = anionCharge(an);
  if (!x) return fail(`${cat.name} and ${lower(an)} don't form a simple ionic compound, because ${lower(an)} doesn't form a simple negative ion.`);
  const q = cationCharge(cat);
  const g = gcd(q, x);
  const nC = x / g, nA = q / g;
  const owner = (el) => (el === first ? 0 : 1);
  const C = () => ({ el: cat, owner: owner(cat), charge: q, role: 'cation' });
  const A = () => ({ el: an, owner: owner(an), charge: -x, role: 'anion' });

  // Layout: one ion in the middle of the others (MgCl₂, Na₂O, AlCl₃), or a row that alternates
  // (NaCl, Al₂O₃, Ca₃N₂), so every electron moves to a neighbor.
  let atoms, layout;
  if (nC === 1 && nA === 1) { atoms = [C(), A()]; layout = { kind: 'row' }; }
  else if (nC === 1 || nA === 1) {
    const n = Math.max(nC, nA);
    atoms = nC === 1 ? [C(), ...Array.from({ length: n }, A)] : [A(), ...Array.from({ length: n }, C)];
    layout = { kind: 'star', angles: n === 2 ? [180, 0] : [270, 30, 150] };
  } else {
    const big = nC > nA ? C : A, small = nC > nA ? A : C;
    atoms = Array.from({ length: nC + nA }, (_, i) => (i % 2 ? small() : big()));
    layout = { kind: 'row' };
  }

  // Each cation hands its electrons to its neighbors, filling the first one first.
  const need = atoms.map((at) => Math.max(0, -at.charge));
  const transfers = [];
  const neighbors = (i) => (layout.kind === 'row' ? [i - 1, i + 1] : i === 0 ? atoms.map((_, j) => j).slice(1) : [0]);
  atoms.forEach((at, i) => {
    let left = at.charge > 0 ? at.charge : 0;
    for (const j of neighbors(i)) {
      if (j < 0 || j >= atoms.length || !left) continue;
      const n = Math.min(left, need[j]);
      if (n) { transfers.push({ from: i, to: j, n }); need[j] -= n; left -= n; }
    }
  });

  const formula = `${cat.symbol}${subscript(nC)}${an.symbol}${subscript(nA)}`;
  // Metals with more than one common ion get the charge in the name: lead(II) oxide.
  const name = `${lower(cat)}${OTHER_CATION[cat.symbol] ? `(${ROMAN[q]})` : ''} ${ROOTS[an.symbol]}ide`;
  const dEN = Math.abs(cat.en - an.en);
  const catIon = ionText(cat.symbol, q), anIon = ionText(an.symbol, -x);
  const shells = (el, charge) => ionShells(electronShells(el), charge, el.z).join(', ');
  const like = (el, charge) => (NOBLE_BY_ELECTRONS[el.z - charge] ? `, like ${NOBLE_BY_ELECTRONS[el.z - charge]}` : '');
  const vCat = electronShells(cat).at(-1), vAn = valence(an);
  const full = an.z === 1 ? 'a full shell of 2' : 'a full shell of 8';

  const explain = [
    `${cat.name} is a metal with ${plural(vCat, 'outer electron')}${vCat !== q ? `, and it usually loses ${q} of them` : ''}. ${an.name} is a nonmetal with ${plural(vAn, 'outer electron')}: ${x} short of ${full}.`,
    `Each ${lower(cat)} atom gives away ${plural(q, 'electron')} and becomes ${catIon} (${shells(cat, q)}${like(cat, q)}). Each ${lower(an)} atom gains ${x} and becomes ${anIon} (${shells(an, -x)}${like(an, -x)}).`,
    nC === 1 && nA === 1
      ? `One ${catIon} balances one ${anIon}, so the formula is ${formula}.`
      : `${nC} ${catIon} ion${nC > 1 ? 's' : ''} (${nC * q}+ in total) balance${nC > 1 ? '' : 's'} ${nA} ${anIon} ion${nA > 1 ? 's' : ''} (${nA * x}− in total), so the formula is ${formula}.`,
    `The oppositely charged ions attract each other. That attraction is the ionic bond.`,
    `${enNote(dEN)} ${dEN >= 1.7 ? 'That’s above about 1.7, typical of an ionic bond.' : ''}`.trim(),
  ];
  const notes = [];
  if (dEN < 1.7) notes.push(`The electronegativity difference is below about 1.7, so the real bond is partly covalent. It’s usually still taught as ionic.`);
  if (OTHER_CATION[cat.symbol]) notes.push(`${cat.name} also forms ${ionText(cat.symbol, OTHER_CATION[cat.symbol])} ions.`);

  return {
    ok: true, type: 'ionic', formula, name, dEN, atoms, layout, transfers, explain, notes,
    title: `Ionic bonding: ${name}, ${formula}`,
    summary: `Ionic bonding in ${name}, ${formula}: each ${lower(cat)} atom gives ${plural(q, 'electron')} to ${lower(an)}, forming ${catIon} and ${anIon} ions.`,
  };
}

// Elements that exist as simple X₂ molecules with an octet on each atom.
const DIATOMIC = new Set(['H', 'N', 'O', 'F', 'Cl', 'Br', 'I', 'At']);
const NOT_DIATOMIC = {
  C: 'Carbon forms giant covalent structures (diamond and graphite), not C₂ molecules.',
  Si: 'Silicon forms a giant covalent structure like diamond, not Si₂ molecules.',
  B: 'Boron forms a giant covalent structure, not B₂ molecules.',
  P: 'Phosphorus forms P₄ molecules (or giant structures), with single bonds between four atoms, not P₂ molecules.',
  S: 'Sulfur forms rings of eight atoms (S₈) joined by single bonds, not S₂ molecules.',
};

function covalent(a, b) {
  const fail = (reason) => ({ ok: false, reason });
  let atoms, layout, bonds;
  if (a === b) {
    if (!DIATOMIC.has(a.symbol)) return fail(NOT_DIATOMIC[a.symbol] || `${a.name} doesn't form simple ${a.symbol}₂ molecules.`);
    atoms = [{ el: a, owner: 0 }, { el: a, owner: 1 }];
    layout = { kind: 'row' };
    bonds = [{ a: 0, b: 1, order: bondCapacity(a) }];
  } else {
    const ca = bondCapacity(a), cb = bondCapacity(b);
    const owner = (el) => (el === a ? 0 : 1);
    const simple = `${a.name} and ${lower(b)} don't form a simple molecule this tool can draw (one central atom with single, double or triple bonds, and a full outer shell on every atom).`;
    if (ca === cb) {
      if (ca !== 1) return fail(simple);
      const [x, y] = FORMULA_ORDER.indexOf(a.symbol) <= FORMULA_ORDER.indexOf(b.symbol) ? [a, b] : [b, a];
      atoms = [{ el: x, owner: owner(x) }, { el: y, owner: owner(y) }];
      layout = { kind: 'row' };
      bonds = [{ a: 0, b: 1, order: 1 }];
    } else {
      const [c, o] = ca > cb ? [a, b] : [b, a];
      const cc = bondCapacity(c), co = bondCapacity(o);
      if (cc % co || co > 3) return fail(simple);
      if (co > 1 && c.group === 14 && c.period > 2) {
        return fail(`${c.name} and ${lower(o)} form a giant covalent structure (like ${c.symbol}${o.symbol}₂ in sand), where each ${lower(c)} atom bonds to four ${lower(o)} atoms, not separate molecules.`);
      }
      const n = cc / co;
      const lone = (valence(c) - cc) / 2;
      // Bond directions around the central atom: a flat version of the real shape
      // (H₂O bent, NH₃ with its lone pair on top, CH₄ as a cross, CO₂ and BF₃ spread evenly).
      const angles = n === 4 ? [0, 90, 180, 270] : n === 3 ? (lone ? [180, 0, 90] : [270, 30, 150]) : n === 2 ? (lone ? [135, 45] : [180, 0]) : [0];
      atoms = [{ el: c, owner: owner(c) }, ...Array.from({ length: n }, () => ({ el: o, owner: owner(o) }))];
      layout = n === 1 ? { kind: 'row' } : { kind: 'star', angles };
      bonds = atoms.slice(1).map((_, i) => ({ a: 0, b: i + 1, order: co }));
    }
  }

  // Formula and name.
  const counts = new Map();
  for (const at of atoms) counts.set(at.el, (counts.get(at.el) || 0) + 1);
  const parts = [...counts].sort(([x], [y]) => FORMULA_ORDER.indexOf(x.symbol) - FORMULA_ORDER.indexOf(y.symbol));
  const formula = parts.map(([el, n]) => el.symbol + subscript(n)).join('');
  const key = parts.map(([el, n]) => el.symbol + (n > 1 ? n : '')).join('');
  const name = parts.length === 1 ? lower(a) : covalentName(parts, key);

  // Lone pairs: outer electrons not used in bonds.
  const bondsAt = atoms.map((_, i) => bonds.filter((bd) => bd.a === i || bd.b === i).reduce((s, bd) => s + bd.order, 0));
  atoms.forEach((at, i) => { at.lone = (valence(at.el) - bondsAt[i]) / 2; });

  const dEN = Math.abs(a.en - b.en);
  const order = bonds[0].order;
  const kindOf = { 1: 'single', 2: 'double', 3: 'triple' }[order];
  const pairs = plural(order, 'shared pair');
  const needs = (el) => (el.group === 13
    ? `${el.name} has ${plural(valence(el), 'outer electron')}, and shares all of them.`
    : `${el.name} has ${plural(valence(el), 'outer electron')} and needs ${bondCapacity(el)} more to fill its outer shell${el.z === 1 ? ' (a full first shell holds 2)' : ''}.`);
  const center = atoms[0];
  const explain = [...new Set(atoms.map((at) => at.el))].map(needs);
  if (a === b) {
    explain.push(`Two ${lower(a)} atoms each put ${plural(order, 'electron')} into ${order === 1 ? 'a shared pair' : `${order} shared pairs`}: a ${kindOf} covalent bond (${formula}).`);
  } else if (bonds.length === 1) {
    explain.push(`The two atoms share one pair of electrons, one from each: a single covalent bond (${formula}).`);
  } else {
    const o = atoms[1].el;
    explain.push(`The ${lower(center.el)} atom shares ${order === 1 ? 'one pair' : `${order} pairs`} of electrons with each of ${bonds.length} ${lower(o)} atoms, giving ${bonds.length} ${kindOf} bonds (${formula}).`);
  }
  const shellNow = [...new Set(atoms.map((at) => at.el))].map((el) => {
    const i = atoms.findIndex((at) => at.el === el);
    const count = valence(el) + bondsAt[i];
    const many = atoms.filter((at) => at.el === el).length > 1;
    return `${many ? `each ${lower(el)} atom` : lower(el)} has ${count}`;
  });
  explain.push(`Counting the shared electrons, ${shellNow.join(' and ')} in its outer shell.`);
  explain.push(`${enNote(dEN)} ${dEN < 0.05 ? 'The electrons are shared equally: a nonpolar bond.'
    : dEN < 0.4 ? 'That’s small, so the bond is nearly nonpolar.'
    : `The shared electrons are pulled toward ${lower(a.en > b.en ? a : b)}: a polar covalent bond.`}`);

  const notes = [];
  if (center.el.group === 13) notes.push(`${center.el.name} ends up with only 6 outer electrons, an exception to the octet rule.${center.el.z === 5 && key === 'BH3' ? ' Borane actually pairs up as B₂H₆.' : ''}`);

  return {
    ok: true, type: 'covalent', formula, name, dEN, atoms, layout, bonds, explain, notes,
    title: `Covalent bonding: ${name === formula ? formula : `${name}, ${formula}`}`,
    summary: `Covalent bonding in ${name}, ${formula}: ${bonds.length === 1 ? `a ${kindOf} bond (${pairs})` : `${bonds.length} ${kindOf} bonds, ${pairs} each`}.`,
  };
}

// ---- geometry --------------------------------------------------------------------

const NUC = 24, STEP = 22, MIN_R = 64; // nucleus radius, space per shell, smallest outer shell
const OVERLAP = 34; // how far bonded atoms' outer shells overlap
const ER = 6.5; // outer electron radius
const PAIR = 18; // spacing of two electrons side by side (px)

const norm = (x) => ((x % TAU) + TAU) % TAU;
const angDiff = (x, y) => { const d = norm(x - y); return d > Math.PI ? d - TAU : d; }; // x − y in (−π, π]
const outerRadius = (shells) => Math.max(MIN_R, NUC + STEP * shells.length);
const cluster = (dir, n, step) => Array.from({ length: n }, (_, k) => dir + (k - (n - 1) / 2) * step);

// Places `count` directions in the widest gaps between the occupied ones, spread evenly within each.
export function spreadInGaps(occupied, count) {
  if (!count) return [];
  if (!occupied.length) return Array.from({ length: count }, (_, k) => -Math.PI / 2 + (TAU * k) / count);
  const occ = occupied.map(norm).sort((x, y) => x - y);
  const gaps = occ.map((s, i) => ({ start: s, size: (i + 1 < occ.length ? occ[i + 1] : occ[0] + TAU) - s, k: 0 }));
  for (let n = 0; n < count; n++) {
    gaps.reduce((best, g) => (g.size / (g.k + 2) > best.size / (best.k + 2) + 1e-9 ? g : best)).k++;
  }
  return gaps.flatMap((g) => Array.from({ length: g.k }, (_, j) => g.start + (g.size * (j + 1)) / (g.k + 1)));
}

// Center positions for the atoms. dist(i, j, angle) gives the center-to-center distance.
function place(layout, n, dist) {
  if (layout.kind === 'star') {
    return [{ x: 0, y: 0 }, ...layout.angles.map((deg, i) => {
      const t = deg * DEG, d = dist(0, i + 1, t);
      return { x: d * Math.cos(t), y: d * Math.sin(t) };
    })];
  }
  const pos = [{ x: 0, y: 0 }];
  for (let i = 1; i < n; i++) pos.push({ x: pos[i - 1].x + dist(i - 1, i, 0), y: 0 });
  return pos;
}

const dirTo = (p, q) => Math.atan2(q.y - p.y, q.x - p.x);
const onRing = (p, R, t) => ({ x: p.x + R * Math.cos(t), y: p.y + R * Math.sin(t) });

// The eight places (two for hydrogen) in an anion's outer shell, turned to face the atoms that
// give it electrons. Each slot records which transfer fills it, or null for the atom's own electron.
function anionSlots(cap, sources) {
  const step = TAU / cap;
  const s0 = sources[0];
  const base = s0.dir - ((s0.n - 1) / 2) * step;
  const slots = Array.from({ length: cap }, (_, k) => ({ a: base + k * step, src: null }));
  for (const s of sources) {
    for (let k = 0; k < s.n; k++) {
      const free = slots.filter((sl) => !sl.src).sort((p, q) => Math.abs(angDiff(p.a, s.dir)) - Math.abs(angDiff(q.a, s.dir)));
      free[0].src = s;
    }
  }
  return slots;
}

// ---- drawing ---------------------------------------------------------------------

function palette(theme, marks) {
  const base = bohrColors(theme);
  const owner = theme.gray ? ['#000000', '#000000'] : [theme.periodNum, theme.groupNum];
  const dark = theme === THEMES.dark;
  return {
    ...base,
    owner,
    ownerStroke: owner.map((c) => (theme.gray ? c : mix(c, dark ? '#ffffff' : '#000000', dark ? 0.55 : 0.35))),
    // Dot-and-cross: the second element's electrons are crosses. Always on in grayscale, where
    // the two colors can't be told apart.
    cross: [false, marks === 'cross' || !!theme.gray],
  };
}

function electron(x, y, owner, c, r = ER) {
  if (c.cross[owner]) {
    const d = r * 0.95;
    return `<path class="e" d="M${r1(x - d)} ${r1(y - d)}L${r1(x + d)} ${r1(y + d)}M${r1(x - d)} ${r1(y + d)}L${r1(x + d)} ${r1(y - d)}" stroke="${c.owner[owner]}" stroke-width="3.2" stroke-linecap="round"/>`;
  }
  return `<circle class="e" cx="${r1(x)}" cy="${r1(y)}" r="${r}" fill="${c.owner[owner]}" stroke="${c.ownerStroke[owner]}" stroke-width="1.5"/>`;
}

const slotMark = (x, y, owner, c) => `<circle class="slot" cx="${r1(x)}" cy="${r1(y)}" r="${ER}" fill="none" stroke="${c.owner[owner]}" stroke-width="1.8" stroke-dasharray="3.2 2.6"/>`;

// One atom or ion: shells, nucleus, inner electrons, and the outer shell's items, each
// { a: angle, owner, slot?: true }. With outer = null, the outer shell is drawn evenly spaced
// (outerOwner: its owner's color, or null for inner-shell gray). With wideOuter, the inner shells
// keep their usual spacing and only the outer shell moves out to R.
function atomSVG({ x, y, R, shells, symbol, owner, nucleus, outer, outerOwner = null, wideOuter = false }, c, theme) {
  const n = shells.length;
  const out = [];
  const radius = (i) => (wideOuter && i < n - 1 ? NUC + STEP * (i + 1) : NUC + ((R - NUC) * (i + 1)) / n);
  shells.forEach((_, i) => out.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(radius(i))}" fill="none" stroke="${c.ring}" stroke-width="2"/>`));
  const nuc = nucleus || { fill: c.nucleus, stroke: c.nucleusStroke };
  const size = Math.min(24, (NUC * 1.5) / Math.max(1, symbol.length * 0.62));
  out.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="${NUC}" fill="${nuc.fill}" stroke="${nuc.stroke}" stroke-width="2.5"/>`);
  out.push(`<text x="${r1(x)}" y="${r1(y + size * 0.36)}" font-size="${r1(size)}" font-weight="800" fill="${nucleus ? textOn(nuc.fill, theme) : theme.title}" text-anchor="middle">${esc(symbol)}</text>`);

  shells.forEach((count, i) => {
    const r = radius(i);
    const last = i === n - 1;
    if (last && outer) {
      for (const it of outer) {
        const p = onRing({ x, y }, r, it.a);
        out.push(it.slot ? slotMark(p.x, p.y, it.owner, c) : electron(p.x, p.y, it.owner, c));
      }
      return;
    }
    const colored = last && outerOwner != null;
    const step = wideOuter ? STEP : (R - NUC) / n;
    const er = colored ? ER : Math.min(5, step * 0.24, ((TAU * r) / count) * 0.34);
    for (let k = 0; k < count; k++) {
      const p = onRing({ x, y }, r, -Math.PI / 2 + (TAU * k) / count);
      out.push(colored ? electron(p.x, p.y, outerOwner, c)
        : `<circle class="e" cx="${r1(p.x)}" cy="${r1(p.y)}" r="${r1(er)}" fill="${c.core}"${c.coreStroke !== 'none' ? ` stroke="${c.coreStroke}" stroke-width="1.5"` : ''}/>`);
    }
  });
  return out.join('');
}

function arrow(p, q, color) {
  const t = Math.atan2(q.y - p.y, q.x - p.x);
  const s = { x: p.x + (ER + 4) * Math.cos(t), y: p.y + (ER + 4) * Math.sin(t) };
  const e = { x: q.x - (ER + 5) * Math.cos(t), y: q.y - (ER + 5) * Math.sin(t) };
  const head = 11, w = 6;
  const b = { x: e.x - head * Math.cos(t), y: e.y - head * Math.sin(t) };
  const nx = -Math.sin(t) * w, ny = Math.cos(t) * w;
  return `<path class="arrow" d="M${r1(s.x)} ${r1(s.y)}L${r1(b.x)} ${r1(b.y)}" stroke="${color}" stroke-width="2.5" fill="none"/>`
    + `<path d="M${r1(e.x)} ${r1(e.y)}L${r1(b.x + nx)} ${r1(b.y + ny)}L${r1(b.x - nx)} ${r1(b.y - ny)}Z" fill="${color}"/>`;
}

// Each panel returns { svg, box: { x0, y0, x1, y1 } } in its own coordinates.
function boxOf(items) {
  return {
    x0: Math.min(...items.map((it) => it.x - it.left)), x1: Math.max(...items.map((it) => it.x + it.right)),
    y0: Math.min(...items.map((it) => it.y - it.top)), y1: Math.max(...items.map((it) => it.y + it.bottom)),
  };
}

function ionicBefore(res, c, theme, nucleusFor) {
  const atoms = res.atoms.map((at) => ({ ...at, shells: electronShells(at.el) }));
  atoms.forEach((at) => { at.R = outerRadius(at.shells); });
  const pos = place(res.layout, atoms.length, (i, j) => atoms[i].R + atoms[j].R + 64);
  const out = [];
  const outer = atoms.map(() => []);
  const arrows = [];

  // Anions: own electrons plus dashed spaces facing the atoms that fill them.
  const slotsFor = atoms.map((at, j) => {
    if (at.charge >= 0) return null;
    const sources = res.transfers.filter((t) => t.to === j).map((t) => ({ ...t, dir: dirTo(pos[j], pos[t.from]) }));
    const slots = anionSlots(at.shells.length === 1 ? 2 : 8, sources);
    for (const sl of slots) outer[j].push(sl.src ? { a: sl.a, owner: atoms[sl.src.from].owner, slot: true } : { a: sl.a, owner: at.owner });
    return slots;
  });

  // Cations: the electrons they give away face where they're going, with an arrow to the space.
  atoms.forEach((at, i) => {
    if (at.charge <= 0) return;
    const count = at.shells.at(-1);
    const step = Math.min(TAU / 8, TAU / count);
    const used = [];
    for (const t of res.transfers.filter((tr) => tr.from === i)) {
      const dir = dirTo(pos[i], pos[t.to]);
      const mine = cluster(dir, t.n, step); // offsets ascending
      const back = dirTo(pos[t.to], pos[i]);
      const theirs = slotsFor[t.to].filter((sl) => sl.src && sl.src.from === i).sort((p, q) => angDiff(q.a, back) - angDiff(p.a, back));
      mine.forEach((a, k) => {
        outer[i].push({ a, owner: at.owner });
        used.push(a);
        arrows.push(arrow(onRing(pos[i], at.R, a), onRing(pos[t.to], atoms[t.to].R, theirs[k].a), c.owner[at.owner]));
      });
    }
    // Electrons the cation keeps (Pb²⁺ keeps its outer s pair).
    for (const a of spreadInGaps(used, count - at.charge)) outer[i].push({ a, owner: at.owner });
  });

  atoms.forEach((at, i) => out.push(atomSVG({ ...pos[i], R: at.R, shells: at.shells, symbol: at.el.symbol, owner: at.owner, nucleus: nucleusFor(at.el), outer: outer[i] }, c, theme)));
  out.push(...arrows);
  return { svg: out.join(''), box: boxOf(atoms.map((at, i) => ({ ...pos[i], left: at.R, right: at.R, top: at.R, bottom: at.R }))) };
}

function ionicAfter(res, c, theme, nucleusFor) {
  const atoms = res.atoms.map((at) => {
    const neutral = electronShells(at.el);
    const shells = ionShells(neutral, at.charge, at.el.z);
    const R = outerRadius(shells);
    return { ...at, neutral, shells, R, h: R + 12 };
  });
  const CH = 38; // room for the charge after the right bracket
  const pos = place(res.layout, atoms.length, (i, j, t) => {
    if (res.layout.kind === 'row') return atoms[i].h + CH + 14 + atoms[j].h;
    return (atoms[i].h + atoms[j].h + CH) / Math.max(Math.abs(Math.cos(t)), Math.abs(Math.sin(t)));
  });
  const out = [];
  atoms.forEach((at, j) => {
    let outer = null, outerOwner = null;
    if (at.charge < 0) {
      // Full outer shell: the atom's own electrons plus the ones it gained, in the giver's color.
      const sources = res.transfers.filter((t) => t.to === j).map((t) => ({ ...t, dir: dirTo(pos[j], pos[t.from]) }));
      outer = anionSlots(at.shells.at(-1), sources).map((sl) => ({ a: sl.a, owner: sl.src ? atoms[sl.src.from].owner : at.owner }));
    } else if (at.shells.length === at.neutral.length) {
      outerOwner = at.owner; // it kept some outer electrons (Pb²⁺)
    }
    out.push(atomSVG({ ...pos[j], R: at.R, shells: at.shells, symbol: at.el.symbol, owner: at.owner, nucleus: nucleusFor(at.el), outer, outerOwner }, c, theme));
    // Square brackets with the charge at the top right.
    const { x, y } = pos[j], h = at.h, tick = 12;
    out.push(`<path d="M${r1(x - h + tick)} ${r1(y - h)}H${r1(x - h)}V${r1(y + h)}H${r1(x - h + tick)}M${r1(x + h - tick)} ${r1(y - h)}H${r1(x + h)}V${r1(y + h)}H${r1(x + h - tick)}" fill="none" stroke="${theme.title}" stroke-width="3"/>`);
    out.push(`<text x="${r1(x + h + 4)}" y="${r1(y - h + 20)}" font-size="24" font-weight="700" fill="${theme.title}">${chargeLabel(at.charge)}</text>`);
  });
  return { svg: out.join(''), box: boxOf(atoms.map((at, i) => ({ ...pos[i], left: at.h, right: at.h + CH, top: at.h, bottom: at.h }))) };
}

// Covalent atoms share one set of radii for both panels. The outer shell sits far enough out that
// the overlap between bonded atoms stays outside the inner shells, so shared electrons are only
// ever in the outer shells. A central atom is enlarged when needed, so its neighbors (bigger atoms
// around a small one, like CCl₄) don't run into each other.
const INNER_CLEAR = 16; // gap between the overlap and the last inner shell
function covalentRadii(res) {
  const R = res.atoms.map((at) => {
    const n = electronShells(at.el).length;
    return Math.max(outerRadius(electronShells(at.el)), n > 1 ? NUC + STEP * (n - 1) + OVERLAP + INNER_CLEAR : 0);
  });
  if (res.layout.kind === 'star' && res.layout.angles.length > 1) {
    const angles = res.layout.angles.map((d) => d * DEG).sort((x, y) => x - y);
    const sep = Math.min(...angles.map((t, i) => norm((angles[i + 1] ?? angles[0] + TAU) - t)));
    const ro = Math.max(...R.slice(1));
    R[0] = Math.max(R[0], (ro + 8) / Math.sin(sep / 2) - ro + OVERLAP);
  }
  return R;
}

function covalentPanel(res, c, theme, nucleusFor, after) {
  const R = covalentRadii(res);
  const shells = res.atoms.map((at) => electronShells(at.el));
  const pos = place(res.layout, res.atoms.length, (i, j) => R[i] + R[j] + (after ? -OVERLAP : 44));
  const out = [];
  const lens = [];
  res.atoms.forEach((at, i) => {
    const mine = res.bonds.filter((bd) => bd.a === i || bd.b === i).map((bd) => ({ ...bd, other: bd.a === i ? bd.b : bd.a }));
    const dirs = mine.map((bd) => dirTo(pos[i], pos[bd.other]));
    const outer = [];
    if (!after) mine.forEach((bd, k) => cluster(dirs[k], bd.order, PAIR / R[i]).forEach((a) => outer.push({ a, owner: at.owner })));
    for (const d of spreadInGaps(dirs, at.lone)) cluster(d, 2, PAIR / R[i]).forEach((a) => outer.push({ a, owner: at.owner }));
    out.push(atomSVG({ ...pos[i], R: R[i], shells: shells[i], symbol: at.el.symbol, owner: at.owner, nucleus: nucleusFor(at.el), outer, wideOuter: true }, c, theme));
  });
  if (after) {
    // Shared pairs sit in the overlap, one electron from each atom, stacked across the bond.
    for (const bd of res.bonds) {
      const p = pos[bd.a], q = pos[bd.b];
      const t = dirTo(p, q), u = { x: Math.cos(t), y: Math.sin(t) }, v = { x: -u.y, y: u.x };
      const m = { x: p.x + (R[bd.a] - OVERLAP / 2) * u.x, y: p.y + (R[bd.a] - OVERLAP / 2) * u.y };
      for (let k = 0; k < bd.order; k++) {
        const off = (k - (bd.order - 1) / 2) * (2 * ER + 5);
        const h = ER + 1;
        lens.push(electron(m.x - h * u.x + off * v.x, m.y - h * u.y + off * v.y, res.atoms[bd.a].owner, c));
        lens.push(electron(m.x + h * u.x + off * v.x, m.y + h * u.y + off * v.y, res.atoms[bd.b].owner, c));
      }
    }
  }
  out.push(...lens);
  return { svg: out.join(''), box: boxOf(res.atoms.map((_, i) => ({ ...pos[i], left: R[i], right: R[i], top: R[i], bottom: R[i] }))) };
}

// ---- electron dot and Lewis structures (covalent only) -------------------------------

// Symbols with their outer electrons on four sides, as in a Lewis dot diagram. Bonds point along
// the four sides too, so the shapes are squared off: H₂O is drawn bent at 90°, BF₃ as a T.
const SYM = 52; // symbol font size
const SIDE_GAP = 13; // symbol edge to its electrons
const LEWIS_PAIR = 8; // half the spacing of two electrons on one side
const COMPASS = [270, 90, 180, 0].map((d) => d * DEG); // top, bottom, left, right: tie-break order

const symHalf = (symbol) => {
  // Rough half-size of a bold symbol: letter widths in em, and its cap height.
  const em = (ch) => (/[MW]/.test(ch) ? 0.95 : /[A-Z]/.test(ch) ? 0.72 : /[ilfjrt]/.test(ch) ? 0.34 : 0.58);
  return { w: ([...symbol].reduce((s, ch) => s + em(ch), 0) * SYM) / 2, h: 0.36 * SYM };
};
// Distance from a symbol's center to its edge in direction t (one of the four sides).
const edge = (half, t) => Math.abs(Math.cos(t)) * half.w + Math.abs(Math.sin(t)) * half.h;
const sameDir = (x, y) => Math.abs(angDiff(x, y)) < 1e-6;

function compassLayout(res) {
  if (res.layout.kind !== 'star') return res.layout;
  const n = res.layout.angles.length, lone = res.atoms[0].lone;
  const angles = n === 4 ? [0, 90, 180, 270] : n === 3 ? [180, 0, 90] : n === 2 ? (lone ? [180, 90] : [180, 0]) : [0];
  return { kind: 'star', angles };
}

function dotPanel(res, c, theme, style, after) {
  const halves = res.atoms.map((at) => symHalf(at.el.symbol));
  const EDGE = style === 'lines' ? 56 : 44; // gap between bonded symbols
  const pos = place(compassLayout(res), res.atoms.length, (i, j, t) => edge(halves[i], t) + edge(halves[j], t) + EDGE + (after ? 0 : 56));
  const out = [];
  const items = [];

  res.atoms.forEach((at, i) => {
    const p = pos[i], half = halves[i];
    const mine = res.bonds.filter((bd) => bd.a === i || bd.b === i).map((bd) => ({ order: bd.order, dir: dirTo(p, pos[bd.a === i ? bd.b : bd.a]) }));
    // Lone pairs take the free sides farthest from the bonds. An end atom with two lone pairs has
    // them above and below its bond, mirrored across it (O=O, not pairs on the top and outside).
    // Before bonding, the electrons that will be shared sit one per side, facing the bond first,
    // then on the sides left over.
    const far = (t) => Math.min(...mine.map((bd) => Math.abs(angDiff(t, bd.dir))));
    const free = COMPASS.filter((t) => !mine.some((bd) => sameDir(t, bd.dir))).sort((x, y) => far(y) - far(x));
    const loneSides = mine.length === 1 && at.lone === 2
      ? free.filter((t) => Math.abs(far(t) - Math.PI / 2) < 1e-6)
      : free.slice(0, at.lone);
    const onSide = []; // { t, n }
    for (const t of loneSides) onSide.push({ t, n: 2 });
    if (!after) {
      for (const bd of mine) onSide.push({ t: bd.dir, n: 1 });
      const extra = mine.reduce((s, bd) => s + bd.order - 1, 0);
      const left = free.filter((t) => !loneSides.includes(t)).sort((x, y) => far(x) - far(y));
      for (const t of left.slice(0, extra)) onSide.push({ t, n: 1 });
    }
    for (const { t, n } of onSide) {
      const u = { x: Math.cos(t), y: Math.sin(t) }, v = { x: -u.y, y: u.x };
      const d = edge(half, t) + SIDE_GAP;
      for (const off of n === 1 ? [0] : [-LEWIS_PAIR, LEWIS_PAIR]) {
        out.push(electron(p.x + d * u.x + off * v.x, p.y + d * u.y + off * v.y, at.owner, c));
      }
    }
    out.push(`<text x="${r1(p.x)}" y="${r1(p.y + half.h)}" font-size="${SYM}" font-weight="700" fill="${theme.title}" text-anchor="middle">${esc(at.el.symbol)}</text>`);
    const reach = { w: half.w + SIDE_GAP + ER, h: half.h + SIDE_GAP + ER };
    items.push({ ...p, left: reach.w, right: reach.w, top: reach.h, bottom: reach.h });
  });

  if (after) {
    for (const bd of res.bonds) {
      const p = pos[bd.a], q = pos[bd.b];
      const t = dirTo(p, q), u = { x: Math.cos(t), y: Math.sin(t) }, v = { x: -u.y, y: u.x };
      const ea = edge(halves[bd.a], t), eb = edge(halves[bd.b], t);
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      const s = ea + (len - ea - eb) / 2; // midpoint of the gap between the symbols
      const m = { x: p.x + s * u.x, y: p.y + s * u.y };
      for (let k = 0; k < bd.order; k++) {
        if (style === 'lines') {
          // One line per shared pair: single, double or triple bond.
          const off = (k - (bd.order - 1) / 2) * 9, h = (len - ea - eb) / 2 - 9;
          out.push(`<path class="bond" d="M${r1(m.x - h * u.x + off * v.x)} ${r1(m.y - h * u.y + off * v.y)}L${r1(m.x + h * u.x + off * v.x)} ${r1(m.y + h * u.y + off * v.y)}" stroke="${theme.title}" stroke-width="3.5" stroke-linecap="round"/>`);
        } else {
          // Each shared pair: one electron from each atom, side by side along the bond.
          const off = (k - (bd.order - 1) / 2) * (2 * ER + 5), h = ER + 1.5;
          out.push(electron(m.x - h * u.x + off * v.x, m.y - h * u.y + off * v.y, res.atoms[bd.a].owner, c));
          out.push(electron(m.x + h * u.x + off * v.x, m.y + h * u.y + off * v.y, res.atoms[bd.b].owner, c));
        }
      }
    }
  }
  return { svg: out.join(''), box: boxOf(items) };
}

function headings(res) {
  const at = res.atoms;
  if (res.type === 'ionic') {
    const cat = at.find((a) => a.charge > 0), an = at.find((a) => a.charge < 0);
    return [
      `Before: electrons move from ${cat.el.symbol} to ${an.el.symbol}`,
      `After: ${ionText(cat.el.symbol, cat.charge)} and ${ionText(an.el.symbol, an.charge)} ions attract`,
    ];
  }
  const n = res.bonds.length, order = res.bonds[0].order;
  const kind = { 1: 'single', 2: 'double', 3: 'triple' }[order];
  return [
    'Before: separate atoms',
    n === 1 ? `After: ${plural(order, 'shared pair')}, a ${kind} bond` : `After: ${n} ${kind} bonds, ${plural(order, 'shared pair')} each`,
  ];
}

function legendItems(res, c, theme, view, style) {
  const names = [];
  for (const at of res.atoms) names[at.owner] ??= at.el;
  const same = names[0] === names[1];
  const items = [0, 1].map((o) => ({
    mark: (x, y) => electron(x, y, o, c),
    text: same ? `Electrons from ${o ? 'the other' : 'one'} ${lower(names[o])} atom` : `${names[o].name} electrons`,
  }));
  if (res.type === 'ionic' && view !== 'after') {
    const giver = res.atoms.find((a) => a.charge > 0).owner;
    items.push({ mark: (x, y) => slotMark(x, y, giver, c), text: 'Space an electron moves into' });
  }
  if (style === 'lines' && view !== 'before') {
    items.push({ mark: (x, y) => `<path d="M${x - 9} ${y}H${x + 9}" stroke="${theme.title}" stroke-width="3.5" stroke-linecap="round"/>`, text: 'Line: one shared pair' });
  }
  if (style === 'bohr') {
    items.push({ mark: (x, y) => `<circle cx="${x}" cy="${y}" r="5" fill="${c.core}"${c.coreStroke !== 'none' ? ` stroke="${c.coreStroke}" stroke-width="1.5"` : ''}/>`, text: 'Inner-shell electrons' });
  }
  return items;
}

const est = (str, size) => str.length * size * 0.56; // rough width of sans-serif text

// Draws an analyzeBond result. Options: theme ('light' | 'dark' | 'print'), transparent,
// view ('both' | 'before' | 'after'), marks ('color' | 'cross' for dot-and-cross), style (how
// covalent bonds are drawn: 'bohr' shells, 'dots' electron dot diagram, 'lines' Lewis structure
// with a line per shared pair; ionic bonds are always Bohr models), caption (title, panel headings
// and legend; default true), fluid, nucleus (el → { fill, stroke }).
export function renderBondSVG(res, { theme: themeKey = 'light', transparent = false, view = 'both', marks = 'color', style = 'bohr', caption = true, fluid = false, nucleus } = {}) {
  const theme = THEMES[themeKey] || THEMES.light;
  const c = palette(theme, marks);
  const nucleusFor = (el) => nucleus?.(el) || null;
  if (res.type === 'ionic' || !['dots', 'lines'].includes(style)) style = 'bohr';
  const [before, after] = res.type === 'ionic'
    ? [() => ionicBefore(res, c, theme, nucleusFor), () => ionicAfter(res, c, theme, nucleusFor)]
    : style !== 'bohr'
      ? [() => dotPanel(res, c, theme, style, false), () => dotPanel(res, c, theme, style, true)]
      : [() => covalentPanel(res, c, theme, nucleusFor, false), () => covalentPanel(res, c, theme, nucleusFor, true)];
  const heads = headings(res);
  const panels = [];
  if (view !== 'after') panels.push({ ...before(), head: heads[0] });
  if (view !== 'before') panels.push({ ...after(), head: heads[1] });

  const M = 32, HEAD = caption ? 40 : 0, GAP = 90;
  for (const p of panels) {
    p.w = Math.max(p.box.x1 - p.box.x0, caption ? est(p.head, 19) : 0);
    p.h = p.box.y1 - p.box.y0 + HEAD;
  }
  const side = panels.length === 2 && panels[0].w + panels[1].w + GAP <= 1500;
  const contentW = side ? panels[0].w + GAP + panels[1].w : Math.max(...panels.map((p) => p.w));
  const title = res.title;
  const W0 = Math.max(contentW, caption ? Math.min(est(title, 26), 1400) : 0, 420);
  const W = W0 + 2 * M;
  const out = [];
  let y = M;
  if (caption) {
    const size = Math.min(26, (W0 / est(title, 1)));
    out.push(`<text x="${r1(W / 2)}" y="${r1(y + size * 0.8)}" font-size="${r1(size)}" font-weight="800" fill="${theme.title}" text-anchor="middle">${esc(title)}</text>`);
    y += 56;
  }

  // Panels, side by side with an arrow between them, or stacked.
  // The heading sits at y0; the drawing is centered in a band `band` tall below it.
  const drawPanel = (p, x0, y0, band = p.h - HEAD) => {
    const cx = x0 + p.w / 2;
    if (caption) out.push(`<text x="${r1(cx)}" y="${r1(y0 + 20)}" font-size="19" font-weight="700" fill="${theme.text}" text-anchor="middle">${esc(p.head)}</text>`);
    const dx = cx - (p.box.x0 + p.box.x1) / 2, dy = y0 + HEAD + (band - (p.box.y1 - p.box.y0)) / 2 - p.box.y0;
    out.push(`<g transform="translate(${r1(dx)} ${r1(dy)})">${p.svg}</g>`);
  };
  const bigArrow = (x, yy, vertical) => {
    const L = 30, w = 10, head = 18;
    const d = vertical
      ? `M${x - w / 2} ${yy - L}H${x + w / 2}V${yy + L - head}H${x + w * 1.6}L${x} ${yy + L}L${x - w * 1.6} ${yy + L - head}H${x - w / 2}Z`
      : `M${x - L} ${yy - w / 2}V${yy + w / 2}H${x + L - head}V${yy + w * 1.6}L${x + L} ${yy}L${x + L - head} ${yy - w * 1.6}V${yy - w / 2}Z`;
    out.push(`<path d="${d}" fill="${theme.muted}" opacity="0.7"/>`);
  };
  if (side) {
    const h = Math.max(panels[0].h, panels[1].h);
    const x0 = M + (W0 - contentW) / 2;
    drawPanel(panels[0], x0, y, h - HEAD);
    bigArrow(x0 + panels[0].w + GAP / 2, y + HEAD + (h - HEAD) / 2, false);
    drawPanel(panels[1], x0 + panels[0].w + GAP, y, h - HEAD);
    y += h;
  } else {
    panels.forEach((p, i) => {
      if (i) { bigArrow(W / 2, y + GAP / 2 - 4, true); y += GAP; }
      drawPanel(p, M + (W0 - p.w) / 2, y);
      y += p.h;
    });
  }

  // Legend rows, wrapped to the width.
  if (caption) {
    y += 34;
    const items = legendItems(res, c, theme, view, style).map((it) => ({ ...it, w: 26 + est(it.text, 16) + 30 }));
    const rows = [[]];
    for (const it of items) {
      const row = rows.at(-1);
      if (row.length && row.reduce((s, r) => s + r.w, 0) + it.w > W0) rows.push([]);
      rows.at(-1).push(it);
    }
    for (const row of rows) {
      let x = (W - row.reduce((s, r) => s + r.w, 0) + 30) / 2;
      for (const it of row) {
        out.push(it.mark(r1(x + 7), r1(y - 5)));
        out.push(`<text x="${r1(x + 22)}" y="${r1(y)}" font-size="16" fill="${theme.text}">${esc(it.text)}</text>`);
        x += it.w;
      }
      y += 28;
    }
    y -= 10;
  }
  const H = Math.ceil(y + M);
  const bg = transparent ? '' : `<rect width="100%" height="100%" fill="${theme.bg}"/>`;
  const dims = fluid ? '' : ` width="${Math.ceil(W)}" height="${H}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.ceil(W)} ${H}"${dims} font-family="${esc(FONT)}" role="img" aria-label="${esc(res.summary)}"><title>${esc(res.summary)}</title>${bg}${out.join('')}</svg>`;
}

// Ready-made pairs for the page's examples and the landing page.
export const BOND_EXAMPLES = [
  ['Na', 'Cl'], ['Mg', 'O'], ['Mg', 'Cl'], ['Li', 'F'], ['Ca', 'F'], ['Al', 'O'], ['Na', 'O'],
  ['H', 'H'], ['Cl', 'Cl'], ['O', 'O'], ['N', 'N'], ['H', 'Cl'], ['H', 'O'], ['N', 'H'], ['C', 'H'], ['C', 'O'],
];
