export const KILL_LIMIT = 20;
export const PLAYER_MAX_HP = 100;
export const PLAYER_SPEED = 7.2;
export const PLAYER_SPRINT = 11.5;
export const PLAYER_JUMP = 8.5;
/** Ground acceleration (Quake-style factor; full speed in a few frames, not 1). */
export const PLAYER_ACCEL = 14;
/** Ground friction when sliding / no wish / overspeed. */
export const PLAYER_FRICTION = 10;
/** Limited air control (much weaker than ground accel). */
export const PLAYER_AIR_ACCEL = 2.5;
/** Brief jump grace after leaving ground (seconds). */
export const PLAYER_COYOTE = 0.08;
export const GRAVITY = 24;
export const PLAYER_HEIGHT = 1.7;
export const PLAYER_RADIUS = 0.38;
/**
 * Hitscan sphere around the visual head cube (0.4×0.42×0.36, plus hat/ears).
 * Must cover cube corners (~0.34) so a scoped shot on the face/helmet is a headshot.
 */
export const HEAD_HIT_RADIUS = 0.38;
export const RESPAWN_TIME = 3;
export const DONUT_FUN_POINTS = 50;
export const BOT_COUNT = 9;
export const MOUSE_SENS = 0.0022;
export const ADS_SENS_MULT = 0.55;
export const SCOPE_SENS_MULT = 0.28;
/** Touch look pad: same pixel→mouse units as desktop, then scaled by TOUCH_LOOK_MULT. */
export const TOUCH_LOOK_PIXEL = 1.25;
/** ~180° yaw for a 100px swipe at 100% touch sensitivity (PUBG/COD camera feel). */
export const TOUCH_LOOK_MULT = Math.PI / (100 * TOUCH_LOOK_PIXEL * MOUSE_SENS);
export const SCOPE_FOV = 22;

/** Phase 1: Rapier-backed player capsule + character controller (Player.js falls back to legacy AABB movement if physics isn't ready). */
export const USE_RAPIER_PLAYER = true;

/** Phase 1d: bots share the same Rapier character-controller resolve as the player (BotAI falls back to legacy AABB if physics isn't ready). */
export const USE_RAPIER_BOTS = true;

/** Popping pastel world colors (aligned with materials.PASTEL). */
export const COLORS = {
  grass: 0x7ee8b8,
  road: 0xb8a8c8,
  sidewalk: 0xf2eaf8,
  yellow: 0xffe066,
  pink: 0xff8fab,
  lilac: 0xc9a0e8,
  sky: 0x7ec8e8,
  cream: 0xfff6e8,
  peach: 0xffc9a8,
  wood: 0xe0a86a,
  white: 0xfffaf8,
  bus: 0xffe040,
  truck: 0xff7aa8,
  fence: 0xfff8f2,
  wall: 0xe4dcf2,
  window: 0x6ec8f0,
  interior: 0xfff6ee,
  shadow: 0x4a3f55,
};

export const GUN_ICONS = {
  pistol: '·',
  m16: '·',
  smg: '·',
  shotgun: '·',
  ar: '·',
  sniper: '·',
};
