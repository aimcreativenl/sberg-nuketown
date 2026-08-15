/**
 * PUBG / COD Mobile gyroscope look: tilt the phone to aim while thumbs stay on
 * move + fire. Uses DeviceMotion rotationRate; falls back to orientation deltas.
 */

export const GYRO_MODES = ['off', 'ads', 'always'];

/**
 * @param {string} mode
 * @param {boolean} aiming
 */
export function gyroLookActive(mode, aiming) {
  if (mode === 'always') return true;
  if (mode === 'ads') return !!aiming;
  return false;
}

/**
 * @param {{ orientation?: { angle?: number }, mozOrientation?: number }} [screenLike]
 * @param {{ orientation?: number }} [windowLike]
 */
export function screenOrientationAngle(screenLike = globalThis.screen, windowLike = globalThis) {
  const typed = screenLike?.orientation?.angle;
  if (typeof typed === 'number' && Number.isFinite(typed)) {
    return ((typed % 360) + 360) % 360;
  }
  const legacy = windowLike?.orientation;
  if (typeof legacy === 'number' && Number.isFinite(legacy)) {
    return ((legacy % 360) + 360) % 360;
  }
  return 0;
}

/**
 * Map DeviceMotion rotationRate (deg/s) to FPS yaw/pitch rates (rad/s).
 * Landscape-primary (90°) is the play orientation.
 *
 * @param {{ alpha?: number, beta?: number, gamma?: number }|null|undefined} rotationRate
 * @param {number} [angle]
 */
export function motionToLookRates(rotationRate, angle = 0) {
  if (!rotationRate) return { yawRate: 0, pitchRate: 0 };
  const b = Number(rotationRate.beta) || 0;
  const g = Number(rotationRate.gamma) || 0;
  const ang = ((Number(angle) % 360) + 360) % 360;
  let yawDeg = g;
  let pitchDeg = b;
  if (ang === 90) {
    yawDeg = b;
    pitchDeg = -g;
  } else if (ang === 270) {
    yawDeg = -b;
    pitchDeg = g;
  } else if (ang === 180) {
    yawDeg = -g;
    pitchDeg = -b;
  }
  const deg = Math.PI / 180;
  return { yawRate: yawDeg * deg, pitchRate: pitchDeg * deg };
}

function wrapDeg(d) {
  let x = d;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

function hasRate(rr) {
  return !!(rr && (rr.alpha != null || rr.beta != null || rr.gamma != null));
}

export async function requestMotionPermission() {
  const tryPerm = async (Ctor) => {
    if (!Ctor || typeof Ctor.requestPermission !== 'function') return null;
    try {
      return (await Ctor.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  };
  const motion = await tryPerm(globalThis.DeviceMotionEvent);
  if (motion === false) return false;
  const orient = await tryPerm(globalThis.DeviceOrientationEvent);
  if (orient === false) return false;
  return true;
}

export class GyroLook {
  constructor() {
    this.yawRate = 0;
    this.pitchRate = 0;
    this.active = false;
    this._bound = false;
    this._useOrient = true;
    this._lastOrient = null;
    this._lastOrientT = 0;
    this._onMotion = (e) => this._motion(e);
    this._onOrient = (e) => this._orient(e);
  }

  async start() {
    const ok = await requestMotionPermission();
    if (!ok) return false;
    this.active = true;
    if (this._bound) return true;
    this._bound = true;
    globalThis.addEventListener?.('devicemotion', this._onMotion);
    globalThis.addEventListener?.('deviceorientation', this._onOrient);
    return true;
  }

  stop() {
    this.active = false;
    this.yawRate = 0;
    this.pitchRate = 0;
    this._lastOrient = null;
  }

  _motion(e) {
    if (!this.active) return;
    const rr = e?.rotationRate;
    if (!hasRate(rr)) return;
    this._useOrient = false;
    const next = motionToLookRates(rr, screenOrientationAngle());
    this.yawRate = next.yawRate;
    this.pitchRate = next.pitchRate;
  }

  _orient(e) {
    if (!this.active || !this._useOrient) return;
    const beta = Number(e?.beta);
    const gamma = Number(e?.gamma);
    if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (this._lastOrient) {
      const dt = Math.max(0.008, (now - this._lastOrientT) / 1000);
      const dBeta = wrapDeg(beta - this._lastOrient.beta);
      const dGamma = wrapDeg(gamma - this._lastOrient.gamma);
      if (Math.abs(dBeta) < 45 && Math.abs(dGamma) < 45) {
        const next = motionToLookRates(
          { beta: dBeta / dt, gamma: dGamma / dt },
          screenOrientationAngle()
        );
        this.yawRate = next.yawRate;
        this.pitchRate = next.pitchRate;
      }
    }
    this._lastOrient = { beta, gamma };
    this._lastOrientT = now;
  }
}
