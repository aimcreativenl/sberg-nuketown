import * as THREE from 'three';
import { buildMap } from '../src/game/MapBuilder.js';
import { PhysicsManager } from '../src/physics/PhysicsManager.js';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from '../src/game/constants.js';

await PhysicsManager.initRapier();
const scene = new THREE.Scene();
const data = buildMap(scene);

const westClimb = data.colliders.filter((c) => c.kind === 'climb_pad' && c.house === 'west');
const roofClimbW = data.colliders.filter((c) => c.kind === 'roof_climb' && c.house === 'west');

const phys = new PhysicsManager();
phys.setMapFromMapData({ colliders: [...westClimb, ...roofClimbW], floors: data.floors });

const handle = phys.createPlayerController({
  position: { x: -27.5, y: PLAYER_HEIGHT + 0.05, z: -2.8 },
});

const RAPIER_ = phys.RAPIER;
function findMeta(colliderHandle) {
  for (const e of phys.staticEntries) {
    if (e.collider.handle === colliderHandle) return { kind: e.meta?.kind, house: e.meta?.house, cid: e.colliderId };
  }
  return null;
}

for (let i = 0; i < 40; i++) {
  const before = handle.body.translation();
  const r = phys.moveCharacter(handle, { wishVelX: 0, wishVelZ: 6, jumpPressed: false, dt: 1 / 60 });
  phys.step(1 / 60);
  const after = handle.body.translation();
  if (i >= 18 && i <= 32) {
    console.log(i, 'before', before.y.toFixed(3), before.z.toFixed(3), '-> after', after.y.toFixed(3), after.z.toFixed(3), 'grounded', r.grounded);
    const capsuleHalfHeight = Math.max(0.02, (PLAYER_HEIGHT - 2 * PLAYER_RADIUS) / 2);
    const shape = new RAPIER_.Capsule(capsuleHalfHeight, PLAYER_RADIUS);
    const hit = phys.world.castShape(
      before, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: 0, z: 1 }, shape,
      0, 0.5, true, undefined, undefined, undefined, handle.collider
    );
    if (hit) {
      const meta = findMeta(hit.collider.handle);
      console.log('   castShape hit', meta, 'toi', hit.time_of_impact?.toFixed?.(4) ?? hit.toi);
    } else {
      console.log('   castShape: no hit within 0.5');
    }
  }
}
