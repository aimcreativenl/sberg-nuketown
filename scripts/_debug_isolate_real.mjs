import * as THREE from 'three';
import { buildMap } from '../src/game/MapBuilder.js';
import { PhysicsManager } from '../src/physics/PhysicsManager.js';
import { PLAYER_HEIGHT } from '../src/game/constants.js';

await PhysicsManager.initRapier();
const scene = new THREE.Scene();
const data = buildMap(scene);

// Keep ONLY west climb_pad colliders + a big ground floor.
const filtered = {
  colliders: data.colliders.filter((c) => c.kind === 'climb_pad' && c.house === 'west'),
  floors: [{ minX: -60, maxX: 60, minZ: -60, maxZ: 60, y: 0 }],
};

const phys = new PhysicsManager();
phys.setMapFromMapData(filtered);

const handle = phys.createPlayerController({
  position: { x: -27.5, y: PLAYER_HEIGHT + 0.05, z: -2.8 },
});

let maxFeet = 0;
for (let i = 0; i < 300; i++) {
  const r = phys.moveCharacter(handle, { wishVelX: 0, wishVelZ: 6, jumpPressed: false, dt: 1 / 60 });
  phys.step(1 / 60);
  const feet = r.y - PLAYER_HEIGHT;
  maxFeet = Math.max(maxFeet, feet);
  if (i % 5 === 0) console.log(i, 'feet', feet.toFixed(3), 'z', r.z.toFixed(3), 'grounded', r.grounded);
}
console.log('maxFeet', maxFeet);
