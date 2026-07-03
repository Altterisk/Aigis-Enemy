# Aigis Web (stage / enemy / unit viewer)

A React (Vite) frontend that reads locally-exported game data. It links
**stages → their enemies**, **enemies → the stages they appear in**, and shows
every playable **unit** (stats, skills, abilities, tokens). Unverified
attributes (effect influence ids) are shown raw, never invented.

## Data

All data lives under `public/`:

- `public/data/enemies.json` — every global enemy
- `public/data/stages_index.json` — slim stage list; `public/data/stage/<quest_id>.json` — one full stage, loaded on demand
- `public/data/units.json` — slim unit list; `public/data/unit/<id>.json` — one full unit, loaded on demand
- `public/data/influence_labels.json` / `unit_influence_labels.json` — hand-verified influence label tables
- `public/data/race_labels.json`, `specialty_config.json`, `enemy_stages.json`
- `public/data/influence_audit.json` — the `/admin` page's worklist (every
  influence id in use, label status, param signatures, example carriers);
  built by `python export_influence_audit.py`
- `public/unit-icon/<id>[_awN].png` — unit face icons (published, ~108 MB)
- `public/sprites/<patternId>.png` — Stand-pose enemy icons (gitignored)
- `../unit_images/` — unit splash art + battle sprites, **local only** (several
  GB, never built/published; served in dev by the `/unit-img` middleware in
  `vite.config.js`; the published unit page falls back to the icon)

Regenerate from the game data (uses `../Data/root.pkl`, falls back to `../list.har`):

```sh
cd ../python
python export_site.py --out ../web/public
python export_units.py --out ../web/public
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
