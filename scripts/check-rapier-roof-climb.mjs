/**
 * Rapier must climb garage-roof → main-roof pads (both houses).
 * These chains rise toward −Z; approach from the high-Z side of the first pad.
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

const MAIN_ROOF_Y = 5.88;

function climbRoofChain(label, house) {
  const pads = data.colliders.filter((c) => c.kind === 'roof_climb' && c.house === house);
  assert(pads.length > 0, `${label} roof_climb pads exist`);
  pads.sort((a, b) => b.box.max.z - a.box.max.z); // first tread = highest Z
  const first = pads[0];
  const startX = (first.box.min.x + first.box.max.x) / 2;
  const startZ = first.box.max.z + 0.45;

  const handle = phys.createPlayerController({
    position: { x: startX, y: PLAYER_HEIGHT + 2.93 + 0.08, z: startZ },
  });
  let maxFeet = 0;
  let boarded = false;
  for (let i = 0; i < 520; i++) {
    const r = phys.moveCharacter(handle, {
      wishVelX: 0,
      wishVelZ: -5.5,
      jumpPressed: false,
      dt: 1 / 60,
    });
    phys.step(1 / 60);
    const feet = r.y - PLAYER_HEIGHT;
    maxFeet = Math.max(maxFeet, feet);
    if (feet >= MAIN_ROOF_Y - 0.25) boarded = true;
  }
  assert(maxFeet >= 5.4, `${label} roof climb maxFeet=${maxFeet.toFixed(2)} (need ~5.4+)`);
  assert(boarded, `${label} boarded main roof (~${MAIN_ROOF_Y}), maxFeet=${maxFeet.toFixed(2)}`);
  return { maxFeet, boarded, startX, startZ };
}

const west = climbRoofChain('west', 'west');
const east = climbRoofChain('east', 'east');

const report = { ok: failures.length === 0, west, east, failures };
console.log(JSON.stringify(report, null, 2));
phys.dispose();
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: Rapier roof→main climb (west + east)');
