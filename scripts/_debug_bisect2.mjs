import * as THREE from 'three';
import { buildMap } from '../src/game/MapBuilder.js';
import { PhysicsManager } from '../src/physics/PhysicsManager.js';
import { PLAYER_HEIGHT } from '../src/game/constants.js';

await PhysicsManager.initRapier();
const scene = new THREE.Scene();
const data = buildMap(scene);

async function run(label, colliders, floors, opts = {}) {
  const phys = new PhysicsManager();
  if (opts.noLandings) {
    const orig = phys._extendStepsToLandings.bind(phys);
    phys._extendStepsToLandings = () => {};
  }
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

await run('D-noLandings: full map w/o _extendStepsToLandings', data.colliders, data.floors, { noLandings: true });

// Also: full colliders but ONLY west climb floors filtered to a slim x-band (to see if other-house floors matter)
const westClimb = data.colliders.filter((c) => c.kind === 'climb_pad' && c.house === 'west');
const roofClimbW = data.colliders.filter((c) => c.kind === 'roof_climb' && c.house === 'west');
await run('E: westClimb+roofClimbW colliders + ALL floors', [...westClimb, ...roofClimbW], data.floors);
await run('F: ALL colliders (no floors) ', data.colliders, []);
