/**
 * Phase 2a wire types — host-authoritative combat sync.
 *
 * Clients send `input` frames; the host owns truth and broadcasts `snapshot` /
 * `event`. Do not trust peer-reported position, health, or kills as final.
 */

/** @type {{ hello: string, input: string, snapshot: string, event: string }} */
export const NET_MSG = {
  hello: 'hello',
  input: 'input',
  snapshot: 'snapshot',
  event: 'event',
};

/** Host snapshot send rate (Hz). */
export const SNAPSHOT_HZ = 20;
/** Guest / local input sample send rate (Hz). */
export const INPUT_HZ = 30;

/**
 * A single client input sample, sent to the authoritative host.
 * @typedef {Object} InputFrame
 * @property {'input'} [t]
 * @property {string} [id] - Sender player id (filled by guest send).
 * @property {number} seq - Monotonically increasing sequence number (for reconciliation).
 * @property {number} tick - Client simulation tick this frame corresponds to.
 * @property {number} dt - Frame delta time in seconds.
 * @property {number} moveX - Wish direction local X, -1..1.
 * @property {number} moveZ - Wish direction local Z, -1..1.
 * @property {number} yaw - Look yaw in radians.
 * @property {number} pitch - Look pitch in radians.
 * @property {boolean} jump
 * @property {boolean} sprint
 * @property {boolean} fire
 * @property {boolean} reload
 * @property {boolean} interact
 * @property {number} [weaponSlot] - Active weapon index (0..n).
 * @property {boolean} [aimHold] - True while RMB / ADS held.
 */

/**
 * Compact authoritative player state inside a snapshot.
 * @typedef {Object} PlayerSnap
 * @property {string} id
 * @property {string} name
 * @property {string|null} [team]
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {number} yaw
 * @property {number} pitch
 * @property {number} hp
 * @property {boolean} alive
 * @property {number} kills
 * @property {number} deaths
 * @property {number} weapon
 * @property {boolean} aiming
 */

/**
 * Host → all: full match pose at a tick.
 * @typedef {Object} SnapshotMsg
 * @property {'snapshot'} t
 * @property {number} tick
 * @property {PlayerSnap[]} players
 * @property {Array<{ id: string, open: boolean }>} [doors]
 */

/**
 * Host → all: discrete combat / match event.
 * @typedef {Object} EventMsg
 * @property {'event'} t
 * @property {'hit'|'kill'|'respawn'|'match_end'|'door'} kind
 * @property {string} [attackerId]
 * @property {string} [victimId]
 * @property {number} [damage]
 * @property {boolean} [headshot]
 * @property {string} [winnerId]
 * @property {string} [doorId]
 * @property {boolean} [open]
 * @property {object} [extra]
 */
