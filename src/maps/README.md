# src/maps/

Map packs behind `IMap` (`IMap.js`). Game.js loads via `src/maps/index.js` (`getMap` / `MAPS`). Default is still **nuketown**.

| Pack | Path | Status |
|------|------|--------|
| Nuketown | `nuketown/index.js` → `MapBuilder.buildMap` | Live, `bounds: 38` |
| Candy Foundry | `candy-foundry/` | **In progress** — read [`candy-foundry/STATUS.md`](candy-foundry/STATUS.md) |

Start-screen toggle: `#btn-map-nuketown` / `#btn-map-foundry`, persisted as `localStorage['sberg-map']`.
