/**
 * Interior house stairs (stair_tread) must climb L1 → L2 under Rapier + Player.js.
 */
import * as THREE from 'three';
import { buildMap, HOUSE_X } from '../src/game/MapBuilder.js';
import { Player } from '../src/game/Player.js';
import { PhysicsManager } from '../src/physics/PhysicsManager.js';
import { PLAYER_HEIGHT } from '../src/game/constants.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

await PhysicsManager.initRapier();
const scene = new THREE.Scene();
const mapData = buildMap(scene);
const physics = new PhysicsManager();
physics.setMapFromMapData(mapData);

function climbInterior(label, houseCenterX) {
  const cam = new THREE.PerspectiveCamera();
  const player = new Player(cam, mapData);
  player.setPhysics(physics);
  // MapBuilder local stairX = -3.35 on both houses → world = houseCenterX - 3.35
  const x = houseCenterX - 3.35;
  physics.teleport(player._rapier, x, PLAYER_HEIGHT + 0.3, -4.1);
  player.position.set(x, PLAYER_HEIGHT + 0.3, -4.1);
  player.velocity.set(0, 0, 0);
  player.grounded = true;
  player.yaw = Math.PI; // +Z up the stairs
  player.keys.add('KeyW');

  let maxFeet = 0;
  let stuckFrames = 0;
  let maxStuck = 0;
  for (let i = 0; i < 320; i++) {
    const beforeZ = player.position.z;
    const beforeFeet = player.position.y - PLAYER_HEIGHT;
    player.update(1 / 60, mapData.colliders, mapData.floors, []);
    physics.step(1 / 60);
    const feet = player.position.y - PLAYER_HEIGHT;
    maxFeet = Math.max(maxFeet, feet);
    const moved = Math.abs(player.position.z - beforeZ);
    if (feet > 0.6 && feet < 2.9 && moved < 0.002 && Math.abs(feet - beforeFeet) < 0.002) {
      stuckFrames += 1;
      maxStuck = Math.max(maxStuck, stuckFrames);
    } else {
      stuckFrames = 0;
    }
  }
  player.keys.delete('KeyW');
  assert(maxFeet >= 2.9, `${label} interior stairs maxFeet=${maxFeet.toFixed(2)} (need L2 ~3.2)`);
  assert(maxStuck < 45, `${label} should not stick mid-stairs (longest stuck streak ${maxStuck} frames)`);
  return { maxFeet, maxStuck };
}

const west = climbInterior('west', -HOUSE_X);
const east = climbInterior('east', HOUSE_X);

const report = { ok: failures.length === 0, west, east, failures };
console.log(JSON.stringify(report, null, 2));
physics.dispose();
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: Rapier interior stairs (west + east)');
