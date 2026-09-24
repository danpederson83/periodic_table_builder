import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderSVG } from '../assets/js/render.js';
import { makeState, encodeState, decodeState } from '../assets/js/state.js';
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
