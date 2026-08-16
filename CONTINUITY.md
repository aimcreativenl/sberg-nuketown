# CONTINUITY — S'Berg Nuketown

**Lees dit bestand eerst** in een nieuwe chat. Daarna alleen dieper in als je iets gaat wijzigen.

| | |
|--|--|
| **Laatst bijgewerkt** | 2026-08-16 |
| **Current checkpoint** | `main` — Candy Foundry (Syrup Canal Foundry) shipping live |
| **Local game** | http://127.0.0.1:5175/ |
| **Progress dashboard** | http://127.0.0.1:8766/ |
| **HEAD (typisch)** | `eae3178` (`feat: fix phone landscape menu and tap-to-shoot`) |
| **Branch** | `main` |
| **Repo** | https://github.com/aimcreativenl/sberg-nuketown |
| **Game (live)** | https://sberg-nuketown.vercel.app/ |
| **Signal hub** | https://sbarg-nuketown-hub.onrender.com (`/health`, `/mp`) |
| **Workspace** | `C:\Users\Gebruiker\Documents\Sbarg Nuketown` |

---

## 0. Leesvolgorde voor een nieuwe agent

1. **Dit bestand** (`CONTINUITY.md`) — status, recent werk, next steps  
2. [`ROADMAP.md`](ROADMAP.md) — fasen (wat open vs done)  
3. [`DEPLOY.md`](DEPLOY.md) — alleen bij deploy/hub issues  
4. Code pas openen als je gaat bouwen (paden hieronder)

Oudere notities: [`HANDOFF.md`](HANDOFF.md) (spiegel van §A), [`CHANGELOG-SESSION.md`](CHANGELOG-SESSION.md) (deels historisch).

---

## 1. Product in één zin

Pastel voxel FPS (Nuketown-achtig): **offline PLAY vs 9 bots**, of **online listen-server** (één browser host + invite code + WebRTC). Host is authoritative. Hub op Render is alleen lobby/signaling — geen game-server.

**Stack:** Three.js r185 · Vite 8 · Rapier (`@dimforge/rapier3d-compat`) · `ws` · vanilla ES modules (geen React/TS).

---

## 2. Statusbord (waar we staan)

| Fase | Status | Notitie |
|------|--------|---------|
| 0 Scaffold | DONE | |
| 1 Rapier (1a–1d) | DONE | Player + bots; legacy AABB blijft voor unit tests |
| 2a Lobby + combat sync | DONE | `MpMatch`, snapshots, remotes |
| 2b Online / NAT | DONE | WebRTC + STUN; TURN nog optioneel |
| 2c Modes scaffolding | DONE | Mode pick + late-join policy |
| **4a Net polish MVP** | **DONE** | Reconcile, remote interp, lag-comp |
| 4b Reconnect / host migration / anti-cheat | OPEN | Bewust niet in 4a |
| **3 Modes content** | **DONE (thin)** | Online TDM + CTF + last-alive BR; geen BR-loot, geen MP-bots-fill |
| 5 Maps / 6 Ship | OPEN | Foundry live via start-toggle; geen lobby-vote |
| **Spawn safety / WASD start** | **DONE** | `86e1cac`; ground-level, escapable, bot-separated spawn selection |

**Aanbevolen next:** lobby map-vote, live TDM/CTF/BR playtest, of Phase 4b.

---

## 3. Sessie-log — wat recent is gedaan (2026-08-16; historical entries retained)

Gebruik dit als “wat al gefixt is, niet opnieuw onderzoeken”.

### 3.00 Candy Foundry — **lokaal play-ready, niet live** (2026-08-16)

User koos concept 4 **Syrup Canal Foundry**. Pickup: **[`src/maps/candy-foundry/STATUS.md`](src/maps/candy-foundry/STATUS.md)**.

**Status:** Foundry is lokaal speelbaar via start-toggle. Sweet Co + Sugar Works inloopbaar (L1→L2). Pretzel-klim, gumdrop-brug, kanalen slow×0.42. 9 bots lopen. Nuketown PLAY na switch werkt. Nog niet gepusht.

**Fixes deze play-ready pass:**
- `yard.js`: `walkAabb` mist `x`/`z` → zuidbank pretzel-trap had 11 NaN-colliders en crashte Rapier `world.step`. Elke trapvlucht heeft nu `chain: name`.
- `buildings.js`: interieur-PointLights 0.38 → 22 candela; extra wainscot/bowl decor (geen nieuwe deur/trap-colliders).
- `NetPawn` + `MpMatch`: remotes volgen `slowZones` (wish scale + cap).
- `test:candy-foundry` doet nu Rapier-walks (Sweet/Sugar L2 ~3.47, pretzel 4.62, canal ×0.42, gumdrop y=0.56).
- **Canal-flikker:** transparante chocolade/aardbei-slabs + underlay sneden elkaar. `shell.js` punch crossings + underlay; siroop opaak.
- **Kiosk + conveyor:** inloopbare proeverij SE (`door_front_tasting_kiosk`). Lopende band z=−39.6 met bewegende doosjes; sprint = meerijden.

**Nog:** lobby map-vote (bewust later). Commit/push alleen op verzoek.

### 3.00b Phone landscape + tap-to-shoot (2026-08-16) — **live** `eae3178`

Live op `main`: **`eae3178`**. Direct daarvoor op live: `9e0203f` (voxel titlescreen, opaque viewmodel, pause → main menu).

Drie mobiele bugs (landscape start + in-match):

1. **Startscherm landscape** — S'BERG werd afgesneden; PLAY’s 3D-schaduw (`0 15px 0 #1a1020`) was bijna schermbreed en leek een zwarte balk door de 3D-map.  
   **Fix:** [`src/style.css`](src/style.css) `@media (orientation: landscape) and (max-height: 600px)`: twee-koloms hero (titel links, PLAY + 2×2 rechts), kleine knopschaduwen, hide reticle/weapon/crown/eyebrow. `html, body, #app { height: 100dvh }`. Canvas-resize via `clientWidth`/`visualViewport` in [`Game.js`](src/game/Game.js) `_resize` (`setSize(..., false)` + CSS 100%).

2. **M16 wisselen** — `#hud` is `pointer-events: none`; `.touch-look` (z-index 30, full overlay) ving taps op de wapennaam af.  
   **Fix:** `html.touch-play #weapon-banner { z-index: 45; pointer-events: auto }`; look-pad begint op `top: 88px` zodat de banner vrij blijft. Tik op de banner togglet slot 0 ↔ 1 (`Game._bindWeaponBannerSwap`).

3. **FIRE-knop weg; rechterduim tikt om te schieten** — look-pad: slepen = kijken, korte tik (`<220ms`, `<16px`) = `shootClicks++`. M16 accepteert `shootClick` als één schot ([`Weapons.js`](src/game/Weapons.js)). MP: [`sampleInput.js`](src/net/sampleInput.js) zet `fire` ook bij `shootClicks > 0`. How-to: “Right side: drag to look · tap to shoot”.

**Bestanden:** `index.html`, `src/style.css`, `src/input/TouchControls.js`, `src/game/Game.js`, `src/game/Weapons.js`, `src/net/sampleInput.js`, plus tests `check-touch-play`, `check-phase-a-weapons`, `check-mp-sync`.

**Niet gecommit:** `.playwright-mcp/`, `scripts/_vm-verify/`, `scripts/verify-viewmodel.mjs`, `public/brand/sberg-nuketown-keyart.png`, `task6-hud.png`.

**Tests:** `test:touch-play`, `test:phase-a-weapons`, `test:phase-d-hud`, `test:mp-sync`, `test:menu-camera`, `build` green. Browser: iPhone landscape 812×375 (titel niet clip, PLAY-schaduw 5px); in-match banner `elementFromPoint` raakt `#weapon-banner`; look-tap queued `shootClicks`.

### 3.01 Phase 3 online modes + live push (2026-08-14)
- Online **TDM**: team score to 20, no friendly fire, house-side spawns, TEAM HUD.
- Online **CTF**: 3 captures, host-authoritative pickup/drop/return/capture, own flag must be home, pastel poles + CAPS HUD.
- Online **thin BR**: last alive, no respawn, min 2 players, shrinking zone + outside DPS, ALIVE HUD. No loot/loadout.
- Offline **PLAY** stays deathmatch vs 9 bots.
- Tests: `test:modes`, `test:lan-room`, `test:mp-sync`, `test:phase-d-hud`, `build` green.
- This push also lands spawn-escape + weapon/bot polish that lived on `codex/fix-player-spawn`.

### 3.0 Spawn on blocks / no WASD escape (2026-08-09)
- Root cause: direct overlap filtering was insufficient; several free authored points were surrounded by colliders, and one placed the player beside a bot.
- Fix in `src/game/Game.js`: ground-level candidates only; 16 movement-path checks over 2.2m; minimum 6 open directions; preferred 4m horizontal gap from living bots; exhaustive scoring instead of eight random samples.
- Stale-map fallback searches a ground grid; a fully blocked map raises an explicit error. Regression coverage lives in `scripts/check-player-spawns.mjs`.
- Verification: spawn test, colliders, Rapier player/bots, movement, MP sync and build green; browser `:5175` fresh PLAY + ten W bursts moved freely; console errors 0; independent reviewer PASS.
- Checkpoint: `86e1cac`. Dashboard captures: `ref/polish/spawn-fixed-before-wasd.png`, `ref/polish/spawn-fixed-after-wasd.png`.

### 3.1 UI — Host/Search niet klikbaar
- **Probleem:** PLAY scale-animatie vergroot hitbox over Host/Search; links hadden `padding: 0`.
- **Fix:** [`src/style.css`](src/style.css) — geen scale op PLAY; grotere hit zones + z-index op `.start-mp-actions`.
- **Commit:** `a8d9145`

### 3.2 MP desync — deuren / onzichtbare muren / guest-avatar
- **Probleem:** deuren alleen lokaal → guest open, host dicht → soft-correct + jammed avatar (nameplate `depthTest: false`). Host remote Rapier-capsules blokkeerden als muren.
- **Fix:**
  - Host-autoritatieve deuren: interact edge → toggle → `event kind:'door'` + `doors[]` in snapshot ([`Doors.js`](src/game/Doors.js), [`MpMatch.js`](src/net/MpMatch.js), [`Game.js`](src/game/Game.js) `_onMpEvent` / `_updateInteract`).
  - Remote pawns: `remoteGhost: true` collision groups ([`PhysicsManager.js`](src/physics/PhysicsManager.js), [`NetPawn.js`](src/net/NetPawn.js)).
  - Soft-correct milder (later vervangen door 4a reconcile).
- **Commit:** `a94989a`

### 3.3 Phase 4a — net polish MVP
- **Guest reconcile:** [`InputHistory.js`](src/net/InputHistory.js) + `ackSeq` op player snap → residual correctie (`MpMatch._reconcileLocal`), geen harde distance-yank.
- **Remote interp:** [`RemoteAvatars.js`](src/net/RemoteAvatars.js) buffer + `tick()` met `REMOTE_INTERP_DELAY_MS` (100).
- **Lag-comp:** [`PoseHistory.js`](src/net/PoseHistory.js); hitscan rewind ≤ `LAG_COMP_MAX_MS` (150) o.b.v. shooter `lastInputAt`.
- Constants in [`NetTypes.js`](src/net/NetTypes.js).
- Tests uitgebreid: `npm run test:mp-sync`.
- **Commit:** `56be586`
- **Niet gedaan (4b):** mid-match reconnect, host migration, TURN, voice, strakke anti-cheat.

### 3.4 Deploy / ops (al eerder op main)
- Vercel game + Render hub; `VITE_SBARG_SIGNAL_URL=wss://…/mp`
- Keep-alive: GitHub cron + client `/health` poke + UptimeRobot aanbevolen
- WASD in lobby-inputs gefixt; Render cold-start timeout langer

---

## 4. Architectuur-snapshot (MP)

```
Guest ──input 30Hz──► Host (MpMatch)
                        │ NetPawn.stepMovement + Rapier (remotes = ghost vs players)
                        │ doors host-auth · PoseHistory · hitscan (+lag-comp)
Guest ◄──snapshot 20Hz─┤ players[].ackSeq + doors[] + serverTime
Guest ◄──event─────────┤ hit|kill|respawn|match_end|door
```

- **Offline PLAY:** bots, geen `MpMatch`. Niet breken.
- **Online:** lobby via WS hub → WebRTC datachannel `sbarg` voor game bytes.
- **Pointer lock:** dual-tab test = vensters naast elkaar; één lock tegelijk.

---

## 5. Belangrijke paden

| Pad | Rol |
|-----|-----|
| `src/game/Game.js` | Loop, MP wiring, interact, `_onMpEvent` |
| `src/game/Doors.js` | `setOpen` / `toNetState` / `applyNetState` |
| `src/game/Player.js` | Lokale prediction + Rapier capsule |
| `src/net/MpMatch.js` | Host/guest match, reconcile, lag-comp, doors |
| `src/net/NetPawn.js` | Auth pawn, `ackSeq`, `remoteGhost` physics |
| `src/net/RemoteAvatars.js` | Remote meshes + interp |
| `src/net/InputHistory.js` / `PoseHistory.js` | Phase 4a buffers |
| `src/net/OnlineSession.js` / `RtcLink.js` | Lobby + P2P |
| `src/physics/PhysicsManager.js` | Rapier world + collision groups |
| `server/lan-host.mjs` | Hub (ook Render `npm start`) |
| `src/maps/index.js` | Map registry (`nuketown` / `candy-foundry`) |
| `src/maps/candy-foundry/` | Tweede map WIP — start bij `STATUS.md` |

---

## 6. Gotchas (niet opnieuw ontdekken)

1. **Host-tab moet open blijven** — listen-server zit in de host-browser.  
2. **P2P ready** vereist vóór combat sync; anders geen snapshots.  
3. **Render Free** slaapt ~15 min zonder traffic — keep-alive helpt, geen SLA.  
4. **Deuren in MP:** niet lokaal togglen in `Game._updateInteract` als `mpMatch` live is.  
5. **PowerShell:** geen bash heredoc voor `git commit`; gebruik `` `n `` of `-m` strings.  
6. **Commit `.env.txt` nooit** (API keys) — gitignored.  
7. **Lag-comp** heeft geen echte RTT-ping; proxy = tijd sinds laatste input van shooter.  
8. Frontend design rules van de user gelden voor UI-werk; game HUD mag bestaande pastel look houden.  
9. **Phone landscape start:** korte hoogte → twee-koloms `.start-hero`. PLAY-schaduw klein houden — een volle-breedte 15px slab ziet eruit als een zwarte balk door de map.  
10. **Touch fire:** geen FIRE-knop. Rechts: drag = look, tap = `shootClicks`. Wapenbanner moet boven `.touch-look` blijven (`z-index: 45`, look-pad `top: 88px`). IDs `#btn-play` / `#weapon-banner` / `#touch-controls` niet slopen.  
11. **Candy Foundry:** locally playable via start-toggle. Pickup [`src/maps/candy-foundry/STATUS.md`](src/maps/candy-foundry/STATUS.md). `loadMap` no-ops while `this.running`. `NetPawn` clamp follows `mapData.bounds`. Camera/sky/menu scale with `wall`.

---

## 7. Commando’s

```bash
npm run dev          # game + lokale hub :8787
npm run build
npm run test:mp-sync
npm run test:lan-room
npm run test:rtc-signal
npm run test:modes
npm run test:doors
npm run test:candy-foundry
```

Live deploy: push naar `main` → Vercel + Render volgen de repo.

---

## 8. Volgende sessie — concrete startprompts

HEAD ships Candy Foundry (start-toggle; default remains nuketown). Pickup: `src/maps/candy-foundry/STATUS.md`. **Next:** lobby map-vote, TDM/CTF/BR on Foundry, or Phase 4b.

**Playtest / bugs:** “Online TDM/CTF/BR voelt nog X — fix in MpMatch / mode module.” Of mobile: “landscape start / wapenwissel / tap-to-shoot.”

**Phase 4b:** “Mid-match reconnect + rejoin waar late-join mag; host_left blijft end_match tenzij migration.”

**Phase 5:** “Tweede pastel map, zelfde collision/net contract.”

---

## 9. Definition of done voor docs-update

Als je een sessie afsluit: werk **§2 statusbord**, **§3 sessie-log** (nieuw blok bovenaan), en **§8 next** bij in dit bestand. Spiegel kort in `HANDOFF.md` §A. Vink fasen in `ROADMAP.md`.

**Einde CONTINUITY.**
