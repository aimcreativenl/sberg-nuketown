/**
 * Task 4 bot locomotion regression:
 * real BotManager movement must accelerate and brake instead of snapping.
 */
import * as THREE from 'three';
import { BotManager } from '../src/game/BotAI.js';

const failures = [];
function assert(condition, message) {
  if (!condition) failures.push(message);
}

const scene = new THREE.Scene();
let playerPosition = new THREE.Vector3(0, 1.7, 30.8);
const mapData = {
  colliders: [],
  floors: [{ minX: -40, maxX: 40, minZ: -40, maxZ: 40, y: 0 }],
  spawnPoints: [new THREE.Vector3(0, 0, 0)],
  coverPoints: [],
  waypoints: [],
};
const manager = new BotManager(scene, mapData, {
  getPlayerPosition: () => playerPosition,
  getPlayerAlive: () => true,
  getPlayerKills: () => 0,
  getPlayerHealth: () => 100,
  getDonuts: () => [],
});
manager.spawnAll(1);

const bot = manager.bots[0];
bot.position.set(0, 0, 0);
bot.lastPos.copy(bot.position);
bot._prevPos.copy(bot.position);
bot.character.mesh.position.copy(bot.position);
const start = bot.position.clone();
const dt = 0.05;
const chaseSamples = [];

for (let frame = 0; frame < 8; frame += 1) {
  manager.update(dt);
  chaseSamples.push(bot.moveSpeed);
}

// A hunter chasing this reachable target sprints at about 7 m/s. A movement
// snap would make the first sample full speed; steering must build toward it.
const targetSpeed = 7;
assert(chaseSamples[0] > 0.01, `first chase sample moves (${chaseSamples[0].toFixed(3)})`);
assert(
  chaseSamples[0] < targetSpeed * 0.65,
  `first chase sample accelerates below target (${chaseSamples[0].toFixed(3)})`
);
assert(
  chaseSamples[1] > chaseSamples[0],
  `second chase sample accelerates (${chaseSamples[1].toFixed(3)} > ${chaseSamples[0].toFixed(3)})`
);
assert(
  chaseSamples.at(-1) > targetSpeed * 0.85,
  `later chase sample approaches target (${chaseSamples.at(-1).toFixed(3)})`
);
assert(
  bot.position.distanceTo(start) > 0.5,
  `reachable movement changes position (${bot.position.distanceTo(start).toFixed(3)})`
);

// Pin the bot at its active cover point: the state machine now requests no
// horizontal travel, so velocity must decelerate over frames instead of zeroing.
bot.underFire = 2;
bot.coverPoint = bot.position.clone();
bot.peekState = 'hide';
bot.peekTimer = 10;
bot.repathTimer = 10;
const stopSamples = [];
for (let frame = 0; frame < 6; frame += 1) {
  manager.update(dt);
  stopSamples.push(bot.moveSpeed);
}

assert(
  stopSamples[0] > 0.15,
  `first stop sample retains decaying speed (${stopSamples[0].toFixed(3)})`
);
assert(
  stopSamples[1] < stopSamples[0],
  `stop speed decays (${stopSamples[1].toFixed(3)} < ${stopSamples[0].toFixed(3)})`
);
assert(
  stopSamples.at(-1) > 0 && stopSamples.at(-1) < stopSamples[0],
  `later stop sample continues decaying (${stopSamples.at(-1).toFixed(3)})`
);

manager.clear();
const report = { ok: failures.length === 0, chaseSamples, stopSamples, failures };
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: bot locomotion accelerates, decelerates, and advances');
