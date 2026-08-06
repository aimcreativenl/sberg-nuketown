# src/net/

Multiplayer networking (client ↔ authoritative **listen-server** / host).

## Phase 2a — LAN lobby + combat sync

1. **Host Server** → WebSocket hub creates a room → **invite code** in waiting lobby  
2. **Search Server** → enter code → **Join Server** → lobby (or late-join into live match)  
3. Host **Start** → shared countdown **10→0** → all clients enter the match  
4. Late join: allowed for DM / TDM / CTF; blocked for PUBG-style  
5. **Combat:** guests send `input` over WebRTC; host runs `MpMatch` (pawns + hitscan) and broadcasts `snapshot` / `event`; remotes rendered via `RemoteAvatars`

## Phase 2b — Online / NAT (WebRTC)

- Signaling still uses the hub (`ws://host:8787/mp`) for lobby + SDP/ICE relay.
- After join, guests open a **WebRTC datachannel** (`sbarg`) to the host (STUN via Google).
- **Online join:** fill **Host address** on the Join screen (LAN IP / hostname / public IP with port-forward). Leave empty for same Wi‑Fi.
- Overrides: `window.__SBARG_SIGNAL_URL__`, `window.__SBARG_ICE_SERVERS__`, `window.__SBARG_LAN_PORT__`.
- Gameplay bytes: `OnlineSession.sendGame()` — `input` / `snapshot` / `event` (see `MpMatch.js`).

## Phase 2c — Modes + host disconnect

- Lobby mode pick (host): Deathmatch / TDM / CTF / Battle Royale.
- Team modes assign `alpha` / `bravo` in room state.
- Host leave → `host_left` → match ends (`HOST_DISCONNECT_POLICY = 'end_match'`).

## How to run

- `npm run dev` — game **and** hub on **8787** (`/mp`)
- Optional: `npm run lan-host`
- Tests: `npm run test:lan-room`, `test:lan-ws`, `test:rtc-signal`, `test:modes`, `test:mp-sync`

## Files

| File | Role |
|------|------|
| `roomLogic.js` | lobby / countdown / late-join / modes / host-disconnect |
| `LanClient.js` | browser WebSocket client |
| `rtcConfig.js` | STUN + signal URL helpers |
| `RtcLink.js` | WebRTC DataChannel peer |
| `OnlineSession.js` | lobby + RTC orchestration (used by `Game.js`) |
| `MpMatch.js` / `NetPawn.js` / `RemoteAvatars.js` | Phase 2a host combat sync |
| `NetTypes.js` | `InputFrame` / snapshot / event wire types |
| `server/lanRoom.js` | Node hub + signal relay |

**Done for Phase 2a–2c scaffolding.** Phase 3 = real TDM/CTF/BR content; Phase 4 = net polish.
