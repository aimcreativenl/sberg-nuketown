/**
 * Decide desktop (mouse/keyboard) vs touch play (on-screen sticks).
 * Same Vercel URL — pick from the device, not from a separate link.
 */

/**
 * @param {{
 *   userAgent?: string,
 *   userAgentData?: { mobile?: boolean },
 *   platform?: string,
 *   maxTouchPoints?: number,
 *   pointerFine?: boolean,
 *   pointerCoarse?: boolean,
 * }} [env]
 */
export function isTouchPlay(env = {}) {
  const nav =
    env.navigator ||
    (typeof navigator !== 'undefined' ? navigator : null) ||
    {};
  const ua = String(env.userAgent ?? nav.userAgent ?? '');
  const platform = String(env.platform ?? nav.platform ?? '');
  const maxTouchPoints = Number(env.maxTouchPoints ?? nav.maxTouchPoints ?? 0);
  const uaDataMobile =
    env.userAgentData?.mobile ?? nav.userAgentData?.mobile ?? false;

  const phoneUa = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const iPadUa =
    /iPad/i.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);

  if (uaDataMobile === true || phoneUa || iPadUa) return true;

  let pointerFine = env.pointerFine;
  let pointerCoarse = env.pointerCoarse;
  const win = env.window || (typeof window !== 'undefined' ? window : null);
  if (pointerFine == null && typeof win?.matchMedia === 'function') {
    pointerFine = win.matchMedia('(pointer: fine)').matches;
  }
  if (pointerCoarse == null && typeof win?.matchMedia === 'function') {
    pointerCoarse = win.matchMedia('(pointer: coarse)').matches;
  }

  // Phone/tablet UI: coarse primary pointer, no mouse.
  // Touchscreen laptops stay desktop (fine pointer + hover).
  if (pointerCoarse && !pointerFine) return true;
  return false;
}

/**
 * Full-screen “turn sideways” should never cover the start menu, pause, or settings.
 * Only live combat in portrait is blocked.
 */
export function shouldShowRotateHint({
  touchPlay = false,
  portrait = false,
  running = false,
  paused = false,
  matchOver = false,
  settingsOpen = false,
} = {}) {
  return !!(touchPlay && portrait && running && !paused && !matchOver && !settingsOpen);
}

/**
 * Coarse device class for graphics scaling.
 * Desktop stays mouse/keyboard. Touch splits phone vs tablet (Android tablets
 * usually omit "Mobile"; iPad is always tablet; short CSS side >= 600 is tablet).
 * @returns {'desktop'|'phone'|'tablet'}
 */
export function getPlayDevice(env = {}) {
  if (!isTouchPlay(env)) return 'desktop';

  const nav =
    env.navigator ||
    (typeof navigator !== 'undefined' ? navigator : null) ||
    {};
  const ua = String(env.userAgent ?? nav.userAgent ?? '');
  const platform = String(env.platform ?? nav.platform ?? '');
  const maxTouchPoints = Number(env.maxTouchPoints ?? nav.maxTouchPoints ?? 0);
  const uaDataMobile = env.userAgentData?.mobile ?? nav.userAgentData?.mobile;

  if (/iPad/i.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1)) return 'tablet';
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return 'tablet';
  if (/iPhone|iPod/i.test(ua)) return 'phone';
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return 'phone';
  if (uaDataMobile === true) return 'phone';

  const win = env.window || (typeof window !== 'undefined' ? window : null);
  const w = Number(env.innerWidth ?? win?.innerWidth ?? env.screenWidth ?? win?.screen?.width ?? 0);
  const h = Number(env.innerHeight ?? win?.innerHeight ?? env.screenHeight ?? win?.screen?.height ?? 0);
  const short = Math.min(w || h, h || w);
  if (short >= 600) return 'tablet';
  return 'phone';
}

/** Portrait on a touch device — FPS wants landscape. */
export function isTouchPortrait(env = {}) {
  if (!isTouchPlay(env)) return false;
  const win = env.window || (typeof window !== 'undefined' ? window : null);
  if (!win) return false;
  if (typeof win.matchMedia === 'function' && win.matchMedia('(orientation: portrait)').matches) {
    return true;
  }
  return (win.innerHeight || 0) > (win.innerWidth || 0);
}
