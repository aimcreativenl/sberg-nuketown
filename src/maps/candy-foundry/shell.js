/**
 * Hangar envelope, factory floor, ceiling, window walls, syrup canals (visual + slowZones).
 * Do not place buildings, bridges, or furniture — those are buildings.js / yard.js.
 */
import * as THREE from 'three';
import { PASTEL } from '../../game/materials.js';
import {
  CANDY_CEILING,
  CANDY_GROUND,
  CANDY_MAP_WALL,
  CANALS,
  FOUNTAIN,
} from './layout.js';
import { addAabb, addFloor, box, rbox } from './helpers.js';
import { createSyrupFlow } from './syrupFlow.js';

const WALL_COL = PASTEL.wall;
const FLOOR_COL = 0xf4e4d4;
const UNDERLAY_COL = 0xe0c4b4;
const FRAME_COL = 0xfffaf5;
const ARCH_COL = PASTEL.peach;
const TRIM_COL = 0xfff6ee;
const SKIRT_COL = 0xd8d0e8;

const WALL_T = 1.15;
const SILL_H = 6.6;
const OPEN_H = 4.8;
const WIN_COUNT = 9;
const WIN_W = 10;
const GLASS_H = 0.28; // < 0.35 so Player / bots ignore glass colliders

function punchRect(pieces, hole) {
  const next = [];
  for (const r of pieces) {
    const hx0 = Math.max(r.minX, hole.minX);
    const hx1 = Math.min(r.maxX, hole.maxX);
    const hz0 = Math.max(r.minZ, hole.minZ);
    const hz1 = Math.min(r.maxZ, hole.maxZ);
    if (hx0 >= hx1 - 1e-6 || hz0 >= hz1 - 1e-6) {
      next.push(r);
      continue;
    }
    if (r.minX < hx0 - 1e-6) next.push({ minX: r.minX, maxX: hx0, minZ: r.minZ, maxZ: r.maxZ });
    if (r.maxX > hx1 + 1e-6) next.push({ minX: hx1, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ });
    if (r.minZ < hz0 - 1e-6) next.push({ minX: hx0, maxX: hx1, minZ: r.minZ, maxZ: hz0 });
    if (r.maxZ > hz1 + 1e-6) next.push({ minX: hx0, maxX: hx1, minZ: hz1, maxZ: r.maxZ });
  }
  return next;
}

function islandHole() {
  const r = FOUNTAIN.island;
  return {
    minX: FOUNTAIN.x - r,
    maxX: FOUNTAIN.x + r,
    minZ: FOUNTAIN.z - r,
    maxZ: FOUNTAIN.z + r,
  };
}

function canalAabb(canal) {
  return { minX: canal.minX, maxX: canal.maxX, minZ: canal.minZ, maxZ: canal.maxZ };
}

/**
 * Canal AABBs: fountain island punched out, and the NS chocolate spine owns
 * crossings so two transparent (or even opaque) syrup slabs never share a plane.
 */
function canalWaterRects() {
  const hole = islandHole();
  const chocolate = CANALS.find((c) => c.id === 'chocolate');
  const out = [];
  for (const canal of CANALS) {
    let pieces = [canalAabb(canal)];
    pieces = punchRect(pieces, hole);
    if (chocolate && canal.id !== 'chocolate') {
      pieces = punchRect(pieces, canalAabb(chocolate));
    }
    for (const p of pieces) {
      if (p.maxX - p.minX < 0.4 || p.maxZ - p.minZ < 0.4) continue;
      out.push({
        id: canal.id,
        minX: p.minX,
        maxX: p.maxX,
        minZ: p.minZ,
        maxZ: p.maxZ,
        rimMinX: canal.minX,
        rimMaxX: canal.maxX,
        rimMinZ: canal.minZ,
        rimMaxZ: canal.maxZ,
        yMin: canal.yMin,
        yMax: canal.yMax,
        speedMul: canal.speedMul,
        color: canal.color,
      });
    }
  }
  return out;
}

function inCanalCenter(x, z) {
  for (const c of CANALS) {
    const cx = (c.minX + c.maxX) / 2;
    const cz = (c.minZ + c.maxZ) / 2;
    const hx = (c.maxX - c.minX) * 0.45;
    const hz = (c.maxZ - c.minZ) * 0.45;
    if (Math.abs(x - cx) < hx && Math.abs(z - cz) < hz) return true;
  }
  return false;
}

function wallXYZ(along, wallPos, alongCoord, thick, len) {
  if (along === 'x') return { x: alongCoord, z: wallPos, w: len, d: thick };
  return { x: wallPos, z: alongCoord, w: thick, d: len };
}

function addWindow(ctx, spec) {
  const { group, colliders } = ctx;
  const { along, sign, wallPos, alongCoord, openY, winW, name } = spec;
  const inset = 0.28;
  const glassOff = -sign * inset;
  const frameOff = -sign * (inset * 0.55);
  const archOff = -sign * (WALL_T * 0.42);

  const pane = wallXYZ(along, wallPos + glassOff, alongCoord, 0.08, winW - 0.45);
  const glass = box(pane.w, OPEN_H - 0.4, pane.d, PASTEL.window, pane.x, openY, pane.z, {
    kind: 'glass',
    castShadow: false,
    name: `${name}_glass`,
  });
  glass.renderOrder = 2;
  group.add(glass);
  // Horizontal strip collider — Y extent < 0.35 so the body filter skips it
  addAabb(colliders, pane.x, openY, pane.z, pane.w, GLASS_H, pane.d, {
    kind: 'hangar_glass',
    solid: true,
    part: name,
  });

  const t = 0.12;
  const depth = 0.16;
  const frameYTop = openY + OPEN_H / 2 - t / 2;
  const frameYBot = openY - OPEN_H / 2 + t / 2;
  const frameC = wallXYZ(along, wallPos + frameOff, alongCoord, depth, winW);
  const sideL = wallXYZ(along, wallPos + frameOff, alongCoord - winW / 2 + t / 2, depth, t);
  const sideR = wallXYZ(along, wallPos + frameOff, alongCoord + winW / 2 - t / 2, depth, t);
  group.add(rbox(frameC.w, t, frameC.d, FRAME_COL, frameC.x, frameYTop, frameC.z, { radius: 0.04, name: `${name}_frame` }));
  group.add(rbox(frameC.w, t, frameC.d, FRAME_COL, frameC.x, frameYBot, frameC.z, { radius: 0.04 }));
  group.add(rbox(sideL.w, OPEN_H, sideL.d, FRAME_COL, sideL.x, openY, sideL.z, { radius: 0.04 }));
  group.add(rbox(sideR.w, OPEN_H, sideR.d, FRAME_COL, sideR.x, openY, sideR.z, { radius: 0.04 }));

  const muntV = wallXYZ(along, wallPos + frameOff, alongCoord, 0.05, 0.06);
  const muntH = wallXYZ(along, wallPos + frameOff, alongCoord, 0.05, winW - 0.5);
  group.add(rbox(muntV.w, OPEN_H - 0.5, muntV.d, FRAME_COL, muntV.x, openY, muntV.z, { radius: 0.03 }));
  group.add(rbox(muntH.w, 0.06, muntH.d, FRAME_COL, muntH.x, openY, muntH.z, { radius: 0.03 }));

  const archY = openY + OPEN_H / 2 - 0.12;
  const archMid = wallXYZ(along, wallPos + archOff, alongCoord, 0.48, winW * 0.52);
  const archL = wallXYZ(along, wallPos + archOff, alongCoord - winW * 0.3, 0.4, winW * 0.28);
  const archR = wallXYZ(along, wallPos + archOff, alongCoord + winW * 0.3, 0.4, winW * 0.28);
  group.add(rbox(archMid.w, 0.7, archMid.d, ARCH_COL, archMid.x, archY, archMid.z, { radius: 0.1, name: `${name}_arch` }));
  group.add(rbox(archL.w, 0.4, archL.d, ARCH_COL, archL.x, archY - 0.18, archL.z, { radius: 0.08 }));
  group.add(rbox(archR.w, 0.4, archR.d, ARCH_COL, archR.x, archY - 0.18, archR.z, { radius: 0.08 }));
}

function buildHangarWall(ctx, { along, sign, name }) {
  const { group, colliders } = ctx;
  const wall = CANDY_MAP_WALL;
  const span = wall * 2;
  const T = WALL_T;
  const headerH = CANDY_CEILING - SILL_H - OPEN_H;
  const wallPos = sign * wall;
  const nPier = WIN_COUNT + 1;
  const pierW = (span - WIN_COUNT * WIN_W) / nPier;
  const openY = SILL_H + OPEN_H / 2;

  const put = (len, h, alongCoord, y, color, opts, meta) => {
    const p = wallXYZ(along, wallPos, alongCoord, T, len);
    const mesh = rbox(p.w, h, p.d, color, p.x, y, p.z, opts);
    group.add(mesh);
    if (meta) addAabb(colliders, p.x, y, p.z, p.w, h, p.d, meta);
    return mesh;
  };

  put(span + T, SILL_H, 0, SILL_H / 2, WALL_COL, { name: `${name}_sill`, radius: 0.1 }, {
    kind: 'hangar_wall',
    part: `${name}_sill`,
  });
  put(span + T, headerH, 0, SILL_H + OPEN_H + headerH / 2, WALL_COL, { name: `${name}_header`, radius: 0.1 }, {
    kind: 'hangar_wall',
    part: `${name}_header`,
  });

  put(span + T, 0.22, 0, 0.12, SKIRT_COL, { name: `${name}_skirt`, radius: 0.06 }, null);
  put(span + T, 0.18, 0, CANDY_CEILING + 0.06, TRIM_COL, { name: `${name}_cap`, radius: 0.05 }, null);

  let cursor = -span / 2;
  for (let i = 0; i < nPier; i++) {
    const px = cursor + pierW / 2;
    put(pierW, OPEN_H, px, openY, WALL_COL, { name: `${name}_pier_${i}`, radius: 0.08 }, {
      kind: 'hangar_wall',
      part: `${name}_pier_${i}`,
    });
    cursor += pierW;
    if (i < WIN_COUNT) {
      const wx = cursor + WIN_W / 2;
      addWindow(ctx, {
        along,
        sign,
        wallPos,
        alongCoord: wx,
        openY,
        winW: WIN_W,
        name: `${name}_win_${i}`,
      });
      cursor += WIN_W;
    }
  }
}

function addCanalVisual(ctx, zone) {
  const { group } = ctx;
  const w = zone.maxX - zone.minX;
  const d = zone.maxZ - zone.minZ;
  const cx = (zone.minX + zone.maxX) / 2;
  const cz = (zone.minZ + zone.maxZ) / 2;
  const inset = 0.18;
  const bw = Math.max(0.2, w - inset * 2);
  const bd = Math.max(0.2, d - inset * 2);
  group.add(
    box(bw, 0.16, bd, zone.color, cx, -0.15, cz, {
      roughness: 0.55,
      metalness: 0.04,
      emissive: zone.color,
      emissiveIntensity: 0.06,
      castShadow: false,
      receiveShadow: false,
      name: `canal_${zone.id}`,
    })
  );
  // Chocolate is the NS spine; berry / lemon run east–west.
  const alongX = zone.id !== 'chocolate';
  const flow = createSyrupFlow({
    color: zone.color,
    alongX,
    width: bw,
    depth: bd,
    x: cx,
    y: -0.062,
    z: cz,
    name: `canal_flow_${zone.id}`,
  });
  group.add(flow.mesh);
  ctx.syrupFlows.push(flow);
  const lipH = 0.16;
  const lipW = 0.42;
  const lipY = 0.07;
  const lighter = zone.color;
  const onRim = (a, b) => Math.abs(a - b) < 0.06;
  const lipOpts = { radius: 0.05, roughness: 0.7, receiveShadow: false };
  // Only the authored canal outline — punched island / crossing edges sit on other slabs.
  if (onRim(zone.minZ, zone.rimMinZ ?? zone.minZ)) {
    group.add(rbox(w + lipW * 0.2, lipH, lipW, lighter, cx, lipY, zone.minZ - lipW * 0.15, lipOpts));
  }
  if (onRim(zone.maxZ, zone.rimMaxZ ?? zone.maxZ)) {
    group.add(rbox(w + lipW * 0.2, lipH, lipW, lighter, cx, lipY, zone.maxZ + lipW * 0.15, lipOpts));
  }
  if (onRim(zone.minX, zone.rimMinX ?? zone.minX)) {
    group.add(rbox(lipW, lipH, d, lighter, zone.minX - lipW * 0.15, lipY, cz, lipOpts));
  }
  if (onRim(zone.maxX, zone.rimMaxX ?? zone.maxX)) {
    group.add(rbox(lipW, lipH, d, lighter, zone.maxX + lipW * 0.15, lipY, cz, lipOpts));
  }
}

function addCandyCaneLine(group, x0, z0, x1, z1, y, name) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  if (len < 0.5) return;
  const seg = 2.3;
  const n = Math.max(2, Math.round(len / seg));
  const actual = len / n;
  const ux = dx / len;
  const uz = dz / len;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) * actual;
    const pink = i % 2 === 0;
    const col = pink ? PASTEL.pink : PASTEL.cream;
    const alongX = Math.abs(dx) >= Math.abs(dz);
    const mesh = rbox(
      alongX ? actual * 0.9 : 0.26,
      0.2,
      alongX ? 0.26 : actual * 0.9,
      col,
      x0 + ux * t,
      y,
      z0 + uz * t,
      {
        emissive: col,
        emissiveIntensity: 0.55,
        roughness: 0.42,
        name: i === 0 ? name : undefined,
        radius: 0.06,
      }
    );
    group.add(mesh);
  }
}

function addInteriorLights(group) {
  // Three r185 PointLight intensity is candela — 0.4 reads as unlit in a 160m hangar.
  const spots = [
    { x: 0, z: 0, color: 0xffe8d0, intensity: 70, dist: 78 },
    { x: -38, z: -38, color: 0xffd0dc, intensity: 55, dist: 70 },
    { x: 38, z: 38, color: 0xd8fff4, intensity: 55, dist: 70 },
    { x: -38, z: 38, color: 0xffe8c8, intensity: 48, dist: 68 },
    { x: 38, z: -38, color: 0xffd8e8, intensity: 48, dist: 68 },
    { x: -50, z: -36, color: 0xffd0dc, intensity: 42, dist: 42 },
    { x: 50, z: 36, color: 0xd8fff4, intensity: 42, dist: 42 },
    { x: -6, z: 0, color: 0xfff0d8, intensity: 36, dist: 36 },
  ];
  for (const s of spots) {
    const light = new THREE.PointLight(s.color, s.intensity, s.dist, 2);
    light.position.set(s.x, 8.6, s.z);
    light.name = `candy_light_${s.x}_${s.z}`;
    group.add(light);
  }

  const inner = CANDY_MAP_WALL - 1.05;
  const y = 12.15;
  addCandyCaneLine(group, -inner, -inner, inner, -inner, y, 'candy_cane_s');
  addCandyCaneLine(group, -inner, inner, inner, inner, y, 'candy_cane_n');
  addCandyCaneLine(group, -inner, -inner, -inner, inner, y, 'candy_cane_w');
  addCandyCaneLine(group, inner, -inner, inner, inner, y, 'candy_cane_e');
}

function addOuterRingWaypoints(waypoints) {
  const seen = new Set();
  const push = (x, z) => {
    const k = `${Math.round(x * 2) / 2},${Math.round(z * 2) / 2}`;
    if (seen.has(k)) return;
    if (inCanalCenter(x, z)) return;
    seen.add(k);
    waypoints.push(new THREE.Vector3(x, 0.2, z));
  };
  for (const ring of [74, 66]) {
    for (let t = -ring; t <= ring + 0.01; t += 8) {
      push(t, ring);
      push(t, -ring);
      push(ring, t);
      push(-ring, t);
    }
  }
}

export function buildShell(ctx) {
  const { group, colliders, floors, waypoints, slowZones } = ctx;
  const halfG = CANDY_GROUND / 2;
  const water = canalWaterRects();

  addFloor(floors, -halfG, halfG, -halfG, halfG, 0);

  let underRects = [{ minX: -halfG, maxX: halfG, minZ: -halfG, maxZ: halfG }];
  for (const zone of water) underRects = punchRect(underRects, zone);
  let ui = 0;
  for (const r of underRects) {
    const w = r.maxX - r.minX;
    const d = r.maxZ - r.minZ;
    if (w < 0.35 || d < 0.35) continue;
    group.add(
      box(w, 0.22, d, UNDERLAY_COL, (r.minX + r.maxX) / 2, -0.28, (r.minZ + r.maxZ) / 2, {
        name: ui === 0 ? 'candy_hangar_underlay' : `candy_hangar_underlay_${ui}`,
        roughness: 0.92,
        mapKind: 'noise',
        mapRepeat: 10,
        castShadow: false,
      })
    );
    ui += 1;
  }

  let floorRects = [{ minX: -halfG, maxX: halfG, minZ: -halfG, maxZ: halfG }];
  for (const zone of water) floorRects = punchRect(floorRects, zone);
  let fi = 0;
  for (const r of floorRects) {
    const w = r.maxX - r.minX;
    const d = r.maxZ - r.minZ;
    if (w < 0.35 || d < 0.35) continue;
    group.add(
      box(w, 0.22, d, FLOOR_COL, (r.minX + r.maxX) / 2, -0.11, (r.minZ + r.maxZ) / 2, {
        name: fi === 0 ? 'candy_hangar_floor' : `candy_hangar_floor_${fi}`,
        roughness: 0.86,
        mapKind: 'noise',
        mapRepeat: 6,
      })
    );
    fi += 1;
  }

  for (const zone of water) {
    slowZones.push({
      id: zone.id,
      minX: zone.minX,
      maxX: zone.maxX,
      minZ: zone.minZ,
      maxZ: zone.maxZ,
      yMin: zone.yMin,
      yMax: zone.yMax,
      speedMul: zone.speedMul,
      color: zone.color,
    });
    addCanalVisual(ctx, zone);
  }

  buildHangarWall(ctx, { along: 'x', sign: -1, name: 'perimeter_s' });
  buildHangarWall(ctx, { along: 'x', sign: 1, name: 'perimeter_n' });
  buildHangarWall(ctx, { along: 'z', sign: -1, name: 'perimeter_w' });
  buildHangarWall(ctx, { along: 'z', sign: 1, name: 'perimeter_e' });

  const ceilH = 0.7;
  const ceilY = CANDY_CEILING + ceilH / 2;
  const ceilSpan = CANDY_MAP_WALL * 2 + WALL_T;
  group.add(
    box(ceilSpan, ceilH, ceilSpan, 0xf0ebe4, 0, ceilY, 0, {
      kind: 'ceiling',
      name: 'candy_hangar_ceiling',
      castShadow: false,
    })
  );
  addAabb(colliders, 0, ceilY, 0, ceilSpan, ceilH, ceilSpan, { kind: 'hangar_ceiling' });

  const beamY = CANDY_CEILING - 0.38;
  const beamSpan = CANDY_MAP_WALL * 2 - 2;
  for (const x of [-28, 0, 28]) {
    group.add(rbox(1.15, 0.55, beamSpan, PASTEL.cream, x, beamY, 0, { radius: 0.1, kind: 'wood', name: `candy_beam_x_${x}` }));
  }
  for (const z of [-28, 28]) {
    group.add(rbox(beamSpan, 0.5, 1.05, PASTEL.peach, 0, beamY - 0.08, z, { radius: 0.1, name: `candy_beam_z_${z}` }));
  }

  addInteriorLights(group);
  addOuterRingWaypoints(waypoints);
}
