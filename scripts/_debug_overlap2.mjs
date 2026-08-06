import * as THREE from 'three';
import { buildMap } from '../src/game/MapBuilder.js';
import { PhysicsManager } from '../src/physics/PhysicsManager.js';

await PhysicsManager.initRapier();
const scene = new THREE.Scene();
const data = buildMap(scene);
const phys = new PhysicsManager();
phys.setMapFromMapData(data);

const px = -27.5;
const zLo = -2.0, zHi = 1.5;
const yLo = 0.4, yHi = 1.6;
console.log('--- stair_tread x check ---');
for (const c of data.colliders) {
  if (c.kind === 'stair_tread' && c.house === 'west') {
    console.log('stair_tread x', c.box.min.x.toFixed(2), c.box.max.x.toFixed(2));
  }
}

for (const entry of phys.staticEntries) {
  const t = entry.rigidBody.translation();
  const shape = entry.collider.shape;
  const he = shape.halfExtents || { x: 0, y: 0, z: 0 };
  const minX = t.x - he.x, maxX = t.x + he.x;
  const minY = t.y - he.y, maxY = t.y + he.y;
  const minZ = t.z - he.z, maxZ = t.z + he.z;
  const overlapX = px + 0.9 > minX && px - 0.9 < maxX;
  const overlapZ = zHi > minZ && zLo < maxZ;
  const overlapY = yHi > minY && yLo < maxY;
  if (overlapX && overlapZ && overlapY) {
    console.log(
      entry.meta?.kind, entry.meta?.house || '', entry.colliderId,
      'x', minX.toFixed(2), maxX.toFixed(2),
      'y', minY.toFixed(2), maxY.toFixed(2),
      'z', minZ.toFixed(2), maxZ.toFixed(2)
    );
  }
}
