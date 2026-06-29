# Aigis Web (enemy & stage viewer)

A simple React (Vite) frontend that reads locally-exported game data and sprite
icons. It links **stages → their enemies** and **enemies → the stages they
appear in**. Unverified attributes (effect influence ids) are shown raw, never
invented.

## Data

All data lives under `public/`:

- `public/data/enemies.json` — every global enemy
- `public/data/stages.json` — missions with their enemies + modifiers
- `public/sprites/<patternId>.png` — Stand-pose enemy icons

Regenerate it from the game data (requires `../list.har` and the Python tools):

```sh
cd ../python
python export_site.py --out ../web/public
```

## Run

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # static build into dist/
```

## Notes

- Stage enemies use the spawn id; map-local enemies (id ≥ 1000) show inline
  stats, global enemies (1–999) link to the enemy detail page.
- Damage type: `TypeAttack=300` → true, `MagicAttack=1` → magical, else
  physical. The raw fields are shown on each enemy's detail page.
- Effect/term "influence" ids are displayed as raw numbers + params +
  the game's own expression strings; no interpreted labels are added here.
