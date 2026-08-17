/**
 * Enterable cupcake booth in the NW dry yard. Front door on +Z.
 */
import * as THREE from 'three';
import { CUPCAKE_KIOSK, buildingAabb } from './layout.js';
import { addAabb, addFloor, addSwingDoor, box, rbox, trackLight } from './helpers.js';

const DOOR_W = 1.72;
const DOOR_TOP = 2.25;
const WIN_W = 1.28;
const WIN_H = 1.08;
const SILL = 0.82;
const L1_WALK = 0;

function wall(ctx, house, spec, lx, ly, lz, w, h, d, color, part) {
  house.add(rbox(w, h, d, color, lx, ly, lz, { name: `${spec.id}_${part}` }));
  addAabb(ctx.colliders, spec.cx + lx, ly, spec.cz + lz, w, h, d, {
    kind: 'house_wall',
    house: spec.id,
    part,
  });
}

function glass(house, w, h, d, x, y, z, name) {
  const pane = box(w, h, d, 0xb8d8ff, x, y, z, { kind: 'glass', name, castShadow: false });
  pane.renderOrder = 2;
  house.add(pane);
}

function splitWall(ctx, house, spec, { along, pos, y, h, min, max, gaps, color, thick, part }) {
  const cuts = [...gaps].sort((a, b) => a[0] - b[0]);
  let cursor = min;
  let i = 0;
  for (const [g0, g1] of cuts) {
    if (g0 > cursor + 0.08) {
      const a = cursor;
      const b = g0;
      const mid = (a + b) / 2;
      const len = b - a;
      if (along === 'x') wall(ctx, house, spec, mid, y, pos, len, h, thick, color, `${part}_${i++}`);
      else wall(ctx, house, spec, pos, y, mid, thick, h, len, color, `${part}_${i++}`);
    }
    cursor = Math.max(cursor, g1);
  }
  if (max > cursor + 0.08) {
    const mid = (cursor + max) / 2;
    const len = max - cursor;
    if (along === 'x') wall(ctx, house, spec, mid, y, pos, len, h, thick, color, `${part}_${i++}`);
    else wall(ctx, house, spec, pos, y, mid, thick, h, len, color, `${part}_${i++}`);
  }
}

export function buildCupcakeKiosk(ctx) {
  const spec = CUPCAKE_KIOSK;
  const house = new THREE.Group();
  house.name = spec.id;
  house.position.set(spec.cx, 0, spec.cz);
  ctx.group.add(house);

  const { w, d, wallT, height, facade, accent } = spec;
  const hx = w / 2;
  const hz = d / 2;
  const frontZ = hz;
  const backZ = -hz;
  const aabb = buildingAabb(spec);

  house.add(box(w - wallT, 0.08, d - wallT, 0xffe8c8, 0, 0.04, 0, { kind: 'wood', name: `${spec.id}_floor` }));
  addFloor(ctx.floors, aabb.minX + 0.28, aabb.maxX - 0.28, aabb.minZ + 0.28, aabb.maxZ - 0.28, L1_WALK);

  const doorGap = [[-DOOR_W / 2, DOOR_W / 2]];
  const frontWins = [-2.85, 2.85];
  const frontWinGaps = frontWins.map((x) => [x - WIN_W / 2, x + WIN_W / 2]);

  splitWall(ctx, house, spec, {
    along: 'x',
    pos: frontZ,
    y: SILL / 2,
    h: SILL,
    min: -hx,
    max: hx,
    gaps: doorGap,
    color: facade,
    thick: wallT,
    part: 'front_sill',
  });
  splitWall(ctx, house, spec, {
    along: 'x',
    pos: frontZ,
    y: SILL + WIN_H / 2,
    h: WIN_H,
    min: -hx,
    max: hx,
    gaps: [...doorGap, ...frontWinGaps],
    color: facade,
    thick: wallT,
    part: 'front_piers',
  });
  splitWall(ctx, house, spec, {
    along: 'x',
    pos: frontZ,
    y: (SILL + WIN_H + DOOR_TOP) / 2,
    h: Math.max(0.28, DOOR_TOP - (SILL + WIN_H)),
    min: -hx,
    max: hx,
    gaps: doorGap,
    color: facade,
    thick: wallT,
    part: 'front_mid',
  });
  wall(ctx, house, spec, 0, (DOOR_TOP + height) / 2, frontZ, w, height - DOOR_TOP, wallT, accent, 'front_header');

  splitWall(ctx, house, spec, {
    along: 'x',
    pos: backZ,
    y: height / 2,
    h: height,
    min: -hx,
    max: hx,
    gaps: [[-WIN_W / 2, WIN_W / 2]],
    color: facade,
    thick: wallT,
    part: 'back',
  });
  wall(ctx, house, spec, -hx, height / 2, 0, wallT, height, d, facade, 'west');
  wall(ctx, house, spec, hx, height / 2, 0, wallT, height, d, facade, 'east');

  glass(house, WIN_W, WIN_H, 0.06, -2.85, SILL + WIN_H / 2, frontZ + 0.02, `${spec.id}_win_fl`);
  glass(house, WIN_W, WIN_H, 0.06, 2.85, SILL + WIN_H / 2, frontZ + 0.02, `${spec.id}_win_fr`);
  glass(house, WIN_W, WIN_H, 0.06, 0, SILL + WIN_H / 2, backZ - 0.02, `${spec.id}_win_back`);

  addSwingDoor(ctx, {
    parent: house,
    name: 'door_front_cupcake_kiosk',
    houseTag: spec.id,
    kind: 'front',
    hingeLocal: { x: -DOOR_W / 2, y: DOOR_TOP / 2, z: frontZ },
    leafW: DOOR_W,
    leafH: DOOR_TOP - 0.08,
    openYaw: -1.45,
    woodColor: 0xe8a070,
    accentColor: accent,
    colX: spec.cx,
    colY: DOOR_TOP / 2 + 0.04,
    colZ: spec.cz + frontZ,
    colW: DOOR_W - 0.14,
    colH: 2.12,
    colD: wallT + 0.32,
    interactX: spec.cx,
    interactZ: spec.cz + frontZ,
  });

  const frostY = height + 0.55;
  house.add(rbox(w + 1.1, 0.85, d + 1.1, 0xffb3c9, 0, frostY, 0, { name: `${spec.id}_frosting`, roughness: 0.55 }));
  addAabb(ctx.colliders, spec.cx, frostY, spec.cz, w + 0.6, 0.7, d + 0.6, {
    kind: 'house_roof',
    house: spec.id,
  });
  house.add(rbox(0.55, 0.45, 0.55, 0xff4d6d, -1.4, frostY + 0.55, -0.4));
  house.add(rbox(0.5, 0.42, 0.5, 0xff4d6d, 1.2, frostY + 0.52, 0.5));
  house.add(rbox(0.48, 0.4, 0.48, 0xff4d6d, 0.15, frostY + 0.62, -0.9));
  house.add(rbox(0.16, 0.22, 0.1, 0x7ee8d4, -1.8, frostY + 0.2, 0.9));
  house.add(rbox(0.16, 0.22, 0.1, 0xffe066, 1.6, frostY + 0.18, -0.7));
  house.add(rbox(0.16, 0.22, 0.1, 0xc9a0e8, 0.4, frostY + 0.22, 1.1));

  house.add(rbox(3.6, 0.1, 1.3, 0xfff4e8, 0, 0.06, frontZ + 0.85));
  const lamp = new THREE.PointLight(0xffe0d0, 18, 10, 2);
  lamp.position.set(0, 2.05, 0.15);
  house.add(lamp);
  trackLight(ctx, lamp, 10);

  house.add(rbox(3.6, 0.7, 0.78, 0xd4a574, 0.1, 0.46, -1.35, { kind: 'wood', name: `${spec.id}_counter` }));
  addAabb(ctx.colliders, spec.cx + 0.1, 0.46, spec.cz - 1.35, 3.6, 0.7, 0.78, {
    kind: 'cover',
    house: spec.id,
    part: 'counter',
  });

  ctx.spawnPoints.push(new THREE.Vector3(spec.cx, 1.7, spec.cz + 0.8));
  ctx.coverPoints.push(new THREE.Vector3(spec.cx, 0, spec.cz - 0.5));
  ctx.waypoints.push(new THREE.Vector3(spec.cx, 0.2, spec.cz + 1.2));
  ctx.waypoints.push(new THREE.Vector3(spec.cx, 0.2, spec.cz + hz + 2));
}
