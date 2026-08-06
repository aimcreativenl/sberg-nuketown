/**
 * Phase 0 scaffolding — NOT wired into the game yet.
 *
 * This file documents the physics contract we intend to implement in Phase 1
 * (Rapier-backed). It defines the shared shapes (`PhysicsInput`, `PhysicsPose`,
 * `RayHit`) and the API surface (`PHYSICS_API`) that future physics backends —
 * starting with a Rapier world, but also the current legacy AABB code — should
 * expose so `Game.js` / `Player.js` can eventually swap backends without
 * rewriting gameplay code.
 *
 * Do NOT use this to replace `Player.js` movement yet. See `ROADMAP.md` Phase 1.
 */

/**
 * Per-frame movement intent fed into the physics step.
 * @typedef {Object} PhysicsInput
 * @property {number} moveX - Wish direction on the local X axis, -1..1.
 * @property {number} moveZ - Wish direction on the local Z axis, -1..1.
 * @property {boolean} jump - Jump was requested this frame.
 * @property {boolean} sprint - Sprint modifier held.
 * @property {number} dt - Frame delta time in seconds.
 */

/**
 * Resolved player pose after a physics step.
 * @typedef {Object} PhysicsPose
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {number} yaw - Radians, look yaw.
 * @property {number} pitch - Radians, look pitch.
 * @property {boolean} grounded - Whether the player is currently standing on a surface.
 */

/**
 * Result of a raycast query against the physics world (used for shooting/LOS).
 * @typedef {Object} RayHit
 * @property {boolean} hit
 * @property {{x:number,y:number,z:number}|null} point - World-space hit point, or null if no hit.
 * @property {{x:number,y:number,z:number}|null} normal - Surface normal at the hit point.
 * @property {number} distance - Distance from ray origin to hit (Infinity if no hit).
 * @property {string|number|null} colliderId - Identifier of the collider that was hit, if any.
 */

/**
 * Documented API surface every physics backend (legacy or Rapier) should provide.
 * This is a description object today, not a running implementation — Phase 1 will
 * implement each method for real (see ROADMAP.md 1a-1d).
 *
 * - init(scene, mapData): Promise<void> | void
 *     Prepare the physics world for a given Three.js scene + map data.
 * - step(dt): void
 *     Advance the physics simulation by `dt` seconds.
 * - setMapColliders(colliders): void
 *     Register/replace static map colliders (walls, floors, doors) with the backend.
 * - movePlayer(input: PhysicsInput): PhysicsPose
 *     Apply player movement input for this frame and return the resolved pose.
 * - raycast(origin, direction, maxDistance): RayHit
 *     Cast a ray through the physics world (used for hitscan + line-of-sight).
 * - setColliderSolid(colliderId, solid: boolean): void
 *     Toggle a collider's solidity at runtime (e.g. opening/closing a door).
 *
 * Phase 1a–1d status: `src/physics/PhysicsManager.js` implements the Rapier
 * static world + kinematic capsules. `Player.js` (`USE_RAPIER_PLAYER`) and
 * `BotAI.js` (`USE_RAPIER_BOTS`) both drive `moveCharacter`. Shot/LOS
 * (`collision.js#rayBlockedBySolids`) still uses the legacy AABB path.
 */
export const PHYSICS_API = {
  version: 1,
  backend: 'legacy',
};

/**
 * Re-exported for convenience so callers can do
 * `import { PhysicsManager } from '../physics/IPhysicsWorld.js'` if preferred —
 * the canonical implementation lives in `./PhysicsManager.js`.
 */
export { PhysicsManager } from './PhysicsManager.js';

/**
 * Stub bridge around the current legacy AABB physics (`movement.js` / `collision.js` /
 * `Player.js`). Intentionally empty in Phase 0 — exists so future code can start
 * depending on a stable class shape before Phase 1 fills in real Rapier-backed logic.
 *
 * @implements {PHYSICS_API}
 */
export class LegacyPhysicsBridge {
  constructor() {
    this.backend = 'legacy';
  }

  /** @param {import('three').Scene} _scene @param {object} _mapData */
  init(_scene, _mapData) {
    // Phase 1: wrap movement.js/collision.js behind this contract (no behavior change).
  }

  /** @param {number} _dt */
  step(_dt) {
    // Phase 1: no-op for legacy — Player.js still runs its own update() loop directly.
  }

  /** @param {Array<object>} _colliders */
  setMapColliders(_colliders) {
    // Phase 1: delegate to existing mapData.colliders array.
  }

  /**
   * @param {PhysicsInput} _input
   * @returns {PhysicsPose|null}
   */
  movePlayer(_input) {
    return null;
  }

  /**
   * @param {{x:number,y:number,z:number}} _origin
   * @param {{x:number,y:number,z:number}} _direction
   * @param {number} _maxDistance
   * @returns {RayHit}
   */
  raycast(_origin, _direction, _maxDistance) {
    return { hit: false, point: null, normal: null, distance: Infinity, colliderId: null };
  }

  /** @param {string|number} _colliderId @param {boolean} _solid */
  setColliderSolid(_colliderId, _solid) {
    // Phase 1: delegate to collider.solid flag (already used by Doors.js today).
  }
}
