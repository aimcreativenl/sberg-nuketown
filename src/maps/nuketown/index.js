/**
 * Nuketown pack — wraps existing `buildMap()` behind the IMap contract.
 * `bounds: 38` matches the historic Player clamp (MAP_WALL ≈ 40).
 */
import { buildMap } from '../../game/MapBuilder.js';

/** @type {import('../IMap.js').IMap} */
export const MAP_NUKETOWN = {
  id: 'nuketown',
  name: "S'Berg Nuketown",
  build(scene) {
    const data = buildMap(scene);
    return {
      ...data,
      id: 'nuketown',
      bounds: 38,
      wall: 40,
    };
  },
};
