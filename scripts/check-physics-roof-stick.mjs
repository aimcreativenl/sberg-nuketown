/**
 * Grounded on main roof: multi-frame zero input keeps feet near roof y (no fall-through).
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
const main = (data.roofMantleZones || []).find((z) => z.kind === 'main_roof' && z.house === 'west');
assert(main, 'west main roof');
const roofY = main.y;

// Structural: grounded pick at roof center returns roof, not ground
const cx = -HOUSE_X;
const cz = 0;
const picked = pickFloorY(roofY + PLAYER_HEIGHT, PLAYER_HEIGHT, cx, cz, data.floors, {
  grounded: true,
  stepUp: Player.STEP_UP,
  preferY: roofY,
});
assert(picked != null && Math.abs(picked - roofY) < 0.15, `pickFloorY on roof got ${picked}`);

const cam = new THREE.PerspectiveCamera();
const player = new Player(cam, data);
player.position.set(cx, roofY + PLAYER_HEIGHT, cz);
player.grounded = true;
player._lastFloorY = roofY;
player.velocity.set(0, 0, 0);
player.keys.clear();

const samples = [];
let fell = false;
for (let i = 0; i < 45; i++) {
  player.update(1 / 60, data.colliders, data.floors, []);
  const feet = player.position.y - PLAYER_HEIGHT;
  samples.push({ i, feet, grounded: player.grounded });
  if (!player.grounded || feet < roofY - 0.4 || feet < 1.0) {
    fell = true;
    failures.push(`frame ${i}: feet=${feet.toFixed(3)} grounded=${player.grounded}`);
    break;
  }
}
assert(!fell, 'stayed on roof 45 frames');
assert(player.grounded, 'still grounded');
const feetEnd = player.position.y - PLAYER_HEIGHT;
assert(Math.abs(feetEnd - roofY) < 0.2, `feet end ${feetEnd.toFixed(3)} near roof ${roofY}`);

// Moving slightly on roof still sticks
player.keys.add('KeyW');
player.yaw = 0;
for (let i = 0; i < 30; i++) player.update(1 / 60, data.colliders, data.floors, []);
const feetWalk = player.position.y - PLAYER_HEIGHT;
assert(
  player.grounded && feetWalk > roofY - 0.35,
  `walk on roof feet=${feetWalk.toFixed(3)} grounded=${player.grounded}`
);

const report = {
  ok: failures.length === 0,
  roofY,
  feetEnd,
  feetWalk,
  samples: samples.slice(0, 5).concat(samples.slice(-3)),
  failures,
};

try {
  fs.mkdirSync(SCRATCH, { recursive: true });
  fs.writeFileSync(path.join(SCRATCH, 'physics-roof-stick.log'), JSON.stringify(report, null, 2));
} catch (e) {
  console.warn(e.message);
}
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: roof stick');
