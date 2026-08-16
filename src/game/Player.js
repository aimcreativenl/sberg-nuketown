import * as THREE from 'three';
import {
  PLAYER_SPEED,
  PLAYER_SPRINT,
  PLAYER_JUMP,
  PLAYER_ACCEL,
  PLAYER_FRICTION,
  PLAYER_AIR_ACCEL,
  PLAYER_COYOTE,
  GRAVITY,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  PLAYER_MAX_HP,
  USE_RAPIER_PLAYER,
} from './constants.js';
import {
  applyGroundWish,
  applyAirWish,
  tryRoofMantle,
  pickFloorY,
  isStepableSolid,
  beltCarryDelta,
} from './movement.js';
import { playerMoveBlocked } from './collision.js';
import { getSettings, lookScale } from '../settings/Settings.js';
import { gyroLookActive } from '../input/GyroLook.js';

export class Player {
  /** Max height the player can walk up without jumping (stairs / curbs / climb pads). */
  static STEP_UP = 0.55;

  constructor(camera, mapData) {
    this.camera = camera;
    this.mapData = mapData;
    /** Arena XZ clamp. Game.loadMap keeps this in sync with mapData.bounds. */
    this.mapBounds = mapData?.bounds ?? 38;
    this.position = new THREE.Vector3(0, PLAYER_HEIGHT, 8);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.health = PLAYER_MAX_HP;
    this.maxHealth = PLAYER_MAX_HP;
    this.alive = true;
    this.grounded = true;
    /** Remaining coyote-time (s) after walking off a ledge */
    this.coyote = 0;
    this.kills = 0;
    this.deaths = 0;
    this.funPoints = 0;
    this.weaponIndex = 0;
    this.killStreak = 0;
    this.radius = PLAYER_RADIUS;
    this.height = PLAYER_HEIGHT;
    this.keys = new Set();
    this.mouse = { dx: 0, dy: 0 };
    this.buttons = { left: false, right: false };
    this.reloadPressed = false;
    this._reloadLatch = false;
    /** Queued LMB clicks so semi-auto never loses a press */
    this.shootClicks = 0;
    this.weaponSlotPressed = null;
    /** RMB click edge for M16 scope toggle (short press) */
    this.scopeClick = false;
    /** Accumulated wheel delta for scope zoom while scoped */
    this.scopeZoomDelta = 0;
    this._rmbDownAt = 0;
    this.usePressed = false;
    /** Seconds since last damage; used for passive regen */
    this.timeSinceDamage = 99;
    /** Space key edge tracking for double-Space roof mantle */
    this._spaceHeld = false;
    /** True after a jump until grounded again (second Space = mantle attempt) */
    this._airJumpUsed = false;
    /** Brief lockout so mantle does not re-trigger immediately */
    this._mantleCooldown = 0;
    /** Last grounded floor y — sticky elevated surfaces (roof stick) */
    this._lastFloorY = 0;
    /** Phase 1c: Rapier physics manager (null = legacy AABB mover, see USE_RAPIER_PLAYER). */
    this.physics = null;
    /** Phase 1c: Rapier character controller handle from `physics.createPlayerController()`. */
    this._rapier = null;
    /** ADS hold and/or scope — used by lookScale */
    this._lookAim = false;
    this._lookScope = false;
    this._scopedLook = false;
  }

  /**
   * Wire a Rapier physics world into this player and spawn a capsule character
   * controller at the current position. Safe to call once physics is ready
   * (e.g. from `Game.initPhysics()`); `update()` transparently falls back to
   * the legacy AABB mover whenever `USE_RAPIER_PLAYER` is off or this hasn't
   * been called yet (keeps `test:physics-*` scripts green with no physics).
   * @param {import('../physics/PhysicsManager.js').PhysicsManager|null} physicsManager
   */
  setPhysics(physicsManager) {
    this.physics = physicsManager || null;
    if (this.physics && USE_RAPIER_PLAYER) {
      this._rapier = this.physics.createPlayerController({
        radius: this.radius,
        height: this.height,
        position: this.position,
      });
    } else {
      this._rapier = null;
    }
  }

  get eyePosition() {
    return this.position.clone();
  }

  get kd() {
    if (this.deaths === 0) return this.kills.toFixed(2);
    return (this.kills / this.deaths).toFixed(2);
  }

  bindInput(dom) {
    this._dom = dom;
    const isTypingTarget = (t) => {
      if (!t || !(t instanceof Element)) return false;
      const tag = t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (t.isContentEditable) return true;
      return !!t.closest?.('input, textarea, select, [contenteditable="true"]');
    };
    this._onKeyDown = (e) => {
      // Lobby / join forms must receive WASD digits etc. — don't steal keys while typing
      if (isTypingTarget(e.target)) return;
      this.keys.add(e.code);
      // Ignore OS key-repeat so one R press = one reload request
      if (e.code === 'KeyR' && !e.repeat) this.reloadPressed = true;
      if (e.code === 'KeyE' && !e.repeat) this.usePressed = true;
      if (!e.repeat && (e.code === 'Digit1' || e.code === 'Numpad1')) this.weaponSlotPressed = 0;
      if (!e.repeat && (e.code === 'Digit2' || e.code === 'Numpad2')) this.weaponSlotPressed = 1;
      if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault();
    };
    this._onKeyUp = (e) => {
      if (isTypingTarget(e.target)) return;
      this.keys.delete(e.code);
    };
    this._onMouseMove = (e) => {
      if (this._touchPlay) return;
      if (document.pointerLockElement !== dom) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    };
    this._onMouseDown = (e) => {
      if (this._touchPlay) return;
      if (e.sourceCapabilities?.firesTouchEvents) return;
      if (e.button === 0) {
        this.buttons.left = true;
        // Buffer click so semi-auto never eats a press during cooldown / frame gap
        this.shootClicks = Math.min(3, this.shootClicks + 1);
      }
      if (e.button === 2) {
        this.buttons.right = true;
        this._rmbDownAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      }
    };
    this._onMouseUp = (e) => {
      if (this._touchPlay) return;
      if (e.button === 0) this.buttons.left = false;
      if (e.button === 2) {
        this.buttons.right = false;
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        // Short press = scope toggle; long hold was ADS only
        if (now - (this._rmbDownAt || 0) < 220) this.scopeClick = true;
      }
    };
    this._onContext = (e) => e.preventDefault();
    this._onWheel = (e) => {
      if (this._touchPlay) return;
      if (document.pointerLockElement !== dom) return;
      e.preventDefault();
      this.scopeZoomDelta += Math.sign(e.deltaY || 0);
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup', this._onMouseUp);
    dom.addEventListener('contextmenu', this._onContext);
    dom.addEventListener('wheel', this._onWheel, { passive: false });
  }

  unbindInput() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('mouseup', this._onMouseUp);
    if (this._dom) {
      this._dom.removeEventListener('contextmenu', this._onContext);
      this._dom.removeEventListener('wheel', this._onWheel);
    }
  }

  reset(spawn) {
    this.position.copy(spawn);
    this.position.y = Math.max(spawn.y, this.height);
    this.velocity.set(0, 0, 0);
    this.health = this.maxHealth;
    this.alive = true;
    this.killStreak = 0;
    this.grounded = true;
    this.coyote = 0;
    this.timeSinceDamage = 99;
    this._lastFloorY = Math.max(0, this.position.y - this.height);
    this._airJumpUsed = false;
    this._spaceHeld = false;
    this._mantleCooldown = 0;
    this.clearFireLatches();
    // Phase 1c: keep the Rapier capsule in sync with respawns/full match resets.
    if (this._rapier && this.physics) {
      this.physics.teleport(this._rapier, this.position.x, this.position.y, this.position.z);
    }
  }

  /** Drop leftover LMB / click-buffer so PLAY and slot swaps cannot auto-fire. */
  clearFireLatches() {
    this.shootClicks = 0;
    this.buttons.left = false;
    this.buttons.right = false;
    this.reloadPressed = false;
  }

  fullMatchReset(spawn) {
    this.kills = 0;
    this.deaths = 0;
    this.funPoints = 0;
    this.weaponIndex = 0;
    this.reset(spawn);
    this.clearFireLatches();
  }

  updateLook(aiming = false, dt = 0) {
    const ads = !!aiming || !!this._lookAim || !!this._scopedLook;
    const scoped = !!this._lookScope;
    const settings = getSettings();
    const { yawScale, pitchScale } = lookScale(
      { aiming: ads, scoped, touch: !!this._touchPlay },
      settings
    );
    this.yaw -= this.mouse.dx * yawScale;
    this.pitch -= this.mouse.dy * pitchScale;
    const gyro = this.gyroLook;
    if (
      gyro?.active &&
      this._touchPlay &&
      dt > 0 &&
      gyroLookActive(settings.gyroMode, ads)
    ) {
      const g = settings.gyroSens;
      this.yaw -= gyro.yawRate * dt * g;
      this.pitch -= gyro.pitchRate * dt * g * (settings.invertY ? -1 : 1);
    }
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  get forward() {
    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    return f.normalize();
  }

  get right() {
    return new THREE.Vector3().crossVectors(this.forward, new THREE.Vector3(0, 1, 0)).normalize();
  }

  get lookDirection() {
    const e = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    return new THREE.Vector3(0, 0, -1).applyEuler(e).normalize();
  }

  /** Player XZ clamp from mapData.bounds (Nuketown 38). */
  _arenaBounds() {
    const b = this.mapBounds ?? this.mapData?.bounds;
    return Number.isFinite(b) && b > 0 ? b : 38;
  }

  /**
   * Syrup / water AABB: scale wish while feet Y is in the band.
   * @param {number} x
   * @param {number} feetY
   * @param {number} z
   */
  _slowZoneMul(x, feetY, z) {
    const zones = this.mapData?.slowZones;
    if (!zones?.length) return 1;
    for (let i = 0; i < zones.length; i++) {
      const zone = zones[i];
      if (!zone) continue;
      if (x < zone.minX || x > zone.maxX || z < zone.minZ || z > zone.maxZ) continue;
      if (feetY < (zone.yMin ?? -1e9) || feetY > (zone.yMax ?? 1e9)) continue;
      const mul = zone.speedMul;
      if (Number.isFinite(mul) && mul > 0) return mul;
    }
    return 1;
  }

  update(dt, colliders, floors, agents = []) {
    if (!this.alive) {
      this.camera.position.copy(this.position);
      return { moving: false, sprinting: false, grounded: this.grounded };
    }

    // Phase 1c: Rapier capsule + character controller path (falls back to the
    // legacy AABB mover below whenever physics hasn't been wired up yet — keeps
    // test:physics-* scripts, which never call setPhysics(), green).
    const usingRapier = USE_RAPIER_PLAYER && !!this._rapier && !!this.physics;

    // Slow passive regen: 2 HP/s after 4s without taking damage
    this.timeSinceDamage += dt;
    if (this.timeSinceDamage >= 4 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + 2 * dt);
    }

    // Look sensitivity (hip vs ADS/scope + invert Y live from Settings)
    this.updateLook(false, dt);

    const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = sprint ? PLAYER_SPRINT : PLAYER_SPEED;

    let mx = 0;
    let mz = 0;
    if (this.keys.has('KeyW')) mz -= 1;
    if (this.keys.has('KeyS')) mz += 1;
    if (this.keys.has('KeyA')) mx -= 1;
    if (this.keys.has('KeyD')) mx += 1;

    const moving = mx !== 0 || mz !== 0;
    let wishX = 0;
    let wishZ = 0;
    if (moving) {
      const wish = new THREE.Vector3();
      wish.addScaledVector(this.forward, -mz);
      wish.addScaledVector(this.right, mx);
      wish.y = 0;
      if (wish.lengthSq() > 0) {
        wish.normalize().multiplyScalar(speed);
        wishX = wish.x;
        wishZ = wish.z;
      }
    }

    const slowMul = this._slowZoneMul(
      this.position.x,
      this.position.y - this.height,
      this.position.z
    );
    if (slowMul !== 1) {
      wishX *= slowMul;
      wishZ *= slowMul;
    }

    // Horizontal: accel/friction on ground, limited air control in air
    if (this.grounded) {
      const g = applyGroundWish(
        this.velocity.x,
        this.velocity.z,
        wishX,
        wishZ,
        speed,
        PLAYER_ACCEL,
        PLAYER_FRICTION,
        dt
      );
      this.velocity.x = g.vx;
      this.velocity.z = g.vz;
      this.coyote = PLAYER_COYOTE;
      this._airJumpUsed = false;
    } else {
      const a = applyAirWish(
        this.velocity.x,
        this.velocity.z,
        wishX,
        wishZ,
        speed,
        PLAYER_AIR_ACCEL,
        dt
      );
      this.velocity.x = a.vx;
      this.velocity.z = a.vz;
      this.coyote = Math.max(0, this.coyote - dt);
    }

    if (this._mantleCooldown > 0) this._mantleCooldown = Math.max(0, this._mantleCooldown - dt);

    const spaceDown = this.keys.has('Space');
    const spaceEdge = spaceDown && !this._spaceHeld;
    this._spaceHeld = spaceDown;

    // Double-Space roof mantle: airborne + second Space near edge only (tight reach)
    if (
      !this.grounded &&
      spaceEdge &&
      this._airJumpUsed &&
      this._mantleCooldown <= 0
    ) {
      const mantle = tryRoofMantle(
        this.position,
        this.height,
        this.mapData?.roofMantleZones || [],
        { reach: 0.82, margin: 0.55, edgeBand: 1.35, inset: 0.4 }
      );
      if (mantle) {
        this.position.x = mantle.x;
        this.position.z = mantle.z;
        this.position.y = mantle.y + this.height;
        this.velocity.y = 0;
        this.velocity.x *= 0.35;
        this.velocity.z *= 0.35;
        this.grounded = true;
        this.coyote = PLAYER_COYOTE;
        this._airJumpUsed = false;
        this._mantleCooldown = 0.4;
        this._lastFloorY = mantle.y;
        this.camera.position.copy(this.position);
        if (usingRapier) {
          this.physics.teleport(this._rapier, this.position.x, this.position.y, this.position.z);
        }
        return { moving, sprinting: sprint && moving, grounded: true, mantled: true };
      }
    }

    // Jump: grounded or brief coyote window (first Space) — edge only so hold-Space doesn't re-jump
    const jumpEdge = (this.grounded || this.coyote > 0) && spaceEdge;
    const prevFeet = this.position.y - this.height;
    const next = this.position.clone();

    if (usingRapier) {
      if (jumpEdge) {
        this.coyote = 0;
        this._airJumpUsed = true;
      }
      const result = this.physics.moveCharacter(this._rapier, {
        wishVelX: this.velocity.x,
        wishVelZ: this.velocity.z,
        jumpPressed: jumpEdge,
        dt,
      });
      if (result) {
        next.set(result.x, result.y, result.z);
        this.grounded = result.grounded;
        if (this.grounded) {
          this.coyote = PLAYER_COYOTE;
          this._lastFloorY = result.y - this.height;
        }
      }
    } else {
      if (jumpEdge) {
        this.velocity.y = PLAYER_JUMP;
        this.grounded = false;
        this.coyote = 0;
        this._airJumpUsed = true;
      }

      this.velocity.y -= GRAVITY * dt;

      next.x += this.velocity.x * dt;
      this._resolveAxis(next, colliders, 'x', floors);
      next.z += this.velocity.z * dt;
      this._resolveAxis(next, colliders, 'z', floors);
      next.y += this.velocity.y * dt;

      // Ceiling: stop head clipping through L2 slabs / roofs while jumping (thin house_floor)
      if (this._resolveCeiling(next, colliders)) {
        this.velocity.y = Math.min(0, this.velocity.y);
      }

      // Floor support — pass prevFeet so fast falls cannot tunnel through the ground
      const floorY = pickFloorY(next.y, this.height, next.x, next.z, floors, {
        stepUp: Player.STEP_UP,
        pad: 0.22,
        grounded: this.grounded,
        preferY: this._lastFloorY,
        prevFeet,
        falling: this.velocity.y <= 0,
      });
      const feet = next.y - this.height;
      if (floorY != null && this.velocity.y <= 0) {
        const canStep = this.grounded && feet < floorY && floorY - feet <= Player.STEP_UP;
        // Landing: feet at/below surface, OR we crossed the surface this frame (anti-tunnel)
        const crossed =
          prevFeet >= floorY - 0.05 && feet <= floorY + 0.12;
        const landing = feet <= floorY + 0.1 || crossed;
        if (landing || canStep) {
          next.y = floorY + this.height;
          this.velocity.y = 0;
          this.grounded = true;
          this.coyote = PLAYER_COYOTE;
          this._lastFloorY = floorY;
        } else {
          this.grounded = false;
        }
      } else if (floorY == null) {
        this.grounded = false;
      } else {
        // Rising through air
        this.grounded = false;
      }

      // Emergency recovery: never stay under the world (void under green ground plane)
      if (next.y - this.height < -0.35) {
        const rescue = pickFloorY(this.height + 1, this.height, next.x, next.z, floors, {
          grounded: true,
          stepUp: Player.STEP_UP,
          pad: 0.5,
        });
        const ry = rescue != null ? rescue : 0;
        next.y = ry + this.height;
        this.velocity.y = 0;
        this.grounded = true;
        this.coyote = PLAYER_COYOTE;
        this._lastFloorY = ry;
      }
    }

    // Push out of AI bots — clear gap, but never tunnel through walls
    // (destination free + _resolveAxis can eject to the exterior through thin shells)
    const minDist = this.radius + 2.2;
    for (const agent of agents) {
      if (!agent) continue;
      const ax = agent.x ?? agent.position?.x;
      const az = agent.z ?? agent.position?.z;
      if (ax == null || az == null) continue;
      const dx = next.x - ax;
      const dz = next.z - az;
      const d = Math.hypot(dx, dz);
      if (d < minDist && d > 1e-4) {
        const push = (minDist - d) / d;
        const origin = next.clone();
        const tryFull = next.clone();
        tryFull.x += dx * push;
        tryFull.z += dz * push;
        this._resolveAxis(tryFull, colliders, 'x', floors);
        this._resolveAxis(tryFull, colliders, 'z', floors);
        if (
          !this._bodyOverlapsSolid(tryFull, colliders, floors) &&
          !playerMoveBlocked(origin, tryFull, colliders, {
            radius: this.radius,
            height: this.height,
          })
        ) {
          next.x = tryFull.x;
          next.z = tryFull.z;
        } else {
          // Axis-split with path anti-tunnel
          const tryX = origin.clone();
          tryX.x += dx * push;
          this._resolveAxis(tryX, colliders, 'x', floors);
          if (
            !this._bodyOverlapsSolid(tryX, colliders, floors) &&
            !playerMoveBlocked(origin, tryX, colliders, {
              radius: this.radius,
              height: this.height,
            })
          ) {
            next.x = tryX.x;
          }
          const mid = next.clone();
          const tryZ = mid.clone();
          tryZ.z += dz * push;
          this._resolveAxis(tryZ, colliders, 'z', floors);
          if (
            !this._bodyOverlapsSolid(tryZ, colliders, floors) &&
            !playerMoveBlocked(mid, tryZ, colliders, {
              radius: this.radius,
              height: this.height,
            })
          ) {
            next.z = tryZ.z;
          }
        }
      } else if (d <= 1e-4) {
        const origin = next.clone();
        const tryPos = next.clone();
        tryPos.x += minDist;
        this._resolveAxis(tryPos, colliders, 'x', floors);
        if (
          !this._bodyOverlapsSolid(tryPos, colliders, floors) &&
          !playerMoveBlocked(origin, tryPos, colliders, {
            radius: this.radius,
            height: this.height,
          })
        ) {
          next.x = tryPos.x;
        }
      }
    }

    // Keep inside perimeter walls (mapData.bounds; Nuketown = 38)
    const bound = this._arenaBounds();
    next.x = THREE.MathUtils.clamp(next.x, -bound, bound);
    next.z = THREE.MathUtils.clamp(next.z, -bound, bound);

    const ride = beltCarryDelta(next.x, next.y - this.height, next.z, this.mapData?.belts);
    if (ride) {
      next.x += ride.dx * dt;
      next.z += ride.dz * dt;
      next.x = THREE.MathUtils.clamp(next.x, -bound, bound);
      next.z = THREE.MathUtils.clamp(next.z, -bound, bound);
    }

    const feetMul = this._slowZoneMul(next.x, next.y - this.height, next.z);
    if (feetMul < 1) {
      const cap = speed * feetMul;
      const h = Math.hypot(this.velocity.x, this.velocity.z);
      if (h > cap && cap >= 0) {
        const s = cap / h;
        this.velocity.x *= s;
        this.velocity.z *= s;
      }
    }
    if (next.y < -5) {
      next.set(0, this.height + 1, 8);
      this.velocity.set(0, 0, 0);
      this.grounded = true;
      this.coyote = PLAYER_COYOTE;
      if (usingRapier) this.physics.teleport(this._rapier, next.x, next.y, next.z);
    } else if (usingRapier) {
      // Mirror bot push-out / arena clamp back into the kinematic body without
      // resetting vertical velocity/grounded (that's what moveCharacter already
      // resolved this frame) — committed on the next physics.step() in Game.js.
      this.physics.setNextTranslation(this._rapier, next.x, next.y, next.z);
    }

    this.position.copy(next);
    this.camera.position.copy(this.position);

    return { moving, sprinting: sprint && moving, grounded: this.grounded };
  }

  /**
   * Support floor under player — delegates to pure pickFloorY (unit-tested).
   * Prefer the integrated path in update() which passes prevFeet for anti-tunnel.
   * @returns {number|null}
   */
  _floorHeight(pos, floors, prevFeet = null) {
    return pickFloorY(pos.y, this.height, pos.x, pos.z, floors, {
      stepUp: Player.STEP_UP,
      pad: 0.22,
      grounded: this.grounded,
      preferY: this._lastFloorY,
      prevFeet: prevFeet ?? this.position.y - this.height,
      falling: this.velocity.y <= 0,
    });
  }

  /**
   * Push eye down if head enters a slab/ceiling from below (L2 floor, roof decks).
   * Thin house_floor colliders are skipped by horizontal solid filters — handle them here.
   * @returns {boolean} true if clamped
   */
  _resolveCeiling(pos, colliders) {
    const headPad = 0.12;
    const headY = pos.y + headPad;
    const feet = pos.y - this.height;
    const r = this.radius * 0.88;
    let ceilY = null;
    for (const c of colliders || []) {
      if (c && c.solid === false) continue;
      // Climb/step pads sit at waist height while ascending — never treat as ceilings
      if (c && (c.kind === 'climb_pad' || c.kind === 'roof_climb')) continue;
      const box = c.box || c;
      if (!box?.min) continue;
      // Only treat as ceiling if we're standing below its underside
      if (feet >= box.min.y - 0.02) continue;
      if (pos.x + r <= box.min.x || pos.x - r >= box.max.x) continue;
      if (pos.z + r <= box.min.z || pos.z - r >= box.max.z) continue;
      // Eye already clear above this slab (e.g. next stair tread) — not a head-bonk
      if (pos.y > box.max.y + 0.35) continue;
      if (headY > box.min.y && feet < box.min.y) {
        const y = box.min.y - headPad;
        if (ceilY == null || y < ceilY) ceilY = y;
      }
    }
    if (ceilY != null && pos.y > ceilY) {
      pos.y = ceilY;
      return true;
    }
    return false;
  }

  /**
   * @param {THREE.Vector3} pos
   * @param {Array} colliders
   * @param {'x'|'z'} axis
   * @param {Array} [floors] needed so stepable only applies when a walk pad is on the top
   */
  _resolveAxis(pos, colliders, axis, floors = null) {
    const r = this.radius;
    const feet = pos.y - this.height;
    const bodyMinY = pos.y - this.height + 0.15;
    const bodyMaxY = pos.y - 0.1;
    const floorList = floors || this.mapData?.floors || [];

    for (const c of colliders || []) {
      if (c && c.solid === false) continue;
      const box = c.box || c;
      if (!box || !box.min) continue;
      // Skip thin floor-like colliders
      const height = box.max.y - box.min.y;
      if (height < 0.35) continue;
      if (bodyMaxY < box.min.y || bodyMinY > box.max.y) continue;
      // Garage outer wall: once on the upper climb / roof, never block boarding
      if (c.kind === 'garage_wall' && feet >= 2.3) continue;

      // Stepable only if top within STEP_UP AND a floor pad sits on that top
      // (furniture without walk pads stays solid — no walk-through)
      if (isStepableSolid(box, feet, floorList, { stepUp: Player.STEP_UP })) {
        continue;
      }

      if (axis === 'x') {
        if (pos.z + r > box.min.z && pos.z - r < box.max.z) {
          if (pos.x + r > box.min.x && pos.x - r < box.max.x) {
            const pushL = box.min.x - r - pos.x;
            const pushR = box.max.x + r - pos.x;
            if (Math.abs(pushL) < Math.abs(pushR)) pos.x += pushL;
            else pos.x += pushR;
            this.velocity.x = 0;
          }
        }
      } else {
        if (pos.x + r > box.min.x && pos.x - r < box.max.x) {
          if (pos.z + r > box.min.z && pos.z - r < box.max.z) {
            const pushL = box.min.z - r - pos.z;
            const pushR = box.max.z + r - pos.z;
            if (Math.abs(pushL) < Math.abs(pushR)) pos.z += pushL;
            else pos.z += pushR;
            this.velocity.z = 0;
          }
        }
      }
    }
  }

  /** True if player capsule still overlaps a non-stepable solid (post-push safety). */
  _bodyOverlapsSolid(pos, colliders, floors = null) {
    const r = this.radius;
    const feet = pos.y - this.height;
    const bodyMinY = pos.y - this.height + 0.15;
    const bodyMaxY = pos.y - 0.1;
    const floorList = floors || this.mapData?.floors || [];
    for (const c of colliders || []) {
      if (c && c.solid === false) continue;
      const box = c.box || c;
      if (!box?.min) continue;
      if (box.max.y - box.min.y < 0.35) continue;
      if (bodyMaxY < box.min.y || bodyMinY > box.max.y) continue;
      if (c.kind === 'garage_wall' && feet >= 2.3) continue;
      if (isStepableSolid(box, feet, floorList, { stepUp: Player.STEP_UP })) continue;
      if (
        pos.x + r > box.min.x &&
        pos.x - r < box.max.x &&
        pos.z + r > box.min.z &&
        pos.z - r < box.max.z
      ) {
        return true;
      }
    }
    return false;
  }

  takeDamage(amount) {
    if (!this.alive) return false;
    // Soft damage feedback pulse via CSS class handled in UI
    this.timeSinceDamage = 0;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) {
      this.alive = false;
      this.deaths += 1;
      this.killStreak = 0;
      return true;
    }
    return false;
  }

  healFull() {
    this.health = this.maxHealth;
  }

  consumeReloadPress() {
    if (this.reloadPressed) {
      this.reloadPressed = false;
      return true;
    }
    return false;
  }

  /** Consume one buffered LMB click (semi-auto). Returns true if a click was waiting. */
  consumeShootClick() {
    if (this.shootClicks > 0) {
      this.shootClicks -= 1;
      return true;
    }
    return false;
  }

  /** Consume weapon hotkey 1/2. Returns 0, 1, or null. */
  consumeWeaponSlot() {
    const s = this.weaponSlotPressed;
    this.weaponSlotPressed = null;
    return s;
  }

  consumeScopeClick() {
    if (this.scopeClick) {
      this.scopeClick = false;
      return true;
    }
    return false;
  }

  /** Consume wheel zoom delta (nonzero while scoped scroll). */
  consumeScopeZoomDelta() {
    const d = this.scopeZoomDelta;
    this.scopeZoomDelta = 0;
    return d;
  }

  consumeUsePress() {
    if (this.usePressed) {
      this.usePressed = false;
      return true;
    }
    return false;
  }
}
