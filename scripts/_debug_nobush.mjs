import * as THREE from 'three';
import { buildMap } from '../src/game/MapBuilder.js';
import { PhysicsManager } from '../src/physics/PhysicsManager.js';
import { PLAYER_HEIGHT } from '../src/game/constants.js';

await PhysicsManager.initRapier();
const scene = new THREE.Scene();
const data = buildMap(scene);
// Remove the bush collider at (-28, 0) that sits in the west garage climb column.
data.colliders = data.colliders.filter((c) => {
  if (c.kind || c.house) return true;
  const b = c.box;
  const cx = (b.min.x + b.max.x) / 2;
  const cz = (b.min.z + b.max.z) / 2;
  if (Math.abs(cx - -28) < 0.1 && Math.abs(cz - 0) < 0.1) {
    console.log('removing bush collider at', cx, cz);
    return false;
  }
  return true;
});

const phys = new PhysicsManager();
phys.setMapFromMapData(data);

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
  const r = phys.moveCharacter(handle, { wishVelX: wishX, wishVelZ: wishZ, jumpPressed: false, dt: 1 / 60 });
  phys.step(1 / 60);
  if (r && r.y - PLAYER_HEIGHT >= 2.85 && r.x > -26.2) boardedRoof = true;
}
console.log('maxFeet', maxFeet, 'boardedRoof', boardedRoof);
