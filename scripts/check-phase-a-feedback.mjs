/**
 * Phase A: hit / kill feedback guards.
 * Tests UI + Audio entry points without WebGL Game bootstrap.
 * Greps Game.js for damage-path wiring.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GameUI } from '../src/game/UI.js';
import { GameAudio } from '../src/game/Audio.js';
import { ParticleSystem } from '../src/game/Particles.js';
import * as THREE from 'three';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameSrc = fs.readFileSync(path.join(__dirname, '../src/game/Game.js'), 'utf8');
const uiSrc = fs.readFileSync(path.join(__dirname, '../src/game/UI.js'), 'utf8');
const audioSrc = fs.readFileSync(path.join(__dirname, '../src/game/Audio.js'), 'utf8');
const particlesSrc = fs.readFileSync(path.join(__dirname, '../src/game/Particles.js'), 'utf8');

// --- UI timestamps (no DOM required) ---
const ui = new GameUI();
assert(ui.lastHitmarkerAt === 0, 'lastHitmarkerAt starts at 0');
assert(ui.lastKillFlashAt === 0, 'lastKillFlashAt starts at 0');

const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
ui.showHitmarker(true);
assert(ui.lastHitmarkerAt >= t0, `showHitmarker sets lastHitmarkerAt (got ${ui.lastHitmarkerAt})`);
assert(ui.lastHitWasHeadshot === true, 'showHitmarker(true) records headshot');

ui.showHitmarker(false);
assert(ui.lastHitWasHeadshot === false, 'showHitmarker(false) clears headshot flag');

const tHs = typeof performance !== 'undefined' ? performance.now() : Date.now();
ui.showHeadshot();
assert(ui.lastHeadshotAt >= tHs, 'showHeadshot sets lastHeadshotAt');
assert(ui.lastHitWasHeadshot === true, 'showHeadshot records headshot');
assert(typeof ui.showHeadshot === 'function', 'showHeadshot exists');

const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
ui.showKillFlash();
assert(ui.lastKillFlashAt >= t1, `showKillFlash sets lastKillFlashAt (got ${ui.lastKillFlashAt})`);

const t2 = typeof performance !== 'undefined' ? performance.now() : Date.now();
ui.showKillConfirm('ELIMINATED!');
assert(ui.lastKillConfirmAt >= t2, 'showKillConfirm sets lastKillConfirmAt');

assert(typeof ui.pulseCrosshair === 'function', 'pulseCrosshair exists');
assert(typeof ui.showDamageNumber === 'function', 'showDamageNumber exists');

// --- Audio ---
const audio = new GameAudio();
assert(typeof audio.playKill === 'function', 'GameAudio.playKill exists');
assert(typeof audio.playHit === 'function', 'GameAudio.playHit exists');
assert(typeof audio.playHeadshot === 'function', 'GameAudio.playHeadshot exists');
// Safe no-op without AudioContext
audio.playKill();
audio.playHit();

// --- Particles killBurst ---
const scene = new THREE.Scene();
const ps = new ParticleSystem(scene);
assert(typeof ps.killBurst === 'function', 'ParticleSystem.killBurst exists');
assert(typeof ps.donutSparkle === 'function', 'donutSparkle exists');
const before = ps.particles.length;
ps.killBurst(new THREE.Vector3(0, 1, 0));
assert(ps.particles.length > before, 'killBurst spawns particles');

// --- Source wiring: hit path ---
assert(gameSrc.includes('showHitmarker'), 'Game.js references showHitmarker');
assert(gameSrc.includes('showHeadshot'), 'Game.js references showHeadshot');
assert(gameSrc.includes('playHit'), 'Game.js references playHit');
assert(gameSrc.includes('bloodPuff'), 'Game.js references bloodPuff');
assert(gameSrc.includes('hitPunch'), 'Game.js has hitPunch camera kick');
assert(
  /showHitmarker\s*\(/.test(gameSrc) && /_resolvePlayerShot/.test(gameSrc),
  'showHitmarker used on damage path'
);

// --- Source wiring: kill path ---
assert(gameSrc.includes('playKill'), 'Game.js references playKill');
assert(gameSrc.includes('showKillFlash'), 'Game.js references showKillFlash');
assert(gameSrc.includes('showKillConfirm'), 'Game.js references showKillConfirm');
assert(gameSrc.includes('killBurst') || gameSrc.includes('donutSparkle'), 'Game.js kill burst VFX');
assert(/_playerGotKill[\s\S]*playKill/.test(gameSrc), 'playKill called from _playerGotKill region');

// --- Method definitions present ---
assert(uiSrc.includes('lastHitmarkerAt'), 'UI tracks lastHitmarkerAt');
assert(uiSrc.includes('lastKillFlashAt'), 'UI tracks lastKillFlashAt');
assert(uiSrc.includes('showKillFlash'), 'UI has showKillFlash');
assert(audioSrc.includes('playKill()') || audioSrc.includes('playKill ()'), 'Audio defines playKill');
assert(particlesSrc.includes('killBurst'), 'Particles defines killBurst');

// Existing systems not gutted
assert(gameSrc.includes('addKillFeed'), 'kill feed still wired');
assert(gameSrc.includes('showStreak'), 'streak still wired');
assert(gameSrc.includes('donuts.spawn'), 'donut drop still wired');

const report = {
  ok: failures.length === 0,
  lastHitmarkerAt: ui.lastHitmarkerAt,
  lastKillFlashAt: ui.lastKillFlashAt,
  killParticles: ps.particles.length - before,
  failures,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: phase-a hit/kill feedback ok');
