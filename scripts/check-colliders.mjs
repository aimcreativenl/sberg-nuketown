/**
 * Assert solid props (fences, barriers, crates, vehicles) actually block XZ movement.
 * Uses real buildMap colliders + Player-style radius / height filters.
 */
import * as THREE from 'three';
import { buildMap } from '../src/game/MapBuilder.js';
import { PLAYER_RADIUS, PLAYER_HEIGHT } from '../src/game/constants.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

/** Same filter as Player._resolveAxis: skip thin floor-like colliders. */
function solidColliders(colliders) {
  return colliders.filter((c) => {
    const box = c.box || c;
    if (!box?.min) return false;
    return box.max.y - box.min.y >= 0.35;
  });
}

function blockedAt(x, z, colliders, y = PLAYER_HEIGHT) {
  const r = PLAYER_RADIUS;
  const bodyMinY = y - PLAYER_HEIGHT + 0.15;
  const bodyMaxY = y - 0.1;
  for (const c of colliders) {
    const box = c.box || c;
    if (bodyMaxY < box.min.y || bodyMinY > box.max.y) continue;
    if (x + r > box.min.x && x - r < box.max.x && z + r > box.min.z && z - r < box.max.z) {
      return true;
    }
  }
  return false;
}

const scene = new THREE.Scene();
const data = buildMap(scene);
const solids = solidColliders(data.colliders);

assert(solids.length > 50, `enough solid colliders got ${solids.length}`);

// Known fence segment midpoints (from MapBuilder picketFence calls)
const fenceMids = [
  [-19, -26], // -28,-26 to -10,-26
  [19, -26],
  [-19, 26],
  [19, 26],
  [-32, 0], // -32,-14 to -32,14
  [32, 0],
  [-28, -20], // -28,-26 to -28,-14
  [28, -20],
  [-19, -10], // -26,-10 to -12,-10
  [19, 10],
  [-24, -17],
  [24, 17],
  [-28, -30],
  [28, 30],
];

let fenceHits = 0;
for (const [x, z] of fenceMids) {
  if (blockedAt(x, z, solids)) fenceHits++;
  else failures.push(`fence mid (${x},${z}) not blocked`);
}
assert(fenceHits === fenceMids.length, `all fence mids blocked ${fenceHits}/${fenceMids.length}`);

// Barriers / crates / vehicles
const propSamples = [
  [-2.75, -1.2], // mid barrier
  [0, 1.6],
  [-6.5, -4], // crate cluster
  [-3.6, -10], // bus
  [3.8, 9], // truck
  [-2.2, 12], // sedan
  [-24, -20], // shed
  [-22, -24], // tree trunk area
];
let propHits = 0;
for (const [x, z] of propSamples) {
  if (blockedAt(x, z, solids)) propHits++;
  else failures.push(`prop sample (${x},${z}) not blocked`);
}
assert(propHits >= propSamples.length - 1, `props blocked ${propHits}/${propSamples.length}`);

// Open road mid should NOT be fully blocked
assert(!blockedAt(0, 8, solids), 'open road (0,8) should be free');
assert(!blockedAt(0, -4, solids) || blockedAt(0, -1.2, solids), 'sanity sample');

const report = {
  ok: failures.length === 0,
  solidColliders: solids.length,
  totalColliders: data.colliders.length,
  fenceHits,
  propHits,
  failures,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: fence/prop colliders block movement');
