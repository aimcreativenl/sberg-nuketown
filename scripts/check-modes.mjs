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
import { MODE_TDM, pickTeamSpawn, teamOutfitIndex, teamReachedLimit } from '../src/modes/tdm.js';
import { MODE_CTF, FLAG_HOMES, FLAG_STATE, createCtfState, stepCtf } from '../src/modes/ctf.js';
import { MODE_PUBG, zoneRadiusAt, isOutsideZone } from '../src/modes/pubg.js';
import { getModeById, listModes } from '../src/modes/registry.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

assert(HOST_DISCONNECT_POLICY === 'end_match', 'HOST_DISCONNECT_POLICY');

assert(ROOM_MODES.ctf.allowLateJoin === true, 'ctf late join on');
assert(ROOM_MODES.pubg.allowLateJoin === false, 'pubg late join off');
assert(ROOM_MODES.pubg.minPlayers === 2, 'pubg minPlayers 2');
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
assert(MODE_PUBG.checkWin({ aliveCount: 1 }) === false, 'pubg 1-player lobby no auto win');
assert(MODE_PUBG.checkWin({ playerCount: 2, aliveCount: 1 }) === true, 'pubg last alive');
assert(MODE_PUBG.checkWin({ playerCount: 2, aliveCount: 0 }) === true, 'pubg all eliminated');
assert(MODE_PUBG.checkWin({ playerCount: 2, aliveCount: 2 }) === false, 'pubg still fighting');
assert(MODE_PUBG.allowLateJoin === false, 'MODE_PUBG allowLateJoin');
assert(MODE_PUBG.allowRespawn === false, 'MODE_PUBG allowRespawn');
assert(zoneRadiusAt(0) === 44, 'zone start radius');
assert(zoneRadiusAt(22) === 44, 'zone hold radius');
assert(Math.abs(zoneRadiusAt(27) - 37) < 1e-6, 'zone interpolate 44→30');
assert(zoneRadiusAt(200) === 4, 'zone final radius');
assert(isOutsideZone(50, 0, 44) === true, 'outside zone');
assert(isOutsideZone(0, 0, 44) === false, 'inside zone');

assert(getModeById('tdm').id === 'tdm', 'registry getModeById');
assert(getModeById('nope').id === 'deathmatch', 'registry fallback');
assert(listModes().length >= 4, 'listModes');

// optional onKill increments
const tk = { alpha: 0, bravo: 0 };
MODE_TDM.onKill({ teamKills: tk }, { team: 'bravo' });
assert(tk.bravo === 1, 'tdm onKill');

{
  const left = { x: -8, y: 1.7, z: 0 };
  const right = { x: 12, y: 1.7, z: 0 };
  const mid = { x: 0, y: 1.7, z: 4 };
  const a = pickTeamSpawn([left, right, mid], 'alpha', () => 0);
  const b = pickTeamSpawn([left, right, mid], 'bravo', () => 0);
  assert(a && a.x <= 0, 'pickTeamSpawn alpha −X');
  assert(b && b.x > 0, 'pickTeamSpawn bravo +X');
  const onlyRight = pickTeamSpawn([right], 'alpha', () => 0);
  assert(onlyRight === right, 'pickTeamSpawn falls back when side empty');
  assert(teamOutfitIndex('alpha') === 3 && teamOutfitIndex('bravo') === 4, 'teamOutfitIndex');
  assert(teamReachedLimit({ alpha: 20, bravo: 4 }) === 'alpha', 'teamReachedLimit alpha');
  assert(teamReachedLimit({ alpha: 3, bravo: 3 }) === null, 'teamReachedLimit none');
}

{
  const st = createCtfState();
  assert(st.flags.alpha.state === FLAG_STATE.home, 'ctf flags start home');
  const bob = { id: 'b', team: 'bravo', x: FLAG_HOMES.alpha.x, y: 1.7, z: FLAG_HOMES.alpha.z, alive: true };
  const ada = { id: 'a', team: 'alpha', x: FLAG_HOMES.bravo.x, y: 1.7, z: FLAG_HOMES.bravo.z, alive: true };
  let ev = stepCtf(st, [bob, ada]);
  assert(st.flags.alpha.state === FLAG_STATE.carried && st.flags.alpha.carrierId === 'b', 'bravo picks up alpha');
  assert(st.flags.bravo.state === FLAG_STATE.carried && st.flags.bravo.carrierId === 'a', 'alpha picks up bravo');
  assert(ev.some((e) => e.kind === 'flag_pickup'), 'pickup events');

  // Own flag away — no capture at home
  bob.x = FLAG_HOMES.bravo.x;
  bob.z = FLAG_HOMES.bravo.z;
  ev = stepCtf(st, [bob, ada]);
  assert(st.captures.bravo === 0, 'no capture while own flag is out');

  // Drop / return isolated so a teammate is not standing on the drop
  const stDrop = createCtfState();
  const b3 = {
    id: 'b',
    team: 'bravo',
    x: FLAG_HOMES.alpha.x,
    y: 1.7,
    z: FLAG_HOMES.alpha.z,
    alive: true,
  };
  stepCtf(stDrop, [b3]);
  b3.alive = false;
  ev = stepCtf(stDrop, [b3]);
  assert(stDrop.flags.alpha.state === FLAG_STATE.dropped, 'drop on death');
  const a3 = {
    id: 'a',
    team: 'alpha',
    x: stDrop.flags.alpha.x,
    y: 1.7,
    z: stDrop.flags.alpha.z,
    alive: true,
  };
  ev = stepCtf(stDrop, [b3, a3]);
  assert(stDrop.flags.alpha.state === FLAG_STATE.home, 'alpha returned');
  assert(ev.some((e) => e.kind === 'flag_return'), 'return event');

  // Capture: bravo alive at alpha flag, then home with own flag home
  const st2 = createCtfState();
  const b2 = { id: 'b', team: 'bravo', x: FLAG_HOMES.alpha.x, y: 1.7, z: FLAG_HOMES.alpha.z, alive: true };
  stepCtf(st2, [b2]);
  b2.x = FLAG_HOMES.bravo.x;
  b2.z = FLAG_HOMES.bravo.z;
  ev = stepCtf(st2, [b2]);
  assert(st2.captures.bravo === 1, 'capture increments');
  assert(st2.flags.alpha.state === FLAG_STATE.home, 'stolen flag resets');
  assert(MODE_CTF.checkWin({ captures: { alpha: 0, bravo: 3 } }) === true, 'ctf win at 3');
}

const report = { ok: failures.length === 0, failures };
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: modes + room mode / host-disconnect (Phase 2c)');
