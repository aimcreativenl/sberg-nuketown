/**
 * Phase 1c smoke test — the real `Player.js` update() loop driven through the
 * Rapier character controller (not just the raw `PhysicsManager` API):
 * stair autostep, door open/close mirrored into Rapier, and respawn teleport.
 */
import * as THREE from 'three';
import { buildMap, HOUSE_X } from '../src/game/MapBuilder.js';
import { Player } from '../src/game/Player.js';
import { DoorManager } from '../src/game/Doors.js';
import { PhysicsManager } from '../src/physics/PhysicsManager.js';
import { PLAYER_HEIGHT, PLAYER_CROUCH_HEIGHT } from '../src/game/constants.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

async function main() {
  await PhysicsManager.initRapier();
  const scene = new THREE.Scene();
  const mapData = buildMap(scene);
  const physics = new PhysicsManager();
  physics.setMapFromMapData(mapData);

  const doors = new DoorManager(mapData.doors || [], {
    onSolidChange: (collider, solid) => physics.setColliderSolid(collider, solid),
  });

  const cam = new THREE.PerspectiveCamera();
  const player = new Player(cam, mapData);
  player.position.set(0, PLAYER_HEIGHT, 8);
  player.setPhysics(physics);
  assert(!!player._rapier, 'player got a rapier controller handle from setPhysics()');

  // Settle onto flat ground.
  for (let i = 0; i < 40; i++) {
    player.update(1 / 60, mapData.colliders, mapData.floors, []);
    physics.step(1 / 60);
  }
  assert(player.grounded, 'player grounded on flat ground via Rapier');
  const flatFeet = player.position.y - PLAYER_HEIGHT;
  assert(Math.abs(flatFeet) < 0.3, `feet settle near y=0 got ${flatFeet.toFixed(2)}`);

  // Walk up the west house stairs, starting just in front of the first riser (a real
  // player never spawns embedded in stair-tread geometry — unlike the legacy per-axis
  // resolver, Rapier's real 3D collider would treat that as deep penetration).
  const stairX = -HOUSE_X - 3.35;
  const stairApproachZ = -4.2;
  physics.teleport(player._rapier, stairX, PLAYER_HEIGHT + 0.25, stairApproachZ);
  player.position.set(stairX, PLAYER_HEIGHT + 0.25, stairApproachZ);
  player.velocity.set(0, 0, 0);
  player.grounded = true;
  player.yaw = Math.PI; // forward = (-sin(pi),0,-cos(pi)) = (0,0,1) -> +Z, matches stair run
  player.keys.add('KeyW');
  let maxFeet = 0;
  for (let i = 0; i < 240; i++) {
    player.update(1 / 60, mapData.colliders, mapData.floors, []);
    physics.step(1 / 60);
    maxFeet = Math.max(maxFeet, player.position.y - PLAYER_HEIGHT);
    assert(Number.isFinite(player.position.y), `stair frame ${i}: y finite`);
  }
  assert(maxFeet >= 2.8, `stair autostep (0.55) climbed to L2 (~3.2), maxFeet=${maxFeet.toFixed(2)}`);
  player.keys.delete('KeyW');

  // Door open/close must mirror into the Rapier collider's enabled state.
  // (Re-solidifying on close is driven by the swing-close animation in `update()`,
  // same as the legacy `collider.solid` flag — not instantaneous on toggle().)
  const door = doors.doors[0];
  assert(!!door?.collider, 'map has at least one door with a collider');
  doors.toggle(door);
  assert(door.open === true, 'door reports open after toggle');
  const entry = physics._legacyToEntry.get(door.collider);
  assert(!!entry, 'door collider tracked by physics');
  assert(entry && entry.collider.isEnabled() === false, 'door collider disabled in Rapier when opened');
  doors.toggle(door);
  assert(door.open === false, 'door reports closed after second toggle');
  for (let i = 0; i < 60; i++) doors.update(1 / 60); // let the swing-close animation finish
  assert(entry && entry.collider.isEnabled() === true, 'door collider re-enabled in Rapier once closed');

  // fullMatchReset must teleport the Rapier capsule too (not just this.position).
  player.fullMatchReset(new THREE.Vector3(5, PLAYER_HEIGHT, 5));
  const t = physics.getTranslation(player._rapier);
  assert(
    Math.abs(t.x - 5) < 0.05 && Math.abs(t.z - 5) < 0.05,
    `fullMatchReset teleported the rapier body (${JSON.stringify(t)})`
  );

  // Tap-C must resize the live capsule (setHalfHeight) then stand again without WASM abort.
  // (5,5) sits inside mid-yard props — use the default open spawn.
  player.fullMatchReset(new THREE.Vector3(0, PLAYER_HEIGHT, 8));
  player.keys.add('KeyC');
  player.update(1 / 60, mapData.colliders, mapData.floors, []);
  physics.step(1 / 60);
  assert(player.crouching === true, 'rapier: first C crouches');
  assert(
    Math.abs(player._rapier.height - PLAYER_CROUCH_HEIGHT) < 0.05,
    `rapier capsule crouch height ${player._rapier.height}`
  );
  player.keys.delete('KeyC');
  player.update(1 / 60, mapData.colliders, mapData.floors, []);
  physics.step(1 / 60);
  assert(player.crouching === true, 'rapier: releasing C stays crouched');
  player.keys.add('KeyW');
  for (let i = 0; i < 20; i++) {
    player.update(1 / 60, mapData.colliders, mapData.floors, []);
    physics.step(1 / 60);
    assert(Number.isFinite(player.position.y), `crouch-walk frame ${i} finite`);
  }
  player.keys.delete('KeyW');
  player.keys.add('KeyC');
  player.update(1 / 60, mapData.colliders, mapData.floors, []);
  physics.step(1 / 60);
  assert(player.crouching === false, 'rapier: second C stands');
  assert(
    Math.abs(player._rapier.height - PLAYER_HEIGHT) < 0.05,
    `rapier capsule stand height ${player._rapier.height}`
  );
  for (let i = 0; i < 20; i++) {
    player.update(1 / 60, mapData.colliders, mapData.floors, []);
    physics.step(1 / 60);
    assert(Number.isFinite(player.position.y), `post-stand frame ${i} finite`);
  }

  const report = { ok: failures.length === 0, flatFeet, maxFeet, failures };
  console.log(JSON.stringify(report, null, 2));
  physics.dispose();

  if (failures.length) {
    console.error('FAIL:', failures.join('\n'));
    process.exit(1);
  }
  console.log('PASS: Player.js Rapier integration (stairs autostep, doors, reset teleport)');
}

main().catch((err) => {
  console.error('FAIL: unhandled error', err);
  process.exit(1);
});
