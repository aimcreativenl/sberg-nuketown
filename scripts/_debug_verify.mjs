import * as THREE from 'three';
import { buildMap } from '../src/game/MapBuilder.js';
import { PhysicsManager } from '../src/physics/PhysicsManager.js';
import { PLAYER_HEIGHT } from '../src/game/constants.js';

await PhysicsManager.initRapier();
const scene = new THREE.Scene();
const data = buildMap(scene);

const westClimb = data.colliders.filter((c) => c.kind === 'climb_pad' && c.house === 'west');
const roofClimbW = data.colliders.filter((c) => c.kind === 'roof_climb' && c.house === 'west');

async function run(label, colliders, floors) {
  const phys = new PhysicsManager();
  phys.setMapFromMapData({ colliders, floors });
  // Remove ONLY floor_24_26 (the misclipped climb-corridor piece) to isolate its effect.
  for (const entry of [...phys.staticEntries]) {
    if (entry.colliderId === 'floor_24_26') {
      entry.collider.setEnabled(false);
      console.log('disabled', entry.colliderId);
    }
  }
  const handle = phys.createPlayerController({ position: { x: -27.5, y: PLAYER_HEIGHT + 0.05, z: -2.8 } });
  let maxFeet = 0;
  for (let i = 0; i < 300; i++) {
    const r = phys.moveCharacter(handle, { wishVelX: 0, wishVelZ: 6, jumpPressed: false, dt: 1 / 60 });
    phys.step(1 / 60);
    maxFeet = Math.max(maxFeet, r.y - PLAYER_HEIGHT);
  }
  console.log(label, 'maxFeet', maxFeet.toFixed(3));
  phys.dispose();
}

await run('E-noHighFloors', [...westClimb, ...roofClimbW], data.floors);
