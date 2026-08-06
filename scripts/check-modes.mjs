/**
 * Phase 2c mode + room mode / host-disconnect unit tests (no WebSocket required).
 */
import {
  createRoom,
  joinRoom,
  setRoomMode,
  assignTeams,
  applyHostDisconnect,
  HOST_DISCONNECT_POLICY,
  ROOM_MODES,
  ROOM_PHASE,
  publicRoomState,
} from '../src/net/roomLogic.js';
import { MODE_TDM } from '../src/modes/tdm.js';
import { MODE_CTF } from '../src/modes/ctf.js';
import { MODE_PUBG } from '../src/modes/pubg.js';
import { getModeById, listModes } from '../src/modes/registry.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

assert(HOST_DISCONNECT_POLICY === 'end_match', 'HOST_DISCONNECT_POLICY');

assert(ROOM_MODES.ctf.allowLateJoin === true, 'ctf late join on');
assert(ROOM_MODES.pubg.allowLateJoin === false, 'pubg late join off');
assert(ROOM_MODES.tdm.allowLateJoin === true, 'tdm late join on');
assert(ROOM_MODES.deathmatch.allowLateJoin === true, 'dm late join on');

// setRoomMode — host only, lobby only
const room = createRoom({ hostId: 'h1', hostName: 'Ada', modeId: 'deathmatch' });
joinRoom(room, { playerId: 'g1', name: 'Bob' });

const guestSet = setRoomMode(room, 'g1', 'tdm');
assert(!guestSet.ok, 'guest cannot set mode');

const hostSet = setRoomMode(room, 'h1', 'tdm');
assert(hostSet.ok && room.modeId === 'tdm', 'host set tdm');
assert(room.allowLateJoin === true, 'tdm allowLateJoin from ROOM_MODES');
assert(
  room.players.every((p) => p.team === 'alpha' || p.team === 'bravo'),
  'tdm assigns teams'
);
assert(room.players[0].team === 'alpha' && room.players[1].team === 'bravo', 'alternate seats');

const pub = publicRoomState(room);
assert(pub.players[0].team === 'alpha', 'publicRoomState includes team');

// join into tdm balances teams
joinRoom(room, { playerId: 'g2', name: 'Cara' });
const alphaN = room.players.filter((p) => p.team === 'alpha').length;
const bravoN = room.players.filter((p) => p.team === 'bravo').length;
assert(Math.abs(alphaN - bravoN) <= 1, 'balanced teams after join');

// switch away from team mode clears teams
setRoomMode(room, 'h1', 'deathmatch');
assert(room.players.every((p) => !p.team), 'clear teams on dm');

// ctf set
const ctfRoom = createRoom({ hostId: 'h2', modeId: 'ctf' });
assert(ctfRoom.players[0].team === 'alpha', 'createRoom ctf assigns host team');
assert(ctfRoom.allowLateJoin === true, 'ctf room late join');

const pubgRoom = createRoom({ hostId: 'h3', modeId: 'pubg' });
assert(pubgRoom.allowLateJoin === false, 'pubg room late join false');

// assignTeams export
const rTeams = createRoom({ hostId: 'a' });
joinRoom(rTeams, { playerId: 'b', name: 'B' });
assignTeams(rTeams);
assert(rTeams.players[0].team === 'alpha' && rTeams.players[1].team === 'bravo', 'assignTeams export');

// applyHostDisconnect
const hd = createRoom({ hostId: 'hx' });
applyHostDisconnect(hd);
assert(hd.phase === ROOM_PHASE.ended && hd.hostLeft === true, 'applyHostDisconnect');

// Mode checkWin behaviors
assert(MODE_TDM.checkWin({ teamKills: { alpha: 20, bravo: 0 } }) === true, 'tdm win alpha');
assert(MODE_TDM.checkWin({ teamKills: { alpha: 5, bravo: 5 } }) === false, 'tdm no win');
assert(MODE_CTF.checkWin({ captures: { alpha: 3, bravo: 0 } }) === true, 'ctf win');
assert(MODE_CTF.checkWin({ captures: { alpha: 1, bravo: 2 } }) === false, 'ctf no win');
assert(MODE_PUBG.checkWin({ aliveCount: 1 }) === true, 'pubg last alive');
assert(MODE_PUBG.checkWin({ aliveCount: 0 }) === true, 'pubg <=1');
assert(MODE_PUBG.checkWin({ aliveCount: 2 }) === false, 'pubg still fighting');
assert(MODE_PUBG.allowLateJoin === false, 'MODE_PUBG allowLateJoin');

assert(getModeById('tdm').id === 'tdm', 'registry getModeById');
assert(getModeById('nope').id === 'deathmatch', 'registry fallback');
assert(listModes().length >= 4, 'listModes');

// optional onKill increments
const tk = { alpha: 0, bravo: 0 };
MODE_TDM.onKill({ teamKills: tk }, { team: 'bravo' });
assert(tk.bravo === 1, 'tdm onKill');

const report = { ok: failures.length === 0, failures };
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: modes + room mode / host-disconnect (Phase 2c)');
