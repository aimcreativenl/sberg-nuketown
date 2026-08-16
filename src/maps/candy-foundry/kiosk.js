/**
 * Enterable tasting kiosk (SE yard). One storey, front door on +Z.
 * Walk in from the north dock: face −Z, E on door_front_tasting_kiosk.
 */
import * as THREE from 'three';
import { TASTING_KIOSK, buildingAabb } from './layout.js';
import { addAabb, addFloor, addSwingDoor, box, rbox } from './helpers.js';

const DOOR_W = 1.86;
const DOOR_TOP = 2.35;
const WIN_W = 1.48;
const WIN_H = 1.18;
const SILL = 0.88;
const L1_WALK = 0.25;

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

export function buildTastingKiosk(ctx) {
  const spec = TASTING_KIOSK;
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

  house.add(box(w - wallT, 0.2, d - wallT, 0xf4dcc8, 0, 0.1, 0, { kind: 'wood', name: `${spec.id}_floor` }));
  addFloor(ctx.floors, aabb.minX + 0.28, aabb.maxX - 0.28, aabb.minZ + 0.28, aabb.maxZ - 0.28, L1_WALK);

  const doorGap = [[-DOOR_W / 2, DOOR_W / 2]];
  const frontWins = [-3.55, 3.55];
  const frontWinGaps = frontWins.map((x) => [x - WIN_W / 2, x + WIN_W / 2]);
  const backWins = [-2.8, 2.8];
  const sideWins = [0];

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
    h: DOOR_TOP - (SILL + WIN_H),
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
    y: SILL / 2,
    h: SILL,
    min: -hx,
    max: hx,
    gaps: [],
    color: facade,
    thick: wallT,
    part: 'back_sill',
  });
  splitWall(ctx, house, spec, {
    along: 'x',
    pos: backZ,
    y: SILL + WIN_H / 2,
    h: WIN_H,
    min: -hx,
    max: hx,
    gaps: backWins.map((x) => [x - WIN_W / 2, x + WIN_W / 2]),
    color: facade,
    thick: wallT,
    part: 'back_piers',
  });
  wall(ctx, house, spec, 0, (SILL + WIN_H + height) / 2, backZ, w, height - SILL - WIN_H, wallT, facade, 'back_header');

  for (const sideX of [-hx, hx]) {
    splitWall(ctx, house, spec, {
      along: 'z',
      pos: sideX,
      y: SILL / 2,
      h: SILL,
      min: -hz,
      max: hz,
      gaps: [],
      color: facade,
      thick: wallT,
      part: sideX < 0 ? 'west_sill' : 'east_sill',
    });
    splitWall(ctx, house, spec, {
      along: 'z',
      pos: sideX,
      y: SILL + WIN_H / 2,
      h: WIN_H,
      min: -hz,
      max: hz,
      gaps: sideWins.map((z) => [z - WIN_W / 2, z + WIN_W / 2]),
      color: facade,
      thick: wallT,
      part: sideX < 0 ? 'west_piers' : 'east_piers',
    });
    wall(
      ctx,
      house,
      spec,
      sideX,
      (SILL + WIN_H + height) / 2,
      0,
      wallT,
      height - SILL - WIN_H,
      d,
      facade,
      sideX < 0 ? 'west_header' : 'east_header'
    );
  }

  const winY = SILL + WIN_H / 2;
  for (const wx of frontWins) glass(house, WIN_W - 0.12, WIN_H - 0.1, 0.06, wx, winY, frontZ + 0.02, `${spec.id}_win_f_${wx}`);
  for (const wx of backWins) glass(house, WIN_W - 0.12, WIN_H - 0.1, 0.06, wx, winY, backZ - 0.02, `${spec.id}_win_b_${wx}`);
  glass(house, 0.06, WIN_H - 0.1, WIN_W - 0.12, -hx - 0.02, winY, 0, `${spec.id}_win_w`);
  glass(house, 0.06, WIN_H - 0.1, WIN_W - 0.12, hx + 0.02, winY, 0, `${spec.id}_win_e`);

  addSwingDoor(ctx, {
    parent: house,
    name: 'door_front_tasting_kiosk',
    houseTag: spec.id,
    kind: 'front',
    hingeLocal: { x: -DOOR_W / 2 + 0.12, y: DOOR_TOP / 2 + 0.04, z: frontZ + 0.06 },
    leafW: 1.58,
    leafH: 2.22,
    leafD: 0.1,
    openYaw: -Math.PI / 2,
    woodColor: 0xd4a574,
    accentColor: accent,
    colX: spec.cx,
    colY: DOOR_TOP / 2 + 0.04,
    colZ: spec.cz + frontZ,
    colW: DOOR_W - 0.14,
    colH: 2.22,
    colD: wallT + 0.32,
    interactX: spec.cx,
    interactZ: spec.cz + frontZ,
  });

  house.add(rbox(4.4, 0.12, 1.6, 0xfff4e8, 0, 0.07, frontZ + 0.95, { name: `${spec.id}_dock` }));
  house.add(rbox(5.2, 0.14, 1.8, 0xfff6e8, 0, 2.72, frontZ + 0.7, { name: `${spec.id}_awning` }));
  house.add(rbox(0.16, 2.55, 0.16, 0xfffaf5, -2.2, 1.3, frontZ + 0.95));
  house.add(rbox(0.16, 2.55, 0.16, 0xfffaf5, 2.2, 1.3, frontZ + 0.95));
  house.add(rbox(3.4, 0.55, 0.1, accent, 0, 3.45, frontZ + 0.28, { name: `${spec.id}_sign` }));

  const roofH = 0.38;
  house.add(box(w + 0.35, roofH, d + 0.35, 0xf0c8d4, 0, height + roofH / 2, 0, { kind: 'ceiling', name: `${spec.id}_roof` }));
  addAabb(ctx.colliders, spec.cx, height + roofH / 2, spec.cz, w + 0.2, roofH, d + 0.2, {
    kind: 'house_roof',
    house: spec.id,
  });

  const interior = new THREE.Group();
  interior.name = `${spec.id}_interior`;
  interior.add(rbox(5.4, 0.04, 3.6, 0xffc0d4, 0.2, 0.24, 0.4, { name: 'kiosk_rug' }));
  interior.add(rbox(4.4, 0.72, 0.85, 0xd4a574, 0.15, 0.48, -1.55, { kind: 'wood', name: 'kiosk_counter' }));
  addAabb(ctx.colliders, spec.cx + 0.15, 0.48, spec.cz - 1.55, 4.4, 0.72, 0.85, {
    kind: 'cover',
    house: spec.id,
    part: 'counter',
  });
  interior.add(rbox(4.5, 0.08, 0.92, 0xffe8d0, 0.15, 0.88, -1.55, { kind: 'wood' }));
  interior.add(rbox(0.42, 0.28, 0.42, 0xff8fab, -1.15, 1.08, -1.5));
  interior.add(rbox(0.42, 0.28, 0.42, 0xffe066, 0.15, 1.08, -1.5));
  interior.add(rbox(0.42, 0.28, 0.42, 0x7ee8d4, 1.35, 1.08, -1.5));
  interior.add(rbox(0.46, 0.52, 0.46, 0xff8fab, -1.4, 0.38, -0.35));
  interior.add(rbox(0.46, 0.52, 0.46, 0xffc9a8, 0.2, 0.38, -0.35));
  interior.add(rbox(0.46, 0.52, 0.46, 0xc9a0e8, 1.6, 0.38, -0.35));
  interior.add(rbox(0.55, 1.65, 1.8, 0xffd0dc, -4.85, 0.95, 0.2));
  addAabb(ctx.colliders, spec.cx - 4.85, 0.95, spec.cz + 0.2, 0.55, 1.65, 1.8, {
    kind: 'cover',
    house: spec.id,
    part: 'shelf',
  });
  interior.add(rbox(0.16, 0.2, 0.16, 0xff8fab, -4.85, 1.55, -0.3));
  interior.add(rbox(0.16, 0.2, 0.16, 0xffe066, -4.85, 1.55, 0.2));
  interior.add(rbox(0.16, 0.2, 0.16, 0x7ee8d4, -4.85, 1.55, 0.7));
  const lamp = new THREE.PointLight(0xffe8c8, 22, 12, 2);
  lamp.position.set(0.2, 2.15, 0.2);
  interior.add(lamp);
  interior.add(rbox(0.4, 0.22, 0.4, 0xfff0d0, 0.2, 2.05, 0.2, { emissive: 0xffe8c8, emissiveIntensity: 0.3 }));
  house.add(interior);

  ctx.spawnPoints.push(new THREE.Vector3(spec.cx, 1.7, spec.cz + 1.2));
  ctx.spawnPoints.push(new THREE.Vector3(spec.cx - 2.4, 1.7, spec.cz + 0.4));
  ctx.coverPoints.push(new THREE.Vector3(spec.cx + 0.15, 0, spec.cz - 0.4));
  ctx.coverPoints.push(new THREE.Vector3(spec.cx - 4.2, 0, spec.cz + 0.2));
  ctx.waypoints.push(new THREE.Vector3(spec.cx, 0.2, spec.cz + 1.4));
  ctx.waypoints.push(new THREE.Vector3(spec.cx, 0.2, spec.cz + hz + 2.2));
}
