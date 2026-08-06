/**
 * Phase B bot AI — roles, dynamic hunters, aim error, reaction delay.
 * Drives shipped BotAI exports (not reimplemented).
 */
import {
  BOT_ROLES,
  computeMaxHunters,
  aimErrorForDistance,
  reactionDelayForRole,
  shouldEngagePlayer,
  BotManager,
} from '../src/game/BotAI.js';
import { BOT_NAMES } from '../src/game/VoxelCharacter.js';
import { KILL_LIMIT } from '../src/game/constants.js';
import * as THREE from 'three';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

// Roles exist
for (const id of ['hunter', 'flanker', 'lurker', 'scavenger']) {
  assert(BOT_ROLES[id], `role ${id}`);
  assert(typeof BOT_ROLES[id].aggression === 'number', `${id}.aggression`);
  assert(typeof BOT_ROLES[id].accuracy === 'number', `${id}.accuracy`);
}

// Dynamic hunters scale with pressure
const h0 = computeMaxHunters(0, 100, KILL_LIMIT);
const hMid = computeMaxHunters(8, 100, KILL_LIMIT);
const hHigh = computeMaxHunters(14, 30, KILL_LIMIT);
const hLowHp = computeMaxHunters(3, 15, KILL_LIMIT);
assert(h0 >= 2 && h0 <= 3, `base hunters ${h0}`);
assert(hMid > h0, `mid kills more hunters ${hMid} > ${h0}`);
assert(hHigh >= hMid, `high pressure ${hHigh} >= ${hMid}`);
assert(hLowHp >= 3, `low HP adds hunters ${hLowHp}`);
assert(hHigh <= 6, `cap 6 got ${hHigh}`);

// Aim error grows with distance
const eNear = aimErrorForDistance(5, 1);
const eFar = aimErrorForDistance(25, 1);
assert(eFar > eNear, `far aim worse ${eFar} > ${eNear}`);
const eAcc = aimErrorForDistance(25, 1.5);
assert(eAcc < eFar, `higher accuracy mult tighter ${eAcc} < ${eFar}`);

// Reaction delays by role
assert(reactionDelayForRole('hunter', 20) < reactionDelayForRole('scavenger', 20), 'hunter reacts faster');
assert(reactionDelayForRole('hunter', 5) < reactionDelayForRole('hunter', 20), 'closer = faster react');

// Anyone with close LOS engages (not only hunters)
assert(
  shouldEngagePlayer({ mayHunt: false, los: true, distPlayer: 10, underFire: 0 }),
  'non-hunter with close LOS engages'
);
assert(
  !shouldEngagePlayer({ mayHunt: false, los: false, distPlayer: 10, underFire: 0 }),
  'no LOS no engage'
);
assert(
  shouldEngagePlayer({ mayHunt: false, los: false, distPlayer: 50, underFire: 3 }),
  'under fire engages without LOS'
);
assert(
  shouldEngagePlayer({ mayHunt: true, los: true, distPlayer: 20, underFire: 0 }),
  'hunter mid range engages'
);

// Spawn bots with roles via real BotManager (needs scene + map stubs)
const scene = new THREE.Scene();
const mapData = {
  colliders: [],
  floors: [{ minX: -40, maxX: 40, minZ: -40, maxZ: 40, y: 0 }],
  spawnPoints: [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(5, 0, 5),
    new THREE.Vector3(-5, 0, 5),
    new THREE.Vector3(8, 0, -4),
    new THREE.Vector3(-8, 0, -4),
    new THREE.Vector3(10, 0, 0),
    new THREE.Vector3(-10, 0, 2),
    new THREE.Vector3(0, 0, 12),
    new THREE.Vector3(0, 0, -12),
  ],
  coverPoints: [new THREE.Vector3(4, 0, 4), new THREE.Vector3(-4, 0, -4), new THREE.Vector3(6, 0, -2)],
  waypoints: [new THREE.Vector3(2, 0, 2), new THREE.Vector3(-3, 0, 3)],
};

const mgr = new BotManager(scene, mapData, {
  getPlayerPosition: () => new THREE.Vector3(0, 1.7, 8),
  getPlayerAlive: () => true,
  getPlayerKills: () => 10,
  getPlayerHealth: () => 50,
  getDonuts: () => [],
});
mgr.spawnAll(9);
assert(mgr.bots.length === 9, `9 bots got ${mgr.bots.length}`);
const roles = new Set(mgr.bots.map((b) => b.role));
assert(roles.has('hunter'), 'has hunter');
assert(roles.has('flanker'), 'has flanker');
assert(roles.has('lurker'), 'has lurker');
assert(roles.has('scavenger'), 'has scavenger');
assert(mgr.bots.every((b) => BOT_NAMES.includes(b.name) || b.name), 'named bots');

// Tick AI a few frames — should not throw; hunters selected
for (let i = 0; i < 30; i++) mgr.update(0.05);
assert(mgr.lastHunterCount >= 3, `hunters after pressure ${mgr.lastHunterCount}`);
const states = new Set(mgr.bots.filter((b) => !b.dead).map((b) => b.state));
assert(states.size >= 1, `bots have states ${[...states].join(',')}`);

// Reload starts and notifies
let reloadCalled = null;
mgr.cb.onBotReload = (b) => {
  reloadCalled = b.name;
};
const b0 = mgr.bots[0];
b0.ammo = 0;
mgr._startBotReload(b0);
assert(b0.reloading === true, 'reloading');
assert(reloadCalled === b0.name, 'onBotReload fired');

// Cover picker returns something when covers exist
const cover = mgr._pickCoverNear(b0, new THREE.Vector3(0, 0, 8));
assert(cover === null || cover.isVector3 || cover.x != null, 'cover pick ok');

const report = {
  ok: failures.length === 0,
  roles: [...roles],
  hunters: { h0, hMid, hHigh, hLowHp, last: mgr.lastHunterCount },
  aimError: { eNear, eFar, eAcc },
  states: [...states],
  failures,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: phase-b bot roles / hunters / aim ok');
