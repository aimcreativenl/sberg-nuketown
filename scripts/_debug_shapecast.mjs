import * as THREE from 'three';
import { buildMap } from '../src/game/MapBuilder.js';
import { PhysicsManager } from '../src/physics/PhysicsManager.js';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from '../src/game/constants.js';

await PhysicsManager.initRapier();
const scene = new THREE.Scene();
const data = buildMap(scene);
const phys = new PhysicsManager();
phys.setMapFromMapData(data);

const handle = phys.createPlayerController({
  position: { x: -27.5, y: PLAYER_HEIGHT + 0.05, z: -2.8 },
});

for (let i = 0; i < 40; i++) {
  const r = phys.moveCharacter(handle, { wishVelX: 0, wishVelZ: 6, jumpPressed: false, dt: 1 / 60 });
  phys.step(1 / 60);
}

// Now at (roughly) the stuck frame; do an exact shape intersection query.
const RAPIER_ = phys.RAPIER;
const capsuleHalfHeight = Math.max(0.02, (PLAYER_HEIGHT - 2 * PLAYER_RADIUS) / 2);
const shape = new RAPIER_.Capsule(capsuleHalfHeight, PLAYER_RADIUS);
const t = handle.body.translation();
console.log('capsule center', t);

phys.world.intersectionsWithShape(t, { x: 0, y: 0, z: 0, w: 1 }, shape, (collider) => {
  if (collider.handle === handle.collider.handle) return true;
  const rb = collider.parent();
  const tt = rb.translation();
  const he = collider.shape.halfExtents;
  let meta = null;
  let cid = null;
  for (const e of phys.staticEntries) {
    if (e.collider.handle === collider.handle) { meta = e.meta; cid = e.colliderId; break; }
  }
  console.log('HIT', meta?.kind, meta?.house, cid, 'center', tt, 'halfExtents', he);
  return true;
});
