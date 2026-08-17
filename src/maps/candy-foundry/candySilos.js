/**
 * South-apron candy tank farm: three filled silos + a walkable catwalk.
 */
import * as THREE from 'three';
import { CANDY_SILOS } from './layout.js';
import { addAabb, addAxisStairs, addFloor, box, rbox, resolveMat } from './helpers.js';

const SILO_GEO = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false);
const CAP_GEO = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
const CANDY_GEO = new THREE.SphereGeometry(1, 8, 6);

const DECK_Y = 4.05;

function candyMat(color) {
  return resolveMat(color, { roughness: 0.38, metalness: 0.08 });
}

function buildOneSilo(ctx, parent, spec) {
  const g = new THREE.Group();
  g.name = `silo_${spec.id}`;
  g.position.set(spec.x, 0, spec.z);
  parent.add(g);

  const R = spec.r;
  const tankH = 7.2;
  const tankY = 3.55;
  const skirtH = 1.55;

  for (const [dx, dz] of [
    [-0.72, -0.72],
    [0.72, -0.72],
    [-0.72, 0.72],
    [0.72, 0.72],
  ]) {
    g.add(rbox(0.34, skirtH, 0.34, 0xc8b4a0, dx * R, skirtH / 2, dz * R, { name: `${g.name}_leg` }));
  }
  g.add(rbox(R * 1.55, 0.22, R * 1.55, 0xe8d4c0, 0, 0.12, 0, { name: `${g.name}_plinth` }));
  addAabb(ctx.colliders, spec.x, 0.12, spec.z, R * 1.5, 0.24, R * 1.5, {
    kind: 'cover',
    part: `${g.name}_plinth`,
  });

  const hopper = rbox(R * 1.7, 0.85, R * 1.7, spec.color, 0, skirtH + 0.1, 0, {
    roughness: 0.46,
    name: `${g.name}_hopper`,
  });
  g.add(hopper);

  const shell = new THREE.Mesh(SILO_GEO, candyMat(spec.color));
  shell.scale.set(R, tankH, R);
  shell.position.y = tankY;
  shell.castShadow = true;
  shell.receiveShadow = true;
  shell.name = `${g.name}_tank`;
  g.add(shell);

  g.add(rbox(R * 2.05, 0.38, R * 2.05, spec.band, 0, tankY + 0.4, 0, { name: `${g.name}_band` }));

  const pane = { roughness: 0.12, metalness: 0.18, transparent: true, opacity: 0.42, name: `${g.name}_window` };
  g.add(box(1.1, 2.45, 0.08, 0xb8e8ff, 0, tankY + 0.15, R + 0.02, pane));
  g.add(box(0.08, 2.45, 1.1, 0xb8e8ff, R + 0.02, tankY + 0.15, 0, pane));
  g.add(box(0.08, 2.45, 1.1, 0xb8e8ff, -R - 0.02, tankY + 0.15, 0, pane));

  const fill = new THREE.Group();
  fill.name = `${g.name}_candy`;
  fill.position.y = tankY - 0.4;
  g.add(fill);
  const palette = [spec.candy, spec.band, 0xfff6e8, 0xff8fab, 0xffe066, 0x7ee8d4];
  for (let i = 0; i < 18; i++) {
    const a = i * 2.21;
    const rr = (0.18 + (i % 5) * 0.12) * R;
    const y = -1.4 + (i % 7) * 0.42;
    const s = 0.18 + (i % 4) * 0.05;
    const m = new THREE.Mesh(CANDY_GEO, candyMat(palette[i % palette.length]));
    m.scale.setScalar(s);
    m.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
    m.castShadow = false;
    fill.add(m);
  }

  const cap = new THREE.Mesh(CAP_GEO, candyMat(spec.band));
  cap.scale.set(R * 1.02, R * 0.55, R * 1.02);
  cap.position.y = tankY + tankH * 0.5 - 0.05;
  cap.castShadow = true;
  cap.name = `${g.name}_cap`;
  g.add(cap);
  g.add(rbox(0.28, 0.55, 0.28, 0xff8fab, 0, tankY + tankH * 0.5 + 0.55, 0, { name: `${g.name}_vent` }));

  addAabb(ctx.colliders, spec.x, tankY, spec.z, R * 1.92, tankH + 0.4, R * 1.92, {
    kind: 'cover',
    part: `${g.name}_tank`,
    blocksShot: true,
  });

  const spill = [spec.candy, 0xff8fab, 0xffe066, 0x7ee8d4, 0xfff6e8];
  for (let i = 0; i < 10; i++) {
    const a = i * 0.62 + 0.4;
    const rr = R + 0.55 + (i % 3) * 0.18;
    const s = 0.22 + (i % 3) * 0.06;
    const m = new THREE.Mesh(CANDY_GEO, candyMat(spill[i % spill.length]));
    m.scale.setScalar(s);
    m.position.set(Math.cos(a) * rr, s * 0.85, Math.sin(a) * rr);
    m.castShadow = true;
    g.add(m);
  }

  ctx.coverPoints.push(new THREE.Vector3(spec.x + R + 0.9, 0, spec.z));
  ctx.coverPoints.push(new THREE.Vector3(spec.x - R - 0.9, 0, spec.z + 0.6));
  ctx.waypoints.push(new THREE.Vector3(spec.x + R + 1.6, 0.2, spec.z + 1.2));
  ctx.waypoints.push(new THREE.Vector3(spec.x - R - 1.4, 0.2, spec.z - 1.1));
}

function addCatwalkSpan(ctx, parent, a, b, i) {
  const minX = Math.min(a.x, b.x) + 0.2;
  const maxX = Math.max(a.x, b.x) - 0.2;
  const z = Math.max(a.z + a.r, b.z + b.r) + 0.95;
  const w = maxX - minX;
  if (w < 1.2) return null;
  const cx = (minX + maxX) / 2;
  const d = 1.7;
  const name = `silo_catwalk_${i}`;

  parent.add(rbox(w, 0.18, d, 0x8a5a32, cx, DECK_Y - 0.08, z, { kind: 'wood', name: `${name}_deck` }));
  addFloor(ctx.floors, minX + 0.08, maxX - 0.08, z - d / 2 + 0.08, z + d / 2 - 0.08, DECK_Y);
  addAabb(ctx.colliders, cx, DECK_Y - 0.1, z, w, 0.2, d, {
    kind: 'pretzel_deck',
    part: name,
  });
  for (const side of [-1, 1]) {
    parent.add(rbox(w, 0.32, 0.1, 0xffc9a8, cx, DECK_Y + 0.28, z + side * (d / 2)));
    addAabb(ctx.colliders, cx, DECK_Y + 0.28, z + side * (d / 2), w, 0.32, 0.1, {
      kind: 'railing',
      part: `${name}_rail`,
    });
  }
  parent.add(rbox(0.16, DECK_Y, 0.16, 0xc8b4a0, minX + 0.25, DECK_Y / 2, z));
  parent.add(rbox(0.16, DECK_Y, 0.16, 0xc8b4a0, maxX - 0.25, DECK_Y / 2, z));
  ctx.waypoints.push(new THREE.Vector3(cx, DECK_Y + 0.2, z));
  return { cx, z, d, name, minX };
}

function buildCatwalk(ctx, parent) {
  const spans = [];
  for (let i = 0; i < CANDY_SILOS.length - 1; i++) {
    const span = addCatwalkSpan(ctx, parent, CANDY_SILOS[i], CANDY_SILOS[i + 1], i);
    if (span) spans.push(span);
  }
  const mid = spans[0];
  if (!mid) return;
  addAxisStairs(ctx, parent, {
    name: 'silo_catwalk_stairs',
    axis: 'x',
    sign: 1,
    landX: mid.minX + 0.35,
    landZ: mid.z,
    width: 1.8,
    deckY: DECK_Y,
  });
  ctx.coverPoints.push(new THREE.Vector3(mid.cx, DECK_Y, mid.z + 1.2));
}

export function buildCandySilos(ctx) {
  const root = new THREE.Group();
  root.name = 'candy_silos';
  ctx.group.add(root);
  for (const spec of CANDY_SILOS) buildOneSilo(ctx, root, spec);
  buildCatwalk(ctx, root);

  // Candy-cane transfer pipes between tank tops (visual + high cover).
  for (let i = 0; i < CANDY_SILOS.length - 1; i++) {
    const a = CANDY_SILOS[i];
    const b = CANDY_SILOS[i + 1];
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) - a.r - b.r + 0.3;
    const pipe = rbox(len, 0.28, 0.28, 0xff8fab, mx, 7.15, mz, { name: `silo_transfer_${i}` });
    pipe.rotation.y = Math.atan2(dx, dz);
    root.add(pipe);
  }
}
