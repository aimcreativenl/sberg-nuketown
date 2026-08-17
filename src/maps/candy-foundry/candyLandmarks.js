/**
 * Extra yard dressing for leftover dry pockets: jawbreakers, candy-cane
 * walk-through arches, and marshmallow stacks.
 */
import * as THREE from 'three';
import { CANDY_CANE_ARCHES, JAWBREAKERS, MARSHMALLOWS } from './layout.js';
import { addAabb, addFloor, rbox, resolveMat } from './helpers.js';

const BALL_GEO = new THREE.SphereGeometry(1, 12, 10);

function buildJawbreaker(ctx, parent, spec, i) {
  const g = new THREE.Group();
  g.name = `jawbreaker_${i}`;
  g.position.set(spec.x, 0, spec.z);
  parent.add(g);
  const r = spec.r;
  const ball = new THREE.Mesh(BALL_GEO, resolveMat(spec.color, { roughness: 0.28, metalness: 0.12 }));
  ball.scale.setScalar(r);
  ball.position.y = r;
  ball.castShadow = true;
  ball.receiveShadow = true;
  ball.name = `${g.name}_ball`;
  g.add(ball);
  g.add(rbox(r * 0.55, 0.08, r * 0.55, 0xfff6e8, 0, r * 1.72, r * 0.15, { name: `${g.name}_shine` }));
  addAabb(ctx.colliders, spec.x, r, spec.z, r * 1.7, r * 1.85, r * 1.7, {
    kind: 'cover',
    part: g.name,
    blocksShot: true,
  });
  ctx.coverPoints.push(new THREE.Vector3(spec.x + r + 0.7, 0, spec.z));
  ctx.coverPoints.push(new THREE.Vector3(spec.x - r - 0.7, 0, spec.z + 0.4));
  ctx.waypoints.push(new THREE.Vector3(spec.x + r + 1.4, 0.2, spec.z + 1.1));
}

function buildCaneArch(ctx, parent, spec, i) {
  const g = new THREE.Group();
  g.name = `candy_cane_arch_${i}`;
  g.position.set(spec.x, 0, spec.z);
  g.rotation.y = spec.yaw || 0;
  parent.add(g);

  const innerW = 2.55;
  const postH = 2.35;
  const red = 0xff4d6d;
  const cream = 0xfff6e8;
  for (const side of [-1, 1]) {
    const px = side * (innerW / 2);
    for (let k = 0; k < 5; k++) {
      const col = k % 2 === 0 ? red : cream;
      g.add(rbox(0.38, 0.48, 0.38, col, px, 0.26 + k * 0.46, 0, { name: `${g.name}_post` }));
    }
    addAabb(ctx.colliders, spec.x + Math.cos(spec.yaw || 0) * px, postH / 2, spec.z + Math.sin(spec.yaw || 0) * px, 0.42, postH, 0.42, {
      kind: 'cover',
      part: `${g.name}_post`,
    });
  }

  const segs = 7;
  for (let s = 0; s < segs; s++) {
    const t = s / (segs - 1);
    const ang = Math.PI * t;
    const ax = Math.cos(ang) * (innerW / 2);
    const ay = postH + Math.sin(ang) * (innerW / 2) * 0.72;
    const col = s % 2 === 0 ? cream : red;
    const piece = rbox(0.4, 0.34, 0.4, col, ax, ay, 0, { name: `${g.name}_arc` });
    piece.rotation.z = ang - Math.PI / 2;
    g.add(piece);
  }
  addAabb(ctx.colliders, spec.x, postH + 1.05, spec.z, innerW + 0.5, 0.55, 0.45, {
    kind: 'cover',
    part: `${g.name}_arc`,
    blocksShot: true,
  });

  ctx.waypoints.push(new THREE.Vector3(spec.x, 0.2, spec.z));
  ctx.coverPoints.push(new THREE.Vector3(spec.x + 1.6, 0, spec.z + 0.8));
}

function buildMarshmallow(ctx, parent, spec, i) {
  const g = new THREE.Group();
  g.name = `marshmallow_${i}`;
  g.position.set(spec.x, 0, spec.z);
  parent.add(g);
  const n = spec.n || 3;
  const pal = [0xfff8f2, 0xffe4ef, 0xfff0d8, 0xe8fff4];
  let y = 0;
  for (let k = 0; k < n; k++) {
    const s = 1.15 - k * 0.08;
    const h = 0.72;
    y += h / 2;
    g.add(rbox(s, h, s * 0.92, pal[k % pal.length], (k % 2) * 0.08, y, (k % 3) * 0.06, {
      roughness: 0.62,
      name: `${g.name}_puff_${k}`,
    }));
    y += h / 2 + 0.02;
  }
  addAabb(ctx.colliders, spec.x, y / 2, spec.z, 1.25, y, 1.2, {
    kind: 'cover',
    part: g.name,
    blocksShot: true,
  });
  addFloor(ctx.floors, spec.x - 0.4, spec.x + 0.4, spec.z - 0.4, spec.z + 0.4, y);
  ctx.coverPoints.push(new THREE.Vector3(spec.x + 1.2, 0, spec.z));
  ctx.waypoints.push(new THREE.Vector3(spec.x - 1.3, 0.2, spec.z + 0.8));
}

export function buildCandyLandmarks(ctx) {
  const root = new THREE.Group();
  root.name = 'candy_landmarks';
  ctx.group.add(root);
  for (let i = 0; i < JAWBREAKERS.length; i++) buildJawbreaker(ctx, root, JAWBREAKERS[i], i);
  for (let i = 0; i < CANDY_CANE_ARCHES.length; i++) buildCaneArch(ctx, root, CANDY_CANE_ARCHES[i], i);
  for (let i = 0; i < MARSHMALLOWS.length; i++) buildMarshmallow(ctx, root, MARSHMALLOWS[i], i);
}
