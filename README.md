# Periodic Table Builder

Make custom, high-resolution periodic tables for lessons, slides and tests.

- **Highlight** columns (click a group number), periods (click a period number), the
  lanthanide/actinide series, or single elements. There are six highlight colors with legend
  labels you can edit, and an option to fade everything else.
- **Choose what each tile shows:** atomic number, symbol, name and mass, plus an optional
  top-right value (electronegativity, radius, ionization energy, valence electrons, ion charge
  and more) and an extra line (electron configuration, oxidation states, state and more).
- **Color schemes:** element families, PubChem categories, metals/nonmetals/metalloids, blocks,
  states of matter, or a **heatmap** of any numeric property.
- **Blank tiles** for quizzes, a **grayscale print theme**, a **dark slide theme**, and a
  transparent background option.
- **18- or 32-column** layouts, with group numbers as IUPAC 1–18 or US/CAS IA–VIIIA.
- **Export** as SVG (vector, for any size) or PNG at 1–4× (up to about 8000 px wide), or copy
  the image straight into your slides.
- **Share links:** the URL encodes the whole table. Your last table is also saved in the browser.
- **Inspect tool:** click an element to open a stats panel with its PubChem data and a link to
  PubChem.
- **Landing page** with a gallery of 16 starter tables. See [`docs/RESEARCH.md`](docs/RESEARCH.md)
  for why these were chosen.

It's a plain static site: HTML, CSS and ES modules, with no build step and no runtime
dependencies.

## Run it locally

```sh
npm start            # serves http://localhost:8080 (Node 18+, no npm install needed)
npm test             # renders every preset, scheme, theme and layout
```

Any static file server works too, e.g. `python3 -m http.server 8080`. Opening `index.html`
straight from disk won't work, because the element data is loaded with `fetch`.

## Element data

`data/elements.json` is generated from PubChem's periodic table dataset
(<https://pubchem.ncbi.nlm.nih.gov/periodic-table/>):

```sh
npm run data           # download the latest data from PubChem PUG-REST and rebuild
npm run data:offline   # rebuild from the bundled copy, data/PubChemElements_all.csv
```

Notes:

- PubChem's `AtomicRadius` is the **van der Waals** radius, and the app labels it that way.
- Elements with no standard atomic weight (Tc, Pm, Po and heavier, except Th, Pa and U) are
  marked with † because their listed mass is for a selected isotope.
- The bundled CSV came from a mirror of PubChem's `PubChemElements_all.csv` export, because
  PubChem wasn't reachable from the machine this was built on. Run `npm run data` on a machine
  with internet access to regenerate it straight from PubChem. The build date is recorded in
  `data/elements.json` → `meta.built`.

## Self-hosting with Docker and a Cloudflare Tunnel

> **Deploying with Claude Code on your server?** Clone the repo and tell Claude:
> *"Read DEPLOY.md and walk me through deploying this."* [`DEPLOY.md`](DEPLOY.md) covers
> servers that already run cloudflared, fresh tunnels, verification, updates and
> troubleshooting.

The short version, for a fresh tunnel:

1. In the Cloudflare dashboard, go to **Zero Trust → Networks → Tunnels**, create a tunnel
   (type *Cloudflared*), and copy its token.
2. Next to `docker-compose.yml`, create a `.env` file containing:
   ```
   TUNNEL_TOKEN=eyJhIjoi...
   ```
3. In the tunnel's **Public Hostname** settings, add your domain (e.g. `periodic.example.com`)
   with service `HTTP` → `web:80`.
4. Start it:
   ```sh
   docker compose up -d --build
   ```

The `web` container is nginx serving the static files (see `nginx.conf`). The `cloudflared`
container makes an outbound connection to Cloudflare, so you don't need to open any ports on
your router. The `8080:80` port mapping is only for LAN testing, and you can remove it.

"Copy image" needs HTTPS, which the tunnel provides (or `localhost` during development).

If you already run cloudflared on the host, skip that service and point your existing tunnel's
hostname at `http://localhost:8080`.

## Project layout

```
index.html              landing page and preset gallery
builder.html            the editor
assets/js/render.js     state + data → standalone SVG string (pure, also used in tests)
assets/js/schemes.js    color schemes, themes, heatmap ramps
assets/js/properties.js element properties shown on tiles and in heatmaps
assets/js/presets.js    starter tables
assets/js/state.js      defaults and share-link encoding
assets/js/builder.js    editor UI: tools, controls, stats panel, undo
assets/js/export.js     SVG/PNG download and clipboard
scripts/build-data.mjs  PubChem → data/elements.json
scripts/serve.mjs       tiny dev server
```

## Roadmap

- Quiz mode for students (planned; the render and highlight model are built to support it)
- Worksheet and answer-key pairs
- More data sources (e.g. ionic radii)
