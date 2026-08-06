/**
 * Criterion 1 — real Player.update path:
 * - Non-stepable solids (furniture, walls): capsule must not rest overlapping them;
 *   walk-into must not leave feet at ground deep inside the AABB.
 * - Stepable only when isStepableSolid (floor pad on top) — furniture must not qualify.
 * - Lowest stair: no ground-feet tunnel through the volume.
 */
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { buildMap, HOUSE_X } from '../src/game/MapBuilder.js';
import { Player } from '../src/game/Player.js';
import { isStepableSolid } from '../src/game/movement.js';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from '../src/game/constants.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

const SCRATCH =
  process.env.GROK_SCRATCH ||
  'C:\\Users\\GEBRUI~1\\AppData\\Local\\Temp\\grok-goal-105061e4c2b7\\implementer';

const scene = new THREE.Scene();
const data = buildMap(scene);
const colliders = data.colliders || [];
const floors = data.floors || [];
const cam = new THREE.PerspectiveCamera();

function capsuleOverlapsBox(pos, box, r = PLAYER_RADIUS) {
  const feet = pos.y - PLAYER_HEIGHT;
  const bodyMinY = feet + 0.15;
  const bodyMaxY = pos.y - 0.1;
  if (bodyMaxY < box.min.y || bodyMinY > box.max.y) return false;
  return (
    pos.x + r > box.min.x &&
    pos.x - r < box.max.x &&
    pos.z + r > box.min.z &&
    pos.z - r < box.max.z
  );
}

function deepInsideGround(pos, box) {
  const feet = pos.y - PLAYER_HEIGHT;
  return (
    feet < 0.4 &&
    pos.x > box.min.x + 0.12 &&
    pos.x < box.max.x - 0.12 &&
    pos.z > box.min.z + 0.12 &&
    pos.z < box.max.z - 0.12
  );
}

/** Walk toward solid center for N frames using shipped Player.update. */
function walkToward(solid, frames = 90) {
  const box = solid.box;
  const mx = (box.min.x + box.max.x) / 2;
  const mz = (box.min.z + box.max.z) / 2;
  const p = new Player(cam, data);
  // Start outside nearest face on +X of min.x
  p.position.set(box.min.x - 1.15, PLAYER_HEIGHT + 0.25, mz);
  p.grounded = true;
  p._lastFloorY = 0.25;
  p.velocity.set(0, 0, 0);
  p.yaw = -Math.PI / 2; // face +X
  p.keys.add('KeyW');
  for (let i = 0; i < frames; i++) {
    // Re-aim at center each few frames so we don't slide forever
    if (i % 8 === 0) {
      const dx = mx - p.position.x;
      const dz = mz - p.position.z;
      p.yaw = Math.atan2(-dx, -dz);
    }
    p.update(1 / 60, colliders, floors, []);
  }
  return p;
}

// --- Furniture ---
const furniture = colliders.filter((c) => c.kind === 'house_furniture');
assert(furniture.length >= 20, `furniture solids ${furniture.length}`);

let furnOk = 0;
let furnTested = 0;
const furnNotes = [];
for (const f of furniture) {
  // Ground-level pieces only for walk-in
  if (f.box.max.y > 2.3 || f.box.min.y > 1.2) continue;
  furnTested++;

  const stepable = isStepableSolid(f.box, 0.25, floors, { stepUp: Player.STEP_UP });
  assert(!stepable, `furniture ${f.part} must NOT be stepable without top floor pad`);

  const p = walkToward(f, 100);
  const overlap = capsuleOverlapsBox(p.position, f.box);
  const deep = deepInsideGround(p.position, f.box);
  furnNotes.push({
    part: f.part,
    overlap,
    deep,
    feet: +(p.position.y - PLAYER_HEIGHT).toFixed(3),
    x: +p.position.x.toFixed(2),
    z: +p.position.z.toFixed(2),
  });
  if (deep) failures.push(`deep inside furniture at ground: ${f.part}`);
  else if (overlap) failures.push(`capsule still overlaps furniture after resolve: ${f.part}`);
  else furnOk++;
}
assert(furnTested >= 10, `tested enough furniture ${furnTested}`);
assert(furnOk === furnTested, `all ground furniture solid ${furnOk}/${furnTested}`);

// --- Outer wall ---
const outer = colliders.find(
  (c) => c.kind === 'house_wall' && c.part === 'outer_side' && c.house === 'west'
);
assert(outer, 'west outer wall');
{
  const p = walkToward(outer, 80);
  assert(!deepInsideGround(p.position, outer.box), 'not deep in outer wall');
  assert(!capsuleOverlapsBox(p.position, outer.box), 'no overlap outer wall after resolve');
}

// --- Lowest stair: no ground-feet deep tunnel ---
const treads = colliders
  .filter((c) => c.kind === 'stair_tread' && c.house === 'west')
  .sort((a, b) => a.box.max.y - b.box.max.y);
assert(treads.length >= 10, `stair treads ${treads.length}`);
const lowest = treads[0];
{
  const box = lowest.box;
  const mz = (box.min.z + box.max.z) / 2;
  const p = new Player(cam, data);
  p.position.set(box.min.x - 1.2, PLAYER_HEIGHT + 0.25, mz);
  p.grounded = true;
  p._lastFloorY = 0.25;
  p.yaw = -Math.PI / 2;
  p.keys.add('KeyW');
  for (let i = 0; i < 100; i++) {
    const dx = (box.min.x + box.max.x) / 2 - p.position.x;
    const dz = mz - p.position.z;
    p.yaw = Math.atan2(-dx, -dz);
    p.update(1 / 60, colliders, floors, []);
  }
  const feet = p.position.y - PLAYER_HEIGHT;
  const deep = deepInsideGround(p.position, box);
  const stepped = feet >= box.max.y - 0.15;
  assert(!deep || stepped, `lowest stair deep@ground feet=${feet.toFixed(2)} stepped=${stepped}`);
  // Side tunnel: past far side at ground feet
  const pastFarGround = p.position.x > box.max.x + 0.3 && feet < 0.35;
  assert(!pastFarGround, `lowest stair no far-side ground tunnel x=${p.position.x.toFixed(2)}`);
}

// Climb pad is stepable
const climb = colliders.find((c) => c.kind === 'climb_pad' && c.house === 'west');
assert(climb, 'west climb pad');
assert(
  isStepableSolid(climb.box, 0.25, floors, { stepUp: Player.STEP_UP }),
  'climb pad stepable with floor'
);

// Door approach still free enough to move
{
  const p = new Player(cam, data);
  p.position.set(-HOUSE_X, PLAYER_HEIGHT + 0.25, -6.2);
  p.grounded = true;
  p._lastFloorY = 0.25;
  p.yaw = 0; // -Z is forward with yaw0... forward=(-sin,0,-cos) yaw0 → (0,0,-1)
  // Want +Z toward door from -6.2: face +Z
  p.yaw = Math.PI;
  p.keys.add('KeyW');
  for (let i = 0; i < 50; i++) p.update(1 / 60, colliders, floors, []);
  assert(p.position.z > -6.0, `door approach moves z=${p.position.z.toFixed(2)}`);
}

const report = {
  ok: failures.length === 0,
  furniture: furniture.length,
  furnTested,
  furnOk,
  furnNotes: furnNotes.slice(0, 8),
  lowestStairTop: +lowest.box.max.y.toFixed(3),
  failures,
};

try {
  fs.mkdirSync(SCRATCH, { recursive: true });
  fs.writeFileSync(path.join(SCRATCH, 'physics-solids.log'), JSON.stringify(report, null, 2));
} catch (e) {
  console.warn(e.message);
}
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: physics solids (Player.update + stepable+floor)');
