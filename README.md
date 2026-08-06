# S'Berg Nuketown

Pastel voxel Free-For-All FPS (Nuketown-achtig) — **Three.js** + Vite + Rapier + optional online listen-server.

## Play

```bash
npm install
npm run dev
```

Open the local URL (default **http://127.0.0.1:5173/**).  
**Live:** https://sberg-nuketown.vercel.app/

## For AI agents / next session

Start with **[`CONTINUITY.md`](CONTINUITY.md)** (status + handoff). Also: [`ROADMAP.md`](ROADMAP.md), [`DEPLOY.md`](DEPLOY.md), [`AGENTS.md`](AGENTS.md).

## Gameplay

- **Offline:** PLAY — you vs 9 pastel AI bots, first to **20 kills**
- **Online:** Host Server / Search Server — invite code, lobby, WebRTC to host browser
- **Loadout:** 1 = Pistol · 2 = M16 · E = doors / medkits

## Controls

| Key | Action |
|-----|--------|
| WASD | Move |
| Space | Jump |
| Shift | Sprint |
| LMB | Shoot |
| RMB | Aim / M16 scope |
| R | Reload |
| E | Door / medkit |
| Esc | Pause |
| Tab | Scoreboard |

## Stack

- Three.js r185 · Vite 8 · `@dimforge/rapier3d-compat` · `ws`
- Procedural voxel map, weapons, characters, particles, Web Audio SFX
