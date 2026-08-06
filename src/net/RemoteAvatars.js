import * as THREE from 'three';
import { PLAYER_HEIGHT, PLAYER_MAX_HP } from '../game/constants.js';
import { VoxelCharacter } from '../game/VoxelCharacter.js';
import { REMOTE_INTERP_DELAY_MS } from './NetTypes.js';

const BUF_CAP = 24;

/**
 * Third-person meshes for remote multiplayer players (skip local FPS body).
 * Phase 4: snapshot buffer + delayed interpolation for smoother remotes.
 */
export class RemoteAvatars {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    /** @type {Map<string, { character: VoxelCharacter, outfitIndex: number, pawn?: any, buf: Array<object>, _prevRender?: {x:number,z:number} }>} */
    this.byId = new Map();
    this.interpDelayMs = REMOTE_INTERP_DELAY_MS;
  }

  /**
   * @param {string} id
   * @param {{ name?: string, outfitIndex?: number }} meta
   */
  ensure(id, { name = 'Player', outfitIndex = 0 } = {}) {
    let entry = this.byId.get(id);
    if (entry) return entry;
    const character = new VoxelCharacter({
      name,
      outfitIndex: outfitIndex | 0,
      isPlayer: false,
    });
    this.scene.add(character.mesh);
    entry = { character, outfitIndex: outfitIndex | 0, buf: [] };
    this.byId.set(id, entry);
    return entry;
  }

  /** @param {string} id */
  remove(id) {
    const entry = this.byId.get(id);
    if (!entry) return;
    this.scene.remove(entry.character.mesh);
    entry.character.dispose?.();
    this.byId.delete(id);
  }

  clear() {
    for (const id of [...this.byId.keys()]) this.remove(id);
  }

  /**
   * Push latest snap into per-id buffers; call `tick(dt)` each frame to render.
   * @param {import('./NetTypes.js').PlayerSnap[]} players
   * @param {string} localId
   * @param {number} [_dt] unused — kept for call-site compat; prefer tick()
   * @param {number} [serverTime] host time if available
   */
  applySnapshot(players, localId, _dt = 1 / 60, serverTime = 0) {
    const now =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    const seen = new Set();

    for (const p of players || []) {
      if (!p?.id || p.id === localId) continue;
      seen.add(p.id);
      const entry = this.ensure(p.id, {
        name: p.name || 'Player',
        outfitIndex: p.outfitIndex != null ? p.outfitIndex : 0,
      });
      entry.buf.push({
        t: now,
        serverTime: serverTime || 0,
        x: p.x ?? 0,
        y: p.y ?? PLAYER_HEIGHT,
        z: p.z ?? 0,
        yaw: p.yaw ?? 0,
        weapon: p.weapon ?? 0,
        hp: p.hp ?? PLAYER_MAX_HP,
        aiming: !!p.aiming,
        alive: p.alive !== false,
      });
      while (entry.buf.length > BUF_CAP) entry.buf.shift();
      entry.pawn = p;
    }

    for (const id of [...this.byId.keys()]) {
      if (!seen.has(id)) this.remove(id);
    }
  }

  /**
   * Advance remote meshes toward buffered poses (render at now − delay).
   * @param {number} dt
   * @param {string} [localId]
   */
  tick(dt = 1 / 60, localId = '') {
    const now =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    const renderAt = now - this.interpDelayMs;

    for (const [id, entry] of this.byId) {
      if (localId && id === localId) continue;
      const sample = sampleBuffer(entry.buf, renderAt);
      if (!sample) continue;

      const mesh = entry.character.mesh;
      const targetY = (sample.y ?? PLAYER_HEIGHT) - PLAYER_HEIGHT;
      // Slight catch-up lerp so large gaps don't teleport
      const catchT = Math.min(1, (dt || 0) * 18);
      mesh.position.x = THREE.MathUtils.lerp(mesh.position.x, sample.x, catchT);
      mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, targetY, catchT);
      mesh.position.z = THREE.MathUtils.lerp(mesh.position.z, sample.z, catchT);
      mesh.rotation.y = sample.yaw ?? mesh.rotation.y;

      entry.character.setHeldWeapon?.(sample.weapon ?? 0);
      entry.character.updateHealth?.(sample.hp ?? PLAYER_MAX_HP, PLAYER_MAX_HP);

      const prev = entry._prevRender;
      let moveSpeed = 0;
      if (prev && dt > 0) {
        moveSpeed = Math.hypot(sample.x - prev.x, sample.z - prev.z) / dt;
      }
      entry._prevRender = { x: sample.x, z: sample.z };
      const isMoving = moveSpeed > 0.35;

      entry.character.updateAnimation?.(dt, {
        moving: isMoving && sample.alive !== false,
        aiming: !!sample.aiming,
        grounded: true,
        dead: sample.alive === false,
        moveSpeed,
      });
    }
  }

  /**
   * Hit volumes for host combat vs remotes — return [{ id, character, pawn? }].
   * @param {string} [excludeId]
   */
  getCombatTargets(excludeId) {
    const out = [];
    for (const [id, entry] of this.byId) {
      if (excludeId && id === excludeId) continue;
      out.push({ id, character: entry.character, pawn: entry.pawn });
    }
    return out;
  }
}

/**
 * @param {Array<{ t: number, x: number, y: number, z: number, yaw: number, weapon?: number, hp?: number, aiming?: boolean, alive?: boolean }>} buf
 * @param {number} when
 */
function sampleBuffer(buf, when) {
  if (!buf?.length) return null;
  if (when <= buf[0].t) return buf[0];
  if (when >= buf[buf.length - 1].t) return buf[buf.length - 1];
  for (let i = 1; i < buf.length; i++) {
    const a = buf[i - 1];
    const b = buf[i];
    if (when > b.t) continue;
    const span = b.t - a.t;
    const u = span > 1e-6 ? (when - a.t) / span : 1;
    return {
      t: when,
      x: a.x + (b.x - a.x) * u,
      y: a.y + (b.y - a.y) * u,
      z: a.z + (b.z - a.z) * u,
      yaw: a.yaw + (b.yaw - a.yaw) * u,
      weapon: b.weapon,
      hp: b.hp,
      aiming: b.aiming,
      alive: b.alive,
    };
  }
  return buf[buf.length - 1];
}
