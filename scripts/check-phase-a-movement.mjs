/**
 * Phase A movement: import shipped helpers (do not reimplement) and assert
 * accel/friction/air-control behaviour.
 */
import {
  applyGroundWish,
  applyAirWish,
} from '../src/game/movement.js';
import {
  PLAYER_SPEED,
  PLAYER_ACCEL,
  PLAYER_FRICTION,
  PLAYER_AIR_ACCEL,
} from '../src/game/constants.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

const dt = 0.016;
const maxSpeed = PLAYER_SPEED;
const wishX = maxSpeed; // full forward wish on +X
const wishZ = 0;

// --- From rest + full wish, after small dt: speed < maxSpeed ---
{
  const r = applyGroundWish(0, 0, wishX, wishZ, maxSpeed, PLAYER_ACCEL, PLAYER_FRICTION, dt);
  const speed = Math.hypot(r.vx, r.vz);
  assert(speed > 0, `ground first frame should move, got speed ${speed}`);
  assert(
    speed < maxSpeed - 1e-4,
    `from rest after dt=${dt}, speed ${speed.toFixed(4)} must be < maxSpeed ${maxSpeed}`
  );
}

// --- After several frames approach max ---
{
  let vx = 0;
  let vz = 0;
  const frames = 40;
  for (let i = 0; i < frames; i++) {
    const r = applyGroundWish(vx, vz, wishX, wishZ, maxSpeed, PLAYER_ACCEL, PLAYER_FRICTION, dt);
    vx = r.vx;
    vz = r.vz;
  }
  const speed = Math.hypot(vx, vz);
  assert(
    speed > maxSpeed * 0.85,
    `after ${frames} frames speed ${speed.toFixed(4)} should approach max (~${maxSpeed})`
  );
  assert(
    speed <= maxSpeed + 0.15,
    `after ${frames} frames speed ${speed.toFixed(4)} should not greatly exceed max ${maxSpeed}`
  );
}

// --- Zero wish while grounded: speed decays toward 0 ---
{
  let vx = maxSpeed;
  let vz = 0;
  const start = Math.hypot(vx, vz);
  for (let i = 0; i < 20; i++) {
    const r = applyGroundWish(vx, vz, 0, 0, maxSpeed, PLAYER_ACCEL, PLAYER_FRICTION, dt);
    vx = r.vx;
    vz = r.vz;
  }
  const after = Math.hypot(vx, vz);
  assert(after < start * 0.5, `friction: after 20 zero-wish frames ${after.toFixed(4)} < half of ${start}`);
  for (let i = 0; i < 120; i++) {
    const r = applyGroundWish(vx, vz, 0, 0, maxSpeed, PLAYER_ACCEL, PLAYER_FRICTION, dt);
    vx = r.vx;
    vz = r.vz;
  }
  const rest = Math.hypot(vx, vz);
  assert(rest < 0.05, `friction should nearly stop: speed ${rest.toFixed(4)} < 0.05`);
}

// --- Air control does not instantly set full speed ---
{
  const r = applyAirWish(0, 0, wishX, wishZ, maxSpeed, PLAYER_AIR_ACCEL, dt);
  const speed = Math.hypot(r.vx, r.vz);
  assert(speed > 0, `air first frame should gain some speed, got ${speed}`);
  assert(
    speed < maxSpeed * 0.35,
    `air control must not instantly set full speed: ${speed.toFixed(4)} vs max ${maxSpeed}`
  );

  let vx = 0;
  let vz = 0;
  for (let i = 0; i < 5; i++) {
    const a = applyAirWish(vx, vz, wishX, wishZ, maxSpeed, PLAYER_AIR_ACCEL, dt);
    vx = a.vx;
    vz = a.vz;
  }
  const after5 = Math.hypot(vx, vz);
  assert(
    after5 < maxSpeed * 0.6,
    `after 5 air frames speed ${after5.toFixed(4)} still well below max ${maxSpeed}`
  );
}

// --- API surface ---
assert(typeof applyGroundWish === 'function', 'applyGroundWish exported');
assert(typeof applyAirWish === 'function', 'applyAirWish exported');
assert(PLAYER_ACCEL > 0, 'PLAYER_ACCEL > 0');
assert(PLAYER_FRICTION > 0, 'PLAYER_FRICTION > 0');
assert(PLAYER_AIR_ACCEL > 0, 'PLAYER_AIR_ACCEL > 0');
assert(PLAYER_AIR_ACCEL < PLAYER_ACCEL, 'air accel weaker than ground');

const report = {
  ok: failures.length === 0,
  constants: {
    PLAYER_SPEED,
    PLAYER_ACCEL,
    PLAYER_FRICTION,
    PLAYER_AIR_ACCEL,
  },
  failures,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: phase-a movement accel/friction/air checks ok');
