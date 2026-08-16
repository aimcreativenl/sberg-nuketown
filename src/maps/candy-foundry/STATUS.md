# Candy Foundry — pickup status (2026-08-16)

**Read this first if you are taking over.** Then [`PLAN.md`](PLAN.md) and [`layout.js`](layout.js). Product context: repo-root [`CONTINUITY.md`](../../../CONTINUITY.md) §3.00.

Candy Foundry **ships on `main`** (start-toggle; default remains nuketown). Do **not** wholesale-rewrite `yard.js` / `buildings.js` / `shell.js`.

## Session log (append-only — latest first)

### 2026-08-16 tasting kiosk + live conveyor

**What:** Enterable SE kiosk (`door_front_tasting_kiosk` at ~50,−43.5, face −Z, E). Conveyor at z=−39.6, x 28→58: belt UV scrolls, 6 gift boxes loop +X at 3.2 m/s. Sprint on the belt rides with it (`beltCarryDelta` in Player + NetPawn). Yard skips props inside the kiosk AABB.

**Files:** `layout.js`, `kiosk.js`, `conveyor.js`, `index.js`, `helpers.js`, `yard.js`, `movement.js`, `Player.js`, `NetPawn.js`, `MpMatch.js`, `IMap.js`, tests.

**Why:** user picked options C + conveyor with real motion.

### 2026-08-16 flowing syrup rivers

**What:** Canal surfaces now scroll as syrup rivers (unique DataTexture + UV offset). Chocolate flows NS, berry/lemon EW. `mapData.tick(dt)` from Game loop (also on the menu). `dispose()` on map swap.

**Files:** `syrupFlow.js` (new), `shell.js`, `index.js`, `helpers.js`, `Game.js`, `IMap.js`, `check-candy-foundry.mjs`.

**Why:** pink/brown read as empty floor. Flow + streaks make slow zones obvious. Empty-yard dressing is waiting on user pick (not built).

### 2026-08-16 canal flicker (chocolate / island)

**What:** Chocolate syrup z-fought at grazing angles. Transparent canal slabs overlapped each other (chocolate × strawberry, same Y) and *intersected* the full hangar underlay. Canal lips on punched island edges sat on the fountain slab.

**Fix (`shell.js`):** chocolate owns crossings; underlay punched like the floor; syrup opaque, no shadow receive; lips only on authored canal rims. `helpers.js` honors `receiveShadow`. `test:candy-foundry` asserts no canal/canal or underlay/canal volume overlap.

**Why:** user screenshot + video of the brown canal next to the cream island.

**Still open:** lobby map-vote; commit/push only if asked.

### 2026-08-16 play-ready — browser + Nuketown regression

**What:** In-game PLAY Foundry: 9/9 bots moved; Sweet Co + Sugar Works interiors + L2; pretzel deck y=4.6; gumdrop feet 0.55 over strawberry canal. Switch toggle → Nuketown PLAY: 9 bots, walk 5.3m/0.9s, outdoor town, combat (HP 94). `test:candy-foundry` `test:player-spawns` `test:map` `test:mp-sync` `build` green. No console errors. Default remains nuketown.

**Still open:** lobby map-vote (out of scope). Commit/push only if the user asks.

### 2026-08-16 play-ready — interior lights, dressing, NetPawn slowZones

**What:** Interior PointLights 0.38 → 22 candela (r185). Extra wainscot/stripe/bowl decor only (no new door/stair colliders). `NetPawn._slowZoneMul` + wish scale/cap; `MpMatch` passes `mapData.slowZones`. `test:mp-sync` covers dry vs wet.

**Files:** `buildings.js`, `NetPawn.js`, `MpMatch.js`, `scripts/check-mp-sync.mjs`.

**Still open:** browser PLAY screenshots (Sweet Co / Sugar Works / pretzel / gumdrop / Nuketown), `test:player-spawns` `test:map` `build`.

### 2026-08-16 play-ready — pretzel NaN + Rapier chains

**What:** `walkAabb` now includes center `x`/`z`. South-bank pretzel stairs used `ns.x` (was undefined) → 11 NaN stair colliders + 11 NaN floors, which crashed Rapier `world.step` near the north hangar. Each `addAxisStairs` flight now uses `chain: name` so Rapier step-solids do not merge all 66 pretzel treads into one Z-sorted staircase.

**Files:** `yard.js`, `scripts/check-candy-foundry.mjs` (NaN asserts + Rapier walks).

**Why:** In-game pretzel climb + canal playtest could not run; Rapier WASM went `unreachable`.

**Still open:** finish Rapier walk assertions (doors/L2/gumdrop/canal/pretzel), interior candy-dressing if halls look empty, optional NetPawn slowZones, browser PLAY + Nuketown regression.

### 2026-08-16 playtest pass (this agent)

Goal: make Foundry playable; document every change.

**Done:**
1. `scripts/check-candy-foundry.mjs` now actually `MAP_CANDY_FOUNDRY.build(scene)` + door walk-in + `_playerSpawn`. Result: **491 colliders, 216 floors, 87 spawns (75 ground), 4 doors, 7 slowZones**. Doors block closed / walkable open. Reception/wrapping samples clear.
2. `Game._playerSpawn` rescue grid uses `mapData.bounds` (was hardcoded `±34`).
3. `Game._applyMapPresentation`: camera.far, sky scale, MenuCamera.configure, sun shadow frustum from `mapData.wall`. Nuketown pack now exports `wall: 40`.
4. Candy spawn filter uses elevated `spawn.y` so pretzel pads are not tested at ground height.
5. Hangar was unlit in Three r185 (PointLight 0.42 candela). `shell.js` lights ~40–70 candela + dock lights; candy-cane emissive 0.55. `CANDY_FOG` near 72 / far 240.
6. Browser: Foundry toggle loads `mapId=candy-foundry`. PLAY: open `door_front_sweet_co`, see interior + bot. Camera inside Sweet Co (medkit, bot) and Sugar Works (mint walls, stairs, sofa). Switch back to Nuketown menu (outdoor town visible).
7. `NetPawn` ±38 → `mapData.bounds` (earlier in session).

**Not done:**
- Pretzel stairs not walked in-browser (headless floor pads exist).
- `NetPawn` still ignores slowZones (offline Player does slow).
- Online lobby map-vote.
- Manual Nuketown PLAY click in the automation browser was flaky; `test:player-spawns` / `test:map` still green.

**Do not:** rewrite yard/buildings/shell from scratch.

---

## Percent complete (honest, 2026-08-16 play-ready)

| Slice | % | Notes |
|-------|---|--------|
| Plan + layout contract | 100 | `PLAN.md`, `layout.js` |
| Helpers + assembler | 100 | `helpers.js`, `index.js` |
| Map loader / Game wiring | 99 | NetPawn slowZones landed. Mid-match swap no-op. No lobby vote. |
| Hangar shell | ~95 | r185 lights 40–70. Fog 72/240. |
| Building interiors | ~95 | Walk-in + L2 + lights 22 candela + extra decor. |
| Yard | ~98 | Pretzel NaN fixed; Rapier climb 4.62; gumdrop + canal verified. |
| Playtest / polish / lobby map-vote | **~90** | Browser PLAY + Nuketown regression done. Lobby vote out of scope. |

**Overall: ~98% coded, ~90% playtested.** Treat “can we ship Foundry locally?” as **yes**. Live Vercel is still Nuketown-only until the user asks to commit/push.

Default map stays **nuketown**. Foundry is a start-screen toggle (`#btn-map-foundry`).

## Immediate next step

Foundry is **lokaal play-ready**. Pickup remains this file.

1. Commit/push **only if the user asks**.
2. Later: lobby map-vote (Phase 5 remainder).

## What already landed (file list)

### New (candy-foundry pack)

- `src/maps/candy-foundry/PLAN.md` — design + file ownership
- `src/maps/candy-foundry/STATUS.md` — this file
- `src/maps/candy-foundry/layout.js` — wall 80, buildings, canals, flags, BR, fountain, bridges, pretzels, lollipops
- `src/maps/candy-foundry/helpers.js` — `rbox` / `addFloor` / `addSwingDoor` / `makeCtx`
- `src/maps/candy-foundry/index.js` — `MAP_CANDY_FOUNDRY.build` = shell + buildings + yard + spawn filter
- `src/maps/candy-foundry/shell.js` — hangar, floor, ceiling, canals + slowZones, **r185 PointLights 40–70 candela**
- `src/maps/candy-foundry/buildings.js` — Sweet Co + Sugar Works interiors/doors/stairs
- `src/maps/candy-foundry/yard.js` — fountain, gumdrop bridges, pretzel decks + `addAxisStairs`, lollipops, machines, crates, outdoor spawns, waypoint grid
- `src/maps/index.js` — `MAPS`, `getMap`, `DEFAULT_MAP_ID='nuketown'`, `sberg-map` localStorage
- `scripts/check-candy-foundry.mjs` + `package.json` script `test:candy-foundry`

### Modified (loader / systems)

- `src/maps/IMap.js` — MapData: `bounds`, `fog`, `slowZones`, `medkitSpots`, `brZone`, `flagHomes`
- `src/maps/nuketown/index.js` — wraps `buildMap`, `id` + `bounds: 38` + `wall: 40`
- `src/maps/README.md` — registry note
- `src/game/Game.js` — `loadMap`, fog, presentation (far/sky/menu/sun), map toggle, spawn rescue from bounds
- `src/game/MenuCamera.js` — `configure()` for Foundry orbit r=52
- `src/game/Player.js` — `mapBounds`, `_slowZoneMul`
- `src/game/Medkits.js` — `spawnDefault(spots)`
- `src/modes/pubg.js` — `brZoneFromMap`
- `src/net/MpMatch.js` — `brZoneFromMap(this.mapData)`; passes `bounds` into `NetPawn.stepMovement`
- `src/net/NetPawn.js` — XZ clamp from `world.bounds` (default still 38)
- `index.html` — `#btn-map-nuketown`, `#btn-map-foundry` (do not remove `#btn-play` etc.)
- `src/style.css` — `.btn-map` styles

### Docs updated for handoff (same session)

- `CONTINUITY.md` §3.00, gotcha 11, §8 startprompt, paths table
- `HANDOFF.md` next steps
- `CHANGELOG-SESSION.md` 2026-08-16 Candy Foundry WIP

## Door IDs (keep) — world XZ

| Name | Approx | How to enter |
|------|--------|----------------|
| `door_front_sweet_co` | **(-50, -38)** +Z dock | From center walk SW to pink dock x=-50, z≈-37. Face −Z, E, walk in. Reception ahead; packing/stairs west; side door east. |
| `door_side_sweet_co` | **(-38, -44)** east wall | |
| `door_front_sugar_works` | **(50, 38)** −Z dock | From center walk NE to cream dock x=50, z≈37. Face +Z, E, walk in. Wrapping ahead; loading west; lockers SE; stairs east. |
| `door_side_sugar_works` | **(38, 44)** west wall | |
| `door_front_tasting_kiosk` | **(50, −43.5)** +Z dock | From conveyor walk south to pink booth. Face −Z, E, walk in. Counter at the back. |

Wall colliders **must leave doorway gaps** (not one solid facade box). Do not overwrite `buildings.js`.

## Pretzel walks (deck y≈4.6) — [Candy yard props](eace3c6a-d852-4e59-9202-30b65b06afa1)

Authored spawns: **79** (38 on x≤0 Sweet Co, 41 on x>0 Sugar Works). 75 ground `y=1.7`, 4 on pretzel decks. Assembler still filters with `playerPositionBlocked`. Agent claimed 234 cover / 530 waypoints before that filter.

Any one stair reaches both sniper routes — T-junction ≈ **(−6, 12)**.

1. **Mid (easiest)** — frosting island, east lip of NS walk. Flights at **z = −10** and **z = +10**, climb west onto the deck.
2. **NS south** — raised approach over chocolate syrup to **z ≈ −37**, then south-bank stairs.
3. **NS north** — approach offset east of the lollipop at (−8, 30), then north-bank stairs.
4. **EW west** — stairs from dry ground near **(−16, 11)** onto the west stub.
5. **EW east** — north approach out of the lemon canal, then stairs from about **(26, 27)**.

Do not overwrite `yard.js`.

## Hard rules for the next model

- Offline PLAY vs 9 bots on **Nuketown** must not break.
- Do not edit `src/game/MapBuilder.js` unless unavoidable.
- Vanilla ES modules, Three.js r185, no React/TS.
- Host authoritative; listen-server. Render hub = signal/lobby only.
- Commit/push only if the user asks. No secrets (`.env.txt`).
- Keep start IDs: `#btn-play`, `#btn-host`, `#btn-search`, `#btn-how`, `#btn-settings-start`, `#start-how`, `#weapon-banner`, `#touch-controls`.
- Scale: `CANDY_MAP_WALL = 80` (2× Nuketown `MAP_WALL = 40`).
- Canals are **slow**, not kill pits. Bridges are real `floors[]`.
- TDM spawn split: Sweet Co / −X vs Sugar Works / +X (`x <= 0` vs `x > 0`).
- Do not rewrite live mobile work on `eae3178` (landscape menu, tap-to-shoot).

## Known pitfalls

- `loadMap` is a no-op while `this.running` (cannot swap mid-match).
- Candy `build()` throw → stay on previous map (currently Nuketown). Catch is still in `Game.loadMap`. Loader notes that said builders still throw are **stale**.
- `_applyMapFog` may set `scene.background` to fog color (sky dome / menu look).
- MenuCamera radius still ~30 **on Nuketown**; Foundry uses `configure({ radius: 52 })` via `_applyMapPresentation`.
- Sky sphere base r=130, scaled by `wall * 2.2` on Foundry.
- `check-candy-foundry.mjs` **does** `build()` now (no WebGL renderer). Green test includes door walk-in.
- Camera `far` follows wall (Foundry ~296). Nuketown stays 180.
- Chocolate canal vs fountain island: shell punches `FOUNTAIN.island` out of the slowZone.
- `yard.js` has unused `inSyrup` helper — ignore unless you need it.
- Four parallel subagents wrote shell/buildings/yard; expect overlap bugs (double colliders, stairs into canals, spawn filters).
- **Slow zones on MP remotes:** `Player` scales wish + caps speed; `NetPawn` does not yet. Offline Foundry canals work; online guests walking syrup would not slow until that is threaded.
- Host `bots.cb.doors` must be rebound after `loadMap` (already done in `Game.loadMap`).
- Slow-zone math: scale wish then **cap** horizontal speed — multiplying velocity every frame compounds to zero.

## Subagent landings (do not re-run)

- [Candy map loader](f61070af-c684-4189-8fbd-989e032c5481) — registry + `loadMap` + start toggle. Follow-up: `NetPawn` bounds (this file’s “Modified” list).
- [Candy hangar shell](5e0804c5-24a8-4617-ab8a-f821520931b9) — `shell.js` complete; do not overwrite.
- [Candy building interiors](6774ef98-2c2e-490b-a1d0-cdf496f4b36e) — `buildings.js` complete; do not overwrite. Playtest walk-in still required.
- [Candy yard props](eace3c6a-d852-4e59-9202-30b65b06afa1) — `yard.js` complete; do not overwrite. All four builder slices have landed. **Next is in-game playtest.**

## Concept (user choice)

Concept 4 **Syrup Canal Foundry** — indoor pastel candy factory, Sweet Co (SW, alpha/pink) + Sugar Works (NE, bravo/mint), syrup canals, gumdrop bridges, pretzel sniper walks, central frosting fountain. Interiors must be enterable and furnished like Nuketown houses.

## Live baseline (do not confuse with this WIP)

HEAD `eae3178` on `main` / Vercel: phone landscape start + look-pad tap-to-shoot. That work is **done and live**. Candy Foundry is a **separate uncommitted** slice on top of that tree.
