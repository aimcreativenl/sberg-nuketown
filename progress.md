Original prompt: Fix the game start where the player spawns on blocks beside an enemy bot and cannot move with WASD.

# 2026-08-09 - spawn escape fix (86e1cac)

Status: DONE and independently reviewed.

- Root cause: the previous `bf67e26` check only rejected a spawn when the capsule overlapped a collider at the exact point. Several remaining points were technically clear but surrounded by props/fences; the central point had only 4/16 clear escape directions.
- Fix: `Game._playerSpawn()` now uses ground-level candidates only, checks 16 movement paths over 2.2m, requires at least 6 open directions, prefers a 4m horizontal gap from living bots, and evaluates every candidate instead of eight random samples.
- Safety fallback: stale authored points trigger a ground-grid rescue search; a completely blocked map fails explicitly instead of returning another trapped point.
- Regression coverage: `npm run test:player-spawns` now covers 40 randomized selections, bot separation, and the fully blocked-map branch. Also green: colliders, Rapier player/bots, movement, MP sync and `npm run build`.
- Browser proof on `http://127.0.0.1:5175/`: fresh PLAY spawn is on the open road; ten W input bursts visibly move the player; console errors: 0.
- Screenshots: [`spawn-fixed-before-wasd.png`](ref/polish/spawn-fixed-before-wasd.png) and [`spawn-fixed-after-wasd.png`](ref/polish/spawn-fixed-after-wasd.png).
- Progress dashboard: http://127.0.0.1:8766/

# Progress

## 2026-08-09 — stale server corrected

- The code fix in commit `bf67e26` was present in the workspace, but the previously shared `:5175` URL served an older Vite process without that fix.
- The stale process on `:5175` was replaced with the current workspace server.
- Fresh `:5175` browser start now places the player in open terrain; repeated `KeyD` and `KeyW` input visibly changes the view/position.
- Browser console errors: 0.
- Regression/build verification: PASS — 22 safe points, 0 blocked, map checks green, production build green.
- Independent verifier: PASS — live `:5175` source contains both `safeSpawnPoints` and `playerPositionBlocked`; only the existing chunk-size warning remains.

## Handoff

- Play URL: http://127.0.0.1:5175/
- Keep the current workspace server attached to `:5175`; do not validate against the unrelated `:5173` Erangel server.

# 2026-08-14 — live-ready backlog; start Phase 3 TDM

User asked to finish outstanding points then push live to Vercel/Render, and which item to start with.

Live-ready order (this push): TDM → CTF → thin BR → merge branch to main → deploy.
Deferred after this live push: Phase 4b reconnect/migration, Phase 5 maps, Phase 6 installer.

TDM (this chunk): host uses `MODE_TDM` for team score, no friendly fire, house-side spawns, snapshots carry `teamKills`, HUD/scoreboard/victory show team score. Offline PLAY stays deathmatch. Tests: `test:modes`, `test:mp-sync`, `test:phase-d-hud`, `build` green.

CTF (this chunk): flags in west/east yards, host-authoritative pickup/drop/return/capture (3 to win), own flag must be home to score, pastel poles + HUD CAPS + carry banner. Tests: `test:modes`, `test:mp-sync`, `test:phase-d-hud`, `build` green.

Battle Royale (this chunk): last alive, no respawn, min 2 players to start, shrinking pastel zone with outside DPS, HUD ALIVE + eliminated death screen. Offline PLAY stays deathmatch. Tests: `test:modes`, `test:lan-room`, `test:mp-sync`, `test:phase-d-hud`, `build`.

Merged `codex/fix-player-spawn` → `main` and pushed live (Vercel game + Render hub).
