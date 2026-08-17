/**
 * Jumping under L2 must clamp the head on the shipped Rapier player path.
 */
import * as THREE from 'three';
import { buildMap, HOUSE_X } from '../src/game/MapBuilder.js';
import { Player } from '../src/game/Player.js';
import { PhysicsManager } from '../src/physics/PhysicsManager.js';
import { PLAYER_HEIGHT, PLAYER_JUMP } from '../src/game/constants.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

await PhysicsManager.initRapier();
const scene = new THREE.Scene();
const data = buildMap(scene);
const physics = new PhysicsManager();
physics.setMapFromMapData(data);

const slabs = (data.colliders || []).filter((c) => {
  if (c.kind !== 'house_floor' || c.house !== 'west') return false;
  const box = c.box;
  if (!box) return false;
  return box.min.x < -14.5 && box.max.x > -14.5 && box.min.z < 1.5 && box.max.z > 1.5;
});
assert(slabs.length >= 1, 'west L2 living slab exists');
const slabUnder = Math.min(...slabs.map((c) => c.box.min.y));

const cam = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
const player = new Player(cam, data);
player.setPhysics(physics);
assert(!!player._rapier, 'Rapier player path is live');

physics.teleport(player._rapier, -14.5, PLAYER_HEIGHT + 0.25, 1.5);
player.position.set(-14.5, PLAYER_HEIGHT + 0.25, 1.5);
player.velocity.set(0, 0, 0);
player.grounded = true;
player.keys.clear();
for (let i = 0; i < 12; i++) {
  player.update(1 / 60, data.colliders, data.floors, []);
  physics.step(1 / 60);
}

player.keys.add('Space');
player.update(1 / 60, data.colliders, data.floors, []);
physics.step(1 / 60);
player.keys.delete('Space');

let maxEye = player.position.y;
for (let i = 0; i < 90; i++) {
  player.update(1 / 60, data.colliders, data.floors, []);
  physics.step(1 / 60);
  maxEye = Math.max(maxEye, player.position.y);
  if (player.grounded && i > 10) break;
}

assert(PLAYER_JUMP > 5, 'jump strength sanity');
assert(maxEye < slabUnder, `Rapier jump max eye ${maxEye.toFixed(3)} < slab underside ${slabUnder.toFixed(3)}`);

// Furniture must not be treated as a ceiling (that buried the capsule and flung the player).
const sofa = (data.colliders || []).find((c) => c.part === 'furn_sofa_west' || c.kind === 'house_furniture');
assert(sofa, 'west sofa / furniture collider');
const sofaX = (sofa.box.min.x + sofa.box.max.x) / 2;
const sofaZ = (sofa.box.min.z + sofa.box.max.z) / 2;
const beside = { x: sofaX, y: PLAYER_HEIGHT, z: sofaZ };
const beforeY = beside.y;
const { clampEyeUnderCeiling } = await import('../src/game/collision.js');
const yanked = clampEyeUnderCeiling(beside, PLAYER_HEIGHT, 0.38, data.colliders);
assert(!yanked, 'furniture does not clamp eye');
assert(Math.abs(beside.y - beforeY) < 1e-6, `eye stays ${beforeY}, not yanked to ${beside.y}`);

physics.teleport(player._rapier, sofaX, PLAYER_HEIGHT + 0.2, sofaZ);
player.position.set(sofaX, PLAYER_HEIGHT + 0.2, sofaZ);
player.velocity.set(0, 0, 0);
player.grounded = true;
player.keys.clear();
let minWalkY = Infinity;
let maxWalkY = -Infinity;
for (let i = 0; i < 45; i++) {
  player.update(1 / 60, data.colliders, data.floors, []);
  physics.step(1 / 60);
  minWalkY = Math.min(minWalkY, player.position.y);
  maxWalkY = Math.max(maxWalkY, player.position.y);
}
assert(minWalkY > 1.2, `walk beside sofa stays on L1 (minEye=${minWalkY.toFixed(3)})`);
assert(maxWalkY < 2.6, `walk beside sofa does not pop to L2 (maxEye=${maxWalkY.toFixed(3)})`);

const report = {
  ok: failures.length === 0,
  maxEye,
  slabUnder,
  HOUSE_X,
  sofaWalk: { minWalkY, maxWalkY },
  failures,
};
console.log(JSON.stringify(report, null, 2));
physics.dispose();
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: Rapier ceiling blocks jump head clip');
