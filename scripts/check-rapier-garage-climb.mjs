/**
 * Rapier must walk the west garage climb pads onto the roof (the bug that
 * stuck the capsule when climb_pad solids were also in the Rapier world).
 */
import * as THREE from 'three';
import { buildMap } from '../src/game/MapBuilder.js';
import { PhysicsManager } from '../src/physics/PhysicsManager.js';
import { PLAYER_HEIGHT } from '../src/game/constants.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

await PhysicsManager.initRapier();
const scene = new THREE.Scene();
const data = buildMap(scene);
const phys = new PhysicsManager();
phys.setMapFromMapData(data);

// Start clear of the first pad
const handle = phys.createPlayerController({
  position: { x: -27.5, y: PLAYER_HEIGHT + 0.05, z: -2.8 },
});

let maxFeet = 0;
let boardedRoof = false;
for (let i = 0; i < 480; i++) {
  const tr = phys.getTranslation(handle);
  const feet = tr.y - PLAYER_HEIGHT;
  maxFeet = Math.max(maxFeet, feet);
  let wishX = 0;
  let wishZ = 6;
  if (feet > 2.7) {
    wishX = 6;
    wishZ = 0.8;
  }
  const r = phys.moveCharacter(handle, {
    wishVelX: wishX,
    wishVelZ: wishZ,
    jumpPressed: false,
    dt: 1 / 60,
  });
  phys.step(1 / 60);
  if (r && r.y - PLAYER_HEIGHT >= 2.85 && r.x > -26.2) boardedRoof = true;
}

assert(maxFeet >= 2.8, `garage climb maxFeet ${maxFeet.toFixed(2)} reaches roof (~2.93)`);
assert(boardedRoof, 'walked onto garage roof deck (x > -26.2 at feet ≥ 2.85)');

const report = { ok: failures.length === 0, maxFeet, boardedRoof, failures };
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: Rapier garage climb + roof board');
