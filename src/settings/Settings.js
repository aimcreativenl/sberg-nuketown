/**
 * User settings: graphics presets + look/audio prefs.
 * Persisted to localStorage. applyToGame() never throws.
 */
import { MOUSE_SENS, SCOPE_SENS_MULT, TOUCH_LOOK_MULT } from '../game/constants.js';
import { GYRO_MODES } from '../input/GyroLook.js';
import { getPlayDevice } from '../input/detectPlayMode.js';

const STORAGE_KEY = 'sberg-settings-v1';

/**
 * @typedef {'low'|'medium'|'high'|'ultra'} GraphicsPresetId
 * @typedef {'desktop'|'phone'|'tablet'} PlayDevice
 */

/**
 * Resolved knobs for one named preset on one device class.
 * The same label (High) is cheaper on a phone than on a desktop GPU.
 * @typedef {Object} GraphicsQuality
 * @property {GraphicsPresetId} id
 * @property {PlayDevice} device
 * @property {boolean} shadowsEnabled
 * @property {number} shadowMapSize
 * @property {'basic'|'pcf'|'pcfsoft'} shadowType
 * @property {boolean} postEnabled
 * @property {boolean} bloomEnabled
 * @property {number} bloomStrengthScale
 * @property {number} bloomResolutionScale
 * @property {boolean} fxaaEnabled
 * @property {number} pixelRatioCap
 * @property {number} particles
 * @property {boolean} aoEnabled
 * @property {number} lightDistanceScale
 * @property {number} maxPointLights
 * @property {number} cpuTier
 */

function quality(partial) {
  return {
    shadowsEnabled: true,
    shadowMapSize: 1024,
    shadowType: 'pcfsoft',
    postEnabled: true,
    bloomEnabled: true,
    bloomStrengthScale: 1,
    bloomResolutionScale: 0.5,
    fxaaEnabled: true,
    pixelRatioCap: 1,
    particles: 1,
    aoEnabled: false,
    lightDistanceScale: 1,
    maxPointLights: 8,
    cpuTier: 2,
    ...partial,
  };
}

/** Per-device tables. Named presets stay the user's intent; numbers fit the hardware. */
export const GRAPHICS_QUALITY = {
  desktop: {
    low: quality({
      shadowsEnabled: false,
      shadowMapSize: 512,
      shadowType: 'basic',
      postEnabled: false,
      bloomEnabled: false,
      bloomStrengthScale: 0.45,
      bloomResolutionScale: 0.5,
      fxaaEnabled: false,
      pixelRatioCap: 1,
      particles: 0.3,
      lightDistanceScale: 0.55,
      maxPointLights: 4,
      cpuTier: 0,
    }),
    medium: quality({
      shadowsEnabled: true,
      shadowMapSize: 1024,
      shadowType: 'pcf',
      postEnabled: true,
      bloomEnabled: false,
      bloomStrengthScale: 0.7,
      bloomResolutionScale: 0.5,
      fxaaEnabled: true,
      pixelRatioCap: 1.25,
      particles: 0.7,
      lightDistanceScale: 0.8,
      maxPointLights: 8,
      cpuTier: 1,
    }),
    high: quality({
      shadowsEnabled: true,
      shadowMapSize: 4096,
      shadowType: 'pcfsoft',
      postEnabled: true,
      bloomEnabled: true,
      bloomStrengthScale: 1,
      bloomResolutionScale: 0.5,
      fxaaEnabled: true,
      pixelRatioCap: 2,
      particles: 1,
      aoEnabled: true,
      lightDistanceScale: 1,
      maxPointLights: 16,
      cpuTier: 2,
    }),
    ultra: quality({
      shadowsEnabled: true,
      shadowMapSize: 4096,
      shadowType: 'pcfsoft',
      postEnabled: true,
      bloomEnabled: true,
      bloomStrengthScale: 1.15,
      bloomResolutionScale: 1,
      fxaaEnabled: true,
      pixelRatioCap: 3,
      particles: 1.3,
      aoEnabled: true,
      lightDistanceScale: 1.2,
      maxPointLights: 24,
      cpuTier: 3,
    }),
  },
  tablet: {
    low: quality({
      shadowsEnabled: false,
      shadowMapSize: 512,
      shadowType: 'basic',
      postEnabled: false,
      bloomEnabled: false,
      bloomStrengthScale: 0.4,
      fxaaEnabled: false,
      pixelRatioCap: 1,
      particles: 0.25,
      lightDistanceScale: 0.45,
      maxPointLights: 2,
      cpuTier: 0,
    }),
    medium: quality({
      shadowsEnabled: true,
      shadowMapSize: 512,
      shadowType: 'basic',
      postEnabled: true,
      bloomEnabled: false,
      bloomStrengthScale: 0.6,
      fxaaEnabled: true,
      pixelRatioCap: 1,
      particles: 0.5,
      lightDistanceScale: 0.6,
      maxPointLights: 4,
      cpuTier: 1,
    }),
    high: quality({
      shadowsEnabled: true,
      shadowMapSize: 1024,
      shadowType: 'pcf',
      postEnabled: true,
      bloomEnabled: true,
      bloomStrengthScale: 0.85,
      bloomResolutionScale: 0.45,
      fxaaEnabled: true,
      pixelRatioCap: 1.25,
      particles: 0.8,
      lightDistanceScale: 0.75,
      maxPointLights: 6,
      cpuTier: 2,
    }),
    ultra: quality({
      shadowsEnabled: true,
      shadowMapSize: 2048,
      shadowType: 'pcfsoft',
      postEnabled: true,
      bloomEnabled: true,
      bloomStrengthScale: 1,
      bloomResolutionScale: 0.5,
      fxaaEnabled: true,
      pixelRatioCap: 1.5,
      particles: 1,
      lightDistanceScale: 0.9,
      maxPointLights: 10,
      cpuTier: 2,
    }),
  },
  phone: {
    low: quality({
      shadowsEnabled: false,
      shadowMapSize: 256,
      shadowType: 'basic',
      postEnabled: false,
      bloomEnabled: false,
      bloomStrengthScale: 0.35,
      fxaaEnabled: false,
      pixelRatioCap: 1,
      particles: 0.2,
      lightDistanceScale: 0.4,
      maxPointLights: 1,
      cpuTier: 0,
    }),
    medium: quality({
      shadowsEnabled: false,
      shadowMapSize: 512,
      shadowType: 'basic',
      postEnabled: true,
      bloomEnabled: false,
      bloomStrengthScale: 0.55,
      fxaaEnabled: true,
      pixelRatioCap: 1,
      particles: 0.4,
      lightDistanceScale: 0.55,
      maxPointLights: 3,
      cpuTier: 1,
    }),
    high: quality({
      shadowsEnabled: true,
      shadowMapSize: 512,
      shadowType: 'basic',
      postEnabled: true,
      bloomEnabled: true,
      bloomStrengthScale: 0.75,
      bloomResolutionScale: 0.4,
      fxaaEnabled: true,
      pixelRatioCap: 1,
      particles: 0.7,
      lightDistanceScale: 0.65,
      maxPointLights: 4,
      cpuTier: 1,
    }),
    ultra: quality({
      shadowsEnabled: true,
      shadowMapSize: 1024,
      shadowType: 'pcf',
      postEnabled: true,
      bloomEnabled: true,
      bloomStrengthScale: 0.95,
      bloomResolutionScale: 0.5,
      fxaaEnabled: true,
      pixelRatioCap: 1.25,
      particles: 0.9,
      lightDistanceScale: 0.8,
      maxPointLights: 6,
      cpuTier: 2,
    }),
  },
};

/** Desktop table kept as GRAPHICS_PRESETS so older imports still resolve. */
export const GRAPHICS_PRESETS = GRAPHICS_QUALITY.desktop;

/** @type {GraphicsPresetId} */
const DEFAULT_PRESET = 'high';

const DEFAULT_VOLUME = 0.35;
const SENS_MIN = 0.25;
const SENS_MAX = 2;

function clamp(n, lo, hi) {
  const v = Number(n);
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function defaultSettings() {
  return {
    graphicsPreset: DEFAULT_PRESET,
    mouseSens: 1,
    adsSens: 1,
    invertY: false,
    touchSens: 1,
    gyroMode: 'always',
    gyroSens: 1,
    volume: DEFAULT_VOLUME,
    muted: false,
    blood: true,
  };
}

function normalizeSettings(raw = {}) {
  const d = defaultSettings();
  const preset = GRAPHICS_PRESETS[raw.graphicsPreset] ? raw.graphicsPreset : d.graphicsPreset;
  return {
    graphicsPreset: preset,
    mouseSens: clamp(raw.mouseSens ?? d.mouseSens, SENS_MIN, SENS_MAX),
    adsSens: clamp(raw.adsSens ?? d.adsSens, SENS_MIN, SENS_MAX),
    invertY: !!raw.invertY,
    touchSens: clamp(raw.touchSens ?? d.touchSens, SENS_MIN, SENS_MAX),
    gyroMode: GYRO_MODES.includes(raw.gyroMode) ? raw.gyroMode : d.gyroMode,
    gyroSens: clamp(raw.gyroSens ?? d.gyroSens, SENS_MIN, SENS_MAX),
    volume: clamp(raw.volume ?? d.volume, 0, 1),
    muted: !!raw.muted,
    blood: raw.blood === undefined ? d.blood : !!raw.blood,
  };
}

let cached = null;

/** Load (and cache) settings from localStorage, falling back to defaults on any error. */
export function getSettings() {
  if (cached) return cached;
  let parsed = {};
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) parsed = JSON.parse(raw) || {};
  } catch (err) {
    console.warn('[Settings] Failed to load, using defaults', err);
  }
  cached = normalizeSettings({ ...defaultSettings(), ...parsed });
  return cached;
}

function saveSettings(settings) {
  cached = settings;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
  } catch (err) {
    console.warn('[Settings] Failed to save', err);
  }
}

/**
 * Merge a partial update into saved settings.
 * @param {Partial<ReturnType<typeof defaultSettings>>} partial
 */
export function patchSettings(partial = {}) {
  const next = normalizeSettings({ ...getSettings(), ...partial });
  saveSettings(next);
  return next;
}

/**
 * @param {GraphicsPresetId} id
 * @returns {ReturnType<typeof getSettings>}
 */
export function setGraphicsPreset(id) {
  if (!GRAPHICS_PRESETS[id]) {
    console.warn(`[Settings] Unknown graphics preset "${id}", ignoring`);
    return getSettings();
  }
  return patchSettings({ graphicsPreset: id });
}

/**
 * @param {string} [id]
 * @param {PlayDevice} [device]
 * @returns {GraphicsQuality}
 */
export function resolveGraphicsQuality(id, device = getPlayDevice()) {
  const presetId = GRAPHICS_QUALITY.desktop[id] ? id : DEFAULT_PRESET;
  const dev = GRAPHICS_QUALITY[device] ? device : 'desktop';
  const row = GRAPHICS_QUALITY[dev][presetId] || GRAPHICS_QUALITY.desktop[DEFAULT_PRESET];
  return { ...row, id: presetId, device: dev };
}

/** @returns {GraphicsQuality} */
export function getGraphicsPreset() {
  return resolveGraphicsQuality(getSettings().graphicsPreset);
}

/**
 * Yaw/pitch scales for one look frame. invertY flips pitch only.
 * Aiming (ADS hold or scope) uses the existing scope multiplier so 100% feels like today.
 * Touch uses a separate (much higher) camera scale — PUBG/COD do not share mouse units.
 * @param {{ aiming?: boolean, scoped?: boolean, touch?: boolean }} pose
 * @param {ReturnType<typeof getSettings>} [settings]
 */
export function lookScale(pose = {}, settings = getSettings()) {
  const aiming = !!(pose.aiming || pose.scoped);
  const hip = pose.touch
    ? MOUSE_SENS * TOUCH_LOOK_MULT * settings.touchSens
    : MOUSE_SENS * settings.mouseSens;
  const scale = hip * (aiming ? SCOPE_SENS_MULT * settings.adsSens : 1);
  return {
    yawScale: scale,
    pitchScale: settings.invertY ? -scale : scale,
  };
}

/**
 * Apply the current settings to a live `Game` instance. Every field touch is
 * independently guarded — a missing/renamed field on `game` just gets skipped,
 * it will never throw or crash the play loop.
 * @param {object} game - The running Game instance (see src/game/Game.js).
 */
export function applyToGame(game) {
  if (!game) return;
  const preset = getGraphicsPreset();
  const settings = getSettings();

  try {
    game.audio?.setVolume?.(settings.volume);
    game.audio?.setMuted?.(settings.muted);
  } catch (err) {
    console.warn('[Settings] applyToGame: audio failed', err);
  }

  try {
    game.ui?.setBloodEnabled?.(settings.blood !== false);
  } catch (err) {
    console.warn('[Settings] applyToGame: blood fx failed', err);
  }

  try {
    if (typeof game.applyGraphicsQuality === 'function') {
      game.applyGraphicsQuality(preset);
      return;
    }
  } catch (err) {
    console.warn('[Settings] applyToGame: applyGraphicsQuality failed', err);
  }

  // Stub / older Game: best-effort field writes (never throw).
  try {
    if (game.renderer?.setPixelRatio) {
      const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
      game.renderer.setPixelRatio(Math.min(dpr, preset.pixelRatioCap));
    }
  } catch (err) {
    console.warn('[Settings] applyToGame: pixel ratio failed', err);
  }

  try {
    const sun = game.sun;
    if (sun?.shadow?.mapSize) {
      sun.castShadow = !!preset.shadowsEnabled;
      sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
    if (game.renderer?.shadowMap) game.renderer.shadowMap.enabled = !!preset.shadowsEnabled;
  } catch (err) {
    console.warn('[Settings] applyToGame: shadow map failed', err);
  }

  try {
    const bloomPass = game.composer?.passes?.find((p) => p?.name === 'UnrealBloomPass');
    if (bloomPass) {
      bloomPass.enabled = !!preset.bloomEnabled;
      if (typeof game.__baseBloomStrength === 'number') {
        bloomPass.strength = game.__baseBloomStrength * preset.bloomStrengthScale;
      } else if (typeof bloomPass.strength === 'number') {
        game.__baseBloomStrength = bloomPass.strength;
        bloomPass.strength = bloomPass.strength * preset.bloomStrengthScale;
      }
    }
    if (game.fxaaPass) game.fxaaPass.enabled = !!preset.fxaaEnabled;
    if (game._postEnabled !== undefined) game._postEnabled = !!preset.postEnabled;
  } catch (err) {
    console.warn('[Settings] applyToGame: bloom strength failed', err);
  }

  try {
    if (game.particles && 'particleDensity' in game.particles) {
      game.particles.particleDensity = preset.particles;
    }
  } catch (err) {
    console.warn('[Settings] applyToGame: particle density failed', err);
  }

  try {
    game.__aoEnabled = preset.aoEnabled;
  } catch (err) {
    console.warn('[Settings] applyToGame: ao flag failed', err);
  }
}
