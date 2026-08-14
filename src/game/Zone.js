/**
 * Battle Royale safe-zone ring — view only. Radius truth lives on the host (pubg.js).
 */
import * as THREE from 'three';

export class ZoneRing {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.RingGeometry(0.97, 1.0, 80);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff8fab,
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.1;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);

    const fill = new THREE.Mesh(
      new THREE.RingGeometry(1.0, 1.08, 80),
      new THREE.MeshBasicMaterial({
        color: 0xc5b4e3,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.09;
    this.fill = fill;
    scene.add(fill);
    this._t = 0;
  }

  /** @param {number} radius */
  setRadius(radius) {
    const r = Math.max(0.5, radius || 1);
    this.mesh.scale.set(r, r, 1);
    this.fill.scale.set(r, r, 1);
  }

  /** @param {number} dt */
  update(dt) {
    this._t += dt;
    const pulse = 0.52 + Math.sin(this._t * 2.4) * 0.1;
    if (this.mesh.material) this.mesh.material.opacity = pulse;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.scene.remove(this.fill);
    this.mesh.geometry?.dispose?.();
    this.fill.geometry?.dispose?.();
    this.mesh.material?.dispose?.();
    this.fill.material?.dispose?.();
    this.mesh = null;
    this.fill = null;
  }
}
