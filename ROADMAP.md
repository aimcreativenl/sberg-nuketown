# ROADMAP — S'Berg Nuketown

Stack: Three.js r185 + Vite 8, vanilla ES modules (no React/TS). This document
tracks the planned path from the current single-player build toward Rapier
physics + multiplayer, without breaking the existing play loop along the way.

---

## Phase 0 — Scaffolding (this pass)

**Goal:** create the folder/interface skeleton for future work without changing
any runtime behavior of the current game.

**Done criteria:**
- [x] `src/physics/`, `src/net/`, `src/modes/`, `src/maps/`, `src/settings/` exist, each with a short `README.md`.
- [x] `src/physics/IPhysicsWorld.js` — JSDoc typedefs (`PhysicsInput`, `PhysicsPose`, `RayHit`) + `PHYSICS_API` + `LegacyPhysicsBridge` stub. Not called from anywhere yet.
- [x] `src/modes/IGameMode.js`, `src/maps/IMap.js`, `src/net/NetTypes.js` — JSDoc-only contracts.
- [x] `src/modes/deathmatch.js` exports `MODE_DEATHMATCH` (uses `KILL_LIMIT`), not wired into `matchFlow.js` yet.
- [x] `src/maps/nuketown/index.js` exports `MAP_NUKETOWN` wrapping the existing `buildMap()`, not wired into `Game.js` yet.
- [x] `src/settings/Settings.js` — graphics presets (low/medium/high/ultra), `localStorage` persistence, `applyToGame()` guarded against missing fields.
- [x] Settings loaded + applied on boot (`main.js`); a graphics preset `<select>` on the pause screen calls `setGraphicsPreset()` + `applyToGame()` live.
- [x] `npm run build` still succeeds; `Game.js` play loop untouched (movement/collision/combat code paths unchanged).
- [x] `Player.js` physics untouched — still the hand-rolled AABB mover.

Everything added in Phase 0 is additive and inert: new files aren't imported by
gameplay code except `Settings.js` (renderer/particle/shadow tweaks only) and the
map/mode stubs (which just re-export existing functions).

---

## Phase 1 — Rapier physics (1a–1d done)

Introduce `@dimforge/rapier3d` behind the `IPhysicsWorld` contract, migrating one
concern at a time so the game stays playable between steps.

### 1a. Physics manager — DONE (2026-08-05)
- [x] `@dimforge/rapier3d-compat` dependency + async WASM init (`PhysicsManager.initRapier()`, idempotent).
- [x] `src/physics/PhysicsManager.js` implements the real Rapier world: static cuboid
  colliders, kinematic capsule character controller, `step`, `moveCharacter`,
  `getTranslation`/`teleport`/`setNextTranslation`, `raycast` (unused by gameplay yet), `dispose`.
- [x] Wired via `Game.initPhysics()` (awaited once from `main.js`) — `this.physics` on `Game`,
  `null` until ready, so nothing breaks if init fails/races.

### 1b. Map colliders — DONE (2026-08-05)
- [x] `PhysicsManager.setMapFromMapData(mapData)` converts `mapData.colliders` (AABB
  boxes, see `MapBuilder.js`) into Rapier fixed cuboid bodies, skipping `solid === false`.
- [x] `mapData.floors[]` also gets thin (0.08m) fixed cuboid walk pads so autostep/
  snap-to-ground has real geometry to stand on (floors[] has no other Rapier presence).
- [x] Legacy `colliders` array stays the source of truth for shot/LOS (`collision.js`)
  and bots (`BotAI.js`) — untouched, still used every frame regardless of physics state.
- [x] `Doors.js` open/close mirrors into the Rapier collider via `DoorManager.onSolidChange`
  (set by `Game.initPhysics()`) → `PhysicsManager.setColliderSolid()`, looked up by legacy
  collider object identity (`WeakMap`), enabling/disabling the Rapier collider in lockstep.

### 1c. Player — DONE behind `USE_RAPIER_PLAYER` flag (2026-08-05)
- [x] `Player.js` gained `setPhysics()` (spawns a capsule character controller at the
  current position) + a Rapier branch in `update()` using
  `PhysicsManager.moveCharacter()` (autostep 0.55, snap-to-ground 0.4, max slope 45°).
  KEEPS: look, wish-velocity accel/friction, coyote time, double-Space roof mantle,
  bot push-out, camera sync, arena clamp — only the low-level resolve (XZ push-out,
  floor snap, ceiling clamp) is swapped for Rapier's real 3D collision.
- [x] Falls back to the legacy AABB mover whenever `USE_RAPIER_PLAYER` is off or
  `setPhysics()` was never called — all `test:physics-*` / `test:stairs` /
  `test:house-*` / `test:doors` / `test:shot-los` / `test:ceiling` scripts still run
  the legacy path (they never call `setPhysics`) and stay green.
- [x] Respawn / `fullMatchReset` / roof mantle all teleport the Rapier capsule too
  (`PhysicsManager.teleport`), so the visual `this.position` and the physics body
  never drift apart.
- [x] New smoke tests: `npm run test:rapier-boot`, `test:rapier-player`,
  `test:rapier-garage`, `test:rapier-garage-player`.
- [x] Garage climb fix: Rapier step solids (`_buildStepSolids`) + ceiling clip
  (`_clipFloorAgainstSteps`) so overlapping thin floor pads no longer wedge the
  capsule mid-climb; player can board the garage roof without jumping.
- [x] Rapier loaded via dynamic `import()` so the WASM chunk is code-split from
  the main bundle.

### 1d. Bots — DONE (2026-08-05)
- [x] `USE_RAPIER_BOTS` flag; `BotManager.setPhysics()` spawns a capsule controller per bot
  (feet ↔ eye via `BOT_BODY_HEIGHT`), removes on `clear()`, disables on death, teleports on respawn.
- [x] Alive bots resolve with `PhysicsManager.moveCharacter()` (same autostep/snap/slope as the
  player); legacy AABB path kept when physics isn't wired (keeps `test:phase-b-bots` green).
- [x] Fence vaults arm a Rapier jump + air wish (`BOT_VAULT_JUMP`); doors still open via
  `_tryOpenDoorForMove` / `requestOpenNear`.
- [x] `Game._update`: `player.update` → `bots.update` → single `physics.step` so all capsules
  commit together.
- [x] `PhysicsManager.removeCharacter` / `setCharacterEnabled` + optional `jumpSpeed` on
  `moveCharacter` for bot vault impulse.
- [x] Smoke test: `npm run test:rapier-bots`.

**Exit criteria for Phase 1:** ✓ met (Rapier player + bots; legacy AABB kept as fallback for unit tests).

---

## Phase 2 — Multiplayer (listen-server + invite code)

**Product goal (friend groups):** one player hosts from inside the game; friends join
with an invite code. Cheap/self-hosted first — no paid always-on game servers required
for v1. Host machine is authoritative (“server owns truth”).

### Player-facing flow
1. **Host server** → game starts the host/session in the background → shows **invite code**.
2. Friends: **Search server** → enter code → **Join server**.
3. If the match has **not** started → everyone lands in a **waiting lobby**.
4. Host presses **Start** → countdown **10 → 0** → match begins.
5. **Late join** (match already in progress):
   - Allowed for **Deathmatch / Team Deathmatch / Capture the Flag** → join straight into the live match (no lobby).
   - **Not** allowed for the **PUBG-style** mode → reject (“match already in progress”).

### 2a. LAN listen-server + lobby + code — DONE (2026-08-06)
- [x] Host path in UI: Host server → generate short invite code → show in lobby.
- [x] Join path: Search server → enter code → Join (LAN hub **port 8787**, not Vite HMR port).
- [x] Waiting lobby UI (player list, invite code, host-only Start, Leave).
- [x] Countdown 10→0 (server-tick) then all clients enter match shell.
- [x] Pure room rules + late-join policy (`roomLogic.js`, `test:lan-room`).
- [x] Host button clickable (`.start-mp-actions` pointer-events fix).
- [x] Authoritative host sim: clients send `InputFrame`; host runs combat + snapshots (`MpMatch`).
- [x] Remote player avatars / hit sync (`RemoteAvatars` + hit/kill/respawn events).
- [x] Keep single-player bot match as PLAY (unchanged).
- [x] Tests: `npm run test:mp-sync`.

**Next session:** Phase 3 (real TDM/CTF/BR gameplay) or Phase 4 polish (prediction feel).

### 2b. Online join (NAT) — DONE (2026-08-06)
- [x] WebRTC datachannel to host (`RtcLink` / `OnlineSession`); STUN via public Google servers.
- [x] Signaling on existing hub: `signal` (offer/answer/ICE) + invite code → room.
- [x] Join UI: optional **Host address** for online/NAT (empty = same Wi‑Fi / page host).
- [x] Overrides: `__SBARG_SIGNAL_URL__`, `__SBARG_ICE_SERVERS__`.
- [x] Tests: `npm run test:rtc-signal`.
- [ ] Optional paid/free always-on TURN relay — only if many home NATs fail (not required for 2b).

### 2c. More modes + late-join policy — DONE (2026-08-06)
- [x] Team Deathmatch + Capture the Flag + Battle Royale modules under `src/modes/` (+ registry).
- [x] Lobby host mode pick (`#lobby-mode-select` → `set_mode` / `setRoomMode`).
- [x] Late-join **on** for DM / TDM / CTF; **off** for PUBG once started (roomLogic + tests).
- [x] Host disconnect policy v1: match ends (`HOST_DISCONNECT_POLICY`, `host_left` → UI).
- [x] Team seat assign (`alpha`/`bravo`) for TDM/CTF in room state.
- [ ] Full TDM/CTF/BR gameplay rules in the live match (flags, zone mesh) — Phase 3.

**Exit criteria for 2b/2c scaffolding:** ✓ met (online path + mode pick + policies). Speelbare synced DM blijft 2a remainder + Phase 3 content.

### Design constraints
- **Server owns truth** — no client-trusted position/health/kills.
- Reuse Rapier `PhysicsManager` on the host (same resolve as local play).
- Prefer listen-server in-process first; optional separate `node` process later if packaging needs it.
- No accounts/logins in v1 — nickname + invite code is enough.

### Phase 2 exit (minimum)
- Two machines on one LAN: host + join with code, lobby, countdown, playable deathmatch.
- Late-join rules documented in code for DM vs future PUBG mode.

---

## Phase 3 — Modes & match feel (after playable MP deathmatch)

**Goal:** the game modes friends actually want, with lobby mode-select and solid rules.

- [ ] Lobby: host picks mode (Deathmatch / TDM / CTF / Battle Royale).
- [ ] **Team Deathmatch** — teams, team score, team spawns / friendly-fire policy.
- [ ] **Capture the Flag** — flags, capture/return, score win.
- [ ] **Battle Royale (PUBG-style)** — shrinking zone, loot/loadout rules TBD, **no late join**.
- [ ] Scoreboard / end-screen per mode; bots optional to fill empty slots in MP.
- [ ] Wire `src/modes/*` into real match flow (not stubs only).

**Exit:** at least DM + one team mode playable online; BR rules stubbed or playable MVP.

---

## Phase 4 — Net polish & resilience

**Goal:** multiplayer that feels fair and survives bad Wi‑Fi / host issues.

- [ ] Client-side prediction + reconciliation (smooth remote movement).
- [ ] Lag compensation basics for hitscan (host-authoritative).
- [ ] Host disconnect: clear “host left” end; optional **host migration** later.
- [ ] Reconnect / rejoin mid-match where mode allows (not BR).
- [ ] Voice-optional later — **not** required; keep v1 text/toast only.
- [ ] Anti-cheat light: ignore impossible client claims (speed/ammo); host remains truth.

**Exit:** playable 4–8 friends on mixed home networks without constant desync rage-quits.

---

## Phase 5 — Content & maps

**Goal:** more places to fight, still one-composition pastel brand.

- [ ] Second map (or Nuketown variant) behind `src/maps/` loader.
- [ ] Map vote / host map pick in lobby.
- [ ] More weapons / streaks / cosmetics only if they don’t break MP authority.
- [ ] Offline still first-class: PLAY vs bots on any unlocked map.

**Exit:** ≥2 maps selectable in lobby; offline + online both work.

---

## Phase 6 — Ship & distribute (friend-group release)

**Goal:** easy install/share without “run npm on my PC” for every friend.

- [ ] Packaged desktop build (e.g. Electron/Tauri) **or** simple static host + `lan-host` helper.
- [ ] One-click **Host** still starts background hub (no manual terminal for normal users).
- [ ] Windows installer / zip release notes; version number in UI.
- [ ] Optional: tiny always-free signaling only (still no paid game servers).
- [ ] Still avoid Steam/Epic lock-in unless you later choose a store.

**Exit:** a non-dev friend can install, host, and invite with a code.

---

## Backlog / maybe-later (not scheduled phases)

- Shot/LOS fully on Rapier `raycast` (parity cleanup; still fine on AABB today).
- Dedicated 24/7 rented server (only if friend-host model isn’t enough).
- Accounts, ranked, cloud saves.
- Mobile / console.
- Full NavMesh AI overhaul.

---

## Non-goals right now

- Shot/LOS (`collision.js#rayBlockedBySolids`) does not use `PhysicsManager.raycast()`
  yet — still the legacy ray–AABB path against `mapData.colliders`.
- No paid 24/7 dedicated game-server farm (friend-host is the v1 model).
- No Steam/Epic/PlayFab lock-in for v1.
- Host migration / seamless host handoff — Phase 4+.
- Full PUBG mode — Phase 3 (after 2a/2b basics).
