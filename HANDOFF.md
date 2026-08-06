# HANDOFF — Sbarg Nuketown (voor volgende AI-agent)

**Laatst bijgewerkt:** 2026-08-06 (Phase 2a combat sync + 2b/2c DONE)  
**Workspace:** `c:\Users\Gebruiker\Desktop\AI projecten\Sbarg Nuketown`  
**Stack:** Three.js **r185** + Vite 8 + `@dimforge/rapier3d-compat` 0.19 + `ws` 8, vanilla ES modules  
**Play:** `npm run dev` → **http://localhost:5173/** (of 5174)  
**LAN / signal hub:** **ws://localhost:8787/mp** (auto met `npm run dev`)  
**Git:** **geen** `.git` in deze folder.

Lees **§A** eerst.

---

## A. Sessie-stop (2026-08-06) — LEES DIT EERST

### A.1 Status

| Blok | Status |
|------|--------|
| Phase 0–1 | DONE |
| **Phase 2a** lobby + **combat sync** | **DONE** |
| **Phase 2b** Online/NAT WebRTC | DONE |
| **Phase 2c** modes / late-join / host_left | DONE |
| Phase 3+ | OPEN (echte TDM/CTF/BR content) |

### A.2 Phase 2a combat sync — wat werkt

- `MpMatch` + `NetPawn` + `RemoteAvatars` + `sampleInput` / `NetTypes`
- Guests sturen `input` (30 Hz) over WebRTC; host simuleert remotes + hitscan
- Host broadcast `snapshot` (20 Hz) + `event` (hit/kill/respawn/match_end)
- Remote mensen = `VoxelCharacter` meshes; scoreboard uit pawns
- Lokale wapen-VFX blijft; schade alleen host-authoritatief
- Offline **PLAY** vs bots ongewijzigd
- Test: `npm run test:mp-sync`

### A.3 Hoe testen (2 machines / 2 browsers)

1. `npm run dev` op host-PC  
2. Host Server → mode kiezen → code delen  
3. Join: code (+ optioneel host IP) → wacht tot P2P ready  
4. Host Start → countdown → elkaar zien / schieten  

### A.4 Belangrijke paden

| Pad | Rol |
|-----|-----|
| `src/net/MpMatch.js` | host/guest match loop |
| `src/net/NetPawn.js` | authoritative pawn |
| `src/net/RemoteAvatars.js` | remote meshes |
| `src/net/sampleInput.js` | InputFrame from Player |
| `src/net/OnlineSession.js` | WS + RTC `sendGame` |
| `src/game/Game.js` | `_ensureMpSession`, `startNetworkMatch`, `_onMpEvent` |

### A.5 Tests

```bash
npm run test:mp-sync
npm run test:lan-room
npm run test:lan-ws
npm run test:rtc-signal
npm run test:modes
npm run build
```

### A.6 Gotchas

1. Combat sync vereist **open WebRTC** (lobby status “P2P ready”).  
2. Host lokale beweging = `Player.update`; remotes = `NetPawn.stepMovement` + Rapier.  
3. Geen friendly fire als beide `team` gezet (TDM/CTF).  
4. Hub poort **8787**; online join = host IP invullen.  
5. Phase 4: betere reconciliation / lag comp nog open.

### A.7 Volgende stappen

1. Phase 3: echte CTF flags / BR zone / TDM HUD  
2. Phase 4: prediction polish, lag compensation  
3. Speel-verify met 2 browsers op LAN  

**Einde handoff.**
