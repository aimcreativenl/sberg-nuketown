/**
 * House interiors: major furniture non-overlapping AABBs + solid colliders that block
 * player/bot samples; clear floor path samples free. Uses shipped buildMap.
 */
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { buildMap, HOUSE_X } from '../src/game/MapBuilder.js';
import { botPositionBlocked, playerPositionBlocked } from '../src/game/collision.js';
import { PLAYER_RADIUS, PLAYER_HEIGHT } from '../src/game/constants.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

const SCRATCH =
  process.env.GROK_SCRATCH ||
  'C:\\Users\\GEBRUI~1\\AppData\\Local\\Temp\\grok-goal-c9b61c05f4f7\\implementer';

const scene = new THREE.Scene();
const data = buildMap(scene);
const colliders = data.colliders || [];

const furniture = colliders.filter((c) => c.kind === 'house_furniture');
assert(furniture.length >= 20, `furniture solids >= 20 got ${furniture.length}`);

// Named markers on mesh tree
const names = [];
data.group.traverse((o) => {
  if (o.name) names.push(o.name);
});
const needNames = [
  'interior_west',
  'interior_east',
  'furn_sofa_west',
  'furn_sofa_east',
  'furn_table_west',
  'furn_counter_west',
  'furn_bed_west',
  'furn_fridge_east',
];
for (const n of needNames) {
  assert(names.includes(n), `marker ${n}`);
}

/** Pairwise AABB overlap in XZ (and overlapping Y range) beyond epsilon. */
function overlaps(a, b, eps = 0.04) {
  const A = a.box;
  const B = b.box;
  if (A.max.y < B.min.y + eps || B.max.y < A.min.y + eps) return false;
  const ox = Math.min(A.max.x, B.max.x) - Math.max(A.min.x, B.min.x);
  const oz = Math.min(A.max.z, B.max.z) - Math.max(A.min.z, B.min.z);
  return ox > eps && oz > eps;
}

let overlapPairs = 0;
const overlapList = [];
for (let i = 0; i < furniture.length; i++) {
  for (let j = i + 1; j < furniture.length; j++) {
    // Only compare same house
    if (furniture[i].house !== furniture[j].house) continue;
    if (overlaps(furniture[i], furniture[j])) {
      overlapPairs++;
      overlapList.push(`${furniture[i].part} ∩ ${furniture[j].part}`);
    }
  }
}
assert(overlapPairs === 0, `no furniture overlaps (got ${overlapPairs}: ${overlapList.join('; ')})`);

// Samples inside furniture must block; clear paths free
let insideBlocked = 0;
let insideTotal = 0;
for (const f of furniture) {
  const b = f.box;
  // Skip very short (already solid) — sample center XZ at feet and eye
  const x = (b.min.x + b.max.x) / 2;
  const z = (b.min.z + b.max.z) / 2;
  // Only ground-floor furniture for feet-level bot (y body 0..1.65)
  if (b.min.y > 2.5) {
    // L2: test with elevated body
    const eyeY = 3.2 + PLAYER_HEIGHT;
    const feetY = 3.2;
    insideTotal++;
    const hit =
      playerPositionBlocked({ x, y: eyeY, z }, colliders, {
        radius: PLAYER_RADIUS,
        height: PLAYER_HEIGHT,
      }) || botPositionBlocked({ x, y: feetY, z }, colliders);
    if (hit) insideBlocked++;
    else failures.push(`L2 furniture not blocking ${f.part} @ (${x.toFixed(2)},${z.toFixed(2)})`);
  } else {
    insideTotal++;
    const hit =
      playerPositionBlocked({ x, y: PLAYER_HEIGHT, z }, colliders, {
        radius: PLAYER_RADIUS,
        height: PLAYER_HEIGHT,
      }) || botPositionBlocked({ x, y: 0, z }, colliders);
    if (hit) insideBlocked++;
    else failures.push(`L1 furniture not blocking ${f.part} @ (${x.toFixed(2)},${z.toFixed(2)})`);
  }
}
assert(insideBlocked === insideTotal, `furniture solids block ${insideBlocked}/${insideTotal}`);

// Clear walk paths — open mid-floor (local origin band) and porch-side entry
// Avoid: partition @ cx+1.2, living bay @ sx*2.4, kitchen @ sx*-2.5, stairs @ -3.35
const clearPaths = [
  { x: -HOUSE_X, z: -3.5, label: 'west_entry' },
  { x: -HOUSE_X - 0.2, z: -0.8, label: 'west_mid' },
  { x: -HOUSE_X + 3.2, z: -0.5, label: 'west_kitchen_aisle' },
  { x: HOUSE_X, z: 3.5, label: 'east_entry' },
  { x: HOUSE_X + 0.2, z: 0.8, label: 'east_mid' },
];
let clearOk = 0;
for (const s of clearPaths) {
  const botHit = botPositionBlocked({ x: s.x, y: 0, z: s.z }, colliders);
  const playerHit = playerPositionBlocked(
    { x: s.x, y: PLAYER_HEIGHT, z: s.z },
    colliders,
    { radius: PLAYER_RADIUS, height: PLAYER_HEIGHT }
  );
  if (!botHit && !playerHit) clearOk++;
  else failures.push(`clear path blocked ${s.label} bot=${botHit} player=${playerHit}`);
}
assert(clearOk === clearPaths.length, `clear paths free ${clearOk}/${clearPaths.length}`);

const report = {
  ok: failures.length === 0,
  furnitureSolids: furniture.length,
  overlapPairs,
  insideBlocked,
  insideTotal,
  clearOk,
  clearTotal: clearPaths.length,
  sampleParts: furniture.slice(0, 8).map((f) => f.part),
  failures,
};

try {
  fs.mkdirSync(SCRATCH, { recursive: true });
  fs.writeFileSync(path.join(SCRATCH, 'house-interior.log'), JSON.stringify(report, null, 2), 'utf8');
} catch (err) {
  console.warn('SCRATCH write failed', err.message);
}

console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: house interiors solid + non-overlapping');
