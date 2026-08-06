import * as THREE from 'three';
import { KILL_LIMIT, PLAYER_HEIGHT } from '../game/constants.js';
import { NET_MSG, SNAPSHOT_HZ, INPUT_HZ } from './NetTypes.js';
import { sampleInputFrame } from './sampleInput.js';
import { NetPawn } from './NetPawn.js';
import { RemoteAvatars } from './RemoteAvatars.js';

const FIRE_INTERVAL = 0.15;
const DMG_BODY = 28;
const DMG_HEAD = 42;
const SHOT_RANGE = 80;
const HEAD_RADIUS = 0.24;
const CHEST_RADIUS = 0.32;
const CORRECT_DIST = 3.25;

/**
 * Orchestrates one network match (host-authoritative combat sync).
 */
export class MpMatch {
  /**
   * @param {{
   *   session: import('./OnlineSession.js').OnlineSession,
   *   isHost: boolean,
   *   localId: string,
   *   localName?: string,
   *   mapData?: object,
   *   physics?: import('../physics/PhysicsManager.js').PhysicsManager|null,
   *   getLocalPlayer?: () => import('../game/Player.js').Player|null,
   *   getWeapons?: () => object|null,
   *   getDoors?: () => import('../game/Doors.js').DoorManager|null,
   *   onEvent?: (msg: import('./NetTypes.js').EventMsg) => void,
   * }} opts
   */
  constructor({
    session,
    isHost,
    localId,
    localName = 'Player',
    mapData = null,
    physics = null,
    getLocalPlayer = null,
    getWeapons = null,
    getDoors = null,
    onEvent = null,
  }) {
    this.session = session;
    this.isHost = !!isHost;
    this.localId = localId;
    this.localName = localName;
    this.mapData = mapData;
    this.physics = physics || null;
    this.getLocalPlayer = getLocalPlayer;
    this.getWeapons = getWeapons;
    this.getDoors = getDoors;
    this.onEvent = onEvent;

    /** @type {Map<string, NetPawn>} */
    this.pawns = new Map();
    /** @type {RemoteAvatars|null} */
    this.avatars = null;
    this.tick = 0;
    this._inputSeq = 0;
    this._snapAcc = 0;
    this._inputAcc = 0;
    /** @type {import('./NetTypes.js').EventMsg[]} */
    this._pendingEvents = [];
    /** @type {import('./NetTypes.js').SnapshotMsg|null} */
    this._pendingSnap = null;
    /** @type {THREE.Vector3[]} */
    this._spawnPoints = [];
    this._matchEnded = false;
    /** Rising-edge tracker for InputFrame.interact per pawn id. */
    this._prevInteract = new Map();
  }

  /** @param {THREE.Scene} scene */
  attachScene(scene) {
    this.avatars = new RemoteAvatars(scene);
  }

  /**
   * Seed pawns from room.players with spawn points from mapData.spawnPoints.
   * @param {{ players?: Array<{ id: string, name?: string, team?: string }> }} room
   * @param {THREE.Vector3[]|Array<{x:number,y:number,z:number}>} [spawnPoints]
   */
  begin(room, spawnPoints) {
    this.pawns.clear();
    this._matchEnded = false;
    this.tick = 0;
    this._inputSeq = 0;
    this._snapAcc = 0;
    this._inputAcc = 0;
    this._pendingEvents = [];
    this._pendingSnap = null;
    this._prevInteract.clear();

    const spawns = (spawnPoints || this.mapData?.spawnPoints || []).map((s, i) => {
      if (s?.clone) return s.clone();
      return new THREE.Vector3(s?.x ?? 0, s?.y ?? PLAYER_HEIGHT, s?.z ?? i * 2);
    });
    if (!spawns.length) {
      spawns.push(new THREE.Vector3(0, PLAYER_HEIGHT, 8));
    }
    this._spawnPoints = spawns;

    const players = room?.players || [];
    players.forEach((p, i) => {
      const spawn = spawns[i % spawns.length].clone();
      const pawn = new NetPawn({
        id: p.id,
        name: p.name || `Player ${i + 1}`,
        team: p.team ?? null,
        spawn,
        outfitIndex: i % 9,
      });
      if (this.isHost && this.physics && p.id !== this.localId) {
        // Never spawn a second Rapier body for the local host — Player already owns one.
        pawn.setPhysics(this.physics);
      }
      this.pawns.set(p.id, pawn);
    });
  }

  /**
   * Guest or host: call each frame from Game._update when MP live.
   * @param {number} dt
   * @param {{
   *   player?: import('../game/Player.js').Player,
   *   weapons?: object,
   *   colliders?: any[],
   *   floors?: any[],
   *   shotBlocked?: (from: THREE.Vector3, to: THREE.Vector3) => boolean,
   *   resolveShot?: Function,
   * }} [ctx]
   */
  update(dt, ctx = {}) {
    if (this.isHost) this._updateHost(dt, ctx);
    else this._updateGuest(dt, ctx);
  }

  /**
   * @param {object} msg
   * @param {string} [fromId]
   */
  onMessage(msg, fromId) {
    if (!msg || typeof msg !== 'object') return;
    const t = msg.t;

    if (t === NET_MSG.hello) {
      // Guest announce — host already has room roster; optional late join hook
      return;
    }

    if (t === NET_MSG.input && this.isHost) {
      const id = msg.id || fromId;
      const pawn = id ? this.pawns.get(id) : null;
      if (pawn) pawn.setInput(msg);
      return;
    }

    if (t === NET_MSG.snapshot && !this.isHost) {
      this._pendingSnap = msg;
      return;
    }

    if (t === NET_MSG.event) {
      this.onEvent?.(msg);
    }
  }

  dispose() {
    this.avatars?.clear();
    this.pawns.clear();
    this._pendingSnap = null;
    this._pendingEvents = [];
  }

  // ─── Host ───────────────────────────────────────────────────────────

  /**
   * @param {number} dt
   * @param {object} ctx
   */
  _updateHost(dt, ctx) {
    const player = ctx.player || this.getLocalPlayer?.();
    const weapons = ctx.weapons || this.getWeapons?.();
    const world = {
      colliders: ctx.colliders || this.mapData?.colliders || [],
      floors: ctx.floors || this.mapData?.floors || [],
      physics: this.physics,
    };

    // 1. Sample local input → local pawn (peek reload; claim E for host door authority)
    const localPawn = this.pawns.get(this.localId);
    if (localPawn && player) {
      this._inputSeq += 1;
      const frame = sampleInputFrame(player, {
        seq: this._inputSeq,
        tick: this.tick,
        dt,
        weaponSlot: weapons?.index ?? player.weaponIndex ?? 0,
        aimHold: !!player.buttons?.right,
        peek: true,
      });
      // Claim E only near a door — leave medkit E for Game._updateInteract
      const nearDoor = this.getDoors?.()?.getNearby?.(player.position);
      if (nearDoor && typeof player.consumeUsePress === 'function' && player.consumeUsePress()) {
        frame.interact = true;
      }
      localPawn.setInput(frame);
      // Host local body stays on Player.update — mirror pose into the pawn for combat/snaps
      localPawn.position.copy(player.position);
      localPawn.velocity.copy(player.velocity);
      localPawn.yaw = player.yaw;
      localPawn.pitch = player.pitch;
      localPawn.grounded = !!player.grounded;
      localPawn.aiming = !!frame.aimHold;
      localPawn.weaponSlot = frame.weaponSlot | 0;
    }

    // Late join: seed any room players missing from pawns
    const roomPlayers = this.session?.room?.players;
    if (roomPlayers?.length) {
      for (let i = 0; i < roomPlayers.length; i++) {
        const rp = roomPlayers[i];
        if (this.pawns.has(rp.id)) continue;
        const spawn = this._pickSpawn();
        const pawn = new NetPawn({
          id: rp.id,
          name: rp.name || `Player ${i + 1}`,
          team: rp.team ?? null,
          spawn,
          outfitIndex: i % 9,
        });
        if (this.physics && rp.id !== this.localId) pawn.setPhysics(this.physics);
        this.pawns.set(rp.id, pawn);
      }
    }

    // Respawn timers
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    for (const pawn of this.pawns.values()) {
      if (pawn._fireCd > 0) pawn._fireCd = Math.max(0, pawn._fireCd - dt);
      if (!pawn.alive && pawn.respawnAt > 0 && now >= pawn.respawnAt) {
        const spawn = this._pickSpawn();
        pawn.respawn(spawn);
        this._emitEvent({
          t: NET_MSG.event,
          kind: 'respawn',
          victimId: pawn.id,
          extra: { x: spawn.x, y: spawn.y, z: spawn.z },
        });
      }
    }

    // 2. Host-authoritative doors (E / interact rising edge)
    this._hostDoors();

    // 3. Step remote pawns only (local uses Player.update)
    for (const pawn of this.pawns.values()) {
      if (!pawn.alive || pawn.id === this.localId) continue;
      pawn.stepMovement(dt, world);
    }

    // 4. Combat
    this._hostCombat(dt, ctx);

    // 5. Snapshots (include door states for late-join / desync recovery)
    this.tick += 1;
    this._snapAcc += dt;
    const snapInterval = 1 / SNAPSHOT_HZ;
    if (this._snapAcc >= snapInterval) {
      this._snapAcc %= snapInterval;
      const doors = this.getDoors?.();
      const snap = {
        t: NET_MSG.snapshot,
        tick: this.tick,
        players: [...this.pawns.values()].map((p) => p.toSnap()),
        doors: doors?.toNetState?.() || undefined,
      };
      this.session?.sendGame?.(snap);
    }

    // Flush events
    while (this._pendingEvents.length) {
      const ev = this._pendingEvents.shift();
      this.session?.sendGame?.(ev);
      this.onEvent?.(ev);
    }

    // Remote avatars for host view of guests
    if (this.avatars) {
      const remotes = [...this.pawns.values()]
        .filter((p) => p.id !== this.localId)
        .map((p) => p.toSnap());
      this.avatars.applySnapshot(remotes, this.localId, dt);
    }

    // Mirror auth combat stats onto local Player (position stays with player.update)
    if (localPawn && player) {
      player.health = localPawn.health;
      player.kills = localPawn.kills;
      player.deaths = localPawn.deaths;
      player.alive = localPawn.alive;
    }
  }

  /**
   * @param {number} dt
   * @param {object} ctx
   */
  _hostCombat(dt, ctx) {
    if (this._matchEnded) return;

    for (const attacker of this.pawns.values()) {
      if (!attacker.alive || !attacker.lastInput?.fire) continue;
      if (attacker._fireCd > 0) continue;
      if (attacker.id === this.localId && (ctx.spawnGuard || 0) > 0) continue;

      attacker._fireCd = FIRE_INTERVAL;
      const origin = attacker.position.clone();
      const dir = attacker.lookDirection;
      const hit = this._hitscan(attacker, origin, dir, ctx);
      if (!hit) continue;

      const victim = hit.pawn;
      const dmg = hit.headshot ? DMG_HEAD : DMG_BODY;
      const killed = victim.takeDamage(dmg);

      this._emitEvent({
        t: NET_MSG.event,
        kind: 'hit',
        attackerId: attacker.id,
        victimId: victim.id,
        damage: dmg,
        headshot: !!hit.headshot,
      });

      if (killed) {
        attacker.kills += 1;
        this._emitEvent({
          t: NET_MSG.event,
          kind: 'kill',
          attackerId: attacker.id,
          victimId: victim.id,
          headshot: !!hit.headshot,
        });

        if (attacker.kills >= KILL_LIMIT) {
          this._matchEnded = true;
          this._emitEvent({
            t: NET_MSG.event,
            kind: 'match_end',
            winnerId: attacker.id,
            extra: { kills: attacker.kills },
          });
        }
      }
    }
  }

  /**
   * @param {NetPawn} attacker
   * @param {THREE.Vector3} origin
   * @param {THREE.Vector3} dir
   * @param {object} ctx
   */
  _hitscan(attacker, origin, dir, ctx) {
    let best = null;
    let bestDist = SHOT_RANGE;

    for (const other of this.pawns.values()) {
      if (other.id === attacker.id || !other.alive) continue;
      // Team modes: no friendly fire when both have a team
      if (attacker.team && other.team && attacker.team === other.team) continue;

      // Prefer avatar hit volumes when available
      const avatarEntry = this.avatars?.byId?.get(other.id);
      const volumes =
        typeof avatarEntry?.character?.getHitVolumes === 'function'
          ? avatarEntry.character.getHitVolumes()
          : null;

      if (volumes?.length) {
        for (const vol of volumes) {
          const hit =
            vol.kind === 'capsule'
              ? rayHitsCapsule(origin, dir, vol.a, vol.b, vol.radius)
              : rayHitsSphere(origin, dir, vol.center, vol.radius);
          if (!hit || hit.dist > bestDist || hit.dist < 0.05) continue;
          if (ctx.shotBlocked?.(origin, hit.point)) continue;
          best = { pawn: other, dist: hit.dist, headshot: !!vol.headshot, point: hit.point };
          bestDist = hit.dist;
        }
        continue;
      }

      // Fallback: head at eye + chest sphere
      const head = other.position.clone();
      const chest = other.position.clone();
      chest.y -= 0.45;

      for (const [center, radius, headshot] of [
        [head, HEAD_RADIUS, true],
        [chest, CHEST_RADIUS, false],
      ]) {
        const hit = rayHitsSphere(origin, dir, center, radius);
        if (!hit || hit.dist > bestDist || hit.dist < 0.05) continue;
        if (ctx.shotBlocked?.(origin, hit.point)) continue;
        best = { pawn: other, dist: hit.dist, headshot, point: hit.point };
        bestDist = hit.dist;
      }
    }

    return best;
  }

  /** @param {import('./NetTypes.js').EventMsg} ev */
  _emitEvent(ev) {
    this._pendingEvents.push(ev);
  }

  /** Rising-edge interact → toggle nearest door; broadcast absolute open state. */
  _hostDoors() {
    const doors = this.getDoors?.();
    if (!doors) return;

    for (const pawn of this.pawns.values()) {
      if (!pawn.alive) {
        this._prevInteract.set(pawn.id, false);
        continue;
      }
      const now = !!pawn.lastInput?.interact;
      const was = !!this._prevInteract.get(pawn.id);
      this._prevInteract.set(pawn.id, now);
      if (!now || was) continue;

      const door = doors.tryToggleAt(pawn.position);
      if (!door?.name) continue;
      this._emitEvent({
        t: NET_MSG.event,
        kind: 'door',
        doorId: door.name,
        open: !!door.open,
      });
    }
  }

  _pickSpawn() {
    const list = this._spawnPoints;
    if (!list.length) return new THREE.Vector3(0, PLAYER_HEIGHT, 8);
    const i = Math.floor(Math.random() * list.length);
    return list[i].clone();
  }

  // ─── Guest ──────────────────────────────────────────────────────────

  /**
   * @param {number} dt
   * @param {object} ctx
   */
  _updateGuest(dt, ctx) {
    const player = ctx.player || this.getLocalPlayer?.();
    const weapons = ctx.weapons || this.getWeapons?.();

    // 1. Send input at INPUT_HZ
    this._inputAcc += dt;
    const inputInterval = 1 / INPUT_HZ;
    if (this._inputAcc >= inputInterval && player) {
      this._inputAcc %= inputInterval;
      this._inputSeq += 1;
      this.tick += 1;
      const frame = sampleInputFrame(player, {
        seq: this._inputSeq,
        tick: this.tick,
        dt: inputInterval,
        weaponSlot: weapons?.index ?? player.weaponIndex ?? 0,
        aimHold: !!player.buttons?.right,
        peek: true,
      });
      // Claim E only near a door — leave medkit E for Game._updateInteract
      const nearDoor = this.getDoors?.()?.getNearby?.(player.position);
      if (nearDoor && typeof player.consumeUsePress === 'function' && player.consumeUsePress()) {
        frame.interact = true;
      }
      frame.id = this.localId;
      this.session?.sendGame?.(frame);
    }

    // 2. Local player.update stays in Game (prediction)

    // 3–4. Apply pending snapshot
    if (this._pendingSnap) {
      this._applySnapshot(this._pendingSnap, dt, ctx);
      this._pendingSnap = null;
    }
  }

  /**
   * @param {import('./NetTypes.js').SnapshotMsg} msg
   * @param {number} dt
   * @param {object} ctx
   */
  _applySnapshot(msg, dt, ctx) {
    this._lastSnapAt =
      typeof performance !== 'undefined' ? performance.now() : Date.now();

    // Door truth from host (also covered by door events; snapshot heals desync / late join)
    if (msg.doors?.length) {
      this.getDoors?.()?.applyNetState?.(msg.doors);
    }

    const players = msg.players || [];
    for (const snap of players) {
      let pawn = this.pawns.get(snap.id);
      if (!pawn) {
        pawn = new NetPawn({
          id: snap.id,
          name: snap.name || 'Player',
          team: snap.team ?? null,
          spawn: new THREE.Vector3(snap.x, snap.y, snap.z),
          outfitIndex: 0,
        });
        this.pawns.set(snap.id, pawn);
      }
      pawn.position.set(snap.x, snap.y, snap.z);
      pawn.yaw = snap.yaw;
      pawn.pitch = snap.pitch;
      pawn.health = snap.hp;
      pawn.alive = snap.alive;
      pawn.kills = snap.kills;
      pawn.deaths = snap.deaths;
      pawn.weaponSlot = snap.weapon;
      pawn.aiming = !!snap.aiming;
    }

    const player = ctx.player || this.getLocalPlayer?.();
    const localSnap = players.find((p) => p.id === this.localId);
    if (player && localSnap) {
      player.health = localSnap.hp;
      player.kills = localSnap.kills;
      player.deaths = localSnap.deaths;
      // Death from host truth; revive only via respawn event (avoids tab-wake pose yank)
      if (!localSnap.alive && player.alive) {
        player.alive = false;
      }

      // Skip harsh pose correction right after a tab wake — it feels like a full reset.
      if (!ctx.wakeGrace && localSnap.alive && player.alive) {
        const auth = new THREE.Vector3(localSnap.x, localSnap.y, localSnap.z);
        // Prefer horizontal correction — vertical door/floor fights felt like sticky walls
        const dxz = Math.hypot(player.position.x - auth.x, player.position.z - auth.z);
        const dy = Math.abs(player.position.y - auth.y);
        if (dxz > CORRECT_DIST || dy > CORRECT_DIST + 1.5) {
          const keys = player.keys;
          const moving =
            keys?.has?.('KeyW') ||
            keys?.has?.('KeyA') ||
            keys?.has?.('KeyS') ||
            keys?.has?.('KeyD');
          const t = moving
            ? Math.min(0.12, dt * 1.6)
            : dxz > 8 || dy > 8
              ? 0.28
              : Math.min(0.4, dt * 5);
          player.position.x = THREE.MathUtils.lerp(player.position.x, auth.x, t);
          player.position.z = THREE.MathUtils.lerp(player.position.z, auth.z, t);
          if (dy > 1.25) {
            player.position.y = THREE.MathUtils.lerp(player.position.y, auth.y, t);
          }
          if (player._rapier && player.physics) {
            player.physics.teleport?.(
              player._rapier,
              player.position.x,
              player.position.y,
              player.position.z
            );
          }
        }
      }
    }

    this.avatars?.applySnapshot(players, this.localId, dt);
  }
}
/**
 * @param {THREE.Vector3} origin
 * @param {THREE.Vector3} dir
 * @param {THREE.Vector3} center
 * @param {number} radius
 * @returns {{ dist: number, point: THREE.Vector3 }|null}
 */
function rayHitsSphere(origin, dir, center, radius) {
  if (!center) return null;
  const oc = new THREE.Vector3().subVectors(origin, center);
  const b = oc.dot(dir);
  const c = oc.dot(oc) - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  let t = -b - s;
  if (t < 0) t = -b + s;
  if (t < 0) return null;
  const point = origin.clone().addScaledVector(dir, t);
  return { dist: t, point };
}

/**
 * @param {THREE.Vector3} origin
 * @param {THREE.Vector3} dir
 * @param {THREE.Vector3} a
 * @param {THREE.Vector3} b
 * @param {number} radius
 */
function rayHitsCapsule(origin, dir, a, b, radius) {
  if (!a || !b) return null;
  // Approximate: sample spheres along segment
  let best = null;
  const steps = 4;
  const tmp = new THREE.Vector3();
  for (let i = 0; i <= steps; i++) {
    tmp.lerpVectors(a, b, i / steps);
    const hit = rayHitsSphere(origin, dir, tmp, radius);
    if (hit && (!best || hit.dist < best.dist)) best = hit;
  }
  return best;
}
