/**
 * Structural checks: leg pivots at hip height, walk cycle while aiming,
 * BotAI does not freeze legs on aim.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import { BotManager } from '../src/game/BotAI.js';
import { VoxelCharacter } from '../src/game/VoxelCharacter.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

const char = new VoxelCharacter({ name: 'TEST', outfitIndex: 0 });
// Hip joints must be near hip height (~0.95), not ground (0)
assert(Math.abs(char.hipL.position.y - 0.95) < 0.05, `hipL.y ~0.95 got ${char.hipL.position.y}`);
assert(Math.abs(char.hipR.position.y - 0.95) < 0.05, `hipR.y ~0.95 got ${char.hipR.position.y}`);
assert(char.legL.position.y < 0, 'leg hangs down from hip');
assert(char.footL, 'footL exists');

// Simulate walk while aiming — legs must swing
const phases = [];
for (let i = 0; i < 20; i++) {
  char.updateAnimation(0.05, {
    moving: true,
    sprinting: false,
    moveSpeed: 4.0,
    grounded: true,
    aiming: true,
    reloading: false,
  });
  phases.push(char.hipL.rotation.x);
}
const variance = Math.max(...phases) - Math.min(...phases);
assert(variance > 0.35, `leg swing while aiming variance ${variance.toFixed(3)} > 0.35`);

// Idle while not moving — small motion only
const idle = [];
const c2 = new VoxelCharacter({ name: 'IDLE', outfitIndex: 1 });
for (let i = 0; i < 15; i++) {
  c2.updateAnimation(0.05, { moving: false, moveSpeed: 0, grounded: true, aiming: false });
  idle.push(c2.hipL.rotation.x);
}
const idleVar = Math.max(...idle) - Math.min(...idle);
assert(idleVar < 0.2, `idle leg variance small ${idleVar.toFixed(3)}`);

// Legacy vaulting must reach VoxelCharacter as airborne in both the normal
// animation call and the same-frame post-shot animation refresh.
const airborneScene = new THREE.Scene();
const airborneManager = new BotManager(
  airborneScene,
  {
    colliders: [],
    floors: [{ minX: -20, maxX: 20, minZ: -20, maxZ: 20, y: 0 }],
    spawnPoints: [new THREE.Vector3(0, 0, 0)],
    waypoints: [new THREE.Vector3(0, 0, 10)],
    coverPoints: [],
  },
  {
    getPlayerPosition: () => new THREE.Vector3(0, 1.7, 10),
    getPlayerAlive: () => true,
    getPlayerKills: () => 0,
    getPlayerHealth: () => 100,
    getDonuts: () => [],
  }
);
airborneManager.spawnAll(1);
const airborneBot = airborneManager.bots[0];
airborneBot.position.set(0, 2, 0);
airborneBot.lastPos.copy(airborneBot.position);
airborneBot._prevPos.copy(airborneBot.position);
airborneBot.character.mesh.position.copy(airborneBot.position);
airborneBot.vaulting = true;
airborneBot.grounded = false;
airborneBot.velY = 0;
airborneBot.airMoveZ = 5;
airborneBot.peekState = 'shoot';
airborneBot.losTimer = 1;
airborneBot.aimTimer = 1;
airborneBot.fireCooldown = 0;
airborneBot.ammo = 3;
airborneBot.character.animPhase = 0;
airborneBot.character._moveBlend = 0;
airborneManager.update(0.05);
assert(!airborneBot.grounded, 'legacy vault remains airborne during animation update');
assert(airborneBot.fireCooldown > 0, 'airborne bot fires so post-shot animation refresh runs');
assert(
  airborneBot.character.hipL.rotation.x < -0.15,
  `airborne vault uses VoxelCharacter air pose (${airborneBot.character.hipL.rotation.x.toFixed(3)})`
);
airborneManager.clear();

// Source guards: BotAI must not pass moving && !aiming
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const botSrc = fs.readFileSync(path.join(__dirname, '../src/game/BotAI.js'), 'utf8');
assert(!botSrc.includes('moving: moving && !aiming'), 'BotAI must not freeze legs when aiming');
assert(botSrc.includes('moveSpeed'), 'BotAI passes moveSpeed');
assert(botSrc.includes('lerpAngle'), 'BotAI smooths yaw');
assert(botSrc.includes('BOT_STRAFE'), 'continuous combat strafe speed');

const report = { ok: failures.length === 0, legSwingWhileAiming: variance, failures };
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: bot locomotion / Luckey walk checks ok');
