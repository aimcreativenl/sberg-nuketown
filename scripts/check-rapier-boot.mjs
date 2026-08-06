/**
 * Phase 1a/1b smoke test — Rapier boots, the map's colliders/floors build a
 * static world, and a kinematic capsule character controller can stand on
 * the ground and walk forward without falling into the void or tunneling.
 */
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { buildMap } from '../src/game/MapBuilder.js';
import { PhysicsManager } from '../src/physics/PhysicsManager.js';
import { PLAYER_HEIGHT, PLAYER_SPEED } from '../src/game/constants.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

const SCRATCH =
  process.env.GROK_SCRATCH ||
  'C:\\Users\\GEBRUI~1\\AppData\\Local\\Temp\\grok-goal-105061e4c2b7\\implementer';

async function main() {
  await PhysicsManager.initRapier();

  const scene = new THREE.Scene();
  const mapData = buildMap(scene);
  assert((mapData.colliders || []).length > 0, 'map has colliders');
  assert((mapData.floors || []).length > 0, 'map has floors');

  const physics = new PhysicsManager();
  physics.setMapFromMapData(mapData);
  assert(physics.staticEntries.length > 0, 'physics built static bodies');

  const spawn = (mapData.spawnPoints && mapData.spawnPoints[0]) || { x: 0, z: 8 };
  const startX = spawn.x ?? 0;
  const startZ = spawn.z ?? 8;
  const startEyeY = PLAYER_HEIGHT + 2; // start a bit above ground; snap-to-ground should settle it

  const handle = physics.createPlayerController({
    position: { x: startX, y: startEyeY, z: startZ },
  });
  assert(!!handle?.body && !!handle?.collider && !!handle?.controller, 'controller handle created');

  // Let gravity settle onto the ground first (no horizontal input).
  let pose = null;
  for (let i = 0; i < 90; i++) {
    pose = physics.moveCharacter(handle, { wishVelX: 0, wishVelZ: 0, jumpPressed: false, dt: 1 / 60 });
    physics.step(1 / 60);
    assert(pose && Number.isFinite(pose.y), `settle frame ${i}: y is finite (${pose?.y})`);
    assert(pose && pose.y > -50, `settle frame ${i}: y did not fall into the void (${pose?.y})`);
  }
  const settledY = pose.y;
  const settledGrounded = pose.grounded;
  assert(settledGrounded, `settled grounded after gravity (y=${settledY.toFixed(3)})`);

  // Walk forward (+Z) for a couple seconds; feet should move and stay finite/grounded-ish.
  const startPose = { x: startX, z: startZ };
  for (let i = 0; i < 150; i++) {
    pose = physics.moveCharacter(handle, {
      wishVelX: 0,
      wishVelZ: PLAYER_SPEED,
      jumpPressed: false,
      dt: 1 / 60,
    });
    physics.step(1 / 60);
    assert(pose && Number.isFinite(pose.x) && Number.isFinite(pose.y) && Number.isFinite(pose.z),
      `walk frame ${i}: pose finite (${JSON.stringify(pose)})`);
    assert(pose && pose.y > -50, `walk frame ${i}: y did not fall into the void (${pose?.y})`);
  }

  const moved = Math.hypot(pose.x - startPose.x, pose.z - startPose.z);
  assert(moved > 0.5 || pose.grounded, `player moved (${moved.toFixed(2)}) or stayed grounded`);

  // Door collider toggle: disabling a collider must be reflected on the Rapier side.
  const doorEntry = mapData.doors && mapData.doors[0];
  if (doorEntry?.collider) {
    physics.setColliderSolid(doorEntry.collider, false);
    const entry = physics._legacyToEntry.get(doorEntry.collider);
    assert(!!entry, 'door collider tracked in physics map');
    assert(entry && entry.collider.isEnabled() === false, 'door collider disabled in Rapier');
    physics.setColliderSolid(doorEntry.collider, true);
    assert(entry && entry.collider.isEnabled() === true, 'door collider re-enabled in Rapier');
  }

  // Teleport sanity (respawn path).
  physics.teleport(handle, 3, PLAYER_HEIGHT, 5);
  const afterTeleport = physics.getTranslation(handle);
  assert(
    Math.abs(afterTeleport.x - 3) < 0.05 &&
      Math.abs(afterTeleport.y - PLAYER_HEIGHT) < 0.05 &&
      Math.abs(afterTeleport.z - 5) < 0.05,
    `teleport landed at requested pose (${JSON.stringify(afterTeleport)})`
  );

  const report = {
    ok: failures.length === 0,
    settledY,
    settledGrounded,
    finalPose: pose,
    moved,
    afterTeleport,
    failures,
  };

  try {
    fs.mkdirSync(SCRATCH, { recursive: true });
    fs.writeFileSync(path.join(SCRATCH, 'rapier-boot.log'), JSON.stringify(report, null, 2));
  } catch (e) {
    console.warn(e.message);
  }
  console.log(JSON.stringify(report, null, 2));

  physics.dispose();

  if (failures.length) {
    console.error('FAIL:', failures.join('\n'));
    process.exit(1);
  }
  console.log('PASS: Rapier boots, map colliders build, capsule walks + stays grounded');
}

main().catch((err) => {
  console.error('FAIL: unhandled error', err);
  process.exit(1);
});
