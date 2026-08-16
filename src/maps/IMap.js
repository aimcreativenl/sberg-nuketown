/**
 * Map pack contract — Game.js loads maps through `src/maps/index.js`.
 */

/**
 * Slow-zone AABB. Horizontal wish/velocity is scaled by `speedMul` while feet Y
 * is inside [yMin, yMax] and XZ is inside the box.
 * @typedef {Object} SlowZone
 * @property {number} minX
 * @property {number} maxX
 * @property {number} minZ
 * @property {number} maxZ
 * @property {number} [yMin]
 * @property {number} [yMax]
 * @property {number} speedMul
 */

/**
 * Battle Royale circle authored per map. Omit to use MODE_PUBG / pubg.js defaults.
 * @typedef {Object} BrZone
 * @property {number} [centerX]
 * @property {number} [centerZ]
 * @property {Array<{ t: number, r: number }>} stages
 * @property {number} [dps]
 */

/**
 * @typedef {Object} MapFog
 * @property {number} [color]
 * @property {number} [near]
 * @property {number} [far]
 */

/**
 * @typedef {Object} MapData
 * @property {string} [id] - Stable pack id, e.g. 'nuketown' | 'candy-foundry'.
 * @property {import('three').Group} group - Root Object3D added to the scene.
 * @property {Array<object>} colliders - AABB colliders (walls/floors/doors/furniture).
 * @property {Array<object>} floors - Floor height regions used by movement.js.
 * @property {Array<object>} doors - Interactive door records (see Doors.js).
 * @property {Array<object>} [roofMantleZones] - Zones eligible for double-jump roof mantle.
 * @property {Array<import('three').Vector3>} spawnPoints - Player/bot spawn candidates.
 * @property {Array<object>} [coverPoints] - Bot AI cover positions.
 * @property {Array<object>} [waypoints] - Bot AI navigation waypoints.
 * @property {number} [bounds] - Player XZ clamp (Nuketown = 38).
 * @property {number} [wall] - Perimeter wall half-extent (Nuketown MAP_WALL = 40).
 * @property {MapFog} [fog] - Scene fog override; omit to keep GFX fog.
 * @property {boolean} [snow] - Falling snow VFX. Default true (Nuketown). Indoor maps set false.
 * @property {SlowZone[]} [slowZones] - Optional syrup / water speed volumes.
 * @property {Array<{minX:number,maxX:number,minZ:number,maxZ:number,yMin?:number,yMax?:number,dirX?:number,dirZ?:number,speed:number}>} [belts] - Occupancy-ride conveyors.
 * @property {Array<{x:number,y:number,z:number}|import('three').Vector3>} [medkitSpots]
 * @property {BrZone} [brZone] - BR radii; omit to use pubg.js BR_ZONE.
 * @property {{ alpha: {x:number,y:number,z:number}, bravo: {x:number,y:number,z:number} }} [flagHomes]
 * @property {(dt: number) => void} [tick] - Optional per-frame map FX (syrup flow).
 * @property {() => void} [dispose] - Drop GPU resources when swapping maps.
 */

/**
 * @typedef {Object} IMap
 * @property {string} id - Stable identifier, e.g. 'nuketown'.
 * @property {string} name - Display name.
 * @property {(scene: import('three').Scene) => MapData} build - Builds the map into `scene`, returns MapData.
 */

export {};
