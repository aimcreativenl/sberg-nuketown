import * as THREE from 'three';
import { HEAD_HIT_RADIUS } from './constants.js';

/**
 * Ray vs sphere. Shared by player hitscan and crouch tests.
 * @returns {{ dist: number, point: THREE.Vector3 } | null}
 */
export function rayHitsSphere(origin, dir, center, radius) {
  const ox = origin.x - center.x;
  const oy = origin.y - center.y;
  const oz = origin.z - center.z;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  let t = -b - s;
  if (t < 0) t = -b + s;
  if (t < 0 || t > 200) return null;
  return {
    dist: t,
    point: new THREE.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t),
  };
}

/** Extra metres so a hit on the helmet brim / neck still counts as head. */
const HEAD_SLOP = 0.04;

/**
 * True when the impact sits on the visual head, even if a larger torso
 * volume was the first intersection.
 * @param {import('three').Vector3} point
 * @param {import('three').Vector3} head
 * @param {number} [radius]
 */
export function isHeadshotPoint(point, head, radius = HEAD_HIT_RADIUS) {
  if (!point || !head) return false;
  return point.distanceTo(head) <= radius + HEAD_SLOP;
}

/**
 * Closest volume hit on one target. Prefer a headshot when the ray also
 * clips the head or the body impact is still inside the head sphere.
 *
 * @returns {{ dist: number, headshot: boolean, point: import('three').Vector3 } | null}
 */
export function pickVolumeHit(origin, dir, range, volumes, head, opts = {}) {
  const rayHitsSphere = opts.rayHitsSphere;
  const rayHitsCapsule = opts.rayHitsCapsule;
  const shotBlocked = opts.shotBlocked;
  const minDist = opts.minDist ?? 0.05;

  let bodyBest = null;
  let headBest = null;

  for (const vol of volumes || []) {
    const hit =
      vol.kind === 'capsule'
        ? rayHitsCapsule(origin, dir, vol.a, vol.b, vol.radius)
        : rayHitsSphere(origin, dir, vol.center, vol.radius);
    if (!hit || hit.dist > range || hit.dist < minDist) continue;
    if (shotBlocked?.(origin, hit.point, hit.dist)) continue;
    const candidate = { dist: hit.dist, headshot: !!vol.headshot, point: hit.point };
    if (vol.headshot) {
      if (!headBest || candidate.dist < headBest.dist) headBest = candidate;
    } else if (!bodyBest || candidate.dist < bodyBest.dist) {
      bodyBest = candidate;
    }
  }

  // Overlapping torso: lethal headshot, but keep the head hit's distance so a
  // farther bot's body capsule cannot steal a closer bot in front.
  if (
    headBest &&
    (!bodyBest || headBest.dist <= bodyBest.dist || isHeadshotPoint(bodyBest.point, head))
  ) {
    return headBest;
  }
  if (bodyBest && isHeadshotPoint(bodyBest.point, head)) {
    return { ...bodyBest, headshot: true };
  }
  return bodyBest;
}
