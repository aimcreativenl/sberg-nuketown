import * as THREE from 'three';
import { buildMap } from '../src/game/MapBuilder.js';
import { PhysicsManager } from '../src/physics/PhysicsManager.js';
import { PLAYER_HEIGHT } from '../src/game/constants.js';

await PhysicsManager.initRapier();
const scene = new THREE.Scene();
const data = buildMap(scene);

async function run(label, colliders, floors) {
  const phys = new PhysicsManager();
  phys.setMapFromMapData({ colliders, floors });
  const handle = phys.createPlayerController({
    position: { x: -27.5, y: PLAYER_HEIGHT + 0.05, z: -2.8 },
  });
  let maxFeet = 0;
  for (let i = 0; i < 300; i++) {
    const r = phys.moveCharacter(handle, { wishVelX: 0, wishVelZ: 6, jumpPressed: false, dt: 1 / 60 });
    phys.step(1 / 60);
    maxFeet = Math.max(maxFeet, r.y - PLAYER_HEIGHT);
  }
  console.log(label, 'maxFeet', maxFeet.toFixed(3));
  phys.dispose();
}

const westClimb = data.colliders.filter((c) => c.kind === 'climb_pad' && c.house === 'west');
const flatFloor = [{ minX: -60, maxX: 60, minZ: -60, maxZ: 60, y: 0 }];

await run('A: westClimb only + flatFloor', westClimb, flatFloor);
await run('B: ALL colliders + flatFloor', data.colliders, flatFloor);
await run('C: westClimb only + ALL real floors', westClimb, data.floors);
await run('D: ALL colliders + ALL real floors (full map)', data.colliders, data.floors);
