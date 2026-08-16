/**
 * On-screen FPS controls: left move stick, right look pad (drag look / tap shoot).
 * Writes into the same Player keys/buttons the desktop path uses.
 */
import { TOUCH_LOOK_PIXEL } from '../game/constants.js';

const DEAD = 0.18;
const DIR = 0.28;
const SPRINT_MAG = 0.78;
const AIM_TAP_MS = 220;
const LOOK_TAP_MS = 220;
const LOOK_TAP_PX = 16;

/**
 * Legacy FIRE also drove look when no other look finger was down (2-thumb).
 * @param {number|null} lookId
 * @param {number} firePointerId
 */
export function lookIdAfterFireDown(lookId, firePointerId) {
  return lookId == null ? firePointerId : lookId;
}

/** True when a look-pad press was a tap (shoot) rather than a drag (look). */
export function isLookTap(movedPx, durationMs) {
  return durationMs < LOOK_TAP_MS && movedPx < LOOK_TAP_PX;
}

/**
 * @param {number} nx -1..1 (right positive)
 * @param {number} ny -1..1 (up negative, screen space)
 */
export function joystickToKeys(nx, ny) {
  const mag = Math.hypot(nx, ny);
  const keys = {
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false,
    ShiftLeft: false,
  };
  if (mag < DEAD) return keys;
  const x = nx / mag;
  const y = ny / mag;
  if (y < -DIR) keys.KeyW = true;
  if (y > DIR) keys.KeyS = true;
  if (x < -DIR) keys.KeyA = true;
  if (x > DIR) keys.KeyD = true;
  if (mag >= SPRINT_MAG && y < -0.2) keys.ShiftLeft = true;
  return keys;
}

export class TouchControls {
  /**
   * @param {{
   *   player: import('../game/Player.js').Player,
   *   root?: HTMLElement|null,
   *   rotate?: HTMLElement|null,
   *   onPause?: () => void,
   *   onUnlock?: () => void,
   * }} opts
   */
  constructor(opts) {
    this.player = opts.player;
    this.root = opts.root || null;
    this.rotate = opts.rotate || null;
    this.onPause = opts.onPause;
    this.onUnlock = opts.onUnlock;
    this.enabled = false;
    this._touchKeys = new Set();
    this._moveId = null;
    this._lookId = null;
    this._fireIds = new Set();
    this._aimId = null;
    this._jumpId = null;
    this._moveOrigin = { x: 0, y: 0 };
    this._lookLast = { x: 0, y: 0 };
    this._aimDownAt = 0;
    this._lookDownAt = 0;
    this._lookMoved = 0;
    this._bound = false;
    this._onPointerDown = (e) => this._pointerDown(e);
    this._onPointerMove = (e) => this._pointerMove(e);
    this._onPointerUp = (e) => this._pointerUp(e);
    if (this.root) this._bind();
  }

  _bind() {
    if (this._bound || !this.root) return;
    this._bound = true;
    const root = this.root;
    root.addEventListener('pointerdown', this._onPointerDown, { passive: false });
    window.addEventListener('pointermove', this._onPointerMove, { passive: false });
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  show() {
    this.enabled = true;
    this.root?.classList.remove('hidden');
  }

  hide() {
    this.enabled = false;
    this.reset();
    this.root?.classList.add('hidden');
  }

  setRotateVisible(on) {
    this.rotate?.classList.toggle('hidden', !on);
  }

  setUseAvailable(on) {
    this.root?.querySelector('[data-touch="use"]')?.classList.toggle('hidden', !on);
  }

  reset() {
    this._moveId = null;
    this._lookId = null;
    this._fireIds.clear();
    this._aimId = null;
    this._jumpId = null;
    this._lookDownAt = 0;
    this._lookMoved = 0;
    this._clearTouchKeys();
    if (this.player) {
      this.player.buttons.left = false;
      this.player.buttons.right = false;
    }
    this._setStick(0, 0, false);
    this._resetStickBase();
  }

  _clearTouchKeys() {
    if (!this.player?.keys) {
      this._touchKeys.clear();
      return;
    }
    for (const code of this._touchKeys) this.player.keys.delete(code);
    this._touchKeys.clear();
  }

  _setKey(code, on) {
    if (!this.player?.keys) return;
    if (on) {
      this.player.keys.add(code);
      this._touchKeys.add(code);
    } else if (this._touchKeys.has(code)) {
      this.player.keys.delete(code);
      this._touchKeys.delete(code);
    }
  }

  _applyMove(nx, ny) {
    const next = joystickToKeys(nx, ny);
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft']) {
      this._setKey(code, !!next[code]);
    }
    this._setStick(nx, ny, Math.hypot(nx, ny) >= DEAD);
  }

  _setStick(nx, ny, active) {
    const stick = this.root?.querySelector('.touch-stick');
    const knob = this.root?.querySelector('.touch-knob');
    if (!stick || !knob) return;
    stick.classList.toggle('active', !!active);
    const max = 36;
    knob.style.transform = `translate(${nx * max}px, ${ny * max}px)`;
  }

  _action(el) {
    return el?.closest?.('[data-touch]')?.getAttribute('data-touch') || '';
  }

  _pointerDown(e) {
    if (!this.enabled || e.button > 0) return;
    this.onUnlock?.();
    const action = this._action(e.target);
    if (action === 'pause') {
      e.preventDefault();
      this.onPause?.();
      return;
    }
    if (action === 'fire') {
      e.preventDefault();
      this._fireIds.add(e.pointerId);
      try {
        e.target.closest('[data-touch="fire"]')?.setPointerCapture?.(e.pointerId);
      } catch (_) {}
      this.player.buttons.left = true;
      this.player.shootClicks = Math.min(3, (this.player.shootClicks || 0) + 1);
      this._beginLook(lookIdAfterFireDown(this._lookId, e.pointerId), e.clientX, e.clientY);
      return;
    }
    if (action === 'aim') {
      e.preventDefault();
      this._aimId = e.pointerId;
      this._aimDownAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.player.buttons.right = true;
      return;
    }
    if (action === 'jump') {
      e.preventDefault();
      this._jumpId = e.pointerId;
      this._setKey('Space', true);
      return;
    }
    if (action === 'reload') {
      e.preventDefault();
      this.player.reloadPressed = true;
      return;
    }
    if (action === 'use') {
      e.preventDefault();
      this.player.usePressed = true;
      return;
    }
    const zone = e.target?.closest?.('[data-zone]');
    const zoneName = zone?.getAttribute('data-zone');
    if (zoneName === 'move' && this._moveId == null) {
      e.preventDefault();
      this._moveId = e.pointerId;
      this._moveOrigin.x = e.clientX;
      this._moveOrigin.y = e.clientY;
      this._placeStickBase(e.clientX, e.clientY);
      this._applyMove(0, 0);
      return;
    }
    if (zoneName === 'look' && this._lookId == null) {
      e.preventDefault();
      this._beginLook(e.pointerId, e.clientX, e.clientY);
    }
  }

  _beginLook(id, x, y) {
    if (this._lookId != null || id == null) return;
    this._lookId = id;
    this._lookLast.x = x;
    this._lookLast.y = y;
    this._lookMoved = 0;
    this._lookDownAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  _placeStickBase(x, y) {
    const base = this.root?.querySelector('.touch-stick');
    const move = this.root?.querySelector('[data-zone="move"]');
    if (!base || !move) return;
    const r = move.getBoundingClientRect();
    base.style.left = `${x - r.left}px`;
    base.style.top = `${y - r.top}px`;
  }

  _pointerMove(e) {
    if (!this.enabled) return;
    if (e.pointerId === this._moveId) {
      if (e.cancelable) e.preventDefault();
      const radius = 52;
      let nx = (e.clientX - this._moveOrigin.x) / radius;
      let ny = (e.clientY - this._moveOrigin.y) / radius;
      const mag = Math.hypot(nx, ny);
      if (mag > 1) {
        nx /= mag;
        ny /= mag;
      }
      this._applyMove(nx, ny);
      return;
    }
    if (e.pointerId === this._lookId) {
      if (e.cancelable) e.preventDefault();
      const dx = e.clientX - this._lookLast.x;
      const dy = e.clientY - this._lookLast.y;
      this._lookLast.x = e.clientX;
      this._lookLast.y = e.clientY;
      this._lookMoved += Math.hypot(dx, dy);
      this.player.mouse.dx += dx * TOUCH_LOOK_PIXEL;
      this.player.mouse.dy += dy * TOUCH_LOOK_PIXEL;
    }
  }

  _pointerUp(e) {
    if (!this.enabled) return;
    if (e.pointerId === this._moveId) {
      this._moveId = null;
      this._applyMove(0, 0);
      this._resetStickBase();
    }
    if (e.pointerId === this._lookId) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (isLookTap(this._lookMoved, now - (this._lookDownAt || 0))) {
        this.player.shootClicks = Math.min(3, (this.player.shootClicks || 0) + 1);
      }
      this._lookId = null;
      this._lookMoved = 0;
    }
    if (this._fireIds.has(e.pointerId)) {
      this._fireIds.delete(e.pointerId);
      this.player.buttons.left = this._fireIds.size > 0;
    }
    if (e.pointerId === this._aimId) {
      this._aimId = null;
      this.player.buttons.right = false;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - (this._aimDownAt || 0) < AIM_TAP_MS) this.player.scopeClick = true;
    }
    if (e.pointerId === this._jumpId) {
      this._jumpId = null;
      this._setKey('Space', false);
    }
  }

  _resetStickBase() {
    const base = this.root?.querySelector('.touch-stick');
    if (!base) return;
    base.style.left = '';
    base.style.top = '';
  }
}
