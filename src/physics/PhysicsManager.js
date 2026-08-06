/**
 * Phase 1a/1b — Rapier-backed physics world.
 *
 * Wraps `@dimforge/rapier3d-compat` behind a small game-shaped API so
 * `Game.js` / `Player.js` can opt into real 3D collision (static map geometry
 * + a kinematic capsule character controller) while `collision.js` / shot-LOS
 * keep using the legacy AABB list until a later phase.
 *
 * Nothing in here mutates `mapData` — it only *reads* `colliders`/`floors`
 * to build a parallel Rapier world, and writes back into Rapier collider
 * enabled-state when `setColliderSolid` is called (e.g. by `Doors.js`).
 */
import { GRAVITY, PLAYER_HEIGHT, PLAYER_RADIUS, PLAYER_JUMP } from '../game/constants.js';

/** Filled by `initRapier()` via dynamic import (keeps the WASM chunk out of the main bundle). */
let RAPIER = null;

/** Thin floor pads (walk/autostep support) — must stay < MIN_SOLID_HEIGHT-ish so they read as "floor", not "wall". */
const FLOOR_PAD_THICKNESS = 0.08;

/**
 * Collider kinds that come out of `MapBuilder` as thin (~0.28m) decorative
 * plates chained together with LARGE horizontal overlap (garage climb pads,
 * roof-to-roof climb pads, interior stair treads). Treating them as generic
 * thin solids/floors leaves a floating slab hovering INSIDE the player
 * capsule whenever the next tier's footprint overlaps the current one at a
 * different Y — see `_buildStepSolids` for the real fix.
 */
const STEP_KINDS = new Set(['climb_pad', 'roof_climb', 'stair_tread']);

/**
 * Colliders that must never become Rapier body solids:
 * - `garage_roof`: walk surface comes from floors[] / climb boarding
 * - `house_floor`: shot/LOS slabs (h=0.28) — legacy Player ignores h<0.35; if we
 *   keep them in Rapier they become mid-stair ceilings beside the stairwell
 */
const SKIP_SOLID_KINDS = new Set(['garage_roof', 'house_floor']);

/** Match `Player.js` body filter — thin shot floors / trim must not block the capsule. */
const MIN_BODY_SOLID_HEIGHT = 0.35;

/** Two footprints on the same tier (e.g. climb pad + landing bridge) — keep tight so near-height chain steps like 5.33 vs 5.43 still count as neighbors. */
const TIER_EPS = 0.04;

/** Minimum vertical gap before a floor is considered to be floating "above" a step's walk surface at all (avoids flagging same-level floors due to float noise). */
const CEILING_MIN_GAP = 0.05;

export class PhysicsManager {
  /** Shared init promise so multiple callers can safely await init concurrently. */
  static _initPromise = null;

  /**
   * Initialize the Rapier WASM module. Idempotent — safe to call more than once
   * (subsequent calls resolve immediately once the first init has completed).
   */
  static async initRapier() {
    if (!PhysicsManager._initPromise) {
      PhysicsManager._initPromise = (async () => {
        // Dynamic import → separate Vite chunk (~Rapier WASM) instead of bloating main.
        const mod = await import('@dimforge/rapier3d-compat');
        RAPIER = mod.default;
        // init() takes no args (see init.d.ts). Compat 0.19 may still log a cosmetic
        // deprecation from inside its own wrapper — not fixable at the call site.
        await RAPIER.init();
        return RAPIER;
      })();
    }
    await PhysicsManager._initPromise;
    return RAPIER;
  }

  constructor() {
    if (!RAPIER) {
      throw new Error('PhysicsManager: call PhysicsManager.initRapier() before constructing');
    }
    this.RAPIER = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
    /** All static bodies created for map colliders + floor pads. */
    this.staticEntries = [];
    /** colliderId (index / generated string) -> { rigidBody, collider, meta } */
    this.colliderById = new Map();
    /** Legacy collider object (from mapData.colliders) -> entry, for O(1) Doors.js sync. */
    this._legacyToEntry = new WeakMap();
    this._accumulator = 0;
  }

  /** Remove every static body/collider previously created by `setMapFromMapData`. */
  _clearStatics() {
    for (const entry of this.staticEntries) {
      try {
        this.world.removeRigidBody(entry.rigidBody);
      } catch (err) {
        // Body may already be gone (world torn down) — non-fatal.
      }
    }
    this.staticEntries = [];
    this.colliderById = new Map();
    this._legacyToEntry = new WeakMap();
  }

  /**
   * Build (or rebuild) the Rapier static world from `mapData` (see `MapBuilder.js`):
   * - `mapData.colliders[]`: `{ box: THREE.Box3, solid, kind, house, ... }` -> fixed cuboid.
   * - `mapData.floors[]`: `{ minX, maxX, minZ, maxZ, y }` -> thin fixed cuboid walk pad
   *   (needed for autostep/snap-to-ground since floors[] has no real Rapier presence otherwise).
   * @param {{ colliders?: Array<object>, floors?: Array<object> }} mapData
   */
  setMapFromMapData(mapData) {
    this._clearStatics();
    const RAPIER_ = this.RAPIER;
    const colliders = mapData?.colliders || [];

    // Real step solids for climb/stair chains — gives autostep an actual riser
    // to climb instead of a floating thin floor pad (see _buildStepSolids doc).
    const stepFootprints = this._buildStepSolids(colliders);
    // Last step is often 0.45m below a landing floor (main roof) — add a riser
    // so Rapier can autostep onto that destination without a mid-body floor slab.
    this._extendStepsToLandings(mapData?.floors || [], stepFootprints);

    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (!c || c.solid === false) continue;
      if (c.kind && (STEP_KINDS.has(c.kind) || SKIP_SOLID_KINDS.has(c.kind))) continue;
      const box = c.box;
      if (!box || !box.min || !box.max) continue;
      // Match legacy body filter: h < 0.35 is shot/visual only (floors[] walk pads remain).
      const solidH = box.max.y - box.min.y;
      if (solidH < MIN_BODY_SOLID_HEIGHT && c.kind !== 'house_door' && c.kind !== 'fence') continue;

      const cx = (box.min.x + box.max.x) / 2;
      const cy = (box.min.y + box.max.y) / 2;
      const cz = (box.min.z + box.max.z) / 2;
      const hx = Math.max(0.01, (box.max.x - box.min.x) / 2);
      const hy = Math.max(0.01, (box.max.y - box.min.y) / 2);
      const hz = Math.max(0.01, (box.max.z - box.min.z) / 2);

      const rigidBody = this.world.createRigidBody(
        RAPIER_.RigidBodyDesc.fixed().setTranslation(cx, cy, cz)
      );
      const colliderDesc = RAPIER_.ColliderDesc.cuboid(hx, hy, hz);
      const rapierCollider = this.world.createCollider(colliderDesc, rigidBody);

      const entry = { rigidBody, collider: rapierCollider, meta: c, colliderId: i };
      this.staticEntries.push(entry);
      this.colliderById.set(i, entry);
      this._legacyToEntry.set(c, entry);
    }

    const floors = mapData?.floors || [];
    let floorPieceSeq = 0;
    for (let i = 0; i < floors.length; i++) {
      const f = floors[i];
      if (!f) continue;
      // Drop small floors that duplicate a step solid walk top (avoids mid-capsule slabs).
      if (this._isSmallStepWalkPad(f, stepFootprints)) continue;
      // May return several rectangles: climb-corridor trimmed, deck kept intact.
      const pieces = this._clipFloorAgainstSteps(f, stepFootprints);
      for (const clipped of pieces) {
        const w = clipped.maxX - clipped.minX;
        const d = clipped.maxZ - clipped.minZ;
        if (w < 0.05 || d < 0.05) continue;

        const hx = Math.max(0.01, w / 2);
        const hz = Math.max(0.01, d / 2);
        const cx = (clipped.minX + clipped.maxX) / 2;
        const cz = (clipped.minZ + clipped.maxZ) / 2;
        const cy = clipped.y - FLOOR_PAD_THICKNESS / 2;

        const rigidBody = this.world.createRigidBody(
          RAPIER_.RigidBodyDesc.fixed().setTranslation(cx, cy, cz)
        );
        const colliderDesc = RAPIER_.ColliderDesc.cuboid(hx, FLOOR_PAD_THICKNESS / 2, hz);
        const rapierCollider = this.world.createCollider(colliderDesc, rigidBody);

        const colliderId = `floor_${i}_${floorPieceSeq++}`;
        const entry = {
          rigidBody,
          collider: rapierCollider,
          meta: { kind: 'floor_pad', floorIndex: i },
          colliderId,
        };
        this.staticEntries.push(entry);
        this.colliderById.set(colliderId, entry);
      }
    }
  }

  /** Small floors that duplicate a step solid walk top (area ≲ 8m²). */
  _isSmallStepWalkPad(floor, stepFootprints) {
    const area = (floor.maxX - floor.minX) * (floor.maxZ - floor.minZ);
    if (area > 8) return false;
    for (const s of stepFootprints) {
      if (Math.abs(floor.y - s.topY) > 0.12) continue;
      const ox = Math.min(floor.maxX, s.maxX) - Math.max(floor.minX, s.minX);
      const oz = Math.min(floor.maxZ, s.maxZ) - Math.max(floor.minZ, s.minZ);
      if (ox > 0.15 && oz > 0.15) return true;
    }
    return false;
  }

  /**
   * When a floor sits ≤ STEP_UP above the highest overlapping step (e.g. main
   * roof at 5.88 above last roof_climb pad at 5.43), add a real riser solid so
   * the character can autostep onto it. A thin floor pad at that height would
   * sit inside the capsule while standing on the last pad.
   */
  _extendStepsToLandings(floors, stepFootprints) {
    const RAPIER_ = this.RAPIER;
    const STEP_UP = 0.55;
    for (let i = 0; i < floors.length; i++) {
      const f = floors[i];
      if (!f) continue;

      // Only extend from the highest step of ITS OWN chain that overlaps this
      // floor in full XZ — not from every intermediate tread under a big deck
      // floor, and NOT from an unrelated chain that merely shares X-space
      // (e.g. garage climb_pad at x≈-27.5 and roof→main roof_climb at x≈-24.2
      // both sit under the same wide garage-roof deck floor; grouping by
      // `key` keeps their "chain top" detection independent).
      const overlapping = stepFootprints.filter(
        (s) => !(f.minX >= s.maxX || f.maxX <= s.minX || f.minZ >= s.maxZ || f.maxZ <= s.minZ)
      );
      if (!overlapping.length) continue;
      const bandMaxTopByKey = new Map();
      for (const s of overlapping) {
        const prevMax = bandMaxTopByKey.get(s.key) ?? -Infinity;
        if (s.topY > prevMax) bandMaxTopByKey.set(s.key, s.topY);
      }

      let best = null;
      for (const s of overlapping) {
        const bandMaxTop = bandMaxTopByKey.get(s.key);
        if (s.topY < bandMaxTop - 0.05) continue;
        const rise = f.y - s.topY;
        if (rise <= CEILING_MIN_GAP || rise > STEP_UP) continue;
        best = s;
        break;
      }
      if (!best) continue;

      // Anchor the landing on `best`'s OWN footprint (not clamped into the
      // floor's rectangle) — the floor entry that triggers this (e.g. the
      // narrow "main roof landing bridge") may not fully cover the highest
      // step's position, and clamping to it there previously produced a
      // landing riser floating over the WRONG (lower) step, ~0.05 above its
      // tread — a thin ceiling that blocked the climb well before the top.
      // Extend outward from `best` toward the direction the chain is rising
      // (away from the next-highest step in the same chain) so the riser
      // sits where the character actually needs to step up from.
      const sameChain = overlapping
        .filter((s) => s.key === best.key)
        .sort((a, b) => a.topY - b.topY);
      let dirZ = 1;
      if (sameChain.length >= 2) {
        const top = sameChain[sameChain.length - 1];
        const second = sameChain[sameChain.length - 2];
        const zTop = (top.minZ + top.maxZ) / 2;
        const zSecond = (second.minZ + second.maxZ) / 2;
        if (Math.abs(zTop - zSecond) > 0.05) dirZ = Math.sign(zTop - zSecond);
      }
      const LEDGE = 0.5;
      const minX = best.minX - 0.15;
      const maxX = best.maxX + 0.15;
      const minZ = dirZ >= 0 ? best.minZ : best.minZ - LEDGE;
      const maxZ = dirZ >= 0 ? best.maxZ + LEDGE : best.maxZ;
      if (maxX - minX < 0.1 || maxZ - minZ < 0.1) continue;

      const topY = f.y;
      const bottomY = best.topY - 0.05;
      const cx = (minX + maxX) / 2;
      const cy = (topY + bottomY) / 2;
      const cz = (minZ + maxZ) / 2;
      const hx = Math.max(0.01, (maxX - minX) / 2);
      const hy = Math.max(0.01, (topY - bottomY) / 2);
      const hz = Math.max(0.01, (maxZ - minZ) / 2);

      const rigidBody = this.world.createRigidBody(
        RAPIER_.RigidBodyDesc.fixed().setTranslation(cx, cy, cz)
      );
      const colliderDesc = RAPIER_.ColliderDesc.cuboid(hx, hy, hz);
      const rapierCollider = this.world.createCollider(colliderDesc, rigidBody);
      const colliderId = `landing_${i}`;
      const entry = {
        rigidBody,
        collider: rapierCollider,
        meta: { kind: 'landing_step', floorIndex: i },
        colliderId,
      };
      this.staticEntries.push(entry);
      this.colliderById.set(colliderId, entry);
      stepFootprints.push({ minX, maxX, minZ, maxZ, topY, key: best.key });
    }
  }

  /**
   * Build real Rapier solids for `climb_pad` / `roof_climb` / `stair_tread`
   * chains so the CharacterController's autostep has an actual riser (a solid
   * vertical face) to climb, instead of the thin floating floor slabs that
   * caused the garage-climb capsule to get stuck around feet y≈0.52–0.63.
   *
   * Chains are grouped by `(kind, house, chain)` and sorted by ascending walk
   * height (topY). Garage climb pads rise toward +Z; roof→main-roof pads rise
   * toward −Z — sorting by Y keeps riser wiring correct for both.
   *  - Keep the collider's own X footprint (kept close to source geometry).
   *  - Shrink the Z footprint so it doesn't reach past the midpoint to its
   *    nearest DIFFERENT-tier neighbor, so consecutive steps stop having the
   *    huge horizontal overlap that let a higher tier's slab hover inside the
   *    capsule while standing on a lower one. Same-tier siblings (e.g. a
   *    narrow climb pad + its wide landing bridge sharing one Z position)
   *    are ignored for this so neither one collapses to zero width.
   *  - Extend the solid's bottom down to (previous tier's top − small overlap)
   *    so the riser is a real connected volume, not a hovering plate — this
   *    is what lets Rapier's autostep treat it as a normal step-up.
   *
   * @returns {Array<{minX:number,maxX:number,minZ:number,maxZ:number,topY:number}>}
   *   Footprints of every step solid built, used by `_clipFloorAgainstSteps`
   *   to trim/drop floor pads that would otherwise act as low ceilings.
   */
  _buildStepSolids(colliders) {
    const RAPIER_ = this.RAPIER;
    const groups = new Map();
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (!c || c.solid === false || !c.kind || !STEP_KINDS.has(c.kind)) continue;
      const box = c.box;
      if (!box || !box.min || !box.max) continue;
      const key = `${c.kind}|${c.house || ''}|${c.chain || ''}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({
        index: i,
        c,
        box,
        z: (box.min.z + box.max.z) / 2,
        topY: box.max.y,
        key,
      });
    }

    const footprints = [];
    for (const members of groups.values()) {
      // Ascend along +Z (garage) or −Z (roof→main). Sort so `prev` is always
      // the lower tread — original garage-climb logic relied on +Z order.
      const byY = [...members].sort((a, b) => a.topY - b.topY || a.z - b.z);
      const ascendPosZ = byY.length < 2 || byY[byY.length - 1].z >= byY[0].z - 0.05;
      members.sort((a, b) => (ascendPosZ ? a.z - b.z : b.z - a.z));

      for (let idx = 0; idx < members.length; idx++) {
        const cur = members[idx];
        const { box } = cur;
        const topY = cur.topY;
        const minX = box.min.x;
        const maxX = box.max.x;
        const centerZ = cur.z;
        const origHalfZ = (box.max.z - box.min.z) / 2;

        // Nearest different-Z neighbor along the sorted climb axis (same-Z
        // siblings = climb pad + landing bridge).
        let prev = null;
        for (let k = idx - 1; k >= 0; k--) {
          if (Math.abs(members[k].z - centerZ) > TIER_EPS) {
            prev = members[k];
            break;
          }
        }
        let next = null;
        for (let k = idx + 1; k < members.length; k++) {
          if (Math.abs(members[k].z - centerZ) > TIER_EPS) {
            next = members[k];
            break;
          }
        }

        // World-space Z shrink toward neighbors (safe for +Z and −Z sorts).
        let minZ = centerZ - origHalfZ;
        let maxZ = centerZ + origHalfZ;
        for (const n of [prev, next]) {
          if (!n) continue;
          const mid = (centerZ + n.z) / 2;
          if (n.z < centerZ) minZ = Math.max(minZ, mid);
          else maxZ = Math.min(maxZ, mid);
        }
        if (maxZ - minZ < 0.08) {
          minZ = centerZ - 0.04;
          maxZ = centerZ + 0.04;
        }

        // Riser from the true lower tread by height (not only Z-sort prev) —
        // near-height pads (e.g. 5.33 vs 5.43) otherwise kept a floating plate.
        const OVERLAP = 0.05;
        const STEP_UP = 0.55;
        let lower = null;
        for (const m of members) {
          if (m.topY >= topY - 0.02) continue;
          if (!lower || m.topY > lower.topY) lower = m;
        }
        let bottomY = box.min.y;
        if (lower) {
          bottomY = Math.min(bottomY, lower.topY - OVERLAP);
        } else {
          // First tread in a chain: solid face down by one STEP_UP so autostep
          // sees a real riser from the approach surface (ground or garage deck).
          bottomY = Math.min(bottomY, topY - STEP_UP);
        }
        bottomY = Math.min(bottomY, topY - 0.05);

        const cx = (minX + maxX) / 2;
        const cy = (topY + bottomY) / 2;
        const cz = (minZ + maxZ) / 2;
        const hx = Math.max(0.01, (maxX - minX) / 2);
        const hy = Math.max(0.01, (topY - bottomY) / 2);
        const hz = Math.max(0.01, (maxZ - minZ) / 2);

        const rigidBody = this.world.createRigidBody(
          RAPIER_.RigidBodyDesc.fixed().setTranslation(cx, cy, cz)
        );
        const colliderDesc = RAPIER_.ColliderDesc.cuboid(hx, hy, hz);
        const rapierCollider = this.world.createCollider(colliderDesc, rigidBody);

        const entry = { rigidBody, collider: rapierCollider, meta: cur.c, colliderId: cur.index };
        this.staticEntries.push(entry);
        this.colliderById.set(cur.index, entry);
        this._legacyToEntry.set(cur.c, entry);

        // `key` (kind|house|chain) tags which chain this footprint belongs to —
        // required downstream so a wide deck floor that happens to overlap TWO
        // unrelated chains in X (e.g. garage climb_pad at x≈-27.5 AND the
        // roof→main roof_climb at x≈-24.2, both under the garage roof deck)
        // doesn't let one chain's Z-direction/height hijack the other's floor
        // clipping — see `_clipFloorAgainstSteps` / `_extendStepsToLandings`.
        footprints.push({ minX, maxX, minZ, maxZ, topY, key: cur.key });
      }
    }
    return footprints;
  }

  /**
   * Split a `floors[]` pad so it cannot act as a low ceiling over intermediate
   * climb steps, WITHOUT deleting the walkable deck beside the climb — and
   * WITHOUT deleting the step's own walk pad.
   *
   * Climb direction may be +Z (garage pads) or −Z (roof→main-roof pads). The
   * corridor trim follows the ascent direction inferred from step footprints.
   *
   * @returns {Array<{minX:number,maxX:number,minZ:number,maxZ:number,y:number}>}
   */
  _clipFloorAgainstSteps(floor, stepFootprints) {
    const { minX, maxX, minZ, maxZ, y } = floor;
    if (maxX - minX < 0.05 || maxZ - minZ < 0.05) return [];

    // Walk pads that ARE a step top are skipped earlier via _isSmallStepWalkPad.
    // Big decks (garage roof / main roof) still need corridor clipping so they
    // don't act as low ceilings over intermediate treads.

    const conflicts = [];
    for (const s of stepFootprints) {
      if (minX >= s.maxX || maxX <= s.minX || minZ >= s.maxZ || maxZ <= s.minZ) continue;
      const gap = y - s.topY;
      if (gap <= CEILING_MIN_GAP || gap >= PLAYER_HEIGHT) continue;
      conflicts.push(s);
    }
    if (!conflicts.length) return [{ minX, maxX, minZ, maxZ, y }];

    let cMinX = Infinity;
    let cMaxX = -Infinity;
    for (const s of conflicts) {
      cMinX = Math.min(cMinX, s.minX);
      cMaxX = Math.max(cMaxX, s.maxX);
    }

    // Ascent sign from the full overlapping step set, but restricted to the
    // SAME chain(s) as `conflicts` — a wide deck floor (e.g. garage roof) can
    // legitimately overlap TWO unrelated chains in X (garage climb_pad at
    // x≈-27.5 AND roof→main roof_climb at x≈-24.2 both sit under it), and
    // mixing them here would infer the wrong ascent direction for whichever
    // chain isn't actually causing this floor's ceiling conflict.
    const conflictKeys = new Set(conflicts.map((s) => s.key));
    const bandSteps = stepFootprints.filter(
      (s) => !(minX >= s.maxX || maxX <= s.minX) && conflictKeys.has(s.key)
    );
    let climbSignZ = 1;
    if (bandSteps.length >= 2) {
      const sorted = [...bandSteps].sort((a, b) => a.topY - b.topY);
      const z0 = (sorted[0].minZ + sorted[0].maxZ) / 2;
      const z1 = (sorted[sorted.length - 1].minZ + sorted[sorted.length - 1].maxZ) / 2;
      if (Math.abs(z1 - z0) > 0.05) climbSignZ = Math.sign(z1 - z0);
    }

    let climbMinZ = minZ;
    let climbMaxZ = maxZ;
    if (climbSignZ >= 0) {
      // Keep boarding strip past the last intermediate (+Z).
      for (const s of conflicts) climbMinZ = Math.max(climbMinZ, s.maxZ);
    } else {
      // Keep boarding strip past the last intermediate (−Z).
      for (const s of conflicts) climbMaxZ = Math.min(climbMaxZ, s.minZ);
    }

    const pieces = [];
    const push = (a, b, c, d) => {
      if (b - a >= 0.05 && d - c >= 0.05) pieces.push({ minX: a, maxX: b, minZ: c, maxZ: d, y });
    };

    // Deck outside the climb column — full Z.
    if (maxX > cMaxX) push(Math.max(minX, cMaxX), maxX, minZ, maxZ);
    if (minX < cMinX) push(minX, Math.min(maxX, cMinX), minZ, maxZ);

    // Climb corridor boarding strip (direction-aware).
    if (maxX > cMinX && minX < cMaxX && climbMinZ < climbMaxZ) {
      push(Math.max(minX, cMinX), Math.min(maxX, cMaxX), climbMinZ, climbMaxZ);
    }

    return pieces;
  }

  /**
   * Toggle a map collider's solidity at runtime (e.g. `Doors.js` open/close).
   * Looks the Rapier collider up by legacy object identity first (exact — doors
   * keep the same collider reference in `mapData.colliders` and `door.collider`),
   * falling back to an AABB-center match if the caller passes an equivalent object.
   * @param {{ box?: object, solid?: boolean }} legacyCollider
   * @param {boolean} solid
   */
  setColliderSolid(legacyCollider, solid) {
    if (!legacyCollider) return;
    let entry = this._legacyToEntry.get(legacyCollider);
    if (!entry && legacyCollider.box) {
      entry = this._findEntryByBoxCenter(legacyCollider.box);
    }
    if (entry) {
      entry.collider.setEnabled(!!solid);
    }
    // Keep the legacy flag in sync too (idempotent — Doors.js usually sets this itself already).
    legacyCollider.solid = solid;
  }

  _findEntryByBoxCenter(box, eps = 1e-3) {
    if (!box?.min || !box?.max) return null;
    const cx = (box.min.x + box.max.x) / 2;
    const cy = (box.min.y + box.max.y) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    for (const entry of this.staticEntries) {
      const t = entry.rigidBody.translation();
      if (Math.abs(t.x - cx) < eps && Math.abs(t.y - cy) < eps && Math.abs(t.z - cz) < eps) {
        return entry;
      }
    }
    return null;
  }

  /**
   * Advance the physics simulation. Clamps dt to avoid huge spikes destabilizing
   * the solver (e.g. tab-out); a simple direct step is sufficient for Phase 1 —
   * we only have static bodies + kinematic character controllers, no dynamics
   * that need sub-stepping yet.
   * @param {number} dt
   */
  step(dt) {
    if (!this.world) return;
    const clamped = Math.max(1 / 240, Math.min(dt || 1 / 60, 1 / 20));
    this.world.timestep = clamped;
    this.world.step();
  }

  /**
   * Create a kinematic capsule character controller.
   * @param {{ radius?: number, height?: number, position: { x: number, y: number, z: number } }} opts
   *   `position` is the EYE position (matches `Player.position`), not feet.
   * @returns {{ body: object, collider: object, controller: object, verticalVel: number, grounded: boolean, height: number, radius: number }}
   */
  createPlayerController({ radius = PLAYER_RADIUS, height = PLAYER_HEIGHT, position }) {
    const RAPIER_ = this.RAPIER;
    // Capsule = cylinder (halfHeight*2) + two hemispherical caps (radius each).
    const capsuleHalfHeight = Math.max(0.02, (height - 2 * radius) / 2);
    const centerY = position.y - height / 2;

    const body = this.world.createRigidBody(
      RAPIER_.RigidBodyDesc.kinematicPositionBased().setTranslation(
        position.x,
        centerY,
        position.z
      )
    );
    const colliderDesc = RAPIER_.ColliderDesc.capsule(capsuleHalfHeight, radius).setFriction(0);
    const collider = this.world.createCollider(colliderDesc, body);

    const controller = this.world.createCharacterController(0.01);
    // maxHeight matches Player.STEP_UP; minWidth keeps skinny ledges from false-stepping
    controller.enableAutostep(0.55, 0.12, true);
    controller.enableSnapToGround(0.45);
    controller.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
    controller.setMinSlopeSlideAngle((40 * Math.PI) / 180);
    controller.setApplyImpulsesToDynamicBodies(false);
    controller.setSlideEnabled(true);

    return {
      body,
      collider,
      controller,
      verticalVel: 0,
      grounded: true,
      height,
      radius,
    };
  }

  /**
   * Tear down a character controller (bot despawn / match clear). Safe if already removed.
   * @param {ReturnType<PhysicsManager['createPlayerController']>|null|undefined} handle
   */
  removeCharacter(handle) {
    if (!handle || !this.world) return;
    try {
      if (handle.controller) this.world.removeCharacterController(handle.controller);
    } catch (_) {
      /* already freed */
    }
    try {
      if (handle.body) this.world.removeRigidBody(handle.body);
    } catch (_) {
      /* already freed */
    }
    handle.controller = null;
    handle.collider = null;
    handle.body = null;
  }

  /**
   * Enable/disable a character collider (dead bots stay in the world but don't block).
   * @param {ReturnType<PhysicsManager['createPlayerController']>|null|undefined} handle
   * @param {boolean} enabled
   */
  setCharacterEnabled(handle, enabled) {
    if (!handle?.collider) return;
    handle.collider.setEnabled(!!enabled);
  }

  /**
   * Move a character controller handle for one frame.
   * Gravity + jump are integrated internally (mirrors `GRAVITY`/`PLAYER_JUMP` feel);
   * horizontal wish velocity is caller-computed (accel/friction stays in `Player.js`).
   *
   * @param {ReturnType<PhysicsManager['createPlayerController']>} handle
   * @param {{ wishVelX: number, wishVelZ: number, jumpPressed: boolean, dt: number, jumpSpeed?: number }} input
   * @returns {{ x: number, y: number, z: number, grounded: boolean } | null} `y` is EYE height (feet + height).
   */
  moveCharacter(handle, { wishVelX = 0, wishVelZ = 0, jumpPressed = false, dt, jumpSpeed }) {
    if (!handle || !dt || dt <= 0) return null;
    const { body, collider, controller } = handle;
    if (!body || !collider || !controller) return null;

    handle.verticalVel -= GRAVITY * dt;
    if (handle.grounded && jumpPressed) {
      handle.verticalVel = jumpSpeed != null ? jumpSpeed : PLAYER_JUMP;
    }

    const desiredTranslation = {
      x: wishVelX * dt,
      y: handle.verticalVel * dt,
      z: wishVelZ * dt,
    };

    controller.computeColliderMovement(collider, desiredTranslation);
    const computed = controller.computedMovement();
    const cur = body.translation();
    const next = {
      x: cur.x + computed.x,
      y: cur.y + computed.y,
      z: cur.z + computed.z,
    };
    body.setNextKinematicTranslation(next);

    handle.grounded = controller.computedGrounded();
    if (handle.grounded && handle.verticalVel < 0) handle.verticalVel = 0;

    return {
      x: next.x,
      y: next.y + handle.height / 2,
      z: next.z,
      grounded: handle.grounded,
    };
  }

  /** Current EYE position (feet + height/2 from capsule center) for a controller handle. */
  getTranslation(handle) {
    if (!handle) return null;
    const t = handle.body.translation();
    return { x: t.x, y: t.y + handle.height / 2, z: t.z };
  }

  /**
   * Instantly move a controller handle (respawn / roof mantle sync). `yEye` is EYE height.
   * Resets vertical velocity + grounded — use `setNextTranslation` instead for small
   * same-frame corrections (bot push-out, arena clamp) so an in-progress jump/fall
   * isn't stomped every frame.
   */
  teleport(handle, x, yEye, z) {
    if (!handle) return;
    const centerY = yEye - handle.height / 2;
    const pos = { x, y: centerY, z };
    handle.body.setTranslation(pos, true);
    // Keep the queued kinematic target in sync too, otherwise the next world.step()
    // (called right after Player.update() in Game._update) would snap back to the
    // stale pre-teleport target queued by the last moveCharacter() call.
    handle.body.setNextKinematicTranslation(pos);
    handle.verticalVel = 0;
    handle.grounded = true;
  }

  /**
   * Override this frame's queued kinematic translation without touching vertical
   * velocity/grounded — for post-`moveCharacter` corrections (bot push-out, arena
   * bounds clamp) that should still land safely on the next `step()`.
   */
  setNextTranslation(handle, x, yEye, z) {
    if (!handle) return;
    const centerY = yEye - handle.height / 2;
    handle.body.setNextKinematicTranslation({ x, y: centerY, z });
  }

  /**
   * Ray vs Rapier world (future hitscan/LOS swap — not wired into `collision.js` yet).
   * @param {{x:number,y:number,z:number}} origin
   * @param {{x:number,y:number,z:number}} dir unit direction
   * @param {number} maxDist
   */
  raycast(origin, dir, maxDist) {
    if (!this.world) return { hit: false, point: null, normal: null, distance: Infinity, colliderId: null };
    const ray = new this.RAPIER.Ray(origin, dir);
    const hit = this.world.castRayAndGetNormal(ray, maxDist, true);
    if (!hit) return { hit: false, point: null, normal: null, distance: Infinity, colliderId: null };
    const point = ray.pointAt(hit.timeOfImpact);
    return {
      hit: true,
      point: { x: point.x, y: point.y, z: point.z },
      normal: hit.normal ? { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z } : null,
      distance: hit.timeOfImpact,
      colliderId: hit.collider?.handle ?? null,
    };
  }

  /** Tear down the whole physics world (scene unload / hot-reload). */
  dispose() {
    try {
      this.world?.free();
    } catch (err) {
      // Already freed / never initialized — non-fatal.
    }
    this.world = null;
    this.staticEntries = [];
    this.colliderById = new Map();
    this._legacyToEntry = new WeakMap();
  }
}
