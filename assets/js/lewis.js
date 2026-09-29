// Electron dot (Lewis) diagrams: the element symbol with its valence electrons as dots on four sides.
// Pure (returns an SVG string) so it works in the browser and in Node tests.

import { THEMES } from './schemes.js';
import { shellsFromConfig, aufbauShells, chargeLabel } from './bohr.js';

const FONT = "'Segoe UI', 'Helvetica Neue', Helvetica, Arial, 'DejaVu Sans', sans-serif";
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = (n) => Math.round(n * 10) / 10;

// Dots go one per side first, clockwise from the top, then pair up (C has four single dots,
// N has one pair and three singles).
const SIDES = ['top', 'right', 'bottom', 'left'];

// Valence electrons shown as dots: the outer shell's electrons, at most 8 (2 for H and He).
// For d- and f-block elements that's the outer s electrons (Fe: 2), as in most textbooks.
// A cation loses its dots first; if it loses the whole outer shell it has none (Na⁺, Fe³⁺).
// An anion gains dots up to a full octet (Cl⁻, O²⁻).
export function dotCount(shells, charge = 0) {
  const cap = shells.length <= 1 ? 2 : 8;
  const valence = Math.min(shells.at(-1) || 0, cap);
  return Math.max(0, Math.min(cap, valence - charge));
}

// Which side each dot sits on, in drawing order: e.g. 5 → top, right, bottom, left, top.
export function dotSides(dots) {
  return Array.from({ length: dots }, (_, i) => SIDES[i % 4]);
}

function dotColor(theme) {
  if (theme.gray) return '#000000';
  return theme.periodNum;
}

// Renders the diagram. Inputs: z and symbol (required); shells (electrons per shell, inner first)
// or config — calculated if neither is usable. Options: name, theme, transparent, caption
// (default true), fluid, charge (positive removes electrons, negative adds them).
export function renderLewisSVG({ z, symbol, name = '', shells, config, theme: themeKey = 'light', transparent = false, caption = true, fluid = false, charge = 0 }) {
  const theme = THEMES[themeKey] || THEMES.light;
  const fill = dotColor(theme);
  charge = Math.min(z, Math.trunc(charge) || 0);
  const pop = shells?.length ? shells : shellsFromConfig(config, z) || aufbauShells(z);
  const dots = dotCount(pop, charge);
  const ion = chargeLabel(charge);
  const bracket = ion && dots > 0; // [:Cl:]⁻ — an ion with no dots is just written Na⁺

  // Same canvas width as the Bohr model, so the two line up on a slide.
  const W = 400, H0 = 260;
  const cx = W / 2, cy = H0 / 2 + 4;
  const size = 96;
  // Rough half-size of the bold symbol: its cap height, and letter widths in em.
  const em = (ch) => (/[MW]/.test(ch) ? 0.95 : /[A-Z]/.test(ch) ? 0.74 : /[ilfjrt]/.test(ch) ? 0.36 : 0.6);
  const halfW = ([...symbol].reduce((w, ch) => w + em(ch), 0) * size) / 2, halfH = 0.36 * size;
  const gap = 20, er = 7, pair = 11; // gap from the letters, dot radius, half the spacing of a pair
  const out = [];

  const sup = ion && !bracket ? `<tspan dy="-0.9em" font-size="45%">${ion}</tspan>` : '';
  out.push(`<text x="${cx}" y="${r1(cy + halfH)}" font-size="${size}" font-weight="700" fill="${theme.title}" text-anchor="middle">${esc(symbol)}${sup}</text>`);

  // Helium's two electrons (and H⁻'s) are one pair, not two singles.
  const sides = pop.length <= 1 && dots === 2 ? ['top', 'top'] : dotSides(dots);
  const onSide = {};
  sides.forEach((s) => { onSide[s] = (onSide[s] || 0) + 1; });
  for (const [side, k] of Object.entries(onSide)) {
    const offsets = k === 1 ? [0] : [-pair, pair];
    for (const d of offsets) {
      const [x, y] = {
        top: [cx + d, cy - halfH - gap - 4],
        bottom: [cx + d, cy + halfH + gap + 4],
        left: [cx - halfW - gap, cy + d],
        right: [cx + halfW + gap, cy + d],
      }[side];
      out.push(`<circle class="dot" cx="${r1(x)}" cy="${r1(y)}" r="${er}" fill="${fill}"/>`);
    }
  }

  if (bracket) {
    // Square brackets just outside the dots, with the charge at the top right.
    const bx = halfW + gap + er + 18, by = halfH + gap + er + 18, tick = 12;
    const l = cx - bx, r = cx + bx, t = cy - by, b = cy + by;
    out.push(`<path d="M${r1(l + tick)} ${r1(t)}H${r1(l)}V${r1(b)}H${r1(l + tick)}M${r1(r - tick)} ${r1(t)}H${r1(r)}V${r1(b)}H${r1(r - tick)}" fill="none" stroke="${theme.title}" stroke-width="4"/>`);
    out.push(`<text x="${r1(r + 6)}" y="${r1(t + 26)}" font-size="40" font-weight="700" fill="${theme.title}">${ion}</text>`);
  }

  let H = H0;
  const plural = (k, what) => `${k} ${what}${k === 1 ? '' : 's'}`;
  if (caption) {
    const est = (str, sz) => str.length * sz * 0.6;
    const title = ion ? `${name ? `${name} ion ` : ''}${symbol}${ion}` : name;
    const head = `${title ? `${title}: ` : ''}${plural(dots, 'valence electron')}`;
    const headSize = Math.min(20, (W - 24) / (est(head, 1) * 1.08));
    let y = H + 12;
    out.push(`<text x="${cx}" y="${y}" font-size="${r1(headSize)}" font-weight="700" fill="${theme.title}" text-anchor="middle">${esc(head)}</text>`);
    if (ion) {
      y += 28;
      const line = `${plural(z, 'proton')}, ${plural(z - charge, 'electron')}: charge ${charge > 0 ? '+' : '−'}${Math.abs(charge)}`;
      out.push(`<text x="${cx}" y="${y}" font-size="16" fill="${theme.text}" text-anchor="middle">${esc(line)}</text>`);
    }
    H = y + 18;
  }

  const bg = transparent ? '' : `<rect width="100%" height="100%" fill="${theme.bg}"/>`;
  const dims = fluid ? '' : ` width="${W}" height="${H}"`;
  const who = ion ? `${name ? `${name} ion ` : ''}${symbol}${ion}` : name || symbol;
  const label = `Electron dot diagram of ${who}: ${plural(dots, 'valence electron')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"${dims} font-family="${esc(FONT)}" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>${bg}${out.join('')}</svg>`;
}
