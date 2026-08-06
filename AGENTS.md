# AGENTS.md — Cursor / AI agents

## Start hier

1. Open **[`CONTINUITY.md`](CONTINUITY.md)** — status, recent werk, next steps, gotchas.  
2. Check **[`ROADMAP.md`](ROADMAP.md)** voor open fasen.  
3. Wijzig geen docs-planbestanden onder `.cursor/plans/` tenzij de user dat vraagt.

## Productregels (kort)

- Offline **PLAY** vs bots mag niet breken bij MP-werk.  
- Host is authoritative (geen client-trusted HP/kills/positie).  
- Listen-server: host-browser = match truth; Render hub = signal/lobby only.  
- Commit/push alleen als de user dat vraagt (of expliciet deploy-fix flow).  
- Geen secrets committen (`.env.txt`).

## Stack

Vanilla ES modules · Three.js r185 · Vite 8 · Rapier · `ws`. Geen React/TS tenzij gevraagd.

## Tests vóór “klaar” claimen bij net/MP

```bash
npm run test:mp-sync
npm run build
```
