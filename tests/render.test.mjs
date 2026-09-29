import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderSVG, renderTileSVG, tileColorsFor } from '../assets/js/render.js';
import { makeState, encodeState, decodeState } from '../assets/js/state.js';
import { renderBohrSVG, electronShells, shellsFromConfig, aufbauShells, ionShells, chargeLabel } from '../assets/js/bohr.js';
import { PRESETS } from '../assets/js/presets.js';
import { SCHEMES, THEMES } from '../assets/js/schemes.js';

const data = JSON.parse(readFileSync(new URL('../data/elements.json', import.meta.url)));
const count = (svg, re) => (svg.match(re) || []).length;

test('dataset has 118 elements with positions', () => {
  assert.equal(data.elements.length, 118);
  data.elements.forEach((el, i) => assert.equal(el.z, i + 1));
  assert.equal(data.elements.filter((el) => el.group == null).length, 30);
  assert.equal(data.elements.find((el) => el.symbol === 'Og').group, 18);
});

for (const p of PRESETS) {
  test(`preset "${p.id}" renders every element`, () => {
    const svg = renderSVG(makeState(p.state), data);
    assert.match(svg, /^<svg[^>]+viewBox="0 0 \d+ \d+"/);
    assert.equal(count(svg, /class="el"/g), 118);
    assert.doesNotMatch(svg, /NaN|undefined/);
  });
}

for (const scheme of Object.keys(SCHEMES)) {
  for (const theme of Object.keys(THEMES)) {
    for (const layout of ['18', '32']) {
      test(`scheme ${scheme} / theme ${theme} / ${layout} columns`, () => {
        const svg = renderSVG(makeState({ scheme, theme, layout, corner: 'en', line: 'config' }), data);
        assert.equal(count(svg, /class="el"/g), 118);
        assert.doesNotMatch(svg, /NaN|undefined/);
      });
    }
  }
}

test('blanked tiles hide the symbol', () => {
  const svg = renderSVG(makeState({ blanks: [26] }), data);
  const fe = svg.match(/<g class="el" data-z="26"[^]*?<\/g>/)[0];
  assert.doesNotMatch(fe.replace(/<title>.*<\/title>/, ''), />Fe</);
});

test('isotope dagger only on elements without a standard atomic weight', () => {
  const svg = renderSVG(makeState({}), data);
  assert.match(svg, />96\.906†</); // Tc
  assert.match(svg, />238\.029</); // U has a standard atomic weight
});

test('share links round-trip', () => {
  const s = makeState({ title: 'Test ✓', highlights: { 1: 2, 26: 0 }, blanks: [8], fields: { mass: false } });
  assert.deepEqual(decodeState(encodeState(s)), s);
});

test('text is escaped', () => {
  const svg = renderSVG(makeState({ title: '<script>alert(1)</script>' }), data);
  assert.doesNotMatch(svg, /<script>/);
});

test('every element renders as a single tile, with and without labels', () => {
  const state = makeState({ corner: 'en', line: 'config' });
  for (const el of data.elements) {
    for (const annotate of [false, true]) {
      const svg = renderTileSVG(el.z, state, data, { annotate });
      assert.match(svg, /^<svg[^>]+viewBox="0 0 \d+ \d+"/);
      assert.doesNotMatch(svg, /NaN|undefined/);
    }
  }
});

test('single tile matches the table settings and labels only visible parts', () => {
  const state = makeState({ massDecimals: 1, fields: { name: false } });
  const plain = renderTileSVG(26, state, data);
  assert.match(plain, />Fe</);
  assert.match(plain, />55\.8</);
  assert.doesNotMatch(plain, /Atomic number/);
  const labeled = renderTileSVG(26, state, data, { annotate: true });
  for (const label of ['Atomic number', 'Symbol', 'Atomic mass (u)']) assert.match(labeled, new RegExp(`>${label.replace(/[()]/g, '\\$&')}<`));
  assert.doesNotMatch(labeled, />Name</);
});

test('single tile can drop its highlight color', () => {
  const state = makeState({ highlights: { 26: 1 } });
  assert.match(renderTileSVG(26, state, data), /stroke-width="3"/);
  assert.doesNotMatch(renderTileSVG(26, state, data, { highlight: false }), /stroke-width="3"/);
});

const bySymbol = (sym) => data.elements.find((el) => el.symbol === sym);

test('electron shells come from the configuration for every element', () => {
  for (const el of data.elements) {
    const shells = shellsFromConfig(el.config, el.z);
    assert.ok(shells, `${el.symbol}: could not read "${el.config}"`);
    assert.equal(shells.reduce((a, b) => a + b, 0), el.z);
    // Palladium ([Kr]4d10) is the one element with no electrons in its period's shell.
    assert.equal(shells.length, el.symbol === 'Pd' ? 4 : el.period, `${el.symbol} shell count`);
  }
});

test('shell populations match classroom examples', () => {
  const cases = { H: [1], Na: [2, 8, 1], Mg: [2, 8, 2], Cl: [2, 8, 7], Ar: [2, 8, 8], K: [2, 8, 8, 1], Fe: [2, 8, 14, 2], Cu: [2, 8, 18, 1], Og: [2, 8, 18, 32, 32, 18, 8] };
  for (const [sym, shells] of Object.entries(cases)) assert.deepEqual(electronShells(bySymbol(sym)), shells, sym);
});

test('shells are calculated when no usable configuration is given', () => {
  assert.deepEqual(aufbauShells(17), [2, 8, 7]);
  assert.equal(shellsFromConfig('[Ne]3s2', 17), null); // doesn't add up to z
  assert.match(renderBohrSVG({ z: 12, symbol: 'Mg' }), /2, 8, 2/);
});

test('Bohr diagram draws one ring per shell and highlights the outer electrons', () => {
  for (const [sym, rings, valence, inner] of [['Na', 3, 1, 10], ['Mg', 3, 2, 10], ['Cl', 3, 7, 10], ['H', 1, 1, 0]]) {
    const el = bySymbol(sym);
    const svg = renderBohrSVG({ z: el.z, symbol: el.symbol, name: el.name, shells: electronShells(el) });
    assert.equal(count(svg, /fill="none" stroke=/g), rings, `${sym} rings`);
    assert.equal(count(svg, /class="valence"/g), valence, `${sym} outer electrons`);
    assert.equal(count(svg, /class="core"/g), inner, `${sym} inner electrons`);
    assert.match(svg, new RegExp(`>${sym}</text>`));
  }
});

test('Bohr diagram renders for every element and theme', () => {
  for (const theme of Object.keys(THEMES)) {
    for (const el of data.elements) {
      const svg = renderBohrSVG({ z: el.z, symbol: el.symbol, name: el.name, shells: electronShells(el), theme });
      assert.match(svg, /^<svg[^>]+viewBox="0 0 \d+ \d+"/);
      assert.doesNotMatch(svg, /NaN|undefined/);
      assert.equal(count(svg, /class="(valence|core)"/g), el.z);
    }
  }
});

test('Bohr nucleus takes the color of the element tile', () => {
  const tileFill = (svg) => svg.match(/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+" rx="4" fill="([^"]+)"/)[1];
  const nucleusFill = (svg) => svg.match(/<circle cx="[\d.]+" cy="[\d.]+" r="34" fill="([^"]+)"/)[1];
  for (const theme of Object.keys(THEMES)) {
    for (const scheme of ['families', 'heatmap', 'none']) {
      const state = makeState({ theme, scheme, highlights: { 26: 1 } });
      for (const [z, highlight] of [[11, true], [26, true], [26, false]]) {
        const el = data.elements[z - 1];
        const nucleus = tileColorsFor(z, state, data, { highlight });
        const bohr = renderBohrSVG({ z, symbol: el.symbol, shells: electronShells(el), theme, nucleus });
        const where = `${el.symbol} ${theme}/${scheme} highlight=${highlight}`;
        assert.equal(nucleusFill(bohr), tileFill(renderTileSVG(z, state, data, { highlight })), where);
        assert.match(bohr, new RegExp(`stroke="${nucleus.stroke}" stroke-width="2.5"`), where);
      }
    }
  }
});

test('ions gain or lose electrons in the right shells', () => {
  const cases = { Na: [1, [2, 8]], Mg: [2, [2, 8]], Al: [3, [2, 8]], Cl: [-1, [2, 8, 8]], O: [-2, [2, 8]], N: [-3, [2, 8]], H: [1, []], Fe: [2, [2, 8, 14]], Cu: [1, [2, 8, 18]] };
  for (const [sym, [charge, shells]] of Object.entries(cases)) {
    const el = bySymbol(sym);
    assert.deepEqual(ionShells(electronShells(el), charge, el.z), shells, `${sym} ${chargeLabel(charge)}`);
  }
  assert.deepEqual(['+', '2+', '−', '3−', ''].map(String), [1, 2, -1, -3, 0].map(chargeLabel));
});

test('Bohr diagram of an ion shows its charge and electron count', () => {
  for (const [sym, charge, ion] of [['Na', 1, '+'], ['Cl', -1, '−'], ['O', -2, '2−'], ['Mg', 2, '2+'], ['H', 1, '+']]) {
    const el = bySymbol(sym);
    const svg = renderBohrSVG({ z: el.z, symbol: el.symbol, name: el.name, shells: electronShells(el), charge });
    assert.equal(count(svg, /class="(valence|core)"/g), el.z - charge, `${sym} electrons`);
    const esc = ion.replace('+', '\\+');
    assert.match(svg, new RegExp(`>${sym}<tspan[^>]*>${esc}</tspan></text>`), `${sym} label`);
    assert.match(svg, new RegExp(`${el.name} ion ${sym}${esc}`), `${sym} caption`);
    assert.match(svg, new RegExp(`${el.z} protons?, ${el.z - charge} electrons?: charge ${charge > 0 ? '\\+' : '−'}${Math.abs(charge)}`));
    assert.doesNotMatch(svg, /NaN|undefined/);
  }
  // A neutral atom has no charge mark.
  assert.doesNotMatch(renderBohrSVG({ z: 11, symbol: 'Na', shells: [2, 8, 1] }), /tspan|charge/);
});
