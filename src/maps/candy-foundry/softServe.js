/**
 * Soft-serve swirl tower with a walkable spiral stair and top deck.
 */
import * as THREE from 'three';
import { SOFT_SERVE } from './layout.js';
import { addAabb, addFloor, rbox } from './helpers.js';

export function buildSoftServe(ctx) {
  const spec = SOFT_SERVE;
  const root = new THREE.Group();
  root.name = spec.id;
  root.position.set(spec.cx, 0, spec.cz);
  ctx.group.add(root);

  const deckY = spec.deckY;
  const R = spec.radius;
  root.add(rbox(R * 2.05, 0.28, R * 2.05, 0xffb3c9, 0, 0.14, 0, { name: `${spec.id}_plinth` }));
  addAabb(ctx.colliders, spec.cx, 0.14, spec.cz, R * 1.9, 0.28, R * 1.9, { kind: 'cover', part: `${spec.id}_plinth` });

  const swirlH = deckY + 1.15;
  const layers = 9;
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const y = 0.45 + t * swirlH;
    const spin = t * Math.PI * 2.4;
    const w = 2.15 - t * 0.85;
    const d = 1.55 - t * 0.45;
    const col = i % 2 === 0 ? 0xfff8f2 : 0xffc0d4;
    const mesh = rbox(w, 0.42, d, col, Math.cos(spin) * 0.18, y, Math.sin(spin) * 0.18, {
      roughness: 0.48,
      name: i === 0 ? `${spec.id}_swirl` : `${spec.id}_swirl_${i}`,
    });
    mesh.rotation.y = spin;
    root.add(mesh);
  }
  addAabb(ctx.colliders, spec.cx, swirlH * 0.45, spec.cz, 1.55, swirlH * 0.85, 1.55, {
    kind: 'cover',
    part: `${spec.id}_core`,
  });

  const steps = 13;
  const rise = deckY / steps;
  const treadH = Math.max(0.34, rise + 0.14);
  const span = Math.PI * 1.72;
  const stairR = R + 0.15;
  for (let i = 0; i < steps; i++) {
    const ang = -Math.PI * 0.15 + (i / (steps - 1)) * span;
    const x = Math.cos(ang) * stairR;
    const z = Math.sin(ang) * stairR;
    const topY = (i + 1) * rise;
    const tw = 0.95;
    const td = 0.72;
    const tread = rbox(tw, Math.max(0.14, rise * 0.85), td, 0xffd0dc, x, topY - rise * 0.35, z, {
      kind: 'wood',
      name: `${spec.id}_tread_${i}`,
    });
    tread.rotation.y = ang + Math.PI / 2;
    root.add(tread);
    const wx = spec.cx + x;
    const wz = spec.cz + z;
    addFloor(ctx.floors, wx - 0.55, wx + 0.55, wz - 0.55, wz + 0.55, topY);
    addAabb(ctx.colliders, wx, topY - treadH * 0.5, wz, 0.82, treadH, 0.82, {
      kind: 'stair_tread',
      chain: spec.id,
      step: i,
    });
  }

  const deckR = 1.85;
  root.add(rbox(deckR * 2, 0.16, deckR * 2, 0xfff0f4, 0, deckY + 0.02, 0, { name: `${spec.id}_deck` }));
  addFloor(ctx.floors, spec.cx - deckR + 0.15, spec.cx + deckR - 0.15, spec.cz - deckR + 0.15, spec.cz + deckR - 0.15, deckY);
  addAabb(ctx.colliders, spec.cx, deckY - 0.08, spec.cz, deckR * 1.85, 0.18, deckR * 1.85, {
    kind: 'pretzel_deck',
    part: `${spec.id}_deck`,
  });
  const railY = deckY + 0.42;
  // Leave −Z open so the spiral can step onto the deck.
  for (const [dx, dz, w, d] of [
    [0, deckR, deckR * 1.7, 0.1],
    [deckR, 0, 0.1, deckR * 1.7],
    [-deckR, 0, 0.1, deckR * 1.7],
  ]) {
    root.add(rbox(w, 0.72, d, 0xfffaf5, dx, railY, dz));
    addAabb(ctx.colliders, spec.cx + dx, railY, spec.cz + dz, w, 0.72, d, { kind: 'railing', part: `${spec.id}_rail` });
  }

  ctx.coverPoints.push(new THREE.Vector3(spec.cx + 3.2, 0, spec.cz));
  ctx.waypoints.push(new THREE.Vector3(spec.cx + stairR, 0.2, spec.cz));
  ctx.waypoints.push(new THREE.Vector3(spec.cx, deckY + 0.15, spec.cz + 0.4));
  ctx.spawnPoints.push(new THREE.Vector3(spec.cx + 0.2, deckY + 1.7, spec.cz));
}
