/**
 * Shared coordinates for Candy Foundry (Concept 4). 2× Nuketown linear scale.
 * Visual builders must honor these AABBs so shell / buildings / yard do not overlap badly.
 */
export const CANDY_MAP_ID = 'candy-foundry';
export const CANDY_MAP_NAME = 'Syrup Canal Foundry';

/** Nuketown MAP_WALL = 40. Linear 2× → 80 (playable ~160×160). */
export const CANDY_MAP_WALL = 80;
export const CANDY_GROUND = 168;
export const CANDY_CEILING = 16;
/** Player / bot clamp just inside the perimeter wall. */
export const CANDY_BOUNDS = 78;

export const CANDY_FOG = {
  color: 0xe8b8c8,
  near: 72,
  far: 240,
};

/** Sweet Co — alpha / berry, south-west dock. */
export const SWEET_CO = {
  id: 'sweet_co',
  team: 'alpha',
  cx: -50,
  cz: -48,
  w: 24,
  d: 20,
  wallT: 0.42,
  floor2: 3.35,
  height: 7.4,
  accent: 0xff8fab,
  facade: 0xffd0dc,
};

/** Tasting kiosk — enterable booth in the south-east dry yard. */
export const TASTING_KIOSK = {
  id: 'tasting_kiosk',
  cx: 50,
  cz: -48,
  w: 12,
  d: 9,
  wallT: 0.4,
  height: 4.35,
  accent: 0xff8fab,
  facade: 0xffd0dc,
};

/** Cupcake booth — enterable, north-west dry yard. */
export const CUPCAKE_KIOSK = {
  id: 'cupcake_kiosk',
  cx: -36,
  cz: 34,
  w: 10,
  d: 8,
  wallT: 0.4,
  height: 3.85,
  accent: 0xff8fab,
  facade: 0xfff4dc,
};

/** Voxel gummy-bear cover in the empty south-west hangar floor. */
export const GUMMY_BEARS = [
  { x: -32, z: -32, color: 0xff4d6d, s: 1 },
  { x: -24, z: -36, color: 0xffe066, s: 1.06 },
  { x: -17, z: -27, color: 0x5edc78, s: 0.94 },
];

/** Soft-serve swirl tower with walkable spiral stairs. */
export const SOFT_SERVE = {
  id: 'soft_serve_tower',
  cx: -30,
  cz: 22,
  deckY: 3.85,
  radius: 2.55,
};

/** Elevated gift gantry over the empty SW floor. Stand-to-ride + visual boxes. */
export const GIFT_GANTRY = {
  id: 'gift_gantry',
  x0: -40,
  x1: -16,
  z: -30.2,
  width: 2.25,
  y: 2.35,
  speed: 2.6,
  dirX: 1,
  dirZ: 0,
  boxCount: 4,
};

/** Factory conveyor in front of the kiosk. Boxes travel +X. Stand-to-ride. */
export const CONVEYOR = {
  id: 'candy_line',
  x0: 28,
  x1: 58,
  z: -39.6,
  width: 2.35,
  y: 0.48,
  speed: 3.2,
  dirX: 1,
  dirZ: 0,
  boxCount: 6,
};

/** Sugar Works — bravo / cream, north-east dock. */
export const SUGAR_WORKS = {
  id: 'sugar_works',
  team: 'bravo',
  cx: 50,
  cz: 48,
  w: 24,
  d: 20,
  wallT: 0.42,
  floor2: 3.35,
  height: 7.4,
  accent: 0x7ee8d4,
  facade: 0xfff0d0,
};

export const FOUNTAIN = {
  x: 0,
  z: 0,
  radius: 7.5,
  island: 11,
};

/**
 * Slow syrup (not solid pits). Y band covers walking feet.
 * speedMul applied while the capsule XZ is inside and y is in [yMin, yMax].
 */
export const CANALS = [
  {
    id: 'strawberry',
    minX: -62,
    maxX: -8,
    minZ: -18,
    maxZ: 8,
    yMin: -0.6,
    yMax: 1.15,
    speedMul: 0.42,
    color: 0xff6a9a,
  },
  {
    id: 'chocolate',
    minX: -14,
    maxX: 22,
    minZ: -36,
    maxZ: 36,
    yMin: -0.6,
    yMax: 1.15,
    speedMul: 0.4,
    color: 0x6b3a28,
  },
  {
    id: 'lemon',
    minX: 18,
    maxX: 64,
    minZ: -8,
    maxZ: 20,
    yMin: -0.6,
    yMax: 1.15,
    speedMul: 0.42,
    color: 0xffe066,
  },
];

/** Short low bridges (medium risk). World-space center + size. */
export const GUMDROP_BRIDGES = [
  { x: -28, z: -4, w: 6.5, d: 3.2, y: 0.55 },
  { x: -10, z: 14, w: 5.5, d: 3.0, y: 0.55 },
  { x: 12, z: -16, w: 5.8, d: 3.0, y: 0.55 },
  { x: 32, z: 6, w: 6.2, d: 3.2, y: 0.55 },
];

/** Elevated exposed walkways (high risk / sniper). */
export const PRETZEL_WALKS = [
  { x: -6, z: 0, w: 4.2, d: 52, y: 4.6 },
  { x: 8, z: 12, w: 38, d: 3.8, y: 4.6 },
];

export const LOLLIPOPS = [
  { x: -22, z: -28 },
  { x: -34, z: 22 },
  { x: 20, z: -30 },
  { x: 28, z: 24 },
  { x: -8, z: 30 },
  { x: 6, z: -34 },
];

export const FLAG_HOMES = {
  alpha: { x: -50, y: 0.18, z: -36 },
  bravo: { x: 50, y: 0.18, z: 36 },
};

export const MEDKIT_SPOTS = [
  { x: -50, y: 0.35, z: -48 },
  { x: 50, y: 0.35, z: 48 },
  { x: 50, y: 0.35, z: -48 },
];

/** BR radii scaled ~2× from Nuketown (starts outside wall 80). */
export const BR_ZONE = {
  centerX: 0,
  centerZ: 0,
  stages: [
    { t: 0, r: 88 },
    { t: 22, r: 88 },
    { t: 32, r: 60 },
    { t: 52, r: 60 },
    { t: 62, r: 36 },
    { t: 82, r: 36 },
    { t: 92, r: 18 },
    { t: 110, r: 18 },
    { t: 120, r: 8 },
  ],
  dps: 14,
};

export function buildingAabb(b) {
  const hx = b.w / 2;
  const hz = b.d / 2;
  return {
    minX: b.cx - hx,
    maxX: b.cx + hx,
    minZ: b.cz - hz,
    maxZ: b.cz + hz,
  };
}
