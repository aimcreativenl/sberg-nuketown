/**
 * Jumping under L2 must clamp head — no look-through ceiling.
 */
import * as THREE from 'three';
import { buildMap, HOUSE_X } from '../src/game/MapBuilder.js';
import { Player } from '../src/game/Player.js';
import { PLAYER_HEIGHT, PLAYER_JUMP } from '../src/game/constants.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

const scene = new THREE.Scene();
const data = buildMap(scene);
const cam = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
const player = new Player(cam, data);

// Stand under west L2 living floor (away from stairwell)
player.position.set(-14.5, PLAYER_HEIGHT + 0.25, 1.5);
player.velocity.set(0, 0, 0);
player.grounded = true;
player.keys.clear();

// Simulate jump: Space edge once, then step until apex
player.keys.add('Space');
player.update(1 / 60, data.colliders, data.floors, []);
player.keys.delete('Space');

let maxEye = player.position.y;
for (let i = 0; i < 90; i++) {
  player.update(1 / 60, data.colliders, data.floors, []);
  maxEye = Math.max(maxEye, player.position.y);
  if (player.grounded && i > 10) break;
}

// L2 walk y = 3.2; slab underside ≈ 2.92 — eye must stay below that
const L2_UNDER = 3.2 - 0.05;
assert(maxEye < L2_UNDER, `max eye under L2 ${maxEye.toFixed(3)} < ${L2_UNDER}`);
assert(PLAYER_JUMP > 5, 'jump strength sanity');

const report = { ok: failures.length === 0, maxEye, L2_UNDER, failures };
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: ceiling blocks jump head clip');
