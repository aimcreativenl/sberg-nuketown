# src/modes/

Match modes built on the `IGameMode` contract (`IGameMode.js`).

| Module | Id | Notes |
|--------|-----|--------|
| `deathmatch.js` | `deathmatch` | FFA first to `KILL_LIMIT`; default offline + lobby |
| `tdm.js` | `tdm` | Playable online: team score, no FF, house-side spawns, HUD  |
| `ctf.js` | `ctf` | Playable online: flags, pickup/drop/return, 3 captures |
| `pubg.js` | `pubg` | Playable online: last alive, no respawn, shrinking zone, min 2 players |
| `registry.js` | — | `MODES`, `listModes()`, `getModeById()`, `getRoomModeMeta()` |

Lobby late-join flags live in `ROOM_MODES` (`src/net/roomLogic.js`). Use `getModeById(id)` from Game / UI; host picks mode in the waiting lobby (Phase 2c). TDM, CTF, and thin BR are wired into `MpMatch` (Phase 3). Offline PLAY stays deathmatch.
