# HANDOFF — Sbarg Nuketown

> **Nieuwe chat?** Lees eerst **[`CONTINUITY.md`](CONTINUITY.md)** — dat is de actuele single source of truth.  
> Dit bestand is een korte spiegel zodat oude prompts die “HANDOFF” noemen nog kloppen.

**Laatst bijgewerkt:** 2026-08-16 (Candy Foundry shipping live)
**Lokale game:** http://127.0.0.1:5175/
**Progress dashboard:** http://127.0.0.1:8766/
**Workspace checkpoint:** `main` — Candy Foundry live via start-toggle
**Live:** https://sberg-nuketown.vercel.app/ · hub https://sbarg-nuketown-hub.onrender.com  
**Repo:** https://github.com/aimcreativenl/sberg-nuketown · branch `main`

---

## A. Sessie-stop — LEES EERST (of open CONTINUITY.md)

### A.1 Status

| Blok | Status |
|------|--------|
| Phase 0–1, 2a–2c | DONE |
| **Phase 4a** reconcile / remote interp / lag-comp | **DONE** (`56be586`) |
| Phase 4b reconnect / migration | OPEN |
| Phase 3 mode content (TDM/CTF/thin BR) | **DONE** |
| Phone landscape start + tap-to-shoot (no FIRE btn) | **DONE** (`eae3178`) |
| Phase 5 tweede map (Candy Foundry) | **Live via start-toggle** — pickup [`src/maps/candy-foundry/STATUS.md`](src/maps/candy-foundry/STATUS.md) |

### A.2 Recent gefixt (niet opnieuw debugggen)

| Issue | Fix | Commit |
|-------|-----|--------|
| Host/Search niet klikbaar onder PLAY | CSS hitbox / geen PLAY-scale | `a8d9145` |
| Deuren desync → sticky muren / ontbrekend guest-body | Host door events + snapshot; remote ghost capsules | `a94989a` |
| Rubber-band / laggy remotes / unfair hits | InputHistory + ackSeq; RemoteAvatars buffer; PoseHistory lag-comp | `56be586` |
| Player spawn op blokken / geen WASD-uitweg | Ground-level selectie; 16-richting escape-check; 4m bot-gap; grid rescue; expliciete onmogelijke-mapfout | `86e1cac` |
| Landscape start: zwarte balk + S'BERG clip; M16-tap geblokt; FIRE-knop | Twee-koloms short landscape CSS; banner z-index 45 / look-pad `top: 88px`; look-tap = `shootClicks`; FIRE weg | `eae3178` |

### A.3 Kernpaden

`src/net/MpMatch.js` · `InputHistory.js` · `PoseHistory.js` · `RemoteAvatars.js` · `NetPawn.js` · `Game.js` · `Doors.js` · `PhysicsManager.js`

### A.4 Tests / run

```bash
npm run dev
npm run test:mp-sync
npm run test:player-spawns
npm run build
```

### A.5 Volgende stappen

Candy Foundry is **live** (start-toggle; default blijft nuketown). Pickup: **[`src/maps/candy-foundry/STATUS.md`](src/maps/candy-foundry/STATUS.md)**.

1. **Phase 5 remainder** — lobby map-vote  
2. **Phase 4b** — reconnect als disconnects pijn doen  
3. Online TDM/CTF/BR op Foundry playtesten  

Details, gotchas, architectuur: **[`CONTINUITY.md`](CONTINUITY.md)**.  
Fasen-checklist: **[`ROADMAP.md`](ROADMAP.md)**.  
Deploy: **[`DEPLOY.md`](DEPLOY.md)**.

**Einde handoff.**
