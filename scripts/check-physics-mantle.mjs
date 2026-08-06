/**
 * Mantle: under-roof interior jumps must NOT snap to main roof;
 * near-edge airborne within tight reach still mantles.
 */
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { buildMap, HOUSE_X } from '../src/game/MapBuilder.js';
import { tryRoofMantle, pickFloorY } from '../src/game/movement.js';
import { Player } from '../src/game/Player.js';
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
const zones = data.roofMantleZones || [];
const main = zones.find((z) => z.kind === 'main_roof' && z.house === 'west');
assert(main, 'west main roof zone');

const roofY = main.y;

// Under-roof L1 center — random jumps must not mantle
const underL1 = { x: -HOUSE_X, y: PLAYER_HEIGHT + 1.2, z: 0 };
assert(
  !tryRoofMantle(underL1, PLAYER_HEIGHT, zones, { reach: 0.82, margin: 0.55, edgeBand: 1.35 }),
  'no mantle under roof L1 jump peak'
);

// Under-roof L2 center
const underL2 = { x: -HOUSE_X + 2, y: 3.2 + PLAYER_HEIGHT + 0.8, z: 0.5 };
assert(
  !tryRoofMantle(underL2, PLAYER_HEIGHT, zones, { reach: 0.82, edgeBand: 1.35 }),
  'no mantle under roof L2'
);

// pickFloorY airborne must not snap L1 feet to roof
const airEye = 0.25 + PLAYER_HEIGHT + 1.5; // jump peak-ish at L1
const badSnap = pickFloorY(airEye, PLAYER_HEIGHT, -HOUSE_X, 0, data.floors, {
  grounded: false,
  stepUp: Player.STEP_UP,
});
assert(
  badSnap == null || badSnap < 2.0,
  `airborne pickFloorY must not return roof (got ${badSnap})`
);

// Player.update: multi Space under house must not end on roof
const cam = new THREE.PerspectiveCamera();
const p = new Player(cam, data);
p.position.set(-HOUSE_X, PLAYER_HEIGHT + 0.25, 0.5);
p.grounded = true;
p._lastFloorY = 0.25;
let hitRoof = false;
for (let i = 0; i < 40; i++) {
  // spam space edges
  p._spaceHeld = false;
  p.keys.add('Space');
  p.update(1 / 60, data.colliders, data.floors, []);
  p.keys.delete('Space');
  p._spaceHeld = true;
  p.update(1 / 60, data.colliders, data.floors, []);
  const feet = p.position.y - PLAYER_HEIGHT;
  if (feet > roofY - 0.3) hitRoof = true;
}
assert(!hitRoof, 'spam jump under house must not teleport to roof');

// Legitimate near-edge mantle (feet just below roof, outside plate)
const edgeX = main.minX - 0.25;
const edgeZ = (main.minZ + main.maxZ) / 2;
const near = {
  x: edgeX,
  y: roofY - 0.55 + PLAYER_HEIGHT,
  z: edgeZ,
};
const ok = tryRoofMantle(near, PLAYER_HEIGHT, zones, {
  reach: 0.82,
  margin: 0.55,
  edgeBand: 1.35,
  inset: 0.4,
});
assert(ok && Math.abs(ok.y - roofY) < 0.02, `edge mantle works y=${ok?.y}`);
assert(ok.x >= main.minX && ok.x <= main.maxX, 'mantle x on roof');

// Player path legitimate mantle
const p2 = new Player(cam, data);
p2.position.set(edgeX, roofY - 0.55 + PLAYER_HEIGHT, edgeZ);
p2.grounded = false;
p2._airJumpUsed = true;
p2._spaceHeld = false;
p2._mantleCooldown = 0;
p2.keys.add('Space');
const r = p2.update(1 / 60, data.colliders, data.floors, []);
assert(r.mantled || Math.abs(p2.position.y - PLAYER_HEIGHT - roofY) < 0.2, 'player edge mantle');
assert(p2.position.x >= main.minX && p2.position.x <= main.maxX, 'player on roof xz after mantle');

const report = {
  ok: failures.length === 0,
  roofY,
  underL1Mantle: false,
  edgeMantleY: ok?.y,
  spamJumpHitRoof: hitRoof,
  failures,
};

try {
  fs.mkdirSync(SCRATCH, { recursive: true });
  fs.writeFileSync(path.join(SCRATCH, 'physics-mantle.log'), JSON.stringify(report, null, 2));
} catch (e) {
  console.warn(e.message);
}
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: physics mantle tight');
