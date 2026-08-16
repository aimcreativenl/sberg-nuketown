# Candy Foundry — map plan (Concept 4)

**Status snapshot:** see **[`STATUS.md`](STATUS.md)** (percent complete, file list, next step). This file is the design contract.

Chosen concept: **Syrup Canal Foundry**. Indoor pastel voxel factory, **≥2× Nuketown linear** (`MAP_WALL` 80 vs 40 → playable ~160×160). Players can **walk into Sweet Co and Sugar Works**; both buildings have full interiors (rooms, stairs, doors, furniture), same bar as Nuketown houses.

Offline **PLAY vs 9 bots** must keep working on Nuketown. Candy is a second selectable map.

## Non-goals (this pass)

- Map vote in online lobby (host pick can wait; local start-screen toggle is enough).
- Destructible canals / swimming.
- NavMesh rewrite (reuse `coverPoints` + `waypoints`).

## File ownership (no overlapping edits)

| Owner | Files |
|-------|--------|
| Layout (done, read-only for others) | `layout.js`, this `PLAN.md` |
| Helpers (done, extend carefully) | `helpers.js` |
| **Loader** | `src/maps/index.js`, `src/maps/IMap.js`, `src/game/Game.js`, `src/game/Player.js`, `src/game/Medkits.js`, `src/modes/pubg.js` (zone from mapData), `index.html` + `src/style.css` (map toggle only), tests |
| **Shell** | `shell.js` only |
| **Buildings** | `buildings.js` only |
| **Yard** | `yard.js` only |
| Assembler | `index.js` (already wires the three builders) |

Do **not** edit `src/game/MapBuilder.js` except if a helper must be imported — prefer `helpers.js`.

## Scale & systems that are Nuketown-hardcoded today

These must become **mapData-driven** (loader):

- `Player.js` clamp `±38` (from `MAP_WALL ≈ 40`) → `mapData.bounds`
- `Medkits.spawnDefault()` fixed spots → `mapData.medkitSpots`
- `BR_ZONE` radii for wall 40 → `mapData.brZone` (Candy starts ~r 88)
- Fog `GFX.fogFar: 122` is too short for 160-wide indoor; `mapData.fog` `{ near, far, color }`
- `flagHomes` already on mapData (good)
- TDM `pickTeamSpawn` uses `x <= 0` vs `x > 0` — Candy spawns must keep Sweet Co on −X/−Z and Sugar Works on +X/+Z

## Gameplay rules

- **Syrup canals:** not lethal pits. `mapData.slowZones` AABB + `speedMul` ~0.42. Visual liquid slightly below floor. Bridges are real `floors[]` so you walk over at normal speed.
- **Pretzel walkways:** elevated, exposed, long sightlines. Need railings + floor pads.
- **Gumdrop bridges:** short, waist cover, medium risk.
- **Doors:** `DoorManager` records like Nuketown (`addSwingDoor` pattern in helpers). E to open. Bots `requestOpen`.
- **Spawns:** author many, then `playerPositionBlocked` filter. Include indoor L1/L2 and outdoor dock pads.
- **Bots:** dense `waypoints` on floor, catwalks, both building floors, bridges. `coverPoints` at crates / lollipops / machines.

## Building interiors (minimum rooms)

**Sweet Co (alpha / berry, SW)** — 2 storeys:

- L1: reception + packing floor + boiler closet, front dock door + side door to canal walk
- Stairs to L2 (hole in L2 floor, treads as `kind: 'stair_tread'`)
- L2: office, tasting lab, balcony over packing
- Furniture: desks, crates, vats, chairs, lamps (mix `placeSolid` / decor)

**Sugar Works (bravo / cream, NE)** — 2 storeys, mirrored language but not a clone:

- L1: wrapping hall + loading bay + locker nook
- Stairs + L2 break room / manager office / catwalk to pretzel
- Different accent (mint/cream vs pink/strawberry)

Window openings must be real holes in wall colliders (Nuketown house pattern), not decals on a solid box.

## Verification

- `npm run build`
- Existing: `test:player-spawns`, `test:colliders`, `test:doors`, `test:mp-sync`, `test:modes` still green on **nuketown**.
- New: `scripts/check-candy-foundry.mjs` — map id, wall ≥ 80, ≥2 enterable buildings with interior colliders, doors, slowZones, flagHomes, spawn count, bounds.
- Manual: PLAY Nuketown unchanged; switch map → Candy; walk into both buildings; bridges over syrup; no fall through floor.
