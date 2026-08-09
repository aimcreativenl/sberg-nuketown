/**
 * Stylized AAA material factory — MeshStandard + procedural maps.
 * Pastel toybox look with light response (not photoreal, not flat Lambert).
 */
import * as THREE from 'three';

export const GFX = {
  /** Primary world material class used by map/props */
  materialType: 'MeshStandardMaterial',
  shadowMapSize: 4096,
  maxPixelRatio: 3,
  /**
   * Bloom only on true highlights (lamps/muzzle). Pastel albedo must stay UNDER threshold
   * or the whole road/grass washes white (user-reported overexposure bug).
   * Strength kept low: UnrealBloomPass multiplies by an extra hardcoded 3.0 in composite.
   * Phase 2: DO NOT raise these — outdoor wash returns immediately.
   */
  bloomStrength: 0.09,
  bloomRadius: 0.28,
  bloomThreshold: 0.94,
  /** Slightly under 1 — stacked pastel lights + ACES already read bright outdoors */
  toneMappingExposure: 0.94,
  atmosphere: 'golden_hour',
  sunColor: 0xffe2c4,
  hemiSky: 0xffe8f0,
  hemiGround: 0x6ed4a8,
  fillColor: 0xd4b4f0,
  rimColor: 0xff9eb8,
  /**
   * Phase 2 haze — start earlier for distance depth; color stays mauve (not white).
   * Near/far tuned so mid-arena stays clear, edges soften.
   */
  fogColor: 0xdcb0c4,
  fogNear: 52,
  fogFar: 122,
  /**
   * Phase 2 light stack: stronger key, leaner fill → soft shadows read without
   * lifting pastel albedos into bloom territory.
   */
  sunIntensity: 0.98,
  hemiIntensity: 0.46,
  ambientIntensity: 0.11,
  fillIntensity: 0.2,
  rimIntensity: 0.15,
  bounceIntensity: 0.055,
  /** Soft PCF blur (4096 map tolerates ~5 before banding) */
  shadowRadius: 5.0,
  shadowBias: -0.00042,
  shadowNormalBias: 0.034,
  shadowIntensity: 1.0,
  /** Richer sky dome (shader in Game.js) — mid luminance, no bloom wash */
  skyTop: 0x7e70c4,
  skyHorizon: 0xffc8b4,
  skyBottom: 0xe8a090,
  skyGlow: 0xffd8c0,
  skyCloud: 0xf0e0f0,
  /** Cheap contact-AO slab cues (MapBuilder) */
  aoColor: 0x3a3348,
  aoOpacity: 0.36,
};

/** Popping pastel palette (more saturated than early flat build). */
export const PASTEL = {
  grass: 0x7ee8b8,
  grassDark: 0x5ed4a0,
  grassLight: 0xa8f5d0,
  road: 0xb8a8c8,
  roadLine: 0xfff6a0,
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
  mint: 0x6ee7b7,
  coral: 0xff6b9d,
  grape: 0xb794f4,
};

const texCache = new Map();

function canCanvas() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

/**
 * Procedural canvas noise / checker / speckles for surface variation.
 * @param {'noise'|'checker'|'turf'|'speckle'|'stripes'|'plank'} kind
 */
export function makeProcTexture(kind = 'noise', size = 64, opts = {}) {
  const key = `${kind}_${size}_${opts.seed ?? 0}_${opts.a ?? ''}_${opts.b ?? ''}`;
  if (texCache.has(key)) return texCache.get(key);
  if (!canCanvas()) {
    texCache.set(key, null);
    return null;
  }

  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const seed = opts.seed ?? 1;
  const rnd = (i) => {
    const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };

  if (kind === 'checker') {
    const cell = opts.cell ?? 8;
    const a = opts.a || '#7ee8b8';
    const b = opts.b || '#5ed4a0';
    for (let y = 0; y < size; y += cell) {
      for (let x = 0; x < size; x += cell) {
        ctx.fillStyle = ((x / cell + y / cell) % 2 === 0) ? a : b;
        ctx.fillRect(x, y, cell, cell);
      }
    }
  } else if (kind === 'turf') {
    // Soft multi-tone lawn — breaks hard checker into pastel toy grass
    const tones = opts.tones || ['#7ee8b8', '#6ad4a8', '#96f0c4', '#5ed4a0', '#a8f5d0'];
    ctx.fillStyle = tones[0];
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 90; i++) {
      const x = rnd(i) * size;
      const y = rnd(i + 11) * size;
      const rw = 4 + rnd(i + 3) * 14;
      const rh = 3 + rnd(i + 7) * 12;
      ctx.fillStyle = tones[i % tones.length];
      ctx.globalAlpha = 0.35 + rnd(i + 5) * 0.4;
      ctx.fillRect(x, y, rw, rh);
    }
    ctx.globalAlpha = 1;
    // Fine speckles for micro-variation under soft shadows
    for (let i = 0; i < size * 3; i++) {
      const x = rnd(i + 40) * size;
      const y = rnd(i + 51) * size;
      ctx.fillStyle = `rgba(255,255,255,${0.04 + rnd(i) * 0.08})`;
      ctx.fillRect(x, y, 1 + rnd(i + 2), 1 + rnd(i + 4));
    }
  } else if (kind === 'stripes') {
    const a = opts.a || '#c9a0e8';
    const b = opts.b || '#e4dcf2';
    for (let y = 0; y < size; y++) {
      ctx.fillStyle = y % 6 < 3 ? a : b;
      ctx.fillRect(0, y, size, 1);
    }
  } else if (kind === 'plank') {
    const a = opts.a || '#e0a86a';
    const b = opts.b || '#c49058';
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = b;
      ctx.fillRect(0, i * (size / 8), size, 2);
      ctx.fillStyle = `rgba(255,255,255,${0.08 + rnd(i) * 0.1})`;
      ctx.fillRect(rnd(i + 3) * size, i * (size / 8), size * 0.4, 1);
    }
  } else if (kind === 'speckle') {
    const base = opts.a || '#fff6e8';
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < size * 4; i++) {
      const x = rnd(i) * size;
      const y = rnd(i + 9) * size;
      const s = 1 + rnd(i + 2) * 2;
      ctx.fillStyle = `rgba(255,140,170,${0.15 + rnd(i + 5) * 0.25})`;
      ctx.fillRect(x, y, s, s);
    }
  } else {
    // noise
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const n = 180 + Math.floor(rnd(i) * 75);
      const o = i * 4;
      img.data[o] = n;
      img.data[o + 1] = n;
      img.data[o + 2] = n;
      img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  if (opts.repeat) {
    tex.repeat.set(opts.repeat, opts.repeat);
  }
  texCache.set(key, tex);
  return tex;
}

/**
 * Create a stylized world material (MeshStandard, soft roughness, optional map).
 * @param {number|string} color
 * @param {object} opts roughness, metalness, map, mapKind, emissive, emissiveIntensity, flatShading, transparent, opacity, name
 */
export function createMat(color, opts = {}) {
  const {
    roughness = 0.78,
    metalness = 0.04,
    mapKind = null,
    mapRepeat = 4,
    emissive = 0x000000,
    emissiveIntensity = 0,
    flatShading = false,
    transparent = false,
    opacity = 1,
    name = 'pastel_std',
    map = null,
  } = opts;

  let tex = map;
  if (!tex && mapKind) {
    tex = makeProcTexture(mapKind, 64, { repeat: mapRepeat, seed: typeof color === 'number' ? color % 97 : 1 });
  }

  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    flatShading,
    transparent,
    opacity,
    emissive,
    emissiveIntensity,
    map: tex || null,
  });
  mat.name = name;
  mat.userFriendly = true;
  return mat;
}

/**
 * See-through window glass — must stay highly transparent so outdoor is readable.
 * MeshBasic + depthWrite false avoids opaque grey from lit MeshStandard + emissive.
 */
export function createGlassMat(color = PASTEL.window) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xb8e0f5,
    metalness: 0,
    roughness: 0.08,
    transmission: 0.92,
    thickness: 0.08,
    ior: 1.45,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
    // Tiny specular hint only — no emissive wash to grey/white
    emissive: 0x000000,
    emissiveIntensity: 0,
  });
  mat.name = 'glass';
  // Fallback for environments that struggle with transmission: still mostly clear
  if (mat.transmission === undefined) {
    return new THREE.MeshBasicMaterial({
      color: 0xc5e8f8,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
      name: 'glass',
    });
  }
  return mat;
}

/** Ground grass — soft turf map (Option A Phase 3: less hard checker / LEGO flat) */
export function createGrassMat() {
  const mat = createMat(PASTEL.grass, {
    name: 'grass',
    mapKind: 'turf',
    mapRepeat: 18,
    roughness: 0.93,
    metalness: 0,
  });
  mat.color.setHex(PASTEL.grass);
  return mat;
}

/** Shared pool — one MeshStandardMaterial per grass patch color (Phase 3 perf). */
const grassPatchMatCache = new Map();

/** Thin grass patch / mound material (cached by color hex). */
export function createGrassPatchMat(color = PASTEL.grassLight) {
  const key = (color >>> 0).toString(16);
  let mat = grassPatchMatCache.get(key);
  if (mat) return mat;
  mat = createMat(color, {
    name: 'grass_patch',
    mapKind: 'turf',
    mapRepeat: 3,
    roughness: 0.95,
    metalness: 0,
  });
  grassPatchMatCache.set(key, mat);
  return mat;
}

/** Road asphalt-ish pastel */
export function createRoadMat() {
  return createMat(PASTEL.road, {
    name: 'road',
    mapKind: 'noise',
    mapRepeat: 16,
    roughness: 0.88,
    metalness: 0.02,
  });
}

/** Wood crates / furniture */
export function createWoodMat(color = PASTEL.wood) {
  return createMat(color, {
    name: 'wood',
    mapKind: 'plank',
    mapRepeat: 2,
    roughness: 0.82,
    metalness: 0.02,
  });
}

/** Facade wall with subtle stripe noise */
export function createFacadeMat(color) {
  return createMat(color, {
    name: 'facade',
    mapKind: 'noise',
    mapRepeat: 3,
    roughness: 0.8,
    metalness: 0.03,
  });
}

/** Interior plaster / painted wall — soft noise, slightly brighter than facade */
export function createPlasterMat(color = PASTEL.cream) {
  return createMat(color, {
    name: 'plaster',
    mapKind: 'noise',
    mapRepeat: 5,
    roughness: 0.88,
    metalness: 0.01,
  });
}

/** Hardwood floor boards */
export function createFloorPlankMat(color = 0xe8c9a0) {
  return createMat(color, {
    name: 'floor_plank',
    mapKind: 'plank',
    mapRepeat: 6,
    roughness: 0.78,
    metalness: 0.02,
  });
}

/** Soft fabric (sofa, cushions, rugs) */
export function createFabricMat(color) {
  return createMat(color, {
    name: 'fabric',
    mapKind: 'speckle',
    mapRepeat: 3,
    roughness: 0.92,
    metalness: 0,
  });
}

/** Ceiling panels — cooler cream with fine noise */
export function createCeilingMat(color = 0xf4efe8) {
  return createMat(color, {
    name: 'ceiling',
    mapKind: 'noise',
    mapRepeat: 4,
    roughness: 0.9,
    metalness: 0,
  });
}

/** Character body — slightly softer, still stylized */
export function createCharMat(color) {
  return createMat(color, {
    name: 'character',
    roughness: 0.72,
    metalness: 0.06,
    flatShading: false,
  });
}

export function isStandardMaterial(mat) {
  return mat && (mat.isMeshStandardMaterial || mat.type === 'MeshStandardMaterial');
}

/** Clear texture cache (tests / HMR) */
export function clearMaterialCache() {
  for (const t of texCache.values()) {
    t?.dispose?.();
  }
  texCache.clear();
}
