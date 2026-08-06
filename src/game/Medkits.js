import * as THREE from 'three';
import { createMat } from './materials.js';

function makeMedkitMesh() {
  const g = new THREE.Group();
  // White/cream case
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.38, 0.4),
    createMat(0xfff5f5, { roughness: 0.55, metalness: 0.08, name: 'medkit_case' })
  );
  box.castShadow = true;
  box.receiveShadow = true;
  g.add(box);
  // Red cross (emissive pop)
  const red = createMat(0xff5a6a, {
    roughness: 0.45,
    emissive: 0xff4060,
    emissiveIntensity: 0.2,
    name: 'medkit_cross',
  });
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 0.08), red);
  h.position.set(0, 0.05, 0.21);
  g.add(h);
  const v = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.32, 0.08), red);
  v.position.set(0, 0.05, 0.21);
  g.add(v);
  // Soft glow ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 0.55, 24),
    new THREE.MeshBasicMaterial({
      color: 0xff8fab,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.18;
  g.add(ring);
  return g;
}

/**
 * Two medkits on the map. Stand nearby + press E → full heal.
 */
export class MedkitManager {
  constructor(scene) {
    this.scene = scene;
    this.kits = [];
    this.promptActive = false;
  }

  spawnDefault() {
    this.clear();
    // Two fixed pastel-map spots (away from spawn mid)
    const spots = [
      new THREE.Vector3(-20, 0.35, 12),
      new THREE.Vector3(20, 0.35, -12),
    ];
    for (const pos of spots) {
      const mesh = makeMedkitMesh();
      mesh.position.copy(pos);
      this.scene.add(mesh);
      this.kits.push({
        mesh,
        position: pos.clone(),
        alive: true,
        bob: Math.random() * Math.PI * 2,
      });
    }
  }

  clear() {
    for (const k of this.kits) {
      this.scene.remove(k.mesh);
      k.mesh.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      });
    }
    this.kits = [];
  }

  update(dt) {
    for (const k of this.kits) {
      if (!k.alive) continue;
      k.bob += dt * 2;
      k.mesh.rotation.y += dt * 1.2;
      k.mesh.position.y = k.position.y + Math.sin(k.bob) * 0.1;
    }
  }

  /** Returns nearest living kit within radius, or null */
  getNearby(playerPos, radius = 1.6) {
    let best = null;
    let bestD = radius;
    for (const k of this.kits) {
      if (!k.alive) continue;
      const dx = k.mesh.position.x - playerPos.x;
      const dz = k.mesh.position.z - playerPos.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    return best;
  }

  /**
   * Try pickup. Returns true if healed.
   */
  tryPickup(playerPos, onHeal) {
    const k = this.getNearby(playerPos);
    if (!k) return false;
    k.alive = false;
    this.scene.remove(k.mesh);
    onHeal?.();
    return true;
  }
}
