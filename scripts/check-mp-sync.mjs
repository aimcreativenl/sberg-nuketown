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
import { PLAYER_HEIGHT, PLAYER_MAX_HP, KILL_LIMIT } from '../src/game/constants.js';
import { MpMatch } from '../src/net/MpMatch.js';
import { MODE_TDM } from '../src/modes/tdm.js';
import { MODE_CTF, FLAG_HOMES, FLAG_STATE } from '../src/modes/ctf.js';
import { MODE_PUBG, BR_ZONE } from '../src/modes/pubg.js';
import { getModeById } from '../src/modes/registry.js';

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

{
  const player = {
    keys: new Set(),
    buttons: { left: false, right: false },
    yaw: 0,
    pitch: 0,
    shootClicks: 1,
  };
  const frame = sampleInputFrame(player, { seq: 1, tick: 1, dt: 0.016, peek: true });
  assert(frame.fire === true, 'look-pad tap shootClicks counts as MP fire');
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

function makeMatch(mode, players) {
  const sent = [];
  const match = new MpMatch({
    session: { sendGame(msg) { sent.push(msg); } },
    isHost: true,
    localId: 'host',
    mode,
  });
  match.begin(
    { players },
    [new THREE.Vector3(-10, PLAYER_HEIGHT, 0), new THREE.Vector3(10, PLAYER_HEIGHT, 0)]
  );
  match._sent = sent;
  return match;
}

// ─── Phase 3: TDM team score / win / friendly fire ─────────────────────
{
  const match = makeMatch(MODE_TDM, [
    { id: 'a', name: 'Ada', team: 'alpha' },
    { id: 'b', name: 'Bob', team: 'bravo' },
  ]);
  assert(match.pawns.get('a').position.x <= 0, 'tdm alpha spawn −X');
  assert(match.pawns.get('b').position.x > 0, 'tdm bravo spawn +X');
  assert(match.pawns.get('a').outfitIndex === 3, 'tdm alpha outfit');
  assert(match.pawns.get('b').outfitIndex === 4, 'tdm bravo outfit');

  const ada = match.pawns.get('a');
  ada.kills = 20;
  match.teamKills = { alpha: 5, bravo: 3 };
  match._maybeEndMatch(ada);
  assert(!match._matchEnded, 'tdm does not end on personal 20 kills');

  match.teamKills.alpha = 19;
  MODE_TDM.onKill(match, ada);
  assert(match.teamKills.alpha === 20, 'tdm onKill increments teamKills');
  match._maybeEndMatch(ada);
  assert(match._matchEnded, 'tdm ends at team score limit');
  const endEv = match._pendingEvents.find((e) => e.kind === 'match_end');
  assert(endEv?.extra?.winnerTeam === 'alpha', 'tdm match_end winnerTeam alpha');
}

{
  const dm = makeMatch(getModeById('deathmatch'), [
    { id: 'a', name: 'Ada' },
    { id: 'b', name: 'Bob' },
  ]);
  const ada = dm.pawns.get('a');
  ada.kills = KILL_LIMIT;
  dm._maybeEndMatch(ada);
  assert(dm._matchEnded, 'deathmatch still ends on personal kill limit');
}

{
  const match = makeMatch(MODE_TDM, [
    { id: 'a', name: 'Ada', team: 'alpha' },
    { id: 'b', name: 'Bob', team: 'alpha' },
  ]);
  const a = match.pawns.get('a');
  const b = match.pawns.get('b');
  a.position.set(0, PLAYER_HEIGHT, 0);
  b.position.set(0, PLAYER_HEIGHT, -2);
  a.yaw = 0;
  a.pitch = 0;
  a.lastInput = { fire: true, seq: 1 };
  a._fireCd = 0;
  const hp = b.health;
  match._hostCombat(0.016, { shotBlocked: () => false });
  assert(b.health === hp, 'tdm friendly fire off');
  assert(match.teamKills.alpha === 0, 'tdm FF shot does not score');
}

{
  const match = makeMatch(MODE_TDM, [
    { id: 'a', name: 'Ada', team: 'alpha' },
    { id: 'b', name: 'Bob', team: 'bravo' },
  ]);
  const a = match.pawns.get('a');
  const b = match.pawns.get('b');
  a.position.set(0, PLAYER_HEIGHT, 0);
  b.position.set(0, PLAYER_HEIGHT, -2);
  a.yaw = 0;
  a.pitch = 0;
  a.lastInput = { fire: true, seq: 1 };
  a._fireCd = 0;
  match._hostCombat(0.016, { shotBlocked: () => false });
  assert(b.health < PLAYER_MAX_HP, `tdm enemy shot deals damage (hp=${b.health})`);
  assert(match.teamKills.alpha >= 1 || !b.alive || b.health < PLAYER_MAX_HP, 'tdm combat scored or damaged');
}

{
  const match = makeMatch(MODE_CTF, [
    { id: 'a', name: 'Ada', team: 'alpha' },
    { id: 'b', name: 'Bob', team: 'bravo' },
  ]);
  assert(!!match.ctf, 'ctf state on begin');
  const bob = match.pawns.get('b');
  bob.position.set(FLAG_HOMES.alpha.x, PLAYER_HEIGHT, FLAG_HOMES.alpha.z);
  match._hostFlags();
  assert(match.ctf.flags.alpha.state === FLAG_STATE.carried, 'mp ctf pickup');
  assert(match.ctf.flags.alpha.carrierId === 'b', 'mp ctf carrier');
  bob.position.set(FLAG_HOMES.bravo.x, PLAYER_HEIGHT, FLAG_HOMES.bravo.z);
  match._hostFlags();
  assert(match.captures.bravo === 1, 'mp ctf capture scores');
  assert(match.ctf.flags.alpha.state === FLAG_STATE.home, 'mp ctf flag reset');
  match.captures.bravo = 2;
  bob.position.set(FLAG_HOMES.alpha.x, PLAYER_HEIGHT, FLAG_HOMES.alpha.z);
  match._hostFlags();
  bob.position.set(FLAG_HOMES.bravo.x, PLAYER_HEIGHT, FLAG_HOMES.bravo.z);
  match._hostFlags();
  assert(match.captures.bravo === 3 && match._matchEnded, 'mp ctf win at 3');
  const capEnd = match._pendingEvents.find((e) => e.kind === 'match_end');
  assert(capEnd?.extra?.winnerTeam === 'bravo', 'mp ctf winnerTeam bravo');
}

{
  const match = makeMatch(MODE_CTF, [
    { id: 'a', name: 'Ada', team: 'alpha' },
    { id: 'b', name: 'Bob', team: 'bravo' },
  ]);
  const bob = match.pawns.get('b');
  bob.position.set(FLAG_HOMES.alpha.x, PLAYER_HEIGHT, FLAG_HOMES.alpha.z);
  match._hostFlags();
  bob.alive = false;
  match._hostFlags();
  assert(match.ctf.flags.alpha.state === FLAG_STATE.dropped, 'mp ctf drop on death');
}

// ─── Phase 3: Battle Royale last alive / no respawn / zone ─────────────
{
  const solo = makeMatch(MODE_PUBG, [{ id: 'a', name: 'Ada' }]);
  assert(solo.zone && solo.zone.r === BR_ZONE.stages[0].r, 'br zone on begin');
  solo._maybeEndMatch(null);
  assert(!solo._matchEnded, 'br 1-pawn match does not auto-end');
}

{
  const match = makeMatch(MODE_PUBG, [
    { id: 'a', name: 'Ada' },
    { id: 'b', name: 'Bob' },
  ]);
  const a = match.pawns.get('a');
  const b = match.pawns.get('b');
  a.alive = false;
  a.respawnAt = 1;
  match._updateHost(0.05, {});
  assert(!a.alive, 'br no respawn');

  match.session.room = {
    players: [
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bob' },
      { id: 'c', name: 'Cara' },
    ],
  };
  match._updateHost(0.016, {});
  assert(!match.pawns.has('c'), 'br no late-join pawn');

  match._maybeEndMatch(null);
  assert(match._matchEnded, 'br last alive wins');
  const endEv = match._pendingEvents.find((e) => e.kind === 'match_end');
  assert(endEv?.winnerId === 'b', 'br winner is last alive not the killer');
}

{
  const match = makeMatch(MODE_PUBG, [
    { id: 'a', name: 'Ada' },
    { id: 'b', name: 'Bob' },
  ]);
  const a = match.pawns.get('a');
  const b = match.pawns.get('b');
  a.position.set(80, PLAYER_HEIGHT, 0);
  b.position.set(0, PLAYER_HEIGHT, 0);
  const hpA = a.health;
  const hpB = b.health;
  match._hostZone(0.5);
  assert(a.health < hpA, `zone damages outsider (hp=${a.health})`);
  assert(b.health === hpB, 'zone spares insider');
  a.health = 4;
  a.alive = true;
  match._zoneDmgAcc = 0.45;
  match._hostZone(0.02);
  assert(!a.alive, 'zone can eliminate');
  assert(match._matchEnded, 'zone elim ends match when last alive remains');
  const endEv = match._pendingEvents.find((e) => e.kind === 'match_end');
  assert(endEv?.winnerId === 'b', 'zone kill credits last alive');
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
  'TDM',
  'CTF',
  'BR',
].join(', ')})`);
