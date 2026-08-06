/**
 * Phase 2a multiplayer combat sync + Phase 4 net polish — pure unit tests (no WebRTC / DOM).
 */
import * as THREE from 'three';
import {
  NET_MSG,
  SNAPSHOT_HZ,
  INPUT_HZ,
  LAG_COMP_MAX_MS,
  RECONCILE_EPS_XZ,
} from '../src/net/NetTypes.js';
import { sampleInputFrame, emptyInputFrame } from '../src/net/sampleInput.js';
import { NetPawn } from '../src/net/NetPawn.js';
import { InputHistory, residualError } from '../src/net/InputHistory.js';
import { PoseHistory, clampRewindMs } from '../src/net/PoseHistory.js';
import { PLAYER_HEIGHT } from '../src/game/constants.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

// ─── NET_MSG constants ────────────────────────────────────────────────
assert(NET_MSG.hello === 'hello', 'NET_MSG.hello');
assert(NET_MSG.input === 'input', 'NET_MSG.input');
assert(NET_MSG.snapshot === 'snapshot', 'NET_MSG.snapshot');
assert(NET_MSG.event === 'event', 'NET_MSG.event');
assert(SNAPSHOT_HZ === 20, `SNAPSHOT_HZ === 20 (got ${SNAPSHOT_HZ})`);
assert(INPUT_HZ === 30, `INPUT_HZ === 30 (got ${INPUT_HZ})`);

// ─── emptyInputFrame shape ─────────────────────────────────────────────
{
  const f = emptyInputFrame({ seq: 3, moveZ: -1 });
  assert(f.t === 'input', 'emptyInputFrame.t');
  assert(f.seq === 3, 'emptyInputFrame.seq override');
  assert(f.moveX === 0, 'emptyInputFrame.moveX default 0');
  assert(f.moveZ === -1, 'emptyInputFrame.moveZ override');
  assert(typeof f.yaw === 'number', 'emptyInputFrame.yaw');
  assert(typeof f.pitch === 'number', 'emptyInputFrame.pitch');
  assert(typeof f.jump === 'boolean', 'emptyInputFrame.jump');
  assert(typeof f.sprint === 'boolean', 'emptyInputFrame.sprint');
  assert(typeof f.fire === 'boolean', 'emptyInputFrame.fire');
  assert(typeof f.reload === 'boolean', 'emptyInputFrame.reload');
  assert(typeof f.interact === 'boolean', 'emptyInputFrame.interact');
  assert(typeof f.weaponSlot === 'number', 'emptyInputFrame.weaponSlot');
  assert(typeof f.aimHold === 'boolean', 'emptyInputFrame.aimHold');
}

// ─── sampleInputFrame from mock Player ─────────────────────────────────
{
  const player = {
    keys: new Set(['KeyW', 'ShiftLeft', 'Space']),
    buttons: { left: true, right: true },
    yaw: 0.5,
    pitch: -0.2,
    weaponIndex: 1,
    reloadPressed: false,
    usePressed: false,
    consumeReloadPress() {
      return false;
    },
    consumeUsePress() {
      return true;
    },
  };
  const frame = sampleInputFrame(player, { seq: 7, tick: 12, dt: 0.033, weaponSlot: 1 });
  assert(frame.seq === 7, 'sampleInputFrame.seq');
  assert(frame.tick === 12, 'sampleInputFrame.tick');
  assert(frame.moveZ === -1, `sampleInputFrame W → moveZ=-1 (got ${frame.moveZ})`);
  assert(frame.moveX === 0, 'sampleInputFrame moveX');
  assert(frame.sprint === true, 'sampleInputFrame sprint');
  assert(frame.jump === true, 'sampleInputFrame jump Space');
  assert(frame.fire === true, 'sampleInputFrame fire LMB');
  assert(frame.aimHold === true, 'sampleInputFrame aimHold RMB');
  assert(frame.interact === true, 'sampleInputFrame interact via consumeUsePress');
  assert(frame.yaw === 0.5, 'sampleInputFrame yaw');
  assert(frame.pitch === -0.2, 'sampleInputFrame pitch');
  assert(frame.weaponSlot === 1, 'sampleInputFrame weaponSlot');
}

// ─── NetPawn setInput ignores old seq ──────────────────────────────────
{
  const pawn = new NetPawn({
    id: 'p1',
    name: 'A',
    spawn: new THREE.Vector3(0, PLAYER_HEIGHT, 0),
  });
  pawn.setInput(emptyInputFrame({ seq: 2, moveZ: -1 }));
  assert(pawn.lastSeq === 2, 'setInput accepts seq 2');
  pawn.setInput(emptyInputFrame({ seq: 1, moveZ: 1 }));
  assert(pawn.lastSeq === 2, 'setInput ignores older seq 1');
  assert(pawn.lastInput.moveZ === -1, 'lastInput kept from seq 2');
  pawn.setInput(emptyInputFrame({ seq: 5, moveX: 1 }));
  assert(pawn.lastSeq === 5 && pawn.lastInput.moveX === 1, 'setInput accepts newer seq');
}

// ─── NetPawn stepMovement forward (moveZ=-1) ───────────────────────────
{
  const floorPad = {
    minX: -50,
    maxX: 50,
    minZ: -50,
    maxZ: 50,
    y: 0,
  };
  const pawn = new NetPawn({
    id: 'p2',
    name: 'Runner',
    spawn: new THREE.Vector3(0, PLAYER_HEIGHT, 0),
  });
  pawn.setInput(emptyInputFrame({ seq: 1, moveZ: -1, yaw: 0, pitch: 0 }));
  const z0 = pawn.position.z;
  const dt = 1 / 60;
  for (let i = 0; i < 30; i++) {
    pawn.stepMovement(dt, { colliders: [], floors: [floorPad] });
  }
  assert(
    pawn.position.z < z0 - 0.5,
    `stepMovement moveZ=-1 should move forward (−Z); z0=${z0.toFixed(3)} z=${pawn.position.z.toFixed(3)}`
  );
  assert(
    Math.abs(pawn.position.y - PLAYER_HEIGHT) < 0.05,
    `should stay on floor y≈${PLAYER_HEIGHT}, got ${pawn.position.y.toFixed(3)}`
  );
}

// ─── toSnap fields ─────────────────────────────────────────────────────
{
  const pawn = new NetPawn({
    id: 'snap1',
    name: 'Snap',
    team: 'alpha',
    spawn: new THREE.Vector3(1, PLAYER_HEIGHT, 2),
  });
  pawn.yaw = 0.3;
  pawn.pitch = -0.1;
  pawn.kills = 2;
  pawn.deaths = 1;
  pawn.weaponSlot = 1;
  pawn.aiming = true;
  const s = pawn.toSnap();
  assert(s.id === 'snap1', 'toSnap.id');
  assert(s.name === 'Snap', 'toSnap.name');
  assert(s.team === 'alpha', 'toSnap.team');
  assert(s.x === 1 && s.z === 2, 'toSnap.x/z');
  assert(typeof s.y === 'number', 'toSnap.y');
  assert(s.yaw === 0.3 && s.pitch === -0.1, 'toSnap look');
  assert(s.hp === 100 && s.alive === true, 'toSnap hp/alive');
  assert(s.kills === 2 && s.deaths === 1, 'toSnap k/d');
  assert(s.weapon === 1 && s.aiming === true, 'toSnap weapon/aiming');
  assert(typeof s.ackSeq === 'number', 'toSnap.ackSeq');
  assert(typeof s.outfitIndex === 'number', 'toSnap.outfitIndex');
}

// ─── Phase 4: InputHistory reconciliation helpers ─────────────────────
{
  const hist = new InputHistory(8);
  hist.push(1, { x: 0, y: 1.6, z: 0 });
  hist.push(2, { x: 1, y: 1.6, z: 0 });
  hist.push(3, { x: 2, y: 1.6, z: 0 });
  assert(hist.findAtOrBefore(2)?.x === 1, 'InputHistory.findAtOrBefore(2)');
  assert(hist.findAtOrBefore(9)?.seq === 3, 'InputHistory.findAtOrBefore past end');
  const err = residualError({ x: 2.5, y: 1.6, z: 0 }, hist.findAtOrBefore(3));
  assert(Math.abs(err.dx - 0.5) < 1e-6 && err.dxz > 0.4, 'residualError dx');
  hist.dropThrough(2);
  assert(hist.size === 1 && hist.findAtOrBefore(3)?.seq === 3, 'dropThrough keeps seq 3');
}

// ─── Phase 4: PoseHistory lag-comp sample ─────────────────────────────
{
  assert(LAG_COMP_MAX_MS === 150, 'LAG_COMP_MAX_MS');
  assert(RECONCILE_EPS_XZ > 0, 'RECONCILE_EPS_XZ');
  assert(clampRewindMs(500) === LAG_COMP_MAX_MS, 'clampRewindMs caps');
  assert(clampRewindMs(40) === 40, 'clampRewindMs passthrough');
  const ph = new PoseHistory(10);
  ph.push({ t: 1000, x: 0, y: 1.6, z: 0, yaw: 0, pitch: 0 });
  ph.push({ t: 1100, x: 10, y: 1.6, z: 0, yaw: 0, pitch: 0 });
  const mid = ph.sampleAt(1050);
  assert(mid && Math.abs(mid.x - 5) < 1e-6, `PoseHistory.sampleAt mid x≈5 got ${mid?.x}`);
}

// ─── Report ────────────────────────────────────────────────────────────
if (failures.length) {
  console.error('check-mp-sync FAILED:');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}
console.log(`check-mp-sync OK (${[
  'NET_MSG',
  'emptyInputFrame',
  'sampleInputFrame',
  'NetPawn.setInput',
  'NetPawn.stepMovement',
  'toSnap',
  'InputHistory',
  'PoseHistory',
].join(', ')})`);
