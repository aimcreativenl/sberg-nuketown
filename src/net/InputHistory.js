/**
 * Guest-side predicted pose buffer keyed by input seq (Phase 4 reconciliation).
 * When a snapshot arrives with ackSeq, compare host auth vs the pose we predicted
 * at that seq and correct only the residual error.
 */

const DEFAULT_CAP = 64;

export class InputHistory {
  /** @param {number} [cap] */
  constructor(cap = DEFAULT_CAP) {
    /** @type {Array<{ seq: number, x: number, y: number, z: number }>} */
    this._buf = [];
    this.cap = cap | 0 || DEFAULT_CAP;
  }

  clear() {
    this._buf.length = 0;
  }

  /**
   * @param {number} seq
   * @param {{ x: number, y: number, z: number }} pos eye position
   */
  push(seq, pos) {
    const s = seq | 0;
    if (this._buf.length && this._buf[this._buf.length - 1].seq >= s) {
      // Replace same/newer-or-equal tail (shouldn't happen, but keep ordered)
      this._buf[this._buf.length - 1] = { seq: s, x: pos.x, y: pos.y, z: pos.z };
    } else {
      this._buf.push({ seq: s, x: pos.x, y: pos.y, z: pos.z });
    }
    while (this._buf.length > this.cap) this._buf.shift();
  }

  /** Drop entries with seq <= ackSeq (already confirmed by host). */
  dropThrough(ackSeq) {
    const a = ackSeq | 0;
    while (this._buf.length && this._buf[0].seq <= a) this._buf.shift();
  }

  /**
   * Predicted pose at or just before ackSeq.
   * @param {number} ackSeq
   * @returns {{ seq: number, x: number, y: number, z: number }|null}
   */
  findAtOrBefore(ackSeq) {
    const a = ackSeq | 0;
    let best = null;
    for (let i = this._buf.length - 1; i >= 0; i--) {
      const e = this._buf[i];
      if (e.seq <= a) {
        best = e;
        break;
      }
    }
    return best;
  }

  get size() {
    return this._buf.length;
  }
}

/**
 * Compute correction delta: auth − predicted_at_ack.
 * @param {{ x: number, y: number, z: number }} auth
 * @param {{ x: number, y: number, z: number }} predicted
 * @returns {{ dx: number, dy: number, dz: number, dxz: number }}
 */
export function residualError(auth, predicted) {
  const dx = (auth.x ?? 0) - (predicted.x ?? 0);
  const dy = (auth.y ?? 0) - (predicted.y ?? 0);
  const dz = (auth.z ?? 0) - (predicted.z ?? 0);
  return { dx, dy, dz, dxz: Math.hypot(dx, dz) };
}
