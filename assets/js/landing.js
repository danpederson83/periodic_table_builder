import { loadData } from './data.js';
import { renderSVG } from './render.js';
import { PRESETS, presetById } from './presets.js';
import { makeState } from './state.js';

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
}

main().catch((e) => {
  document.getElementById('gallery-grid').textContent = `${e.message}. Serve this folder over HTTP (see README).`;
});
