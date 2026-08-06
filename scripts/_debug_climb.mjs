import * as THREE from 'three';
import { buildMap } from '../src/game/MapBuilder.js';
import { PhysicsManager } from '../src/physics/PhysicsManager.js';
import { PLAYER_HEIGHT } from '../src/game/constants.js';

await PhysicsManager.initRapier();
const scene = new THREE.Scene();
const data = buildMap(scene);
const phys = new PhysicsManager();
phys.setMapFromMapData(data);

const handle = phys.createPlayerController({
  position: { x: -27.5, y: PLAYER_HEIGHT + 0.05, z: -2.8 },
});

let maxFeet = 0;
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
  if (i % 5 === 0 || (r && Math.abs(r.y - PLAYER_HEIGHT - feet) < 0.001 && i > 20)) {
    console.log(i, 'feet', (r.y - PLAYER_HEIGHT).toFixed(3), 'x', r.x.toFixed(3), 'z', r.z.toFixed(3), 'grounded', r.grounded);
  }
}
console.log('maxFeet', maxFeet);
