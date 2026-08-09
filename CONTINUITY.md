# CONTINUITY — S'Berg Nuketown

**Lees dit bestand eerst** in een nieuwe chat. Daarna alleen dieper in als je iets gaat wijzigen.

| | |
|--|--|
| **Laatst bijgewerkt** | 2026-08-09 |
| **Current checkpoint** | `6c05a01` docs checkpoint; functional spawn fix `86e1cac` |
| **Local game** | http://127.0.0.1:5175/ |
| **Progress dashboard** | http://127.0.0.1:8766/ |
| **HEAD (typisch)** | `6c05a01` — spawn verification docs/captures (check `git log -1`) |
| **Branch** | `codex/fix-player-spawn` |
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
| 2c Modes scaffolding | DONE | Mode pick + late-join policy; **geen** echte CTF/BR content |
| **4a Net polish MVP** | **DONE** | Reconcile, remote interp, lag-comp |
| 4b Reconnect / host migration / anti-cheat | OPEN | Bewust niet in 4a |
| **3 Modes content** | **OPEN** | Volgende grote feature-track |
| 5 Maps / 6 Ship | OPEN | |
| **Spawn safety / WASD start** | **DONE** | `86e1cac`; ground-level, escapable, bot-separated spawn selection |

**Aanbevolen next:** online DM playtesten → daarna **Phase 3** (TDM/CTF/BR speelbaar) óf **Phase 4b** (reconnect) als disconnects pijn doen.

---

## 3. Sessie-log — wat recent is gedaan (2026-08-09; historical entries retained)

Gebruik dit als “wat al gefixt is, niet opnieuw onderzoeken”.

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
| `DEPLOY.md` | Vercel/Render stappen |

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
```

Live deploy: push naar `main` → Vercel + Render volgen de repo.

---

## 8. Volgende sessie — concrete startprompts

Spawn/WASD-start is opgelost in `86e1cac`; gebruik voor playtests de lokale link `http://127.0.0.1:5175/` en voor voortgang `http://127.0.0.1:8766/`. Een volgende technische check kan optioneel directe BotManager/Rapier-locomotion coverage toevoegen; daarna zijn Phase 3/4b de geplande tracks.

**Playtest / bugs:** “Online DM voelt nog X — fix in MpMatch/RemoteAvatars.”

**Phase 3:** “Implementeer speelbare TDM of CTF (flags/score/HUD) op bestaande mode registry + MpMatch.”

**Phase 4b:** “Mid-match reconnect + rejoin waar late-join mag; host_left blijft end_match tenzij migration.”

---

## 9. Definition of done voor docs-update

Als je een sessie afsluit: werk **§2 statusbord**, **§3 sessie-log** (nieuw blok bovenaan), en **§8 next** bij in dit bestand. Spiegel kort in `HANDOFF.md` §A. Vink fasen in `ROADMAP.md`.

**Einde CONTINUITY.**
