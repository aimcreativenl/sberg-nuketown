/**
 * Guard: casing shrink must never grow past spawn size; muzzle cores stay small.
 */
import * as THREE from 'three';
import { ParticleSystem } from '../src/game/Particles.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

const scene = new THREE.Scene();
const ps = new ParticleSystem(scene);
const origin = new THREE.Vector3(0, 1.5, 0);
const dir = new THREE.Vector3(0, 0, -1);

ps.bulletCasings(origin, dir);
assert(ps.particles.length >= 1, 'casing spawned');
const casing = ps.particles[ps.particles.length - 1];
assert(casing.shrink === true, 'casing uses shrink');
assert(casing.baseScale > 0 && casing.baseScale < 0.1, `casing baseScale small got ${casing.baseScale}`);
const scale0 = casing.mesh.scale.x;
ps.update(0.05);
const scale1 = casing.mesh.scale.x;
assert(scale1 <= scale0 + 1e-6, `casing must not grow (was ${scale0} now ${scale1})`);
assert(scale1 <= casing.baseScale + 1e-6, `casing scale <= baseScale (${scale1} vs ${casing.baseScale})`);

// Simulate full life — never exceed baseScale
for (let i = 0; i < 30; i++) ps.update(0.05);
// particle may be gone; if still live, scale ok
for (const p of ps.particles) {
  if (p.shrink) {
    assert(p.mesh.scale.x <= p.baseScale + 1e-6, 'live shrink particle stays <= baseScale');
  }
}

ps.muzzleFlash(origin, dir);
const muzzle = ps.particles.filter((p) => p.life <= 0.1 && p.mesh.scale.x < 0.15);
assert(muzzle.length > 0 || ps.particles.some((p) => p.baseScale <= 0.12), 'muzzle particles stay compact');
for (const p of ps.particles) {
  assert(p.baseScale <= 0.15, `no huge particle baseScale ${p.baseScale}`);
}

// Snow must NOT use AdditiveBlending — stacks into outdoor white-out with bloom
ps.snowDust();
assert(ps.snow, 'snow points system created');
assert(
  ps.snow.material.blending === THREE.NormalBlending,
  `snow uses NormalBlending (got ${ps.snow.material.blending})`
);
assert(ps.snow.material.opacity <= 0.7, `snow opacity capped (got ${ps.snow.material.opacity})`);

const report = {
  ok: failures.length === 0,
  snowBlending: ps.snow?.material?.blending,
  snowOpacity: ps.snow?.material?.opacity,
  failures,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: particle scale/casing guards ok');
