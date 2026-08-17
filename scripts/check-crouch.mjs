/**
 * Tap-C crouch toggle: shorter capsule, standing chest shot misses,
 * release does not stand, second tap stands unless a slab is overhead.
 */
import * as THREE from 'three';
import { Player } from '../src/game/Player.js';
import { playerPositionBlocked } from '../src/game/collision.js';
import { rayHitsSphere } from '../src/game/hitscan.js';
import { PLAYER_HEIGHT, PLAYER_CROUCH_HEIGHT, PLAYER_RADIUS } from '../src/game/constants.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

const cam = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
const mapData = { colliders: [], floors: [{ minX: -20, maxX: 20, minZ: -20, maxZ: 20, y: 0 }] };
const player = new Player(cam, mapData);
player.position.set(0, PLAYER_HEIGHT, 0);
player.velocity.set(0, 0, 0);
player.grounded = true;

const lowCover = {
  kind: 'cover',
  solid: true,
  box: new THREE.Box3(new THREE.Vector3(-1, 1.15, -1), new THREE.Vector3(1, 1.55, 1)),
};
const colliders = [lowCover];
const floors = mapData.floors;

const standVols = player.getHitSpheres();
const origin = { x: 0, y: standVols.chest.y, z: -4 };
const dir = { x: 0, y: 0, z: 1 };
assert(
  !!rayHitsSphere(origin, dir, standVols.chest, standVols.chest.radius),
  'standing chest ray hits'
);
assert(
  playerPositionBlocked({ x: 0, y: PLAYER_HEIGHT, z: 0 }, colliders, {
    height: PLAYER_HEIGHT,
    radius: PLAYER_RADIUS,
  }),
  'standing body overlaps low cover'
);

player.keys.add('KeyC');
player.update(1 / 60, colliders, floors, []);
assert(player.crouching === true, 'first C tap crouches');
assert(player.height === PLAYER_CROUCH_HEIGHT, `crouch height ${player.height}`);
assert(
  Math.abs(player.position.y - PLAYER_CROUCH_HEIGHT) < 0.05,
  `crouch eye ~${PLAYER_CROUCH_HEIGHT} got ${player.position.y}`
);

player.keys.delete('KeyC');
player.update(1 / 60, colliders, floors, []);
assert(player.crouching === true, 'releasing C stays crouched');
assert(player.height === PLAYER_CROUCH_HEIGHT, 'release does not restore stand height');

const crouchVols = player.getHitSpheres();
assert(
  !rayHitsSphere(origin, dir, crouchVols.head, crouchVols.head.radius),
  'same standing-chest ray misses crouched head'
);
assert(
  !rayHitsSphere(origin, dir, crouchVols.chest, crouchVols.chest.radius),
  'same standing-chest ray misses crouched chest'
);
assert(
  !playerPositionBlocked({ x: 0, y: player.position.y, z: 0 }, colliders, {
    height: player.height,
    radius: PLAYER_RADIUS,
  }),
  'crouched body fits under low cover'
);

player.keys.add('KeyC');
player.update(1 / 60, colliders, floors, []);
assert(player.crouching === true, 'second C under low cover stays crouched');
assert(player.height === PLAYER_CROUCH_HEIGHT, 'blocked stand keeps crouch height');

player.keys.delete('KeyC');
player.update(1 / 60, [], floors, []);
player.position.set(8, PLAYER_CROUCH_HEIGHT, 8);
player.keys.add('KeyC');
player.update(1 / 60, [], floors, []);
assert(player.crouching === false, 'second C in the open stands');
assert(player.height === PLAYER_HEIGHT, `stand height ${player.height}`);
assert(
  Math.abs(player.position.y - PLAYER_HEIGHT) < 0.05,
  `stand eye ~${PLAYER_HEIGHT} got ${player.position.y}`
);

player.keys.delete('KeyC');
player.update(1 / 60, [], floors, []);
assert(player.crouching === false, 'releasing C after stand stays standing');

const report = {
  ok: failures.length === 0,
  standChestY: standVols.chest.y,
  crouchEye: PLAYER_CROUCH_HEIGHT,
  crouchChestY: crouchVols.chest.y,
  failures,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: C toggles crouch, release does not stand, blocked stand stays down');
