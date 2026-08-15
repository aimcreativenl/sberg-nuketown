/**
 * Desktop vs touch-play detection, plus joystick → WASD mapping.
 */
import { isTouchPlay, isTouchPortrait } from '../src/input/detectPlayMode.js';
import { joystickToKeys } from '../src/input/TouchControls.js';
import { gyroLookActive, motionToLookRates, screenOrientationAngle } from '../src/input/GyroLook.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

assert(isTouchPlay({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }) === true, 'iPhone is touch play');
assert(
  isTouchPlay({ userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0 Mobile' }) === true,
  'Android phone is touch play'
);
assert(
  isTouchPlay({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' }) === true,
  'iPad UA is touch play'
);
assert(
  isTouchPlay({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    platform: 'MacIntel',
    maxTouchPoints: 5,
  }) === true,
  'iPadOS desktop UA with touch points is touch play'
);
assert(
  isTouchPlay({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
    pointerFine: true,
    pointerCoarse: false,
    maxTouchPoints: 0,
  }) === false,
  'desktop Chrome stays mouse/keyboard'
);
assert(
  isTouchPlay({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
    pointerFine: true,
    pointerCoarse: true,
    maxTouchPoints: 10,
  }) === false,
  'touchscreen laptop with a mouse stays desktop'
);
assert(
  isTouchPlay({
    userAgent: 'Mozilla/5.0',
    pointerFine: false,
    pointerCoarse: true,
    maxTouchPoints: 5,
  }) === true,
  'coarse-only pointer is touch play'
);
assert(isTouchPlay({ userAgentData: { mobile: true }, userAgent: 'Mozilla/5.0' }) === true, 'UA-CH mobile is touch play');

assert(isTouchPortrait({ userAgent: 'iPhone', window: { innerWidth: 800, innerHeight: 400 } }) === false, 'landscape phone is not portrait');
assert(
  isTouchPortrait({
    userAgent: 'iPhone',
    window: { innerWidth: 400, innerHeight: 800, matchMedia: () => ({ matches: true }) },
  }) === true,
  'portrait phone trips rotate hint'
);

const idle = joystickToKeys(0, 0);
assert(!idle.KeyW && !idle.KeyA && !idle.KeyS && !idle.KeyD && !idle.ShiftLeft, 'deadzone is idle');

const fwd = joystickToKeys(0, -1);
assert(fwd.KeyW === true, 'up on stick is forward');
assert(fwd.ShiftLeft === true, 'full forward sprints');

const back = joystickToKeys(0, 1);
assert(back.KeyS === true && !back.KeyW, 'down on stick is back');
assert(back.ShiftLeft === false, 'backpedal does not sprint');

const left = joystickToKeys(-1, 0);
assert(left.KeyA === true, 'left strafe');

const diag = joystickToKeys(0.7, -0.7);
assert(diag.KeyW && diag.KeyD, 'forward-right diagonal');

assert(gyroLookActive('off', true) === false, 'gyro off is never active');
assert(gyroLookActive('ads', false) === false, 'gyro ads is off at hip');
assert(gyroLookActive('ads', true) === true, 'gyro ads is on while aiming');
assert(gyroLookActive('always', false) === true, 'gyro always is on at hip');

const landscape = motionToLookRates({ alpha: 0, beta: 180, gamma: 0 }, 90);
assert(Math.abs(landscape.yawRate - Math.PI) < 1e-9, `landscape 90: +beta is yaw (got ${landscape.yawRate})`);
assert(Math.abs(landscape.pitchRate) < 1e-12, 'landscape 90: zero gamma is zero pitch');

const portrait = motionToLookRates({ alpha: 0, beta: 0, gamma: 180 }, 0);
assert(Math.abs(portrait.yawRate - Math.PI) < 1e-9, 'portrait: +gamma is yaw');

assert(screenOrientationAngle({ orientation: { angle: 90 } }) === 90, 'screen.orientation.angle');
assert(screenOrientationAngle({}, { orientation: -90 }) === 270, 'window.orientation -90 wraps to 270');

const report = { ok: failures.length === 0, failures };
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: touch play detect + joystick mapping ok');
