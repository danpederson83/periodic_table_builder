# Which periodic tables are most useful?

Notes behind the starter presets in `assets/js/presets.js`. The goal is a tool that serves both
**students** (learning the patterns) and **teachers** (making clean images for slides, worksheets
and tests).

## What the curriculum asks for

- **NGSS HS-PS1-1:** students "use the periodic table as a model to predict the relative
  properties of elements based on the patterns of electrons in the outermost energy level."
  Tables that show **valence electrons**, **blocks** and **electron configurations** support this
  directly, as do **trend heatmaps** (reactivity, bonding, ionization).
  ([NGSS](https://www.nextgenscience.org/pe/hs-ps1-1-matter-and-its-interactions))
- **Periodic trends units** (AACT, ChemEdX, RSC) focus on four quantities: **atomic radius,
  ionic radius, ionization energy and electronegativity**, and also electron affinity and
  metallic character.
  ([AACT: Periodic Table Trends](https://teachchemistry.org/classroom-resources/periodic-table-trends),
  [ChemEdX: periodic trends](https://www.chemedx.org/category/concepts/periodic-trends),
  [AACT: Trends of the Periodic Table](https://teachchemistry.org/classroom-resources/trends-of-the-periodic-table))

## What teachers make and print

- **Color-coding worksheets** for families and for metals, nonmetals and metalloids are a staple
  from grade 6 up.
  ([Chemistry Learner](https://www.chemistrylearner.com/worksheets/color-coding-the-periodic-table-worksheets))
- **Blank tables** are popular because they make students recall facts rather than read them.
  Teachers use them for filling in symbols, masses, valence electrons, ion charges and
  configurations.
  ([Science Notes](https://sciencenotes.org/blank-periodic-table-pdf/))
- **Ion-charge and valence-electron tables** support ionic bonding and naming units. Students
  often find the charge pattern themselves from a blank table.
  ([SERC activity](https://serc.carleton.edu/sp/mnstep/activities/34827.html))
- **Spotlight images for slides:** one group or period highlighted with everything else faded.

## Resulting presets

| Preset | Why |
| --- | --- |
| Element families | The reference design: the most common intro table |
| Classic classroom chart | Wall-chart style categories (PubChem classification) |
| Metals, nonmetals & metalloids | Color-coding worksheets, grades 6–12 |
| Valence electrons | NGSS HS-PS1-1 |
| Common ion charges | Ionic bonding, formulas and naming |
| s, p, d, f blocks | Electron configuration unit |
| Electron configurations | High school / AP reference |
| Electronegativity / atomic radius / ionization energy | The core periodic-trends units |
| States of matter | Middle school |
| Spotlight: halogens | Slide graphics (works for any group or period) |
| Mystery elements quiz | Tests: identify an element from its position |
| Blank practice table | Printable active-recall sheet |
| History of discovery | History of science / cross-curricular |
| Dark slide deck | Projector-friendly |

## Ideas for later

- **Quiz mode** (planned): click-to-answer "find the halogen", "which has the higher
  electronegativity?", and "name the highlighted element", with the same tables.
- Ionic radius data: PubChem's periodic table dataset doesn't include it, so it would need
  another source.
- Answer-key pairs: export a blank worksheet and its filled-in key in one click.
