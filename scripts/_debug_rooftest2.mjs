import * as THREE from 'three';
import { buildMap } from '../src/game/MapBuilder.js';
import { PhysicsManager } from '../src/physics/PhysicsManager.js';
import { PLAYER_HEIGHT } from '../src/game/constants.js';

await PhysicsManager.initRapier();
const scene = new THREE.Scene();
const data = buildMap(scene);
const phys = new PhysicsManager();
phys.setMapFromMapData(data);

for (const entry of [...phys.staticEntries]) {
  if (entry.colliderId === 'landing_39') {
    entry.collider.setEnabled(false);
    console.log('disabled landing_39');
  }
}

const handle = phys.createPlayerController({
  position: { x: -24.2, y: PLAYER_HEIGHT + 2.93 + 0.08, z: 0.85 },
});
let maxFeet = 0;
for (let i = 0; i < 520; i++) {
  const r = phys.moveCharacter(handle, { wishVelX: 0, wishVelZ: -5.5, jumpPressed: false, dt: 1 / 60 });
  phys.step(1 / 60);
  const feet = r.y - PLAYER_HEIGHT;
  maxFeet = Math.max(maxFeet, feet);
  if (i % 10 === 0) console.log(i, 'feet', feet.toFixed(3), 'z', r.z.toFixed(3), 'grounded', r.grounded);
}
console.log('maxFeet', maxFeet);
