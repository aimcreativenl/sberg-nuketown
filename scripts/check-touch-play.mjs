/**
 * Desktop vs touch-play detection, plus joystick → WASD mapping.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isTouchPlay, isTouchPortrait } from '../src/input/detectPlayMode.js';
import { joystickToKeys, lookIdAfterFireDown, isLookTap } from '../src/input/TouchControls.js';
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

assert(lookIdAfterFireDown(null, 7) === 7, 'FIRE starts look when the look pad is free');
assert(lookIdAfterFireDown(3, 7) === 3, 'FIRE does not steal an existing look finger');
assert(isLookTap(4, 90) === true, 'short still look press is a tap');
assert(isLookTap(40, 90) === false, 'drag is not a tap');
assert(isLookTap(4, 400) === false, 'hold is not a tap');

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../index.html'), 'utf8');
const fireBtns = html.match(/data-touch="fire"/g) || [];
assert(fireBtns.length === 0, `FIRE button removed (got ${fireBtns.length})`);
assert(html.includes('data-zone="look"'), 'look pad remains for look + tap-to-shoot');
assert(!html.includes('data-touch="gun1"') && !html.includes('data-touch="gun2"'), 'weapon 1/2 buttons are off the stick');
assert(!html.includes('touch-fire-left'), 'no left claw FIRE');
assert(html.includes('id="weapon-banner"'), 'weapon banner remains for tap-to-swap');
assert(html.includes('tap to shoot'), 'how-to mentions look-pad tap fire');

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/style.css'), 'utf8');
assert(css.includes('(orientation: landscape)'), 'phone landscape start layout');
assert(css.includes("'brand play'"), 'landscape start is title + actions side by side');
assert(/html\.touch-play\s+#weapon-banner[\s\S]{0,500}z-index:\s*45/.test(css), 'weapon banner stacks above look pad');
assert(/\.touch-look[\s\S]{0,280}88px/.test(css), 'look pad sits below the weapon banner');

const touchSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/input/TouchControls.js'), 'utf8');
assert((touchSrc.match(/export function lookIdAfterFireDown/g) || []).length === 1, 'lookIdAfterFireDown exported once');
assert(touchSrc.includes('shootClicks'), 'look-pad tap queues a shot');

const report = { ok: failures.length === 0, failures };
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: touch play detect + joystick mapping ok');
