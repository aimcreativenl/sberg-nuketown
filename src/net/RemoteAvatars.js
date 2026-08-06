import * as THREE from 'three';
import { PLAYER_HEIGHT, PLAYER_MAX_HP } from '../game/constants.js';
import { VoxelCharacter } from '../game/VoxelCharacter.js';

/**
 * Third-person meshes for remote multiplayer players (skip local FPS body).
 */
export class RemoteAvatars {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    /** @type {Map<string, { character: VoxelCharacter, outfitIndex: number, pawn?: any }>} */
    this.byId = new Map();
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
    entry = { character, outfitIndex: outfitIndex | 0 };
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
   * Apply snapshot player list; skip localId (no mesh for self in FPS).
   * @param {import('./NetTypes.js').PlayerSnap[]} players
   * @param {string} localId
   * @param {number} dt
   */
  applySnapshot(players, localId, dt = 1 / 60) {
    const seen = new Set();
    const lerpT = Math.min(1, (dt || 0) * 12);

    for (const p of players || []) {
      if (!p?.id || p.id === localId) continue;
      seen.add(p.id);
      const entry = this.ensure(p.id, {
        name: p.name || 'Player',
        outfitIndex: p.outfitIndex != null ? p.outfitIndex : 0,
      });
      const mesh = entry.character.mesh;
      // Snap y is eye height (NetPawn); mesh origin is feet
      const targetY = (p.y ?? PLAYER_HEIGHT) - PLAYER_HEIGHT;
      const tx = p.x ?? 0;
      const tz = p.z ?? 0;
      mesh.position.x = THREE.MathUtils.lerp(mesh.position.x, tx, lerpT);
      mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, targetY, lerpT);
      mesh.position.z = THREE.MathUtils.lerp(mesh.position.z, tz, lerpT);
      mesh.rotation.y = p.yaw ?? mesh.rotation.y;

      entry.character.setHeldWeapon?.(p.weapon ?? 0);
      entry.character.updateHealth?.(p.hp ?? PLAYER_MAX_HP, PLAYER_MAX_HP);

      const prev = entry._prevSnap;
      let moveSpeed = 0;
      if (prev && dt > 0) {
        moveSpeed = Math.hypot((p.x ?? 0) - prev.x, (p.z ?? 0) - prev.z) / dt;
      }
      entry._prevSnap = { x: p.x ?? 0, z: p.z ?? 0 };
      const isMoving = moveSpeed > 0.35;

      entry.character.updateAnimation?.(dt, {
        moving: isMoving && p.alive !== false,
        aiming: !!p.aiming,
        grounded: true,
        dead: p.alive === false,
        moveSpeed,
      });

      entry.pawn = p;
    }

    for (const id of [...this.byId.keys()]) {
      if (!seen.has(id)) this.remove(id);
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
