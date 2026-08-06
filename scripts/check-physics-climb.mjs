/**
 * Climb pad chains + stair runs: consecutive floor rises ≤ STEP_UP;
 * multi-frame Player.update walks up without mantle.
 */
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { buildMap, HOUSE_X } from '../src/game/MapBuilder.js';
import { Player } from '../src/game/Player.js';
import { pickFloorY } from '../src/game/movement.js';
import { PLAYER_HEIGHT } from '../src/game/constants.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

const SCRATCH =
  process.env.GROK_SCRATCH ||
  'C:\\Users\\GEBRUI~1\\AppData\\Local\\Temp\\grok-goal-105061e4c2b7\\implementer';

const scene = new THREE.Scene();
const data = buildMap(scene);
const floors = data.floors || [];
const STEP = Player.STEP_UP;

/** Floors near a climb chain for west garage (outer side x more negative). */
function floorsNear(x0, x1, z0, z1, yMin, yMax) {
  return floors
    .filter(
      (f) =>
        f.y >= yMin &&
        f.y <= yMax &&
        f.minX < x1 &&
        f.maxX > x0 &&
        f.minZ < z1 &&
        f.maxZ > z0
    )
    .sort((a, b) => a.y - b.y);
}

// West garage climb pads (tagged solids → derive XZ from colliders)
const climbPads = (data.colliders || []).filter(
  (c) => c.kind === 'climb_pad' && c.house === 'west'
);
assert(climbPads.length >= 4, `west climb_pad solids >= 4 got ${climbPads.length}`);
const padXs = climbPads.map((c) => (c.box.min.x + c.box.max.x) / 2);
const padZs = climbPads.map((c) => (c.box.min.z + c.box.max.z) / 2);
const gx0 = Math.min(...padXs) - 0.8;
const gx1 = Math.max(...padXs) + 0.8;
const gz0 = Math.min(...padZs) - 0.8;
const gz1 = Math.max(...padZs) + 0.8;
const climbChain = floorsNear(gx0, gx1, gz0, gz1, 0.3, 3.5);
// Unique y levels
const climbYs = [...new Set(climbChain.map((f) => +f.y.toFixed(3)))].sort((a, b) => a - b);
assert(climbYs.length >= 4, `garage climb floors levels >= 4 got ${climbYs.length}: ${climbYs}`);
let maxRise = 0;
for (let i = 1; i < climbYs.length; i++) {
  maxRise = Math.max(maxRise, climbYs[i] - climbYs[i - 1]);
}
assert(maxRise <= STEP + 0.04, `garage climb max rise ${maxRise.toFixed(3)} <= STEP_UP ${STEP}`);

// Roof climb chain toward main roof (west roof_climb pads)
const roofPads = (data.colliders || []).filter(
  (c) => c.kind === 'roof_climb' && c.house === 'west'
);
const rx0 = Math.min(...roofPads.map((c) => c.box.min.x)) - 1;
const rx1 = Math.max(...roofPads.map((c) => c.box.max.x)) + 1;
const rz0 = Math.min(...roofPads.map((c) => c.box.min.z)) - 1;
const rz1 = Math.max(...roofPads.map((c) => c.box.max.z)) + 1;
const roofChainYs = [
  ...new Set(floorsNear(rx0, rx1, rz0, rz1, 2.5, 6.0).map((f) => +f.y.toFixed(3))),
].sort((a, b) => a - b);
assert(roofChainYs.length >= 4, `roof climb levels >= 4 got ${roofChainYs.length}`);
let maxRoofRise = 0;
for (let i = 1; i < roofChainYs.length; i++) {
  const d = roofChainYs[i] - roofChainYs[i - 1];
  if (d > 0.01 && d < 1.2) maxRoofRise = Math.max(maxRoofRise, d);
}
assert(maxRoofRise <= STEP + 0.06, `roof climb step rise ${maxRoofRise.toFixed(3)} <= STEP_UP`);

// Multi-frame walk up stairs via real Player.update
const cam = new THREE.PerspectiveCamera();
const player = new Player(cam, data);
const stairX = -HOUSE_X - 3.35;
player.position.set(stairX, PLAYER_HEIGHT + 0.25, -3.0);
player.grounded = true;
player._lastFloorY = 0.25;
player.yaw = 0; // forward is -Z? forward = (-sin yaw, 0, -cos yaw) → (0,0,-1)
// Walk +Z along stairs (stair run increases z)
player.yaw = Math.PI; // forward = +Z
player.keys.add('KeyW');
let maxFeet = 0;
for (let i = 0; i < 180; i++) {
  player.update(1 / 60, data.colliders, data.floors, []);
  maxFeet = Math.max(maxFeet, player.position.y - PLAYER_HEIGHT);
  // nudge along +Z if stuck on X resolve
  if (i % 20 === 0) player.position.z += 0.05;
}
assert(maxFeet >= 2.8, `player stair climb maxFeet ${maxFeet.toFixed(2)} reaches near L2`);

// Multi-frame climb pad walk (west garage)
const p2 = new Player(cam, data);
// First pad approx
const pad0 = climbChain[0];
const px = (pad0.minX + pad0.maxX) / 2;
const pz0 = (pad0.minZ + pad0.maxZ) / 2;
p2.position.set(px, PLAYER_HEIGHT + 0.05, pz0);
p2.grounded = true;
p2._lastFloorY = 0;
p2.keys.add('KeyW');
// Face toward higher pads (+z-ish)
p2.yaw = Math.PI;
let maxClimbFeet = 0;
for (let i = 0; i < 200; i++) {
  // steer toward higher y samples along chain
  const feet = p2.position.y - PLAYER_HEIGHT;
  let target = null;
  for (const f of climbChain) {
    if (f.y > feet + 0.05 && f.y <= feet + STEP + 0.05) {
      target = f;
      break;
    }
  }
  if (target) {
    const tx = (target.minX + target.maxX) / 2;
    const tz = (target.minZ + target.maxZ) / 2;
    const dx = tx - p2.position.x;
    const dz = tz - p2.position.z;
    p2.yaw = Math.atan2(-dx, -dz);
  }
  p2.update(1 / 60, data.colliders, data.floors, []);
  maxClimbFeet = Math.max(maxClimbFeet, p2.position.y - PLAYER_HEIGHT);
}
assert(maxClimbFeet >= 2.8, `climb pad chain feet ${maxClimbFeet.toFixed(2)} reaches garage roof (~2.93)`);

// Structural: pickFloorY grounded step-up works between consecutive climb ys
for (let i = 1; i < Math.min(climbYs.length, 5); i++) {
  const below = climbYs[i - 1];
  const above = climbYs[i];
  if (above - below > STEP + 0.05) continue;
  const f = climbChain.find((ff) => Math.abs(ff.y - above) < 0.02);
  if (!f) continue;
  const eyeY = below + PLAYER_HEIGHT;
  const picked = pickFloorY(eyeY, PLAYER_HEIGHT, (f.minX + f.maxX) / 2, (f.minZ + f.maxZ) / 2, floors, {
    grounded: true,
    stepUp: STEP,
  });
  assert(
    picked != null && picked >= above - 0.05,
    `pickFloorY steps ${below}→${above} got ${picked}`
  );
}

const report = {
  ok: failures.length === 0,
  STEP_UP: STEP,
  climbYs,
  maxRise,
  roofChainYs: roofChainYs.slice(0, 12),
  maxRoofRise,
  maxFeetStairs: maxFeet,
  maxClimbFeet,
  failures,
};

try {
  fs.mkdirSync(SCRATCH, { recursive: true });
  fs.writeFileSync(path.join(SCRATCH, 'physics-climb.log'), JSON.stringify(report, null, 2));
} catch (e) {
  console.warn(e.message);
}
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: physics climb chains');
