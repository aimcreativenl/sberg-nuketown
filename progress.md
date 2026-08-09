Original prompt: Fix the game start where the player spawns on blocks beside an enemy bot and cannot move with WASD.

# Progress

## 2026-08-09 — stale server corrected

- The code fix in commit `bf67e26` was present in the workspace, but the previously shared `:5175` URL served an older Vite process without that fix.
- The stale process on `:5175` was replaced with the current workspace server.
- Fresh `:5175` browser start now places the player in open terrain; repeated `KeyD` and `KeyW` input visibly changes the view/position.
- Browser console errors: 0.
- Regression/build verification and independent review are pending in this session.

## Handoff

- Play URL: http://127.0.0.1:5175/
- Keep the current workspace server attached to `:5175`; do not validate against the unrelated `:5173` Erangel server.
