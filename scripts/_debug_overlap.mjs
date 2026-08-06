import * as THREE from 'three';
import { buildMap } from '../src/game/MapBuilder.js';

const scene = new THREE.Scene();
const data = buildMap(scene);

const px = -27.5, pz = -1.06, py = 0.633, r = 0.38, halfH = (1.7 - 2 * 0.38) / 2;
// capsule extends from py-halfH-r? no py is feet (bottom). center = py + halfH + r
const centerY = py + halfH + r;
const capMinY = py;
const capMaxY = py + 1.7;

for (const c of data.colliders) {
  if (!c || c.solid === false) continue;
  const b = c.box;
  if (!b) continue;
  const overlapX = px + r > b.min.x && px - r < b.max.x;
  const overlapZ = pz + r > b.min.z && pz - r < b.max.z;
  const overlapY = capMaxY > b.min.y && capMinY < b.max.y;
  if (overlapX && overlapZ && overlapY) {
    console.log(c.kind, c.house, 'box', b.min.x.toFixed(2), b.max.x.toFixed(2), '|', b.min.y.toFixed(2), b.max.y.toFixed(2), '|', b.min.z.toFixed(2), b.max.z.toFixed(2));
  }
}
