/**
 * Shared solid-AABB queries for player, bots, and unit tests.
 * Keep bot/player wall rejection on the same path so house shells stay solid.
 */
import * as THREE from 'three';

/** Bot capsule radius in XZ (matches chunky voxel silhouette). */
export const BOT_COLLIDE_RADIUS = 0.42;
/** Standing bot body height used for Y overlap (feet ≈ y=0). */
export const BOT_BODY_HEIGHT = 1.65;
/** Skip floor-slab colliders thinner than this (same idea as Player._resolveAxis). */
export const MIN_SOLID_HEIGHT = 0.35;

/**
 * @param {THREE.Box3|{min:THREE.Vector3,max:THREE.Vector3}} box
 * @param {number} [minHeight]
 */
export function isSolidColliderBox(box, minHeight = MIN_SOLID_HEIGHT) {
  if (!box?.min || !box?.max) return false;
  return box.max.y - box.min.y >= minHeight;
}

/** False when entry explicitly marks solid:false (open doors). Bare Box3 ⇒ solid. */
export function colliderIsActiveSolid(c) {
  if (!c) return false;
  if (c.solid === false) return false;
  return true;
}

/**
 * True if a vertical capsule at `pos` (feet or eye depending on body range)
 * intersects any solid collider in XZ and Y.
 *
 * @param {{x:number,y?:number,z:number}} pos
 * @param {Array<{box?:THREE.Box3,solid?:boolean}|THREE.Box3>} colliders
 * @param {{
 *   radius?: number,
 *   bodyMinY?: number,
 *   bodyMaxY?: number,
 *   minColliderHeight?: number,
 * }} [opts]
 */
export function positionBlockedBySolids(pos, colliders, opts = {}) {
  const radius = opts.radius ?? BOT_COLLIDE_RADIUS;
  const bodyMinY = opts.bodyMinY ?? 0.08;
  const bodyMaxY = opts.bodyMaxY ?? BOT_BODY_HEIGHT;
  const minH = opts.minColliderHeight ?? MIN_SOLID_HEIGHT;

  for (const c of colliders || []) {
    if (!colliderIsActiveSolid(c)) continue;
    const box = c?.box || c;
    if (!isSolidColliderBox(box, minH)) continue;
    if (bodyMaxY < box.min.y || bodyMinY > box.max.y) continue;
    if (
      pos.x + radius > box.min.x &&
      pos.x - radius < box.max.x &&
      pos.z + radius > box.min.z &&
      pos.z - radius < box.max.z
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Bot-style block: feet at pos.y (usually 0), body up to BOT_BODY_HEIGHT.
 * Replaces the old XZ-only + `box.min.y < 1.6` filter that let bots slide into tall walls.
 *
 * @param {{x:number,y?:number,z:number}} pos
 * @param {Array} colliders
 * @param {number} [radius]
 */
export function botPositionBlocked(pos, colliders, radius = BOT_COLLIDE_RADIUS) {
  const feet = pos.y ?? 0;
  return positionBlockedBySolids(pos, colliders, {
    radius,
    bodyMinY: feet + 0.08,
    bodyMaxY: feet + BOT_BODY_HEIGHT,
  });
}

/**
 * Player-style block: `pos` is eye height, body hangs below.
 *
 * @param {{x:number,y:number,z:number}} eyePos
 * @param {Array} colliders
 * @param {{ radius?: number, height?: number }} [opts]
 */
export function playerPositionBlocked(eyePos, colliders, opts = {}) {
  const radius = opts.radius ?? 0.38;
  const height = opts.height ?? 1.7;
  return positionBlockedBySolids(eyePos, colliders, {
    radius,
    bodyMinY: eyePos.y - height + 0.15,
    bodyMaxY: eyePos.y - 0.1,
  });
}

/**
 * Build a world AABB collider entry (optional metadata for tests / debug).
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} w
 * @param {number} h
 * @param {number} d
 * @param {object} [meta]
 */
export function makeAabbCollider(x, y, z, w, h, d, meta = {}) {
  return {
    box: new THREE.Box3(
      new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
      new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2)
    ),
    solid: true,
    ...meta,
  };
}

/**
 * True if XZ segment (from→to) intersects a solid AABB that overlaps sampleY.
 * Catches thin-wall tunnels where start/end are free but the path crosses the wall.
 *
 * @param {{x:number,z:number}} from
 * @param {{x:number,z:number}} to
 * @param {Array} colliders
 * @param {number} sampleY
 * @param {number} [minHeight]
 */
export function xzSegmentHitsSolid(from, to, colliders, sampleY, minHeight = MIN_SOLID_HEIGHT) {
  const x0 = from.x;
  const z0 = from.z;
  const x1 = to.x;
  const z1 = to.z;
  for (const c of colliders || []) {
    if (!colliderIsActiveSolid(c)) continue;
    const box = c?.box || c;
    if (!isSolidColliderBox(box, minHeight)) continue;
    if (sampleY < box.min.y || sampleY > box.max.y) continue;
    // Liang–Barsky style clip of segment against AABB in XZ
    let t0 = 0;
    let t1 = 1;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const clip = (p, q) => {
      if (Math.abs(p) < 1e-12) return q >= 0;
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
      return true;
    };
    // Reset t for each box
    t0 = 0;
    t1 = 1;
    if (
      clip(-dx, x0 - box.min.x) &&
      clip(dx, box.max.x - x0) &&
      clip(-dz, z0 - box.min.z) &&
      clip(dz, box.max.z - z0) &&
      t0 <= t1
    ) {
      // Intersection on the open segment (not only endpoints in free space)
      // Count any overlap of [t0,t1] with (0,1)
      if (t1 > 1e-4 && t0 < 1 - 1e-4) return true;
    }
  }
  return false;
}

/**
 * True if a horizontal move from→to is illegal: destination solid, path samples solid,
 * or XZ segment pierces a solid (wall tunnel with free exterior destination).
 *
 * @param {{x:number,y?:number,z:number}} from
 * @param {{x:number,y?:number,z:number}} to
 * @param {Array} colliders
 * @param {{
 *   radius?: number,
 *   bodyMinY?: number,
 *   bodyMaxY?: number,
 *   minColliderHeight?: number,
 *   step?: number,
 * }} [opts]
 */
export function movePathBlocked(from, to, colliders, opts = {}) {
  if (positionBlockedBySolids(to, colliders, opts)) return true;

  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-5) return false;

  const step = opts.step ?? 0.1;
  const steps = Math.max(2, Math.ceil(len / step));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const p = {
      x: from.x + dx * t,
      y: from.y ?? 0,
      z: from.z + dz * t,
    };
    if (positionBlockedBySolids(p, colliders, opts)) return true;
  }

  const bodyMinY = opts.bodyMinY ?? 0.08;
  const bodyMaxY = opts.bodyMaxY ?? BOT_BODY_HEIGHT;
  const sampleY = (bodyMinY + bodyMaxY) * 0.5;
  const minH = opts.minColliderHeight ?? MIN_SOLID_HEIGHT;
  if (xzSegmentHitsSolid(from, to, colliders, sampleY, minH)) return true;

  return false;
}

/**
 * Bot move legality (feet-based body). Destination free is NOT enough — path must not tunnel.
 */
export function botMoveBlocked(from, to, colliders, radius = BOT_COLLIDE_RADIUS) {
  const feet = from.y ?? 0;
  return movePathBlocked(from, to, colliders, {
    radius,
    bodyMinY: feet + 0.08,
    bodyMaxY: feet + BOT_BODY_HEIGHT,
    step: 0.08,
  });
}

/**
 * Player eye-pos move legality with path anti-tunnel.
 */
export function playerMoveBlocked(fromEye, toEye, colliders, opts = {}) {
  const radius = opts.radius ?? 0.38;
  const height = opts.height ?? 1.7;
  const bodyOpts = {
    radius,
    bodyMinY: fromEye.y - height + 0.15,
    bodyMaxY: fromEye.y - 0.1,
    step: 0.08,
  };
  return movePathBlocked(fromEye, toEye, colliders, bodyOpts);
}

/**
 * True if collider should stop hitscan / LOS.
 * House walls/doors always count (even mid-height bands). Thin floor slabs need blocksShot.
 */
export function colliderBlocksShot(c, minHeight = 0.5) {
  if (!colliderIsActiveSolid(c)) return false;
  const box = c?.box || c;
  if (!box?.min || !box?.max) return false;
  if (c.blocksShot === true) return true;
  const kind = c.kind;
  if (kind === 'house_wall' || kind === 'house_door' || kind === 'house_floor') return true;
  return isSolidColliderBox(box, minHeight);
}

/**
 * Ray vs AABB (slab method). Returns hit distance along unit direction, or null.
 * @param {number} ox
 * @param {number} oy
 * @param {number} oz
 * @param {number} dx unit direction
 * @param {number} dy
 * @param {number} dz
 * @param {{min:{x:number,y:number,z:number},max:{x:number,y:number,z:number}}} box
 * @param {number} maxT
 * @returns {number|null}
 */
export function rayAabbDistance(ox, oy, oz, dx, dy, dz, box, maxT) {
  let tmin = 0;
  let tmax = maxT;
  const axes = [
    [ox, dx, box.min.x, box.max.x],
    [oy, dy, box.min.y, box.max.y],
    [oz, dz, box.min.z, box.max.z],
  ];
  for (const [o, d, minB, maxB] of axes) {
    if (Math.abs(d) < 1e-12) {
      if (o < minB || o > maxB) return null;
      continue;
    }
    const invD = 1 / d;
    let t0 = (minB - o) * invD;
    let t1 = (maxB - o) * invD;
    if (t0 > t1) {
      const tmp = t0;
      t0 = t1;
      t1 = tmp;
    }
    if (t0 > tmin) tmin = t0;
    if (t1 < tmax) tmax = t1;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  const hit = tmin >= 0 ? tmin : tmax;
  if (hit < 0 || hit > maxT) return null;
  return hit;
}

/**
 * Ray vs solid AABBs (hitscan / LOS) — exact slab tests (no step sampling misses).
 *
 * @param {{x:number,y:number,z:number}|THREE.Vector3} from
 * @param {{x:number,y:number,z:number}|THREE.Vector3} to
 * @param {Array} colliders
 * @param {{ maxDist?: number, step?: number, minHeight?: number, tMin?: number, tEndPad?: number }} [opts]
 * @returns {boolean} true if a solid blocks the segment
 */
export function rayBlockedBySolids(from, to, colliders, opts = {}) {
  const minHeight = opts.minHeight ?? 0.5;
  const ox = from.x;
  const oy = from.y;
  const oz = from.z;
  const dx = to.x - ox;
  const dy = to.y - oy;
  const dz = to.z - oz;
  const len = Math.hypot(dx, dy, dz);
  const dist = Math.min(len, opts.maxDist ?? len);
  if (dist < 1e-4) return false;
  const inv = 1 / len;
  const dirX = dx * inv;
  const dirY = dy * inv;
  const dirZ = dz * inv;
  // Ignore hits at the muzzle / inside the target capsule
  const tMin = opts.tMin ?? 0.06;
  const tEnd = dist - (opts.tEndPad ?? 0.06);
  if (tEnd <= tMin) return false;

  const x1 = ox + dirX * tEnd;
  const y1 = oy + dirY * tEnd;
  const z1 = oz + dirZ * tEnd;
  const segMinX = ox < x1 ? ox : x1;
  const segMaxX = ox < x1 ? x1 : ox;
  const segMinY = oy < y1 ? oy : y1;
  const segMaxY = oy < y1 ? y1 : oy;
  const segMinZ = oz < z1 ? oz : z1;
  const segMaxZ = oz < z1 ? z1 : oz;

  for (const c of colliders || []) {
    if (!colliderBlocksShot(c, minHeight)) continue;
    const box = c?.box || c;
    if (!box?.min || !box?.max) continue;
    if (
      box.max.x < segMinX ||
      box.min.x > segMaxX ||
      box.max.y < segMinY ||
      box.min.y > segMaxY ||
      box.max.z < segMinZ ||
      box.min.z > segMaxZ
    ) {
      continue;
    }
    const tHit = rayAabbDistance(ox, oy, oz, dirX, dirY, dirZ, box, tEnd);
    if (tHit != null && tHit > tMin && tHit < tEnd) return true;
  }
  return false;
}
