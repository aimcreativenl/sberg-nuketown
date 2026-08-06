import * as THREE from 'three';
import { buildMap } from '../src/game/MapBuilder.js';
import { PhysicsManager } from '../src/physics/PhysicsManager.js';
import { PLAYER_HEIGHT } from '../src/game/constants.js';

await PhysicsManager.initRapier();
const scene = new THREE.Scene();
const data = buildMap(scene);

const westClimb = data.colliders.filter((c) => c.kind === 'climb_pad' && c.house === 'west');
const roofClimbW = data.colliders.filter((c) => c.kind === 'roof_climb' && c.house === 'west');

const phys = new PhysicsManager();
phys.setMapFromMapData({ colliders: [...westClimb, ...roofClimbW], floors: data.floors });

for (const entry of phys.staticEntries) {
  if (entry.meta?.kind !== 'floor_pad') continue;
  const t = entry.rigidBody.translation();
  const he = entry.collider.shape.halfExtents;
  const minX = t.x - he.x, maxX = t.x + he.x;
  const minY = t.y - he.y, maxY = t.y + he.y;
  const minZ = t.z - he.z, maxZ = t.z + he.z;
  // Only print pads near the west climb column
  if (maxX > -29 && minX < -22 && maxY > 0.3 && minY < 3.0) {
    console.log(
      entry.colliderId,
      'x', minX.toFixed(2), maxX.toFixed(2),
      'y', minY.toFixed(2), maxY.toFixed(2),
      'z', minZ.toFixed(2), maxZ.toFixed(2)
    );
  }
}
