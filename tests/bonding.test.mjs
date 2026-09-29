import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeBond, renderBondSVG, bondKind, spreadInGaps, BOND_EXAMPLES } from '../assets/js/bonding.js';

const data = JSON.parse(readFileSync(new URL('../data/elements.json', import.meta.url)));
const bySymbol = (sym) => data.elements.find((el) => el.symbol === sym);
const bond = (a, b) => analyzeBond(bySymbol(a), bySymbol(b));
const count = (svg, re) => (svg.match(re) || []).length;

test('ionic compounds get the right formula, name and ions', () => {
  const cases = {
    'Na Cl': ['NaCl', 'sodium chloride'], 'Mg O': ['MgO', 'magnesium oxide'], 'Mg Cl': ['MgCl₂', 'magnesium chloride'],
    'Al O': ['Al₂O₃', 'aluminum oxide'], 'Ca N': ['Ca₃N₂', 'calcium nitride'], 'Na O': ['Na₂O', 'sodium oxide'],
    'Na N': ['Na₃N', 'sodium nitride'], 'Li H': ['LiH', 'lithium hydride'], 'Pb O': ['PbO', 'lead(II) oxide'],
    'Cl Na': ['NaCl', 'sodium chloride'], // order of picking doesn't matter
  };
  for (const [pair, [formula, name]] of Object.entries(cases)) {
    const res = bond(...pair.split(' '));
    assert.equal(res.type, 'ionic', pair);
    assert.equal(res.formula, formula, pair);
    assert.equal(res.name, name, pair);
    // Charges balance, and every electron given away is received.
    assert.equal(res.atoms.reduce((s, at) => s + at.charge, 0), 0, pair);
    for (const [i, at] of res.atoms.entries()) {
      const moved = res.transfers.filter((t) => t.from === i).reduce((s, t) => s + t.n, 0) - res.transfers.filter((t) => t.to === i).reduce((s, t) => s + t.n, 0);
      assert.equal(moved, at.charge, `${pair} atom ${i}`);
    }
  }
});

test('covalent molecules get the right formula, name and bonds', () => {
  const cases = {
    'H H': ['H₂', 'hydrogen', 1, 1], 'Cl Cl': ['Cl₂', 'chlorine', 1, 1], 'O O': ['O₂', 'oxygen', 1, 2], 'N N': ['N₂', 'nitrogen', 1, 3],
    'H Cl': ['HCl', 'hydrogen chloride', 1, 1], 'H O': ['H₂O', 'water', 2, 1], 'O H': ['H₂O', 'water', 2, 1],
    'N H': ['NH₃', 'ammonia', 3, 1], 'C H': ['CH₄', 'methane', 4, 1], 'C O': ['CO₂', 'carbon dioxide', 2, 2],
    'C Cl': ['CCl₄', 'carbon tetrachloride', 4, 1], 'B F': ['BF₃', 'boron trifluoride', 3, 1], 'Cl O': ['Cl₂O', 'dichlorine monoxide', 2, 1],
    'O F': ['OF₂', 'oxygen difluoride', 2, 1], 'H S': ['H₂S', 'hydrogen sulfide', 2, 1], 'P Cl': ['PCl₃', 'phosphorus trichloride', 3, 1],
  };
  for (const [pair, [formula, name, bonds, order]] of Object.entries(cases)) {
    const res = bond(...pair.split(' '));
    assert.equal(res.type, 'covalent', pair);
    assert.equal(res.formula, formula, pair);
    assert.equal(res.name, name, pair);
    assert.equal(res.bonds.length, bonds, pair);
    assert.equal(res.bonds[0].order, order, pair);
  }
  assert.deepEqual(bond('H', 'O').atoms.map((at) => at.lone), [2, 0, 0]);
  assert.deepEqual(bond('N', 'N').atoms.map((at) => at.lone), [1, 1]);
});

test('pairs without a simple bond explain why', () => {
  for (const pair of ['Na K', 'Fe O', 'Ne F', 'Si O', 'C C', 'N O', 'Na Si', 'Na C', 'S S', 'Og F', 'Cu Cl']) {
    const res = bond(...pair.split(' '));
    assert.equal(res.ok, false, pair);
    assert.ok(res.reason.length > 20, pair);
  }
});

test('lone pairs go in the widest gaps', () => {
  const deg = (a) => Math.round(((a * 180) / Math.PI + 360) % 360);
  assert.deepEqual(spreadInGaps([45, 135].map((d) => (d * Math.PI) / 180), 2).map(deg), [225, 315]); // water
  assert.deepEqual(spreadInGaps([0, 90, 180].map((d) => (d * Math.PI) / 180), 1).map(deg), [270]); // ammonia
});

const pickable = data.elements.filter((el) => bondKind(el) !== 'other');

test('every drawable pair renders in every view, keeping every electron', () => {
  let drawn = 0;
  for (const a of pickable) {
    for (const b of pickable) {
      const res = analyzeBond(a, b);
      if (!res.ok) continue;
      drawn++;
      const electrons = res.atoms.reduce((s, at) => s + at.el.z, 0);
      for (const view of ['before', 'after']) {
        const svg = renderBondSVG(res, { view, caption: false });
        assert.doesNotMatch(svg, /NaN|undefined/, `${a.symbol}+${b.symbol} ${view}`);
        assert.equal(count(svg, /class="e"/g), electrons, `${a.symbol}+${b.symbol} ${view}: electron count`);
      }
      if (res.type === 'ionic') {
        const moved = res.transfers.reduce((s, t) => s + t.n, 0);
        const svg = renderBondSVG(res, { view: 'before', caption: false });
        assert.equal(count(svg, /class="slot"/g), moved, `${a.symbol}+${b.symbol}: spaces`);
        assert.equal(count(svg, /class="arrow"/g), moved, `${a.symbol}+${b.symbol}: arrows`);
      }
    }
  }
  assert.ok(drawn > 300, `only ${drawn} pairs drew`);
});

test('examples all draw, in every theme and marking style', () => {
  for (const [a, b] of BOND_EXAMPLES) {
    const res = bond(a, b);
    assert.ok(res.ok, `${a}+${b}`);
    for (const theme of ['light', 'dark', 'print']) {
      for (const marks of ['color', 'cross']) {
        const svg = renderBondSVG(res, { theme, marks });
        assert.match(svg, /^<svg[^>]+viewBox="0 0 \d+ \d+"/);
        assert.doesNotMatch(svg, /NaN|undefined/);
      }
    }
  }
});
