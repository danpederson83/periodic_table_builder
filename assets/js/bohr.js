// Bohr-style electron shell diagrams: nucleus with the symbol, one ring per occupied shell,
// electrons spaced evenly on each ring, and the outermost shell's electrons highlighted.
// Pure (returns an SVG string) so it works in the browser and in Node tests.

import { THEMES } from './schemes.js';

const FONT = "'Segoe UI', 'Helvetica Neue', Helvetica, Arial, 'DejaVu Sans', sans-serif";
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = (n) => Math.round(n * 10) / 10;

// Subshells in filling (Madelung) order, with their capacities.
const ORDER = ['1s', '2s', '2p', '3s', '3p', '4s', '3d', '4p', '5s', '4d', '5p', '6s', '4f', '5d', '6p', '7s', '5f', '6d', '7p'];
const CAPACITY = { s: 2, p: 6, d: 10, f: 14 };
const CORES = { He: 2, Ne: 10, Ar: 18, Kr: 36, Xe: 54, Rn: 86 };

// Electrons per shell (index 0 = n=1) from the standard filling order.
// Exact for the noble-gas cores; a few real elements (Cr, Cu, Pd, …) differ, which is why
// shellsFromConfig prefers the measured configuration.
export function aufbauShells(z) {
  const shells = [];
  let left = z;
  for (const sub of ORDER) {
    if (left <= 0) break;
    const n = Number(sub[0]);
    const e = Math.min(left, CAPACITY[sub[1]]);
    shells[n - 1] = (shells[n - 1] || 0) + e;
    left -= e;
  }
  return Array.from(shells, (v) => v || 0);
}

// Parses a configuration like "[Ne]3s2 3p5" or "[Rn]7s2 5f14 6d10 (predicted)".
// Returns null if it can't be read or doesn't add up to z.
export function shellsFromConfig(config, z) {
  if (!config) return null;
  const clean = config.replace(/\([^)]*\)/g, '');
  const core = clean.match(/\[([A-Za-z]+)\]/);
  if (core && !CORES[core[1]]) return null;
  const shells = core ? aufbauShells(CORES[core[1]]) : [];
  for (const [, n, , count] of clean.matchAll(/(\d)([spdf])(\d+)/g)) {
    shells[n - 1] = (shells[n - 1] || 0) + Number(count);
  }
  const out = Array.from(shells, (v) => v || 0);
  const total = out.reduce((a, b) => a + b, 0);
  return z == null || total === z ? out : null;
}

// Best available shell populations for an element record from data/elements.json.
export function electronShells(el) {
  return el.shells || shellsFromConfig(el.config, el.z) || aufbauShells(el.z);
}

function colors(theme) {
  if (theme.gray) {
    return { ring: '#555555', nucleus: '#e6e6e6', nucleusStroke: '#000000', core: '#ffffff', coreStroke: '#000000', valence: '#000000', valenceStroke: '#000000' };
  }
  const dark = theme === THEMES.dark;
  return {
    ring: theme.tileStroke,
    nucleus: dark ? '#1f3a3c' : '#e2f2f2',
    nucleusStroke: theme.groupNum,
    core: dark ? '#8898a8' : '#5d6c7b',
    coreStroke: 'none',
    valence: theme.periodNum,
    valenceStroke: dark ? '#fbe3bf' : '#7a5217',
  };
}

// Renders the diagram. Inputs: z and symbol (required); shells (electrons per shell, inner first)
// or config (an electron configuration string) — shells are calculated if neither is usable.
// Options: name, theme ('light' | 'dark' | 'print'), transparent, caption (default true), fluid.
export function renderBohrSVG({ z, symbol, name = '', shells, config, theme: themeKey = 'light', transparent = false, caption = true, fluid = false }) {
  const theme = THEMES[themeKey] || THEMES.light;
  const c = colors(theme);
  const pop = shells?.length ? shells : shellsFromConfig(config, z) || aufbauShells(z);
  const n = pop.length;
  const outer = pop[n - 1];

  // Fixed canvas, so every element's diagram is the same size on a slide.
  const R = 170, NUC = 34;
  const step = Math.min(38, (R - NUC - 8) / n);
  const W = 2 * R + 60; // extra width leaves room for the caption
  const cx = W / 2, cy = R + 10;
  const out = [];

  pop.forEach((count, i) => {
    const r = NUC + step * (i + 1);
    out.push(`<circle cx="${cx}" cy="${cy}" r="${r1(r)}" fill="none" stroke="${c.ring}" stroke-width="2"/>`);
  });

  const nucSize = Math.min(34, (NUC * 1.5) / Math.max(1, symbol.length * 0.62));
  out.push(`<circle cx="${cx}" cy="${cy}" r="${NUC}" fill="${c.nucleus}" stroke="${c.nucleusStroke}" stroke-width="2.5"/>`);
  out.push(`<text x="${cx}" y="${r1(cy + nucSize * 0.36)}" font-size="${r1(nucSize)}" font-weight="800" fill="${theme.title}" text-anchor="middle">${esc(symbol)}</text>`);

  pop.forEach((count, i) => {
    const r = NUC + step * (i + 1);
    const valence = i === n - 1;
    const gap = (2 * Math.PI * r) / count;
    const er = Math.min(valence ? 8 : 6, step * (valence ? 0.3 : 0.24), gap * (valence ? 0.4 : 0.34));
    for (let k = 0; k < count; k++) {
      const a = -Math.PI / 2 + (2 * Math.PI * k) / count;
      const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      const fill = valence ? c.valence : c.core;
      const stroke = valence ? c.valenceStroke : c.coreStroke;
      out.push(`<circle class="${valence ? 'valence' : 'core'}" cx="${r1(x)}" cy="${r1(y)}" r="${r1(er)}" fill="${fill}"${stroke !== 'none' ? ` stroke="${stroke}" stroke-width="1.5"` : ''}/>`);
    }
  });

  let H = 2 * cy;
  if (caption) {
    const plural = (k) => `${k} electron${k === 1 ? '' : 's'}`;
    // Rough width of sans-serif text, to shrink a long caption rather than clip it.
    const est = (str, size) => str.length * size * 0.6;
    const head = `${name ? `${name}: ` : ''}${pop.join(', ')}`;
    const headSize = Math.min(20, (W - 24) / (est(head, 1) * 1.08));
    let y = H + 12;
    out.push(`<text x="${cx}" y="${y}" font-size="${r1(headSize)}" font-weight="700" fill="${theme.title}" text-anchor="middle">${esc(head)}</text>`);
    const inner = z - outer;
    const legend = [
      [c.valence, c.valenceStroke, 7, `Outer shell: ${plural(outer)}`],
      ...(inner ? [[c.core, c.coreStroke, 5, `Inner shells: ${plural(inner)}`]] : []),
    ];
    // Stack the legend rows, left-aligned as a block centered under the diagram.
    const x = cx - (Math.max(...legend.map((l) => est(l[3], 16))) + 18) / 2 + 7;
    for (const [fill, stroke, r, label] of legend) {
      y += 28;
      out.push(`<circle cx="${r1(x)}" cy="${y - 6}" r="${r}" fill="${fill}"${stroke !== 'none' ? ` stroke="${stroke}" stroke-width="1.5"` : ''}/>`);
      out.push(`<text x="${r1(x + 14)}" y="${y}" font-size="16" fill="${theme.text}">${esc(label)}</text>`);
    }
    H = y + 18;
  }

  const bg = transparent ? '' : `<rect width="100%" height="100%" fill="${theme.bg}"/>`;
  const dims = fluid ? '' : ` width="${W}" height="${H}"`;
  const label = `Bohr model of ${name || symbol}: ${pop.join(', ')} electrons per shell, ${outer} in the outer shell`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"${dims} font-family="${esc(FONT)}" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>${bg}${out.join('')}</svg>`;
}
