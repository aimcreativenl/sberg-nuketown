import { NET_MSG } from './NetTypes.js';

/**
 * @param {Partial<import('./NetTypes.js').InputFrame>} [overrides]
 * @returns {import('./NetTypes.js').InputFrame}
 */
export function emptyInputFrame(overrides = {}) {
  return {
    t: NET_MSG.input,
    seq: 0,
    tick: 0,
    dt: 0,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    jump: false,
    sprint: false,
    fire: false,
    reload: false,
    interact: false,
    weaponSlot: 0,
    aimHold: false,
    crouch: false,
    ...overrides,
  };
}

/**
 * Build an InputFrame from a live Player instance + weapons slot.
 * @param {import('../game/Player.js').Player} player
 * @param {{ seq: number, tick: number, dt: number, weaponSlot?: number, aimHold?: boolean, peek?: boolean }} meta
 * @returns {import('./NetTypes.js').InputFrame}
 */
export function sampleInputFrame(player, meta) {
  const keys = player?.keys || new Set();
  let moveX = 0;
  let moveZ = 0;
  if (keys.has('KeyW')) moveZ -= 1;
  if (keys.has('KeyS')) moveZ += 1;
  if (keys.has('KeyA')) moveX -= 1;
  if (keys.has('KeyD')) moveX += 1;
  // Clamp diagonal to unit circle
  const len = Math.hypot(moveX, moveZ);
  if (len > 1) {
    moveX /= len;
    moveZ /= len;
  }

  const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const jump = keys.has('Space');

  const buttons = player?.buttons || { left: false, right: false };
  const fire = !!buttons.left || (player?.shootClicks | 0) > 0;
  const aimHold = meta.aimHold != null ? !!meta.aimHold : !!buttons.right;
  const peek = !!meta.peek;

  let reload = false;
  if (!peek && typeof player?.consumeReloadPress === 'function') {
    reload = !!player.consumeReloadPress();
  } else {
    reload = !!player?.reloadPressed;
  }

  let interact = false;
  if (!peek && typeof player?.consumeUsePress === 'function') {
    interact = !!player.consumeUsePress();
  } else {
    interact = !!player?.usePressed;
  }

  const weaponSlot =
    meta.weaponSlot != null
      ? meta.weaponSlot | 0
      : player?.weaponIndex != null
        ? player.weaponIndex | 0
        : 0;

  return emptyInputFrame({
    seq: meta.seq | 0,
    tick: meta.tick | 0,
    dt: meta.dt || 0,
    moveX,
    moveZ,
    yaw: player?.yaw ?? 0,
    pitch: player?.pitch ?? 0,
    jump,
    sprint,
    fire,
    reload,
    interact,
    weaponSlot,
    aimHold,
    crouch: !!player?.crouching,
  });
}
