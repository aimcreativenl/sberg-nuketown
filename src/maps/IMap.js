/**
 * Phase 0 scaffolding — NOT wired into the game yet.
 *
 * Documents the shape a "map pack" should have so `Game.js` can eventually load
 * different maps through one contract instead of importing `MapBuilder.js`
 * directly. `maps/nuketown/index.js` wraps the existing map through this shape.
 */

/**
 * @typedef {Object} MapData
 * @property {import('three').Group} group - Root Object3D added to the scene.
 * @property {Array<object>} colliders - AABB colliders (walls/floors/doors/furniture).
 * @property {Array<object>} floors - Floor height regions used by movement.js.
 * @property {Array<object>} doors - Interactive door records (see Doors.js).
 * @property {Array<object>} [roofMantleZones] - Zones eligible for double-jump roof mantle.
 * @property {Array<import('three').Vector3>} spawnPoints - Player/bot spawn candidates.
 * @property {Array<object>} [coverPoints] - Bot AI cover positions.
 * @property {Array<object>} [waypoints] - Bot AI navigation waypoints.
 */

/**
 * @typedef {Object} IMap
 * @property {string} id - Stable identifier, e.g. 'nuketown'.
 * @property {string} name - Display name.
 * @property {(scene: import('three').Scene) => MapData} build - Builds the map into `scene`, returns MapData.
 */

export {};
