/**
 * Fountain island, gumdrop bridges, pretzel walkways, lollipops, machines, spawns, cover.
 * Outdoor dressing only — hangar shell and building interiors live elsewhere.
 */
import * as THREE from 'three';
import {
  CANALS,
  FLAG_HOMES,
  FOUNTAIN,
  GUMDROP_BRIDGES,
  LOLLIPOPS,
  PRETZEL_WALKS,
  SUGAR_WORKS,
  SWEET_CO,
  TASTING_KIOSK,
  CUPCAKE_KIOSK,
  GUMMY_BEARS,
  SOFT_SERVE,
  GIFT_GANTRY,
  CANDY_SILOS,
  LICORICE_PIPE,
  JAWBREAKERS,
  CANDY_CANE_ARCHES,
  MARSHMALLOWS,
  buildingAabb,
} from './layout.js';
import { addAabb, addFloor, box, rbox, resolveMat } from './helpers.js';

const CREAM = 0xfff0dc;
const PINK = 0xff8fab;
const PRETZEL = 0x8a5a32;
const PRETZEL_DARK = 0x6b3a22;
const SALT = 0xfff6e8;
const GUMDROP_PALETTE = [0xff8fab, 0x7ee8d4, 0xffe066, 0xc9a0e8, 0xffc9a8, 0x7ec8e8, 0xffb3c9];

const SWEET_AABB = buildingAabb(SWEET_CO);
const SUGAR_AABB = buildingAabb(SUGAR_WORKS);
const KIOSK_AABB = buildingAabb(TASTING_KIOSK);
const CUPCAKE_AABB = buildingAabb(CUPCAKE_KIOSK);
const BUILDING_AABBS = [SWEET_AABB, SUGAR_AABB, KIOSK_AABB, CUPCAKE_AABB];

const STAIR_RISE = 0.42;
const STAIR_RUN = 0.58;

function candyOpts(extra = {}) {
  return { metalness: 0.14, roughness: 0.38, ...extra };
}

function gumColor(i) {
  return GUMDROP_PALETTE[((i % GUMDROP_PALETTE.length) + GUMDROP_PALETTE.length) % GUMDROP_PALETTE.length];
}

function addSphere(parent, r, color, x, y, z, opts = {}) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), resolveMat(color, opts));
  mesh.position.set(x, y, z);
  mesh.castShadow = opts.castShadow !== false;
  mesh.receiveShadow = true;
  if (opts.name) mesh.name = opts.name;
  parent.add(mesh);
  return mesh;
}

function inBuilding(x, z, margin = 1.6) {
  for (const a of BUILDING_AABBS) {
    if (x >= a.minX - margin && x <= a.maxX + margin && z >= a.minZ - margin && z <= a.maxZ + margin) {
      return true;
    }
  }
  if (Math.hypot(x - SOFT_SERVE.cx, z - SOFT_SERVE.cz) < SOFT_SERVE.radius + 2.2 + margin) return true;
  if (x >= GIFT_GANTRY.x0 - 3.5 - margin && x <= GIFT_GANTRY.x1 + 3.5 + margin) {
    if (Math.abs(z - GIFT_GANTRY.z) < GIFT_GANTRY.width / 2 + 1.4 + margin) return true;
  }
  for (const b of GUMMY_BEARS) {
    if (Math.hypot(x - b.x, z - b.z) < 2.1 + margin) return true;
  }
  for (const s of CANDY_SILOS) {
    if (Math.hypot(x - s.x, z - s.z) < s.r + 1.3 + margin) return true;
  }
  if (x >= LICORICE_PIPE.x0 - margin && x <= LICORICE_PIPE.x1 + margin) {
    if (Math.abs(z - LICORICE_PIPE.z) < LICORICE_PIPE.innerW / 2 + 1.1 + margin) return true;
  }
  for (const j of JAWBREAKERS) {
    if (Math.hypot(x - j.x, z - j.z) < j.r + 0.8 + margin) return true;
  }
  for (const a of CANDY_CANE_ARCHES) {
    if (Math.hypot(x - a.x, z - a.z) < 2.2 + margin) return true;
  }
  for (const m of MARSHMALLOWS) {
    if (Math.hypot(x - m.x, z - m.z) < 1.6 + margin) return true;
  }
  return false;
}

function onFountainIsland(x, z) {
  const dx = x - FOUNTAIN.x;
  const dz = z - FOUNTAIN.z;
  return dx * dx + dz * dz <= FOUNTAIN.island * FOUNTAIN.island;
}

function inSyrup(x, z) {
  if (onFountainIsland(x, z)) return false;
  for (const c of CANALS) {
    if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ) return true;
  }
  return false;
}

function nearFlag(x, z, pad = 2.6) {
  for (const h of Object.values(FLAG_HOMES)) {
    if (Math.hypot(x - h.x, z - h.z) < pad) return true;
  }
  return false;
}

function pushCover(ctx, x, z) {
  ctx.coverPoints.push(new THREE.Vector3(x, 0, z));
}

function pushWay(ctx, x, z, y = 0.2) {
  ctx.waypoints.push(new THREE.Vector3(x, y, z));
}

function pushSpawn(ctx, x, z, y = 1.7) {
  ctx.spawnPoints.push(new THREE.Vector3(x, y, z));
  pushWay(ctx, x, z, 0.2);
}

function addWoodDeck(ctx, parent, minX, maxX, minZ, maxZ, y, name) {
  const w = maxX - minX;
  const d = maxZ - minZ;
  if (w < 0.2 || d < 0.2) return;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const alongX = w >= d;
  const seg = 8;
  const span = alongX ? w : d;
  const n = Math.max(1, Math.ceil(span / seg));
  for (let i = 0; i < n; i++) {
    const a0 = alongX ? minX + (w * i) / n : minX;
    const a1 = alongX ? minX + (w * (i + 1)) / n : maxX;
    const b0 = alongX ? minZ : minZ + (d * i) / n;
    const b1 = alongX ? maxZ : minZ + (d * (i + 1)) / n;
    const sw = a1 - a0;
    const sd = b1 - b0;
    parent.add(
      rbox(sw, 0.3, sd, PRETZEL, (a0 + a1) / 2, y - 0.14, (b0 + b1) / 2, {
        kind: 'wood',
        name: `${name}_${i}`,
      })
    );
    parent.add(
      rbox(Math.max(0.2, sw - 0.35), 0.06, Math.max(0.2, sd - 0.35), PRETZEL_DARK, (a0 + a1) / 2, y + 0.02, (b0 + b1) / 2, {
        kind: 'wood',
        name: `${name}_grain_${i}`,
      })
    );
  }
  for (let i = 0; i < 10; i++) {
    const sx = minX + 0.4 + ((i * 17) % Math.max(1, w - 0.8));
    const sz = minZ + 0.4 + ((i * 11) % Math.max(1, d - 0.8));
    parent.add(box(0.12, 0.05, 0.08, SALT, sx, y + 0.06, sz, { name: `${name}_salt_${i}` }));
  }
  addFloor(ctx.floors, minX, maxX, minZ, maxZ, y);
  addAabb(ctx.colliders, cx, y - 0.14, cz, w, 0.28, d, {
    kind: 'pretzel_deck',
    blocksShot: true,
    part: name,
  });
}

/**
 * Axis-aligned stair flight. `sign` is the ascent direction along `axis`.
 * Highest tread is centered on (landX, landZ) at deckY.
 */
function addAxisStairs(ctx, parent, { name, axis, sign, landX, landZ, width, deckY }) {
  const steps = Math.max(2, Math.ceil(deckY / STAIR_RISE));
  const rise = deckY / steps;
  const treadH = Math.max(0.36, rise + 0.16);
  const g = new THREE.Group();
  g.name = name;
  parent.add(g);

  let footX = landX;
  let footZ = landZ;
  for (let i = 0; i < steps; i++) {
    const topY = (i + 1) * rise;
    const distFromTop = (steps - 1 - i) * STAIR_RUN;
    const x = axis === 'x' ? landX - sign * distFromTop : landX;
    const z = axis === 'z' ? landZ - sign * distFromTop : landZ;
    if (i === 0) {
      footX = x;
      footZ = z;
    }
    const tw = axis === 'x' ? STAIR_RUN + 0.08 : width;
    const td = axis === 'x' ? width : STAIR_RUN + 0.08;
    g.add(
      rbox(tw, Math.max(0.14, rise * 0.9), td, PRETZEL, x, topY - rise * 0.4, z, {
        kind: 'wood',
        name: `${name}_tread_${i}`,
      })
    );
    if (axis === 'x') {
      addFloor(ctx.floors, x - STAIR_RUN * 0.55, x + STAIR_RUN * 0.55, landZ - width / 2, landZ + width / 2, topY);
      addAabb(ctx.colliders, x, topY - treadH * 0.5, landZ, STAIR_RUN * 0.92, treadH, width * 0.92, {
        kind: 'stair_tread',
        chain: name,
        step: i,
      });
    } else {
      addFloor(ctx.floors, landX - width / 2, landX + width / 2, z - STAIR_RUN * 0.55, z + STAIR_RUN * 0.55, topY);
      addAabb(ctx.colliders, landX, topY - treadH * 0.5, z, width * 0.92, treadH, STAIR_RUN * 0.92, {
        kind: 'stair_tread',
        chain: name,
        step: i,
      });
    }
  }

  const flightLen = (steps - 1) * STAIR_RUN + STAIR_RUN;
  const midAlong = ((steps - 1) * STAIR_RUN) / 2;
  const midX = axis === 'x' ? landX - sign * midAlong : landX;
  const midZ = axis === 'z' ? landZ - sign * midAlong : landZ;
  const railH = 0.85;
  const railY = deckY * 0.45;
  if (axis === 'x') {
    const hz = width / 2 - 0.08;
    g.add(rbox(flightLen, 0.07, 0.07, SALT, midX, railY + railH, landZ - hz, { name: `${name}_rail_a` }));
    g.add(rbox(flightLen, 0.07, 0.07, SALT, midX, railY + railH, landZ + hz, { name: `${name}_rail_b` }));
  } else {
    const hx = width / 2 - 0.08;
    g.add(rbox(0.07, 0.07, flightLen, SALT, landX - hx, railY + railH, midZ, { name: `${name}_rail_a` }));
    g.add(rbox(0.07, 0.07, flightLen, SALT, landX + hx, railY + railH, midZ, { name: `${name}_rail_b` }));
  }

  return { footX, footZ, steps, rise };
}

function addRailBox(ctx, parent, x, y, z, w, h, d, name, solid) {
  parent.add(rbox(w, h, d, SALT, x, y, z, { name }));
  if (solid) addAabb(ctx.colliders, x, y, z, w, h, d, { kind: 'railing', part: name });
}

function buildFountain(ctx, yard) {
  const g = new THREE.Group();
  g.name = 'fountain_island';
  yard.add(g);

  const R = FOUNTAIN.island;
  const fx = FOUNTAIN.x;
  const fz = FOUNTAIN.z;
  g.add(rbox(R * 2, 0.18, R * 2, CREAM, fx, 0.1, fz, { name: 'fountain_island_slab' }));
  g.add(rbox(R * 1.55, 0.1, R * 1.55, 0xffd0dc, fx, 0.18, fz, { name: 'fountain_frosting_pad' }));
  addFloor(ctx.floors, fx - R, fx + R, fz - R, fz + R, 0.12);

  const barW = 3.25;
  const barLen = FOUNTAIN.radius * 2;
  const barH = 1.05;
  g.add(rbox(barW, barH, barLen, PINK, fx, barH / 2, fz, candyOpts({ name: 'fountain_bar_ns' })));
  g.add(rbox(barLen, barH, barW, CREAM, fx, barH / 2 - 0.02, fz, candyOpts({ name: 'fountain_bar_ew' })));
  addAabb(ctx.colliders, fx, barH / 2, fz, barW, barH, barLen, { kind: 'cover', part: 'fountain_ns' });
  addAabb(ctx.colliders, fx, barH / 2, fz, barLen, barH, barW, { kind: 'cover', part: 'fountain_ew' });

  g.add(rbox(2.6, 1.15, 2.6, 0xffd0dc, fx, 1.15, fz, candyOpts({ name: 'fountain_core' })));
  addAabb(ctx.colliders, fx, 1.15, fz, 2.6, 1.15, 2.6, { kind: 'cover', part: 'fountain_core' });
  g.add(rbox(0.7, 2.1, 0.7, PINK, fx, 2.4, fz, candyOpts({ name: 'fountain_spout' })));
  addSphere(g, 0.95, 0xffc0d4, fx, 3.45, fz, candyOpts({ name: 'fountain_scoop' }));
  addSphere(g, 0.45, CREAM, fx + 0.35, 3.7, fz + 0.15, candyOpts({ name: 'fountain_drip' }));

  pushCover(ctx, fx + 2.2, fz + 2.2);
  pushCover(ctx, fx - 2.2, fz + 2.2);
  pushCover(ctx, fx + 2.2, fz - 2.2);
  pushCover(ctx, fx - 2.2, fz - 2.2);
  pushCover(ctx, fx, fz + FOUNTAIN.radius + 1.15);
  pushCover(ctx, fx, fz - FOUNTAIN.radius - 1.15);
  pushCover(ctx, fx + FOUNTAIN.radius + 1.15, fz);
  pushCover(ctx, fx - FOUNTAIN.radius - 1.15, fz);
  pushWay(ctx, fx + 8, fz + 3);
  pushWay(ctx, fx - 8, fz - 3);
  pushWay(ctx, fx + 3, fz - 8);
  pushWay(ctx, fx - 3, fz + 8);
}

function buildGumdropBridge(ctx, yard, b, idx) {
  const g = new THREE.Group();
  g.name = `gumdrop_bridge_${idx}`;
  yard.add(g);

  const y = b.y ?? 0.55;
  const minX = b.x - b.w / 2;
  const maxX = b.x + b.w / 2;
  const minZ = b.z - b.d / 2;
  const maxZ = b.z + b.d / 2;
  const alongX = b.w >= b.d;
  const nx = alongX ? 4 : 2;
  const nz = alongX ? 2 : 4;
  const cellW = b.w / nx;
  const cellD = b.d / nz;
  const dropH = 0.72;

  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      const cx = minX + (ix + 0.5) * cellW;
      const cz = minZ + (iz + 0.5) * cellD;
      const color = gumColor(idx * 3 + ix + iz * 2);
      const s = Math.min(cellW, cellD) * 0.86;
      g.add(
        rbox(s, dropH, s, color, cx, y - dropH * 0.42, cz, candyOpts({
          name: `gumdrop_${idx}_${ix}_${iz}`,
          radius: Math.min(0.2, Math.min(s, dropH) * 0.22),
        }))
      );
    }
  }

  g.add(rbox(b.w * 0.96, 0.12, b.d * 0.96, CREAM, b.x, y + 0.02, b.z, { name: `gumdrop_deck_${idx}` }));
  addFloor(ctx.floors, minX + 0.12, maxX - 0.12, minZ + 0.12, maxZ - 0.12, y);
  addAabb(ctx.colliders, b.x, y - 0.14, b.z, b.w * 0.92, 0.28, b.d * 0.92, {
    kind: 'gumdrop_deck',
    blocksShot: true,
    part: g.name,
  });

  const curbH = 0.78;
  const curbT = 0.32;
  const curbY = y + curbH * 0.35;
  if (alongX) {
    for (const side of [-1, 1]) {
      const cz = b.z + side * (b.d / 2 - curbT * 0.45);
      g.add(rbox(b.w * 0.98, curbH, curbT, gumColor(idx + side + 3), b.x, curbY, cz, candyOpts({ name: `gumdrop_curb_${idx}_${side}` })));
      addAabb(ctx.colliders, b.x, curbY, cz, b.w * 0.9, curbH, curbT, { kind: 'cover', part: `gumdrop_curb_${idx}` });
      pushCover(ctx, b.x, cz + side * 0.85);
    }
    for (const end of [-1, 1]) {
      const ex = b.x + end * (b.w / 2 + 0.55);
      addFloor(ctx.floors, ex - 0.55, ex + 0.55, minZ + 0.2, maxZ - 0.2, 0.28);
      g.add(rbox(1.1, 0.22, b.d * 0.7, CREAM, ex, 0.16, b.z, { name: `gumdrop_lip_${idx}_${end}` }));
    }
  } else {
    for (const side of [-1, 1]) {
      const cx = b.x + side * (b.w / 2 - curbT * 0.45);
      g.add(rbox(curbT, curbH, b.d * 0.98, gumColor(idx + side + 2), cx, curbY, b.z, candyOpts({ name: `gumdrop_curb_${idx}_${side}` })));
      addAabb(ctx.colliders, cx, curbY, b.z, curbT, curbH, b.d * 0.9, { kind: 'cover', part: `gumdrop_curb_${idx}` });
      pushCover(ctx, cx + side * 0.85, b.z);
    }
    for (const end of [-1, 1]) {
      const ez = b.z + end * (b.d / 2 + 0.55);
      addFloor(ctx.floors, minX + 0.2, maxX - 0.2, ez - 0.55, ez + 0.55, 0.28);
      g.add(rbox(b.w * 0.7, 0.22, 1.1, CREAM, b.x, 0.16, ez, { name: `gumdrop_lip_${idx}_${end}` }));
    }
  }

  pushWay(ctx, b.x, b.z, y + 0.2);
  pushWay(ctx, b.x + (alongX ? -b.w * 0.35 : 0), b.z + (alongX ? 0 : -b.d * 0.35), y + 0.2);
  pushWay(ctx, b.x + (alongX ? b.w * 0.35 : 0), b.z + (alongX ? 0 : b.d * 0.35), y + 0.2);
}

function walkAabb(w) {
  return {
    x: w.x,
    z: w.z,
    minX: w.x - w.w / 2,
    maxX: w.x + w.w / 2,
    minZ: w.z - w.d / 2,
    maxZ: w.z + w.d / 2,
    y: w.y,
  };
}

function buildPretzelWalk(ctx, yard, walk, idx) {
  const g = new THREE.Group();
  g.name = `pretzel_walk_${idx}`;
  yard.add(g);
  const a = walkAabb(walk);
  const y = walk.y;

  if (idx === 1) {
    const ns = walkAabb(PRETZEL_WALKS[0]);
    addWoodDeck(ctx, g, a.minX, Math.min(a.maxX, ns.minX - 0.04), a.minZ, a.maxZ, y, `${g.name}_west`);
    addWoodDeck(ctx, g, Math.max(a.minX, ns.maxX + 0.04), a.maxX, a.minZ, a.maxZ, y, `${g.name}_east`);
  } else {
    addWoodDeck(ctx, g, a.minX, a.maxX, a.minZ, a.maxZ, y, g.name);
  }

  const postH = 0.95;
  const postY = y + postH / 2;
  const railY = y + 0.82;
  const alongZ = walk.d >= walk.w;

  if (alongZ) {
    addRailBox(ctx, g, a.minX + 0.08, railY, walk.z, 0.12, 0.1, walk.d * 0.98, `${g.name}_rail_w`, true);
    const eastX = a.maxX - 0.08;
    const eastSegs = [
      [a.minZ + 0.2, -12.2],
      [-7.8, 7.8],
      [12.2, a.maxZ - 0.2],
    ];
    eastSegs.forEach(([z0, z1], i) => {
      const dd = z1 - z0;
      if (dd < 1) return;
      addRailBox(ctx, g, eastX, railY, (z0 + z1) / 2, 0.12, 0.1, dd, `${g.name}_rail_e_${i}`, true);
    });
    for (let z = a.minZ + 0.4; z <= a.maxZ - 0.4; z += 3.2) {
      g.add(rbox(0.1, postH, 0.1, SALT, a.minX + 0.08, postY, z, { name: `${g.name}_post_w` }));
      if (Math.abs(z - 10) < 2.3 || Math.abs(z + 10) < 2.3) continue;
      g.add(rbox(0.1, postH, 0.1, SALT, eastX, postY, z, { name: `${g.name}_post_e` }));
    }
  } else {
    const northZ = a.maxZ - 0.08;
    const southZ = a.minZ + 0.08;
    addRailBox(ctx, g, (-8 + a.maxX) / 2, railY, southZ, a.maxX + 8, 0.1, 0.12, `${g.name}_rail_s`, true);
    addRailBox(ctx, g, (a.minX + 23.4) / 2, railY, northZ, 23.4 - a.minX, 0.1, 0.12, `${g.name}_rail_n`, true);
    for (let x = a.minX + 0.6; x <= a.maxX - 0.6; x += 3.2) {
      if (x < -8.2) continue;
      g.add(rbox(0.1, postH, 0.1, SALT, x, postY, southZ, { name: `${g.name}_post_s` }));
      if (x > 23.2) continue;
      g.add(rbox(0.1, postH, 0.1, SALT, x, postY, northZ, { name: `${g.name}_post_n` }));
    }
  }

  for (let t = -0.4; t <= 0.4; t += 0.2) {
    pushWay(ctx, walk.x + t * walk.w * 0.15, walk.z + t * walk.d * 0.15, y + 0.2);
  }
  const step = 4;
  if (alongZ) {
    for (let z = a.minZ + 2; z <= a.maxZ - 2; z += step) {
      pushWay(ctx, walk.x, z, y + 0.2);
      pushCover(ctx, walk.x, z);
    }
  } else {
    for (let x = a.minX + 2; x <= a.maxX - 2; x += step) {
      pushWay(ctx, x, walk.z, y + 0.2);
      pushCover(ctx, x, walk.z);
    }
  }

  const supports = alongZ
    ? [
        [walk.x, -22],
        [walk.x, 22],
      ]
    : [
        [16, walk.z],
        [24, walk.z],
      ];
  for (const [sx, sz] of supports) {
    const h = y - 0.2;
    g.add(rbox(0.48, h, 0.48, PRETZEL_DARK, sx, h / 2, sz, { kind: 'wood', name: `${g.name}_support` }));
    addAabb(ctx.colliders, sx, h / 2, sz, 0.5, h, 0.5, { kind: 'cover', part: `${g.name}_support` });
    pushCover(ctx, sx + 1.1, sz);
    pushCover(ctx, sx - 1.1, sz);
  }
}

function buildPretzelAccess(ctx, yard) {
  const ns = walkAabb(PRETZEL_WALKS[0]);
  const ew = walkAabb(PRETZEL_WALKS[1]);
  const deckY = PRETZEL_WALKS[0].y;
  const g = new THREE.Group();
  g.name = 'pretzel_access';
  yard.add(g);

  // Mid: two flights from the frosting island up the east lip of the NS walk.
  const islandLandX = ns.maxX - 0.35;
  addAxisStairs(ctx, g, {
    name: 'pretzel_stairs_island_s',
    axis: 'x',
    sign: -1,
    landX: islandLandX,
    landZ: -10,
    width: 3.1,
    deckY,
  });
  addAxisStairs(ctx, g, {
    name: 'pretzel_stairs_island_n',
    axis: 'x',
    sign: -1,
    landX: islandLandX,
    landZ: 10,
    width: 3.1,
    deckY,
  });

  // NS south bank: raised approach over syrup, then stairs onto dry ground.
  addWoodDeck(ctx, g, ns.minX + 0.15, ns.maxX - 0.15, -37.2, ns.minZ, deckY, 'pretzel_approach_s');
  addAxisStairs(ctx, g, {
    name: 'pretzel_stairs_bank_s',
    axis: 'z',
    sign: 1,
    landX: ns.x,
    landZ: -36.7,
    width: 3.2,
    deckY,
  });

  // NS north bank: offset east to miss the lollipop at (-8, 30).
  addWoodDeck(ctx, g, -6.35, -3.55, ns.maxZ, 37.2, deckY, 'pretzel_approach_n');
  addAxisStairs(ctx, g, {
    name: 'pretzel_stairs_bank_n',
    axis: 'z',
    sign: -1,
    landX: -4.95,
    landZ: 36.7,
    width: 2.7,
    deckY,
  });

  // EW west end sits on dry ground west of chocolate / north of strawberry.
  addAxisStairs(ctx, g, {
    name: 'pretzel_stairs_west',
    axis: 'x',
    sign: 1,
    landX: ew.minX + 0.35,
    landZ: 10.9,
    width: 2.4,
    deckY,
  });

  // EW east end: north approach out of lemon canal, then stairs to dry ground.
  addWoodDeck(ctx, g, 24.2, ew.maxX, ew.maxZ, 21.2, deckY, 'pretzel_approach_e');
  addAxisStairs(ctx, g, {
    name: 'pretzel_stairs_east',
    axis: 'z',
    sign: -1,
    landX: 25.6,
    landZ: 20.7,
    width: 3.0,
    deckY,
  });
}

function buildLollipop(ctx, yard, p, idx) {
  const g = new THREE.Group();
  g.name = `lollipop_${idx}`;
  yard.add(g);
  const stemH = 5.1;
  const stemW = 0.58;
  g.add(rbox(stemW, stemH, stemW, PINK, p.x, stemH / 2, p.z, candyOpts({ name: `${g.name}_stem` })));
  g.add(rbox(0.78, 0.22, 0.78, 0xffd0dc, p.x, stemH - 0.15, p.z, { name: `${g.name}_collar` }));
  addSphere(g, 1.18, 0xff9bb8, p.x, stemH + 0.95, p.z, candyOpts({ name: `${g.name}_head` }));
  addSphere(g, 0.35, 0xffe066, p.x + 0.45, stemH + 1.15, p.z + 0.2, candyOpts({ name: `${g.name}_shine` }));
  addAabb(ctx.colliders, p.x, stemH / 2, p.z, stemW + 0.08, stemH, stemW + 0.08, {
    kind: 'cover',
    part: g.name,
  });
  addAabb(ctx.colliders, p.x, stemH + 0.95, p.z, 2.15, 2.15, 2.15, { kind: 'lollipop_head', part: g.name });
  pushCover(ctx, p.x + 1.35, p.z);
  pushCover(ctx, p.x - 1.35, p.z);
  pushCover(ctx, p.x, p.z + 1.35);
  pushCover(ctx, p.x, p.z - 1.35);
  pushWay(ctx, p.x + 2.2, p.z + 0.8);
  pushWay(ctx, p.x - 2.2, p.z - 0.8);
}

function buildCandyMachine(ctx, yard, x, z, idx, accent) {
  if (inBuilding(x, z, 1.8) || nearFlag(x, z, 2.2) || onFountainIsland(x, z) || inSyrup(x, z)) return;
  const g = new THREE.Group();
  g.name = `candy_machine_${idx}`;
  yard.add(g);
  const bodyW = 1.35;
  const bodyH = 1.55;
  const bodyD = 0.95;
  g.add(rbox(bodyW, bodyH, bodyD, 0xfff0c8, x, bodyH / 2, z, { name: `${g.name}_body` }));
  g.add(rbox(bodyW * 0.92, 0.12, bodyD * 0.92, accent, x, 0.72, z, { name: `${g.name}_band` }));
  g.add(rbox(0.28, 0.22, 0.12, 0x6b3a28, x + bodyW * 0.28, 0.95, z + bodyD * 0.45, { name: `${g.name}_slot` }));
  addSphere(g, 0.48, accent, x, bodyH + 0.42, z, candyOpts({ name: `${g.name}_globe` }));
  addSphere(g, 0.12, 0xffe066, x - 0.18, bodyH + 0.5, z + 0.12, { name: `${g.name}_candy_a` });
  addSphere(g, 0.1, PINK, x + 0.16, bodyH + 0.38, z - 0.1, { name: `${g.name}_candy_b` });
  addAabb(ctx.colliders, x, bodyH / 2, z, bodyW, bodyH, bodyD, { kind: 'cover', part: g.name });
  pushCover(ctx, x + 1.25, z);
  pushCover(ctx, x - 1.25, z);
  pushCover(ctx, x, z + 1.15);
  pushWay(ctx, x, z + 1.8);
}

function buildCandyMachines(ctx, yard) {
  const spots = [
    [-44, -32, 0xff8fab],
    [-56, -32, 0xc9a0e8],
    [-36, -44, 0x7ee8d4],
    [44, 32, 0x7ee8d4],
    [56, 32, 0xffe066],
    [36, 44, 0xff8fab],
    [-24, 18, 0xffc9a8],
    [26, -28, 0xc9a0e8],
    [-38, 10, 0xffe066],
    [40, -16, 0xff8fab],
  ];
  spots.forEach(([x, z, accent], i) => buildCandyMachine(ctx, yard, x, z, i, accent));
}

function makeCrate(ctx, yard, x, z, s, h, rotY, idx) {
  const g = new THREE.Group();
  g.name = `crate_yard_${idx}`;
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  yard.add(g);
  g.add(rbox(s, h, s, 0xe0a86a, 0, h / 2, 0, { kind: 'wood', name: `${g.name}_box` }));
  g.add(box(s + 0.04, 0.09, s + 0.04, 0xb8956a, 0, h * 0.55, 0, { name: `${g.name}_band` }));
  addAabb(ctx.colliders, x, h / 2, z, s * 1.05, h, s * 1.05, { kind: 'cover', part: g.name });
  const half = s * 0.42;
  addFloor(ctx.floors, x - half, x + half, z - half, z + half, h);
  pushCover(ctx, x + 1.15, z);
  pushCover(ctx, x - 1.15, z);
  pushWay(ctx, x, z + 1.3);
}

function crateStack(ctx, yard, x, z, pattern, startIdx) {
  if (inBuilding(x, z, 2.4) || nearFlag(x, z, 2.8) || onFountainIsland(x, z) || inSyrup(x, z)) return startIdx;
  let i = startIdx;
  if (pattern === 'L') {
    makeCrate(ctx, yard, x, z, 1.0, 1.0, 0.18, i++);
    makeCrate(ctx, yard, x + 1.05, z, 0.95, 1.08, 0.08, i++);
    makeCrate(ctx, yard, x, z + 1.05, 1.0, 0.95, -0.12, i++);
    makeCrate(ctx, yard, x + 0.45, z + 0.45, 0.9, 1.32, 0.35, i++);
  } else if (pattern === 'line') {
    for (let k = 0; k < 3; k++) {
      makeCrate(ctx, yard, x + k * 1.08, z, 0.95 + (k % 2) * 0.08, 0.95 + (k % 3) * 0.12, k * 0.15, i++);
    }
  } else {
    makeCrate(ctx, yard, x - 0.85, z, 1.0, 1.0, 0, i++);
    makeCrate(ctx, yard, x + 0.85, z, 1.0, 1.02, 0.12, i++);
    makeCrate(ctx, yard, x, z + 0.9, 1.0, 0.98, -0.1, i++);
  }
  return i;
}

function buildCrateStacks(ctx, yard) {
  const stacks = [
    [-20, -22, 'L'],
    [-40, -22, 'line'],
    [-52, -20, 'U'],
    [-22, 12, 'L'],
    [-46, 12, 'line'],
    [-18, -24, 'U'],
    [-18, 20, 'L'],
    [24, -24, 'line'],
    [24, 28, 'L'],
    [8, -38, 'U'],
    [-4, -40, 'line'],
    [8, 38, 'L'],
    [-4, 40, 'U'],
    [36, -12, 'line'],
    [52, -12, 'L'],
    [36, 24, 'U'],
    [55, 24, 'line'],
    [66, 6, 'L'],
    [-28, 32, 'U'],
    [14, -40, 'line'],
  ];
  let idx = 0;
  for (const [x, z, pattern] of stacks) {
    idx = crateStack(ctx, yard, x, z, pattern, idx);
  }
}

function authorSpawns(ctx) {
  const sweetDock = [
    [-50, -33],
    [-46, -33],
    [-54, -33],
    [-58, -32],
    [-42, -32],
    [-48, -30],
    [-52, -30],
    [-44, -29],
    [-56, -29],
    [-40, -33],
    [-36, -46],
    [-36, -50],
    [-36, -54],
    [-34, -42],
    [-32, -48],
    [-66, -46],
    [-66, -50],
    [-66, -54],
    [-50, -64],
    [-44, -64],
    [-56, -64],
    [-30, -36],
    [-28, -44],
  ];
  const sugarDock = [
    [50, 33],
    [46, 33],
    [54, 33],
    [58, 32],
    [42, 32],
    [48, 30],
    [52, 30],
    [44, 29],
    [56, 29],
    [40, 33],
    [36, 46],
    [36, 50],
    [36, 54],
    [34, 42],
    [32, 48],
    [66, 46],
    [66, 50],
    [66, 54],
    [50, 64],
    [44, 64],
    [56, 64],
    [30, 36],
    [28, 44],
  ];
  const islandEdge = [
    [-10.2, -4.2],
    [-10.2, 4.2],
    [-8.2, -8.0],
    [-8.2, 8.0],
    [-9.4, 0.6],
    [9.6, -3.2],
    [9.6, 3.2],
    [8.0, -8.0],
    [8.0, 8.0],
    [6.4, -7.2],
    [6.4, 7.2],
    [-6.8, -6.8],
    [4.8, -9.6],
    [4.8, 9.6],
  ];
  const pretzelAccess = [
    [4.2, -10.0],
    [4.2, -7.4],
    [4.2, 7.4],
    [4.2, 10.0],
    [-18.4, 9.4],
    [-18.4, 12.6],
    [-6.0, -44.2],
    [-3.2, -44.2],
    [-6.8, 44.0],
    [-2.8, 44.0],
    [28.4, 32.0],
    [31.2, 30.0],
    [5.2, -5.5],
    [5.2, 5.5],
  ];
  const flanks = [
    [-24, -32],
    [-32, 16],
    [24, 32],
    [32, -16],
    [-16, -42],
    [16, 42],
    [-28, -8],
    [28, 8],
    [-14, 32],
    [14, -32],
    [-40, 4],
    [40, -4],
    [-22, 36],
    [22, -36],
  ];

  for (const [x, z] of [...sweetDock, ...sugarDock, ...islandEdge, ...pretzelAccess, ...flanks]) {
    if (inBuilding(x, z, 1.35)) continue;
    if (nearFlag(x, z, 1.8)) continue;
    if (inSyrup(x, z)) continue;
    pushSpawn(ctx, x, z, 1.7);
  }

  // Elevated pretzel pads (filtered out of ground player start; useful TDM/AI candidates).
  pushSpawn(ctx, PRETZEL_WALKS[0].x, -8, PRETZEL_WALKS[0].y + 1.7);
  pushSpawn(ctx, PRETZEL_WALKS[0].x, 8, PRETZEL_WALKS[0].y + 1.7);
  pushSpawn(ctx, 16, PRETZEL_WALKS[1].z, PRETZEL_WALKS[1].y + 1.7);
  pushSpawn(ctx, -8.6, 12, PRETZEL_WALKS[1].y + 1.7);
}

function authorWaypointGrid(ctx) {
  for (let x = -70; x <= 70; x += 8) {
    for (let z = -70; z <= 70; z += 8) {
      if (inBuilding(x, z, 1.2)) continue;
      if (Math.hypot(x - FOUNTAIN.x, z - FOUNTAIN.z) < 4.2) continue;
      pushWay(ctx, x, z, 0.2);
    }
  }
  for (const c of CANALS) {
    const cx = (c.minX + c.maxX) / 2;
    const cz = (c.minZ + c.maxZ) / 2;
    pushWay(ctx, cx, c.minZ - 2.2);
    pushWay(ctx, cx, c.maxZ + 2.2);
    pushWay(ctx, c.minX - 2.2, cz);
    pushWay(ctx, c.maxX + 2.2, cz);
  }
}

export function buildYard(ctx) {
  const yard = new THREE.Group();
  yard.name = 'CandyYard';
  ctx.group.add(yard);

  buildFountain(ctx, yard);
  GUMDROP_BRIDGES.forEach((b, i) => buildGumdropBridge(ctx, yard, b, i));
  PRETZEL_WALKS.forEach((w, i) => buildPretzelWalk(ctx, yard, w, i));
  buildPretzelAccess(ctx, yard);
  LOLLIPOPS.forEach((p, i) => buildLollipop(ctx, yard, p, i));
  buildCandyMachines(ctx, yard);
  buildCrateStacks(ctx, yard);
  authorSpawns(ctx);
  authorWaypointGrid(ctx);
}
