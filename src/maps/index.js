/**
 * Map pack registry — Game.js loads maps through this instead of MapBuilder.
 * Default remains Nuketown so offline PLAY vs 9 bots is unchanged.
 */
import { MAP_NUKETOWN } from './nuketown/index.js';
import { MAP_CANDY_FOUNDRY } from './candy-foundry/index.js';

export { MAP_NUKETOWN } from './nuketown/index.js';
export { MAP_CANDY_FOUNDRY } from './candy-foundry/index.js';

export const DEFAULT_MAP_ID = 'nuketown';
export const MAP_STORAGE_KEY = 'sberg-map';

/** @type {Record<string, import('./IMap.js').IMap>} */
export const MAPS = {
  [MAP_NUKETOWN.id]: MAP_NUKETOWN,
  [MAP_CANDY_FOUNDRY.id]: MAP_CANDY_FOUNDRY,
};

/** @returns {import('./IMap.js').IMap[]} */
export function listMaps() {
  return [MAP_NUKETOWN, MAP_CANDY_FOUNDRY];
}

/**
 * @param {string} [id]
 * @returns {import('./IMap.js').IMap}
 */
export function getMap(id) {
  return MAPS[id] || MAPS[DEFAULT_MAP_ID];
}

/** @returns {string} */
export function readStoredMapId() {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_MAP_ID;
    const id = localStorage.getItem(MAP_STORAGE_KEY);
    return MAPS[id] ? id : DEFAULT_MAP_ID;
  } catch {
    return DEFAULT_MAP_ID;
  }
}

/** @param {string} id */
export function writeStoredMapId(id) {
  try {
    if (typeof localStorage === 'undefined') return;
    const resolved = MAPS[id] ? id : DEFAULT_MAP_ID;
    localStorage.setItem(MAP_STORAGE_KEY, resolved);
  } catch {
    /* private mode / SSR */
  }
}
