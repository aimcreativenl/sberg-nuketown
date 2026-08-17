/**
 * Striped licorice culvert — crouched (C) you fit; standing you do not.
 */
import * as THREE from 'three';
import { LICORICE_PIPE } from './layout.js';
import { addAabb, rbox } from './helpers.js';

const RED = 0xc41e3a;
const BLACK = 0x2a1814;

export function buildLicoricePipe(ctx) {
  const spec = LICORICE_PIPE;
  const { x0, x1, z, innerW, innerH, wall } = spec;
  const len = x1 - x0;
  const cx = (x0 + x1) / 2;
  const outerW = innerW + wall * 2;
  const roofY = innerH + wall * 0.5;

  const root = new THREE.Group();
  root.name = spec.id;
  ctx.group.add(root);

  const rings = Math.max(8, Math.round(len / 1.15));
  const ringW = len / rings;
  for (let i = 0; i < rings; i++) {
    const x = x0 + (i + 0.5) * ringW;
    const col = i % 2 === 0 ? RED : BLACK;
    const stripe = i % 2 === 0 ? 0xff6a7a : 0x3d2a22;
    root.add(rbox(ringW * 0.96, innerH, wall, col, x, innerH / 2, z - (innerW / 2 + wall / 2), {
      name: i === 0 ? `${spec.id}_wall` : `${spec.id}_wall_l_${i}`,
      roughness: 0.52,
    }));
    root.add(rbox(ringW * 0.96, innerH, wall, col, x, innerH / 2, z + (innerW / 2 + wall / 2), {
      name: `${spec.id}_wall_r_${i}`,
      roughness: 0.52,
    }));
    root.add(rbox(ringW * 0.96, wall, outerW, stripe, x, roofY, z, {
      name: `${spec.id}_roof_${i}`,
      roughness: 0.5,
    }));
  }

  // Flared mouths — frame only, so the opening stays walkable.
  for (const x of [x0 - 0.2, x1 + 0.2]) {
    root.add(rbox(0.36, 0.28, outerW + 0.2, RED, x, innerH + 0.22, z, { name: `${spec.id}_lip_top` }));
    root.add(rbox(0.36, innerH + 0.16, 0.22, RED, x, (innerH + 0.16) / 2, z - (outerW / 2 + 0.02), {
      name: `${spec.id}_lip_l`,
    }));
    root.add(rbox(0.36, innerH + 0.16, 0.22, RED, x, (innerH + 0.16) / 2, z + (outerW / 2 + 0.02), {
      name: `${spec.id}_lip_r`,
    }));
  }

  addAabb(ctx.colliders, cx, innerH / 2, z - (innerW / 2 + wall / 2), len, innerH, wall, {
    kind: 'cover',
    part: `${spec.id}_wall_l`,
    blocksShot: true,
  });
  addAabb(ctx.colliders, cx, innerH / 2, z + (innerW / 2 + wall / 2), len, innerH, wall, {
    kind: 'cover',
    part: `${spec.id}_wall_r`,
    blocksShot: true,
  });
  addAabb(ctx.colliders, cx, roofY, z, len, wall, outerW, {
    kind: 'cover',
    part: `${spec.id}_roof`,
    blocksShot: true,
  });

  // Lip colliders leave the mouth open (only a thin frame).
  for (const x of [x0 - 0.18, x1 + 0.18]) {
    addAabb(ctx.colliders, x, innerH + 0.12, z, 0.32, 0.22, outerW + 0.18, {
      kind: 'cover',
      part: `${spec.id}_lip_top`,
    });
    addAabb(ctx.colliders, x, innerH / 2, z - (outerW / 2 + 0.04), 0.32, innerH, 0.16, {
      kind: 'cover',
      part: `${spec.id}_lip_l`,
    });
    addAabb(ctx.colliders, x, innerH / 2, z + (outerW / 2 + 0.04), 0.32, innerH, 0.16, {
      kind: 'cover',
      part: `${spec.id}_lip_r`,
    });
  }

  ctx.coverPoints.push(new THREE.Vector3(x0 - 1.2, 0, z));
  ctx.coverPoints.push(new THREE.Vector3(x1 + 1.2, 0, z));
  ctx.coverPoints.push(new THREE.Vector3(cx, 0, z - innerW / 2 - 1.1));
  ctx.coverPoints.push(new THREE.Vector3(cx, 0, z + innerW / 2 + 1.1));
  ctx.waypoints.push(new THREE.Vector3(x0 - 1.6, 0.2, z));
  ctx.waypoints.push(new THREE.Vector3(x1 + 1.6, 0.2, z));
  ctx.waypoints.push(new THREE.Vector3(cx, 0.2, z - innerW / 2 - 1.4));
  ctx.waypoints.push(new THREE.Vector3(cx, 0.2, z + innerW / 2 + 1.4));
}
