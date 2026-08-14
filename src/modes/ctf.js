/**
 * Capture the Flag — Phase 3: two bases, pickup / drop / return / capture.
 * Flag homes sit in the Nuketown front yards (west = alpha, east = bravo).
 */

export const CTF_CAPTURE_LIMIT = 3;
export const CTF_PICKUP_RADIUS = 1.55;
export const CTF_CAPTURE_RADIUS = 1.8;

/** Front-yard pads: west house faces −Z, east house faces +Z (see MapBuilder D=10). */
export const FLAG_HOMES = {
  alpha: { x: -17, y: 0.15, z: -8 },
  bravo: { x: 17, y: 0.15, z: 8 },
};

export const FLAG_STATE = {
  home: 'home',
  carried: 'carried',
  dropped: 'dropped',
};

/** @param {string|null} [team] */
export function enemyTeam(team) {
  if (team === 'alpha') return 'bravo';
  if (team === 'bravo') return 'alpha';
  return null;
}

function copyHome(home) {
  return { x: home.x, y: home.y, z: home.z };
}

function distXZ(a, b) {
  return Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.z ?? 0) - (b.z ?? 0));
}

/**
 * @param {string} team
 * @param {{ x: number, y: number, z: number }} home
 */
export function createFlag(team, home) {
  const h = copyHome(home);
  return {
    team,
    home: h,
    x: h.x,
    y: h.y,
    z: h.z,
    state: FLAG_STATE.home,
    carrierId: null,
  };
}

/**
 * @param {{ alpha?: {x:number,y:number,z:number}, bravo?: {x:number,y:number,z:number} }} [homes]
 */
export function createCtfState(homes = FLAG_HOMES) {
  const alphaHome = homes.alpha || FLAG_HOMES.alpha;
  const bravoHome = homes.bravo || FLAG_HOMES.bravo;
  return {
    flags: {
      alpha: createFlag('alpha', alphaHome),
      bravo: createFlag('bravo', bravoHome),
    },
    captures: { alpha: 0, bravo: 0 },
  };
}

function resetFlagHome(flag) {
  flag.state = FLAG_STATE.home;
  flag.carrierId = null;
  flag.x = flag.home.x;
  flag.y = flag.home.y;
  flag.z = flag.home.z;
}

function dropFlag(flag, carrier) {
  flag.state = FLAG_STATE.dropped;
  flag.carrierId = null;
  if (carrier) {
    flag.x = carrier.x;
    flag.y = flag.home.y;
    flag.z = carrier.z;
  }
  return {
    kind: 'flag_drop',
    team: flag.team,
    playerId: carrier?.id || null,
  };
}

/**
 * Authoritative CTF tick. Mutates `state`. Returns discrete events.
 * @param {{ flags: { alpha: object, bravo: object }, captures: { alpha: number, bravo: number } }} state
 * @param {Array<{ id: string, team?: string|null, x: number, y?: number, z: number, alive: boolean }>} players
 * @returns {Array<object>}
 */
export function stepCtf(state, players = []) {
  const events = [];
  if (!state?.flags) return events;
  const list = players || [];
  const byId = new Map(list.map((p) => [p.id, p]));

  for (const flag of Object.values(state.flags)) {
    if (flag.state !== FLAG_STATE.carried) continue;
    const carrier = byId.get(flag.carrierId);
    if (!carrier || !carrier.alive) {
      events.push(dropFlag(flag, carrier || { id: flag.carrierId, x: flag.x, z: flag.z }));
      continue;
    }
    flag.x = carrier.x;
    flag.y = carrier.y ?? flag.home.y;
    flag.z = carrier.z;
  }

  const carrying = new Map();
  for (const flag of Object.values(state.flags)) {
    if (flag.state === FLAG_STATE.carried && flag.carrierId) {
      carrying.set(flag.carrierId, flag);
    }
  }

  for (const p of list) {
    if (!p.alive || (p.team !== 'alpha' && p.team !== 'bravo')) continue;
    const own = state.flags[p.team];
    const enemy = state.flags[enemyTeam(p.team)];
    if (!own || !enemy) continue;

    if (own.state === FLAG_STATE.dropped && distXZ(p, own) <= CTF_PICKUP_RADIUS) {
      resetFlagHome(own);
      events.push({ kind: 'flag_return', team: own.team, playerId: p.id });
    }

    const held = carrying.get(p.id);
    if (!held && (enemy.state === FLAG_STATE.home || enemy.state === FLAG_STATE.dropped)) {
      if (distXZ(p, enemy) <= CTF_PICKUP_RADIUS) {
        enemy.state = FLAG_STATE.carried;
        enemy.carrierId = p.id;
        enemy.x = p.x;
        enemy.y = p.y ?? enemy.home.y;
        enemy.z = p.z;
        carrying.set(p.id, enemy);
        events.push({ kind: 'flag_pickup', team: enemy.team, playerId: p.id });
      }
    }

    const carryingEnemy = carrying.get(p.id);
    if (
      carryingEnemy &&
      carryingEnemy.team !== p.team &&
      own.state === FLAG_STATE.home &&
      distXZ(p, own.home) <= CTF_CAPTURE_RADIUS
    ) {
      resetFlagHome(carryingEnemy);
      carrying.delete(p.id);
      state.captures[p.team] = (state.captures[p.team] ?? 0) + 1;
      events.push({
        kind: 'flag_capture',
        team: p.team,
        playerId: p.id,
        flagTeam: carryingEnemy.team,
      });
    }
  }

  return events;
}

/** Compact snapshot payload. */
export function flagsToNet(state) {
  if (!state?.flags) return [];
  return ['alpha', 'bravo'].map((team) => {
    const f = state.flags[team];
    return {
      team,
      state: f.state,
      carrierId: f.carrierId,
      x: f.x,
      y: f.y,
      z: f.z,
    };
  });
}

/** Apply host flag snap onto local CTF state (guest / late join). */
export function applyFlagsNet(state, flags) {
  if (!state?.flags || !flags?.length) return;
  for (const snap of flags) {
    const f = state.flags[snap.team];
    if (!f) continue;
    if (snap.state) f.state = snap.state;
    f.carrierId = snap.carrierId ?? null;
    if (snap.x != null) f.x = snap.x;
    if (snap.y != null) f.y = snap.y;
    if (snap.z != null) f.z = snap.z;
  }
}

/** @type {import('./IGameMode.js').IGameMode} */
export const MODE_CTF = {
  id: 'ctf',
  name: 'Capture the Flag',
  captureLimit: CTF_CAPTURE_LIMIT,
  teams: ['alpha', 'bravo'],
  friendlyFire: false,
  allowLateJoin: true,

  /**
   * @param {{ captures?: { alpha?: number, bravo?: number } }} state
   * @returns {boolean}
   */
  checkWin(state = {}) {
    const limit = MODE_CTF.captureLimit;
    const c = state.captures || {};
    return (c.alpha ?? 0) >= limit || (c.bravo ?? 0) >= limit;
  },

  /**
   * @param {{ ctf?: object, mapData?: object }} ctx
   */
  onMatchStart(ctx) {
    if (!ctx) return;
    if (!ctx.ctf) ctx.ctf = createCtfState(ctx.mapData?.flagHomes);
  },
};
