/**
 * Start-screen orbit must be upright on the first pose — no inverted unwind.
 */
import * as THREE from 'three';
import { applyUprightLook, MenuCamera } from '../src/game/MenuCamera.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

function cameraUpY(camera) {
  return new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).y;
}

const cam = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 200);
const menu = new MenuCamera(cam, {
  center: new THREE.Vector3(0, 0, 2),
  radius: 30,
  height: 10.5,
  lookY: 2.6,
  yawSpeed: 0.07,
  fov: 52,
});
menu.start();

assert(cam.position.y > 8, `menu camera starts above the map (got y=${cam.position.y})`);
assert(cameraUpY(cam) > 0.9, `first pose is upright (up.y=${cameraUpY(cam)})`);
assert(Math.abs(cam.rotation.z) < 1e-9, 'roll is zero on start');
assert(cam.rotation.x < 0, 'first pose looks slightly down at the town');

const from = new THREE.Vector3(20, 10, 0);
const to = new THREE.Vector3(0, 2.5, 0);
applyUprightLook(cam, from, to);
assert(cameraUpY(cam) > 0.9, 'applyUprightLook keeps world-up');
assert(Math.abs(cam.rotation.z) < 1e-9, 'applyUprightLook has zero roll');

for (let i = 0; i < 240; i++) {
  menu.update(0.25);
  const upY = cameraUpY(cam);
  if (upY < 0.85) {
    failures.push(`orbit inverted at t=${menu.t.toFixed(2)} (up.y=${upY})`);
    break;
  }
  if (cam.position.y < 6) {
    failures.push(`orbit dipped too low at t=${menu.t.toFixed(2)} (y=${cam.position.y})`);
    break;
  }
}

const report = { ok: failures.length === 0, failures };
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: menu camera stays upright while orbiting');
