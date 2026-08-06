/**
 * Bot fire must leave visible TPP cues: aim snap, fire kick, botMuzzleFlash + tracer.
 */
import * as THREE from 'three';
import { VoxelCharacter } from '../src/game/VoxelCharacter.js';
import { ParticleSystem } from '../src/game/Particles.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

const char = new VoxelCharacter({ name: 'BUBBLEGUM', outfitIndex: 0 });
char.setHeldWeapon(0);
assert(typeof char.triggerFire === 'function', 'triggerFire exists');
assert(typeof char.getMuzzleWorldPosition === 'function', 'getMuzzleWorldPosition');

char.updateAnimation(0.05, { aiming: false, moveSpeed: 0, grounded: true });
const blendIdle = char._aimBlend;
char.updateAnimation(0.05, { aiming: true, moveSpeed: 0, grounded: true });
const blendAim = char._aimBlend;
assert(blendAim > blendIdle, `aim blend rises ${blendAim} > ${blendIdle}`);

char.triggerFire();
assert(char._fireKick === 1, 'fire kick set');
assert(char._aimBlend === 1, 'aim snaps on fire');
char.updateAnimation(0, { aiming: true, moveSpeed: 0, grounded: true });
assert(char.shoulderR.rotation.x < -1.0, `right arm raised on fire got ${char.shoulderR.rotation.x}`);

const scene = new THREE.Scene();
const ps = new ParticleSystem(scene);
assert(typeof ps.botMuzzleFlash === 'function', 'botMuzzleFlash exists');
const before = scene.children.length;
ps.botMuzzleFlash(new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(0, 0, -1), { tracerLength: 4 });
assert(scene.children.length > before, 'bot muzzle adds meshes');
assert(ps.particles.some((p) => p.type === 'tracer'), 'tracer particle spawned');
assert(ps.particles.some((p) => p.baseScale >= 0.1), 'has larger flash cores for TPP');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameSrc = fs.readFileSync(path.join(__dirname, '../src/game/Game.js'), 'utf8');
const botSrc = fs.readFileSync(path.join(__dirname, '../src/game/BotAI.js'), 'utf8');
assert(gameSrc.includes('botMuzzleFlash'), 'Game uses botMuzzleFlash for enemy fire');
assert(botSrc.includes('triggerFire'), 'BotAI calls triggerFire on shoot');

const report = { ok: failures.length === 0, failures };
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: bot fire VFX readable in TPP');
