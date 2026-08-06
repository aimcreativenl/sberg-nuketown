/**
 * Interactive house doors — E to toggle, swing inward, solid when closed.
 * Bots call requestOpen() when their path is blocked by a closed door.
 */
import * as THREE from 'three';

const INTERACT_RADIUS = 1.55;
const BOT_OPEN_RADIUS = 2.35;
/** Max |eyeY − door mid Y| so L2 cannot toggle an L1 door underneath */
const INTERACT_MAX_DY = 1.25;
const SWING_SPEED = 3.4; // anim units / sec (0→1)

export class DoorManager {
  /**
   * @param {Array<object>} doors from mapData.doors
   * @param {{ onSolidChange?: (collider: object, solid: boolean) => void }} [opts]
   *   `onSolidChange` — Phase 1b hook so a `PhysicsManager` can mirror the
   *   legacy `collider.solid` flag onto the matching Rapier collider. Set
   *   lazily by `Game.initPhysics()` (read at call-time, not captured here).
   */
  constructor(doors = [], opts = {}) {
    this.doors = doors;
    this.onSolidChange = opts.onSolidChange || null;
  }

  /** Set a door's collider solidity and mirror it into physics if wired up. */
  _setSolid(door, solid) {
    if (!door?.collider) return;
    door.collider.solid = solid;
    this.onSolidChange?.(door.collider, solid);
  }

  update(dt) {
    for (const d of this.doors) {
      const target = d.open ? 1 : 0;
      if (Math.abs(d.anim - target) < 0.001) {
        d.anim = target;
      } else {
        const dir = Math.sign(target - d.anim);
        d.anim = THREE.MathUtils.clamp(d.anim + dir * SWING_SPEED * dt, 0, 1);
      }
      const yaw = THREE.MathUtils.lerp(d.closedYaw, d.openYaw, easeOutCubic(d.anim));
      if (d.pivot) d.pivot.rotation.y = yaw;
      // Passable while open / swinging; solid again as it finishes closing
      if (d.collider) {
        this._setSolid(d, d.open ? false : d.anim < 0.2);
      }
    }
  }

  /**
   * Nearest door within XZ radius AND same storey (Y).
   * @param {{x:number,y?:number,z:number}|THREE.Vector3} pos eye or feet
   * @param {number} [radius]
   * @param {{ maxDy?: number }} [opts]
   */
  getNearby(pos, radius = INTERACT_RADIUS, opts = {}) {
    const maxDy = opts.maxDy ?? INTERACT_MAX_DY;
    const py = pos.y ?? 0;
    let best = null;
    let bestD = radius;
    for (const d of this.doors) {
      const doorY = d.interact?.y ?? 1.15;
      if (Math.abs(py - doorY) > maxDy) continue;
      const dx = pos.x - d.interact.x;
      const dz = pos.z - d.interact.z;
      const dist = Math.hypot(dx, dz);
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  }

  /** @param {string} id door.name */
  getById(id) {
    if (!id) return null;
    return this.doors.find((d) => d.name === id) || null;
  }

  /**
   * Set absolute open state (MP host authority / event apply). Idempotent.
   * @param {object|string} doorOrId
   * @param {boolean} open
   */
  setOpen(doorOrId, open) {
    const door = typeof doorOrId === 'string' ? this.getById(doorOrId) : doorOrId;
    if (!door) return null;
    const next = !!open;
    if (door.open === next) return door;
    door.open = next;
    if (door.open && door.collider) this._setSolid(door, false);
    return door;
  }

  toggle(door) {
    if (!door) return false;
    return !!this.setOpen(door, !door.open);
  }

  tryToggleAt(pos) {
    const d = this.getNearby(pos);
    if (!d) return null;
    this.toggle(d);
    return d;
  }

  /** Compact door states for MP snapshots / late join. */
  toNetState() {
    return this.doors.map((d) => ({ id: d.name, open: !!d.open }));
  }

  /** Apply host door list (snapshot or full sync). */
  applyNetState(list) {
    if (!list?.length) return;
    for (const entry of list) {
      if (!entry?.id) continue;
      this.setOpen(entry.id, !!entry.open);
    }
  }

  /** Bot: open a closed door near feet if present. */
  requestOpenNear(pos, radius = BOT_OPEN_RADIUS) {
    const d = this.getNearby(pos, radius);
    if (d && !d.open) {
      d.open = true;
      if (d.collider) this._setSolid(d, false);
      return d;
    }
    return null;
  }

  /**
   * If move from→to is blocked by a closed door collider, open that door.
   * @returns {object|null} door opened
   */
  openBlockingDoor(from, to, _colliders) {
    for (const d of this.doors) {
      if (d.open || !d.collider?.box) continue;
      const box = d.collider.box;
      if (segmentHitsAabbXZ(from, to, box)) {
        d.open = true;
        this._setSolid(d, false);
        return d;
      }
      if (Math.hypot((to.x ?? 0) - d.interact.x, (to.z ?? 0) - d.interact.z) < BOT_OPEN_RADIUS) {
        d.open = true;
        this._setSolid(d, false);
        return d;
      }
    }
    return null;
  }
}

function easeOutCubic(t) {
  const u = 1 - t;
  return 1 - u * u * u;
}

function segmentHitsAabbXZ(from, to, box) {
  const x0 = from.x;
  const z0 = from.z;
  const x1 = to.x;
  const z1 = to.z;
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
  return (
    clip(-dx, x0 - box.min.x) &&
    clip(dx, box.max.x - x0) &&
    clip(-dz, z0 - box.min.z) &&
    clip(dz, box.max.z - z0) &&
    t0 <= t1 &&
    t1 > 1e-4 &&
    t0 < 1 - 1e-4
  );
}
