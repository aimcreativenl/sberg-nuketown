/**
 * Anti fall-through: fast falls / jump spam must not send feet under world ground.
 * Uses shipped pickFloorY + Player.update.
 */
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { buildMap } from '../src/game/MapBuilder.js';
import { pickFloorY } from '../src/game/movement.js';
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
const floors = data.floors;

// Crossed-floor landing: prevFeet=0.2, feet=-0.8 must still see y=0
const crossed = pickFloorY(PLAYER_HEIGHT - 0.8, PLAYER_HEIGHT, 0, 8, floors, {
  grounded: false,
  prevFeet: 0.2,
  falling: true,
  stepUp: 0.55,
});
assert(crossed != null && crossed >= -0.01 && crossed <= 0.3, `cross-land got ${crossed}`);

// Already under ground slightly
const under = pickFloorY(PLAYER_HEIGHT - 0.15, PLAYER_HEIGHT, 5, 5, floors, {
  grounded: false,
  prevFeet: 0.1,
  falling: true,
});
assert(under != null && under >= -0.01, `under recovery got ${under}`);

// Rising jump under house must NOT return main roof (5.88) as support
const roofSnap = pickFloorY(1.2 + PLAYER_HEIGHT, PLAYER_HEIGHT, -17, 0, floors, {
  grounded: false,
  prevFeet: 0.5,
  falling: false,
  stepUp: 0.55,
});
assert(roofSnap == null || roofSnap < 4.5, `no main-roof while rising L1 got ${roofSnap}`);
// Falling fast under house must not pull to main roof from prevFeet on L1
const fallNoRoof = pickFloorY(PLAYER_HEIGHT - 0.5, PLAYER_HEIGHT, -17, 0, floors, {
  grounded: false,
  prevFeet: 1.5,
  falling: true,
  stepUp: 0.55,
});
assert(fallNoRoof == null || fallNoRoof < 4.5, `no main-roof on L1 fall got ${fallNoRoof}`);

const cam = new THREE.PerspectiveCamera();

// Jump spam on open ground
const p = new Player(cam, data);
p.position.set(0, PLAYER_HEIGHT, 8);
p.grounded = true;
p._lastFloorY = 0;
let minFeet = 99;
let fell = false;
for (let i = 0; i < 250; i++) {
  p._spaceHeld = false;
  p.keys.add('Space');
  p.update(1 / 60, data.colliders, data.floors, []);
  p.keys.delete('Space');
  p._spaceHeld = true;
  p.update(1 / 60, data.colliders, data.floors, []);
  // also walk a bit
  p.keys.add('KeyW');
  p.update(1 / 60, data.colliders, data.floors, []);
  p.keys.delete('KeyW');
  const feet = p.position.y - PLAYER_HEIGHT;
  minFeet = Math.min(minFeet, feet);
  if (feet < -0.2) {
    fell = true;
    failures.push(`jump spam fell feet=${feet.toFixed(3)} frame=${i}`);
    break;
  }
}
assert(!fell, `jump spam no fall-through minFeet=${minFeet.toFixed(3)}`);
assert(minFeet > -0.15, `minFeet ${minFeet.toFixed(3)} stays near ground`);

// High-speed fall from air
const p2 = new Player(cam, data);
p2.position.set(2, PLAYER_HEIGHT + 8, 0);
p2.grounded = false;
p2.velocity.set(0, -30, 0);
p2._lastFloorY = 0;
minFeet = 99;
fell = false;
for (let i = 0; i < 120; i++) {
  p2.update(1 / 60, data.colliders, data.floors, []);
  const feet = p2.position.y - PLAYER_HEIGHT;
  minFeet = Math.min(minFeet, feet);
  if (feet < -0.35) {
    fell = true;
    failures.push(`fast fall through feet=${feet.toFixed(3)}`);
    break;
  }
  if (p2.grounded && feet < 0.5) break;
}
assert(!fell, `fast fall no tunnel minFeet=${minFeet.toFixed(3)}`);
assert(p2.grounded || minFeet > -0.2, `landed or recovering grounded=${p2.grounded}`);

// Emergency: force under map
const p3 = new Player(cam, data);
p3.position.set(0, -2, 0);
p3.grounded = false;
p3.velocity.set(0, -5, 0);
p3.update(1 / 60, data.colliders, data.floors, []);
assert(p3.position.y - PLAYER_HEIGHT > -0.2, `emergency rescue y=${p3.position.y}`);
assert(p3.grounded, 'emergency sets grounded');

const report = {
  ok: failures.length === 0,
  crossed,
  under,
  jumpMinFeet: minFeet,
  fastFallGrounded: p2.grounded,
  rescueFeet: p3.position.y - PLAYER_HEIGHT,
  failures,
};

try {
  fs.mkdirSync(SCRATCH, { recursive: true });
  fs.writeFileSync(path.join(SCRATCH, 'physics-ground.log'), JSON.stringify(report, null, 2));
} catch (e) {
  console.warn(e.message);
}
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: no fall-through ground');
