import { loadData } from './data.js';
import { renderSVG, tileColorsFor } from './render.js';
import { PRESETS, presetById } from './presets.js';
import { makeState } from './state.js';
import { analyzeBond, renderBondSVG } from './bonding.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

async function main() {
  const data = await loadData();
  document.getElementById('hero').innerHTML = renderSVG(makeState(presetById('families').state), data, { fluid: true });

  document.getElementById('gallery-grid').innerHTML = PRESETS.map((p) => `
    <a class="card" href="builder.html#preset=${p.id}">
      <div class="thumb">${renderSVG(makeState(p.state), data, { fluid: true })}</div>
      <div class="card-body">
        <span class="tag">${esc(p.audience)}</span>
        <h3>${esc(p.title)}</h3>
        <p>${esc(p.description)}</p>
      </div>
    </a>`).join('');

  const bySymbol = (sym) => data.elements.find((el) => el.symbol === sym);
  const table = makeState({});
  const bonds = [
    ['Na', 'Cl', 'Ionic', 'Sodium gives its outer electron to chlorine, and the two ions attract.'],
    ['H', 'O', 'Covalent', 'Oxygen shares a pair of electrons with each hydrogen atom.'],
  ];
  document.getElementById('bond-cards').innerHTML = bonds.map(([a, b, tag, text]) => {
    const res = analyzeBond(bySymbol(a), bySymbol(b));
    const svg = renderBondSVG(res, { fluid: true, caption: false, nucleus: (el) => tileColorsFor(el.z, table, data) });
    return `
    <a class="card" href="bonds.html#a=${a}&b=${b}">
      <div class="thumb">${svg}</div>
      <div class="card-body">
        <span class="tag">${tag} bond</span>
        <h3>${esc(res.name[0].toUpperCase() + res.name.slice(1))}, ${esc(res.formula)}</h3>
        <p>${esc(text)}</p>
      </div>
    </a>`;
  }).join('');
}

main().catch((e) => {
  document.getElementById('gallery-grid').textContent = `${e.message}. Serve this folder over HTTP (see README).`;
});
