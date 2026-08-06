import * as THREE from 'three';
import { buildMap } from '../src/game/MapBuilder.js';
import { PhysicsManager } from '../src/physics/PhysicsManager.js';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from '../src/game/constants.js';

await PhysicsManager.initRapier();
const scene = new THREE.Scene();
const data = buildMap(scene);
const phys = new PhysicsManager();
phys.setMapFromMapData(data);

function findMeta(colliderHandle) {
  for (const e of phys.staticEntries) {
    if (e.collider.handle === colliderHandle) return { kind: e.meta?.kind, house: e.meta?.house, cid: e.colliderId };
  }
  return null;
}

const RAPIER_ = phys.RAPIER;
const capsuleHalfHeight = Math.max(0.02, (PLAYER_HEIGHT - 2 * PLAYER_RADIUS) / 2);
const shape = new RAPIER_.Capsule(capsuleHalfHeight, PLAYER_RADIUS);

// At the stuck position (from earlier trace): x=-24.2, feet~5.12, z~-1.2
const feet = 4.85; // standing on idx38 (roof_climb pad3, topY 4.85)
const centerY = feet + PLAYER_HEIGHT / 2;
const pos = { x: -24.2, y: centerY, z: -1.2 };

const hitUp = phys.world.castShape(
  pos, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: 1, z: 0 }, shape,
  0, 1.5, true
);
console.log('cast UP from feet=4.85 z=-1.2:', hitUp ? { meta: findMeta(hitUp.collider.handle), toi: hitUp.time_of_impact } : 'no hit within 1.5');

// Dump ALL colliders (any kind) whose Y range is between 4.8 and 7.0, X within 2 of -24.2, Z within 2 of -1.2
console.log('--- nearby colliders 4.8 < y < 7.0 ---');
for (const entry of phys.staticEntries) {
  const t = entry.rigidBody.translation();
  const he = entry.collider.shape.halfExtents;
  if (!he) continue;
  const minX = t.x - he.x, maxX = t.x + he.x;
  const minY = t.y - he.y, maxY = t.y + he.y;
  const minZ = t.z - he.z, maxZ = t.z + he.z;
  if (maxX < -26.2 || minX > -22.2) continue;
  if (maxZ < -3.2 || minZ > 0.8) continue;
  if (maxY < 4.8 || minY > 7.0) continue;
  console.log(entry.meta?.kind, entry.meta?.house, entry.colliderId, 'x', minX.toFixed(2), maxX.toFixed(2), 'y', minY.toFixed(2), maxY.toFixed(2), 'z', minZ.toFixed(2), maxZ.toFixed(2));
}
