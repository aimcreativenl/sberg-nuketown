/**
 * Shots/LOS must be blocked by house walls + L2 floors; window openings stay open.
 */
import * as THREE from 'three';
import { buildMap, HOUSE_X } from '../src/game/MapBuilder.js';
import { rayBlockedBySolids } from '../src/game/collision.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

const scene = new THREE.Scene();
const data = buildMap(scene);
const C = data.colliders;
const floors = C.filter((c) => c.kind === 'house_floor');
assert(floors.length >= 8, `house_floor shot slabs >= 8 got ${floors.length}`);

const opts = { minHeight: 0.5, tMin: 0.08, tEndPad: 0.08 };

// Solid front wall (not door center)
assert(
  rayBlockedBySolids(new THREE.Vector3(-20, 1.5, -8), new THREE.Vector3(-20, 1.5, -2), C, opts),
  'west front wall blocks'
);
assert(
  rayBlockedBySolids(new THREE.Vector3(-15, 1.5, -8), new THREE.Vector3(-15, 1.5, -2), C, opts),
  'west front wall R blocks'
);
assert(
  rayBlockedBySolids(new THREE.Vector3(-24, 1.5, 0), new THREE.Vector3(-15, 1.5, 0), C, opts),
  'west outer side blocks'
);
assert(
  rayBlockedBySolids(new THREE.Vector3(-17, 1.5, 8), new THREE.Vector3(-17, 1.5, 1), C, opts),
  'west back wall blocks'
);

// L2 floor vertical (away from stairwell hole at local x≈-3.35)
assert(
  rayBlockedBySolids(new THREE.Vector3(-14.5, 1.4, 1.5), new THREE.Vector3(-14.5, 4.4, 1.5), C, opts),
  'L2 floor blocks vertical'
);
assert(
  rayBlockedBySolids(new THREE.Vector3(20, 1.4, 1.5), new THREE.Vector3(20, 4.4, 1.5), C, opts),
  'east L2 floor blocks vertical'
);

// Closed front door blocks doorway
assert(
  rayBlockedBySolids(new THREE.Vector3(-HOUSE_X, 1.5, -8), new THREE.Vector3(-HOUSE_X, 1.5, -2), C, opts),
  'closed front door blocks'
);

// Open door → free
const door = C.find((c) => c.part === 'door_front_west');
assert(door, 'door_front_west collider');
door.solid = false;
assert(
  !rayBlockedBySolids(new THREE.Vector3(-HOUSE_X, 1.5, -8), new THREE.Vector3(-HOUSE_X, 1.5, -2), C, opts),
  'open front door free'
);
door.solid = true;

// L2 window opening stays free (mid band at window X)
const winEye = new THREE.Vector3(-17 - 2.7, 4.4, -3.4);
const winOut = new THREE.Vector3(-17 - 2.7, 4.4, -7);
assert(!rayBlockedBySolids(winEye, winOut, C, opts), 'L2 window opening free');

// Grazing / short-range through thick wall (old step sampler missed these)
assert(
  rayBlockedBySolids(new THREE.Vector3(-20, 1.5, -5.9), new THREE.Vector3(-20, 1.5, -4.1), C, opts),
  'short-range through front wall blocks'
);

const report = { ok: failures.length === 0, floorSlabs: floors.length, failures };
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: shot/LOS blocked by walls + floors; windows/open doors free');
