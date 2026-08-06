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
  position: { x: -24.2, y: PLAYER_HEIGHT + 2.93 + 0.08, z: 0.85 },
});

const RAPIER_ = phys.RAPIER;
function findMeta(colliderHandle) {
  for (const e of phys.staticEntries) {
    if (e.collider.handle === colliderHandle) return { kind: e.meta?.kind, house: e.meta?.house, cid: e.colliderId };
  }
  return null;
}

let maxFeet = 0;
for (let i = 0; i < 520; i++) {
  const before = handle.body.translation();
  const r = phys.moveCharacter(handle, { wishVelX: 0, wishVelZ: -5.5, jumpPressed: false, dt: 1 / 60 });
  phys.step(1 / 60);
  const feet = r.y - PLAYER_HEIGHT;
  maxFeet = Math.max(maxFeet, feet);
  if (feet > 4.9 && feet < 5.3) {
    const capsuleHalfHeight = Math.max(0.02, (PLAYER_HEIGHT - 2 * PLAYER_RADIUS) / 2);
    const shape = new RAPIER_.Capsule(capsuleHalfHeight, PLAYER_RADIUS);
    const hit = phys.world.castShape(
      before, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: 0, z: -1 }, shape,
      0, 0.5, true, undefined, undefined, undefined, handle.collider
    );
    const meta = hit ? findMeta(hit.collider.handle) : null;
    console.log(i, 'feet', feet.toFixed(3), 'z', r.z.toFixed(3), 'grounded', r.grounded, 'CAST', JSON.stringify(meta), hit?.time_of_impact?.toFixed(4));
  } else if (i % 20 === 0) {
    console.log(i, 'feet', feet.toFixed(3), 'z', r.z.toFixed(3), 'grounded', r.grounded);
  }
}
console.log('maxFeet', maxFeet);
