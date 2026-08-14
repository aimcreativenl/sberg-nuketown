/**
 * CTF flag view — two home pads + moving pole/cloth. Gameplay truth lives in modes/ctf.js.
 */
import * as THREE from 'three';
import { createMat } from './materials.js';
import { roundedBoxGeo } from './softGeo.js';
import { FLAG_HOMES, FLAG_STATE, enemyTeam } from '../modes/ctf.js';

const TEAM_COLOR = {
  alpha: 0xff8fab,
  bravo: 0x6bb6c4,
};

function makePad(color) {
  const mat = createMat(color, { roughness: 0.62, metalness: 0.04, name: 'ctf_pad' });
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.25, 0.1, 20), mat);
  pad.position.y = 0.05;
  pad.receiveShadow = true;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.15, 1.45, 24),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  const g = new THREE.Group();
  g.add(pad);
  g.add(ring);
  return g;
}

function makeFlag(color) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    roundedBoxGeo(0.09, 2.15, 0.09, 0.03, 2),
    createMat(0xfff6e8, { roughness: 0.45, name: 'ctf_pole' })
  );
  pole.position.y = 1.08;
  pole.castShadow = true;
  g.add(pole);

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 8),
    createMat(color, { roughness: 0.35, emissive: color, emissiveIntensity: 0.22, name: 'ctf_finial' })
  );
  ball.position.y = 2.22;
  ball.castShadow = true;
  g.add(ball);

  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 0.72, 4, 2),
    new THREE.MeshStandardMaterial({
      color,
      side: THREE.DoubleSide,
      roughness: 0.55,
      metalness: 0.04,
      emissive: color,
      emissiveIntensity: 0.14,
    })
  );
  cloth.position.set(0.62, 1.82, 0);
  cloth.castShadow = true;
  cloth.name = 'cloth';
  g.add(cloth);
  return g;
}

export class FlagManager {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    /** @type {Record<string, { pad: THREE.Group, flag: THREE.Group, color: number }>} */
    this.items = {};
    this._t = 0;
  }

  /**
   * @param {{ alpha?: {x:number,y:number,z:number}, bravo?: {x:number,y:number,z:number} }} [homes]
   */
  spawn(homes = FLAG_HOMES) {
    this.clear();
    for (const team of ['alpha', 'bravo']) {
      const home = homes[team] || FLAG_HOMES[team];
      const color = TEAM_COLOR[team];
      const pad = makePad(color);
      pad.position.set(home.x, 0, home.z);
      const flag = makeFlag(color);
      flag.position.set(home.x, home.y ?? 0.15, home.z);
      this.scene.add(pad);
      this.scene.add(flag);
      this.items[team] = { pad, flag, color };
    }
  }

  /**
   * @param {Array<{ team: string, state: string, carrierId?: string|null, x: number, y: number, z: number }>} flags
   */
  applyNet(flags) {
    if (!flags?.length) return;
    for (const snap of flags) {
      const item = this.items[snap.team];
      if (!item) continue;
      const carried = snap.state === FLAG_STATE.carried;
      item.flag.position.set(snap.x ?? 0, carried ? 1.05 : snap.y ?? 0.15, snap.z ?? 0);
      item.flag.visible = true;
      item.flag.scale.setScalar(carried ? 0.72 : 1);
    }
  }

  /** @param {number} dt */
  update(dt) {
    this._t += dt;
    for (const item of Object.values(this.items)) {
      const cloth = item.flag?.getObjectByName('cloth');
      if (!cloth) continue;
      cloth.rotation.y = Math.sin(this._t * 2.2) * 0.18;
      cloth.rotation.z = Math.sin(this._t * 3.1) * 0.06;
    }
  }

  /**
   * Nearby-flag hint for the local player.
   * @param {{ x: number, z: number }} pos
   * @param {string|null} team
   * @param {object|null} ctf
   * @returns {string|null}
   */
  promptFor(pos, team, ctf) {
    if (!pos || !ctf?.flags || (team !== 'alpha' && team !== 'bravo')) return null;
    const own = ctf.flags[team];
    const enemy = ctf.flags[enemyTeam(team)];
    const dxz = (a) => Math.hypot(pos.x - a.x, pos.z - a.z);

    if (own?.state === FLAG_STATE.dropped && dxz(own) < 2.2) return 'Return your flag!';
    if (enemy && enemy.state !== FLAG_STATE.carried && dxz(enemy) < 2.2) {
      return 'Grab the flag!';
    }
    if (own?.state === FLAG_STATE.home && dxz(own.home) < 2.4) {
      return 'Home base';
    }
    return null;
  }

  clear() {
    for (const item of Object.values(this.items)) {
      this.scene.remove(item.pad);
      this.scene.remove(item.flag);
      item.pad.traverse((c) => {
        if (c.geometry && !c.geometry._ctfShared) c.geometry.dispose?.();
      });
      item.flag.traverse((c) => {
        if (c.geometry && c.geometry.type === 'PlaneGeometry') c.geometry.dispose?.();
      });
    }
    this.items = {};
  }

  dispose() {
    this.clear();
  }
}
