/**
 * Battle Royale — Phase 3 thin MVP: last alive, no respawn, shrinking pastel zone.
 * Late join stays off (ROOM_MODES.pubg). Full loot/loadout is out of scope.
 */

export const BR_ZONE = {
  centerX: 0,
  centerZ: 0,
  /** Hold then shrink; radii cover the Nuketown walls (MAP_WALL = 40). */
  stages: [
    { t: 0, r: 44 },
    { t: 22, r: 44 },
    { t: 32, r: 30 },
    { t: 52, r: 30 },
    { t: 62, r: 18 },
    { t: 82, r: 18 },
    { t: 92, r: 9 },
    { t: 110, r: 9 },
    { t: 120, r: 4 },
  ],
  /** Damage per second while outside the circle. */
  dps: 14,
};

/**
 * Map pack BR circle, or the Nuketown MODE default.
 * @param {{ brZone?: typeof BR_ZONE }|null|undefined} mapData
 * @returns {typeof BR_ZONE}
 */
export function brZoneFromMap(mapData) {
  const zone = mapData?.brZone;
  if (zone && Array.isArray(zone.stages) && zone.stages.length) return zone;
  return BR_ZONE;
}

/**
 * Interpolated safe-zone radius at match time `t` (seconds).
 * @param {number} t
 * @param {typeof BR_ZONE} [zone]
 */
export function zoneRadiusAt(t, zone = BR_ZONE) {
  const stages = zone.stages || [];
  if (!stages.length) return 44;
  const time = Math.max(0, t || 0);
  if (time <= stages[0].t) return stages[0].r;
  for (let i = 1; i < stages.length; i++) {
    const b = stages[i];
    if (time <= b.t) {
      const a = stages[i - 1];
      const span = b.t - a.t;
      const u = span <= 1e-6 ? 1 : (time - a.t) / span;
      return a.r + (b.r - a.r) * u;
    }
  }
  return stages[stages.length - 1].r;
}

/**
 * @param {number} x
 * @param {number} z
 * @param {number} radius
 * @param {number} [cx]
 * @param {number} [cz]
 */
export function isOutsideZone(x, z, radius, cx = BR_ZONE.centerX, cz = BR_ZONE.centerZ) {
  return Math.hypot((x ?? 0) - cx, (z ?? 0) - cz) > radius;
}

/** @type {import('./IGameMode.js').IGameMode} */
export const MODE_PUBG = {
  id: 'pubg',
  name: 'Battle Royale',
  allowLateJoin: false,
  allowRespawn: false,
  zone: { shrinkInterval: 60, stages: BR_ZONE.stages.length },

  /**
   * Last combatant standing. Does not end a 1-player lobby that never fought.
   * @param {{ aliveCount?: number, playerCount?: number, eliminatedCount?: number }} state
   */
  checkWin(state = {}) {
    const alive = state.aliveCount ?? Infinity;
    const n = state.playerCount ?? 0;
    const dead =
      state.eliminatedCount ?? (Number.isFinite(n) && Number.isFinite(alive) ? Math.max(0, n - alive) : 0);
    if (n < 2) return false;
    return alive <= 1 && dead >= 1;
  },
};
