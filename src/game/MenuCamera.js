import * as THREE from 'three';

/**
 * Slow cinematic orbit over the arena for the start / idle menu.
 * Does not touch gameplay camera math — call only while match is not running.
 */
export class MenuCamera {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {{
   *   center?: THREE.Vector3,
   *   radius?: number,
   *   height?: number,
   *   lookY?: number,
   *   yawSpeed?: number,
   *   fov?: number,
   * }} [opts]
   */
  constructor(camera, opts = {}) {
    this.camera = camera;
    this.center = (opts.center || new THREE.Vector3(0, 0, 0)).clone();
    this.radius = opts.radius ?? 32;
    this.height = opts.height ?? 9.5;
    this.lookY = opts.lookY ?? 2.4;
    this.yawSpeed = opts.yawSpeed ?? 0.085;
    this.menuFov = opts.fov ?? 52;
    this.playFov = opts.playFov ?? 75;
    this.yaw = -0.55;
    this.t = 0;
    this.active = false;
    this._look = new THREE.Vector3();
  }

  start() {
    this.active = true;
    this.camera.fov = this.menuFov;
    this.camera.updateProjectionMatrix();
    this._apply(0);
  }

  stop() {
    this.active = false;
    this.camera.fov = this.playFov;
    this.camera.updateProjectionMatrix();
  }

  /**
   * @param {number} dt
   */
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    this.yaw += this.yawSpeed * dt;
    this._apply(this.t);
  }

  /** @param {number} t */
  _apply(t) {
    const bob = Math.sin(t * 0.55) * 0.55;
    const rPulse = this.radius + Math.sin(t * 0.22) * 1.4;
    const x = this.center.x + Math.cos(this.yaw) * rPulse;
    const z = this.center.z + Math.sin(this.yaw) * rPulse;
    const y = this.height + bob;
    this.camera.position.set(x, y, z);
    this._look.set(this.center.x, this.lookY + Math.sin(t * 0.35) * 0.25, this.center.z);
    this.camera.lookAt(this._look);
    // Keep roll neutral after lookAt
    this.camera.rotation.z = 0;
  }
}
