# src/physics/

Rapier-backed physics for the local player (Phase 1a–1c).

- `IPhysicsWorld.js` — JSDoc contract / types
- `PhysicsManager.js` — Rapier world, map solids, character controller
  - Climb/stair pads become real step solids (`_buildStepSolids`)
  - Floor pads that would act as low ceilings over steps are clipped
  - Loaded via dynamic `import('@dimforge/rapier3d-compat')` (code-split chunk)

`Player.js` uses this when `USE_RAPIER_PLAYER` is true and `setPhysics()` ran.
Bots use the same Rapier character controllers when `USE_RAPIER_BOTS` is on (Phase 1d).
Shot/LOS still use the legacy AABB lists for now.
