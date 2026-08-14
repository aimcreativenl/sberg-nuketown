/**
 * Pure LAN room / lobby logic — no sockets. Used by the Node host and unit tests.
 *
 * Phases: lobby → countdown → live → ended
 * Late join: allowed unless mode.allowLateJoin === false (PUBG-style).
 * Host disconnect (v1): match ends — see HOST_DISCONNECT_POLICY.
 */

export const ROOM_PHASE = {
  lobby: 'lobby',
  countdown: 'countdown',
  live: 'live',
  ended: 'ended',
};

/**
 * Phase 2c v1: when the host leaves / disconnects, the match ends for everyone.
 * Host migration is deferred to a later phase.
 */
export const HOST_DISCONNECT_POLICY = 'end_match';

/** Modes for Phase 2c; deathmatch is the 2a default. */
export const ROOM_MODES = {
  deathmatch: { id: 'deathmatch', label: 'Deathmatch', allowLateJoin: true },
  tdm: { id: 'tdm', label: 'Team Deathmatch', allowLateJoin: true },
  ctf: { id: 'ctf', label: 'Capture the Flag', allowLateJoin: true },
  pubg: { id: 'pubg', label: 'Battle Royale', allowLateJoin: false, minPlayers: 2 },
};

const TEAM_MODES = new Set(['tdm', 'ctf']);

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateInviteCode(rng = Math.random) {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CODE_ALPHABET[(rng() * CODE_ALPHABET.length) | 0];
  }
  return code;
}

export function normalizeInviteCode(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

/**
 * Alternate alpha/bravo by seat order. Mutates room.players.
 * @param {object} room
 */
export function assignTeams(room) {
  if (!room?.players) return room;
  room.players.forEach((p, i) => {
    p.team = i % 2 === 0 ? 'alpha' : 'bravo';
  });
  return room;
}

function clearTeams(room) {
  if (!room?.players) return;
  for (const p of room.players) {
    delete p.team;
  }
}

/**
 * Balance: put new player on the smaller team (tie → alternate by seat index).
 * @param {object} room
 * @param {object} player
 */
function assignTeamToNewPlayer(room, player) {
  let alpha = 0;
  let bravo = 0;
  for (const p of room.players) {
    if (p === player) continue;
    if (p.team === 'bravo') bravo++;
    else if (p.team === 'alpha') alpha++;
  }
  if (alpha < bravo) player.team = 'alpha';
  else if (bravo < alpha) player.team = 'bravo';
  else player.team = room.players.indexOf(player) % 2 === 0 ? 'alpha' : 'bravo';
}

/**
 * Host-only mode pick while still in lobby.
 * @returns {{ ok: true, room: object } | { ok: false, error: string }}
 */
export function setRoomMode(room, hostId, modeId) {
  if (!room) return { ok: false, error: 'Room not found' };
  if (room.hostId !== hostId) return { ok: false, error: 'Only the host can change mode' };
  if (room.phase !== ROOM_PHASE.lobby) return { ok: false, error: 'Can only change mode in lobby' };
  const mode = ROOM_MODES[modeId];
  if (!mode) return { ok: false, error: 'Unknown mode' };
  room.modeId = mode.id;
  room.allowLateJoin = mode.allowLateJoin !== false;
  if (TEAM_MODES.has(mode.id)) assignTeams(room);
  else clearTeams(room);
  return { ok: true, room };
}

/**
 * Apply v1 host-disconnect policy: end the match immediately.
 * @param {object} room
 * @returns {object} room
 */
export function applyHostDisconnect(room) {
  if (!room) return room;
  room.phase = ROOM_PHASE.ended;
  room.hostLeft = true;
  return room;
}

/**
 * @param {{ hostId: string, hostName?: string, modeId?: string, code?: string }} opts
 */
export function createRoom(opts) {
  const mode = ROOM_MODES[opts.modeId] || ROOM_MODES.deathmatch;
  const hostId = opts.hostId;
  const room = {
    code: opts.code || generateInviteCode(),
    modeId: mode.id,
    allowLateJoin: mode.allowLateJoin !== false,
    phase: ROOM_PHASE.lobby,
    countdown: 0,
    hostId,
    hostLeft: false,
    players: [
      {
        id: hostId,
        name: opts.hostName || 'Host',
        isHost: true,
        ready: true,
      },
    ],
    createdAt: Date.now(),
  };
  if (TEAM_MODES.has(mode.id)) assignTeams(room);
  return room;
}

export function publicRoomState(room) {
  if (!room) return null;
  return {
    code: room.code,
    modeId: room.modeId,
    allowLateJoin: room.allowLateJoin,
    phase: room.phase,
    countdown: room.countdown,
    hostId: room.hostId,
    hostLeft: !!room.hostLeft,
    players: room.players.map((p) => {
      const out = {
        id: p.id,
        name: p.name,
        isHost: !!p.isHost,
      };
      if (p.team) out.team = p.team;
      return out;
    }),
  };
}

/**
 * @returns {{ ok: true, room: object, late?: boolean } | { ok: false, error: string }}
 */
export function joinRoom(room, { playerId, name }) {
  if (!room) return { ok: false, error: 'Room not found' };
  if (room.phase === ROOM_PHASE.ended) return { ok: false, error: 'Match ended' };
  if (room.phase !== ROOM_PHASE.lobby && !room.allowLateJoin) {
    return { ok: false, error: 'Match already in progress (no late join for this mode)' };
  }
  if (room.players.some((p) => p.id === playerId)) {
    return { ok: true, room, late: room.phase !== ROOM_PHASE.lobby };
  }
  if (room.players.length >= 8) return { ok: false, error: 'Room is full' };
  const player = {
    id: playerId,
    name: name || `Player ${room.players.length + 1}`,
    isHost: false,
    ready: true,
  };
  room.players.push(player);
  if (TEAM_MODES.has(room.modeId)) assignTeamToNewPlayer(room, player);
  return { ok: true, room, late: room.phase !== ROOM_PHASE.lobby };
}

export function leaveRoom(room, playerId) {
  if (!room) return { ok: false, error: 'Room not found' };
  room.players = room.players.filter((p) => p.id !== playerId);
  if (playerId === room.hostId) {
    applyHostDisconnect(room);
    return { ok: true, room, hostLeft: true };
  }
  if (!room.players.length) {
    room.phase = ROOM_PHASE.ended;
  }
  return { ok: true, room, hostLeft: false };
}

/**
 * Host starts the match → countdown seconds (default 10).
 * @returns {{ ok: true, room: object } | { ok: false, error: string }}
 */
export function hostStartMatch(room, hostId, seconds = 10) {
  if (!room) return { ok: false, error: 'Room not found' };
  if (room.hostId !== hostId) return { ok: false, error: 'Only the host can start' };
  if (room.phase !== ROOM_PHASE.lobby) return { ok: false, error: 'Already started' };
  const min = ROOM_MODES[room.modeId]?.minPlayers || 1;
  if (room.players.length < min) {
    return { ok: false, error: `Need at least ${min} players for this mode` };
  }
  room.phase = ROOM_PHASE.countdown;
  room.countdown = Math.max(1, seconds);
  return { ok: true, room };
}

/** Advance countdown by dt seconds. At 0 → live. */
export function tickRoomCountdown(room, dt) {
  if (!room || room.phase !== ROOM_PHASE.countdown) return room;
  room.countdown = Math.max(0, room.countdown - Math.max(0, dt));
  if (room.countdown <= 0) {
    room.phase = ROOM_PHASE.live;
    room.countdown = 0;
  }
  return room;
}
