# src/modes/

Match modes built on the `IGameMode` contract (`IGameMode.js`).

| Module | Id | Notes |
|--------|-----|--------|
| `deathmatch.js` | `deathmatch` | FFA first to `KILL_LIMIT`; default offline + lobby |
| `tdm.js` | `tdm` | Team score via `teamKills.alpha/bravo` |
| `ctf.js` | `ctf` | Capture limit; flag meshes stubbed |
| `pubg.js` | `pubg` | Last alive; late-join off; zone data only |
| `registry.js` | — | `MODES`, `listModes()`, `getModeById()`, `getRoomModeMeta()` |

Lobby late-join flags live in `ROOM_MODES` (`src/net/roomLogic.js`). Use `getModeById(id)` from Game / UI; host picks mode in the waiting lobby (Phase 2c).
