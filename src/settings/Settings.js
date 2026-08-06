/**
 * Graphics/user settings — Phase 0.
 *
 * Small, dependency-free settings store: a few graphics presets, persisted to
 * localStorage, applied to the running `Game` via safe, best-effort field pokes.
 * `applyToGame()` never throws — every touch point is guarded so this can be
 * wired in early without risking the play loop.
 */

const STORAGE_KEY = 'sberg-settings-v1';

/**
 * @typedef {'low'|'medium'|'high'|'ultra'} GraphicsPresetId
 */

/**
 * @typedef {Object} GraphicsPreset
 * @property {number} shadowMapSize - Sun shadow map resolution (square).
 * @property {number} particles - Particle count density multiplier (1 = default).
 * @property {number} pixelRatioCap - Max devicePixelRatio the renderer is allowed to use.
 * @property {number} bloomStrengthScale - Multiplier applied on top of the base bloom strength.
 * @property {boolean} aoEnabled - Reserved for a future ambient-occlusion pass (not implemented yet).
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

function defaultSettings() {
  return { graphicsPreset: DEFAULT_PRESET };
}

let cached = null;

/** Load (and cache) settings from localStorage, falling back to defaults on any error. */
export function getSettings() {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && GRAPHICS_PRESETS[parsed.graphicsPreset]) {
        cached = { ...defaultSettings(), ...parsed };
        return cached;
      }
    }
  } catch (err) {
    console.warn('[Settings] Failed to load, using defaults', err);
  }
  cached = defaultSettings();
  return cached;
}

function saveSettings(settings) {
  cached = settings;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('[Settings] Failed to save', err);
  }
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
  const next = { ...getSettings(), graphicsPreset: id };
  saveSettings(next);
  return next;
}

/** @returns {GraphicsPreset} */
export function getGraphicsPreset() {
  const { graphicsPreset } = getSettings();
  return GRAPHICS_PRESETS[graphicsPreset] || GRAPHICS_PRESETS[DEFAULT_PRESET];
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
