import * as THREE from 'three';
import { KILL_LIMIT, PLAYER_HEIGHT, PLAYER_MAX_HP, HEAD_HIT_RADIUS } from '../game/constants.js';
import { pickVolumeHit } from '../game/hitscan.js';
import { getModeById } from '../modes/registry.js';
import { pickTeamSpawn, teamOutfitIndex, teamReachedLimit } from '../modes/tdm.js';
import {
  createCtfState,
  stepCtf,
  flagsToNet,
  applyFlagsNet,
} from '../modes/ctf.js';
import { BR_ZONE, brZoneFromMap, zoneRadiusAt, isOutsideZone } from '../modes/pubg.js';
import {
  NET_MSG,
  SNAPSHOT_HZ,
  INPUT_HZ,
  LAG_COMP_MAX_MS,
  RECONCILE_EPS_XZ,
  RECONCILE_SNAP_XZ,
  RECONCILE_SOFT_XZ,
} from './NetTypes.js';
import { sampleInputFrame } from './sampleInput.js';
import { NetPawn } from './NetPawn.js';
import { RemoteAvatars } from './RemoteAvatars.js';
import { InputHistory, residualError } from './InputHistory.js';
import { PoseHistory, clampRewindMs } from './PoseHistory.js';

const FIRE_INTERVAL = 0.15;
const DMG_BODY = 28;
const SHOT_RANGE = 80;
const CHEST_RADIUS = 0.32;
/** Fallback hard correct if reconcile history missing (metres XZ). */
const CORRECT_DIST = 4.0;
const POSE_HISTORY_CAP = 48;

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
   *   getFlags?: () => import('../game/Flags.js').FlagManager|null,
   *   getZone?: () => import('../game/Zone.js').ZoneRing|null,
   *   onEvent?: (msg: import('./NetTypes.js').EventMsg) => void,
   *   mode?: import('../modes/IGameMode.js').IGameMode,
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
    getFlags = null,
    getZone = null,
    onEvent = null,
    mode = null,
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
    this.getFlags = getFlags;
    this.getZone = getZone;
    this.onEvent = onEvent;
    this.mode = mode || getModeById('deathmatch');
    /** @type {{ alpha: number, bravo: number }} */
    this.teamKills = { alpha: 0, bravo: 0 };
    this.captures = { alpha: 0, bravo: 0 };
    this.ctf = null;
    this.matchTime = 0;
    this.zone = null;
    this._zoneDmgAcc = 0;

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
    /** Guest: predicted poses keyed by input seq. */
    this._inputHistory = new InputHistory(64);
    /** Host: pose ring buffer per pawn id for lag-comp. */
    this._poseHistory = new Map();
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
    this._inputHistory.clear();
    this._poseHistory.clear();
    this.teamKills = { alpha: 0, bravo: 0 };
    this.captures = { alpha: 0, bravo: 0 };
    this.ctf = null;
    if (this.mode?.id === 'ctf') {
      this.ctf = createCtfState(this.mapData?.flagHomes);
      this.captures = this.ctf.captures;
      this.mode.onMatchStart?.(this);
    }
    this.matchTime = 0;
    this.zone = null;
    this._zoneDmgAcc = 0;
    if (this.mode?.id === 'pubg') {
      const zone = brZoneFromMap(this.mapData);
      this.zone = {
        r: zoneRadiusAt(0, zone),
        t: 0,
        cx: zone.centerX ?? BR_ZONE.centerX,
        cz: zone.centerZ ?? BR_ZONE.centerZ,
      };
      this.getZone?.()?.setRadius(this.zone.r);
    }

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
      const team = p.team ?? null;
      const spawn = this._pickSpawn(team);
      const pawn = new NetPawn({
        id: p.id,
        name: p.name || `Player ${i + 1}`,
        team,
        spawn,
        outfitIndex: teamOutfitIndex(team, i % 9),
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
    this.ctf = null;
    this.zone = null;
    this.matchTime = 0;
    this._zoneDmgAcc = 0;
    this._pendingSnap = null;
    this._pendingEvents = [];
    this._inputHistory.clear();
    this._poseHistory.clear();
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
      bounds: this.mapData?.bounds ?? 38,
      slowZones: this.mapData?.slowZones || [],
      belts: this.mapData?.belts || [],
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

    // Late join: seed any room players missing from pawns (not BR)
    const roomPlayers = this.session?.room?.players;
    if (roomPlayers?.length && this.mode?.allowLateJoin !== false) {
      for (let i = 0; i < roomPlayers.length; i++) {
        const rp = roomPlayers[i];
        if (this.pawns.has(rp.id)) continue;
        const team = rp.team ?? null;
        const spawn = this._pickSpawn(team);
        const pawn = new NetPawn({
          id: rp.id,
          name: rp.name || `Player ${i + 1}`,
          team,
          spawn,
          outfitIndex: teamOutfitIndex(team, i % 9),
        });
        if (this.physics && rp.id !== this.localId) pawn.setPhysics(this.physics);
        this.pawns.set(rp.id, pawn);
      }
    }

    // Respawn timers (Battle Royale: stay dead)
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const allowRespawn = this.mode?.allowRespawn !== false;
    for (const pawn of this.pawns.values()) {
      if (pawn._fireCd > 0) pawn._fireCd = Math.max(0, pawn._fireCd - dt);
      if (!allowRespawn) continue;
      if (!pawn.alive && pawn.respawnAt > 0 && now >= pawn.respawnAt) {
        const spawn = this._pickSpawn(pawn.team);
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

    // Record poses for lag-compensated hitscan (after movement)
    const nowPose =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    for (const pawn of this.pawns.values()) {
      this._recordPose(pawn, nowPose);
    }

    // 4. Combat
    this._hostCombat(dt, ctx);

    // 4b. CTF flags after poses/combat so deaths drop the same tick
    this._hostFlags();
    this._hostZone(dt);

    // 5. Snapshots (include door states + ackSeq via toSnap for guest reconcile)
    this.tick += 1;
    this._snapAcc += dt;
    const snapInterval = 1 / SNAPSHOT_HZ;
    if (this._snapAcc >= snapInterval) {
      this._snapAcc %= snapInterval;
      const doors = this.getDoors?.();
      const snap = {
        t: NET_MSG.snapshot,
        tick: this.tick,
        serverTime: nowPose,
        players: [...this.pawns.values()].map((p) => p.toSnap()),
        doors: doors?.toNetState?.() || undefined,
        modeId: this.mode?.id,
        teamKills: this.mode?.teams ? { ...this.teamKills } : undefined,
        captures: this.mode?.id === 'ctf' ? { ...this.captures } : undefined,
        flags: this.ctf ? flagsToNet(this.ctf) : undefined,
        zone: this.zone ? { ...this.zone } : undefined,
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
      this.avatars.applySnapshot(remotes, this.localId, dt, nowPose);
      this.avatars.tick(dt, this.localId);
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
      const dmg = hit.headshot ? PLAYER_MAX_HP : DMG_BODY;
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
        this.mode?.onKill?.(this, attacker);
        this._emitEvent({
          t: NET_MSG.event,
          kind: 'kill',
          attackerId: attacker.id,
          victimId: victim.id,
          headshot: !!hit.headshot,
        });
        this._maybeEndMatch(attacker);
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

    const now =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    // Estimate attacker latency from time since their last accepted input
    let rewindMs = 0;
    if (attacker.id !== this.localId && attacker.lastInputAt > 0) {
      rewindMs = clampRewindMs(now - attacker.lastInputAt, {
        maxMs: LAG_COMP_MAX_MS,
      });
    } else if (attacker.id !== this.localId) {
      rewindMs = clampRewindMs(80, { maxMs: LAG_COMP_MAX_MS });
    }
    const rewindAt = now - rewindMs;

    for (const other of this.pawns.values()) {
      if (other.id === attacker.id || !other.alive) continue;
      if (
        this.mode?.friendlyFire === false &&
        attacker.team &&
        other.team &&
        attacker.team === other.team
      ) {
        continue;
      }

      const rewound = this._poseAt(other.id, rewindAt);
      const eye = rewound
        ? new THREE.Vector3(rewound.x, rewound.y, rewound.z)
        : other.position.clone();

      // Prefer avatar hit volumes when available, offset by rewind delta
      const avatarEntry = this.avatars?.byId?.get(other.id);
      const volumes =
        typeof avatarEntry?.character?.getHitVolumes === 'function'
          ? avatarEntry.character.getHitVolumes()
          : null;

      if (volumes?.length && !rewound) {
        const head =
          typeof avatarEntry.character.getHeadWorldPosition === 'function'
            ? avatarEntry.character.getHeadWorldPosition()
            : volumes.find((vol) => vol.headshot)?.center;
        const picked = pickVolumeHit(origin, dir, bestDist, volumes, head, {
          rayHitsSphere,
          rayHitsCapsule,
          shotBlocked: (from, to) => ctx.shotBlocked?.(from, to),
        });
        if (picked) {
          best = { pawn: other, dist: picked.dist, headshot: picked.headshot, point: picked.point };
          bestDist = picked.dist;
        }
        continue;
      }

      // Lag-comp / fallback: head at eye + chest sphere at rewound pose
      const head = eye.clone();
      const chest = eye.clone();
      chest.y -= (other.height || PLAYER_HEIGHT) * 0.22;
      const picked = pickVolumeHit(
        origin,
        dir,
        bestDist,
        [
          { kind: 'sphere', center: head, radius: HEAD_HIT_RADIUS, headshot: true },
          { kind: 'sphere', center: chest, radius: CHEST_RADIUS, headshot: false },
        ],
        head,
        {
          rayHitsSphere,
          rayHitsCapsule,
          shotBlocked: (from, to) => ctx.shotBlocked?.(from, to),
        }
      );
      if (picked) {
        best = { pawn: other, dist: picked.dist, headshot: picked.headshot, point: picked.point };
        bestDist = picked.dist;
      }
    }

    return best;
  }

  /** Host-authoritative CTF pickup / drop / return / capture. */
  _hostFlags() {
    if (!this.ctf || this._matchEnded) return;
    const players = [...this.pawns.values()].map((p) => ({
      id: p.id,
      team: p.team,
      x: p.position.x,
      y: p.position.y,
      z: p.position.z,
      alive: !!p.alive,
    }));
    const events = stepCtf(this.ctf, players);
    this.captures = this.ctf.captures;
    for (const ev of events) {
      this._emitEvent({
        t: NET_MSG.event,
        kind: ev.kind,
        attackerId: ev.playerId || undefined,
        extra: {
          team: ev.team,
          flagTeam: ev.flagTeam,
          playerId: ev.playerId,
        },
      });
      if (ev.kind === 'flag_capture') {
        this._maybeEndMatch(this.pawns.get(ev.playerId));
      }
    }
    this.getFlags?.()?.applyNet?.(flagsToNet(this.ctf));
  }

  /** Host-authoritative shrinking zone + outside damage (Battle Royale). */
  _hostZone(dt) {
    if (this.mode?.id !== 'pubg' || this._matchEnded) return;
    this.matchTime += dt;
    const zone = brZoneFromMap(this.mapData);
    const r = zoneRadiusAt(this.matchTime, zone);
    this.zone = {
      r,
      t: this.matchTime,
      cx: zone.centerX ?? BR_ZONE.centerX,
      cz: zone.centerZ ?? BR_ZONE.centerZ,
    };
    this.getZone?.()?.setRadius(r);

    this._zoneDmgAcc += dt;
    const tick = 0.45;
    if (this._zoneDmgAcc < tick) return;
    this._zoneDmgAcc %= tick;
    const dmg = (zone.dps ?? BR_ZONE.dps) * tick;
    let killedAny = false;
    for (const pawn of this.pawns.values()) {
      if (!pawn.alive) continue;
      if (!isOutsideZone(pawn.position.x, pawn.position.z, r, this.zone.cx, this.zone.cz)) {
        continue;
      }
      const killed = pawn.takeDamage(dmg);
      this._emitEvent({
        t: NET_MSG.event,
        kind: 'hit',
        attackerId: 'zone',
        victimId: pawn.id,
        damage: dmg,
        extra: { zone: true },
      });
      if (killed) {
        killedAny = true;
        this._emitEvent({
          t: NET_MSG.event,
          kind: 'kill',
          attackerId: 'zone',
          victimId: pawn.id,
          extra: { zone: true },
        });
      }
    }
    if (killedAny) this._maybeEndMatch(null);
  }

  /** @param {NetPawn} pawn @param {number} t */
  _recordPose(pawn, t) {
    if (!pawn?.id) return;
    let hist = this._poseHistory.get(pawn.id);
    if (!hist) {
      hist = new PoseHistory(POSE_HISTORY_CAP);
      this._poseHistory.set(pawn.id, hist);
    }
    hist.push({
      t,
      x: pawn.position.x,
      y: pawn.position.y,
      z: pawn.position.z,
      yaw: pawn.yaw,
      pitch: pawn.pitch,
    });
  }

  /** @param {string} id @param {number} when */
  _poseAt(id, when) {
    return this._poseHistory.get(id)?.sampleAt(when) || null;
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

  /**
   * Host win check after a kill (or later: capture / last alive). Uses the active mode module.
   * @param {NetPawn} [attacker]
   */
  _maybeEndMatch(attacker) {
    if (this._matchEnded) return;
    const mode = this.mode || getModeById('deathmatch');
    const pawns = [...this.pawns.values()];
    const topKills = Math.max(0, attacker?.kills ?? 0, ...pawns.map((p) => p.kills || 0));
    const alive = pawns.filter((p) => p.alive);
    const aliveCount = alive.length;
    const playerCount = pawns.length;
    const eliminatedCount = Math.max(0, playerCount - aliveCount);
    const won = mode.checkWin({
      kills: topKills,
      teamKills: this.teamKills,
      captures: this.captures,
      aliveCount,
      playerCount,
      eliminatedCount,
    });
    if (!won) return;

    this._matchEnded = true;
    let winner = attacker;
    if (mode.id === 'pubg') {
      if (aliveCount === 1) winner = alive[0];
      else if (aliveCount === 0) {
        winner =
          attacker ||
          pawns.reduce(
            (best, p) => (!best || (p.kills || 0) > (best.kills || 0) ? p : best),
            null
          );
      }
    }
    const limit = mode.teamScoreLimit || mode.captureLimit || KILL_LIMIT;
    const scores = mode.id === 'ctf' ? this.captures : this.teamKills;
    const winnerTeam = mode.teams ? teamReachedLimit(scores, limit) : null;
    this._emitEvent({
      t: NET_MSG.event,
      kind: 'match_end',
      winnerId: winner?.id,
      winnerTeam: winnerTeam || undefined,
      extra: {
        kills: winner?.kills,
        teamKills: { ...this.teamKills },
        captures: { ...this.captures },
        winnerTeam,
        modeId: mode.id,
      },
    });
  }

  /**
   * @param {string|null} [team]
   * @returns {THREE.Vector3}
   */
  _pickSpawn(team = null) {
    const list = this._spawnPoints;
    if (!list.length) return new THREE.Vector3(0, PLAYER_HEIGHT, 8);
    const picked = this.mode?.teams ? pickTeamSpawn(list, team) : null;
    const src = picked || list[Math.floor(Math.random() * list.length)];
    if (src?.clone) return src.clone();
    return new THREE.Vector3(src?.x ?? 0, src?.y ?? PLAYER_HEIGHT, src?.z ?? 0);
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
      // Predicted pose at this seq — used when host acks for reconciliation
      this._inputHistory.push(this._inputSeq, player.position);
    }

    // 2. Local player.update stays in Game (prediction)

    // 3–4. Apply pending snapshot
    if (this._pendingSnap) {
      this._applySnapshot(this._pendingSnap, dt, ctx);
      this._pendingSnap = null;
    } else if (this.avatars) {
      // Keep remotes interpolating between snaps
      this.avatars.tick(dt, this.localId);
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

    if (msg.teamKills) {
      this.teamKills = {
        alpha: msg.teamKills.alpha ?? 0,
        bravo: msg.teamKills.bravo ?? 0,
      };
    }
    if (msg.captures) {
      this.captures = {
        alpha: msg.captures.alpha ?? 0,
        bravo: msg.captures.bravo ?? 0,
      };
      if (this.ctf) this.ctf.captures = this.captures;
    }
    if (msg.flags?.length) {
      if (!this.ctf) this.ctf = createCtfState(this.mapData?.flagHomes);
      applyFlagsNet(this.ctf, msg.flags);
      this.getFlags?.()?.applyNet?.(msg.flags);
    }
    if (msg.zone) {
      this.zone = { ...msg.zone };
      if (typeof msg.zone.t === 'number') this.matchTime = msg.zone.t;
      if (typeof msg.zone.r === 'number') this.getZone?.()?.setRadius(msg.zone.r);
    }
    if (msg.modeId && this.mode?.id !== msg.modeId) {
      this.mode = getModeById(msg.modeId);
    }

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
      if (snap.team != null) pawn.team = snap.team;
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
        this._reconcileLocal(player, localSnap, dt);
      }
    }

    this.avatars?.applySnapshot(players, this.localId, dt, msg.serverTime || 0);
    this.avatars?.tick(dt, this.localId);
  }

  /**
   * Phase 4: correct residual error vs predicted pose at ackSeq (not raw distance yank).
   * @param {import('../game/Player.js').Player} player
   * @param {import('./NetTypes.js').PlayerSnap} localSnap
   * @param {number} dt
   */
  _reconcileLocal(player, localSnap, dt) {
    const auth = { x: localSnap.x, y: localSnap.y, z: localSnap.z };
    const ackSeq = localSnap.ackSeq | 0;
    const predicted = ackSeq > 0 ? this._inputHistory.findAtOrBefore(ackSeq) : null;

    let dx;
    let dy;
    let dz;
    let dxz;

    if (predicted) {
      const err = residualError(auth, predicted);
      dx = err.dx;
      dy = err.dy;
      dz = err.dz;
      dxz = err.dxz;
      this._inputHistory.dropThrough(ackSeq);
    } else {
      // No history yet — fall back to absolute distance soft-correct
      dx = auth.x - player.position.x;
      dy = auth.y - player.position.y;
      dz = auth.z - player.position.z;
      dxz = Math.hypot(dx, dz);
      if (dxz < CORRECT_DIST && Math.abs(dy) < CORRECT_DIST + 1.5) return;
    }

    if (dxz < RECONCILE_EPS_XZ && Math.abs(dy) < 0.35) return;

    const keys = player.keys;
    const moving =
      keys?.has?.('KeyW') ||
      keys?.has?.('KeyA') ||
      keys?.has?.('KeyS') ||
      keys?.has?.('KeyD');

    let blend;
    if (dxz >= RECONCILE_SNAP_XZ || Math.abs(dy) > 6) {
      blend = moving ? 0.55 : 0.85;
    } else if (dxz >= RECONCILE_SOFT_XZ) {
      blend = moving ? Math.min(0.22, dt * 3) : Math.min(0.4, dt * 5);
    } else {
      // Tiny residual — gentle nudge
      blend = Math.min(0.12, dt * 2);
    }

    player.position.x += dx * blend;
    player.position.z += dz * blend;
    if (Math.abs(dy) > 0.45) {
      player.position.y += dy * blend;
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
