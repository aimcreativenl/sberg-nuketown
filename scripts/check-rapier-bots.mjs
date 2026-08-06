/**
 * Phase 1d: bots share Rapier character controllers with the player.
 * - Controllers spawn with setPhysics + spawnAll
 * - Ground settle without falling through the map
 * - Capsules do not tunnel a solid house wall
 * - Death disables collider; respawn re-enables + teleports
 */
import * as THREE from 'three';
import { buildMap, HOUSE_X } from '../src/game/MapBuilder.js';
import { BotManager } from '../src/game/BotAI.js';
import { PhysicsManager } from '../src/physics/PhysicsManager.js';
import { BOT_BODY_HEIGHT } from '../src/game/collision.js';
import { USE_RAPIER_BOTS } from '../src/game/constants.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

assert(USE_RAPIER_BOTS === true, 'USE_RAPIER_BOTS should be enabled');

await PhysicsManager.initRapier();
const scene = new THREE.Scene();
const mapData = buildMap(scene);
const physics = new PhysicsManager();
physics.setMapFromMapData(mapData);

const bots = new BotManager(scene, mapData, {
  getPlayerPosition: () => null,
  getPlayerAlive: () => false,
  getDonuts: () => [],
});
bots.setPhysics(physics);
bots.spawnAll(4);

assert(bots.bots.length === 4, `spawned ${bots.bots.length}`);
for (const bot of bots.bots) {
  assert(!!bot._rapier, `${bot.name} missing Rapier handle`);
  assert(bot._rapier.collider.isEnabled(), `${bot.name} collider should start enabled`);
}

function syncFeetFromRapier(bot) {
  const t = physics.getTranslation(bot._rapier);
  bot.position.set(t.x, t.y - BOT_BODY_HEIGHT, t.z);
  bot.grounded = !!bot._rapier.grounded;
}

// Settle on ground via BotManager idle Rapier settle
for (let i = 0; i < 60; i++) {
  bots.update(1 / 60);
  physics.step(1 / 60);
}
for (const bot of bots.bots) {
  assert(bot.grounded, `${bot.name} should be grounded after settle`);
  assert(bot.position.y > -0.15 && bot.position.y < 0.6, `${bot.name} feet y=${bot.position.y}`);
}

// Direct Rapier drive on open mid-map ground (bypass AI state machine)
const walker = bots.bots[0];
physics.teleport(walker._rapier, 0, BOT_BODY_HEIGHT + 0.05, -18);
syncFeetFromRapier(walker);
const startX = walker.position.x;
for (let i = 0; i < 120; i++) {
  physics.moveCharacter(walker._rapier, {
    wishVelX: 5,
    wishVelZ: 0,
    jumpPressed: false,
    dt: 1 / 60,
  });
  physics.step(1 / 60);
  syncFeetFromRapier(walker);
}
assert(
  walker.position.x > startX + 2.5,
  `walker should advance +X (start ${startX.toFixed(2)} end ${walker.position.x.toFixed(2)})`
);
assert(walker.position.y > -0.15, `walker should not fall through (y=${walker.position.y})`);
assert(walker.grounded, 'walker should stay grounded on grass');

// Push into west house outer wall — must not tunnel past wall face
const wallBot = bots.bots[1];
const outerWallX = -HOUSE_X - 5.5; // W/2 = 5.5
physics.teleport(wallBot._rapier, outerWallX + 1.4, BOT_BODY_HEIGHT + 0.05, 0);
syncFeetFromRapier(wallBot);
for (let i = 0; i < 90; i++) {
  physics.moveCharacter(wallBot._rapier, {
    wishVelX: -6,
    wishVelZ: 0,
    jumpPressed: false,
    dt: 1 / 60,
  });
  physics.step(1 / 60);
  syncFeetFromRapier(wallBot);
}
assert(
  wallBot.position.x > outerWallX + 0.3,
  `wallBot must not tunnel outer wall (x=${wallBot.position.x.toFixed(2)}, wall≈${outerWallX})`
);

// Death disables collider; respawn restores
const victim = bots.bots[2];
bots.damageBot(victim.id, 999, { isPlayer: true });
assert(victim.dead, 'victim should be dead');
assert(!victim._rapier.collider.isEnabled(), 'dead bot collider disabled');
victim.deadTimer = 0;
bots.respawnBot(victim);
assert(!victim.dead, 'victim respawned');
assert(victim._rapier.collider.isEnabled(), 'respawned collider enabled');
const eye = physics.getTranslation(victim._rapier);
assert(
  Math.abs(eye.x - victim.position.x) < 0.05 &&
    Math.abs(eye.z - victim.position.z) < 0.05 &&
    Math.abs(eye.y - (victim.position.y + BOT_BODY_HEIGHT)) < 0.15,
  'respawn eye pose matches feet+height'
);

bots.clear();
assert(bots.bots.length === 0, 'clear empties bots');
physics.dispose();

const report = { ok: failures.length === 0, failures };
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: Rapier bots (spawn, move, wall block, death/respawn)');
