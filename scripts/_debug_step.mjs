import * as THREE from 'three';
import { buildMap } from '../src/game/MapBuilder.js';

const scene = new THREE.Scene();
const data = buildMap(scene);
const pads = data.colliders.filter((c) => c.kind === 'climb_pad' && c.house === 'west');
for (const c of pads) {
  const b = c.box;
  console.log(
    'climb_pad',
    'x', ((b.min.x + b.max.x) / 2).toFixed(2),
    'z', ((b.min.z + b.max.z) / 2).toFixed(2),
    'zHalf', ((b.max.z - b.min.z) / 2).toFixed(3),
    'topY', b.max.y.toFixed(3),
    'botY', b.min.y.toFixed(3),
    'xHalf', ((b.max.x - b.min.x) / 2).toFixed(3)
  );
}
console.log('---roof_climb---');
const roof = data.colliders.filter((c) => c.kind === 'roof_climb' && c.house === 'west');
for (const c of roof) {
  const b = c.box;
  console.log(
    'roof_climb',
    'x', ((b.min.x + b.max.x) / 2).toFixed(2),
    'z', ((b.min.z + b.max.z) / 2).toFixed(2),
    'zHalf', ((b.max.z - b.min.z) / 2).toFixed(3),
    'topY', b.max.y.toFixed(3),
    'botY', b.min.y.toFixed(3)
  );
}
console.log('---floors near garage climb---');
const floors = data.floors.filter((f) => f.minX < -26 && f.maxX > -29 && f.y < 3.2 && f.y > 0.2);
for (const f of floors) {
  console.log(
    'floor',
    'x', f.minX.toFixed(2), f.maxX.toFixed(2),
    'z', f.minZ.toFixed(2), f.maxZ.toFixed(2),
    'y', f.y.toFixed(3)
  );
}
