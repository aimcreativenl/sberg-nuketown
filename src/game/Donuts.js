import * as THREE from 'three';
import { DONUT_FUN_POINTS } from './constants.js';
import { createMat } from './materials.js';

function makeDonutMesh() {
  const group = new THREE.Group();

  // Frosted torus (pink)
  const body = new THREE.Mesh(
    new THREE.TorusGeometry(0.28, 0.14, 12, 24),
    createMat(0xff8fab, {
      roughness: 0.55,
      metalness: 0.05,
      emissive: 0xff6a90,
      emissiveIntensity: 0.08,
      name: 'donut_frost',
    })
  );
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;
  group.add(body);

  // Inner dough hint
  const dough = new THREE.Mesh(
    new THREE.TorusGeometry(0.28, 0.08, 10, 20),
    createMat(0xf0c987, { roughness: 0.85, name: 'donut_dough' })
  );
  dough.rotation.x = Math.PI / 2;
  dough.position.y = -0.04;
  group.add(dough);

  // Sprinkles
  const sprinkleColors = [0xff6b6b, 0xffe66d, 0x4ecdc4, 0xc5b4e3, 0xff9ff3, 0x54a0ff];
  for (let i = 0; i < 18; i++) {
    const ang = (i / 18) * Math.PI * 2 + Math.random() * 0.2;
    const r = 0.22 + Math.random() * 0.12;
    const s = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.08, 0.03),
      createMat(sprinkleColors[i % sprinkleColors.length], {
        roughness: 0.4,
        emissive: sprinkleColors[i % sprinkleColors.length],
        emissiveIntensity: 0.25,
      })
    );
    s.position.set(Math.cos(ang) * r, 0.1 + Math.random() * 0.04, Math.sin(ang) * r);
    s.rotation.set(Math.random(), ang, Math.random());
    group.add(s);
  }

  // Soft glow ring
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(0.35, 0.55, 24),
    new THREE.MeshBasicMaterial({
      color: 0xffb6c1,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -0.15;
  group.add(glow);

  group.traverse((c) => {
    if (c.isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });

  return group;
}

export class DonutManager {
  constructor(scene, audio, particles, onCollect) {
    this.scene = scene;
    this.audio = audio;
    this.particles = particles;
    this.onCollect = onCollect;
    this.donuts = [];
  }

  spawn(position) {
    const mesh = makeDonutMesh();
    const pos = position.clone();
    pos.y = (position.y || 0) + 0.55;
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.donuts.push({
      mesh,
      position: pos,
      age: 0,
      bob: Math.random() * Math.PI * 2,
      alive: true,
      lifetime: 25,
    });
  }

  update(dt, collectorPos, collectorRadius = 0.9) {
    const collected = [];
    for (const d of this.donuts) {
      if (!d.alive) continue;
      d.age += dt;
      d.bob += dt * 2.5;
      d.mesh.rotation.y += dt * 2.2;
      d.mesh.position.y = d.position.y + Math.sin(d.bob) * 0.12;

      // Soft scale pulse
      const s = 1 + Math.sin(d.bob * 1.5) * 0.05;
      d.mesh.scale.setScalar(s);

      if (d.age > d.lifetime) {
        d.alive = false;
        this.scene.remove(d.mesh);
        continue;
      }

      // Fade near end
      if (d.age > d.lifetime - 3) {
        d.mesh.traverse((c) => {
          if (c.material && c.material.opacity !== undefined) {
            c.material.transparent = true;
            c.material.opacity = Math.max(0.15, (d.lifetime - d.age) / 3);
          }
        });
      }

      if (collectorPos) {
        const dx = d.mesh.position.x - collectorPos.x;
        const dz = d.mesh.position.z - collectorPos.z;
        const horizontal = Math.hypot(dx, dz);
        const dy = Math.abs(d.mesh.position.y - collectorPos.y);
        if (horizontal < collectorRadius && dy < 2.2) {
          d.alive = false;
          this.scene.remove(d.mesh);
          this.particles?.donutSparkle?.(d.mesh.position.clone());
          this.audio?.playDonutPickup?.();
          this.onCollect?.(DONUT_FUN_POINTS);
          collected.push(d);
        }
      }
    }
    this.donuts = this.donuts.filter((d) => d.alive);
    return collected;
  }

  getPositions() {
    return this.donuts.filter((d) => d.alive).map((d) => d.mesh.position.clone());
  }

  clear() {
    for (const d of this.donuts) this.scene.remove(d.mesh);
    this.donuts = [];
  }
}
