/**
 * Enterable Sweet Co + Sugar Works: wall gaps, swing doors, stairs, rooms, furniture.
 */
import * as THREE from 'three';
import { SWEET_CO, SUGAR_WORKS, buildingAabb } from './layout.js';
import { rbox, box, addAabb, addFloor, addSwingDoor, trackLight } from './helpers.js';

const WALL_INFLATE = 0.45;
const L1_WALK = 0;
const STEP_COUNT = 14;
const STAIR_RUN = 0.55;
const DOOR_W = 1.92;
const DOOR_TOP = 2.4;
const SIDE_DOOR_W = 1.62;
const L1_SILL = 0.92;
const L1_WIN_H = 1.18;
const L1_WIN_W = 1.66;
const L2_SILL = 0.62;
const L2_WIN_H = 1.22;
const L2_WIN_W = 1.58;

export function buildBuildings(ctx) {
  const root = new THREE.Group();
  root.name = 'CandyFactories';
  ctx.group.add(root);
  buildSweetCo(ctx, root);
  buildSugarWorks(ctx, root);
}

function buildSweetCo(ctx, root) {
  const spec = SWEET_CO;
  const house = makeHouseGroup(root, spec);
  const L2y = spec.floor2 + 0.1;
  const frontZ = spec.d / 2;
  const backZ = -spec.d / 2;
  const innerX = spec.w / 2;
  const outerX = -spec.w / 2;
  const sideZ = 4.2;
  const stair = { x: -8.75, w: 2.38, startZ: -7.55, run: STAIR_RUN };
  const overlook = { minX: -6.15, maxX: -1.05, minZ: 4.85, maxZ: 8.55 };

  addL1Floor(ctx, house, spec);
  buildEnvelope(ctx, house, spec, {
    frontZ,
    backZ,
    innerX,
    outerX,
    sideZ,
    l1Wins: [-8.15, -4.55, 4.55, 8.15],
    l2Wins: [-8.2, -4.7, 4.7, 8.2],
    backWins: [-7.6, -2.6, 2.6, 7.6],
    outerWins: [-6.2, 0.2, 6.2],
    glass: 0xb8d8ff,
    frame: 0xfff6f0,
  });
  addFrontDoor(ctx, house, spec, { frontZ, openYaw: -Math.PI / 2, name: 'door_front_sweet_co' });
  addSideDoor(ctx, house, spec, {
    innerX,
    sideZ,
    openYaw: -Math.PI / 2,
    name: 'door_side_sweet_co',
    outward: 1,
  });
  addDockDressing(house, spec, frontZ, 1, spec.accent);

  const holes = [
    addStairs(ctx, house, spec, stair, L2y),
    localHoleToWorld(spec, overlook),
  ];
  addL2Slabs(ctx, house, spec, L2y, holes, 0xf4c4d4);
  addHoleRails(ctx, house, spec, L2y, holes[0], 'z+');
  addHoleRails(ctx, house, spec, L2y, holes[1], null);
  addRoof(ctx, house, spec);

  addSplitPartition(ctx, house, spec, {
    along: 'z',
    pos: -1.35,
    min: -2.2,
    max: 9.35,
    y: 1.32,
    h: 2.55,
    gaps: [[3.85, 5.45]],
    color: 0xffd8e4,
    part: 'part_pack_hall',
  });
  addSplitPartition(ctx, house, spec, {
    along: 'z',
    pos: 5.85,
    min: -9.55,
    max: -3.45,
    y: 1.32,
    h: 2.55,
    gaps: [],
    color: 0xffc8d8,
    part: 'part_boiler_x',
  });
  addSplitPartition(ctx, house, spec, {
    along: 'x',
    pos: -3.45,
    min: 5.85,
    max: 11.45,
    y: 1.32,
    h: 2.55,
    gaps: [[7.15, 8.7]],
    color: 0xffc8d8,
    part: 'part_boiler_z',
  });
  addSplitPartition(ctx, house, spec, {
    along: 'z',
    pos: 2.05,
    min: -9.4,
    max: 9.4,
    y: L2y + 1.55,
    h: 2.85,
    gaps: [[0.55, 2.15]],
    color: 0xffe0ea,
    part: 'part_l2_office',
  });

  dressSweetCo(ctx, house, spec, L2y, frontZ);
  pushNav(ctx, spec, L2y, [
    { x: 1.2, z: 1.8, y: L1_WALK, kind: 'spawn' },
    { x: -4.0, z: 1.8, y: L1_WALK, kind: 'spawn' },
    { x: 6.9, z: 8.05, y: L2y, kind: 'spawn' },
    { x: 0.6, z: -7.2, y: L2y, kind: 'spawn' },
    { x: -5.4, z: 5.8, y: L1_WALK, kind: 'cover' },
    { x: -6.0, z: -5.2, y: L1_WALK, kind: 'cover' },
    { x: 8.4, z: -6.4, y: L1_WALK, kind: 'cover' },
    { x: 6.6, z: 5.2, y: L2y, kind: 'cover' },
    { x: 0.2, z: 6.4, y: L1_WALK, kind: 'way' },
    { x: -4.8, z: 1.2, y: L1_WALK, kind: 'way' },
    { x: -8.2, z: -6.8, y: L1_WALK, kind: 'way' },
    { x: 8.0, z: 4.0, y: L1_WALK, kind: 'way' },
    { x: 7.8, z: -6.2, y: L1_WALK, kind: 'way' },
    { x: -3.8, z: -5.5, y: L2y, kind: 'way' },
    { x: 5.5, z: 4.2, y: L2y, kind: 'way' },
    { x: 5.8, z: -4.8, y: L2y, kind: 'way' },
    { x: -7.4, z: 1.6, y: L2y, kind: 'way' },
  ]);
}

function buildSugarWorks(ctx, root) {
  const spec = SUGAR_WORKS;
  const house = makeHouseGroup(root, spec);
  const L2y = spec.floor2 + 0.1;
  const frontZ = -spec.d / 2;
  const backZ = spec.d / 2;
  const innerX = -spec.w / 2;
  const outerX = spec.w / 2;
  const sideZ = -4.15;
  const stair = { x: 8.55, w: 2.38, startZ: 7.45, run: -STAIR_RUN };

  addL1Floor(ctx, house, spec);
  buildEnvelope(ctx, house, spec, {
    frontZ,
    backZ,
    innerX,
    outerX,
    sideZ,
    l1Wins: [-8.1, -4.4, 4.4, 8.1],
    l2Wins: [-8.0, -3.2, 3.2, 8.0],
    backWins: [-6.8, 0, 6.8],
    outerWins: [-5.4, 2.4, 7.2],
    glass: 0xc8f8e8,
    frame: 0xfff8e8,
  });
  addFrontDoor(ctx, house, spec, { frontZ, openYaw: Math.PI / 2, name: 'door_front_sugar_works' });
  addSideDoor(ctx, house, spec, {
    innerX,
    sideZ,
    openYaw: Math.PI / 2,
    name: 'door_side_sugar_works',
    outward: -1,
  });
  addDockDressing(house, spec, frontZ, -1, spec.accent);

  const holes = [addStairs(ctx, house, spec, stair, L2y)];
  addL2Slabs(ctx, house, spec, L2y, holes, 0xffe8c4);
  addHoleRails(ctx, house, spec, L2y, holes[0], 'z-');
  addRoof(ctx, house, spec);

  addSplitPartition(ctx, house, spec, {
    along: 'z',
    pos: -2.55,
    min: -9.4,
    max: 2.6,
    y: 1.32,
    h: 2.55,
    gaps: [[-5.0, -3.35]],
    color: 0xd8f8ec,
    part: 'part_loading',
  });
  addSplitPartition(ctx, house, spec, {
    along: 'z',
    pos: 6.35,
    min: -9.5,
    max: -4.55,
    y: 1.32,
    h: 2.55,
    gaps: [[-8.35, -6.8]],
    color: 0xe8f8e0,
    part: 'part_locker_x',
  });
  addSplitPartition(ctx, house, spec, {
    along: 'x',
    pos: -4.55,
    min: 6.35,
    max: 11.4,
    y: 1.32,
    h: 2.55,
    gaps: [],
    color: 0xe8f8e0,
    part: 'part_locker_z',
  });
  addSplitPartition(ctx, house, spec, {
    along: 'x',
    pos: 1.15,
    min: -11.3,
    max: 6.35,
    y: L2y + 1.55,
    h: 2.85,
    gaps: [[-0.9, 0.8]],
    color: 0xe8fff4,
    part: 'part_l2_break',
  });

  dressSugarWorks(ctx, house, spec, L2y, frontZ);
  pushNav(ctx, spec, L2y, [
    { x: 0.6, z: 1.4, y: L1_WALK, kind: 'spawn' },
    { x: -5.5, z: -2.6, y: L1_WALK, kind: 'spawn' },
    { x: -3.8, z: -2.6, y: L2y, kind: 'spawn' },
    { x: 4.15, z: 7.55, y: L2y, kind: 'spawn' },
    { x: -7.2, z: -6.4, y: L1_WALK, kind: 'cover' },
    { x: -6.6, z: 0.4, y: L1_WALK, kind: 'cover' },
    { x: 8.6, z: -7.2, y: L1_WALK, kind: 'cover' },
    { x: -6.0, z: 5.0, y: L2y, kind: 'cover' },
    { x: 0.0, z: -6.2, y: L1_WALK, kind: 'way' },
    { x: -5.4, z: -4.2, y: L1_WALK, kind: 'way' },
    { x: 3.2, z: 2.4, y: L1_WALK, kind: 'way' },
    { x: 8.2, z: -7.0, y: L1_WALK, kind: 'way' },
    { x: 8.4, z: 6.6, y: L1_WALK, kind: 'way' },
    { x: -5.8, z: -4.8, y: L2y, kind: 'way' },
    { x: -4.6, z: 6.0, y: L2y, kind: 'way' },
    { x: 5.0, z: 5.6, y: L2y, kind: 'way' },
    { x: 5.4, z: -5.2, y: L2y, kind: 'way' },
  ]);
}

function makeHouseGroup(root, spec) {
  const house = new THREE.Group();
  house.name = spec.id;
  house.position.set(spec.cx, 0, spec.cz);
  root.add(house);
  return house;
}

function addL1Floor(ctx, house, spec) {
  const aabb = buildingAabb(spec);
  const inset = spec.wallT * 0.55;
  house.add(
    box(spec.w - spec.wallT, 0.08, spec.d - spec.wallT, 0xf2dcc8, 0, 0.04, 0, { kind: 'wood' })
  );
  addFloor(
    ctx.floors,
    aabb.minX + inset,
    aabb.maxX - inset,
    aabb.minZ + inset,
    aabb.maxZ - inset,
    L1_WALK
  );
}

function buildEnvelope(ctx, house, spec, opt) {
  const { w, d, wallT, height, facade, accent, floor2 } = spec;
  const L2y = floor2 + 0.1;
  const hx = w / 2;
  const hz = d / 2;
  const l1WinTop = L1_SILL + L1_WIN_H;
  const l2OpenY = L2y + L2_SILL + L2_WIN_H / 2;
  const l2HeaderY0 = L2y + L2_SILL + L2_WIN_H;

  const doorGap = [[-DOOR_W / 2, DOOR_W / 2]];
  const l1Gaps = [
    ...doorGap,
    ...opt.l1Wins.map((x) => [x - L1_WIN_W / 2, x + L1_WIN_W / 2]),
  ];
  const l2Gaps = opt.l2Wins.map((x) => [x - L2_WIN_W / 2, x + L2_WIN_W / 2]);
  const backL1Gaps = opt.backWins.map((x) => [x - L1_WIN_W / 2, x + L1_WIN_W / 2]);
  const backL2Gaps = opt.backWins.map((x) => [x - L2_WIN_W / 2, x + L2_WIN_W / 2]);
  const outerL1 = opt.outerWins.map((z) => [z - L1_WIN_W / 2, z + L1_WIN_W / 2]);
  const outerL2 = opt.outerWins.map((z) => [z - L2_WIN_W / 2, z + L2_WIN_W / 2]);

  addSplitBand(ctx, house, spec, {
    along: 'x',
    pos: opt.frontZ,
    y: L1_SILL / 2,
    h: L1_SILL,
    min: -hx,
    max: hx,
    gaps: doorGap,
    color: facade,
    part: 'front_sill',
  });
  addSplitBand(ctx, house, spec, {
    along: 'x',
    pos: opt.frontZ,
    y: L1_SILL + L1_WIN_H / 2,
    h: L1_WIN_H,
    min: -hx,
    max: hx,
    gaps: l1Gaps,
    color: facade,
    part: 'front_l1_piers',
  });
  addSplitBand(ctx, house, spec, {
    along: 'x',
    pos: opt.frontZ,
    y: (l1WinTop + DOOR_TOP) / 2,
    h: DOOR_TOP - l1WinTop,
    min: -hx,
    max: hx,
    gaps: doorGap,
    color: facade,
    part: 'front_door_head',
  });
  addSolidWall(
    ctx,
    house,
    spec,
    0,
    (DOOR_TOP + L2y) / 2,
    opt.frontZ,
    w,
    L2y - DOOR_TOP,
    wallT,
    'front_joist',
    accent
  );
  addSolidWall(
    ctx,
    house,
    spec,
    0,
    L2y + L2_SILL / 2,
    opt.frontZ,
    w,
    L2_SILL,
    wallT,
    'front_l2_sill',
    facade
  );
  addSplitBand(ctx, house, spec, {
    along: 'x',
    pos: opt.frontZ,
    y: l2OpenY,
    h: L2_WIN_H,
    min: -hx,
    max: hx,
    gaps: l2Gaps,
    color: facade,
    part: 'front_l2_piers',
  });
  addSolidWall(
    ctx,
    house,
    spec,
    0,
    (l2HeaderY0 + height) / 2,
    opt.frontZ,
    w,
    height - l2HeaderY0,
    wallT,
    'front_l2_header',
    facade
  );

  addSplitBand(ctx, house, spec, {
    along: 'x',
    pos: opt.backZ,
    y: L1_SILL / 2,
    h: L1_SILL,
    min: -hx,
    max: hx,
    gaps: [],
    color: facade,
    part: 'back_sill',
  });
  addSplitBand(ctx, house, spec, {
    along: 'x',
    pos: opt.backZ,
    y: L1_SILL + L1_WIN_H / 2,
    h: L1_WIN_H,
    min: -hx,
    max: hx,
    gaps: backL1Gaps,
    color: facade,
    part: 'back_l1_piers',
  });
  addSolidWall(
    ctx,
    house,
    spec,
    0,
    (l1WinTop + L2y) / 2,
    opt.backZ,
    w,
    L2y - l1WinTop,
    wallT,
    'back_joist',
    facade
  );
  addSolidWall(
    ctx,
    house,
    spec,
    0,
    L2y + L2_SILL / 2,
    opt.backZ,
    w,
    L2_SILL,
    wallT,
    'back_l2_sill',
    facade
  );
  addSplitBand(ctx, house, spec, {
    along: 'x',
    pos: opt.backZ,
    y: l2OpenY,
    h: L2_WIN_H,
    min: -hx,
    max: hx,
    gaps: backL2Gaps,
    color: facade,
    part: 'back_l2_piers',
  });
  addSolidWall(
    ctx,
    house,
    spec,
    0,
    (l2HeaderY0 + height) / 2,
    opt.backZ,
    w,
    height - l2HeaderY0,
    wallT,
    'back_l2_header',
    facade
  );

  const doorZ0 = opt.sideZ - SIDE_DOOR_W / 2;
  const doorZ1 = opt.sideZ + SIDE_DOOR_W / 2;
  addSplitBand(ctx, house, spec, {
    along: 'z',
    pos: opt.innerX,
    y: height / 2,
    h: height,
    min: -hz,
    max: hz,
    gaps: [[doorZ0, doorZ1]],
    color: facade,
    part: 'inner_side',
  });
  addSolidWall(
    ctx,
    house,
    spec,
    opt.innerX,
    (DOOR_TOP + height) / 2,
    opt.sideZ,
    wallT + 0.04,
    height - DOOR_TOP,
    SIDE_DOOR_W + 0.18,
    'side_lintel',
    accent
  );

  addSplitBand(ctx, house, spec, {
    along: 'z',
    pos: opt.outerX,
    y: L1_SILL / 2,
    h: L1_SILL,
    min: -hz,
    max: hz,
    gaps: [],
    color: facade,
    part: 'outer_sill',
  });
  addSplitBand(ctx, house, spec, {
    along: 'z',
    pos: opt.outerX,
    y: L1_SILL + L1_WIN_H / 2,
    h: L1_WIN_H,
    min: -hz,
    max: hz,
    gaps: outerL1,
    color: facade,
    part: 'outer_l1_piers',
  });
  addSolidWall(
    ctx,
    house,
    spec,
    opt.outerX,
    (l1WinTop + L2y) / 2,
    0,
    wallT,
    L2y - l1WinTop,
    d,
    'outer_joist',
    facade
  );
  addSolidWall(
    ctx,
    house,
    spec,
    opt.outerX,
    L2y + L2_SILL / 2,
    0,
    wallT,
    L2_SILL,
    d,
    'outer_l2_sill',
    facade
  );
  addSplitBand(ctx, house, spec, {
    along: 'z',
    pos: opt.outerX,
    y: l2OpenY,
    h: L2_WIN_H,
    min: -hz,
    max: hz,
    gaps: outerL2,
    color: facade,
    part: 'outer_l2_piers',
  });
  addSolidWall(
    ctx,
    house,
    spec,
    opt.outerX,
    (l2HeaderY0 + height) / 2,
    0,
    wallT,
    height - l2HeaderY0,
    d,
    'outer_l2_header',
    facade
  );

  const l1WinY = L1_SILL + L1_WIN_H / 2;
  for (const wx of opt.l1Wins) addWindow(house, wx, l1WinY, opt.frontZ, L1_WIN_W, L1_WIN_H, 'x', opt);
  for (const wx of opt.l2Wins) addWindow(house, wx, l2OpenY, opt.frontZ, L2_WIN_W, L2_WIN_H, 'x', opt);
  for (const wx of opt.backWins) {
    addWindow(house, wx, l1WinY, opt.backZ, L1_WIN_W, L1_WIN_H, 'x', opt);
    addWindow(house, wx, l2OpenY, opt.backZ, L2_WIN_W, L2_WIN_H, 'x', opt);
  }
  for (const wz of opt.outerWins) {
    addWindow(house, opt.outerX, l1WinY, wz, L1_WIN_W, L1_WIN_H, 'z', opt);
    addWindow(house, opt.outerX, l2OpenY, wz, L2_WIN_W, L2_WIN_H, 'z', opt);
  }

  for (const [lx, lz] of [
    [-hx, opt.frontZ],
    [hx, opt.frontZ],
    [-hx, opt.backZ],
    [hx, opt.backZ],
  ]) {
    house.add(rbox(0.38, height, 0.38, 0xfffaf5, lx, height / 2, lz));
    house.add(rbox(0.46, 0.14, 0.46, accent, lx, 0.2, lz));
  }
}

function addFrontDoor(ctx, house, spec, { frontZ, openYaw, name }) {
  const leafW = 1.62;
  const leafH = 2.28;
  const hingeOut = Math.sign(frontZ) * 0.06 || 0.06;
  addSwingDoor(ctx, {
    parent: house,
    name,
    houseTag: spec.id,
    kind: 'front',
    hingeLocal: { x: -leafW / 2, y: leafH / 2 + 0.06, z: frontZ + hingeOut },
    leafW,
    leafH,
    leafD: 0.11,
    openYaw,
    woodColor: 0xd4a574,
    accentColor: spec.accent,
    colX: spec.cx,
    colY: leafH / 2 + 0.06,
    colZ: spec.cz + frontZ,
    colW: DOOR_W - 0.16,
    colH: leafH,
    colD: spec.wallT + 0.35,
    interactX: spec.cx,
    interactZ: spec.cz + frontZ,
  });
}

function addSideDoor(ctx, house, spec, { innerX, sideZ, openYaw, name, outward }) {
  const leafW = 1.38;
  const leafH = 2.2;
  addSwingDoor(ctx, {
    parent: house,
    name,
    houseTag: spec.id,
    kind: 'side',
    hingeLocal: {
      x: innerX + outward * 0.06,
      y: leafH / 2 + 0.05,
      z: sideZ - leafW / 2,
    },
    leafW,
    leafH,
    leafD: 0.1,
    openYaw,
    woodColor: 0xc4956a,
    accentColor: spec.accent,
    colX: spec.cx + innerX,
    colY: leafH / 2 + 0.05,
    colZ: spec.cz + sideZ,
    colW: spec.wallT + 0.35,
    colH: leafH,
    colD: SIDE_DOOR_W - 0.12,
    interactX: spec.cx + innerX,
    interactZ: spec.cz + sideZ,
  });
}

function addDockDressing(house, spec, frontZ, dir, accent) {
  const z = frontZ + dir * 0.85;
  house.add(rbox(4.2, 0.14, 1.5, 0xfff4e8, 0, 0.08, z));
  house.add(rbox(0.18, 2.5, 0.18, 0xfffaf5, -1.7, 1.3, z + dir * 0.35));
  house.add(rbox(0.18, 2.5, 0.18, 0xfffaf5, 1.7, 1.3, z + dir * 0.35));
  house.add(rbox(4.4, 0.16, 1.6, accent, 0, 2.62, z + dir * 0.1));
  house.add(rbox(3.6, 0.7, 0.12, 0xfffaf5, 0, 3.55, frontZ + dir * 0.28));
}

function addStairs(ctx, house, spec, stair, L2y) {
  const stairs = new THREE.Group();
  stairs.name = `${spec.id}_stairs`;
  const rise = (L2y - L1_WALK) / STEP_COUNT;
  const endZ = stair.startZ + STEP_COUNT * stair.run;
  for (let i = 0; i < STEP_COUNT; i++) {
    const topY = L1_WALK + (i + 1) * rise;
    const z0 = stair.startZ + i * stair.run;
    const zMid = z0 + stair.run * 0.5;
    stairs.add(
      box(stair.w, Math.max(0.12, rise * 0.85), Math.abs(stair.run) + 0.06, 0xe8d5b7, stair.x, topY - rise * 0.4, zMid)
    );
    stairs.add(box(stair.w, rise, 0.08, 0xd4c4a8, stair.x, topY - rise * 0.5, z0 + Math.sign(stair.run) * 0.04));
    const zLo = Math.min(z0, z0 + stair.run);
    const zHi = Math.max(z0, z0 + stair.run);
    addFloor(
      ctx.floors,
      spec.cx + stair.x - stair.w / 2,
      spec.cx + stair.x + stair.w / 2,
      spec.cz + zLo - 0.06,
      spec.cz + zHi + 0.06,
      topY
    );
    const treadH = Math.max(0.36, rise + 0.16);
    addAabb(ctx.colliders, spec.cx + stair.x, topY - treadH * 0.5, spec.cz + zMid, stair.w * 0.92, treadH, Math.abs(stair.run) * 0.92, {
      kind: 'stair_tread',
      house: spec.id,
      chain: 'interior',
      step: i,
    });
  }
  const landLo = Math.min(endZ, endZ + Math.sign(stair.run) * 0.55);
  const landHi = Math.max(endZ, endZ + Math.sign(stair.run) * 0.55);
  addFloor(
    ctx.floors,
    spec.cx + stair.x - stair.w / 2,
    spec.cx + stair.x + stair.w / 2,
    spec.cz + landLo,
    spec.cz + landHi,
    L2y
  );
  const runLen = Math.abs(endZ - stair.startZ);
  stairs.add(
    box(0.08, 0.9, runLen, 0xfffaf5, stair.x + stair.w / 2 - 0.1, 1.45, (stair.startZ + endZ) / 2)
  );
  house.add(stairs);

  const zLo = Math.min(stair.startZ, endZ);
  const zHi = Math.max(stair.startZ, endZ);
  return {
    minX: spec.cx + stair.x - stair.w / 2 - 0.08,
    maxX: spec.cx + stair.x + stair.w / 2 + 0.08,
    minZ: spec.cz + zLo - 0.22,
    maxZ: spec.cz + zHi + 0.22,
  };
}

function localHoleToWorld(spec, hole) {
  return {
    minX: spec.cx + hole.minX,
    maxX: spec.cx + hole.maxX,
    minZ: spec.cz + hole.minZ,
    maxZ: spec.cz + hole.maxZ,
  };
}

function addL2Slabs(ctx, house, spec, L2y, holes, color) {
  const inset = spec.wallT * 0.45;
  const l2MinX = spec.cx - spec.w / 2 + inset;
  const l2MaxX = spec.cx + spec.w / 2 - inset;
  const l2MinZ = spec.cz - spec.d / 2 + inset;
  const l2MaxZ = spec.cz + spec.d / 2 - inset;
  const slabH = 0.28;
  const slabY = L2y - slabH / 2;
  for (const r of tessellate(l2MinX, l2MaxX, l2MinZ, l2MaxZ, holes)) {
    const w = r.maxX - r.minX;
    const d = r.maxZ - r.minZ;
    const lx = (r.minX + r.maxX) / 2 - spec.cx;
    const lz = (r.minZ + r.maxZ) / 2 - spec.cz;
    house.add(box(w, slabH, d, color, lx, slabY, lz, { kind: 'wood' }));
    house.add(box(w - 0.04, 0.04, d - 0.04, 0xf4eee6, lx, slabY - slabH / 2 - 0.02, lz, { kind: 'ceiling' }));
    addFloor(ctx.floors, r.minX, r.maxX, r.minZ, r.maxZ, L2y);
    addAabb(ctx.colliders, spec.cx + lx, slabY, spec.cz + lz, w, slabH, d, {
      kind: 'house_floor',
      house: spec.id,
      part: 'l2_floor',
      blocksShot: true,
    });
  }
}

function tessellate(minX, maxX, minZ, maxZ, holes) {
  const xs = [minX, maxX];
  const zs = [minZ, maxZ];
  for (const h of holes) {
    xs.push(h.minX, h.maxX);
    zs.push(h.minZ, h.maxZ);
  }
  xs.sort((a, b) => a - b);
  zs.sort((a, b) => a - b);
  const rects = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const a = xs[i];
      const b = xs[i + 1];
      const c = zs[j];
      const d = zs[j + 1];
      if (b - a < 0.08 || d - c < 0.08) continue;
      const mx = (a + b) / 2;
      const mz = (c + d) / 2;
      if (holes.some((h) => mx > h.minX && mx < h.maxX && mz > h.minZ && mz < h.maxZ)) continue;
      rects.push({ minX: a, maxX: b, minZ: c, maxZ: d });
    }
  }
  return rects;
}

function addHoleRails(ctx, house, spec, L2y, hole, openSide) {
  const t = 0.12;
  const h = 0.82;
  const y = L2y + h / 2;
  const lx0 = hole.minX - spec.cx;
  const lx1 = hole.maxX - spec.cx;
  const lz0 = hole.minZ - spec.cz;
  const lz1 = hole.maxZ - spec.cz;
  const mx = (lx0 + lx1) / 2;
  const mz = (lz0 + lz1) / 2;
  const ww = lx1 - lx0;
  const dd = lz1 - lz0;
  const segs = [
    { lx: mx, lz: lz0, w: ww + t, d: t, skip: openSide === 'z-' },
    { lx: mx, lz: lz1, w: ww + t, d: t, skip: openSide === 'z+' },
    { lx: lx0, lz: mz, w: t, d: dd, skip: false },
    { lx: lx1, lz: mz, w: t, d: dd, skip: false },
  ];
  for (const s of segs) {
    if (s.skip) continue;
    house.add(rbox(s.w, h, s.d, 0xfffaf5, s.lx, y, s.lz));
    addAabb(ctx.colliders, spec.cx + s.lx, y, spec.cz + s.lz, s.w, h, s.d, {
      kind: 'house_furniture',
      house: spec.id,
      part: 'stair_rail',
    });
  }
}

function addRoof(ctx, house, spec) {
  house.add(rbox(spec.w + 0.9, 0.38, spec.d + 0.9, spec.accent, 0, spec.height + 0.12, 0));
  house.add(rbox(spec.w + 1.1, 0.12, spec.d + 1.1, 0xfff0c8, 0, spec.height - 0.08, 0));
  addAabb(ctx.colliders, spec.cx, spec.height + 0.12, spec.cz, spec.w + 0.9, 0.38, spec.d + 0.9, {
    kind: 'house_wall',
    house: spec.id,
    part: 'roof',
  });
}

function addSplitPartition(ctx, house, spec, opt) {
  addSplitBand(ctx, house, spec, {
    along: opt.along === 'z' ? 'z' : 'x',
    pos: opt.pos,
    y: opt.y,
    h: opt.h,
    min: opt.min,
    max: opt.max,
    gaps: opt.gaps,
    color: opt.color,
    part: opt.part,
    thin: 0.3,
  });
}

function addSplitBand(ctx, house, spec, opt) {
  const gaps = [...(opt.gaps || [])].sort((a, b) => a[0] - b[0]);
  let cursor = opt.min;
  let i = 0;
  const flush = (a, b) => {
    if (b - a < 0.12) return;
    const mid = (a + b) / 2;
    const len = b - a;
    const thin = opt.thin ?? spec.wallT;
    if (opt.along === 'x') {
      addSolidWall(ctx, house, spec, mid, opt.y, opt.pos, len, opt.h, thin, `${opt.part}_${i++}`, opt.color);
    } else {
      addSolidWall(ctx, house, spec, opt.pos, opt.y, mid, thin, opt.h, len, `${opt.part}_${i++}`, opt.color);
    }
  };
  for (const [g0, g1] of gaps) {
    flush(cursor, g0);
    cursor = Math.max(cursor, g1);
  }
  flush(cursor, opt.max);
}

function addSolidWall(ctx, house, spec, lx, y, lz, w, h, d, part, color) {
  if (w < 0.08 || h < 0.08 || d < 0.08) return;
  const mesh = rbox(w, h, d, color, lx, y, lz);
  mesh.name = `${spec.id}_${part}`;
  house.add(mesh);
  // Inflate thickness only — never the wall run, or short jambs eat the door hole.
  let cw = w;
  let cd = d;
  if (w + 1e-6 < d) cw = w + WALL_INFLATE;
  else if (d + 1e-6 < w) cd = d + WALL_INFLATE;
  addAabb(ctx.colliders, spec.cx + lx, y, spec.cz + lz, cw, h, cd, {
    kind: 'house_wall',
    house: spec.id,
    part,
  });
}

function addWindow(house, x, y, z, openW, openH, along, opt) {
  const t = 0.08;
  const depth = 0.14;
  const frame = opt.frame;
  if (along === 'x') {
    house.add(rbox(t, openH + t * 2, depth, frame, x - openW / 2, y, z));
    house.add(rbox(t, openH + t * 2, depth, frame, x + openW / 2, y, z));
    house.add(rbox(openW + t, t, depth, frame, x, y + openH / 2, z));
    house.add(rbox(openW + t, t, depth, frame, x, y - openH / 2, z));
    house.add(box(openW - t * 0.5, openH - t * 0.5, 0.04, opt.glass, x, y, z, { kind: 'glass' }));
    house.add(rbox(0.04, openH - 0.12, 0.05, frame, x, y, z));
    house.add(rbox(openW - 0.16, 0.04, 0.05, frame, x, y, z));
  } else {
    house.add(rbox(depth, openH + t * 2, t, frame, x, y, z - openW / 2));
    house.add(rbox(depth, openH + t * 2, t, frame, x, y, z + openW / 2));
    house.add(rbox(depth, t, openW, frame, x, y + openH / 2, z));
    house.add(rbox(depth, t, openW, frame, x, y - openH / 2, z));
    house.add(box(0.04, openH - t * 0.5, openW - t * 0.5, opt.glass, x, y, z, { kind: 'glass' }));
  }
}

function placeSolid(ctx, interior, spec, name, lx, y, lz, w, h, d, color, opts = {}) {
  const mesh = rbox(w, h, d, color, lx, y, lz, opts);
  mesh.name = name;
  interior.add(mesh);
  addAabb(ctx.colliders, spec.cx + lx, y, spec.cz + lz, w * 0.92, Math.max(h, 0.36), d * 0.92, {
    kind: 'house_furniture',
    house: spec.id,
    part: name,
  });
  return mesh;
}

function placeDecor(interior, name, lx, y, lz, w, h, d, color, opts = {}) {
  const mesh = rbox(w, h, d, color, lx, y, lz, opts);
  mesh.name = name;
  interior.add(mesh);
  return mesh;
}

function addLamp(ctx, interior, x, y, z, color) {
  placeDecor(interior, 'lamp_pole', x, y - 0.55, z, 0.08, 1.15, 0.08, 0xe8dcc8);
  placeDecor(interior, 'lamp_shade', x, y + 0.12, z, 0.42, 0.24, 0.42, color, {
    emissive: color,
    emissiveIntensity: 0.28,
  });
  // r185 PointLight is candela — 0.38 reads as unlit indoors.
  const light = new THREE.PointLight(color, 22, 14, 2);
  light.position.set(x, y, z);
  interior.add(light);
  trackLight(ctx, light, 10);
}

function dressSweetCo(ctx, house, spec, L2y, frontZ) {
  const interior = new THREE.Group();
  interior.name = 'interior_sweet_co';
  const berry = spec.accent;
  const cream = 0xfff4ec;
  const wood = 0xd4a574;

  placeDecor(interior, 'rug_recept', 3.1, 0.24, 6.1, 4.2, 0.03, 3.4, 0xffc0d4, { kind: 'wood' });
  placeSolid(ctx, interior, spec, 'desk_recept', 3.15, 0.48, 6.35, 2.35, 0.72, 0.78, wood, { kind: 'wood' });
  placeDecor(interior, 'desk_top', 3.15, 0.86, 6.35, 2.45, 0.08, 0.84, 0xe8c9a0, { kind: 'wood' });
  placeDecor(interior, 'desk_monitor', 3.15, 1.12, 6.55, 0.7, 0.42, 0.08, 0x6ec8f0, {
    emissive: 0x3a80a8,
    emissiveIntensity: 0.18,
  });
  placeSolid(ctx, interior, spec, 'chair_recept', 3.15, 0.4, 5.35, 0.48, 0.55, 0.48, berry);
  placeDecor(interior, 'chair_recept_back', 3.15, 0.78, 5.12, 0.46, 0.42, 0.1, berry);
  placeSolid(ctx, interior, spec, 'crate_a', -5.55, 0.42, 5.85, 1.15, 0.7, 1.05, 0xffb0c8);
  placeSolid(ctx, interior, spec, 'crate_b', -5.55, 1.05, 5.85, 0.95, 0.55, 0.88, 0xff9eb8);
  placeSolid(ctx, interior, spec, 'crate_c', -6.05, 0.4, -5.15, 1.2, 0.65, 1.1, 0xf0a8c0);
  placeSolid(ctx, interior, spec, 'crate_d', -3.55, 0.38, -6.35, 1.05, 0.6, 0.95, 0xffc4d8);
  placeSolid(ctx, interior, spec, 'vat_a', -5.85, 0.95, 7.55, 1.35, 1.75, 1.35, 0xff8fab);
  placeDecor(interior, 'vat_a_rim', -5.85, 1.85, 7.55, 1.42, 0.1, 1.42, 0xfff0f6);
  placeSolid(ctx, interior, spec, 'vat_b', -3.95, 0.85, 7.65, 1.15, 1.55, 1.15, 0xffb6c8);
  placeSolid(ctx, interior, spec, 'boiler', 8.55, 0.95, -6.55, 1.7, 1.75, 1.55, 0xc9a0e8);
  placeDecor(interior, 'boiler_pipe', 8.55, 2.05, -6.55, 0.22, 0.55, 0.22, 0xe8d0f8);
  placeSolid(ctx, interior, spec, 'boiler_crate', 7.15, 0.4, -7.85, 0.9, 0.65, 0.85, 0xe8b070, { kind: 'wood' });
  placeSolid(ctx, interior, spec, 'shelf_pack', -11.22, 0.95, 2.4, 0.42, 1.7, 2.4, wood, { kind: 'wood' });
  placeDecor(interior, 'jar_a', -11.22, 1.55, 1.7, 0.18, 0.22, 0.18, berry);
  placeDecor(interior, 'jar_b', -11.22, 1.52, 2.3, 0.16, 0.2, 0.16, 0xffe066);
  addLamp(ctx, interior, 4.6, 1.85, 7.4, 0xffe8c8);
  addLamp(ctx, interior, -4.2, 1.85, -3.2, 0xffd0e0);
  placeDecor(interior, 'sign_sweet', 0, 2.9, frontZ - 0.28, 3.4, 0.55, 0.08, berry);
  placeDecor(interior, 'art_recept', 8.6, 1.65, 8.8, 0.08, 0.7, 1.1, 0xff8fab);

  placeSolid(ctx, interior, spec, 'desk_office_a', 6.35, L2y + 0.42, 5.15, 1.55, 0.55, 0.72, 0xffdab9, { kind: 'wood' });
  placeDecor(interior, 'desk_office_top', 6.35, L2y + 0.72, 5.15, 1.62, 0.06, 0.78, 0xf0c9a0, { kind: 'wood' });
  placeDecor(interior, 'laptop', 6.35, L2y + 0.84, 5.15, 0.42, 0.04, 0.28, 0x4a3f55);
  placeSolid(ctx, interior, spec, 'chair_office', 6.35, L2y + 0.38, 4.15, 0.42, 0.5, 0.42, berry);
  placeSolid(ctx, interior, spec, 'desk_office_b', 7.15, L2y + 0.42, -3.55, 1.35, 0.55, 0.65, wood, { kind: 'wood' });
  placeSolid(ctx, interior, spec, 'cab_office', 9.55, L2y + 0.7, 6.4, 0.55, 1.15, 1.4, cream);
  placeSolid(ctx, interior, spec, 'lab_bench', -5.25, L2y + 0.48, -6.15, 2.5, 0.7, 0.85, 0xffe0ea);
  placeDecor(interior, 'lab_top', -5.25, L2y + 0.86, -6.15, 2.58, 0.08, 0.9, 0xfff8f4);
  placeDecor(interior, 'beaker_a', -5.9, L2y + 1.05, -6.15, 0.16, 0.28, 0.16, 0xff8fab);
  placeDecor(interior, 'beaker_b', -4.6, L2y + 1.02, -6.2, 0.14, 0.22, 0.14, 0x7ee8d4);
  placeSolid(ctx, interior, spec, 'lab_stool', -5.25, L2y + 0.38, -5.15, 0.4, 0.5, 0.4, 0xc5b4e3);
  placeSolid(ctx, interior, spec, 'lab_cabinet', -5.85, L2y + 0.75, -8.65, 1.5, 1.2, 0.5, 0xffd0dc);
  addLamp(ctx, interior, 5.4, L2y + 1.7, 6.2, 0xfff0d0);
  addLamp(ctx, interior, -4.8, L2y + 1.7, -4.8, 0xffe0f0);
  placeDecor(interior, 'overlook_plant', -0.35, L2y + 0.35, 6.4, 0.32, 0.4, 0.32, wood, { kind: 'wood' });
  placeDecor(interior, 'overlook_leaf', -0.35, L2y + 0.7, 6.4, 0.45, 0.35, 0.45, 0x6ee7b7);
  placeDecor(interior, 'wainscot_back', 0, 0.55, -spec.d / 2 + 0.22, spec.w - 1.4, 0.12, 0.06, berry);
  placeDecor(interior, 'wainscot_pack', -spec.w / 2 + 0.22, 0.55, 0.4, 0.06, 0.12, spec.d - 3.2, 0xffb3c9);
  placeDecor(interior, 'candy_bowl', 4.4, 0.95, 6.9, 0.28, 0.12, 0.28, 0xffe066);
  placeDecor(interior, 'candy_scoop', 4.55, 1.04, 6.9, 0.08, 0.08, 0.18, 0xfffaf0);
  placeDecor(interior, 'stripe_l2', 0.4, L2y + 1.15, spec.d / 2 - 0.22, 6.2, 0.1, 0.05, berry);
  house.add(interior);
}

function dressSugarWorks(ctx, house, spec, L2y, frontZ) {
  const interior = new THREE.Group();
  interior.name = 'interior_sugar_works';
  const mint = spec.accent;
  const cream = spec.facade;
  const wood = 0xe0b888;

  placeDecor(interior, 'rug_wrap', 1.2, 0.24, -1.4, 5.5, 0.03, 4.2, 0xd8f8e8);
  placeSolid(ctx, interior, spec, 'wrap_table', 1.15, 0.46, -2.05, 3.4, 0.7, 1.15, wood, { kind: 'wood' });
  placeDecor(interior, 'wrap_top', 1.15, 0.84, -2.05, 3.5, 0.08, 1.22, 0xfff4d8, { kind: 'wood' });
  placeDecor(interior, 'wrap_roll', 0.2, 1.02, -2.05, 0.55, 0.28, 0.55, 0xfffaf0);
  placeDecor(interior, 'wrap_box', 2.1, 1.0, -1.95, 0.45, 0.22, 0.4, mint);
  placeSolid(ctx, interior, spec, 'wrap_stool_a', 0.15, 0.4, -0.85, 0.42, 0.55, 0.42, mint);
  placeSolid(ctx, interior, spec, 'wrap_stool_b', 2.15, 0.4, -3.15, 0.42, 0.55, 0.42, 0xa0e8d0);
  placeSolid(ctx, interior, spec, 'pallet_a', -7.15, 0.38, -6.45, 1.45, 0.58, 1.25, 0xe8c090, { kind: 'wood' });
  placeSolid(ctx, interior, spec, 'pallet_b', -7.15, 0.92, -6.45, 1.2, 0.5, 1.05, cream);
  placeSolid(ctx, interior, spec, 'pallet_c', -6.55, 0.4, 0.35, 1.35, 0.62, 1.15, 0xd4b070, { kind: 'wood' });
  placeSolid(ctx, interior, spec, 'mint_vat_a', -7.35, 1.05, 5.35, 1.45, 1.95, 1.45, mint);
  placeDecor(interior, 'mint_vat_rim', -7.35, 2.05, 5.35, 1.52, 0.1, 1.52, 0xf0fff8);
  placeSolid(ctx, interior, spec, 'mint_vat_b', -5.15, 0.9, 5.55, 1.2, 1.65, 1.2, 0xa8f0dc);
  placeSolid(ctx, interior, spec, 'locker_a', 8.85, 0.95, -7.15, 1.55, 1.75, 0.55, 0xc8e8d8);
  placeSolid(ctx, interior, spec, 'locker_b', 10.15, 0.95, -6.15, 0.55, 1.75, 1.55, 0xb8e0d0);
  placeDecor(interior, 'locker_door', 8.85, 0.95, -6.88, 1.35, 1.55, 0.05, 0xe8fff4);
  placeSolid(ctx, interior, spec, 'bench_locker', 8.05, 0.38, -7.85, 1.2, 0.5, 0.42, wood, { kind: 'wood' });
  placeSolid(ctx, interior, spec, 'conveyor', 3.55, 0.42, 4.25, 2.6, 0.62, 0.7, 0xd0d6de);
  placeDecor(interior, 'conveyor_box_a', 2.7, 0.85, 4.25, 0.4, 0.28, 0.4, 0xffe066);
  placeDecor(interior, 'conveyor_box_b', 4.2, 0.85, 4.25, 0.4, 0.28, 0.4, mint);
  addLamp(ctx, interior, 1.2, 1.9, -2.0, 0xfff6d8);
  addLamp(ctx, interior, -6.4, 1.9, -5.2, 0xe8fff4);
  placeDecor(interior, 'sign_sugar', 0, 2.9, frontZ + 0.28, 3.8, 0.55, 0.08, mint);
  placeDecor(interior, 'poster', -9.7, 1.6, 1.4, 0.08, 0.7, 1.0, 0x7ee8d4);

  placeSolid(ctx, interior, spec, 'sofa_break', -6.15, L2y + 0.4, -5.55, 2.15, 0.55, 0.78, mint);
  placeDecor(interior, 'sofa_back', -6.15, L2y + 0.78, -5.95, 2.1, 0.5, 0.14, 0x5ed4c0);
  placeSolid(ctx, interior, spec, 'coffee_break', -6.15, L2y + 0.36, -4.25, 0.95, 0.48, 0.55, wood, { kind: 'wood' });
  placeSolid(ctx, interior, spec, 'snack_bar', -9.35, L2y + 0.5, -2.15, 0.7, 0.85, 2.1, cream);
  placeDecor(interior, 'snack_top', -9.35, L2y + 0.94, -2.15, 0.76, 0.08, 2.16, 0xfff8e0);
  placeSolid(ctx, interior, spec, 'mgr_desk', 6.25, L2y + 0.42, 6.05, 1.7, 0.55, 0.8, 0xe8c9a0, { kind: 'wood' });
  placeDecor(interior, 'mgr_lamp', 6.85, L2y + 0.85, 6.05, 0.18, 0.28, 0.18, 0xfff6e8, {
    emissive: 0xffe8b0,
    emissiveIntensity: 0.25,
  });
  placeSolid(ctx, interior, spec, 'mgr_chair', 6.25, L2y + 0.38, 5.05, 0.45, 0.5, 0.45, 0xc9a0e8);
  placeSolid(ctx, interior, spec, 'meet_table', 4.35, L2y + 0.42, -5.25, 1.6, 0.55, 1.05, wood, { kind: 'wood' });
  placeSolid(ctx, interior, spec, 'meet_chair_a', 4.35, L2y + 0.38, -4.15, 0.4, 0.5, 0.4, mint);
  placeSolid(ctx, interior, spec, 'meet_chair_b', 4.35, L2y + 0.38, -6.25, 0.4, 0.5, 0.4, mint);
  placeSolid(ctx, interior, spec, 'file_cab', 9.55, L2y + 0.7, 7.15, 0.55, 1.15, 0.9, 0xe8f0d8);
  addLamp(ctx, interior, -6.0, L2y + 1.7, -5.2, 0xf0fff8);
  addLamp(ctx, interior, 5.6, L2y + 1.7, 6.4, 0xfff0d0);
  placeDecor(interior, 'wainscot_back', 0, 0.55, spec.d / 2 - 0.22, spec.w - 1.4, 0.12, 0.06, mint);
  placeDecor(interior, 'wainscot_load', -spec.w / 2 + 0.22, 0.55, 0.2, 0.06, 0.12, spec.d - 3.4, 0xa8f0dc);
  placeDecor(interior, 'mint_bowl', 2.55, 1.0, -1.85, 0.26, 0.12, 0.26, mint);
  placeDecor(interior, 'stripe_l2', -1.2, L2y + 1.15, -spec.d / 2 + 0.22, 5.8, 0.1, 0.05, mint);
  house.add(interior);
}

function pushNav(ctx, spec, L2y, items) {
  for (const p of items) {
    const x = spec.cx + p.x;
    const z = spec.cz + p.z;
    if (p.kind === 'spawn') {
      ctx.spawnPoints.push(new THREE.Vector3(x, 1.7 + p.y, z));
    } else if (p.kind === 'cover') {
      ctx.coverPoints.push(new THREE.Vector3(x, 0, z));
    } else {
      ctx.waypoints.push(new THREE.Vector3(x, p.y + 0.05, z));
    }
  }
}
