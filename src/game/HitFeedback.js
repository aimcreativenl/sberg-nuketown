/**
 * Incoming-hit compass. Screen 0 rad = attacker in front, +clockwise (right).
 * Matches camera yaw: forward is (-sin yaw, -cos yaw).
 */
export const HIT_DIR_LIFE = 1.7;
export const HIT_MERGE_RAD = 0.45;

export function wrapPi(a) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

/** World yaw of a shot origin relative to the player (same convention as look yaw). */
export function incomingFromYaw(playerX, playerZ, fromX, fromZ) {
  const dx = fromX - playerX;
  const dz = fromZ - playerZ;
  if (dx * dx + dz * dz < 1e-6) return null;
  return Math.atan2(-dx, -dz);
}

/**
 * @param {number} playerYaw
 * @param {number} playerX
 * @param {number} playerZ
 * @param {number} fromX
 * @param {number} fromZ
 * @returns {number|null} screen radians, or null if the source is on top of the player
 */
export function hitIndicatorAngle(playerYaw, playerX, playerZ, fromX, fromZ) {
  const fromYaw = incomingFromYaw(playerX, playerZ, fromX, fromZ);
  if (fromYaw == null) return null;
  return wrapPi(playerYaw - fromYaw);
}

/**
 * Keep one chevron per nearby world direction; refresh life on a repeat hit.
 * @param {Array<{ fromYaw: number, life: number, peak: number }>} dirs
 * @param {number} fromYaw
 * @param {number} [life]
 */
export function mergeHitDir(dirs, fromYaw, life = HIT_DIR_LIFE) {
  const list = dirs || [];
  for (const d of list) {
    if (Math.abs(wrapPi(d.fromYaw - fromYaw)) <= HIT_MERGE_RAD) {
      d.fromYaw = fromYaw;
      d.life = Math.max(d.life, life);
      d.peak = Math.min(1, (d.peak || 0.7) + 0.2);
      return list;
    }
  }
  list.push({ fromYaw, life, peak: 0.85 });
  while (list.length > 6) list.shift();
  return list;
}