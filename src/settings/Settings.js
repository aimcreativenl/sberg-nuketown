/**
 * User settings: graphics presets + look/audio prefs.
 * Persisted to localStorage. applyToGame() never throws.
 */
import { MOUSE_SENS, SCOPE_SENS_MULT, TOUCH_LOOK_MULT } from '../game/constants.js';
import { GYRO_MODES } from '../input/GyroLook.js';

const STORAGE_KEY = 'sberg-settings-v1';

/**
 * @typedef {'low'|'medium'|'high'|'ultra'} GraphicsPresetId
 */

/**
 * @typedef {Object} GraphicsPreset
 * @property {number} shadowMapSize
 * @property {number} particles
 * @property {number} pixelRatioCap
 * @property {number} bloomStrengthScale
 * @property {boolean} aoEnabled
 */

/** @type {Record<GraphicsPresetId, GraphicsPreset>} */
export const GRAPHICS_PRESETS = {
  low: { shadowMapSize: 1024, particles: 0.4, pixelRatioCap: 1, bloomStrengthScale: 0.6, aoEnabled: false },
  medium: { shadowMapSize: 2048, particles: 0.7, pixelRatioCap: 1.5, bloomStrengthScale: 0.85, aoEnabled: false },
  high: { shadowMapSize: 4096, particles: 1, pixelRatioCap: 2, bloomStrengthScale: 1, aoEnabled: true },
  ultra: { shadowMapSize: 4096, particles: 1.3, pixelRatioCap: 3, bloomStrengthScale: 1.15, aoEnabled: true },
};

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

/** @returns {GraphicsPreset} */
export function getGraphicsPreset() {
  const { graphicsPreset } = getSettings();
  return GRAPHICS_PRESETS[graphicsPreset] || GRAPHICS_PRESETS[DEFAULT_PRESET];
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

  // Renderer pixel ratio cap
  try {
    if (game.renderer?.setPixelRatio) {
      const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
      game.renderer.setPixelRatio(Math.min(dpr, preset.pixelRatioCap));
    }
  } catch (err) {
    console.warn('[Settings] applyToGame: pixel ratio failed', err);
  }

  // Sun shadow map resolution (dispose old map so Three.js regenerates at new size)
  try {
    const sun = game.sun;
    if (sun?.shadow?.mapSize) {
      sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
  } catch (err) {
    console.warn('[Settings] applyToGame: shadow map failed', err);
  }

  // Bloom strength (relative to whatever base strength materials.js/GFX configured)
  try {
    const bloomPass = game.composer?.passes?.find((p) => p?.name === 'UnrealBloomPass');
    if (bloomPass && typeof game.__baseBloomStrength === 'number') {
      bloomPass.strength = game.__baseBloomStrength * preset.bloomStrengthScale;
    } else if (bloomPass && typeof bloomPass.strength === 'number') {
      // First call: remember the base strength before scaling it.
      game.__baseBloomStrength = bloomPass.strength;
      bloomPass.strength = bloomPass.strength * preset.bloomStrengthScale;
    }
  } catch (err) {
    console.warn('[Settings] applyToGame: bloom strength failed', err);
  }

  // Particle density (safe no-op if ParticleSystem doesn't expose the field)
  try {
    if (game.particles && 'particleDensity' in game.particles) {
      game.particles.particleDensity = preset.particles;
    }
  } catch (err) {
    console.warn('[Settings] applyToGame: particle density failed', err);
  }

  // Ambient occlusion — reserved flag only, no AO pass exists yet (Phase 1+).
  try {
    game.__aoEnabled = preset.aoEnabled;
  } catch (err) {
    console.warn('[Settings] applyToGame: ao flag failed', err);
  }
}
