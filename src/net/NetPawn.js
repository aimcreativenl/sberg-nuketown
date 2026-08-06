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
} from '../game/constants.js';
import { applyGroundWish, applyAirWish, pickFloorY, isStepableSolid } from '../game/movement.js';
import { playerMoveBlocked } from '../game/collision.js';

const STEP_UP = 0.55;

/**
 * Lightweight authoritative pawn for host sim (and guest remote render state).
 */
export class NetPawn {
  /**
   * @param {{ id: string, name: string, team?: string|null, spawn: THREE.Vector3, outfitIndex?: number }} opts
   */
  constructor({ id, name, team = null, spawn, outfitIndex = 0 }) {
    this.id = id;
    this.name = name;
    this.team = team;
    this.position = spawn.clone();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.health = PLAYER_MAX_HP;
    this.alive = true;
    this.kills = 0;
    this.deaths = 0;
    this.weaponSlot = 0;
    this.aiming = false;
    this.grounded = true;
    this.radius = PLAYER_RADIUS;
    this.height = PLAYER_HEIGHT;
    this.outfitIndex = outfitIndex;
    this._coyote = PLAYER_COYOTE;
    this._spaceWasDown = false;
    /** @type {number} performance.now() ms when can revive; 0 = alive */
    this.respawnAt = 0;
    /** @type {import('./NetTypes.js').InputFrame|null} */
    this.lastInput = null;
    this.lastSeq = -1;
    /** Fire cooldown remaining (s). */
    this._fireCd = 0;
    this._lastFloorY = Math.max(0, this.position.y - this.height);
    /** @type {import('../physics/PhysicsManager.js').PhysicsManager|null} */
    this.physics = null;
    this._rapier = null;
  }

  /**
   * Wire Rapier character controller (same capsule pattern as Player).
   * @param {import('../physics/PhysicsManager.js').PhysicsManager|null} physicsManager
   */
  setPhysics(physicsManager) {
    this.physics = physicsManager || null;
    if (this.physics && USE_RAPIER_PLAYER) {
      this._rapier = this.physics.createPlayerController({
        radius: this.radius,
        height: this.height,
        position: this.position,
        // Host sim remotes must not block the local host capsule
        remoteGhost: true,
      });
    } else {
      this._rapier = null;
    }
  }

  /** Apply latest input (store); movement in step. */
  setInput(input) {
    if (!input || typeof input.seq !== 'number') return;
    if (input.seq > this.lastSeq) {
      this.lastSeq = input.seq;
      this.lastInput = input;
    }
  }

  get forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
  }

  get right() {
    return new THREE.Vector3().crossVectors(this.forward, new THREE.Vector3(0, 1, 0)).normalize();
  }

  get lookDirection() {
    const e = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    return new THREE.Vector3(0, 0, -1).applyEuler(e).normalize();
  }

  /**
   * Host movement step using simplified Quake wish + legacy AABB OR Rapier if physics given.
   * @param {number} dt
   * @param {{ colliders?: any[], floors?: any[], physics?: import('../physics/PhysicsManager.js').PhysicsManager|null, rapierHandle?: any }} world
   */
  stepMovement(dt, world = {}) {
    if (!this.alive || dt <= 0) return;

    const input = this.lastInput;
    if (input) {
      this.yaw = input.yaw ?? this.yaw;
      this.pitch = input.pitch ?? this.pitch;
      this.weaponSlot = input.weaponSlot != null ? input.weaponSlot | 0 : this.weaponSlot;
      this.aiming = !!input.aimHold;
    }

    const mx = input?.moveX || 0;
    const mz = input?.moveZ || 0;
    const sprint = !!input?.sprint;
    const speed = sprint ? PLAYER_SPRINT : PLAYER_SPEED;

    let wishX = 0;
    let wishZ = 0;
    if (mx !== 0 || mz !== 0) {
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
      this._coyote = PLAYER_COYOTE;
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
      this._coyote = Math.max(0, this._coyote - dt);
    }

    const spaceDown = !!input?.jump;
    const jumpEdge = spaceDown && !this._spaceWasDown;
    this._spaceWasDown = spaceDown;
    const canJump = this.grounded || this._coyote > 0;
    const doJump = jumpEdge && canJump;

    const physics = world.physics || this.physics;
    const rapier = world.rapierHandle || this._rapier;
    const usingRapier = !!(physics && rapier);

    const prevFeet = this.position.y - this.height;
    const next = this.position.clone();
    const colliders = world.colliders || [];
    const floors = world.floors || [];

    if (usingRapier) {
      if (doJump) this._coyote = 0;
      const result = physics.moveCharacter(rapier, {
        wishVelX: this.velocity.x,
        wishVelZ: this.velocity.z,
        jumpPressed: doJump,
        dt,
        jumpSpeed: PLAYER_JUMP,
      });
      if (result) {
        // result.y is eye height (same as Player / PhysicsManager contract)
        next.set(result.x, result.y, result.z);
        this.grounded = !!result.grounded;
        if (this.grounded) {
          this._coyote = PLAYER_COYOTE;
          this._lastFloorY = result.y - this.height;
        }
      } else {
        const t = physics.getTranslation?.(rapier);
        if (t) next.set(t.x, t.y, t.z);
      }
    } else {
      if (doJump) {
        this.velocity.y = PLAYER_JUMP;
        this.grounded = false;
        this._coyote = 0;
      }

      this.velocity.y -= GRAVITY * dt;
      next.x += this.velocity.x * dt;
      this._resolveAxis(next, colliders, 'x', floors);
      next.z += this.velocity.z * dt;
      this._resolveAxis(next, colliders, 'z', floors);
      next.y += this.velocity.y * dt;

      const floorY = pickFloorY(next.y, this.height, next.x, next.z, floors, {
        stepUp: STEP_UP,
        pad: 0.22,
        grounded: this.grounded,
        preferY: this._lastFloorY,
        prevFeet,
        falling: this.velocity.y <= 0,
      });
      const feet = next.y - this.height;
      if (floorY != null && this.velocity.y <= 0) {
        const canStep = this.grounded && feet < floorY && floorY - feet <= STEP_UP;
        const crossed = prevFeet >= floorY - 0.05 && feet <= floorY + 0.12;
        const landing = feet <= floorY + 0.1 || crossed;
        if (landing || canStep) {
          next.y = floorY + this.height;
          this.velocity.y = 0;
          this.grounded = true;
          this._coyote = PLAYER_COYOTE;
          this._lastFloorY = floorY;
        } else {
          this.grounded = false;
        }
      } else if (floorY == null) {
        this.grounded = false;
      } else {
        this.grounded = false;
      }

      // Void rescue
      if (next.y - this.height < -0.35) {
        const rescue = pickFloorY(this.height + 1, this.height, next.x, next.z, floors, {
          grounded: true,
          stepUp: STEP_UP,
          pad: 0.5,
        });
        const ry = rescue != null ? rescue : 0;
        next.y = ry + this.height;
        this.velocity.y = 0;
        this.grounded = true;
        this._coyote = PLAYER_COYOTE;
        this._lastFloorY = ry;
      }
    }

    next.x = THREE.MathUtils.clamp(next.x, -38, 38);
    next.z = THREE.MathUtils.clamp(next.z, -38, 38);
    if (next.y < -5) {
      next.set(0, this.height + 1, 8);
      this.velocity.set(0, 0, 0);
      this.grounded = true;
      this._coyote = PLAYER_COYOTE;
      if (usingRapier) physics.teleport(rapier, next.x, next.y, next.z);
    } else if (usingRapier) {
      physics.setNextTranslation?.(rapier, next.x, next.y, next.z);
    }

    this.position.copy(next);
  }

  /**
   * @param {THREE.Vector3} pos
   * @param {any[]} colliders
   * @param {'x'|'z'} axis
   * @param {any[]} floors
   */
  _resolveAxis(pos, colliders, axis, floors) {
    const r = this.radius;
    const feet = pos.y - this.height;
    const bodyMinY = pos.y - this.height + 0.15;
    const bodyMaxY = pos.y - 0.1;
    const origin = this.position.clone();

    for (const c of colliders || []) {
      if (c && c.solid === false) continue;
      const box = c.box || c;
      if (!box?.min) continue;
      const height = box.max.y - box.min.y;
      if (height < 0.35) continue;
      if (bodyMaxY < box.min.y || bodyMinY > box.max.y) continue;
      if (isStepableSolid(box, feet, floors, { stepUp: STEP_UP })) continue;

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
            const pushN = box.min.z - r - pos.z;
            const pushP = box.max.z + r - pos.z;
            if (Math.abs(pushN) < Math.abs(pushP)) pos.z += pushN;
            else pos.z += pushP;
            this.velocity.z = 0;
          }
        }
      }
    }

    // Path anti-tunnel when we have a move
    if (playerMoveBlocked(origin, pos, colliders, { radius: this.radius, height: this.height })) {
      if (axis === 'x') {
        pos.x = origin.x;
        this.velocity.x = 0;
      } else {
        pos.z = origin.z;
        this.velocity.z = 0;
      }
    }
  }

  /**
   * @param {number} amount
   * @returns {boolean} killed
   */
  takeDamage(amount) {
    if (!this.alive || amount <= 0) return false;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) {
      this.alive = false;
      this.health = 0;
      this.deaths += 1;
      this.respawnAt =
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) + 3000;
      return true;
    }
    return false;
  }

  /** @param {THREE.Vector3} spawnVec3 */
  respawn(spawnVec3) {
    this.position.copy(spawnVec3);
    this.position.y = Math.max(spawnVec3.y, this.height);
    this.velocity.set(0, 0, 0);
    this.health = PLAYER_MAX_HP;
    this.alive = true;
    this.grounded = true;
    this._coyote = PLAYER_COYOTE;
    this.respawnAt = 0;
    this._spaceWasDown = false;
    this._fireCd = 0;
    this._lastFloorY = Math.max(0, this.position.y - this.height);
    if (this._rapier && this.physics) {
      this.physics.teleport(this._rapier, this.position.x, this.position.y, this.position.z);
    }
  }

  /** @returns {import('./NetTypes.js').PlayerSnap} */
  toSnap() {
    return {
      id: this.id,
      name: this.name,
      team: this.team,
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
      yaw: this.yaw,
      pitch: this.pitch,
      hp: this.health,
      alive: this.alive,
      kills: this.kills,
      deaths: this.deaths,
      weapon: this.weaponSlot,
      aiming: this.aiming,
      outfitIndex: this.outfitIndex | 0,
    };
  }
}
