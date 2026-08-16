/**
 * Phase A pure horizontal movement helpers (ground accel/friction + limited air control).
 * No scene/Three dependency — safe for unit tests and Player.update.
 */

/**
 * Grounded wish: apply friction, then accelerate toward wish velocity.
 * wishX/wishZ = desired velocity (direction * speed, or zero when no input).
 * When overspeed or no wish, friction pulls speed down.
 *
 * @returns {{ vx: number, vz: number }}
 */
export function applyGroundWish(vx, vz, wishX, wishZ, maxSpeed, accel, friction, dt) {
  if (dt <= 0) return { vx, vz };

  // Friction (Quake-style: drop proportional to current speed)
  let speed = Math.hypot(vx, vz);
  if (speed > 1e-8) {
    const drop = speed * friction * dt;
    const newSpeed = Math.max(0, speed - drop);
    const scale = newSpeed / speed;
    vx *= scale;
    vz *= scale;
    speed = newSpeed;
  } else {
    vx = 0;
    vz = 0;
    speed = 0;
  }

  const wishLen = Math.hypot(wishX, wishZ);
  if (wishLen < 1e-8 || maxSpeed <= 0 || accel <= 0) {
    return { vx, vz };
  }

  const wishDirX = wishX / wishLen;
  const wishDirZ = wishZ / wishLen;
  const wishSpeed = Math.min(wishLen, maxSpeed);

  // Accelerate only along the component still below wishSpeed
  const currentAlong = vx * wishDirX + vz * wishDirZ;
  const addSpeed = wishSpeed - currentAlong;
  if (addSpeed <= 0) return { vx, vz };

  // Source/Quake: accelspeed = min(accel * dt * wishspeed, addSpeed)
  let accelSpeed = accel * dt * wishSpeed;
  if (accelSpeed > addSpeed) accelSpeed = addSpeed;

  vx += accelSpeed * wishDirX;
  vz += accelSpeed * wishDirZ;
  return { vx, vz };
}

/**
 * Air wish: limited air control — accelerate toward wish but never instantly set full speed.
 * No friction; cannot reduce speed when changing direction beyond additive accel.
 *
 * @returns {{ vx: number, vz: number }}
 */
export function applyAirWish(vx, vz, wishX, wishZ, maxSpeed, airAccel, dt) {
  if (dt <= 0 || airAccel <= 0 || maxSpeed <= 0) return { vx, vz };

  const wishLen = Math.hypot(wishX, wishZ);
  if (wishLen < 1e-8) return { vx, vz };

  const wishDirX = wishX / wishLen;
  const wishDirZ = wishZ / wishLen;
  const wishSpeed = Math.min(wishLen, maxSpeed);

  const currentAlong = vx * wishDirX + vz * wishDirZ;
  const addSpeed = wishSpeed - currentAlong;
  if (addSpeed <= 0) return { vx, vz };

  let accelSpeed = airAccel * dt * wishSpeed;
  if (accelSpeed > addSpeed) accelSpeed = addSpeed;

  vx += accelSpeed * wishDirX;
  vz += accelSpeed * wishDirZ;
  return { vx, vz };
}

/** Default max walk-up height (must match Player.STEP_UP). */
export const DEFAULT_STEP_UP = 0.55;

/**
 * True only if a solid's top is within step-up of feet AND a walkable floor pad
 * sits on that top (XZ overlap). Prevents walk-through furniture/walls that
 * merely happen to be short enough to look "stepable".
 *
 * @param {{ min: {x:number,y:number,z:number}, max: {x:number,y:number,z:number} }} box
 * @param {number} feet
 * @param {Array<{minX:number,maxX:number,minZ:number,maxZ:number,y:number}>} floors
 * @param {{ stepUp?: number, yTol?: number, pad?: number }} [opts]
 */
export function isStepableSolid(box, feet, floors, opts = {}) {
  if (!box?.min || !box?.max || !floors?.length) return false;
  const stepUp = opts.stepUp ?? DEFAULT_STEP_UP;
  const yTol = opts.yTol ?? 0.16;
  const pad = opts.pad ?? 0.1;
  const top = box.max.y;
  if (!(top > feet - 0.02 && top <= feet + stepUp + 0.06)) return false;

  for (const f of floors) {
    // Floor surface must sit on/near the solid top
    if (f.y < top - yTol || f.y > top + yTol) continue;
    // XZ overlap between floor pad and solid footprint
    if (f.maxX < box.min.x - pad || f.minX > box.max.x + pad) continue;
    if (f.maxZ < box.min.z - pad || f.minZ > box.max.z + pad) continue;
    return true;
  }
  return false;
}

/**
 * Pick support floor y under a player eye position.
 *
 * Rules:
 * - Grounded: floors in [feet - stick, feet + stepUp] + sticky preferY (roof stick).
 * - Airborne rising: almost no step-up (no jump→roof teleport).
 * - Airborne falling: land on floors crossed this frame [feet, prevFeet] so high-speed
 *   falls cannot tunnel through the world ground (user fall-through bug).
 *
 * @param {number} eyeY
 * @param {number} height
 * @param {number} x
 * @param {number} z
 * @param {Array<{minX:number,maxX:number,minZ:number,maxZ:number,y:number}>} floors
 * @param {{
 *   stepUp?: number,
 *   pad?: number,
 *   grounded?: boolean,
 *   preferY?: number|null,
 *   prevFeet?: number|null,
 *   falling?: boolean,
 * }} [opts]
 * @returns {number|null} floor y or null if no support
 */
export function pickFloorY(eyeY, height, x, z, floors, opts = {}) {
  const stepUp = opts.stepUp ?? DEFAULT_STEP_UP;
  const pad = opts.pad ?? 0.22;
  const grounded = !!opts.grounded;
  const preferY = opts.preferY;
  const prevFeet = opts.prevFeet;
  const falling = opts.falling !== false && (opts.falling === true || (prevFeet != null && eyeY - height < prevFeet));
  const feet = eyeY - height;

  // Airborne rising: tiny maxUp. Falling: allow floors we just crossed (anti-tunnel).
  let maxUp = grounded ? stepUp : 0.08;
  if (!grounded && falling && prevFeet != null && prevFeet > feet) {
    // Any surface between previous and current feet was crossed this frame
    maxUp = Math.max(maxUp, prevFeet - feet + 0.12);
  }
  // Recovery: if already slightly under a surface, still snap (not only 0.06)
  if (!grounded && falling) {
    maxUp = Math.max(maxUp, 0.35);
  }

  const minDown = grounded ? feet - 0.45 : feet - 6;

  let best = null;
  for (const f of floors || []) {
    if (
      x < f.minX - pad ||
      x > f.maxX + pad ||
      z < f.minZ - pad ||
      z > f.maxZ + pad
    ) {
      continue;
    }
    if (f.y > feet + maxUp + 1e-4) continue;
    if (f.y < minDown) continue;
    // When falling with prevFeet, prefer surfaces we actually crossed or are at
    if (!grounded && falling && prevFeet != null) {
      // Reject floors still well above where we started this frame (no roof pull)
      if (f.y > prevFeet + 0.08) continue;
    }
    if (best == null || f.y > best) best = f.y;
  }

  // Sticky elevated surface while grounded
  if (preferY != null && grounded) {
    for (const f of floors || []) {
      if (Math.abs(f.y - preferY) > 0.04) continue;
      if (
        x >= f.minX - pad &&
        x <= f.maxX + pad &&
        z >= f.minZ - pad &&
        z <= f.maxZ + pad &&
        feet >= preferY - 0.5 &&
        feet <= preferY + stepUp + 0.08
      ) {
        if (best == null || preferY >= best - 1e-4) best = preferY;
        break;
      }
    }
  }

  return best;
}

/**
 * Moving-walkway carry (m/s). Only while sprinting and standing in the belt AABB.
 * Do not add this into velocity — apply as a position delta so it does not compound.
 * @returns {{ dx: number, dz: number }|null}
 */
export function beltCarryDelta(x, feetY, z, sprinting, belts) {
  if (!sprinting || !belts?.length) return null;
  for (let i = 0; i < belts.length; i++) {
    const belt = belts[i];
    if (!belt) continue;
    if (x < belt.minX || x > belt.maxX || z < belt.minZ || z > belt.maxZ) continue;
    if (feetY < (belt.yMin ?? -1e9) || feetY > (belt.yMax ?? 1e9)) continue;
    const speed = Number(belt.speed);
    if (!Number.isFinite(speed) || speed === 0) continue;
    return { dx: (belt.dirX || 0) * speed, dz: (belt.dirZ || 0) * speed };
  }
  return null;
}

/**
 * Double-Space roof edge mantle — tight vertical reach, edge-only.
 * Must NOT fire for interior under-roof jumps (house footprint under main plate).
 *
 * @param {{ x: number, y: number, z: number }} eyePos
 * @param {number} height
 * @param {Array<{ minX:number, maxX:number, minZ:number, maxZ:number, y:number, kind?: string }>} zones
 * @param {{ reach?: number, margin?: number, edgeBand?: number, inset?: number }} [opts]
 * @returns {{ y: number, x: number, z: number, zone: object } | null}
 */
export function tryRoofMantle(eyePos, height, zones, opts = {}) {
  if (!zones?.length || !eyePos) return null;
  // Tight reach: only true ledge grab, not L2 jumps under the plate
  const reach = opts.reach ?? 0.82;
  const margin = opts.margin ?? 0.55;
  const edgeBand = opts.edgeBand ?? 1.35;
  const inset = opts.inset ?? 0.4;
  const feet = eyePos.y - height;

  let best = null;
  for (const zone of zones) {
    if (zone?.y == null) continue;
    if (feet >= zone.y - 0.06) continue;
    if (zone.y - feet > reach) continue;

    const inX = eyePos.x >= zone.minX - margin && eyePos.x <= zone.maxX + margin;
    const inZ = eyePos.z >= zone.minZ - margin && eyePos.z <= zone.maxZ + margin;
    if (!inX || !inZ) continue;

    // Must be near perimeter — reject deep under-plate interior
    const distEdge = Math.min(
      eyePos.x - zone.minX,
      zone.maxX - eyePos.x,
      eyePos.z - zone.minZ,
      zone.maxZ - eyePos.z
    );
    // Outside the plate counts as edge (negative distEdge when outside)
    if (distEdge > edgeBand) continue;

    if (!best || zone.y > best.y) best = zone;
  }
  if (!best) return null;

  const minX = best.minX + inset;
  const maxX = best.maxX - inset;
  const minZ = best.minZ + inset;
  const maxZ = best.maxZ - inset;
  // Degenerate after inset
  const cx = (best.minX + best.maxX) / 2;
  const cz = (best.minZ + best.maxZ) / 2;
  const x =
    minX <= maxX ? Math.min(maxX, Math.max(minX, eyePos.x)) : cx;
  const z =
    minZ <= maxZ ? Math.min(maxZ, Math.max(minZ, eyePos.z)) : cz;
  return { y: best.y, x, z, zone: best };
}
