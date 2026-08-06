/**
 * Phase 2a room logic unit tests (no WebSocket / Vite required).
 */
import {
  createRoom,
  joinRoom,
  leaveRoom,
  hostStartMatch,
  tickRoomCountdown,
  normalizeInviteCode,
  generateInviteCode,
  ROOM_PHASE,
  ROOM_MODES,
} from '../src/net/roomLogic.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

assert(normalizeInviteCode(' ab-12 ') === 'AB12', 'normalize code');
assert(generateInviteCode(() => 0).length === 4, 'code length');

const room = createRoom({ hostId: 'h1', hostName: 'Ada', modeId: 'deathmatch' });
assert(room.phase === ROOM_PHASE.lobby, 'starts lobby');
assert(room.players.length === 1 && room.players[0].isHost, 'host seated');
assert(room.allowLateJoin === true, 'dm late join on');

const j = joinRoom(room, { playerId: 'g1', name: 'Bob' });
assert(j.ok && room.players.length === 2, 'guest joined');

const badStart = hostStartMatch(room, 'g1');
assert(!badStart.ok, 'guest cannot start');

const okStart = hostStartMatch(room, 'h1', 10);
assert(okStart.ok && room.phase === ROOM_PHASE.countdown && room.countdown === 10, 'host start countdown');

tickRoomCountdown(room, 3);
assert(room.countdown === 7, `tick 3 → 7 got ${room.countdown}`);
tickRoomCountdown(room, 7);
assert(room.phase === ROOM_PHASE.live && room.countdown === 0, 'countdown → live');

// Late join OK for deathmatch while live
const late = joinRoom(room, { playerId: 'g2', name: 'Cara' });
assert(late.ok && late.late === true && room.players.length === 3, 'dm late join');

// PUBG rejects late join
const pubg = createRoom({ hostId: 'h2', modeId: 'pubg' });
assert(ROOM_MODES.pubg.allowLateJoin === false, 'pubg flag');
hostStartMatch(pubg, 'h2', 1);
tickRoomCountdown(pubg, 1);
const denied = joinRoom(pubg, { playerId: 'x', name: 'X' });
assert(!denied.ok, 'pubg late join denied');

// Host leave ends room
const r2 = createRoom({ hostId: 'h3' });
joinRoom(r2, { playerId: 'g', name: 'G' });
const left = leaveRoom(r2, 'h3');
assert(left.hostLeft && r2.phase === ROOM_PHASE.ended, 'host leave ends');

const report = { ok: failures.length === 0, failures };
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: LAN room logic (lobby, countdown, late-join rules)');
