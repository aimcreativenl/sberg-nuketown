/**
 * Phase 0 stub — wraps the existing `buildMap()` behind the `IMap` contract so
 * future map packs can be swapped in later without touching `Game.js`. Not wired
 * in yet; `Game.js` still imports `buildMap` directly from `MapBuilder.js`.
 */
import { buildMap } from '../../game/MapBuilder.js';

/** @type {import('../IMap.js').IMap} */
export const MAP_NUKETOWN = {
  id: 'nuketown',
  name: "S'Berg Nuketown",
  build(scene) {
    return buildMap(scene);
  },
};
