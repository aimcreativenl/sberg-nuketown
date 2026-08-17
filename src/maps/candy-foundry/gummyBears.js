/**
 * Three voxel gummy-bear statues — cover in the empty SW hangar floor.
 */
import * as THREE from 'three';
import { GUMMY_BEARS } from './layout.js';
import { addAabb, rbox } from './helpers.js';

function buildBear(ctx, parent, spec, i) {
  const s = spec.s || 1;
  const x = spec.x;
  const z = spec.z;
  const col = spec.color;
  const g = new THREE.Group();
  g.name = `gummy_bear_${i}`;
  g.position.set(x, 0, z);
  parent.add(g);

  const bodyW = 1.15 * s;
  const bodyH = 1.45 * s;
  const bodyD = 0.92 * s;
  const headR = 0.78 * s;
  g.add(rbox(bodyW, bodyH, bodyD, col, 0, bodyH / 2, 0, { name: `${g.name}_body`, roughness: 0.42 }));
  g.add(rbox(headR, headR, headR * 0.92, col, 0, bodyH + headR * 0.48, 0.04, { name: `${g.name}_head`, roughness: 0.42 }));
  g.add(rbox(0.28 * s, 0.28 * s, 0.22 * s, col, -0.28 * s, bodyH + headR * 0.95, 0.02, { roughness: 0.42 }));
  g.add(rbox(0.28 * s, 0.28 * s, 0.22 * s, col, 0.28 * s, bodyH + headR * 0.95, 0.02, { roughness: 0.42 }));
  g.add(rbox(0.42 * s, 0.55 * s, 0.28 * s, col, -bodyW * 0.52, 0.85 * s, 0.08, { roughness: 0.42 }));
  g.add(rbox(0.42 * s, 0.55 * s, 0.28 * s, col, bodyW * 0.52, 0.85 * s, 0.08, { roughness: 0.42 }));
  g.add(rbox(0.22 * s, 0.12 * s, 0.08 * s, 0x3a2040, -0.16 * s, bodyH + headR * 0.55, headR * 0.42));
  g.add(rbox(0.22 * s, 0.12 * s, 0.08 * s, 0x3a2040, 0.16 * s, bodyH + headR * 0.55, headR * 0.42));
  g.add(rbox(0.34 * s, 0.12 * s, 0.08 * s, 0xff8fab, 0, bodyH + headR * 0.28, headR * 0.44));

  const solidH = bodyH + headR * 0.95;
  addAabb(ctx.colliders, x, solidH / 2, z, bodyW + 0.35, solidH, bodyD + 0.28, {
    kind: 'cover',
    part: g.name,
  });
  ctx.coverPoints.push(new THREE.Vector3(x + bodyW * 0.7, 0, z + 0.8));
  ctx.coverPoints.push(new THREE.Vector3(x - bodyW * 0.7, 0, z - 0.6));
  ctx.waypoints.push(new THREE.Vector3(x + 1.6, 0.2, z + 1.4));
}

export function buildGummyBears(ctx) {
  const root = new THREE.Group();
  root.name = 'gummy_bears';
  ctx.group.add(root);
  for (let i = 0; i < GUMMY_BEARS.length; i++) buildBear(ctx, root, GUMMY_BEARS[i], i);
}
