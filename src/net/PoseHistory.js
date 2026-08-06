/**
 * Ring buffer of authoritative poses for lag-compensated hitscan (Phase 4).
 */

const DEFAULT_CAP = 40; // ~2s at 20 Hz snaps, or denser if recorded every host tick
const DEFAULT_MAX_REWIND_MS = 150;
const DEFAULT_MIN_REWIND_MS = 0;

/**
 * @typedef {{ t: number, x: number, y: number, z: number, yaw: number, pitch: number }} PoseSample
 */

export class PoseHistory {
  /** @param {number} [cap] */
  constructor(cap = DEFAULT_CAP) {
    /** @type {PoseSample[]} */
    this._buf = [];
    this.cap = cap | 0 || DEFAULT_CAP;
  }

  clear() {
    this._buf.length = 0;
  }

  /**
   * @param {PoseSample} sample
   */
  push(sample) {
    this._buf.push({
      t: sample.t,
      x: sample.x,
      y: sample.y,
      z: sample.z,
      yaw: sample.yaw ?? 0,
      pitch: sample.pitch ?? 0,
    });
    while (this._buf.length > this.cap) this._buf.shift();
  }

  /**
   * Interpolate pose at absolute time `when` (performance.now()-style ms).
   * Clamps to oldest/newest sample if outside range.
   * @param {number} when
   * @returns {PoseSample|null}
   */
  sampleAt(when) {
    const buf = this._buf;
    if (!buf.length) return null;
    if (when <= buf[0].t) return { ...buf[0] };
    if (when >= buf[buf.length - 1].t) return { ...buf[buf.length - 1] };

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
        pitch: a.pitch + (b.pitch - a.pitch) * u,
      };
    }
    return { ...buf[buf.length - 1] };
  }

  get size() {
    return this._buf.length;
  }
}

/**
 * Clamp rewind window for lag compensation.
 * @param {number} rttMs estimated one-way-ish delay to attacker (ms)
 * @param {{ maxMs?: number, minMs?: number }} [opts]
 */
export function clampRewindMs(rttMs, opts = {}) {
  const maxMs = opts.maxMs ?? DEFAULT_MAX_REWIND_MS;
  const minMs = opts.minMs ?? DEFAULT_MIN_REWIND_MS;
  const v = Number.isFinite(rttMs) ? rttMs : 80;
  return Math.max(minMs, Math.min(maxMs, v));
}

export { DEFAULT_MAX_REWIND_MS, DEFAULT_MIN_REWIND_MS };
