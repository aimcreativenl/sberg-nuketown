# HANDOFF — Sbarg Nuketown (voor volgende AI-agent)

**Laatst bijgewerkt:** 2026-08-06 (Phase 4a net polish MVP)  
**Workspace:** `c:\Users\Gebruiker\Desktop\AI projecten\Sbarg Nuketown`  
**Stack:** Three.js **r185** + Vite 8 + `@dimforge/rapier3d-compat` 0.19 + `ws` 8, vanilla ES modules  
**Play:** `npm run dev` → **http://localhost:5173/** (of 5174)  
**LAN / signal hub:** **ws://localhost:8787/mp** (auto met `npm run dev`)  
**Live:** https://sberg-nuketown.vercel.app/ · hub https://sbarg-nuketown-hub.onrender.com  

Lees **§A** eerst.

---

## A. Sessie-stop (2026-08-06) — LEES DIT EERST

### A.1 Status

| Blok | Status |
|------|--------|
| Phase 0–1 | DONE |
| Phase 2a–2c | DONE |
| **Phase 4a** prediction / remote interp / lag-comp | **DONE** |
| Phase 4b reconnect / host migration | OPEN |
| Phase 3 modes content | OPEN |

### A.2 Phase 4a — wat werkt

- Guest `InputHistory` + snapshot `ackSeq` → residual reconciliation (`MpMatch._reconcileLocal`)
- `RemoteAvatars`: buffer + `tick()` delayed interpolation (`REMOTE_INTERP_DELAY_MS`)
- Host `PoseHistory` per pawn → hitscan rewind ≤ `LAG_COMP_MAX_MS`
- Door sync (host events + snapshot) blijft staan
- Offline **PLAY** vs bots ongewijzigd
- Test: `npm run test:mp-sync`

### A.3 Hoe testen (2 machines / 2 browsers)

1. Host Server → mode → code delen  
2. Join (+ host address online) → P2P ready  
3. Start → bewegen / schieten / deuren — minder rubber-band, remotes soepeler  

### A.4 Belangrijke paden

| Pad | Rol |
|-----|-----|
| `src/net/MpMatch.js` | host/guest + reconcile + lag-comp |
| `src/net/InputHistory.js` | guest predicted poses by seq |
| `src/net/PoseHistory.js` | host pose rewind buffer |
| `src/net/RemoteAvatars.js` | remote interp buffer |
| `src/net/NetPawn.js` | `ackSeq` / `lastInputAt` in snaps |
| `src/net/NetTypes.js` | Phase 4 constants |

### A.5 Tests

```bash
npm run test:mp-sync
npm run test:lan-room
npm run test:rtc-signal
npm run test:modes
npm run build
```

### A.6 Gotchas

1. Combat sync vereist **open WebRTC** (lobby “P2P ready”).  
2. Lag-comp gebruikt tijd sinds laatste input van de shooter als rewind-proxy (geen aparte ping).  
3. Phase 4b (reconnect) nog niet.  
4. Hub poort **8787**; online = host IP invullen.

### A.7 Volgende stappen

1. Playtest online DM (Fase 4a feel)  
2. Phase 3: echte CTF / BR / TDM HUD  
3. Phase 4b: reconnect indien nodig  

**Einde handoff.**
