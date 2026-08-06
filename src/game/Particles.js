import * as THREE from 'three';

/**
 * Pastel combat/ambient VFX.
 * Important: near-camera muzzle/casing particles stay small — never grow via broken shrink scale.
 */
export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.snow = null;
    this._sphereGeo = new THREE.SphereGeometry(1, 6, 6);
    this._boxGeo = new THREE.BoxGeometry(1, 1, 1);
    /** Multiplier applied to per-effect particle counts (Settings graphics preset). */
    this.particleDensity = 1;
  }

  /** Scale a particle count by density, keeping at least 1 for visible feedback. */
  _count(n) {
    return Math.max(1, Math.round(n * this.particleDensity));
  }

  /**
   * @param {number} color
   * @param {number} size world units (kept small near camera)
   * @param {THREE.Vector3} pos
   * @param {THREE.Vector3} vel
   * @param {number} life
   * @param {number} gravity
   * @param {{ sphere?: boolean, additive?: boolean, shrink?: boolean, emissive?: number }} style
   */
  _spawnMesh(color, size, pos, vel, life, gravity = 0, style = {}) {
    const useSphere = style.sphere !== false;
    const geo = useSphere ? this._sphereGeo : this._boxGeo;
    const mat = style.additive
      ? new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          // depthTest true so near-camera flashes don't paint the whole HUD/wall
          depthTest: true,
        })
      : new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: Math.min(0.55, style.emissive ?? 0.25),
          roughness: 0.45,
          metalness: 0.08,
          transparent: true,
          opacity: 1,
        });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.setScalar(size);
    mesh.userData.baseScale = size;
    mesh.position.copy(pos);
    mesh.castShadow = false;
    mesh.frustumCulled = true;
    this.scene.add(mesh);
    this.particles.push({
      mesh,
      vel: vel.clone(),
      life,
      maxLife: life,
      gravity,
      spin: (Math.random() - 0.5) * 10,
      type: 'mesh',
      sharedGeo: true,
      shrink: !!style.shrink,
      baseScale: size,
    });
    return mesh;
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.material?.dispose?.();
        if (p.type === 'tracer' && p.mesh.geometry && !p.sharedGeo) {
          p.mesh.geometry.dispose?.();
        }
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.spin * dt;
      p.mesh.rotation.z += p.spin * 0.7 * dt;
      const t = Math.max(0, p.life / p.maxLife);
      if (p.mesh.material) p.mesh.material.opacity = Math.min(1, t * 1.5);
      // Shrink toward zero from baseScale — never grow past spawn size
      if (p.shrink) {
        const s = p.baseScale * (0.35 + t * 0.65);
        if (p.type === 'tracer') {
          p.mesh.scale.set(s * 0.6, s, s * 0.6);
          if (p.mesh.material) p.mesh.material.opacity = Math.min(0.9, t * 1.4);
        } else {
          p.mesh.scale.setScalar(s);
        }
      }
      if (p.type === 'tracer' && p.mesh.geometry && !p.sharedGeo && p.life <= 0) {
        p.mesh.geometry.dispose?.();
      }
    }

    if (this.snow) {
      const pos = this.snow.geometry.attributes.position;
      const arr = pos.array;
      const t = performance.now() * 0.001;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] -= dt * (0.35 + (i % 7) * 0.06);
        arr[i] += Math.sin(t + i) * dt * 0.18;
        arr[i + 2] += Math.cos(t * 0.7 + i * 0.1) * dt * 0.08;
        if (arr[i + 1] < 0) {
          arr[i + 1] = 16 + Math.random() * 10;
          arr[i] = (Math.random() - 0.5) * 70;
          arr[i + 2] = (Math.random() - 0.5) * 70;
        }
      }
      pos.needsUpdate = true;
    }
  }

  /** Compact muzzle burst — small sparks so bloom cannot fill the screen (FPS / near cam) */
  muzzleFlash(position, direction) {
    const dir = direction.clone().normalize();
    const base = position.clone().addScaledVector(dir, 0.45);
    const colors = [0xffeaa7, 0xffb6c1, 0xffffff, 0xff8fab, 0xfff6c8];
    for (let i = 0; i < this._count(10); i++) {
      const vel = dir
        .clone()
        .multiplyScalar(8 + Math.random() * 10)
        .add(
          new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2.2)
        );
      this._spawnMesh(colors[i % colors.length], 0.025 + Math.random() * 0.03, base, vel, 0.05 + Math.random() * 0.04, 1.5, {
        additive: true,
        sphere: true,
      });
    }
    this._spawnMesh(0xfff6c8, 0.07, base, dir.clone().multiplyScalar(2), 0.04, 0, {
      additive: true,
    });
    this._spawnMesh(0xff8fab, 0.05, base.clone().addScaledVector(dir, 0.06), dir.clone().multiplyScalar(4), 0.035, 0, {
      additive: true,
    });
  }

  /**
   * Third-person bot muzzle — larger, longer-lived so the player can SEE enemies shooting.
   * Optional tracer streak toward the aim direction.
   */
  botMuzzleFlash(position, direction, opts = {}) {
    const dir = direction.clone().normalize();
    const base = position.clone().addScaledVector(dir, 0.2);
    const colors = [0xffeaa7, 0xffffff, 0xff8fab, 0xfff6c8, 0xffc0cb];
    for (let i = 0; i < this._count(14); i++) {
      const vel = dir
        .clone()
        .multiplyScalar(6 + Math.random() * 8)
        .add(
          new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(3)
        );
      this._spawnMesh(colors[i % colors.length], 0.06 + Math.random() * 0.05, base, vel, 0.1 + Math.random() * 0.08, 2, {
        additive: true,
        sphere: true,
      });
    }
    // Bright core readable at range
    this._spawnMesh(0xfff8e0, 0.18, base, dir.clone().multiplyScalar(1.5), 0.09, 0, { additive: true });
    this._spawnMesh(0xff9eb5, 0.12, base.clone().addScaledVector(dir, 0.12), dir.clone().multiplyScalar(3), 0.07, 0, {
      additive: true,
    });

    // Tracer: short pastel streak along shot direction
    const len = opts.tracerLength ?? 4.5;
    const mid = base.clone().addScaledVector(dir, len * 0.45);
    const tracer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.02, len, 5),
      new THREE.MeshBasicMaterial({
        color: 0xffeaa7,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    tracer.position.copy(mid);
    // Cylinder default axis is Y — align to direction
    tracer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.scene.add(tracer);
    this.particles.push({
      mesh: tracer,
      vel: dir.clone().multiplyScalar(28),
      life: 0.12,
      maxLife: 0.12,
      gravity: 0,
      spin: 0,
      type: 'tracer',
      sharedGeo: false,
      shrink: true,
      baseScale: 1,
    });
  }

  bulletCasings(position, direction) {
    const up = new THREE.Vector3(0, 1, 0);
    let right = new THREE.Vector3().crossVectors(direction, up);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    else right.normalize();
    // Eject to the side and slightly back/down so casings leave the FOV quickly
    const pos = position
      .clone()
      .addScaledVector(right, 0.12)
      .add(new THREE.Vector3(0, -0.08, 0))
      .addScaledVector(direction, -0.05);
    const vel = right
      .clone()
      .multiplyScalar(2.2 + Math.random() * 0.8)
      .add(new THREE.Vector3(0, 2.2 + Math.random() * 1.2, 0))
      .add(direction.clone().multiplyScalar(-0.8));
    // Small brass — shrink fades down from baseScale (not up to 1m cubes)
    this._spawnMesh(0xe8c84a, 0.028, pos, vel, 0.55, 14, {
      sphere: false,
      shrink: true,
      emissive: 0.12,
    });
  }

  hitSparks(position) {
    for (let i = 0; i < this._count(12); i++) {
      const vel = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(4 + Math.random() * 5);
      const colors = [0xffffff, 0xffeaa7, 0xff8fab, 0xc9a0e8];
      this._spawnMesh(colors[i % colors.length], 0.035, position.clone(), vel, 0.22, 7, {
        additive: true,
      });
    }
  }

  bloodPuff(position) {
    for (let i = 0; i < this._count(14); i++) {
      const vel = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.7 + 0.25, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(1.8 + Math.random() * 2.8);
      const colors = [0xff8fab, 0xff6b9d, 0xffc0cb, 0xe0bbe4];
      this._spawnMesh(colors[i % colors.length], 0.06 + Math.random() * 0.05, position.clone(), vel, 0.4, 3.5, {
        emissive: 0.35,
      });
    }
  }

  donutSparkle(position) {
    for (let i = 0; i < this._count(28); i++) {
      const vel = new THREE.Vector3(Math.random() - 0.5, Math.random() * 1.4, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(2.5 + Math.random() * 4.5);
      const colors = [0xff8fab, 0xffe66d, 0x4ecdc4, 0xc5b4e3, 0xffffff, 0xff9ff3];
      this._spawnMesh(colors[i % colors.length], 0.05 + Math.random() * 0.03, position.clone(), vel, 0.7, 2.2, {
        additive: i % 2 === 0,
      });
    }
  }

  /** Confetti-style burst on player kills (on top of deathPoof). */
  killBurst(position) {
    const origin = position.clone();
    // Reuse donut sparkle palette as confetti base
    this.donutSparkle(origin);
    // Extra upward confetti pops
    for (let i = 0; i < this._count(18); i++) {
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 1.2,
        0.6 + Math.random() * 1.4,
        (Math.random() - 0.5) * 1.2
      )
        .normalize()
        .multiplyScalar(3 + Math.random() * 5);
      const colors = [0xffe066, 0xff8fab, 0x7ee8b8, 0xc9a0e8, 0xffffff, 0x4ecdc4];
      this._spawnMesh(
        colors[i % colors.length],
        0.04 + Math.random() * 0.05,
        origin.clone().add(new THREE.Vector3(0, 0.6, 0)),
        vel,
        0.85,
        2.8,
        { additive: true }
      );
    }
  }

  deathPoof(position) {
    for (let i = 0; i < this._count(24); i++) {
      const vel = new THREE.Vector3(Math.random() - 0.5, Math.random() * 1.1, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(2.2 + Math.random() * 3.5);
      const colors = [0xc9a0e8, 0xff8fab, 0x7ee8b8, 0xffe066];
      this._spawnMesh(
        colors[i % colors.length],
        0.09 + Math.random() * 0.06,
        position.clone().add(new THREE.Vector3(0, 0.9, 0)),
        vel,
        0.65,
        4,
        { emissive: 0.4 }
      );
    }
  }

  snowDust() {
    if (this.snow) return;
    // Fewer flakes: dense fields + any residual glow still cost outdoor readability
    const count = this._count(420);
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = [
      [1, 0.88, 0.94],
      [0.88, 0.93, 1],
      [0.92, 1, 0.96],
      [1, 0.96, 0.88],
      [0.96, 0.9, 1],
    ];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 70;
      positions[i * 3 + 1] = Math.random() * 24;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 70;
      const c = palette[i % palette.length];
      colors[i * 3] = c[0];
      colors[i * 3 + 1] = c[1];
      colors[i * 3 + 2] = c[2];
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // Normal blending — AdditiveBlending stacked 650 flakes into a white haze
    // that washed the whole outdoor frame (user-reported intermittent overexposure).
    const mat = new THREE.PointsMaterial({
      size: 0.11,
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.NormalBlending,
      sizeAttenuation: true,
    });
    this.snow = new THREE.Points(geo, mat);
    this.snow.name = 'snow_vfx';
    this.scene.add(this.snow);
  }
}
