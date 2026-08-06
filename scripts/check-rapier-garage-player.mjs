/**
 * End-to-end: real Player.js + Rapier walks the west garage climb onto the roof,
 * then continues toward the main-roof climb chain (smoke — not full main roof).
 */
import * as THREE from 'three';
import { buildMap } from '../src/game/MapBuilder.js';
import { Player } from '../src/game/Player.js';
import { PhysicsManager } from '../src/physics/PhysicsManager.js';
import { PLAYER_HEIGHT } from '../src/game/constants.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

await PhysicsManager.initRapier();
const scene = new THREE.Scene();
const mapData = buildMap(scene);
const physics = new PhysicsManager();
physics.setMapFromMapData(mapData);

const cam = new THREE.PerspectiveCamera();
const player = new Player(cam, mapData);
player.setPhysics(physics);

// Approach west garage climb from -Z (pads run +Z).
physics.teleport(player._rapier, -27.55, PLAYER_HEIGHT + 0.05, -2.6);
player.position.set(-27.55, PLAYER_HEIGHT + 0.05, -2.6);
player.velocity.set(0, 0, 0);
player.grounded = true;
player.yaw = Math.PI; // +Z
player.keys.add('KeyW');

let maxFeet = 0;
let boarded = false;
for (let i = 0; i < 500; i++) {
  const feet = player.position.y - PLAYER_HEIGHT;
  maxFeet = Math.max(maxFeet, feet);
  if (feet >= 2.7) {
    // Turn toward garage deck (+X for west house)
    player.yaw = -Math.PI / 2;
  }
  player.update(1 / 60, mapData.colliders, mapData.floors, []);
  physics.step(1 / 60);
  if (feet >= 2.85 && player.position.x > -26.2) boarded = true;
}

assert(maxFeet >= 2.8, `Player+Rapier garage climb maxFeet=${maxFeet.toFixed(2)}`);
assert(boarded, 'Player boarded garage roof deck');

const report = { ok: failures.length === 0, maxFeet, boarded, failures };
console.log(JSON.stringify(report, null, 2));
physics.dispose();
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: Player.js Rapier garage climb + roof board');
