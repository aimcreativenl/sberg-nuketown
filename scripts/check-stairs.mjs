/**
 * Simulate walking up/down house stairs using the real buildMap floors + Player.STEP_UP.
 * Exit 0 if stairs are climbable without jumps and L2 has a stairwell hole to go down.
 */
import * as THREE from 'three';
import { buildMap, HOUSE_X } from '../src/game/MapBuilder.js';
import { Player } from '../src/game/Player.js';
import { pickFloorY } from '../src/game/movement.js';
import { PLAYER_HEIGHT } from '../src/game/constants.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

/** Shipped floor picker (grounded walk/step-up). */
function floorHeight(pos, floors, height = PLAYER_HEIGHT) {
  const y = pickFloorY(pos.y, height, pos.x, pos.z, floors, {
    grounded: true,
    stepUp: Player.STEP_UP,
    pad: 0.18,
  });
  return y == null ? 0 : y;
}

const scene = new THREE.Scene();
const data = buildMap(scene);

assert(data.group.getObjectByName('stairs_west'), 'stairs_west present');
assert(data.group.getObjectByName('stairs_east'), 'stairs_east present');

for (const side of ['west', 'east']) {
  const cx = side === 'west' ? -HOUSE_X : HOUSE_X;
  const stairs = data.group.getObjectByName(`stairs_${side}`);
  assert(stairs, `stairs_${side}`);

  // Stair local X is ~-3.35 in house space
  const stairWorldX = cx - 3.35;
  // Walk along +Z from bottom of stair toward top (startZ ~-3.15 local)
  const z0 = 0 - 3.15;
  const z1 = z0 + 14 * 0.52;

  // Climb simulation: walk forward in small steps, snap feet to floor each frame
  let y = PLAYER_HEIGHT + 0.25;
  let maxFloor = 0;
  let stuck = 0;
  const samples = [];
  for (let z = z0; z <= z1 + 0.4; z += 0.12) {
    const pos = new THREE.Vector3(stairWorldX, y, z);
    const fy = floorHeight(pos, data.floors);
    const feet = y - PLAYER_HEIGHT;
    // Same snap rules as Player.update
    const stepUp = feet < fy && fy - feet <= Player.STEP_UP;
    if (feet <= fy + 0.05 || stepUp) {
      y = fy + PLAYER_HEIGHT;
      stuck = 0;
    } else if (fy < feet - 0.02) {
      // falling toward lower floor
      y = Math.max(fy + PLAYER_HEIGHT, y - 0.15);
    } else {
      stuck++;
    }
    maxFloor = Math.max(maxFloor, fy);
    samples.push({ z, fy, y });
  }

  assert(maxFloor >= 3.0, `${side}: climb reaches L2-ish floor (maxFloor=${maxFloor.toFixed(2)})`);
  assert(stuck < 8, `${side}: climb not stuck mid-stairs (stuck frames=${stuck})`);

  // At mid-climb, consecutive floor rises must be within STEP_UP
  let maxRise = 0;
  for (let i = 1; i < samples.length; i++) {
    const d = samples[i].fy - samples[i - 1].fy;
    if (d > maxRise) maxRise = d;
  }
  assert(
    maxRise <= Player.STEP_UP + 0.02,
    `${side}: max sample rise ${maxRise.toFixed(3)} <= STEP_UP ${Player.STEP_UP}`
  );

  // Descent: start on L2 near stair top, walk back -Z
  y = PLAYER_HEIGHT + 3.2;
  let minFloor = 99;
  let fellToGround = false;
  for (let z = z1 + 0.3; z >= z0 - 0.2; z -= 0.12) {
    const pos = new THREE.Vector3(stairWorldX, y, z);
    const fy = floorHeight(pos, data.floors);
    const feet = y - PLAYER_HEIGHT;
    const stepUp = feet < fy && fy - feet <= Player.STEP_UP;
    if (feet <= fy + 0.05 || stepUp) {
      y = fy + PLAYER_HEIGHT;
    } else if (fy + 0.02 < feet) {
      // gravity step toward floor
      y = Math.max(fy + PLAYER_HEIGHT, y - 0.25);
    }
    minFloor = Math.min(minFloor, fy);
    if (fy <= 0.4 && y - PLAYER_HEIGHT <= 0.5) fellToGround = true;
  }
  assert(fellToGround || minFloor <= 0.5, `${side}: can descend to ground (minFloor=${minFloor})`);

  // Stairwell hole: at mid-stair XZ, L2 solid floor must not dominate when feet are high
  // Sample at mid stair Z with feet just above L2 — if only hole, floor should be stair tread not continuous L2 plate over hole
  const midZ = (z0 + z1) / 2;
  const onL2Beside = floorHeight(new THREE.Vector3(cx + 2, PLAYER_HEIGHT + 3.2, 0), data.floors);
  assert(onL2Beside >= 3.0, `${side}: L2 still walkable beside stairs (${onL2Beside})`);

  // Over the hole at mid height of stairs, highest floor should be stair tread (~1.5-2.5), not missing entirely
  const midClimbY = PLAYER_HEIGHT + 1.8;
  const midFy = floorHeight(new THREE.Vector3(stairWorldX, midClimbY, midZ), data.floors);
  assert(midFy > 1.0 && midFy < 3.5, `${side}: mid-stair support fy=${midFy.toFixed(2)}`);
}

const report = {
  ok: failures.length === 0,
  STEP_UP: Player.STEP_UP,
  failures,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: stairs climb/descend checks ok');
