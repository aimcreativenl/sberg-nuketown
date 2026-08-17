import * as THREE from 'three';
import { VoxelCharacter, BOT_NAMES, PASTEL_OUTFITS } from './VoxelCharacter.js';
import { getBotDifficulty } from './BotDifficulty.js';
import { WEAPONS } from './Weapons.js';
import {
  PLAYER_HEIGHT,
  RESPAWN_TIME,
  KILL_LIMIT,
  PLAYER_MAX_HP,
  USE_RAPIER_BOTS,
  GRAVITY,
  PLAYER_JUMP,
} from './constants.js';
import {
  botPositionBlocked,
  botMoveBlocked,
  BOT_COLLIDE_RADIUS,
  BOT_BODY_HEIGHT,
  rayBlockedBySolids,
  colliderIsActiveSolid,
  isSolidColliderBox,
  MIN_SOLID_HEIGHT,
} from './collision.js';

// Snappier pastel chase (Luckey-like footwork)
const BOT_SPEED = 4.6;
const BOT_SPRINT = 7.0;
const BOT_STRAFE = 3.8;
/** Horizontal steering rates (m/s²): responsive starts, softer stops. */
const BOT_STEER_ACCEL = 18;
const BOT_STEER_DECEL = 15;
const BOT_STEER_EPSILON = 0.01;
/** Jump impulse for fence vaults (must clear ~1.2m tops with body overlap) */
const BOT_VAULT_JUMP = PLAYER_JUMP * 1.12;
/** Max obstacle top (world Y) bots will try to vault */
const BOT_JUMP_MAX_TOP = 1.35;
/** Min time between vault attempts — stops jump-spam against walls */
const BOT_JUMP_COOLDOWN = 2.6;
/** Forward air speed while vaulting (m/s) */
const BOT_VAULT_AIR_SPEED = BOT_SPRINT * 1.2;
const SIGHT_RANGE = 46;
const ATTACK_RANGE = 22;
/** Any bot with LOS inside this range fights — not only the hunter slot list */
const AGGRO_RANGE = 20;
const DONUT_RANGE = 12;
const COMBAT_STOP_DIST = 6.5;
const PLAYER_MIN_DIST = 3.2;
const AIM_WINDUP = 0.35;

function aimWindup() {
  return getBotDifficulty().aimWindup ?? AIM_WINDUP;
}
/** How long a bot stays “aggro’d” after player damages them */
const UNDER_FIRE_TIME = 5.5;

/** Personality / combat style — Phase B roles */
export const BOT_ROLES = {
  hunter: {
    id: 'hunter',
    aggression: 1.15,
    accuracy: 1.0,
    preferCover: 0.25,
    donutBias: 0.35,
    fireCadence: 1.0,
  },
  flanker: {
    id: 'flanker',
    aggression: 1.05,
    accuracy: 0.95,
    preferCover: 0.55,
    donutBias: 0.4,
    fireCadence: 1.05,
    flankOffset: 10,
  },
  lurker: {
    id: 'lurker',
    aggression: 0.75,
    accuracy: 1.15,
    preferCover: 0.9,
    donutBias: 0.25,
    fireCadence: 1.2,
  },
  scavenger: {
    id: 'scavenger',
    aggression: 0.65,
    accuracy: 0.9,
    preferCover: 0.4,
    donutBias: 1.35,
    fireCadence: 1.1,
  },
};

const ROLE_BY_INDEX = ['hunter', 'flanker', 'lurker', 'scavenger', 'hunter', 'flanker', 'lurker', 'hunter', 'flanker'];

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Dynamic hunter count from player pressure (kills + low HP) + difficulty bonus. */
export function computeMaxHunters(playerKills = 0, playerHp = 100, killLimit = KILL_LIMIT) {
  let n = 2;
  if (playerKills >= 3) n = 3;
  if (playerKills >= 8) n = 4;
  if (playerKills >= 14) n = 5;
  if (playerHp < 40) n += 1;
  if (playerHp < 20) n += 1;
  n += getBotDifficulty().hunterBonus || 0;
  return Math.min(6, Math.max(1, n));
}

/**
 * Distance-based aim error scale (higher = worse aim). Close = tight, far = loose.
 * Reaction delay seconds before a bot that just gained LOS may fire.
 */
export function aimErrorForDistance(dist, accuracyMult = 1) {
  const diff = getBotDifficulty();
  const base = 0.12 + Math.max(0, dist - 6) * 0.035;
  const acc = Math.max(0.5, accuracyMult * (diff.accuracy || 1));
  return Math.max(0.08, (base / acc) * (diff.spreadMul || 1));
}

export function reactionDelayForRole(roleId, distPlayer = 20) {
  let base = 0.16;
  if (roleId === 'lurker') base = 0.22;
  else if (roleId === 'scavenger') base = 0.28;
  else if (roleId === 'flanker') base = 0.14;
  // Point-blank: almost immediate fire
  if (distPlayer < 8) base *= 0.45;
  else if (distPlayer < 12) base *= 0.7;
  return base * (getBotDifficulty().reactionMul || 1);
}

/** True if bot should fight player right now (LOS + range / hunter / under fire). */
export function shouldEngagePlayer({
  mayHunt,
  los,
  distPlayer,
  underFire = 0,
  attackRange = ATTACK_RANGE,
  aggroRange = AGGRO_RANGE,
  aggression = 1,
}) {
  if (underFire > 0) return true;
  if (!los || distPlayer >= Infinity) return false;
  if (distPlayer < aggroRange) return true; // anyone who sees you close enough
  if (mayHunt && distPlayer < attackRange * aggression) return true;
  if (mayHunt && distPlayer < SIGHT_RANGE * aggression) return true; // chase band
  return false;
}

export class BotManager {
  constructor(scene, mapData, callbacks = {}) {
    this.scene = scene;
    this.mapData = mapData;
    this.cb = callbacks;
    this.bots = [];
    this.physics = null;
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._preMove = new THREE.Vector3();
    this._toPlayer = new THREE.Vector3();
    this._toDest = new THREE.Vector3();
    this._dest = new THREE.Vector3();
    this._away = new THREE.Vector3();
    this._awayP = new THREE.Vector3();
    this._side = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._next = new THREE.Vector3();
    this._onlyX = new THREE.Vector3();
    this._onlyZ = new THREE.Vector3();
    this._from = new THREE.Vector3();
    this._air = new THREE.Vector3();
    this._losFrom = new THREE.Vector3();
    this._losTo = new THREE.Vector3();
    this._frame = 0;
    this._anim = {
      moving: false,
      sprinting: false,
      moveSpeed: 0,
      grounded: true,
      dead: false,
      aiming: false,
      reloading: false,
      reloadT: 0,
    };
    this.lastHunterCount = 3;
  }

  _setTarget(bot, src) {
    if (!src) {
      bot.target = null;
      return null;
    }
    if (!bot.target) bot.target = new THREE.Vector3();
    return bot.target.copy(src);
  }

  /**
   * Phase 1d: wire Rapier so bots share the player character-controller resolve.
   * Safe to call before or after spawnAll — existing bots get controllers attached.
   * @param {import('../physics/PhysicsManager.js').PhysicsManager|null} physicsManager
   */
  setPhysics(physicsManager) {
    this.physics = physicsManager || null;
    if (!USE_RAPIER_BOTS || !this.physics) return;
    for (const bot of this.bots) {
      if (!bot._rapier) this._attachRapier(bot);
    }
  }

  _usingRapier(bot) {
    return USE_RAPIER_BOTS && !!this.physics && !!bot?._rapier;
  }

  /** Eye-height pose Rapier expects (bot.position is feet). */
  _botEyeY(bot) {
    return (bot.position?.y || 0) + BOT_BODY_HEIGHT;
  }

  _attachRapier(bot) {
    if (!this.physics || bot._rapier) return;
    bot._rapier = this.physics.createPlayerController({
      radius: BOT_COLLIDE_RADIUS,
      height: BOT_BODY_HEIGHT,
      position: {
        x: bot.position.x,
        y: this._botEyeY(bot),
        z: bot.position.z,
      },
    });
    if (bot.dead) this.physics.setCharacterEnabled(bot._rapier, false);
  }

  _detachRapier(bot) {
    if (!bot?._rapier) return;
    this.physics?.removeCharacter(bot._rapier);
    bot._rapier = null;
  }

  spawnAll(count = 9) {
    this.clear();
    const used = [];
    for (let i = 0; i < count; i++) {
      this.bots.push(this._createBot(i, used));
    }
  }

  _createBot(i, used = []) {
    const name = BOT_NAMES[i % BOT_NAMES.length];
    const roleId = ROLE_BY_INDEX[i % ROLE_BY_INDEX.length];
    const role = BOT_ROLES[roleId] || BOT_ROLES.hunter;
    const character = new VoxelCharacter({
      name,
      outfitIndex: i % PASTEL_OUTFITS.length,
    });
    const spawn = this._randomSpawn(used);
    used.push(spawn.clone());
    character.mesh.position.copy(spawn);
    character.mesh.position.y = spawn.y || 0;
    character.setHeldWeapon(0);
    this.scene.add(character.mesh);

    const bot = {
      id: i,
      name,
      role: roleId,
      roleDef: role,
      character,
      health: 100,
      maxHealth: 100,
      position: spawn.clone(),
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'patrol',
      weaponIndex: 0,
      ammo: 10,
      magSize: 10,
      reloading: false,
      reloadTimer: 0,
      reloadDuration: 1.35,
      target: null,
      waypoint: null,
      coverPoint: null,
      peekTimer: 0,
      peekState: 'shoot', // hide only while crouched at cover
      lastSeen: null,
      lastSeenAge: 99,
      coverHold: 0,
      stateHold: 0,
      patrolIndex: i,
      fireCooldown: Math.random() * 1.5,
      dead: false,
      deadTimer: 0,
      kills: 0,
      deaths: 0,
      funPoints: 0,
      killStreak: 0,
      repathTimer: 0,
      shootTimer: 0,
      stuckTimer: 0,
      jumpCooldown: 0,
      velY: 0,
      grounded: true,
      vaulting: false,
      vaultClearY: 0,
      airMoveX: 0,
      airMoveZ: 0,
      vaultTimer: 0,
      lastPos: spawn.clone(),
      _visWeapon: 0,
      aimTimer: 0,
      losTimer: 0, // how long continuous LOS held (reaction delay)
      strafeSign: Math.random() < 0.5 ? -1 : 1,
      strafeTimer: 1.5 + Math.random() * 2,
      yawTarget: Math.random() * Math.PI * 2,
      moveSpeed: 0,
      _prevPos: spawn.clone(),
      underFire: 0,
      hideTime: 0,
      _rapier: null,
    };
    if (USE_RAPIER_BOTS && this.physics) this._attachRapier(bot);
    return bot;
  }

  _randomSpawn(used = []) {
    const pts = this.mapData.spawnPoints || [];
    if (!pts.length) return new THREE.Vector3((Math.random() - 0.5) * 20, 0, (Math.random() - 0.5) * 20);
    let best = pts[Math.floor(Math.random() * pts.length)].clone();
    let bestMin = -1;
    for (let attempt = 0; attempt < 12; attempt++) {
      const p = pts[Math.floor(Math.random() * pts.length)].clone();
      p.y = 0;
      p.x += (Math.random() - 0.5) * 1.5;
      p.z += (Math.random() - 0.5) * 1.5;
      let minD = 99;
      for (const u of used) minD = Math.min(minD, p.distanceTo(u));
      if (minD > bestMin) {
        bestMin = minD;
        best = p;
      }
    }
    best.y = 0;
    return best;
  }

  clear() {
    for (const b of this.bots) {
      this._detachRapier(b);
      this.scene.remove(b.character.mesh);
      b.character.dispose();
    }
    this.bots = [];
  }

  getAliveBots() {
    return this.bots.filter((b) => !b.dead);
  }

  damageBot(botId, damage, attackerInfo = {}) {
    const bot = this.bots.find((b) => b.id === botId);
    if (!bot || bot.dead) return { killed: false, headshot: false };

    const headshot = !!attackerInfo.headshot;
    bot.health = headshot ? 0 : bot.health - damage;
    bot.character.updateHealth?.(bot.health, bot.maxHealth);
    if (bot.health <= 0) {
      bot.health = 0;
      bot.dead = true;
      bot.deadTimer = RESPAWN_TIME;
      bot.deaths += 1;
      bot.killStreak = 0;
      bot.character.setVisible(false);
      this.physics?.setCharacterEnabled(bot._rapier, false);
      const deathPos = bot.position.clone();
      deathPos.y = 0;
      this.cb.onBotDeath?.(bot, deathPos, attackerInfo);
      return { killed: true, headshot };
    }
    // Player shot us → break contact, sprint to cover, then peek-fire
    if (attackerInfo?.isPlayer) {
      bot.underFire = UNDER_FIRE_TIME;
      bot.coverHold = 3.8;
      bot.stateHold = 0.45;
      bot.losTimer = Math.max(bot.losTimer || 0, reactionDelayForRole(bot.role, 6));
      bot.aimTimer = Math.max(bot.aimTimer || 0, aimWindup() * 0.35);
      bot.peekState = 'hide';
      bot.peekTimer = 0.2;
      const playerPos = this.cb.getPlayerPosition?.();
      if (playerPos) {
        const cover = this._pickCoverNear(bot, playerPos) || this._synthesizeCover(bot, playerPos);
        if (cover) {
          bot.coverPoint = cover;
          bot.state = 'cover';
          this._setTarget(bot, cover);
        } else {
          bot.state = 'attack';
          bot.peekState = 'shoot';
          this._setTarget(bot, playerPos);
        }
      }
    }
    return { killed: false, headshot };
  }

  _selectHunters(playerPos, playerAlive) {
    const hunterIds = new Set();
    if (!playerAlive || !playerPos) {
      this.lastHunterCount = 0;
      return hunterIds;
    }
    const kills = this.cb.getPlayerKills?.() ?? 0;
    const hp = this.cb.getPlayerHealth?.() ?? PLAYER_MAX_HP;
    const maxH = computeMaxHunters(kills, hp, KILL_LIMIT);
    this.lastHunterCount = maxH;

    const alive = this.getAliveBots();
    // Score: distance + role preference (hunters/flankers preferred)
    const ranked = alive
      .map((b) => {
        const d = b.position.distanceTo(playerPos);
        let bias = 0;
        if (b.role === 'hunter') bias = -4;
        else if (b.role === 'flanker') bias = -2;
        else if (b.role === 'lurker') bias = 1;
        else if (b.role === 'scavenger') bias = 3;
        return { id: b.id, score: d + bias };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, maxH);
    for (const r of ranked) hunterIds.add(r.id);
    return hunterIds;
  }

  _pickCoverNear(bot, playerPos) {
    const covers = this.mapData.coverPoints || [];
    if (!playerPos) return null;
    if (!covers.length) return this._synthesizeCover(bot, playerPos);
    const ranked = [];
    const bx = bot.position.x;
    const bz = bot.position.z;
    const px = playerPos.x;
    const pz = playerPos.z;
    for (let i = 0; i < covers.length; i++) {
      const c = covers[i];
      const cx = c.x;
      const cz = c.z;
      const toBot = Math.hypot(cx - bx, cz - bz);
      if (toBot > 40) continue;
      const toPlayer = Math.hypot(cx - px, cz - pz);
      if (toPlayer < 2.4 || toPlayer > 42) continue;
      ranked.push({ i, score: toBot * 0.55 + Math.abs(toPlayer - 8) * 0.35 });
    }
    if (!ranked.length) return this._synthesizeCover(bot, playerPos);
    ranked.sort((a, b) => a.score - b.score);
    const limit = Math.min(6, ranked.length);
    let best = null;
    let bestScore = Infinity;
    for (let n = 0; n < limit; n++) {
      const c = covers[ranked[n].i];
      const p = { x: c.x, y: 0, z: c.z };
      let score = ranked[n].score;
      if (!this._hasLOS(p, playerPos)) score -= 3;
      if (score < bestScore) {
        bestScore = score;
        if (!best) best = new THREE.Vector3();
        best.set(c.x, 0, c.z);
      }
    }
    return best || this._synthesizeCover(bot, playerPos);
  }

  /** Sidestep + back off when the map has no usable authored cover nearby. */
  _synthesizeCover(bot, playerPos) {
    if (!playerPos) return null;
    const away = this._away.copy(bot.position).sub(playerPos);
    away.y = 0;
    if (away.lengthSq() < 0.01) away.set(bot.strafeSign || 1, 0, 0);
    else away.normalize();
    const side = this._side.set(-away.z, 0, away.x).multiplyScalar(bot.strafeSign || 1);
    return new THREE.Vector3(
      bot.position.x + away.x * 6.2 + side.x * 3.4,
      0,
      bot.position.z + away.z * 6.2 + side.z * 3.4
    );
  }

  _runCoverBehavior(bot, playerPos, distPlayer, los, dt) {
    if (
      !bot.coverPoint ||
      bot.repathTimer <= 0 ||
      bot.position.distanceTo(bot.coverPoint) > 28
    ) {
      bot.coverPoint = this._pickCoverNear(bot, playerPos) || this._synthesizeCover(bot, playerPos);
      bot.repathTimer = 2.2 + Math.random() * 1.2;
    }
    if (!bot.coverPoint) {
      bot.state = 'attack';
      bot.peekState = 'shoot';
      this._setTarget(bot, playerPos);
      return;
    }
    const dCover = bot.position.distanceTo(bot.coverPoint);
    if (dCover >= 1.5) {
      bot.state = 'cover';
      this._setTarget(bot, bot.coverPoint);
      bot.hideTime = 0;
      return;
    }
    if (bot.peekState === 'hide') bot.hideTime = (bot.hideTime || 0) + dt;
    else bot.hideTime = 0;
    if (bot.hideTime > 0.85 || (los && distPlayer < 9 && bot.peekState === 'hide')) {
      bot.peekState = 'shoot';
      bot.peekTimer = 0.9 + Math.random() * 0.4;
      bot.hideTime = 0;
    }
    if (bot.peekTimer <= 0) {
      if (bot.peekState === 'hide') {
        bot.peekState = 'peak';
        bot.peekTimer = 0.3 + Math.random() * 0.2;
      } else if (bot.peekState === 'peak') {
        bot.peekState = 'shoot';
        bot.peekTimer = 0.85 + Math.random() * 0.5;
      } else {
        bot.peekState = distPlayer < 8 || bot.underFire < 0.4 ? 'shoot' : 'hide';
        bot.peekTimer =
          bot.peekState === 'hide' ? 0.4 + Math.random() * 0.3 : 0.7 + Math.random() * 0.4;
      }
    }
    bot.state = bot.peekState === 'hide' ? 'cover' : 'attack';
    this._setTarget(bot, bot.peekState === 'hide' ? bot.coverPoint : playerPos);
  }

  _flankPoint(bot, playerPos) {
    if (!playerPos) return null;
    const away = bot.position.clone().sub(playerPos);
    away.y = 0;
    if (away.lengthSq() < 0.01) away.set(1, 0, 0);
    else away.normalize();
    const side = new THREE.Vector3(-away.z, 0, away.x).multiplyScalar(bot.strafeSign);
    const off = bot.roleDef?.flankOffset ?? 8;
    const p = playerPos.clone().addScaledVector(side, off).addScaledVector(away, 4);
    p.y = 0;
    return p;
  }

  update(dt) {
    const playerPos = this.cb.getPlayerPosition?.();
    const playerAlive = this.cb.getPlayerAlive?.() ?? false;
    const hunterIds = this._selectHunters(playerPos, playerAlive);
    const donuts = this.cb.getDonuts?.() || [];
    this._frame = (this._frame || 0) + 1;

    for (const bot of this.bots) {
      if (bot.dead) {
        bot.deadTimer -= dt;
        if (bot.deadTimer <= 0) this.respawnBot(bot);
        continue;
      }

      bot.fireCooldown = Math.max(0, bot.fireCooldown - dt);
      bot.repathTimer -= dt;
      bot.shootTimer -= dt;
      bot.peekTimer = Math.max(0, (bot.peekTimer || 0) - dt);
      bot.underFire = Math.max(0, (bot.underFire || 0) - dt);
      bot.jumpCooldown = Math.max(0, (bot.jumpCooldown || 0) - dt);
      if (bot.vaultTimer > 0) bot.vaultTimer = Math.max(0, bot.vaultTimer - dt);

      const usingRapier = this._usingRapier(bot);
      let didRapierMove = false;

      // Simple vertical motion — vault low fences then land on ground (y=0 floors).
      // Rapier path integrates gravity inside moveCharacter instead.
      if (!usingRapier) this._integrateBotVertical(bot, dt);

      if (!bot._prevPos) bot._prevPos = bot.position.clone();
      const preMove = this._preMove.copy(bot.position);
      if (bot.position.distanceTo(bot.lastPos) < 0.05) bot.stuckTimer += dt;
      else bot.stuckTimer = 0;
      bot.lastPos.copy(bot.position);

      const role = bot.roleDef || BOT_ROLES.hunter;
      const toPlayer =
        playerAlive && playerPos ? this._toPlayer.copy(playerPos).sub(bot.position) : null;
      const distPlayer = toPlayer ? toPlayer.length() : Infinity;
      let los = false;
      // Stagger LOS vs large collider lists — cache ~70–120ms, offset by bot id
      if (toPlayer && distPlayer < SIGHT_RANGE) {
        bot._losRefresh = (bot._losRefresh || 0) - dt;
        if (bot._losRefresh <= 0) {
          los = this._hasLOS(bot.position, playerPos);
          bot._losCached = los;
          bot._losRefresh = 0.065 + (bot.id % 4) * 0.016;
        } else {
          los = !!bot._losCached;
        }
      } else {
        bot._losCached = false;
      }
      if (los) {
        bot.losTimer = (bot.losTimer || 0) + dt;
        if (!bot.lastSeen) bot.lastSeen = new THREE.Vector3();
        bot.lastSeen.copy(playerPos);
        bot.lastSeen.y = 0;
        bot.lastSeenAge = 0;
      } else {
        bot.losTimer = 0;
        bot.lastSeenAge = (bot.lastSeenAge || 0) + dt;
      }
      if (bot.coverHold > 0) bot.coverHold = Math.max(0, bot.coverHold - dt);
      if (bot.stateHold > 0) bot.stateHold = Math.max(0, bot.stateHold - dt);

      // Nearest donut
      let nearestDonut = null;
      let donutDist = Infinity;
      for (const d of donuts) {
        const dist = bot.position.distanceTo(d);
        if (dist < donutDist) {
          donutDist = dist;
          nearestDonut = d;
        }
      }

      const mayHunt = hunterIds.has(bot.id);
      const engage = shouldEngagePlayer({
        mayHunt,
        los,
        distPlayer,
        underFire: bot.underFire,
        attackRange: ATTACK_RANGE,
        aggroRange: AGGRO_RANGE,
        aggression: role.aggression,
      });
      const donutPull = DONUT_RANGE * (role.donutBias || 1);
      // Never snack while player is in your face / under fire
      const canSeekDonut =
        nearestDonut &&
        donutDist < donutPull &&
        bot.underFire <= 0 &&
        !(los && distPlayer < AGGRO_RANGE) &&
        (bot.role === 'scavenger' || !mayHunt || distPlayer > 18);

      // ── State machine: sight-fire, last-seen hunt, committed cover ─────
      const takeCover =
        (bot.coverHold || 0) > 0 ||
        (engage && playerPos && (bot.underFire > 0 || bot.role === 'lurker'));

      if (canSeekDonut && (bot.coverHold || 0) <= 0) {
        bot.state = 'seek_donut';
        this._setTarget(bot, nearestDonut);
        bot.coverPoint = null;
        bot.hideTime = 0;
        bot.peekState = 'shoot';
      } else if (takeCover && playerPos) {
        this._runCoverBehavior(bot, playerPos, distPlayer, los, dt);
      } else if (engage && playerPos) {
        bot.peekState = 'shoot';
        if (bot.role === 'flanker' && distPlayer > 8 && bot.underFire <= 0) {
          bot.state = 'flank';
          this._setTarget(bot, this._flankPoint(bot, playerPos) || playerPos);
        } else if (los && distPlayer < ATTACK_RANGE * Math.max(1, role.aggression)) {
          bot.state = 'attack';
          this._setTarget(bot, playerPos);
          bot.coverPoint = null;
        } else {
          bot.state = 'chase';
          const hunt =
            bot.lastSeen && (bot.lastSeenAge || 0) < 4 ? bot.lastSeen : playerPos;
          this._setTarget(bot, hunt);
        }
      } else if (
        playerPos &&
        bot.lastSeen &&
        (bot.lastSeenAge || 0) < 3.8 &&
        (mayHunt || bot.underFire > 0)
      ) {
        bot.state = 'chase';
        bot.peekState = 'shoot';
        this._setTarget(bot, bot.lastSeen);
        if (bot.position.distanceTo(bot.lastSeen) < 1.6 && !los) {
          bot.lastSeen = null;
          bot.lastSeenAge = 99;
        }
      } else {
        bot.state = 'patrol';
        bot.coverPoint = null;
        bot.hideTime = 0;
        if (
          !bot.waypoint ||
          bot.position.distanceTo(bot.waypoint) < 1.2 ||
          bot.stuckTimer > 1.2 ||
          bot.repathTimer <= 0
        ) {
          bot.waypoint = this._pickWaypoint(bot);
          bot.repathTimer = 10 + Math.random() * 5;
          bot.stuckTimer = 0;
        }
        bot.target = bot.waypoint;
      }

      // ── Movement ───────────────────────────────────────────────────────
      let sprinting = false;
      if (bot.target) {
        const dest = this._dest.copy(bot.target);
        dest.y = 0;
        const toDest = this._toDest.copy(dest).sub(bot.position);
        toDest.y = 0;
        let dist = toDest.length();

        let wantMove = true;
        let combatStrafe = false;
        if (bot.state === 'attack' && playerPos) {
          if (distPlayer <= COMBAT_STOP_DIST) {
            bot.strafeTimer = (bot.strafeTimer ?? 2) - dt;
            if (bot.strafeTimer <= 0) {
              bot.strafeSign *= -1;
              bot.strafeTimer = 1.2 + Math.random() * 1.8;
            }
            const away = this._away.copy(bot.position).sub(playerPos);
            away.y = 0;
            if (away.lengthSq() > 0.01) away.normalize();
            else away.set(1, 0, 0);
            const side = this._side.set(-away.z, 0, away.x).multiplyScalar(bot.strafeSign);
            if (distPlayer < COMBAT_STOP_DIST * 0.85) {
              toDest.copy(away).addScaledVector(side, 0.35);
              dist = 1;
              wantMove = true;
            } else {
              toDest.copy(side).addScaledVector(away, 0.12);
              dist = 1;
              wantMove = true;
              combatStrafe = true;
            }
          }
        } else if (bot.state === 'cover' && bot.coverPoint) {
          wantMove = dist > 0.5;
        } else if (bot.state === 'chase' && playerPos && distPlayer <= COMBAT_STOP_DIST) {
          wantMove = false;
        }

        const hasMoveIntent = wantMove && dist > 0.2;
        if (hasMoveIntent || Math.hypot(bot.velocity.x, bot.velocity.z) > BOT_STEER_EPSILON) {
          const dir = this._dir;
          if (hasMoveIntent) dir.copy(toDest).normalize();
          else dir.copy(bot.velocity).setY(0).normalize();
          for (const other of this.bots) {
            if (other === bot || other.dead) continue;
            const away = this._away.copy(bot.position).sub(other.position);
            const d = away.length();
            if (d < 1.6 && d > 0.01) {
              away.y = 0;
              away.normalize();
              dir.addScaledVector(away, 0.9);
            }
          }
          if (playerPos) {
            const awayP = this._awayP.copy(bot.position).sub(playerPos);
            awayP.y = 0;
            const dp = awayP.length();
            if (dp < PLAYER_MIN_DIST + 0.4 && dp > 0.01) {
              awayP.normalize();
              dir.addScaledVector(awayP, 2.2);
            } else if (dp <= 0.01) {
              dir.x += 1;
            }
          }
          if (dir.lengthSq() > 0) dir.normalize();

          sprinting =
            hasMoveIntent &&
            (bot.state === 'chase' || bot.state === 'flank' || bot.state === 'cover');
          const speedMul = getBotDifficulty().speedMul || 1;
          const speed = !hasMoveIntent
            ? 0
            : sprinting
              ? BOT_SPRINT * (role.aggression > 1 ? 1.05 : 1) * speedMul
              : combatStrafe
              ? BOT_STRAFE * speedMul
              : bot.state === 'attack'
                ? BOT_SPEED * 0.7 * speedMul
                : BOT_SPEED * (bot.role === 'scavenger' && bot.state === 'seek_donut' ? 1.1 : 1) * speedMul;
          this._steerBotVelocity(bot, hasMoveIntent ? dir : null, speed, dt);
          const move = this._tmp.set(bot.velocity.x * dt, 0, bot.velocity.z * dt);

          if (usingRapier) {
            this._moveBotRapier(bot, bot.velocity, dt);
            didRapierMove = true;
          } else if (bot.vaulting && !bot.grounded) {
            // Mid-vault: keep driving forward through/over the fence (ignore low jumpables)
            bot.velocity.set(bot.airMoveX || 0, 0, bot.airMoveZ || 0);
            const air = this._air.copy(bot.position);
            air.x += bot.velocity.x * dt;
            air.z += bot.velocity.z * dt;
            if (!this._blockedVault(air, bot) && !this._moveBlockedVault(bot.position, air, bot)) {
              bot.position.x = air.x;
              bot.position.z = air.z;
            }
          } else {
            const next = this._next.copy(bot.position).add(move);
            // Bots must open closed house doors themselves — never phase through
            this._tryOpenDoorForMove(bot.position, next);
            if (!this._blocked(next, bot) && !botMoveBlocked(bot.position, next, this.mapData.colliders || [])) {
              bot.position.copy(next);
            } else {
              // Blocked briefly → vault fence if one is ahead; otherwise slide / unstick
              const jumped =
                bot.stuckTimer > 0.18 && this._tryBotJumpOver(bot, move);
              if (!jumped) {
                this.cb.doors?.requestOpenNear?.(bot.position);
                const onlyX = this._onlyX.copy(bot.position);
                onlyX.x += move.x;
                this._tryOpenDoorForMove(bot.position, onlyX);
                if (
                  !this._blocked(onlyX, bot) &&
                  !botMoveBlocked(bot.position, onlyX, this.mapData.colliders || [])
                ) {
                  bot.position.x = onlyX.x;
                }
                const onlyZ = this._onlyZ.copy(bot.position);
                onlyZ.z += move.z;
                this._tryOpenDoorForMove(bot.position, onlyZ);
                if (
                  !this._blocked(onlyZ, bot) &&
                  !botMoveBlocked(bot.position, onlyZ, this.mapData.colliders || [])
                ) {
                  bot.position.z = onlyZ.z;
                }
              }
              // Walk around first; vault only if still stuck on a fence
              if (bot.stuckTimer > 0.7) {
                this._unstickBot(bot, bot.velocity);
              }
            }
          }

        }
      }

      const hidingAtCover = bot.state === 'cover' && bot.peekState === 'hide';
      const combatFacing =
        playerPos &&
        !hidingAtCover &&
        (bot.state === 'attack' ||
          ((bot.state === 'chase' || bot.state === 'flank' || bot.state === 'cover') &&
            los &&
            playerAlive &&
            !bot.reloading &&
            distPlayer < ATTACK_RANGE + 4));
      if (combatFacing) {
        const d = this._tmp.copy(playerPos).sub(bot.position);
        bot.yawTarget = Math.atan2(-d.x, -d.z);
      } else if (Math.hypot(bot.velocity.x, bot.velocity.z) > BOT_STEER_EPSILON) {
        bot.yawTarget = Math.atan2(-bot.velocity.x, -bot.velocity.z);
      }
      if (bot.yawTarget == null) bot.yawTarget = bot.yaw;
      bot.yaw = lerpAngle(bot.yaw, bot.yawTarget, 1 - Math.pow(0.00015, dt));

      // Idle / AI-paused frames still need gravity + ground snap under Rapier.
      if (usingRapier && !didRapierMove) {
        this._steerBotVelocity(bot, null, 0, dt);
        this._moveBotRapier(bot, bot.velocity, dt);
        didRapierMove = true;
      }

      // Player separation — destination free is NOT enough; path must not tunnel walls
      if (playerPos) {
        const from = this._from.copy(bot.position);
        const dx = from.x - playerPos.x;
        const dz = from.z - playerPos.z;
        const d = Math.hypot(dx, dz);
        if (d < PLAYER_MIN_DIST) {
          const tryPos = this._next.copy(from);
          if (d < 1e-4) {
            tryPos.x += PLAYER_MIN_DIST;
          } else {
            tryPos.x += (dx / d) * (PLAYER_MIN_DIST - d);
            tryPos.z += (dz / d) * (PLAYER_MIN_DIST - d);
          }
          // Full push only if path clear (anti-tunnel through thin house walls)
          if (!botMoveBlocked(from, tryPos, this.mapData.colliders || [])) {
            bot.position.x = tryPos.x;
            bot.position.z = tryPos.z;
          } else {
            // Axis-split with the same path check
            const onlyX = from.clone();
            onlyX.x = tryPos.x;
            if (!botMoveBlocked(from, onlyX, this.mapData.colliders || [])) {
              bot.position.x = onlyX.x;
            }
            const mid = bot.position.clone();
            const onlyZ = mid.clone();
            onlyZ.z = tryPos.z;
            if (!botMoveBlocked(mid, onlyZ, this.mapData.colliders || [])) {
              bot.position.z = onlyZ.z;
            }
          }
          if (usingRapier) {
            this.physics.setNextTranslation(
              bot._rapier,
              bot.position.x,
              this._botEyeY(bot),
              bot.position.z
            );
          }
        }
      }

      if (bot.reloading) {
        bot.reloadTimer -= dt;
        if (bot.reloadTimer <= 0) {
          bot.reloading = false;
          bot.ammo = bot.magSize || 10;
          bot.reloadTimer = 0;
        }
      }

      // Aim + shoot on LOS. Hide only blocks fire while crouched at cover.
      const inFightState =
        bot.state === 'attack' ||
        bot.state === 'chase' ||
        bot.state === 'flank' ||
        (bot.state === 'cover' && bot.peekState !== 'hide');
      const combatReady =
        inFightState &&
        los &&
        playerAlive &&
        !bot.reloading &&
        !hidingAtCover &&
        distPlayer < ATTACK_RANGE + 4;
      const reactOk =
        (bot.losTimer || 0) >= reactionDelayForRole(bot.role, distPlayer) || bot.underFire > 0;
      const wantsAim = combatReady && reactOk;

      if (wantsAim) {
        bot.aimTimer = Math.min(aimWindup() + 0.5, (bot.aimTimer || 0) + dt);
      } else if (!combatReady) {
        bot.aimTimer = Math.max(0, (bot.aimTimer || 0) - dt * 2.5);
      }

      const aiming =
        wantsAim || (combatReady && !bot.reloading && (bot.aimTimer || 0) > 0.08);
      // Faster first shot when close
      const windup =
        aimWindup() *
        (distPlayer < 8 ? 0.55 : distPlayer < 12 ? 0.75 : bot.role === 'lurker' ? 0.9 : 1);
      const aimReady = (bot.aimTimer || 0) >= windup;

      bot.character.mesh.position.set(bot.position.x, bot.position.y, bot.position.z);
      bot.character.mesh.rotation.y = bot.yaw;

      const moved = Math.hypot(bot.position.x - preMove.x, bot.position.z - preMove.z);
      bot.moveSpeed = dt > 1e-6 ? moved / dt : 0;
      bot._prevPos.copy(bot.position);

      const reloadT = bot.reloading
        ? 1 - Math.max(0, bot.reloadTimer) / (bot.reloadDuration || 1.35)
        : 0;
      const animSpeed = bot.moveSpeed;
      const anim = this._anim;
      anim.moving = bot.moveSpeed > 0.35;
      anim.sprinting = bot.moveSpeed > BOT_SPEED * 1.05;
      anim.moveSpeed = animSpeed;
      anim.grounded = !!bot.grounded;
      anim.dead = false;
      anim.aiming = aiming;
      anim.reloading = bot.reloading;
      anim.reloadT = reloadT;
      const skipAnim = distPlayer > 28 && ((bot.id + this._frame) & 1);
      if (!skipAnim) bot.character.updateAnimation(dt, anim);

      // Shoot after anim so pose is up; triggerFire then snaps aim for the flash frame
      if (wantsAim && aimReady) {
        if (bot.ammo <= 0) {
          this._startBotReload(bot);
        } else if (bot.fireCooldown <= 0) {
          this._botShoot(bot, playerPos, distPlayer);
          // Re-apply anim once so arm kick is visible immediately this frame
          anim.aiming = true;
          anim.reloading = false;
          anim.reloadT = 0;
          bot.character.updateAnimation(0, anim);
        }
      }

      this._syncWeaponVisual(bot);
    }
  }

  _syncWeaponVisual(bot) {
    const idx = Math.min(bot.weaponIndex, WEAPONS.length - 1);
    if (bot._visWeapon === idx) return;
    bot._visWeapon = idx;
    bot.character.setHeldWeapon?.(idx);
  }

  _startBotReload(bot) {
    if (bot.reloading) return;
    bot.reloading = true;
    bot.reloadDuration = 1.35;
    bot.reloadTimer = 1.35;
    bot.fireCooldown = 1.35;
    // Vulnerability: peek hide while reloading at cover
    if (bot.coverPoint) {
      bot.peekState = 'hide';
      bot.peekTimer = 1.2;
    }
    this.cb.onBotReload?.(bot);
  }

  _botShoot(bot, playerPos, distPlayer = 10) {
    if (bot.reloading || bot.ammo <= 0 || !playerPos) return;
    const w = WEAPONS[Math.min(bot.weaponIndex, WEAPONS.length - 1)];
    const role = bot.roleDef || BOT_ROLES.hunter;
    bot.fireCooldown =
      ((0.5 + Math.random() * 0.4) * (role.fireCadence || 1)) /
      Math.max(0.35, getBotDifficulty().aggression || 1);
    bot.ammo -= 1;

    // Visible TPP fire: snap aim + arm kick the same frame as the shot
    bot.character.triggerFire?.();
    bot.aimTimer = Math.max(bot.aimTimer || 0, aimWindup());

    const origin =
      bot.character.getMuzzleWorldPosition?.() || bot.character.getChestWorldPosition();

    const target = playerPos.clone();
    target.y = (playerPos.y != null ? playerPos.y : PLAYER_HEIGHT) - 0.35;
    const err = aimErrorForDistance(distPlayer, role.accuracy);
    target.x += (Math.random() - 0.5) * err * 10;
    target.y += (Math.random() - 0.5) * err * 5;
    target.z += (Math.random() - 0.5) * err * 10;

    const dir = target.clone().sub(origin).normalize();
    this.cb.onBotShoot?.({
      bot,
      origin: origin.clone(),
      direction: dir,
      damage: w.damage,
      weaponId: 'pistol',
      range: w.range,
      fromBot: true,
    });

    if (bot.ammo <= 0) this._startBotReload(bot);
  }

  /**
   * Bounded horizontal steering shared by the legacy and Rapier resolvers.
   * Vertical velocity remains owned by the existing vault and gravity paths.
   */
  _steerBotVelocity(bot, desiredDir, desiredSpeed, dt) {
    const desiredX = desiredDir ? desiredDir.x * desiredSpeed : 0;
    const desiredZ = desiredDir ? desiredDir.z * desiredSpeed : 0;
    const currentSpeed = Math.hypot(bot.velocity.x, bot.velocity.z);
    const targetSpeed = Math.hypot(desiredX, desiredZ);
    const maxDelta = (targetSpeed > currentSpeed ? BOT_STEER_ACCEL : BOT_STEER_DECEL) * dt;
    const deltaX = desiredX - bot.velocity.x;
    const deltaZ = desiredZ - bot.velocity.z;
    const deltaLength = Math.hypot(deltaX, deltaZ);

    if (deltaLength <= maxDelta || deltaLength < BOT_STEER_EPSILON) {
      bot.velocity.x = desiredX;
      bot.velocity.z = desiredZ;
    } else {
      bot.velocity.x += (deltaX / deltaLength) * maxDelta;
      bot.velocity.z += (deltaZ / deltaLength) * maxDelta;
    }
    bot.velocity.y = 0;
  }

  /**
   * Phase 1d: one Rapier character-controller step for a bot.
   * `velocity` is the smoothed horizontal wish velocity. Pass zero to settle
   * in place (gravity + snap).
   */
  _moveBotRapier(bot, velocity, dt) {
    if (!this.physics || !bot._rapier || !(dt > 0)) return;

    let wishVelX = 0;
    let wishVelZ = 0;
    let jumpPressed = false;

    if (bot.vaulting && !bot.grounded) {
      wishVelX = bot.airMoveX || 0;
      wishVelZ = bot.airMoveZ || 0;
    } else if (velocity && Math.hypot(velocity.x, velocity.z) > BOT_STEER_EPSILON) {
      wishVelX = velocity.x;
      wishVelZ = velocity.z;
      const probe = bot.position.clone();
      probe.x += wishVelX * dt;
      probe.z += wishVelZ * dt;
      this._tryOpenDoorForMove(bot.position, probe);

      if (bot.stuckTimer > 0.18 && bot.grounded && (bot.jumpCooldown || 0) <= 0) {
        if (this._armBotVault(bot, velocity)) jumpPressed = true;
      }
      if (bot.stuckTimer > 0.45) {
        this.cb.doors?.requestOpenNear?.(bot.position);
      }
    }

    const result = this.physics.moveCharacter(bot._rapier, {
      wishVelX,
      wishVelZ,
      jumpPressed,
      dt,
      jumpSpeed: BOT_VAULT_JUMP,
    });
    if (!result) return;

    bot.position.x = result.x;
    bot.position.y = result.y - BOT_BODY_HEIGHT;
    bot.position.z = result.z;
    bot.grounded = !!result.grounded;
    bot.velY = bot._rapier.verticalVel || 0;

    if (bot.grounded && bot.vaulting) {
      bot.vaulting = false;
      bot.airMoveX = 0;
      bot.airMoveZ = 0;
      bot.vaultClearY = 0;
      bot.vaultTimer = 0;
    }

    // After resolve: soft walk-around if still wedged (setNext must follow moveCharacter).
    if (velocity && Math.hypot(velocity.x, velocity.z) > BOT_STEER_EPSILON && bot.stuckTimer > 0.7 && bot.grounded) {
      this._unstickBotRapier(bot, velocity);
    }
  }

  /**
   * Arm a fence vault under Rapier (jump + air drive). Returns true if jump should fire.
   */
  _armBotVault(bot, moveXZ) {
    if (!bot.grounded || bot.vaulting || (bot.jumpCooldown || 0) > 0) return false;
    const mx = moveXZ.x || 0;
    const mz = moveXZ.z || 0;
    const mlen = Math.hypot(mx, mz);
    if (mlen < 1e-5) return false;
    const nx = mx / mlen;
    const nz = mz / mlen;
    const ahead = bot.position.clone();
    ahead.x += nx * 0.75;
    ahead.z += nz * 0.75;
    ahead.y = bot.position.y;
    const hit = this._findJumpableBlocker(bot.position, ahead, this.mapData.colliders || []);
    if (!hit) return false;

    const top = hit.box.max.y;
    bot.vaulting = true;
    bot.vaultClearY = top;
    bot.vaultTimer = 0.85;
    bot.jumpCooldown = BOT_JUMP_COOLDOWN;
    bot.stuckTimer = 0;
    bot.airMoveX = nx * BOT_VAULT_AIR_SPEED;
    bot.airMoveZ = nz * BOT_VAULT_AIR_SPEED;
    return true;
  }

  /** Soft unstick for Rapier bots — walk-around only (no legacy teleport through solids). */
  _unstickBotRapier(bot, preferDir) {
    this.cb.doors?.requestOpenNear?.(bot.position, 2.8);
    const base =
      preferDir && preferDir.lengthSq() > 0.01
        ? Math.atan2(preferDir.x, preferDir.z)
        : bot.yaw;
    for (let i = 0; i < 8; i++) {
      const ang = base + (i % 2 === 0 ? 1 : -1) * Math.ceil((i + 1) / 2) * (Math.PI / 5);
      const tryPos = bot.position.clone();
      tryPos.x += Math.sin(ang) * 0.9;
      tryPos.z += Math.cos(ang) * 0.9;
      if (
        !this._blocked(tryPos, bot) &&
        !botMoveBlocked(bot.position, tryPos, this.mapData.colliders || [])
      ) {
        bot.position.x = tryPos.x;
        bot.position.z = tryPos.z;
        this.physics.setNextTranslation(
          bot._rapier,
          bot.position.x,
          this._botEyeY(bot),
          bot.position.z
        );
        bot.stuckTimer = 0;
        bot.waypoint = this._pickWaypoint(bot);
        if ((bot.coverHold || 0) <= 0) bot.coverPoint = null;
        bot.strafeSign *= -1;
        return;
      }
    }
    bot.waypoint = this._pickWaypoint(bot);
    if ((bot.coverHold || 0) <= 0) bot.coverPoint = null;
    bot.strafeSign *= -1;
  }

  _integrateBotVertical(bot, dt) {
    const floors = this.mapData.floors || [];
    // Ground plane + any floor pad under feet
    let floorY = 0;
    const x = bot.position.x;
    const z = bot.position.z;
    for (const f of floors) {
      if (x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ) {
        if (f.y <= bot.position.y + 0.35 && f.y > floorY) floorY = f.y;
      }
    }
    bot.velY = (bot.velY || 0) - GRAVITY * dt;
    bot.position.y += bot.velY * dt;
    if (bot.position.y <= floorY + 0.02) {
      bot.position.y = floorY;
      bot.velY = 0;
      bot.grounded = true;
      if (bot.vaulting) {
        bot.vaulting = false;
        bot.airMoveX = 0;
        bot.airMoveZ = 0;
        bot.vaultClearY = 0;
        bot.vaultTimer = 0;
      }
    } else {
      bot.grounded = false;
    }
    // Keep character mesh synced (mesh is the scene root for VoxelCharacter)
    if (bot.character?.mesh) {
      bot.character.mesh.position.set(bot.position.x, bot.position.y, bot.position.z);
    }
  }

  /** Colliders for vault checks — skip fences/jumpables below clear height. */
  _vaultColliders(bot) {
    const clearY = bot.vaultClearY || 0;
    return (this.mapData.colliders || []).filter((c) => {
      if (!(c.jumpable === true || c.kind === 'fence')) return true;
      const box = c.box || c;
      return !box?.max || box.max.y > clearY + 0.12;
    });
  }

  _blockedVault(pos, bot) {
    return botPositionBlocked(pos, this._vaultColliders(bot), BOT_COLLIDE_RADIUS * 0.9);
  }

  _moveBlockedVault(from, to, bot) {
    const feet = Math.max(from.y ?? 0, bot.vaultClearY || 0);
    const colliders = this._vaultColliders(bot);
    return botMoveBlocked(
      { x: from.x, y: feet, z: from.z },
      { x: to.x, y: feet, z: to.z },
      colliders,
      BOT_COLLIDE_RADIUS * 0.9
    );
  }

  /**
   * Vault a low fence: jump UP and commit forward air velocity so the bot
   * actually clears the obstacle instead of hopping in place against it.
   */
  _tryBotJumpOver(bot, moveXZ) {
    if (!bot.grounded || bot.vaulting || (bot.jumpCooldown || 0) > 0) return false;
    const colliders = this.mapData.colliders || [];
    const mx = moveXZ.x || 0;
    const mz = moveXZ.z || 0;
    const mlen = Math.hypot(mx, mz);
    if (mlen < 1e-5) return false;
    const nx = mx / mlen;
    const nz = mz / mlen;
    const ahead = bot.position.clone();
    ahead.x += nx * 0.75;
    ahead.z += nz * 0.75;
    ahead.y = bot.position.y;
    const hit = this._findJumpableBlocker(bot.position, ahead, colliders);
    if (!hit) return false;

    const top = hit.box.max.y;
    bot.velY = BOT_VAULT_JUMP;
    bot.grounded = false;
    bot.vaulting = true;
    bot.vaultClearY = top;
    bot.vaultTimer = 0.85;
    bot.jumpCooldown = BOT_JUMP_COOLDOWN;
    bot.stuckTimer = 0;
    bot.airMoveX = nx * BOT_VAULT_AIR_SPEED;
    bot.airMoveZ = nz * BOT_VAULT_AIR_SPEED;
    // Immediate forward commit (collision ignores this fence)
    const step = bot.position.clone();
    step.x += nx * 0.55;
    step.z += nz * 0.55;
    if (!this._blockedVault(step, bot) && !this._moveBlockedVault(bot.position, step, bot)) {
      bot.position.x = step.x;
      bot.position.z = step.z;
    }
    return true;
  }

  _findJumpableBlocker(from, to, colliders) {
    const feet = from.y ?? 0;
    for (const c of colliders) {
      if (!colliderIsActiveSolid(c)) continue;
      // Only explicit fences / jumpable props — never hop at walls/crates
      if (!(c.jumpable === true || c.kind === 'fence')) continue;
      const box = c.box || c;
      if (!box?.min || !box?.max) continue;
      if (!isSolidColliderBox(box, MIN_SOLID_HEIGHT)) continue;
      const top = box.max.y;
      if (top - feet > BOT_JUMP_MAX_TOP || top - feet < 0.25) continue;
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      let near = false;
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        const px = from.x + dx * t;
        const pz = from.z + dz * t;
        const cx = Math.max(box.min.x, Math.min(px, box.max.x));
        const cz = Math.max(box.min.z, Math.min(pz, box.max.z));
        if (Math.hypot(px - cx, pz - cz) <= BOT_COLLIDE_RADIUS + 0.12) {
          near = true;
          break;
        }
      }
      if (near) return c;
    }
    return null;
  }

  _unstickBot(bot, preferDir) {
    this.cb.doors?.requestOpenNear?.(bot.position, 2.8);
    const colliders = this.mapData.colliders || [];
    // Prefer walking around; vault only if a fence still blocks the preferred heading
    const base = preferDir && preferDir.lengthSq() > 0.01 ? Math.atan2(preferDir.x, preferDir.z) : bot.yaw;
    for (let i = 0; i < 12; i++) {
      const ang = base + (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 6);
      const tryPos = bot.position.clone();
      tryPos.x += Math.sin(ang) * 1.25;
      tryPos.z += Math.cos(ang) * 1.25;
      if (
        !this._blocked(tryPos, bot) &&
        !botMoveBlocked(bot.position, tryPos, colliders)
      ) {
        bot.position.x = tryPos.x;
        bot.position.z = tryPos.z;
        bot.stuckTimer = 0;
        bot.waypoint = this._pickWaypoint(bot);
        if ((bot.coverHold || 0) <= 0) bot.coverPoint = null;
        bot.strafeSign *= -1;
        bot.strafeTimer = 1 + Math.random();
        return;
      }
    }
    if (preferDir && preferDir.lengthSq() > 0.01 && bot.stuckTimer > 1.0) {
      const move = preferDir.clone().normalize().multiplyScalar(0.4);
      if (this._tryBotJumpOver(bot, move)) return;
    }
    bot.waypoint = this._pickWaypoint(bot);
    if ((bot.coverHold || 0) <= 0) bot.coverPoint = null;
    bot.stuckTimer = 0;
    bot.strafeSign *= -1;
  }

  _pickWaypoint(bot) {
    const authored = this.mapData.waypoints || [];
    const pts = authored.length
      ? authored
      : [...(this.mapData.coverPoints || []), ...(this.mapData.spawnPoints || [])];
    if (!pts.length) {
      return new THREE.Vector3((Math.random() - 0.5) * 30, 0, (Math.random() - 0.5) * 30);
    }
    const n = pts.length;
    const start = ((bot.patrolIndex || 0) + 1) % n;
    for (let i = 0; i < n; i++) {
      const p = pts[(start + i) % n];
      const d = Math.hypot(p.x - bot.position.x, p.z - bot.position.z);
      if (d > 5) {
        bot.patrolIndex = (start + i) % n;
        return new THREE.Vector3(p.x, 0, p.z);
      }
    }
    bot.patrolIndex = start;
    const p = pts[start];
    return new THREE.Vector3(p.x, 0, p.z);
  }

  /**
   * Solid wall rejection — shared `botPositionBlocked` (full body Y + XZ).
   * Old path was XZ-only with `box.min.y < 1.6`, which let bots half-clip tall house walls.
   */
  _blocked(pos, _self) {
    return botPositionBlocked(pos, this.mapData.colliders || [], BOT_COLLIDE_RADIUS);
  }

  /** Open a closed door if this move would hit its collider. */
  _tryOpenDoorForMove(from, to) {
    const doors = this.cb.doors;
    if (!doors) return;
    if (!this._blocked(to, null) && !botMoveBlocked(from, to, this.mapData.colliders || [])) {
      return;
    }
    doors.openBlockingDoor(from, to, this.mapData.colliders || []);
    doors.requestOpenNear(from);
  }

  _hasLOS(from, to) {
    if (!from || !to) return false;
    const origin = this._losFrom.set(from.x, 1.4, from.z);
    const target = this._losTo.set(to.x, 1.4, to.z);
    if (origin.distanceToSquared(target) < 0.25) return true;
    return !rayBlockedBySolids(origin, target, this.mapData.colliders || [], {
      minHeight: 0.5,
      tMin: 0.08,
      tEndPad: 0.08,
    });
  }

  respawnBot(bot) {
    const playerPos = this.cb.getPlayerPosition?.();
    let spawn = this._randomSpawn(this.bots.filter((b) => b !== bot).map((b) => b.position));
    if (playerPos) {
      for (let i = 0; i < 8; i++) {
        if (spawn.distanceTo(playerPos) > 4) break;
        spawn = this._randomSpawn(this.bots.filter((b) => b !== bot).map((b) => b.position));
      }
    }
    bot.position.copy(spawn);
    bot.health = bot.maxHealth;
    bot.dead = false;
    bot.deadTimer = 0;
    bot.state = 'patrol';
    bot.waypoint = null;
    bot.coverPoint = null;
    bot.peekState = 'shoot';
    bot.losTimer = 0;
    bot.underFire = 0;
    bot.coverHold = 0;
    bot.stateHold = 0;
    bot.lastSeen = null;
    bot.lastSeenAge = 99;
    bot._losCached = false;
    bot.hideTime = 0;
    bot.velY = 0;
    bot.velocity.set(0, 0, 0);
    bot.grounded = true;
    bot.vaulting = false;
    bot.airMoveX = 0;
    bot.airMoveZ = 0;
    bot.weaponIndex = Math.min(bot.kills, WEAPONS.length - 1);
    bot.magSize = 10;
    bot.ammo = 10;
    bot.reloading = false;
    bot.reloadTimer = 0;
    bot.character.mesh.position.set(spawn.x, 0, spawn.z);
    bot.character.mesh.rotation.x = 0;
    bot.character.setVisible(true);
    bot.character.updateHealth?.(bot.health, bot.maxHealth);
    bot._visWeapon = -1;
    this._syncWeaponVisual(bot);
    if (bot._rapier && this.physics) {
      this.physics.teleport(bot._rapier, spawn.x, spawn.y + BOT_BODY_HEIGHT, spawn.z);
      this.physics.setCharacterEnabled(bot._rapier, true);
    } else if (USE_RAPIER_BOTS && this.physics) {
      this._attachRapier(bot);
    }
  }

  simulateBotCombat() {}
}
