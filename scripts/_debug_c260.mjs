import * as THREE from 'three';
import { buildMap } from '../src/game/MapBuilder.js';

const scene = new THREE.Scene();
const data = buildMap(scene);
console.log(JSON.stringify(data.colliders[260], (k, v) => (k === 'box' ? undefined : v), 2));
console.log('box', data.colliders[260].box.min, data.colliders[260].box.max);
// print nearby indices too
for (let i = 255; i < 265; i++) {
  const c = data.colliders[i];
  console.log(i, c.kind, c.house, c.box.min, c.box.max);
}
