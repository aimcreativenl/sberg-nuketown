import * as THREE from 'three';
import { COLORS } from './constants.js';
import {
  createMat,
  createGrassMat,
  createGrassPatchMat,
  createRoadMat,
  createWoodMat,
  createFacadeMat,
  createGlassMat,
  createPlasterMat,
  createFloorPlankMat,
  createFabricMat,
  createCeilingMat,
  PASTEL,
  GFX,
  boxGeometry,
} from './materials.js';
import { roundedBoxGeo } from './softGeo.js';
import { makeAabbCollider, playerPositionBlocked } from './collision.js';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from './constants.js';

export { createMat } from './materials.js';

/** Arena footprint (Phase 1 scale ~1.4× prior 60×60 / walls ±28). */
export const MAP_GROUND = 84;
export const MAP_WALL = 40;
export const HOUSE_X = 17;
export const ROAD_WIDTH = 8.5;
export const ROAD_LENGTH = 72;

/** Shared unit sphere for foliage blobs (scale mesh = radii). */
const FOLIAGE_SPHERE = new THREE.SphereGeometry(1, 10, 8);

function resolveMat(color, opts = {}) {
  if (opts.mat) return opts.mat;
  if (opts.kind === 'wood') return createWoodMat(color);
  if (opts.kind === 'facade') return createFacadeMat(color);
  if (opts.kind === 'glass') return createGlassMat(color);
  if (opts.kind === 'plaster') return createPlasterMat(color);
  if (opts.kind === 'floor') return createFloorPlankMat(color);
  if (opts.kind === 'fabric') return createFabricMat(color);
  if (opts.kind === 'ceiling') return createCeilingMat(color);
  return createMat(color, opts);
}

function box(w, h, d, color, x, y, z, opts = {}) {
  const mat = resolveMat(color, opts);
  const mesh = new THREE.Mesh(boxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (opts.detailTag) mesh.name = opts.detailTag;
  return mesh;
}

/** Softened box via shared softGeo helper — prefer over stacking flat trim. */
function rbox(w, h, d, color, x, y, z, opts = {}) {
  const mat = resolveMat(color, opts);
  const radius = opts.radius ?? Math.min(w, h, d) * 0.1;
  const segs = opts.segments ?? 2;
  const mesh = new THREE.Mesh(roundedBoxGeo(w, h, d, radius, segs), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (opts.detailTag) mesh.name = opts.detailTag;
  return mesh;
}

/**
 * Modest chamfer for house exteriors (0.04–0.12). Keeps door/window openings clear —
 * never larger than ~45% of the smallest extent.
 */
function softR(w, h, d, prefer = 0.08) {
  const cap = Math.min(w, h, d) * 0.45;
  return Math.min(Math.max(prefer, 0.04), cap, 0.12);
}

/**
 * Organic foliage volume; rx/ry/rz are world radii.
 * @param {boolean} [castShadow=true] — set false on tiny puffs to cut shadow cost
 */
function softBlob(mat, rx, ry, rz, x, y, z, castShadow = true) {
  const mesh = new THREE.Mesh(FOLIAGE_SPHERE, mat);
  mesh.scale.set(rx, ry, rz);
  mesh.position.set(x, y, z);
  mesh.castShadow = !!castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

function addCollider(colliders, mesh, inflate = 0) {
  // Force local matrix (rotation/position) into world matrix before AABB
  mesh.updateMatrix();
  mesh.updateWorldMatrix(true, true);
  const b = new THREE.Box3().setFromObject(mesh);
  if (inflate) b.expandByScalar(inflate);
  colliders.push({ box: b, solid: true });
}

function addFloor(floors, minX, maxX, minZ, maxZ, y) {
  floors.push({ minX, maxX, minZ, maxZ, y });
}

/** Thin floor/ceiling slab that blocks shots/LOS but not walking (h < MIN_SOLID_HEIGHT). */
function addShotFloor(colliders, minX, maxX, minZ, maxZ, y, meta = {}) {
  const w = maxX - minX;
  const d = maxZ - minZ;
  if (w < 0.05 || d < 0.05) return;
  const h = 0.28; // < 0.35 so player/bot body filter ignores it
  addAabbCollider(colliders, (minX + maxX) / 2, y - h / 2, (minZ + maxZ) / 2, w, h, d, {
    kind: 'house_floor',
    blocksShot: true,
    solid: true,
    ...meta,
  });
}

function addAabbCollider(colliders, x, y, z, w, h, d, meta = {}) {
  colliders.push(makeAabbCollider(x, y, z, w, h, d, meta));
}

/**
 * Build the pastel Nuketown arena into `scene`.
 * Returns colliders, floors, spawn/cover/waypoint data for gameplay systems.
 */
export function buildMap(scene) {
  const group = new THREE.Group();
  group.name = 'PastelNuketown';
  const colliders = [];
  const floors = [];
  /** Interactive swing doors (E to toggle; solid when closed) */
  const doors = [];
  /** Roof surfaces eligible for double-Space edge mantle */
  const roofMantleZones = [];
  const spawnPoints = [];
  const coverPoints = [];
  const waypoints = [];

  /**
   * Build a wood swing-door leaf on a Y-pivot + hollow casing. Registers collider + door record.
   * Leaf local +X extends from hinge; openYaw swings inward.
   */
  function addSwingDoor(opts) {
    const {
      parent,
      name,
      houseTag,
      kind,
      hingeLocal,
      leafW,
      leafH,
      leafD = 0.1,
      openYaw,
      frameColor = 0xfffaf5,
      woodColor = 0xd4a574,
      accentColor = 0xff8fab,
      // world-space doorway collider (closed)
      colX,
      colY,
      colZ,
      colW,
      colH,
      colD,
      interactX,
      interactZ,
    } = opts;

    // Hollow casing around opening (does not fill the door plane)
    const frame = new THREE.Group();
    frame.name = `${name}_frame`;
    const ft = 0.09;
    const fx = hingeLocal.x + leafW / 2;
    const fz = hingeLocal.z;
    const fy = hingeLocal.y;
    // For front doors leaf spans X; for side doors we pass leafW along the wall axis and
    // set hingeLocal so +X of pivot aligns with wall tangent — frame uses world-ish local boxes.
    const frameR = softR(ft, ft, leafD + 0.06, 0.04);
    if (kind === 'front') {
      frame.add(
        rbox(ft, leafH + ft * 2, leafD + 0.06, frameColor, fx - leafW / 2, fy, fz, { radius: frameR })
      );
      frame.add(
        rbox(ft, leafH + ft * 2, leafD + 0.06, frameColor, fx + leafW / 2, fy, fz, { radius: frameR })
      );
      frame.add(
        rbox(leafW + ft * 2, ft, leafD + 0.06, frameColor, fx, fy + leafH / 2 + ft / 2, fz, {
          radius: frameR,
        })
      );
      frame.add(
        rbox(leafW + ft * 2, ft, leafD + 0.06, frameColor, fx, fy - leafH / 2 - ft / 2, fz, {
          radius: frameR,
        })
      );
    } else {
      // Side door: opening spans Z; hinge at one Z end, leaf +X maps to +Z via pivot yaw 0
      // Frame strips in house local (thin X, tall Y, along Z)
      const zc = hingeLocal.z + leafW / 2;
      const xc = hingeLocal.x;
      frame.add(
        rbox(leafD + 0.06, leafH + ft * 2, ft, frameColor, xc, fy, zc - leafW / 2, { radius: frameR })
      );
      frame.add(
        rbox(leafD + 0.06, leafH + ft * 2, ft, frameColor, xc, fy, zc + leafW / 2, { radius: frameR })
      );
      frame.add(
        rbox(leafD + 0.06, ft, leafW + ft * 2, frameColor, xc, fy + leafH / 2 + ft / 2, zc, {
          radius: frameR,
        })
      );
      frame.add(
        rbox(leafD + 0.06, ft, leafW + ft * 2, frameColor, xc, fy - leafH / 2 - ft / 2, zc, {
          radius: frameR,
        })
      );
    }
    parent.add(frame);

    // Outer mount (position + optional side-door basis). Inner pivot is swing-only.
    const mount = new THREE.Group();
    mount.name = `${name}_mount`;
    mount.position.set(hingeLocal.x, hingeLocal.y, hingeLocal.z);
    if (kind === 'side') {
      // Local +X of swing pivot runs along +Z (wall tangent)
      mount.rotation.y = -Math.PI / 2;
    }
    const pivot = new THREE.Group();
    pivot.name = name;

    const leaf = new THREE.Group();
    leaf.name = `${name}_leaf`;
    // Main slab — wood both faces (thick enough, not a grey noise plane)
    const panel = rbox(leafW - 0.04, leafH - 0.04, leafD, woodColor, leafW / 2, 0, 0, {
      kind: 'wood',
      radius: softR(leafW - 0.04, leafH - 0.04, leafD, 0.05),
    });
    panel.name = `${name}_panel`;
    leaf.add(panel);
    // Recessed inner panel
    leaf.add(
      rbox(leafW * 0.55, leafH * 0.35, leafD + 0.02, 0xe8c9a0, leafW / 2, leafH * 0.18, 0, {
        kind: 'wood',
        radius: softR(leafW * 0.55, leafH * 0.35, leafD + 0.02, 0.04),
      })
    );
    leaf.add(
      rbox(leafW * 0.55, leafH * 0.35, leafD + 0.02, 0xe8c9a0, leafW / 2, -leafH * 0.18, 0, {
        kind: 'wood',
        radius: softR(leafW * 0.55, leafH * 0.35, leafD + 0.02, 0.04),
      })
    );
    // Cross rail + stile
    leaf.add(
      rbox(leafW - 0.08, 0.08, leafD + 0.03, 0xb8956a, leafW / 2, 0, 0, {
        kind: 'wood',
        radius: softR(leafW - 0.08, 0.08, leafD + 0.03, 0.04),
      })
    );
    leaf.add(
      rbox(0.08, leafH - 0.1, leafD + 0.03, 0xb8956a, leafW / 2, 0, 0, {
        kind: 'wood',
        radius: softR(0.08, leafH - 0.1, leafD + 0.03, 0.04),
      })
    );
    // Handle (room-side + street-side knobs)
    const handleX = leafW * 0.82;
    leaf.add(rbox(0.08, 0.08, 0.14, 0xfff0c8, handleX, 0, leafD * 0.9, { radius: 0.04 }));
    leaf.add(rbox(0.08, 0.08, 0.14, 0xfff0c8, handleX, 0, -leafD * 0.9, { radius: 0.04 }));
    leaf.add(rbox(0.05, 0.22, 0.05, accentColor, handleX, 0, leafD * 0.55, { radius: 0.04 }));
    pivot.add(leaf);
    mount.add(pivot);
    parent.add(mount);

    const collider = makeAabbCollider(colX, colY, colZ, colW, colH, colD, {
      kind: 'house_door',
      house: houseTag,
      part: name,
      solid: true,
    });
    colliders.push(collider);

    doors.push({
      name,
      house: houseTag,
      kind,
      pivot,
      openYaw,
      closedYaw: 0,
      open: false,
      anim: 0,
      // Y ≈ door mid-height so upstairs cannot toggle a ground-floor door
      interact: new THREE.Vector3(interactX, colY ?? 1.15, interactZ),
      collider,
    });
    return pivot;
  }

  const halfG = MAP_GROUND / 2;
  const wall = MAP_WALL;
  const roadHalf = ROAD_WIDTH / 2;

  // === GROUND (textured grass + layered patches / edge trim — Phase 3 outdoor) ===
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(MAP_GROUND, 0.4, MAP_GROUND),
    createGrassMat()
  );
  ground.name = 'ground';
  ground.userData.gfxDetail = 'grass_textured';
  ground.position.y = -0.2;
  ground.receiveShadow = true;
  group.add(ground);
  addFloor(floors, -halfG, halfG, -halfG, halfG, 0);

  const grassDress = new THREE.Group();
  grassDress.name = 'grass_dressing';
  group.add(grassDress);

  // Soft grass patches (multi-tone + slight height — breaks flat checker plane)
  const patchColors = [
    PASTEL.grassLight || 0xa8f5d0,
    PASTEL.grassDark || 0x5ed4a0,
    0x96f0c4,
    0xb8f5d8,
    0x6ed4a8,
    0x8fe8c0,
  ];
  // Shared mats by color (createGrassPatchMat caches; avoid sidewalk/house footprints)
  const walkWPreview = 3.6;
  const walkOuter = roadHalf + walkWPreview + 0.15 + walkWPreview / 2; // ~ sidewalk outer edge
  const onHouseFootprint = (x, z) =>
    Math.abs(Math.abs(x) - HOUSE_X) < 7 && Math.abs(z) < 7;
  const onHardscape = (x, z) => {
    // Road corridor
    if (Math.abs(x) < roadHalf + 1.4 && Math.abs(z) < 34) return true;
    // Sidewalk bands (both sides of road)
    if (Math.abs(x) > roadHalf + 0.2 && Math.abs(x) < walkOuter + 0.15 && Math.abs(z) < 34) {
      return true;
    }
    return false;
  };

  for (let i = 0; i < 96; i++) {
    const px = ((i * 19) % 76) - 38;
    const pz = ((i * 29) % 76) - 38;
    if (onHardscape(px, pz) || onHouseFootprint(px, pz)) continue;
    const pw = 1.2 + (i % 5) * 0.45;
    const pd = 1.0 + (i % 4) * 0.4;
    const ph = 0.04 + (i % 3) * 0.02;
    const col = patchColors[i % patchColors.length];
    const patch = new THREE.Mesh(
      new THREE.BoxGeometry(pw, ph, pd),
      createGrassPatchMat(col)
    );
    patch.name = i < 12 ? 'ground_detail_patch' : `grass_patch_${i}`;
    patch.position.set(px, ph * 0.45, pz);
    patch.receiveShadow = true;
    patch.castShadow = false;
    grassDress.add(patch);
  }

  // Soft height mounds (layered thin slabs — toy grass tufts, visual only)
  for (let i = 0; i < 28; i++) {
    const mx = ((i * 23) % 70) - 35;
    const mz = ((i * 31) % 70) - 35;
    if (onHardscape(mx, mz) || onHouseFootprint(mx, mz)) continue;
    const base = box(1.8 + (i % 3) * 0.35, 0.07, 1.5 + (i % 2) * 0.4, patchColors[i % 4], mx, 0.035, mz, {
      mat: createGrassPatchMat(patchColors[i % 4]),
      detailTag: `grass_mound_${i}`,
    });
    grassDress.add(base);
    grassDress.add(
      box(1.1 + (i % 2) * 0.25, 0.06, 0.95, patchColors[(i + 2) % 6], mx + 0.15, 0.08, mz - 0.1, {
        mat: createGrassPatchMat(patchColors[(i + 2) % 6]),
        detailTag: `grass_mound_top_${i}`,
      })
    );
  }

  // Road + curbs (noise-mapped pastel asphalt) with bevel lips
  const road = new THREE.Mesh(
    new THREE.BoxGeometry(ROAD_WIDTH, 0.08, ROAD_LENGTH),
    createRoadMat()
  );
  road.name = 'road';
  road.userData.gfxDetail = 'road_textured';
  road.position.set(0, 0.04, 0);
  road.receiveShadow = true;
  road.castShadow = false;
  group.add(road);
  // Dual-step curb (reads as rounded bevel via stacked boxes)
  group.add(box(0.34, 0.14, ROAD_LENGTH, 0xc8bdd8, -(roadHalf + 0.12), 0.07, 0));
  group.add(box(0.34, 0.14, ROAD_LENGTH, 0xc8bdd8, roadHalf + 0.12, 0.07, 0));
  group.add(box(0.18, 0.1, ROAD_LENGTH, 0xd8d0e8, -(roadHalf + 0.28), 0.14, 0));
  group.add(box(0.18, 0.1, ROAD_LENGTH, 0xd8d0e8, roadHalf + 0.28, 0.14, 0));
  // Cap highlight strip
  group.add(box(0.12, 0.05, ROAD_LENGTH, 0xfffaf5, -(roadHalf + 0.22), 0.2, 0));
  group.add(box(0.12, 0.05, ROAD_LENGTH, 0xfffaf5, roadHalf + 0.22, 0.2, 0));

  // Center dashes + edge markers
  for (let z = -34; z <= 34; z += 3) {
    group.add(box(0.28, 0.09, 1.5, 0xfff6a0, 0, 0.06, z));
  }
  for (let z = -32; z <= 32; z += 6) {
    group.add(box(0.12, 0.09, 0.55, 0xffffff, -(roadHalf - 0.35), 0.06, z));
    group.add(box(0.12, 0.09, 0.55, 0xffffff, roadHalf - 0.35, 0.06, z));
  }

  // Crosswalks at house mid-road (± house porch approach)
  for (const cz of [-7.5, 7.5, 0]) {
    for (let x = -(roadHalf - 0.6); x <= roadHalf - 0.6; x += 0.75) {
      const stripe = box(0.48, 0.09, 2.5, 0xfffaf0, x, 0.065, cz);
      stripe.name = 'crosswalk';
      group.add(stripe);
    }
  }

  // Sidewalks with curb lip + outer grass edge trim
  const walkW = 3.6;
  const walkZ = 68;
  const walkX = roadHalf + walkW / 2 + 0.15;
  group.add(box(walkW, 0.12, walkZ, COLORS.sidewalk, -walkX, 0.06, 0));
  group.add(box(walkW, 0.12, walkZ, COLORS.sidewalk, walkX, 0.06, 0));
  group.add(box(0.22, 0.2, walkZ, 0xd4cce0, -(roadHalf + 0.35), 0.1, 0));
  group.add(box(0.22, 0.2, walkZ, 0xd4cce0, roadHalf + 0.35, 0.1, 0));
  // Sidewalk outer bevel + seam line
  group.add(box(0.14, 0.08, walkZ, 0xe8e0f2, -(walkX + walkW / 2 - 0.05), 0.13, 0));
  group.add(box(0.14, 0.08, walkZ, 0xe8e0f2, walkX + walkW / 2 - 0.05, 0.13, 0));
  // Grass edge trim against sidewalk (darker ribbon — finishes the lawn cut)
  const edgeX = walkX + walkW / 2 + 0.35;
  const edgeStripL = box(0.55, 0.06, walkZ - 4, PASTEL.grassDark || 0x5ed4a0, -edgeX, 0.03, 0, {
    mat: createGrassPatchMat(PASTEL.grassDark || 0x5ed4a0),
    detailTag: 'grass_edge_trim_w',
  });
  const edgeStripR = box(0.55, 0.06, walkZ - 4, PASTEL.grassDark || 0x5ed4a0, edgeX, 0.03, 0, {
    mat: createGrassPatchMat(PASTEL.grassDark || 0x5ed4a0),
    detailTag: 'grass_edge_trim_e',
  });
  grassDress.add(edgeStripL);
  grassDress.add(edgeStripR);
  // Lighter inner fringe toward sidewalk
  grassDress.add(
    box(0.28, 0.045, walkZ - 6, PASTEL.grassLight || 0xa8f5d0, -edgeX + 0.22, 0.05, 0, {
      mat: createGrassPatchMat(PASTEL.grassLight || 0xa8f5d0),
      detailTag: 'grass_edge_fringe_w',
    })
  );
  grassDress.add(
    box(0.28, 0.045, walkZ - 6, PASTEL.grassLight || 0xa8f5d0, edgeX - 0.22, 0.05, 0, {
      mat: createGrassPatchMat(PASTEL.grassLight || 0xa8f5d0),
      detailTag: 'grass_edge_fringe_e',
    })
  );

  // === PERIMETER WALLS (+ cap / base trim — visual bevel cues) ===
  const wallH = 2.4;
  const span = wall * 2;
  const perimeter = [
    box(span + 1.2, wallH, 0.65, COLORS.wall, 0, wallH / 2, -wall),
    box(span + 1.2, wallH, 0.65, COLORS.wall, 0, wallH / 2, wall),
    box(0.65, wallH, span, COLORS.wall, -wall, wallH / 2, 0),
    box(0.65, wallH, span, COLORS.wall, wall, wallH / 2, 0),
  ];
  perimeter.forEach((w, i) => {
    w.name = `perimeter_${i}`;
    group.add(w);
    addCollider(colliders, w);
  });
  // Cap bands + base skirting (visual only — no extra colliders)
  // Name must NOT start with perimeter_ (check-map counts exactly 4 perimeter_* walls)
  const wallTrim = new THREE.Group();
  wallTrim.name = 'arena_wall_trim';
  group.add(wallTrim);
  wallTrim.add(box(span + 1.4, 0.16, 0.78, 0xfffaf5, 0, wallH + 0.06, -wall));
  wallTrim.add(box(span + 1.4, 0.16, 0.78, 0xfffaf5, 0, wallH + 0.06, wall));
  wallTrim.add(box(0.78, 0.16, span + 0.2, 0xfffaf5, -wall, wallH + 0.06, 0));
  wallTrim.add(box(0.78, 0.16, span + 0.2, 0xfffaf5, wall, wallH + 0.06, 0));
  wallTrim.add(box(span + 1.3, 0.22, 0.72, 0xd8d0e8, 0, 0.12, -wall));
  wallTrim.add(box(span + 1.3, 0.22, 0.72, 0xd8d0e8, 0, 0.12, wall));
  wallTrim.add(box(0.72, 0.22, span, 0xd8d0e8, -wall, 0.12, 0));
  wallTrim.add(box(0.72, 0.22, span, 0xd8d0e8, wall, 0.12, 0));
  // Mid belt course
  wallTrim.add(box(span + 1.25, 0.12, 0.7, 0xc9a0e8, 0, wallH * 0.55, -wall));
  wallTrim.add(box(span + 1.25, 0.12, 0.7, 0xc9a0e8, 0, wallH * 0.55, wall));
  wallTrim.add(box(0.7, 0.12, span, 0xc9a0e8, -wall, wallH * 0.55, 0));
  wallTrim.add(box(0.7, 0.12, span, 0xc9a0e8, wall, wallH * 0.55, 0));

  // === HOUSE BUILDER ===
  function buildHouse(cx, cz, facadeColor, accentColor, flip) {
    const house = new THREE.Group();
    house.name = flip ? 'house_east' : 'house_west';
    const houseTag = flip ? 'east' : 'west';
    const W = 11;
    const D = 10;
    const floor2 = 3.1;
    const wallT = 0.35;

    // L1 floor — plank texture (match outdoor material richness)
    const f1 = box(W - wallT * 0.5, 0.22, D - wallT * 0.5, 0xe8c9a0, 0, 0.11, 0, { kind: 'floor' });
    f1.name = flip ? 'floor_l1_east' : 'floor_l1_west';
    house.add(f1);
    // Ground floor walkable — stairwell still has L1 under the stairs (fine)
    addFloor(floors, cx - W / 2 + 0.3, cx + W / 2 - 0.3, cz - D / 2 + 0.3, cz + D / 2 - 0.3, 0.25);

    // L2 slab is built AFTER stairs so we can leave a real stairwell hole
    // (prevents getting trapped upstairs with no way down).

    const walls = [];
    const frontZ = flip ? D / 2 : -D / 2;
    const backZ = flip ? -D / 2 : D / 2;
    const doorW = 1.6;
    // L1 front walls must reach L2 slab underside (floor2) — old h=2.6 topped at 2.7 → outdoor gap
    const l1FrontH = floor2 + 0.02; // top ≈ 3.12, overlaps slab bottom (~2.98)
    const l1FrontY = l1FrontH / 2;
    const doorTop = 2.38;
    const lintelH = Math.max(0.35, floor2 - doorTop + 0.04);
    const lintelY = doorTop + lintelH / 2;

    const facadeOpts = { kind: 'facade', detailTag: 'facade_detail', radius: softR(wallT, wallT, wallT, 0.08) };
    const wallR = softR(wallT, 1, 1, 0.08);
    walls.push(
      rbox((W - doorW) / 2, l1FrontH, wallT, facadeColor, -(W + doorW) / 4, l1FrontY, frontZ, {
        ...facadeOpts,
        radius: wallR,
      })
    );
    walls.push(
      rbox((W - doorW) / 2, l1FrontH, wallT, facadeColor, (W + doorW) / 4, l1FrontY, frontZ, {
        ...facadeOpts,
        radius: wallR,
      })
    );
    // L2 front wall split around window openings (visual gaps match shot-through colliders)
    // Floor top is L2y = floor2+0.1 — sill MUST sit on that surface (no grass-visible gap).
    const L2yEarly = floor2 + 0.1;
    const l2WinW = 1.5;
    const l2WinXs = [-2.7, 2.7];
    const l2SillH = 0.65;
    const l2OpenH = 1.15; // glass opening height (mid band)
    const l2OpenY = L2yEarly + l2SillH + l2OpenH / 2;
    // Sill band under windows — bottom flush with L2 floor top
    walls.push(
      rbox(W, l2SillH, wallT, facadeColor, 0, L2yEarly + l2SillH / 2, frontZ, {
        ...facadeOpts,
        radius: softR(W, l2SillH, wallT, 0.07),
      })
    );
    // Vertical piers between / beside window openings (mid-height open)
    {
      const halfW = W / 2;
      const gaps = l2WinXs.map((wx) => [wx - l2WinW / 2, wx + l2WinW / 2]);
      let cursor = -halfW;
      const piers = [];
      for (const [g0, g1] of gaps) {
        if (g0 - cursor > 0.12) piers.push([cursor, g0]);
        cursor = g1;
      }
      if (halfW - cursor > 0.12) piers.push([cursor, halfW]);
      for (const [a, b] of piers) {
        const segW = b - a;
        const segX = (a + b) / 2;
        walls.push(
          rbox(segW, l2OpenH, wallT, facadeColor, segX, l2OpenY, frontZ, {
            ...facadeOpts,
            radius: softR(segW, l2OpenH, wallT, 0.07),
          })
        );
      }
    }
    // Header / lintel above window band
    const l2HeaderH = 0.55;
    const l2HeaderY = L2yEarly + l2SillH + l2OpenH + l2HeaderH / 2;
    walls.push(
      rbox(W, l2HeaderH, wallT, facadeColor, 0, l2HeaderY, frontZ, {
        ...facadeOpts,
        radius: softR(W, l2HeaderH, wallT, 0.07),
      })
    );
    // Door lintel — fills door-top → L2 slab (no outdoor strip above entry)
    walls.push(
      rbox(doorW + 0.25, lintelH, wallT + 0.06, accentColor, 0, lintelY, frontZ, {
        kind: 'facade',
        roughness: 0.7,
        radius: softR(doorW + 0.25, lintelH, wallT + 0.06, 0.06),
      })
    );
    walls.push(
      rbox(W, 5.4, wallT, facadeColor, 0, 2.8, backZ, {
        ...facadeOpts,
        radius: softR(W, 5.4, wallT, 0.09),
      })
    );

    // Outer side wall (garage side) stays solid
    const outerX = flip ? W / 2 : -W / 2;
    const innerX = flip ? -W / 2 : W / 2;
    walls.push(
      rbox(wallT, 5.4, D, facadeColor, outerX, 2.8, 0, {
        ...facadeOpts,
        radius: softR(wallT, 5.4, D, 0.09),
      })
    );

    // Inner side wall (road side) — split with side-exit door gap (2nd exterior route)
    const sideDoorLocalZ = flip ? 2.2 : -2.2;
    const sideDoorW = 1.55;
    const doorZ0 = sideDoorLocalZ - sideDoorW / 2;
    const doorZ1 = sideDoorLocalZ + sideDoorW / 2;
    // Segment south of gap (−Z half of house local)
    const segA0 = -D / 2;
    const segA1 = doorZ0;
    const segALen = Math.max(0.2, segA1 - segA0);
    const segAZ = (segA0 + segA1) / 2;
    // Segment north of gap (+Z)
    const segB0 = doorZ1;
    const segB1 = D / 2;
    const segBLen = Math.max(0.2, segB1 - segB0);
    const segBZ = (segB0 + segB1) / 2;
    walls.push(
      rbox(wallT, 5.4, segALen, facadeColor, innerX, 2.8, segAZ, {
        kind: 'facade',
        radius: softR(wallT, 5.4, segALen, 0.08),
      })
    );
    walls.push(
      rbox(wallT, 5.4, segBLen, facadeColor, innerX, 2.8, segBZ, {
        kind: 'facade',
        radius: softR(wallT, 5.4, segBLen, 0.08),
      })
    );
    // Lintel above side door
    walls.push(
      rbox(wallT + 0.05, 2.4, sideDoorW + 0.15, facadeColor, innerX, floor2 + 1.2, sideDoorLocalZ, {
        kind: 'facade',
        radius: softR(wallT + 0.05, 2.4, sideDoorW + 0.15, 0.07),
      })
    );
    walls.push(
      rbox(wallT + 0.08, 0.3, sideDoorW + 0.2, accentColor, innerX, 2.55, sideDoorLocalZ, {
        kind: 'facade',
        radius: softR(wallT + 0.08, 0.3, sideDoorW + 0.2, 0.05),
      })
    );
    // Interior partition — keep sharp box (not outdoor-visible priority)
    walls.push(box(wallT, 2.5, D * 0.45, 0xe8dcc8, 1.2, 1.35, -1));
    walls.forEach((w) => house.add(w));

    // Interactive doors — named markers kept for tests / navigation
    const sideExit = new THREE.Group();
    sideExit.name = flip ? 'side_exit_east' : 'side_exit_west';
    house.add(sideExit);

    const doorZ = frontZ + (flip ? 0.06 : -0.06);
    const frontLeafW = 1.42;
    const frontLeafH = 2.28;
    // Hinge on −X of opening; leaf extends +X. West opens into +Z (+90°), east into −Z (−90°).
    const frontDoorName = flip ? 'door_front_east' : 'door_front_west';
    addSwingDoor({
      parent: house,
      name: frontDoorName,
      houseTag,
      kind: 'front',
      hingeLocal: { x: -frontLeafW / 2, y: frontLeafH / 2 + 0.06, z: doorZ },
      leafW: frontLeafW,
      leafH: frontLeafH,
      leafD: 0.11,
      openYaw: flip ? -Math.PI / 2 : Math.PI / 2,
      frameColor: 0xfffaf5,
      woodColor: 0xd4a574,
      accentColor,
      colX: cx,
      colY: frontLeafH / 2 + 0.06,
      colZ: cz + frontZ,
      colW: doorW - 0.15,
      colH: frontLeafH,
      colD: wallT + 0.35,
      interactX: cx,
      interactZ: cz + frontZ,
    });

    // Side exit swing door
    const sideLeafW = 1.35;
    const sideLeafH = 2.2;
    const sideDoorName = flip ? 'door_side_east' : 'door_side_west';
    {
      // Hinge at −Z end of opening; addSwingDoor side mode maps local +X → +Z
      const hingeZ = sideDoorLocalZ - sideLeafW / 2;
      const sideOpenYaw = flip ? Math.PI / 2 : -Math.PI / 2; // inward (−X west / +X east)
      addSwingDoor({
        parent: sideExit,
        name: sideDoorName,
        houseTag,
        kind: 'side',
        hingeLocal: {
          x: innerX + (flip ? -0.06 : 0.06),
          y: sideLeafH / 2 + 0.05,
          z: hingeZ,
        },
        leafW: sideLeafW,
        leafH: sideLeafH,
        leafD: 0.1,
        openYaw: sideOpenYaw,
        frameColor: 0xfffaf5,
        woodColor: 0xc4956a,
        accentColor,
        colX: cx + innerX,
        colY: sideLeafH / 2 + 0.05,
        colZ: cz + sideDoorLocalZ,
        colW: wallT + 0.35,
        colH: sideLeafH,
        colD: sideDoorW - 0.12,
        interactX: cx + innerX,
        interactZ: cz + sideDoorLocalZ,
      });
    }

    const porchZ = frontZ + (flip ? 1.0 : -1.0);
    house.add(
      rbox(3.4, 0.18, 1.7, COLORS.cream, 0, 0.12, porchZ, { radius: softR(3.4, 0.18, 1.7, 0.06) })
    );
    house.add(
      rbox(2.5, 0.14, 0.45, 0xe8d5b7, 0, 0.08, porchZ + (flip ? 0.95 : -0.95), {
        radius: softR(2.5, 0.14, 0.45, 0.05),
      })
    );
    house.add(
      rbox(2.1, 0.12, 0.4, 0xe0c9a8, 0, 0.05, porchZ + (flip ? 1.35 : -1.35), {
        radius: softR(2.1, 0.12, 0.4, 0.04),
      })
    );
    house.add(
      rbox(0.16, 2.4, 0.16, 0xffffff, -1.5, 1.3, porchZ + (flip ? 0.6 : -0.6), {
        radius: softR(0.16, 2.4, 0.16, 0.05),
      })
    );
    house.add(
      rbox(0.16, 2.4, 0.16, 0xffffff, 1.5, 1.3, porchZ + (flip ? 0.6 : -0.6), {
        radius: softR(0.16, 2.4, 0.16, 0.05),
      })
    );
    house.add(
      rbox(3.3, 0.14, 0.16, accentColor, 0, 2.55, porchZ + (flip ? 0.6 : -0.6), {
        radius: softR(3.3, 0.14, 0.16, 0.05),
      })
    );

    // Porch furniture (Phase 3)
    const porchSet = new THREE.Group();
    porchSet.name = flip ? 'porch_furniture_east' : 'porch_furniture_west';
    porchSet.add(
      rbox(0.55, 0.45, 0.55, accentColor, -1.15, 0.35, porchZ + (flip ? 0.15 : -0.15), {
        radius: softR(0.55, 0.45, 0.55, 0.08),
      })
    );
    porchSet.add(
      rbox(0.5, 0.12, 0.5, 0xfffaf5, -1.15, 0.6, porchZ + (flip ? 0.15 : -0.15), {
        radius: softR(0.5, 0.12, 0.5, 0.05),
      })
    );
    porchSet.add(
      rbox(0.55, 0.45, 0.55, accentColor, 1.15, 0.35, porchZ + (flip ? 0.15 : -0.15), {
        radius: softR(0.55, 0.45, 0.55, 0.08),
      })
    );
    porchSet.add(
      rbox(0.5, 0.12, 0.5, 0xfffaf5, 1.15, 0.6, porchZ + (flip ? 0.15 : -0.15), {
        radius: softR(0.5, 0.12, 0.5, 0.05),
      })
    );
    porchSet.add(
      rbox(0.7, 0.08, 0.4, 0xd4a574, 0, 0.42, porchZ + (flip ? 0.35 : -0.35), {
        radius: softR(0.7, 0.08, 0.4, 0.04),
      })
    );
    porchSet.add(
      rbox(0.35, 0.28, 0.35, 0xff8fab, 0.9, 0.55, porchZ + (flip ? -0.2 : 0.2), {
        radius: softR(0.35, 0.28, 0.35, 0.06),
      })
    ); // planter
    porchSet.add(
      rbox(0.22, 0.18, 0.22, 0x7dcea0, 0.9, 0.78, porchZ + (flip ? -0.2 : 0.2), {
        radius: softR(0.22, 0.18, 0.22, 0.05),
      })
    );
    // Extra porch clutter — visual only (keeps stoop walkable)
    porchSet.add(
      rbox(0.32, 0.22, 0.32, 0xc5b4e3, -0.85, 0.5, porchZ + (flip ? -0.25 : 0.25), {
        radius: softR(0.32, 0.22, 0.32, 0.05),
      })
    );
    porchSet.add(
      rbox(0.18, 0.16, 0.18, 0xffe066, -0.85, 0.7, porchZ + (flip ? -0.25 : 0.25), {
        radius: softR(0.18, 0.16, 0.18, 0.04),
      })
    );
    porchSet.add(
      rbox(0.45, 0.06, 0.35, 0xe8dcc8, -0.4, 0.22, porchZ + (flip ? 0.55 : -0.55), {
        radius: softR(0.45, 0.06, 0.35, 0.04),
      })
    );
    porchSet.add(
      rbox(0.4, 0.05, 0.3, 0xdccfb8, 0.35, 0.2, porchZ + (flip ? 0.6 : -0.6), {
        radius: softR(0.4, 0.05, 0.3, 0.04),
      })
    );
    house.add(porchSet);

    // Exterior facade trim / bevels (visual only — never colliders through doors/windows)
    const facadeTrim = new THREE.Group();
    facadeTrim.name = flip ? 'facade_trim_east' : 'facade_trim_west';
    const extTrim = 0xfffaf5;
    const frontOut = frontZ + (flip ? wallT * 0.55 : -wallT * 0.55);
    const backOut = backZ + (flip ? -wallT * 0.55 : wallT * 0.55);
    const halfFrontSkirt = (W - doorW) / 2 - 0.06;
    const trimR = softR(0.14, 0.2, 0.14, 0.05);
    // Foundation skirt — split at front door
    facadeTrim.add(
      rbox(halfFrontSkirt, 0.2, 0.14, extTrim, -(W + doorW) / 4, 0.12, frontOut, { radius: trimR })
    );
    facadeTrim.add(
      rbox(halfFrontSkirt, 0.2, 0.14, extTrim, (W + doorW) / 4, 0.12, frontOut, { radius: trimR })
    );
    facadeTrim.add(rbox(W + 0.05, 0.2, 0.14, extTrim, 0, 0.12, backOut, { radius: trimR }));
    facadeTrim.add(rbox(0.14, 0.2, D + 0.05, extTrim, -W / 2 - 0.02, 0.12, 0, { radius: trimR }));
    facadeTrim.add(rbox(0.14, 0.2, D + 0.05, extTrim, W / 2 + 0.02, 0.12, 0, { radius: trimR }));
    // Corner pilasters (rounded)
    for (const [cxp, czp] of [
      [-W / 2, frontZ],
      [W / 2, frontZ],
      [-W / 2, backZ],
      [W / 2, backZ],
    ]) {
      facadeTrim.add(
        rbox(0.28, l1FrontH + 0.1, 0.28, extTrim, cxp, l1FrontY, czp, {
          radius: softR(0.28, l1FrontH + 0.1, 0.28, 0.08),
        })
      );
      facadeTrim.add(
        rbox(0.34, 0.12, 0.34, accentColor, cxp, 0.22, czp, {
          radius: softR(0.34, 0.12, 0.34, 0.05),
        })
      );
      facadeTrim.add(
        rbox(0.32, 0.1, 0.32, accentColor, cxp, l1FrontH - 0.05, czp, {
          radius: softR(0.32, 0.1, 0.32, 0.05),
        })
      );
    }
    // Mid belt course around shell (front split at door)
    const beltY = 1.35;
    const beltR = softR(0.12, 0.12, 0.12, 0.05);
    facadeTrim.add(
      rbox(halfFrontSkirt, 0.12, 0.12, extTrim, -(W + doorW) / 4, beltY, frontOut, { radius: beltR })
    );
    facadeTrim.add(
      rbox(halfFrontSkirt, 0.12, 0.12, extTrim, (W + doorW) / 4, beltY, frontOut, { radius: beltR })
    );
    facadeTrim.add(rbox(W + 0.05, 0.12, 0.12, extTrim, 0, beltY, backOut, { radius: beltR }));
    facadeTrim.add(rbox(0.12, 0.12, D + 0.05, extTrim, -W / 2 - 0.02, beltY, 0, { radius: beltR }));
    facadeTrim.add(rbox(0.12, 0.12, D + 0.05, extTrim, W / 2 + 0.02, beltY, 0, { radius: beltR }));
    // Exterior window sills (L1 front + sides) — under glass, not in openings
    for (const wx of [-3.0, 3.0]) {
      facadeTrim.add(
        rbox(1.5, 0.1, 0.22, extTrim, wx, 1.05, frontZ + (flip ? 0.18 : -0.18), {
          radius: softR(1.5, 0.1, 0.22, 0.04),
        })
      );
      facadeTrim.add(
        rbox(1.45, 0.05, 0.08, accentColor, wx, 1.12, frontZ + (flip ? 0.22 : -0.22), {
          radius: softR(1.45, 0.05, 0.08, 0.04),
        })
      );
    }
    for (const sx of [-W / 2 - 0.05, W / 2 + 0.05]) {
      facadeTrim.add(rbox(0.22, 0.1, 1.3, extTrim, sx, 1.05, 0, { radius: softR(0.22, 0.1, 1.3, 0.04) }));
    }
    // Door stoop stones (path clutter — low, walkable, no collider)
    for (let i = 0; i < 4; i++) {
      const sz = porchZ + (flip ? 1.55 + i * 0.42 : -1.55 - i * 0.42);
      facadeTrim.add(
        rbox(0.7 - i * 0.04, 0.06, 0.38, 0xe8dcc8, (i % 2) * 0.08 - 0.04, 0.04, sz, {
          radius: softR(0.7 - i * 0.04, 0.06, 0.38, 0.04),
        })
      );
    }
    house.add(facadeTrim);

    // Windows: hollow frames + real see-through glass (solid frame boxes used to block view)
    const glassMat = createGlassMat(COLORS.window);
    const frameMat = createMat(0xfffaf5, { roughness: 0.55, metalness: 0.08, name: 'window_frame' });
    const winPositions = [
      // L1 front
      [-3.0, 1.6, frontZ + (flip ? 0.05 : -0.05), 'l1'],
      [3.0, 1.6, frontZ + (flip ? 0.05 : -0.05), 'l1'],
      // L2 front — align with wall opening mid band
      [-2.7, l2OpenY, frontZ + (flip ? 0.02 : -0.02), 'l2'],
      [2.7, l2OpenY, frontZ + (flip ? 0.02 : -0.02), 'l2'],
      // L1 side
      [-W / 2 - 0.02, 1.6, 0, 'side'],
      [W / 2 + 0.02, 1.6, 0, 'side'],
    ];
    let l2WinIndex = 0;
    for (const [x, y, z, tier] of winPositions) {
      const side = Math.abs(x) > W / 2 - 0.1;
      const openW = side ? 1.15 : 1.35;
      const openH = tier === 'l2' ? l2OpenH - 0.08 : 1.1;
      const t = 0.08; // frame thickness
      const depth = side ? 0.14 : 0.14;
      // Hollow frame = 4 strips (never a solid slab over the opening)
      const parts = side
        ? [
            // left/right verticals along Z extent, thin in X
            [t, openH + t * 2, depth, x, y, z - openW / 2],
            [t, openH + t * 2, depth, x, y, z + openW / 2],
            [t, t, openW, x, y + openH / 2 + t / 2, z],
            [t, t, openW, x, y - openH / 2 - t / 2, z],
          ]
        : [
            // left/right verticals
            [t, openH, depth, x - openW / 2, y, z],
            [t, openH, depth, x + openW / 2, y, z],
            // top/bottom
            [openW + t, t, depth, x, y + openH / 2, z],
            [openW + t, t, depth, x, y - openH / 2, z],
          ];
      const frameGroup = new THREE.Group();
      if (tier === 'l2') {
        frameGroup.name = flip
          ? `window_l2_east_${l2WinIndex}`
          : `window_l2_west_${l2WinIndex}`;
      }
      const frameSoftR = softR(t, t, depth, 0.04);
      for (const [pw, ph, pd, px, py, pz] of parts) {
        const strip = new THREE.Mesh(
          roundedBoxGeo(pw, ph, pd, softR(pw, ph, pd, frameSoftR), 2),
          frameMat
        );
        strip.position.set(px, py, pz);
        strip.castShadow = true;
        frameGroup.add(strip);
      }
      house.add(frameGroup);

      // Clear glass pane — thin, transparent, no depth write so outdoor shows through
      const glassW = side ? 0.04 : openW - t * 0.5;
      const glassH = openH - t * 0.5;
      const glassD = side ? openW - t * 0.5 : 0.04;
      const g = new THREE.Mesh(new THREE.BoxGeometry(glassW, glassH, glassD), glassMat);
      g.position.set(x, y, z);
      g.renderOrder = 2;
      if (tier === 'l2') {
        g.name = flip
          ? `window_l2_glass_east_${l2WinIndex}`
          : `window_l2_glass_west_${l2WinIndex}`;
        l2WinIndex += 1;
      } else {
        g.name = side ? 'window_side_glass' : 'window_l1_glass';
      }
      house.add(g);
      // Thin muntin cross (does not fill the pane)
      if (!side) {
        house.add(
          rbox(0.04, openH - 0.1, 0.05, 0xfffaf5, x, y, z + (flip ? 0.03 : -0.03), {
            radius: softR(0.04, openH - 0.1, 0.05, 0.04),
          })
        );
        house.add(
          rbox(openW - 0.15, 0.04, 0.05, 0xfffaf5, x, y, z + (flip ? 0.03 : -0.03), {
            radius: softR(openW - 0.15, 0.04, 0.05, 0.04),
          })
        );
      }
    }
    // Invisible markers at L2 opening centers (world-ready after house.position set)
    for (let i = 0; i < l2WinXs.length; i++) {
      const marker = new THREE.Object3D();
      marker.name = flip ? `window_l2_open_east_${i}` : `window_l2_open_west_${i}`;
      marker.position.set(l2WinXs[i], l2OpenY, frontZ);
      marker.userData.windowOpen = true;
      marker.userData.tier = 'l2';
      house.add(marker);
    }

    house.add(
      rbox(W + 0.1, 0.18, wallT + 0.15, 0xfffaf5, 0, 2.55, frontZ, {
        radius: softR(W + 0.1, 0.18, wallT + 0.15, 0.06),
      })
    );
    house.add(
      rbox(W + 0.1, 0.18, wallT + 0.15, 0xfffaf5, 0, 2.55, backZ, {
        radius: softR(W + 0.1, 0.18, wallT + 0.15, 0.06),
      })
    );

    const mainRoofMesh = rbox(W + 0.8, 0.35, D + 0.8, accentColor, 0, 5.7, 0, {
      radius: softR(W + 0.8, 0.35, D + 0.8, 0.1),
    });
    mainRoofMesh.name = flip ? 'main_roof_east' : 'main_roof_west';
    house.add(mainRoofMesh);
    house.add(
      rbox(W + 1.0, 0.12, D + 1.0, 0xfff0c8, 0, 5.48, 0, {
        radius: softR(W + 1.0, 0.12, D + 1.0, 0.06),
      })
    );
    house.add(
      rbox(W + 0.4, 0.5, 0.5, 0xfff0c8, 0, 6.1, 0, {
        radius: softR(W + 0.4, 0.5, 0.5, 0.1),
      })
    );
    for (let i = -3; i <= 3; i++) {
      house.add(
        rbox(W + 0.5, 0.06, 0.18, 0xf0c878, i * 0.05, 5.9, i * 0.95, {
          radius: softR(W + 0.5, 0.06, 0.18, 0.04),
        })
      );
    }
    // Walkable main roof (above L2) + mantle zone for double-Space edge grab
    const mainRoofY = 5.88;
    addFloor(
      floors,
      cx - W / 2 + 0.25,
      cx + W / 2 - 0.25,
      cz - D / 2 + 0.25,
      cz + D / 2 - 0.25,
      mainRoofY
    );
    addShotFloor(
      colliders,
      cx - W / 2 + 0.25,
      cx + W / 2 - 0.25,
      cz - D / 2 + 0.25,
      cz + D / 2 - 0.25,
      mainRoofY,
      { house: houseTag, part: 'main_roof_floor' }
    );
    roofMantleZones.push({
      minX: cx - W / 2 + 0.15,
      maxX: cx + W / 2 - 0.15,
      minZ: cz - D / 2 + 0.15,
      maxZ: cz + D / 2 - 0.15,
      y: mainRoofY,
      kind: 'main_roof',
      house: flip ? 'east' : 'west',
    });

    // === STAIRS (walkable up AND down) ===
    // Dense overlapping floor pads so the player never falls between steps.
    // Top aligns with L2; stairwell hole is cut in L2 below.
    const stairs = new THREE.Group();
    stairs.name = flip ? 'stairs_east' : 'stairs_west';
    const stairX = -3.35;
    const stairW = 2.15;
    const L2y = floor2 + 0.1; // 3.2
    const L1y = 0.25;
    const stepCount = 14;
    const rise = (L2y - L1y) / stepCount; // ~0.21 — within player step-up
    // Slightly longer run + less Z-overlap so Rapier autostep sees clean risers
    // (same idea as the exterior roof-climb rebuild).
    const run = 0.55;
    const stairStartZ = -3.15;
    const stairEndZ = stairStartZ + stepCount * run;
    for (let i = 0; i < stepCount; i++) {
      const topY = L1y + (i + 1) * rise;
      const z0 = stairStartZ + i * run;
      const zMid = z0 + run * 0.5;
      // Visual tread (thin plate at top of rise)
      stairs.add(box(stairW, Math.max(0.12, rise * 0.85), run + 0.06, 0xe8d5b7, stairX, topY - rise * 0.4, zMid));
      // Riser face
      stairs.add(box(stairW, rise, 0.08, 0xd4c4a8, stairX, topY - rise * 0.5, z0 + 0.04));
      // Walk pad per tread (modest overlap — Rapier uses step solids, not these pads)
      addFloor(
        floors,
        cx + stairX - stairW / 2,
        cx + stairX + stairW / 2,
        cz + z0 - 0.06,
        cz + z0 + run + 0.12,
        topY
      );
      // Solid tread — keep h ≥ 0.35 for legacy AABB; Rapier rebuilds real risers
      const treadH = Math.max(0.36, rise + 0.16);
      addAabbCollider(
        colliders,
        cx + stairX,
        topY - treadH * 0.5,
        cz + zMid,
        stairW * 0.92,
        treadH,
        run * 0.92,
        { kind: 'stair_tread', house: houseTag, chain: 'interior', step: i }
      );
    }
    // Top landing strip into L2
    addFloor(
      floors,
      cx + stairX - stairW / 2,
      cx + stairX + stairW / 2,
      cz + stairEndZ - 0.15,
      cz + stairEndZ + 0.55,
      L2y
    );
    // Handrail (visual only)
    stairs.add(box(0.08, 0.9, stairEndZ - stairStartZ, 0xfffaf5, stairX + stairW / 2 - 0.1, 1.4, (stairStartZ + stairEndZ) / 2));
    house.add(stairs);

    // Stairwell hole bounds (world) — L2 must NOT cover this rectangle
    const holeMinX = cx + stairX - stairW / 2 - 0.08;
    const holeMaxX = cx + stairX + stairW / 2 + 0.08;
    const holeMinZ = cz + stairStartZ - 0.25;
    const holeMaxZ = cz + stairEndZ + 0.45;

    // L2 walkable segments — extend to interior face of exterior walls (no grass gap)
    const wallInset = wallT * 0.45; // meet wall mesh, not inset 0.4m
    const l2MinX = cx - W / 2 + wallInset;
    const l2MaxX = cx + W / 2 - wallInset;
    const l2MinZ = cz - D / 2 + wallInset;
    const l2MaxZ = cz + D / 2 - wallInset;
    const l2SlabH = 0.28; // thicker so underside meets raised L1 front walls cleanly
    const l2SlabY = L2y - l2SlabH / 2; // top of slab = L2y (walk surface)
    const floorOpts = { kind: 'floor' };
    const ceilOpts = { kind: 'ceiling' };
    // Visual L2: slabs fill wall-to-wall around stairwell hole
    // Left of stairwell
    if (holeMinX > l2MinX + 0.05) {
      const w = holeMinX - l2MinX;
      const dFull = l2MaxZ - l2MinZ;
      const lx = (l2MinX + holeMinX) / 2 - cx;
      const lz = (l2MinZ + l2MaxZ) / 2 - cz;
      house.add(box(w, l2SlabH, dFull, 0xe0b888, lx, l2SlabY, lz, floorOpts));
      // Ceiling face under slab (cooler tone — reads as finished ceiling from L1)
      house.add(box(w - 0.04, 0.04, dFull - 0.04, 0xf2ebe2, lx, l2SlabY - l2SlabH / 2 - 0.02, lz, ceilOpts));
      addFloor(floors, l2MinX, holeMinX, l2MinZ, l2MaxZ, L2y);
      addShotFloor(colliders, l2MinX, holeMinX, l2MinZ, l2MaxZ, L2y, {
        house: houseTag,
        part: 'l2_floor_left',
      });
    }
    // Right of stairwell
    if (l2MaxX > holeMaxX + 0.05) {
      const w = l2MaxX - holeMaxX;
      const dFull = l2MaxZ - l2MinZ;
      const lx = (holeMaxX + l2MaxX) / 2 - cx;
      const lz = (l2MinZ + l2MaxZ) / 2 - cz;
      house.add(box(w, l2SlabH, dFull, 0xe0b888, lx, l2SlabY, lz, floorOpts));
      house.add(box(w - 0.04, 0.04, dFull - 0.04, 0xf2ebe2, lx, l2SlabY - l2SlabH / 2 - 0.02, lz, ceilOpts));
      addFloor(floors, holeMaxX, l2MaxX, l2MinZ, l2MaxZ, L2y);
      addShotFloor(colliders, holeMaxX, l2MaxX, l2MinZ, l2MaxZ, L2y, {
        house: houseTag,
        part: 'l2_floor_right',
      });
    }
    // In X-range of hole: only Z bands outside stair run (front / back of well)
    if (holeMinZ > l2MinZ + 0.05) {
      const d = holeMinZ - l2MinZ;
      const lx = (holeMinX + holeMaxX) / 2 - cx;
      const lz = (l2MinZ + holeMinZ) / 2 - cz;
      house.add(box(holeMaxX - holeMinX, l2SlabH, d, 0xe0b888, lx, l2SlabY, lz, floorOpts));
      house.add(
        box(holeMaxX - holeMinX - 0.04, 0.04, d - 0.04, 0xf2ebe2, lx, l2SlabY - l2SlabH / 2 - 0.02, lz, ceilOpts)
      );
      addFloor(floors, holeMinX, holeMaxX, l2MinZ, holeMinZ, L2y);
      addShotFloor(colliders, holeMinX, holeMaxX, l2MinZ, holeMinZ, L2y, {
        house: houseTag,
        part: 'l2_floor_front',
      });
    }
    if (l2MaxZ > holeMaxZ + 0.05) {
      const d = l2MaxZ - holeMaxZ;
      const lx = (holeMinX + holeMaxX) / 2 - cx;
      const lz = (holeMaxZ + l2MaxZ) / 2 - cz;
      house.add(box(holeMaxX - holeMinX, l2SlabH, d, 0xe0b888, lx, l2SlabY, lz, floorOpts));
      house.add(
        box(holeMaxX - holeMinX - 0.04, 0.04, d - 0.04, 0xf2ebe2, lx, l2SlabY - l2SlabH / 2 - 0.02, lz, ceilOpts)
      );
      addFloor(floors, holeMinX, holeMaxX, holeMaxZ, l2MaxZ, L2y);
      addShotFloor(colliders, holeMinX, holeMaxX, holeMaxZ, l2MaxZ, L2y, {
        house: houseTag,
        part: 'l2_floor_back',
      });
    }

    // Floor joist / rim beam — seals L1 wall-top ↔ L2 slab at the front plane (and sides)
    const joistH = 0.32;
    const joistY = floor2 - joistH / 2; // sits under walk surface, overlaps raised L1 walls
    const joistOpts = { kind: 'wood', radius: softR(wallT + 0.12, joistH, wallT + 0.12, 0.06) };
    house.add(rbox(W - 0.1, joistH, wallT + 0.12, 0xc4a07a, 0, joistY, frontZ, joistOpts));
    house.add(rbox(W - 0.1, joistH, wallT + 0.12, 0xc4a07a, 0, joistY, backZ, joistOpts));
    house.add(rbox(wallT + 0.12, joistH, D - 0.1, 0xc4a07a, outerX, joistY, 0, joistOpts));
    house.add(rbox(wallT + 0.12, joistH, D - 0.1, 0xc4a07a, innerX, joistY, 0, joistOpts));

    // Interior skirting L2 + L1 + crown at L1 ceiling joint
    const skirtH = 0.16;
    const skirtY = L2y + skirtH / 2;
    const trimCol = 0xfff8f0;
    const fzIn = frontZ - (flip ? wallT * 0.35 : -wallT * 0.35);
    const bzIn = backZ - (flip ? -wallT * 0.35 : wallT * 0.35);
    const oxIn = outerX - (flip ? -wallT * 0.35 : wallT * 0.35);
    const ixIn = innerX - (flip ? wallT * 0.35 : -wallT * 0.35);
    // L2 baseboards
    house.add(box(W - wallT, skirtH, 0.09, trimCol, 0, skirtY, fzIn));
    house.add(box(W - wallT, skirtH, 0.09, trimCol, 0, skirtY, bzIn));
    house.add(box(0.09, skirtH, D - wallT, trimCol, oxIn, skirtY, 0));
    house.add(box(0.09, skirtH, D - wallT, trimCol, ixIn, skirtY, 0));
    // L1 baseboards — split around front door (never draw a bar through the opening)
    const skirt1Y = 0.25 + skirtH / 2;
    const frontSkirtW = (W - doorW) / 2 - 0.08;
    house.add(box(frontSkirtW, skirtH, 0.09, trimCol, -(W + doorW) / 4, skirt1Y, fzIn));
    house.add(box(frontSkirtW, skirtH, 0.09, trimCol, (W + doorW) / 4, skirt1Y, fzIn));
    house.add(box(W - wallT, skirtH, 0.09, trimCol, 0, skirt1Y, bzIn));
    house.add(box(0.09, skirtH, D - wallT, trimCol, oxIn, skirt1Y, 0));
    house.add(box(0.09, skirtH, segALen - 0.1, trimCol, ixIn, skirt1Y, segAZ));
    house.add(box(0.09, skirtH, segBLen - 0.1, trimCol, ixIn, skirt1Y, segBZ));
    // L1 crown molding under joist — also split at front door
    const crownH = 0.12;
    const crownY = joistY - joistH / 2 - crownH / 2;
    house.add(box(frontSkirtW, crownH, 0.1, trimCol, -(W + doorW) / 4, crownY, fzIn));
    house.add(box(frontSkirtW, crownH, 0.1, trimCol, (W + doorW) / 4, crownY, fzIn));
    house.add(box(W - wallT, crownH, 0.1, trimCol, 0, crownY, bzIn));
    house.add(box(0.1, crownH, D - wallT, trimCol, oxIn, crownY, 0));
    house.add(box(0.1, crownH, segALen - 0.1, trimCol, ixIn, crownY, segAZ));
    house.add(box(0.1, crownH, segBLen - 0.1, trimCol, ixIn, crownY, segBZ));

    const balZ = frontZ + (flip ? 1.2 : -1.2);
    house.add(
      rbox(6.2, 0.18, 1.8, COLORS.cream, 0, floor2 + 0.05, balZ, {
        radius: softR(6.2, 0.18, 1.8, 0.06),
      })
    );
    addFloor(floors, cx - 3.1, cx + 3.1, cz + balZ - 0.9, cz + balZ + 0.9, floor2 + 0.15);
    house.add(
      rbox(6.4, 0.7, 0.12, 0xffffff, 0, floor2 + 0.5, balZ + (flip ? 0.85 : -0.85), {
        radius: softR(6.4, 0.7, 0.12, 0.05),
      })
    );
    house.add(
      rbox(0.12, 0.7, 1.8, 0xffffff, -3.2, floor2 + 0.5, balZ, {
        radius: softR(0.12, 0.7, 1.8, 0.05),
      })
    );
    house.add(
      rbox(0.12, 0.7, 1.8, 0xffffff, 3.2, floor2 + 0.5, balZ, {
        radius: softR(0.12, 0.7, 1.8, 0.05),
      })
    );
    // Balcony railing posts (detail) + planters
    const balconyDetail = new THREE.Group();
    balconyDetail.name = flip ? 'balcony_detail_east' : 'balcony_detail_west';
    for (let i = -2; i <= 2; i++) {
      balconyDetail.add(
        rbox(0.08, 0.55, 0.08, 0xffffff, i * 1.2, floor2 + 0.45, balZ + (flip ? 0.85 : -0.85), {
          radius: softR(0.08, 0.55, 0.08, 0.04),
        })
      );
    }
    balconyDetail.add(
      rbox(0.4, 0.28, 0.35, 0xffb6c1, -2.4, floor2 + 0.35, balZ + (flip ? 0.2 : -0.2), {
        radius: softR(0.4, 0.28, 0.35, 0.06),
      })
    );
    balconyDetail.add(
      rbox(0.22, 0.2, 0.22, 0x7dcea0, -2.4, floor2 + 0.58, balZ + (flip ? 0.2 : -0.2), {
        radius: softR(0.22, 0.2, 0.22, 0.05),
      })
    );
    balconyDetail.add(
      rbox(0.4, 0.28, 0.35, 0xc5b4e3, 2.4, floor2 + 0.35, balZ + (flip ? 0.2 : -0.2), {
        radius: softR(0.4, 0.28, 0.35, 0.06),
      })
    );
    balconyDetail.add(
      rbox(0.22, 0.2, 0.22, 0x6bc490, 2.4, floor2 + 0.58, balZ + (flip ? 0.2 : -0.2), {
        radius: softR(0.22, 0.2, 0.22, 0.05),
      })
    );
    house.add(balconyDetail);

    house.add(
      rbox(0.8, 1.4, 0.8, accentColor, 3.2, 6.5, -2, {
        radius: softR(0.8, 1.4, 0.8, 0.1),
      })
    );

    // Garage / carport on outer side (visual + solid colliders)
    const gSide = flip ? 1 : -1;
    const gW = 4.2;
    const gD = 5.5;
    const gH = 2.6;
    const gx = gSide * (W / 2 + gW / 2 - 0.05);
    const gz = 0.4;
    const garage = new THREE.Group();
    garage.name = flip ? 'garage_east' : 'garage_west';
    // Slab floor
    garage.add(
      rbox(gW, 0.18, gD, 0xd8d0e0, gx, 0.09, gz, { radius: softR(gW, 0.18, gD, 0.06) })
    );
    addFloor(
      floors,
      cx + gx - gW / 2 + 0.2,
      cx + gx + gW / 2 - 0.2,
      cz + gz - gD / 2 + 0.2,
      cz + gz + gD / 2 - 0.2,
      0.18
    );
    // Back wall (yard-facing), outer side wall, partial front posts — open toward street
    const backLocalZ = flip ? -gD / 2 : gD / 2;
    const openLocalZ = flip ? gD / 2 : -gD / 2;
    garage.add(
      rbox(gW, gH, 0.28, facadeColor, gx, gH / 2, gz + backLocalZ * 0.95, {
        kind: 'facade',
        radius: softR(gW, gH, 0.28, 0.08),
      })
    );
    garage.add(
      rbox(0.28, gH, gD, facadeColor, gx + gSide * (gW / 2 - 0.1), gH / 2, gz, {
        kind: 'facade',
        radius: softR(0.28, gH, gD, 0.08),
      })
    );
    // Street-side posts + lintel (carport opening)
    garage.add(
      rbox(0.28, gH, 0.28, 0xfffaf5, gx - gW * 0.35, gH / 2, gz + openLocalZ * 0.9, {
        radius: softR(0.28, gH, 0.28, 0.08),
      })
    );
    garage.add(
      rbox(0.28, gH, 0.28, 0xfffaf5, gx + gW * 0.35, gH / 2, gz + openLocalZ * 0.9, {
        radius: softR(0.28, gH, 0.28, 0.08),
      })
    );
    garage.add(
      rbox(gW, 0.28, 0.32, accentColor, gx, gH - 0.1, gz + openLocalZ * 0.9, {
        radius: softR(gW, 0.28, 0.32, 0.08),
      })
    );
    // Flat roof (walkable elevated surface — Phase 4b)
    const roofY = gH + 0.22;
    const garageRoof = rbox(gW + 0.4, 0.22, gD + 0.3, accentColor, gx, roofY, gz, {
      radius: softR(gW + 0.4, 0.22, gD + 0.3, 0.08),
    });
    garageRoof.name = flip ? 'garage_roof_east' : 'garage_roof_west';
    garage.add(garageRoof);
    garage.add(
      rbox(gW + 0.5, 0.1, gD + 0.4, 0xfff0c8, gx, gH - 0.05, gz, {
        radius: softR(gW + 0.5, 0.1, gD + 0.4, 0.05),
      })
    );
    house.add(garage);

    // Garage colliders (world space)
    const gWorldX = cx + gx;
    const gWorldZ = cz + gz;
    addAabbCollider(colliders, gWorldX, gH / 2, gWorldZ + backLocalZ * 0.95, gW, gH, 0.35);
    // Outer wall: tall enough to block mid-climb garage entry (pad 1.92 → bodyMin≈2.07),
    // short enough that the roof-height top tread (bodyMin≈3.08) walks over freely.
    // Player also ignores garage_wall once feet ≥ 2.3 (see Player._resolveAxis).
    const wallXc = gWorldX + gSide * (gW / 2 - 0.1);
    const climbX = gWorldX + gSide * (gW / 2 + 0.85);
    const garageRoofFloorY = roofY + 0.11;
    const garageWallH = 2.12;
    addAabbCollider(colliders, wallXc, garageWallH / 2, gWorldZ, 0.35, garageWallH, gD, {
      kind: 'garage_wall',
      house: houseTag,
    });
    // Thin roof collider — floor handles walk; ceiling if under the deck
    addAabbCollider(colliders, gWorldX, roofY, gWorldZ, gW + 0.4, 0.22, gD + 0.3, {
      kind: 'garage_roof',
      house: houseTag,
      blocksShot: true,
    });
    const roofHalfW = (gW + 0.4) / 2;
    const roofHalfD = (gD + 0.3) / 2;
    const roofMinX = Math.min(gWorldX - roofHalfW + 0.02, climbX - 0.85);
    const roofMaxX = Math.max(gWorldX + roofHalfW - 0.02, climbX + 0.85);
    const roofMinZ = gWorldZ - roofHalfD + 0.02;
    const roofMaxZ = gWorldZ + roofHalfD - 0.02;
    // Primary roof deck (includes climb boarding strip)
    addFloor(floors, roofMinX, roofMaxX, roofMinZ, roofMaxZ, garageRoofFloorY);

    // Climb pads — last pad is ALREADY roof height at climbX (no ledge / no jump needed)
    const climbFloorYs = [0.48, 0.96, 1.44, 1.92, 2.4, garageRoofFloorY];
    const climbPads = new THREE.Group();
    climbPads.name = flip ? 'garage_climb_east' : 'garage_climb_west';
    for (let i = 0; i < climbFloorYs.length; i++) {
      const fy = climbFloorYs[i];
      const czPad = gWorldZ - 1.35 + i * 0.55;
      const cy = fy - 0.18;
      const pad = box(1.15, 0.5, 1.15, 0xd4a574, climbX - cx, cy, czPad - cz);
      pad.name = `garage_climb_pad_${houseTag}_${i}`;
      climbPads.add(pad);
      // Wide overlapping floors — top tread shares roof Y so you cannot fall through the seam
      const fMinX = Math.min(climbX - 0.75, gSide > 0 ? climbX - 0.4 : climbX - 0.85);
      const fMaxX = Math.max(climbX + 0.75, gSide > 0 ? climbX + 0.85 : climbX + 0.4);
      addFloor(floors, fMinX, fMaxX, czPad - 0.75, czPad + 0.75, fy);
      addAabbCollider(colliders, climbX, fy - 0.14, czPad, 1.15, 0.28, 1.15, {
        kind: 'climb_pad',
        house: houseTag,
        chain: 'garage',
      });
    }
    // Extra seam plates: roof Y covering the top two tread footprints (fall-through safety)
    {
      const z0 = gWorldZ - 1.35 + 4 * 0.55;
      const z1 = gWorldZ - 1.35 + 5 * 0.55;
      addFloor(
        floors,
        Math.min(climbX - 0.9, roofMinX),
        Math.max(climbX + 0.9, gWorldX + gSide * (gW / 2)),
        Math.min(z0, z1) - 0.9,
        Math.max(z0, z1) + 0.9,
        garageRoofFloorY
      );
    }
    // Landing bridge onto garage deck (visual + floor)
    {
      const fy = garageRoofFloorY;
      const czPad = gWorldZ - 1.35 + 5 * 0.55;
      const cy = fy - 0.14;
      const landMinX = Math.min(climbX - 0.85, gWorldX + gSide * (gW / 2 - 0.1));
      const landMaxX = Math.max(climbX + 0.85, gWorldX + gSide * (gW / 2 - 0.1));
      const landW = landMaxX - landMinX;
      const landXc = (landMinX + landMaxX) / 2;
      const pad = box(landW, 0.35, 1.4, 0xd4a574, landXc - cx, cy, czPad - cz);
      pad.name = `garage_climb_landing_${houseTag}`;
      climbPads.add(pad);
      addFloor(floors, landMinX, landMaxX, roofMinZ, roofMaxZ, fy);
      addAabbCollider(colliders, landXc, fy - 0.14, czPad, landW, 0.28, 1.4, {
        kind: 'climb_pad',
        house: houseTag,
        chain: 'garage',
      });
    }
    house.add(climbPads);

    // Garage roof → main roof: even rises, last pad IS roof height (no awkward
    // 0.10m stub tread that Rapier autostep often fails on in-game).
    const roofClimb = new THREE.Group();
    roofClimb.name = flip ? 'main_roof_climb_east' : 'main_roof_climb_west';
    const rcX = gWorldX - gSide * 0.35;
    const mainRoofFloorY = 5.88;
    const roofClimbFloors = [];
    {
      const rise = 0.42; // comfortably under Player.STEP_UP / Rapier autostep
      const run = 0.58;
      let y = garageRoofFloorY + rise;
      let zi = 0;
      while (y < mainRoofFloorY - 0.02) {
        roofClimbFloors.push({ y: Math.min(y, mainRoofFloorY), z: gWorldZ - 0.15 - zi * run });
        if (y >= mainRoofFloorY - 0.02) break;
        y += rise;
        zi += 1;
      }
      // Guarantee a final tread at exact roof walk height
      const last = roofClimbFloors[roofClimbFloors.length - 1];
      if (!last || last.y < mainRoofFloorY - 0.02) {
        roofClimbFloors.push({ y: mainRoofFloorY, z: gWorldZ - 0.15 - zi * run });
      } else {
        last.y = mainRoofFloorY;
      }
    }
    for (let i = 0; i < roofClimbFloors.length; i++) {
      const s = roofClimbFloors[i];
      const cy = s.y - 0.18;
      const pad = box(1.25, 0.5, 1.05, 0xc4956a, rcX - cx, cy, s.z - cz);
      pad.name = `roof_climb_pad_${houseTag}_${i}`;
      roofClimb.add(pad);
      addFloor(floors, rcX - 0.65, rcX + 0.65, s.z - 0.55, s.z + 0.55, s.y);
      // Thin collider (<0.35) — floors carry walking; thick solids shove players off the garage deck
      addAabbCollider(colliders, rcX, s.y - 0.14, s.z, 1.25, 0.28, 1.05, {
        kind: 'roof_climb',
        house: houseTag,
      });
    }
    // Landing bridge onto main roof from last pad (overlap house outer edge)
    addFloor(
      floors,
      Math.min(rcX, cx + outerX) - 0.3,
      Math.max(rcX, cx + outerX) + 0.3,
      gWorldZ - 2.5,
      gWorldZ + 0.5,
      mainRoofFloorY
    );
    house.add(roofClimb);

    // Also register garage roof as mantle-friendly low roof
    roofMantleZones.push({
      minX: gWorldX - gW / 2 + 0.15,
      maxX: gWorldX + gW / 2 - 0.15,
      minZ: gWorldZ - gD / 2 + 0.15,
      maxZ: gWorldZ + gD / 2 - 0.15,
      y: roofY + 0.11,
      kind: 'garage_roof',
      house: houseTag,
    });

    // Interior layout — AAA set-dressing (layered props + solids). Keep major AABB names/footprints
    // for tests. Local rooms (west): living road-side, dining mid, kitchen garage-side;
    // clear path door→stairs (stairX≈-3.35). East mirrors via sx/sz.
    const interior = new THREE.Group();
    interior.name = flip ? 'interior_east' : 'interior_west';
    const sx = flip ? -1 : 1;
    const sz = flip ? -1 : 1;
    const furnitureSolids = [];
    const plasterA = flip ? 0xfff0e6 : 0xfff4ec;
    const plasterB = flip ? 0xf0e8ff : 0xffe8f0;
    const woodTone = 0xd4a574;
    const trimW = 0xfffaf5;

    const placeSolid = (name, lx, cy, lz, w, h, d, color, opts = {}) => {
      const mesh = box(w, h, d, color, lx, cy, lz, opts);
      mesh.name = name;
      interior.add(mesh);
      furnitureSolids.push({
        name,
        x: cx + lx,
        y: cy,
        z: cz + lz,
        w: w * 0.92,
        h,
        d: d * 0.92,
      });
      return mesh;
    };
    const placeDecor = (name, lx, cy, lz, w, h, d, color, opts = {}) => {
      const mesh = box(w, h, d, color, lx, cy, lz, opts);
      mesh.name = name;
      interior.add(mesh);
      return mesh;
    };

    // --- Interior wall lining (plaster panels — same richness as outdoor facade noise) ---
    const lining = new THREE.Group();
    lining.name = flip ? 'interior_lining_east' : 'interior_lining_west';
    const lineT = 0.06;
    // L1 front plaster — MUST match exterior wall halves (old width W-doorW-0.4 overlapped
    // the doorway and left a grey noise plane when the swing door opened).
    const l1FrontPanelW = (W - doorW) / 2 - 0.1;
    const l1FrontPanelL = box(l1FrontPanelW, 2.55, lineT, plasterA, -(W + doorW) / 4, 1.4, fzIn, {
      kind: 'plaster',
    });
    l1FrontPanelL.name = `lining_l1_front_l_${houseTag}`;
    const l1FrontPanelR = box(l1FrontPanelW, 2.55, lineT, plasterA, (W + doorW) / 4, 1.4, fzIn, {
      kind: 'plaster',
    });
    l1FrontPanelR.name = `lining_l1_front_r_${houseTag}`;
    lining.add(l1FrontPanelL);
    lining.add(l1FrontPanelR);
    lining.add(box(W - 0.5, 2.7, lineT, plasterB, 0, 1.45, bzIn, { kind: 'plaster' }));
    lining.add(box(lineT, 2.7, D - 0.6, plasterA, oxIn, 1.45, 0, { kind: 'plaster' }));
    // Road-side lining split around side door
    lining.add(box(lineT, 2.7, segALen - 0.15, plasterB, ixIn, 1.45, segAZ, { kind: 'plaster' }));
    lining.add(box(lineT, 2.7, segBLen - 0.15, plasterB, ixIn, 1.45, segBZ, { kind: 'plaster' }));
    // L2 plaster — front split around window openings (never seal the glass)
    {
      const l2LineY = L2y + 1.15;
      const l2LineH = 2.0;
      const halfW = W / 2 - 0.25;
      const gaps = l2WinXs.map((wx) => [wx - l2WinW / 2 - 0.08, wx + l2WinW / 2 + 0.08]);
      let cursor = -halfW;
      for (const [g0, g1] of gaps) {
        if (g0 - cursor > 0.15) {
          const segW = g0 - cursor;
          lining.add(
            box(segW, l2LineH, lineT, plasterB, (cursor + g0) / 2, l2LineY, fzIn, { kind: 'plaster' })
          );
        }
        cursor = g1;
      }
      if (halfW - cursor > 0.15) {
        lining.add(
          box(halfW - cursor, l2LineH, lineT, plasterB, (cursor + halfW) / 2, l2LineY, fzIn, {
            kind: 'plaster',
          })
        );
      }
      // Sill-height interior ledge under windows
      lining.add(box(W - 0.5, 0.12, 0.14, trimW, 0, L2y + 0.2, fzIn));
    }
    lining.add(box(W - 0.5, 2.0, lineT, plasterA, 0, L2y + 1.15, bzIn, { kind: 'plaster' }));
    lining.add(box(lineT, 2.0, D - 0.6, plasterB, oxIn, L2y + 1.15, 0, { kind: 'plaster' }));
    lining.add(box(lineT, 2.0, D - 0.6, plasterA, ixIn, L2y + 1.15, 0, { kind: 'plaster' }));
    // Accent wallpaper strip in living bay
    lining.add(
      box(2.4, 1.6, 0.04, flip ? 0xe8d4ff : 0xffd0e0, sx * 2.45, 1.55, bzIn + (flip ? -0.02 : 0.02), {
        kind: 'fabric',
      })
    );
    interior.add(lining);

    // Door casings (main + side)
    // Interior furniture X is NOT mirrored with `sx`. Stairs stay at local x=-3.35
    // on both houses; `sx*` shoved living/bed into the east stairwell and blocked
    // Rapier climbs (bed overhang = mid-stair ceiling). Z still follows `sz` so
    // rooms stay toward the flipped front/back.
    const livingX = 2.45;
    const dineX = 2.35;
    const bedX = 2.5;
    // Kitchen / L2 wardrobe stay on the stair-side X via `sx` so the east house
    // keeps them clear of the climb (fixed −X + sz-flip put the fridge mid-stair).
    const wardrobeX = sx * -2.55;
    const deskX = sx * -1.35;

    // --- L1 Living ---
    placeSolid(`furn_sofa_${houseTag}`, livingX, 0.38, sz * -2.35, 2.0, 0.55, 0.72, 0xffb6c1, {
      kind: 'fabric',
    });
    placeDecor(`furn_sofa_back_${houseTag}`, livingX, 0.78, sz * -2.72, 1.95, 0.55, 0.14, 0xff9eb5, {
      kind: 'fabric',
    });
    placeDecor(`furn_sofa_arm_l_${houseTag}`, livingX - 0.95, 0.55, sz * -2.35, 0.16, 0.45, 0.7, 0xff9eb5, {
      kind: 'fabric',
    });
    placeDecor(`furn_sofa_arm_r_${houseTag}`, livingX + 0.95, 0.55, sz * -2.35, 0.16, 0.45, 0.7, 0xff9eb5, {
      kind: 'fabric',
    });
    placeDecor(`furn_sofa_cush_a_${houseTag}`, livingX - 0.3, 0.72, sz * -2.25, 0.55, 0.18, 0.5, 0xffc8d6, {
      kind: 'fabric',
    });
    placeDecor(`furn_sofa_cush_b_${houseTag}`, livingX + 0.3, 0.72, sz * -2.25, 0.55, 0.18, 0.5, 0xffd0e0, {
      kind: 'fabric',
    });
    placeDecor(`furn_sofa_leg_a_${houseTag}`, livingX - 0.85, 0.1, sz * -2.05, 0.1, 0.16, 0.1, woodTone, {
      kind: 'wood',
    });
    placeDecor(`furn_sofa_leg_b_${houseTag}`, livingX + 0.85, 0.1, sz * -2.05, 0.1, 0.16, 0.1, woodTone, {
      kind: 'wood',
    });
    // Rug under living set
    placeDecor(`decor_rug_living_${houseTag}`, livingX, 0.26, sz * -1.9, 2.6, 0.03, 2.2, 0xf8c8d8, {
      kind: 'fabric',
    });
    placeSolid(`furn_coffee_${houseTag}`, livingX, 0.32, sz * -1.2, 0.95, 0.48, 0.5, 0xe8d5b7, {
      kind: 'wood',
    });
    placeDecor(`furn_coffee_top_${houseTag}`, livingX, 0.58, sz * -1.2, 1.0, 0.05, 0.55, 0xf0e0c8, {
      kind: 'wood',
    });
    placeDecor(`decor_book_a_${houseTag}`, livingX + 0.1, 0.66, sz * -1.15, 0.22, 0.08, 0.16, 0xc5b4e3);
    placeDecor(`decor_mug_${houseTag}`, livingX - 0.2, 0.66, sz * -1.3, 0.1, 0.1, 0.1, 0xff8fab);
    placeSolid(`furn_tvstand_${houseTag}`, livingX, 0.32, sz * -3.65, 1.4, 0.48, 0.38, 0x8a7a9a, {
      kind: 'wood',
    });
    placeDecor(`furn_tvstand_trim_${houseTag}`, livingX, 0.56, sz * -3.65, 1.42, 0.04, 0.4, 0xb8956a, {
      kind: 'wood',
    });
    placeDecor(`furn_tv_${houseTag}`, livingX, 0.88, sz * -3.82, 1.15, 0.62, 0.08, 0x3a3248);
    placeDecor(`furn_tv_screen_${houseTag}`, livingX, 0.88, sz * -3.86, 1.0, 0.5, 0.02, 0x6ec8f0, {
      emissive: 0x3a80a8,
      emissiveIntensity: 0.22,
      roughness: 0.35,
    });
    // Floor lamp
    placeDecor(`decor_lamp_pole_${houseTag}`, livingX + 1.1, 0.85, sz * -3.2, 0.08, 1.5, 0.08, 0xe8dcc8);
    placeDecor(`decor_lamp_shade_${houseTag}`, livingX + 1.1, 1.7, sz * -3.2, 0.45, 0.28, 0.45, 0xfff6e8, {
      emissive: 0xffe8b0,
      emissiveIntensity: 0.25,
    });
    {
      const lamp = new THREE.PointLight(0xffe8b0, 0.42, 9, 2);
      lamp.name = `light_living_${houseTag}`;
      lamp.position.set(livingX + 1.1, 1.55, sz * -3.2);
      interior.add(lamp);
    }
    // Wall art + plant
    placeDecor(`decor_frame_a_${houseTag}`, 1.2, 1.7, bzIn + (flip ? -0.03 : 0.03), 0.7, 0.55, 0.05, trimW);
    placeDecor(`decor_art_a_${houseTag}`, 1.2, 1.7, bzIn + (flip ? -0.06 : 0.06), 0.55, 0.4, 0.02, 0xff8fab);
    placeDecor(`decor_plant_pot_${houseTag}`, livingX + 1.15, 0.35, sz * -1.0, 0.32, 0.35, 0.32, 0xd4a574, {
      kind: 'wood',
    });
    placeDecor(`decor_plant_leaf_${houseTag}`, livingX + 1.15, 0.7, sz * -1.0, 0.45, 0.4, 0.45, 0x6ee7b7);

    // --- L1 Dining ---
    placeSolid(`furn_table_${houseTag}`, dineX, 0.4, sz * 0.55, 1.2, 0.55, 0.75, woodTone, {
      kind: 'wood',
    });
    placeDecor(`furn_tabletop_${houseTag}`, dineX, 0.72, sz * 0.55, 1.4, 0.08, 0.9, 0xe0b070, {
      kind: 'wood',
    });
    placeDecor(`furn_table_leg_a_${houseTag}`, dineX - 0.5, 0.35, sz * 0.2, 0.1, 0.55, 0.1, 0xb8956a, {
      kind: 'wood',
    });
    placeDecor(`furn_table_leg_b_${houseTag}`, dineX + 0.5, 0.35, sz * 0.9, 0.1, 0.55, 0.1, 0xb8956a, {
      kind: 'wood',
    });
    placeDecor(`decor_placemat_${houseTag}`, dineX, 0.78, sz * 0.55, 0.7, 0.02, 0.45, 0xffe8f0, {
      kind: 'fabric',
    });
    placeDecor(`decor_vase_${houseTag}`, dineX, 0.95, sz * 0.55, 0.14, 0.28, 0.14, 0xc5b4e3);
    placeSolid(`furn_chair_a_${houseTag}`, dineX, 0.4, sz * -0.35, 0.42, 0.55, 0.42, accentColor, {
      kind: 'fabric',
    });
    placeDecor(`furn_chair_a_back_${houseTag}`, dineX, 0.75, sz * -0.55, 0.4, 0.45, 0.1, accentColor, {
      kind: 'fabric',
    });
    placeSolid(`furn_chair_b_${houseTag}`, dineX, 0.4, sz * 1.45, 0.42, 0.55, 0.42, accentColor, {
      kind: 'fabric',
    });
    placeDecor(`furn_chair_b_back_${houseTag}`, dineX, 0.75, sz * 1.65, 0.4, 0.45, 0.1, accentColor, {
      kind: 'fabric',
    });

    // --- L1 Kitchen ---
    placeSolid(`furn_counter_${houseTag}`, sx * -2.35, 0.48, sz * 2.65, 1.9, 0.85, 0.55, 0xf5efe8, {
      kind: 'plaster',
    });
    placeDecor(`furn_counter_toe_${houseTag}`, sx * -2.35, 0.08, sz * 2.65, 1.88, 0.1, 0.52, 0xe8dcc8);
    placeDecor(`furn_countertop_${houseTag}`, sx * -2.35, 0.94, sz * 2.65, 1.95, 0.08, 0.58, woodTone, {
      kind: 'wood',
    });
    placeDecor(`furn_cabinet_door_a_${houseTag}`, sx * -2.9, 0.5, sz * 2.9, 0.7, 0.55, 0.04, 0xfff8f0);
    placeDecor(`furn_cabinet_door_b_${houseTag}`, sx * -1.9, 0.5, sz * 2.9, 0.7, 0.55, 0.04, 0xfff8f0);
    placeDecor(`furn_cabinet_knob_a_${houseTag}`, sx * -2.65, 0.5, sz * 2.94, 0.06, 0.06, 0.04, 0xffe066);
    placeDecor(`furn_cabinet_knob_b_${houseTag}`, sx * -2.15, 0.5, sz * 2.94, 0.06, 0.06, 0.04, 0xffe066);
    placeSolid(`furn_fridge_${houseTag}`, sx * -3.85, 0.85, sz * 2.65, 0.65, 1.55, 0.6, 0xa0d2db, {
      kind: 'plaster',
    });
    placeDecor(`furn_fridge_door_${houseTag}`, sx * -3.85, 0.85, sz * 2.92, 0.55, 1.35, 0.05, 0xb8e0e8);
    placeDecor(`furn_fridge_handle_${houseTag}`, sx * -3.6, 0.9, sz * 2.96, 0.06, 0.45, 0.04, 0xfffaf5);
    placeDecor(`furn_fridge_stripe_${houseTag}`, sx * -3.85, 1.45, sz * 2.92, 0.5, 0.04, 0.06, accentColor);
    placeDecor(`furn_sink_${houseTag}`, sx * -1.85, 1.02, sz * 2.65, 0.45, 0.1, 0.4, 0x9aa4b0);
    placeDecor(`furn_faucet_${houseTag}`, sx * -1.85, 1.2, sz * 2.78, 0.06, 0.28, 0.06, 0xd0d6de);
    placeSolid(`furn_shelf_${houseTag}`, sx * -1.15, 0.9, sz * 3.55, 0.8, 1.55, 0.35, woodTone, {
      kind: 'wood',
    });
    placeDecor(`furn_shelf_board_a_${houseTag}`, sx * -1.15, 0.55, sz * 3.55, 0.72, 0.05, 0.3, 0xe0b070, {
      kind: 'wood',
    });
    placeDecor(`furn_shelf_board_b_${houseTag}`, sx * -1.15, 1.05, sz * 3.55, 0.72, 0.05, 0.3, 0xe0b070, {
      kind: 'wood',
    });
    placeDecor(`decor_jar_a_${houseTag}`, sx * -1.35, 1.2, sz * 3.55, 0.14, 0.2, 0.14, 0xff8fab);
    placeDecor(`decor_jar_b_${houseTag}`, sx * -0.95, 1.18, sz * 3.55, 0.12, 0.18, 0.12, 0xffe066);
    // Upper cabinets + pendant
    placeDecor(`decor_upper_cab_${houseTag}`, sx * -2.2, 2.15, sz * 2.7, 1.5, 0.55, 0.35, 0xfff6ee, {
      kind: 'plaster',
    });
    placeDecor(`decor_pendant_${houseTag}`, sx * -2.35, 2.45, sz * 1.8, 0.35, 0.2, 0.35, 0xfff0c8, {
      emissive: 0xffe8a0,
      emissiveIntensity: 0.3,
    });
    {
      const kLamp = new THREE.PointLight(0xfff0d0, 0.38, 8, 2);
      kLamp.name = `light_kitchen_${houseTag}`;
      kLamp.position.set(sx * -2.35, 2.35, sz * 1.8);
      interior.add(kLamp);
    }

    // --- L2 Bedroom ---
    placeDecor(`decor_rug_bed_${houseTag}`, bedX - 0.1, L2y + 0.02, sz * 1.9, 2.4, 0.03, 1.8, 0xe0d0f0, {
      kind: 'fabric',
    });
    placeSolid(`furn_bed_${houseTag}`, bedX, floor2 + 0.32, sz * 2.05, 1.9, 0.4, 1.2, 0xc5b4e3, {
      kind: 'fabric',
    });
    placeDecor(`furn_bed_frame_${houseTag}`, bedX, floor2 + 0.18, sz * 2.05, 2.0, 0.2, 1.3, woodTone, {
      kind: 'wood',
    });
    placeDecor(`furn_bed_head_${houseTag}`, bedX, floor2 + 0.7, sz * 2.6, 1.95, 0.7, 0.12, 0xb8a0d8, {
      kind: 'fabric',
    });
    placeDecor(`furn_mattress_${houseTag}`, bedX, floor2 + 0.48, sz * 2.0, 1.8, 0.16, 1.1, 0xfff8f2, {
      kind: 'fabric',
    });
    placeDecor(`furn_pillow_${houseTag}`, bedX, floor2 + 0.62, sz * 1.55, 1.5, 0.16, 0.32, 0xfff8e7, {
      kind: 'fabric',
    });
    placeDecor(`furn_pillow_b_${houseTag}`, bedX - 0.35, floor2 + 0.66, sz * 1.7, 0.45, 0.14, 0.28, 0xffe0f0, {
      kind: 'fabric',
    });
    placeDecor(`furn_blanket_${houseTag}`, bedX, floor2 + 0.55, sz * 2.35, 1.7, 0.08, 0.55, accentColor, {
      kind: 'fabric',
    });
    placeSolid(`furn_nightstand_${houseTag}`, bedX - 1.3, floor2 + 0.4, sz * 2.05, 0.42, 0.5, 0.4, woodTone, {
      kind: 'wood',
    });
    placeDecor(`furn_night_drawer_${houseTag}`, bedX - 1.3, floor2 + 0.35, sz * 2.22, 0.36, 0.18, 0.04, 0xe0b070, {
      kind: 'wood',
    });
    placeDecor(`decor_bedside_lamp_${houseTag}`, bedX - 1.3, floor2 + 0.78, sz * 2.05, 0.22, 0.28, 0.22, 0xfff6e8, {
      emissive: 0xffe8b0,
      emissiveIntensity: 0.28,
    });
    {
      const bLamp = new THREE.PointLight(0xffe8b0, 0.36, 7, 2);
      bLamp.name = `light_bedroom_${houseTag}`;
      bLamp.position.set(bedX - 1.3, floor2 + 0.95, sz * 2.05);
      interior.add(bLamp);
    }
    placeSolid(`furn_wardrobe_${houseTag}`, wardrobeX, floor2 + 0.75, sz * -2.45, 0.85, 1.2, 0.42, 0xe8dcc8, {
      kind: 'plaster',
    });
    placeDecor(`furn_wardrobe_door_a_${houseTag}`, wardrobeX - 0.2, floor2 + 0.75, sz * -2.22, 0.35, 1.05, 0.04, trimW);
    placeDecor(`furn_wardrobe_door_b_${houseTag}`, wardrobeX + 0.2, floor2 + 0.75, sz * -2.22, 0.35, 1.05, 0.04, trimW);
    placeDecor(`furn_wardrobe_knob_${houseTag}`, wardrobeX, floor2 + 0.75, sz * -2.18, 0.06, 0.06, 0.04, 0xffe066);
    placeSolid(`furn_desk_${houseTag}`, deskX, floor2 + 0.42, sz * -2.45, 0.8, 0.55, 0.48, 0xffdab9, {
      kind: 'wood',
    });
    placeDecor(`furn_desk_top_${houseTag}`, deskX, floor2 + 0.72, sz * -2.45, 0.85, 0.06, 0.52, 0xf0c9a0, {
      kind: 'wood',
    });
    placeDecor(`decor_laptop_${houseTag}`, deskX, floor2 + 0.82, sz * -2.45, 0.4, 0.04, 0.28, 0x4a3f55);
    placeDecor(`decor_laptop_screen_${houseTag}`, deskX, floor2 + 0.98, sz * -2.58, 0.38, 0.28, 0.03, 0x6ec8f0, {
      emissive: 0x2a6090,
      emissiveIntensity: 0.18,
    });
    placeSolid(`furn_deskchair_${houseTag}`, deskX, floor2 + 0.38, sz * -1.7, 0.4, 0.5, 0.4, accentColor, {
      kind: 'fabric',
    });
    placeDecor(`furn_deskchair_back_${houseTag}`, deskX, floor2 + 0.7, sz * -1.5, 0.38, 0.4, 0.1, accentColor, {
      kind: 'fabric',
    });
    // L2 wall art + curtain strips at windows
    placeDecor(`decor_frame_l2_${houseTag}`, -0.4, L2y + 1.4, bzIn + (flip ? -0.03 : 0.03), 0.85, 0.6, 0.05, trimW);
    placeDecor(`decor_art_l2_${houseTag}`, -0.4, L2y + 1.4, bzIn + (flip ? -0.06 : 0.06), 0.7, 0.45, 0.02, 0x7ec8e8);
    for (const wx of [-2.7, 2.7]) {
      placeDecor(
        `decor_curtain_l_${houseTag}_${wx}`,
        wx - 0.7,
        l2OpenY,
        frontZ + (flip ? -0.12 : 0.12),
        0.18,
        l2OpenH + 0.2,
        0.08,
        accentColor,
        { kind: 'fabric' }
      );
      placeDecor(
        `decor_curtain_r_${houseTag}_${wx}`,
        wx + 0.7,
        l2OpenY,
        frontZ + (flip ? -0.12 : 0.12),
        0.18,
        l2OpenH + 0.2,
        0.08,
        accentColor,
        { kind: 'fabric' }
      );
    }

    house.add(interior);

    for (const f of furnitureSolids) {
      addAabbCollider(colliders, f.x, f.y, f.z, f.w, f.h, f.d, {
        kind: 'house_furniture',
        house: houseTag,
        part: f.name,
      });
    }

    house.position.set(cx, 0, cz);
    group.add(house);

    // Colliders aligned to visual shell (door gaps kept free). Thickness inflated so
    // bot/player capsules cannot half-clip thin facade meshes.
    const gapZ = cz + sideDoorLocalZ;
    const wallDepth = wallT + 0.45; // visual 0.35 + margin vs BOT_COLLIDE_RADIUS
    const solidBoxes = [
      // Front L1 left/right of main door — full height to L2 slab (seals outdoor gap)
      {
        x: cx - (W + doorW) / 4,
        y: l1FrontY,
        z: cz + frontZ,
        w: (W - doorW) / 2,
        h: l1FrontH,
        d: wallDepth,
        part: 'front_l1_a',
      },
      {
        x: cx + (W + doorW) / 4,
        y: l1FrontY,
        z: cz + frontZ,
        w: (W - doorW) / 2,
        h: l1FrontH,
        d: wallDepth,
        part: 'front_l1_b',
      },
      // Above main door → slab
      {
        x: cx,
        y: lintelY,
        z: cz + frontZ,
        w: doorW + 0.35,
        h: lintelH,
        d: wallDepth,
        part: 'front_l1_lintel',
      },
      // Front L2 sill (flush with L2 floor — no outdoor gap)
      {
        x: cx,
        y: L2yEarly + l2SillH / 2,
        z: cz + frontZ,
        w: W,
        h: l2SillH,
        d: wallDepth,
        part: 'front_l2_sill',
      },
      // Front L2 header (above glass openings)
      {
        x: cx,
        y: l2HeaderY,
        z: cz + frontZ,
        w: W,
        h: l2HeaderH,
        d: wallDepth,
        part: 'front_l2_header',
      },
      // Solid back wall (full height)
      {
        x: cx,
        y: 2.8,
        z: cz + backZ,
        w: W,
        h: 5.4,
        d: wallDepth,
        part: 'back',
      },
      // Outer side (garage side) full
      {
        x: cx + outerX,
        y: 2.8,
        z: cz,
        w: wallDepth,
        h: 5.4,
        d: D,
        part: 'outer_side',
      },
      // Inner (road) side split around side-exit door
      {
        x: cx + innerX,
        y: 2.8,
        z: cz + segAZ,
        w: wallDepth,
        h: 5.4,
        d: segALen,
        part: 'inner_side_a',
      },
      {
        x: cx + innerX,
        y: 2.8,
        z: cz + segBZ,
        w: wallDepth,
        h: 5.4,
        d: segBLen,
        part: 'inner_side_b',
      },
      // Lintel only over side door — does not block walking through the gap
      {
        x: cx + innerX,
        y: floor2 + 1.2,
        z: gapZ,
        w: wallDepth + 0.05,
        h: 2.4,
        d: sideDoorW + 0.15,
        part: 'side_door_lintel',
      },
      // Interior partition (matches visual divider at local x≈1.2)
      {
        x: cx + 1.2,
        y: 1.35,
        z: cz - 1,
        w: wallDepth,
        h: 2.5,
        d: D * 0.45,
        part: 'interior_partition',
      },
    ];
    // L2 front piers (between window openings) — solid colliders match visual piers
    {
      const halfW = W / 2;
      const gaps = l2WinXs.map((wx) => [wx - l2WinW / 2, wx + l2WinW / 2]);
      let cursor = -halfW;
      let pierI = 0;
      for (const [g0, g1] of gaps) {
        if (g0 - cursor > 0.12) {
          const segW = g0 - cursor;
          const segX = (cursor + g0) / 2;
          solidBoxes.push({
            x: cx + segX,
            y: l2OpenY,
            z: cz + frontZ,
            w: segW,
            h: l2OpenH,
            d: wallDepth,
            part: `front_l2_pier_${pierI++}`,
          });
        }
        cursor = g1;
      }
      if (halfW - cursor > 0.12) {
        const segW = halfW - cursor;
        const segX = (cursor + halfW) / 2;
        solidBoxes.push({
          x: cx + segX,
          y: l2OpenY,
          z: cz + frontZ,
          w: segW,
          h: l2OpenH,
          d: wallDepth,
          part: `front_l2_pier_${pierI++}`,
        });
      }
    }

    for (const s of solidBoxes) {
      addAabbCollider(colliders, s.x, s.y, s.z, s.w, s.h, s.d, {
        kind: 'house_wall',
        house: houseTag,
        part: s.part,
      });
    }

    spawnPoints.push(new THREE.Vector3(cx + (flip ? -2 : 2), 1.7, cz + frontZ + (flip ? 5 : -5)));
    spawnPoints.push(new THREE.Vector3(cx + 2, 1.7 + floor2, cz));
    spawnPoints.push(new THREE.Vector3(gWorldX, 1.7, gWorldZ + openLocalZ * 1.4));
    spawnPoints.push(new THREE.Vector3(cx + innerX + (flip ? -1.5 : 1.5), 1.7, gapZ));
    spawnPoints.push(new THREE.Vector3(gWorldX, roofY + 1.7, gWorldZ));
    coverPoints.push(new THREE.Vector3(cx + 4, 0, cz + frontZ + (flip ? 2.5 : -2.5)));
    coverPoints.push(new THREE.Vector3(gWorldX, 0, gWorldZ));
    coverPoints.push(new THREE.Vector3(cx + innerX + (flip ? -1.2 : 1.2), 0, gapZ));
    waypoints.push(new THREE.Vector3(cx, 0.2, cz + frontZ + (flip ? 3.5 : -3.5)));
    waypoints.push(new THREE.Vector3(cx, floor2 + 0.2, cz));
    waypoints.push(new THREE.Vector3(gWorldX, 0.2, gWorldZ));
    waypoints.push(new THREE.Vector3(cx + innerX + (flip ? -1.2 : 1.2), 0.2, gapZ));
    waypoints.push(new THREE.Vector3(gWorldX, roofY + 0.2, gWorldZ));
  }

  buildHouse(-HOUSE_X, 0, COLORS.yellow, 0xf0c060, false);
  buildHouse(HOUSE_X, 0, 0xb8d4f0, COLORS.lilac, true);

  const wheelMat = createMat(0x4a3f55);
  const hubMat = createMat(0xc5b4e3);

  function addWheels(parent, positions, radius = 0.4, width = 0.32) {
    for (const [x, z] of positions) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 12), wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, radius, z);
      w.castShadow = true;
      parent.add(w);
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.4, radius * 0.4, width + 0.04, 8),
        hubMat
      );
      hub.rotation.z = Math.PI / 2;
      hub.position.set(x, radius, z);
      parent.add(hub);
    }
  }

  // === SCHOOL BUS (rounded body — fewer flat trim bands) ===
  const busMat = createMat(COLORS.bus);
  const busAccentMat = createMat(0xffd84a);
  const busRoofMat = createMat(0xf0c840);
  const busGlassMat = createMat(0x7ec8e3, { roughness: 0.35, metalness: 0.08 });
  const busWhiteMat = createMat(0xffffff);
  const busBumperMat = createMat(0x8a7a9a);
  const busDarkMat = createMat(0x4a3f55);
  const busLightMat = createMat(0xfff6c8);
  const busMirrorMat = createMat(0xa0d2db);
  const busTipMat = createMat(0xff8fab);
  const busArchMat = createMat(0xe8c84a);

  const bus = new THREE.Group();
  bus.name = 'vehicle_bus';
  bus.add(rbox(2.6, 2.05, 8.5, COLORS.bus, 0, 1.35, 0, { mat: busMat, radius: 0.22 }));
  bus.add(rbox(2.68, 0.38, 8.35, 0xffd84a, 0, 0.52, 0, { mat: busAccentMat, radius: 0.1 }));
  bus.add(rbox(2.7, 0.95, 2.25, COLORS.bus, 0, 1.0, -3.78, { mat: busMat, radius: 0.16 }));
  bus.add(rbox(2.52, 0.2, 8.15, 0xf0c840, 0, 2.5, 0, { mat: busRoofMat, radius: 0.08 }));
  for (let i = 0; i < 5; i++) {
    const wz = -2.2 + i * 1.35;
    bus.add(rbox(2.62, 0.7, 1.08, 0x7ec8e3, 0, 1.95, wz, { mat: busGlassMat, radius: 0.06 }));
  }
  bus.add(box(2.66, 0.12, 7.9, 0xffffff, 0, 1.15, 0, { mat: busWhiteMat })); // single side stripe
  bus.add(rbox(2.2, 0.72, 0.14, 0x9ad4ea, 0, 1.7, -4.85, { mat: busGlassMat, radius: 0.05 }));
  bus.add(rbox(2.2, 0.55, 0.14, 0x9ad4ea, 0, 1.85, 4.2, { mat: busGlassMat, radius: 0.05 }));
  bus.add(rbox(2.5, 0.34, 0.36, 0x8a7a9a, 0, 0.45, -4.9, { mat: busBumperMat, radius: 0.1 }));
  bus.add(rbox(2.5, 0.3, 0.32, 0x8a7a9a, 0, 0.48, 4.25, { mat: busBumperMat, radius: 0.1 }));
  bus.add(rbox(1.35, 0.32, 0.12, 0x4a3f55, 0, 1.35, -4.95, { mat: busDarkMat, radius: 0.04 }));
  bus.add(box(0.35, 0.28, 0.15, 0xfff6c8, -0.7, 0.7, -4.9, { mat: busLightMat }));
  bus.add(box(0.35, 0.28, 0.15, 0xfff6c8, 0.7, 0.7, -4.9, { mat: busLightMat }));
  for (const [wx, wz] of [
    [-1.3, 2.5],
    [1.3, 2.5],
    [-1.3, -2.2],
    [1.3, -2.2],
  ]) {
    bus.add(rbox(0.55, 0.35, 0.7, 0xe8c84a, wx, 0.55, wz, { mat: busArchMat, radius: 0.1 }));
  }
  addWheels(
    bus,
    [
      [-1.3, 2.5],
      [1.3, 2.5],
      [-1.3, -2.2],
      [1.3, -2.2],
    ],
    0.45,
    0.35
  );
  bus.add(box(0.25, 0.18, 0.08, 0xa0d2db, -1.5, 2.05, -3.6, { mat: busMirrorMat }));
  bus.add(box(0.25, 0.18, 0.08, 0xa0d2db, 1.5, 2.05, -3.6, { mat: busMirrorMat }));
  bus.add(box(0.32, 0.1, 0.1, 0xff8fab, -1.55, 2.05, -3.6, { mat: busTipMat }));
  bus.add(box(0.32, 0.1, 0.1, 0xff8fab, 1.55, 2.05, -3.6, { mat: busTipMat }));
  bus.position.set(-3.6, 0, -10);
  bus.rotation.y = 0.1;
  group.add(bus);
  bus.updateMatrixWorld(true);
  addCollider(colliders, bus);
  // Bus roof snow cap (decorative) + walkable roof patch via floors (elevated option)
  const busRoofSnow = box(2.4, 0.12, 7.5, 0xfffaf8, -3.6, 2.62, -10);
  busRoofSnow.name = 'snow_cap_bus';
  group.add(busRoofSnow);
  addFloor(floors, -4.6, -2.6, -13.5, -6.5, 2.55);
  coverPoints.push(new THREE.Vector3(-5.5, 0, -10));
  coverPoints.push(new THREE.Vector3(-1.5, 0, -10));
  waypoints.push(new THREE.Vector3(-3.6, 0.2, -6));
  waypoints.push(new THREE.Vector3(-3.6, 2.7, -10));

  // === PINK PICKUP TRUCK (rounded cab / softer silhouette) ===
  const truckMat = createMat(COLORS.truck);
  const truckRockerMat = createMat(0xff9bb8);
  const truckRoofMat = createMat(0xffb0c4);
  const truckBedMat = createMat(0xff8fab);
  const truckGlassMat = createMat(0x9ad4ea, { roughness: 0.35, metalness: 0.08 });
  const truckBumperMat = createMat(0x8a7a9a);
  const truckDarkMat = createMat(0x6a5a7a);
  const truckLightMat = createMat(0xfff6c8);
  const truckTailMat = createMat(0xff8fab);
  const truckMirrorMat = createMat(0xa0d2db);

  const truck = new THREE.Group();
  truck.name = 'vehicle_truck';
  truck.add(rbox(2.3, 1.15, 3.2, COLORS.truck, 0, 1.05, -0.8, { mat: truckMat, radius: 0.14 }));
  truck.add(rbox(2.35, 0.22, 3.15, 0xff9bb8, 0, 0.55, -0.8, { mat: truckRockerMat, radius: 0.06 }));
  truck.add(rbox(2.32, 0.16, 3.05, 0xffb0c4, 0, 1.72, -0.8, { mat: truckRoofMat, radius: 0.06 }));
  truck.add(rbox(2.2, 0.45, 3.0, COLORS.truck, 0, 0.55, 2.0, { mat: truckMat, radius: 0.08 }));
  truck.add(rbox(0.12, 0.55, 2.9, 0xff8fab, -1.05, 1.05, 2.0, { mat: truckBedMat, radius: 0.03 }));
  truck.add(rbox(0.12, 0.55, 2.9, 0xff8fab, 1.05, 1.05, 2.0, { mat: truckBedMat, radius: 0.03 }));
  truck.add(rbox(2.2, 0.55, 0.12, 0xff8fab, 0, 1.05, 3.45, { mat: truckBedMat, radius: 0.03 }));
  truck.add(rbox(2.0, 0.55, 1.15, 0x9ad4ea, 0, 1.5, -1.0, { mat: truckGlassMat, radius: 0.08 }));
  truck.add(rbox(2.2, 0.3, 0.32, 0x8a7a9a, 0, 0.42, -2.45, { mat: truckBumperMat, radius: 0.08 }));
  truck.add(box(0.3, 0.22, 0.12, 0xfff6c8, -0.75, 0.75, -2.4, { mat: truckLightMat }));
  truck.add(box(0.3, 0.22, 0.12, 0xfff6c8, 0.75, 0.75, -2.4, { mat: truckLightMat }));
  truck.add(box(0.28, 0.18, 0.1, 0xff8fab, -0.7, 0.75, 3.5, { mat: truckTailMat }));
  truck.add(box(0.28, 0.18, 0.1, 0xff8fab, 0.7, 0.75, 3.5, { mat: truckTailMat }));
  truck.add(rbox(1.15, 0.32, 0.1, 0x6a5a7a, 0, 0.75, -2.42, { mat: truckDarkMat, radius: 0.03 }));
  truck.add(box(0.2, 0.12, 0.08, 0xa0d2db, -1.2, 1.45, -1.4, { mat: truckMirrorMat }));
  truck.add(box(0.2, 0.12, 0.08, 0xa0d2db, 1.2, 1.45, -1.4, { mat: truckMirrorMat }));
  for (const [wx, wz] of [
    [-1.15, 2.2],
    [1.15, 2.2],
    [-1.15, -1.5],
    [1.15, -1.5],
  ]) {
    truck.add(rbox(0.5, 0.3, 0.6, 0xff8fab, wx, 0.5, wz, { mat: truckBedMat, radius: 0.08 }));
  }
  addWheels(
    truck,
    [
      [-1.15, 2.2],
      [1.15, 2.2],
      [-1.15, -1.5],
      [1.15, -1.5],
    ],
    0.4,
    0.3
  );
  truck.position.set(3.8, 0, 9);
  truck.rotation.y = -0.35;
  group.add(truck);
  truck.updateMatrixWorld(true);
  addCollider(colliders, truck);
  coverPoints.push(new THREE.Vector3(5.5, 0, 9));
  coverPoints.push(new THREE.Vector3(2, 0, 9));
  waypoints.push(new THREE.Vector3(3.8, 0.2, 5.5));

  // === THIRD VEHICLE: mint sedan ===
  const sedan = new THREE.Group();
  sedan.name = 'vehicle_sedan';
  const sedanBody = 0xa8e6cf;
  sedan.add(box(2.1, 0.85, 4.2, sedanBody, 0, 0.75, 0));
  sedan.add(box(1.9, 0.7, 2.2, 0x8fd4be, 0, 1.35, -0.15));
  sedan.add(box(1.85, 0.55, 1.5, 0x9ad4ea, 0, 1.35, -0.2));
  sedan.add(box(2.0, 0.18, 0.2, 0x8a7a9a, 0, 0.4, -2.15));
  sedan.add(box(2.0, 0.16, 0.18, 0x8a7a9a, 0, 0.4, 2.15));
  sedan.add(box(0.28, 0.2, 0.1, 0xfff6c8, -0.65, 0.7, -2.15));
  sedan.add(box(0.28, 0.2, 0.1, 0xfff6c8, 0.65, 0.7, -2.15));
  sedan.add(box(0.24, 0.16, 0.08, 0xff8fab, -0.6, 0.7, 2.15));
  sedan.add(box(0.24, 0.16, 0.08, 0xff8fab, 0.6, 0.7, 2.15));
  addWheels(
    sedan,
    [
      [-1.0, 1.3],
      [1.0, 1.3],
      [-1.0, -1.3],
      [1.0, -1.3],
    ],
    0.38,
    0.28
  );
  sedan.position.set(-2.2, 0, 12);
  sedan.rotation.y = 0.55;
  group.add(sedan);
  sedan.updateMatrixWorld(true);
  addCollider(colliders, sedan);
  coverPoints.push(new THREE.Vector3(-3.5, 0, 12));
  coverPoints.push(new THREE.Vector3(-0.5, 0, 12));
  waypoints.push(new THREE.Vector3(-2.2, 0.2, 9));

  // === CRATE CLUSTERS (L / U / line patterns) — rounded bodies (anti-LEGO) ===
  const crateMat = createWoodMat(COLORS.wood);
  crateMat.name = 'crate_wood';
  const crateBandMat = createMat(0xb8956a);
  let crateIndex = 0;

  function makeCrate(s, h, x, z, rotY = 0) {
    const crateGroup = new THREE.Group();
    crateGroup.name = `crate_${crateIndex++}`;
    const crate = new THREE.Mesh(roundedBoxGeo(s, h, s, Math.min(0.1, s * 0.12), 2), crateMat);
    crate.position.y = h / 2;
    crate.castShadow = true;
    crate.receiveShadow = true;
    crateGroup.add(crate);
    const bandH = new THREE.Mesh(new THREE.BoxGeometry(s + 0.04, 0.09, s + 0.04), crateBandMat);
    bandH.position.y = h * 0.55;
    crateGroup.add(bandH);
    const bandV = new THREE.Mesh(new THREE.BoxGeometry(0.1, h + 0.02, s + 0.04), crateBandMat);
    bandV.position.y = h / 2;
    crateGroup.add(bandV);
    crateGroup.position.set(x, 0, z);
    crateGroup.rotation.y = rotY;
    group.add(crateGroup);
    addCollider(colliders, crateGroup);
    // Walkable top — without this, crates only collide and never support step-up
    const half = s * 0.42;
    addFloor(floors, x - half, x + half, z - half, z + half, h);
    coverPoints.push(new THREE.Vector3(x + 1.1, 0, z));
    coverPoints.push(new THREE.Vector3(x - 1.1, 0, z));
    waypoints.push(new THREE.Vector3(x, 0.2, z + 1.2));
    return crateGroup;
  }

  function crateCluster(cx, cz, pattern = 'L') {
    const cluster = new THREE.Group();
    cluster.name = `crate_cluster_${pattern}_${cx}_${cz}`;
    group.add(cluster);
    if (pattern === 'L') {
      makeCrate(1.0, 1.0, cx, cz, 0.2);
      makeCrate(0.95, 1.1, cx + 1.05, cz, 0.1);
      makeCrate(1.0, 0.95, cx, cz + 1.05, -0.15);
      makeCrate(0.9, 1.35, cx + 0.5, cz + 0.5, 0.4); // stack-ish height
    } else if (pattern === 'U') {
      makeCrate(1.0, 1.05, cx - 1.1, cz, 0);
      makeCrate(1.0, 1.05, cx + 1.1, cz, 0.2);
      makeCrate(1.0, 1.0, cx - 1.1, cz + 1.1, -0.1);
      makeCrate(1.0, 1.0, cx + 1.1, cz + 1.1, 0.15);
      makeCrate(1.05, 0.9, cx, cz + 1.15, 0);
    } else if (pattern === 'line') {
      for (let i = 0; i < 4; i++) {
        makeCrate(0.95 + (i % 2) * 0.1, 0.95 + (i % 3) * 0.15, cx + i * 1.1, cz, i * 0.2);
      }
    } else if (pattern === 'pyramid') {
      makeCrate(1.0, 1.0, cx - 0.85, cz, 0);
      makeCrate(1.0, 1.0, cx + 0.85, cz, 0.1);
      makeCrate(1.0, 1.0, cx, cz + 0.9, -0.1);
      // Raised top crate — place then collider once at final world matrix
      const top = new THREE.Group();
      top.name = `crate_${crateIndex++}`;
      const s = 0.95;
      const h = 1.0;
      const crate = new THREE.Mesh(roundedBoxGeo(s, h, s, Math.min(0.1, s * 0.12), 2), crateMat);
      crate.position.y = h / 2;
      crate.castShadow = true;
      top.add(crate);
      const band = new THREE.Mesh(new THREE.BoxGeometry(s + 0.04, 0.09, s + 0.04), crateBandMat);
      band.position.y = h * 0.55;
      top.add(band);
      top.position.set(cx, 1.0, cz + 0.2);
      group.add(top);
      top.updateMatrixWorld(true);
      addCollider(colliders, top);
      addFloor(floors, cx - 0.4, cx + 0.4, cz + 0.2 - 0.4, cz + 0.2 + 0.4, 2.0);
      coverPoints.push(new THREE.Vector3(cx, 0, cz));
      waypoints.push(new THREE.Vector3(cx, 0.2, cz + 1.5));
    }
  }

  crateCluster(-6.5, -4, 'L');
  crateCluster(6.5, 4.5, 'U');
  crateCluster(-1, 16, 'line');
  crateCluster(1, -17, 'line');
  crateCluster(-9, 6, 'pyramid');
  crateCluster(9, -7, 'L');
  crateCluster(-22, 12, 'U');
  crateCluster(22, -12, 'line');
  crateCluster(-12, -18, 'L');
  crateCluster(12, 18, 'pyramid');

  // === MID BARRIERS (two staggered rows + side flanks) ===
  const barrierColors = [COLORS.pink, COLORS.lilac, COLORS.sky, COLORS.peach, COLORS.yellow];
  let barrierCount = 0;
  function placeBarrier(x, z, rotY = 0, colorIdx = 0) {
    const b = box(1.25, 0.72, 0.52, barrierColors[colorIdx % barrierColors.length], x, 0.36, z);
    b.name = `barrier_${barrierCount++}`;
    b.rotation.y = rotY;
    group.add(b);
    const stripe = box(1.2, 0.1, 0.54, 0xffffff, x, 0.58, z);
    stripe.rotation.y = rotY;
    group.add(stripe);
    // Explicit AABB (handles rotation without relying on matrix timing)
    const cW = Math.abs(Math.cos(rotY)) * 1.25 + Math.abs(Math.sin(rotY)) * 0.52;
    const cD = Math.abs(Math.sin(rotY)) * 1.25 + Math.abs(Math.cos(rotY)) * 0.52;
    addAabbCollider(colliders, x, 0.4, z, Math.max(0.55, cW), 0.85, Math.max(0.55, cD));
    coverPoints.push(new THREE.Vector3(x, 0, z + 0.8));
  }
  // Center mid row (was 4 — now 6 + 5 staggered + flanks)
  for (let i = 0; i < 6; i++) placeBarrier(-2.75 + i * 1.15, -1.2, 0, i);
  for (let i = 0; i < 5; i++) placeBarrier(-2.2 + i * 1.15, 1.6, 0.05, i + 1);
  for (let i = 0; i < 3; i++) placeBarrier(-5.5, -6 + i * 1.4, Math.PI / 2, i);
  for (let i = 0; i < 3; i++) placeBarrier(5.5, 5 + i * 1.4, Math.PI / 2, i + 2);

  // === MID SILHOUETTE ARCH / BILLBOARD ===
  const arch = new THREE.Group();
  arch.name = 'mid_silhouette_arch';
  // Twin pillars + crossbar over road (readable street silhouette)
  arch.add(box(0.45, 4.2, 0.45, COLORS.lilac, -3.8, 2.1, 0));
  arch.add(box(0.45, 4.2, 0.45, COLORS.lilac, 3.8, 2.1, 0));
  arch.add(box(8.2, 0.55, 0.5, COLORS.pink, 0, 4.3, 0));
  arch.add(box(7.6, 1.1, 0.18, 0xffeaa7, 0, 4.95, 0));
  // Soft “SBARG” panel face
  arch.add(box(6.2, 0.85, 0.12, 0xfffaf5, 0, 4.95, 0.12));
  arch.add(box(0.35, 0.55, 0.35, COLORS.sky, -3.8, 4.55, 0));
  arch.add(box(0.35, 0.55, 0.35, COLORS.sky, 3.8, 4.55, 0));
  group.add(arch);
  addAabbCollider(colliders, -3.8, 2.1, 0, 0.55, 4.2, 0.55);
  addAabbCollider(colliders, 3.8, 2.1, 0, 0.55, 4.2, 0.55);
  // Crossbar high — no low collider so road stays walkable

  // === PICKET FENCES (scaled yards) — posts + rails + trim caps; solid segment colliders ===
  let fenceColliderCount = 0;
  const fencePostXZ = [];
  function picketFence(x1, z1, x2, z2) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) return;
    const posts = Math.floor(len / 0.55);
    for (let i = 0; i <= posts; i++) {
      const t = i / Math.max(posts, 1);
      fencePostXZ.push(x1 + dx * t, z1 + dz * t);
    }
    const midX = (x1 + x2) / 2;
    const midZ = (z1 + z2) / 2;
    const angle = Math.atan2(dz, dx);
    const rail = box(len, 0.08, 0.08, COLORS.fence, midX, 0.38, midZ);
    rail.rotation.y = -angle;
    group.add(rail);
    const rail2 = rail.clone();
    rail2.position.y = 0.72;
    group.add(rail2);
    // Bottom kickboard + top cap rail (visual trim)
    const kick = box(len, 0.1, 0.1, 0xf0e8f8, midX, 0.12, midZ);
    kick.rotation.y = -angle;
    group.add(kick);
    const topCap = box(len, 0.06, 0.12, 0xffffff, midX, 0.95, midZ);
    topCap.rotation.y = -angle;
    group.add(topCap);

    // Continuous solid wall for the whole segment (player + bots cannot walk through)
    // Fences are axis-aligned in this map; thickness is enough to catch PLAYER_RADIUS.
    // kind:'fence' + jumpable — bots may vault these (top ≈ 1.2m).
    const thickness = 0.32;
    const fenceH = 1.2;
    if (Math.abs(dx) >= Math.abs(dz)) {
      addAabbCollider(colliders, midX, fenceH / 2, midZ, len + 0.12, fenceH, thickness, {
        kind: 'fence',
        jumpable: true,
      });
    } else {
      addAabbCollider(colliders, midX, fenceH / 2, midZ, thickness, fenceH, len + 0.12, {
        kind: 'fence',
        jumpable: true,
      });
    }
    fenceColliderCount++;
  }

  // Yard-framing fences (Phase 3 — more segments than mid-only baseline)
  const fenceSegments = new THREE.Group();
  fenceSegments.name = 'yard_fences';
  group.add(fenceSegments);
  const _fenceParent = group;
  // temporarily add to group via picketFence; count named posts via wrapper
  picketFence(-28, -26, -10, -26);
  picketFence(10, -26, 28, -26);
  picketFence(-28, 26, -10, 26);
  picketFence(10, 26, 28, 26);
  picketFence(-32, -14, -32, 14);
  picketFence(32, -14, 32, 14);
  picketFence(-28, -26, -28, -14);
  picketFence(28, -26, 28, -14);
  picketFence(-28, 14, -28, 26);
  picketFence(28, 14, 28, 26);
  // Extra yard dividers + side-lane rails
  picketFence(-26, -10, -12, -10);
  picketFence(12, -10, 26, -10);
  picketFence(-26, 10, -12, 10);
  picketFence(12, 10, 26, 10);
  picketFence(-24, -22, -24, -12);
  picketFence(24, -22, 24, -12);
  picketFence(-24, 12, -24, 22);
  picketFence(24, 12, 24, 22);
  picketFence(-36, -30, -20, -30);
  picketFence(20, -30, 36, -30);
  picketFence(-36, 30, -20, 30);
  picketFence(20, 30, 36, 30);
  void _fenceParent;
  fenceSegments.userData.segmentCount = fenceColliderCount;
  const nPosts = fencePostXZ.length / 2;
  if (nPosts > 0) {
    const dummy = new THREE.Object3D();
    const addFenceInst = (w, h, d, color, y, instName) => {
      const mesh = new THREE.InstancedMesh(boxGeometry(w, h, d), createMat(color), nPosts);
      mesh.name = instName;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      for (let i = 0; i < nPosts; i++) {
        dummy.position.set(fencePostXZ[i * 2], y, fencePostXZ[i * 2 + 1]);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      fenceSegments.add(mesh);
    };
    addFenceInst(0.1, 1.05, 0.1, COLORS.fence, 0.52, 'fence_posts');
    addFenceInst(0.14, 0.14, 0.14, 0xffffff, 1.1, 'fence_caps');
    addFenceInst(0.08, 0.1, 0.08, 0xfffaf5, 1.2, 'fence_tips');
  }

  // === LAMP POSTS (base rings / arm / cap detail) ===
  const lampPositions = [
    [-7, -18],
    [7, -18],
    [-7, 18],
    [7, 18],
    [-7, -6],
    [7, 6],
    [-26, 0],
    [26, 0],
    [-20, -20],
    [20, 20],
    [-20, 20],
    [20, -20],
  ];
  for (const [x, z] of lampPositions) {
    const lamp = new THREE.Group();
    lamp.name = `lamp_post_${x}_${z}`;
    lamp.add(box(0.18, 3.2, 0.18, 0x8a7a9a, 0, 1.6, 0));
    lamp.add(box(0.48, 0.14, 0.48, 0x6a5a7a, 0, 0.08, 0)); // base
    lamp.add(box(0.36, 0.1, 0.36, 0x9a8aaa, 0, 0.2, 0)); // base ring
    lamp.add(box(0.22, 0.08, 0.22, 0x7a6a8a, 0, 2.2, 0)); // mid collar
    lamp.add(box(0.55, 0.14, 0.55, 0x6a5a7a, 0, 3.28, 0));
    lamp.add(box(0.12, 0.35, 0.12, 0x7a6a8a, 0, 3.45, 0));
    lamp.add(box(0.45, 0.08, 0.12, 0x8a7a9a, 0.25, 3.15, 0)); // arm
    lamp.add(box(0.1, 0.18, 0.1, 0x6a5a7a, 0.45, 3.05, 0));
    lamp.position.set(x, 0, z);
    group.add(lamp);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0xfff6d0,
        emissive: 0xffe8a0,
        // Keep modest — high emissive + UnrealBloom washed the whole street white
        emissiveIntensity: 0.38,
        roughness: 0.35,
        metalness: 0.08,
        name: 'lamp_emissive',
      })
    );
    bulb.name = 'lamp_bulb';
    bulb.position.set(x + 0.45, 2.95, z);
    group.add(bulb);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 12, 12),
      new THREE.MeshBasicMaterial({
        color: 0xffeeb0,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      })
    );
    glow.position.set(x + 0.45, 2.95, z);
    group.add(glow);
    const light = new THREE.PointLight(0xffe8b0, 0.55, 18, 2);
    light.position.set(x + 0.45, 2.95, z);
    group.add(light);
  }

  // === BUSHES (overlapping soft spheres — Phase 3 organic polish) ===
  const bushMats = [
    createMat(0x7dcea0),
    createMat(0x6bc490),
    createMat(0x8fd4be),
    createMat(0x5eb888),
  ];
  let bushIndex = 0;
  function placeBush(x, z, i = 0) {
    const s = 0.75 + (i % 4) * 0.12;
    const h = 0.55 + (i % 3) * 0.15;
    const gBush = new THREE.Group();
    gBush.name = `bush_${bushIndex++}`;
    gBush.add(softBlob(bushMats[i % bushMats.length], s * 0.52, h * 0.52, s * 0.48, 0, h * 0.42, 0, true));
    gBush.add(
      softBlob(bushMats[(i + 1) % bushMats.length], s * 0.36, h * 0.38, s * 0.34, 0.16, h * 0.55, 0.08, false)
    );
    gBush.add(
      softBlob(bushMats[(i + 2) % bushMats.length], s * 0.3, h * 0.34, s * 0.32, -0.15, h * 0.48, 0.1, false)
    );
    gBush.add(
      softBlob(bushMats[(i + 3) % bushMats.length], s * 0.26, h * 0.26, s * 0.26, 0.04, h * 0.72, -0.08, false)
    );
    gBush.position.set(x, 0, z);
    gBush.rotation.y = (i * 0.6) % Math.PI;
    group.add(gBush);
    // Solid enough to block walking (height >= 0.35 so Player resolve keeps it)
    addAabbCollider(colliders, x, Math.max(0.4, h * 0.55), z, s * 0.85, Math.max(0.45, h * 0.9), s * 0.8);
  }
  const bushSpots = [
    [-12, -22], [-18, -20], [12, -22], [18, -20],
    [-12, 22], [-22, 16], [12, 22], [22, 16],
    [-30, -6], [-30, 6], [30, -6], [30, 6],
    [-10, 12], [10, -12], [-16, 8], [16, -8],
    [-24, -24], [24, 24], [-6, 28], [6, -28],
    [-22, -8], [22, 8], [-8, -28], [8, 28],
    // denser yard fill
    [-14, -14], [14, 14], [-14, 14], [14, -14],
    [-26, -18], [26, 18], [-26, 18], [26, -18],
    [-32, -22], [32, 22], [-18, -28], [18, 28],
    [-8, -20], [8, 20], [-20, 4], [20, -4],
    [-28, 0], [28, 0], [-4, -32], [4, 32],
  ];
  bushSpots.forEach(([x, z], i) => placeBush(x, z, i));

  // === TREES (cylinder trunk + overlapping soft canopy spheres) ===
  let treeIndex = 0;
  const canopyColors = [0x6bc490, 0x7dcea0, 0x8fd4be, 0x5eb888, 0x96e0b8];
  const canopyMats = canopyColors.map((c) => createMat(c, { name: 'tree_canopy', roughness: 0.9 }));
  const trunkMat = createWoodMat(0xc4956a);
  const trunkFlareMat = createMat(0xb8956a);
  const treeSnowMat = createMat(0xfffaf8, { name: 'snow_cap_tree_mat', roughness: 0.95 });
  function placeTree(x, z, scale = 1) {
    const t = new THREE.Group();
    t.name = `tree_${treeIndex++}`;
    const trunkH = 1.6 * scale;
    const trunkR = 0.17 * scale;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(trunkR * 0.88, trunkR, trunkH, 8),
      trunkMat
    );
    trunk.position.set(0, trunkH / 2, 0);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    t.add(trunk);
    const flare = new THREE.Mesh(
      new THREE.CylinderGeometry(trunkR * 1.35, trunkR * 1.55, 0.14 * scale, 8),
      trunkFlareMat
    );
    flare.position.set(0, 0.07 * scale, 0);
    flare.castShadow = true;
    t.add(flare);
    // Overlapping flattened spheres — shared mats + shared FOLIAGE_SPHERE geo
    const cy = trunkH + 0.2 * scale;
    t.add(softBlob(canopyMats[0], 0.82 * scale, 0.68 * scale, 0.8 * scale, 0, cy + 0.4 * scale, 0, true));
    t.add(
      softBlob(
        canopyMats[1],
        0.62 * scale,
        0.55 * scale,
        0.65 * scale,
        0.26 * scale,
        cy + 0.85 * scale,
        0.14 * scale,
        false
      )
    );
    t.add(
      softBlob(
        canopyMats[2],
        0.55 * scale,
        0.5 * scale,
        0.52 * scale,
        -0.24 * scale,
        cy + 1.15 * scale,
        -0.12 * scale,
        false
      )
    );
    t.add(
      softBlob(
        canopyMats[3],
        0.45 * scale,
        0.42 * scale,
        0.45 * scale,
        0.08 * scale,
        cy + 1.48 * scale,
        0.06 * scale,
        false
      )
    );
    const cap = softBlob(
      treeSnowMat,
      0.36 * scale,
      0.12 * scale,
      0.36 * scale,
      0,
      cy + 1.78 * scale,
      0,
      false
    );
    cap.name = 'snow_cap_tree';
    t.add(cap);
    t.position.set(x, 0, z);
    group.add(t);
    // Trunk collider only
    addAabbCollider(colliders, x, trunkH / 2, z, 0.45 * scale, trunkH, 0.45 * scale);
    coverPoints.push(new THREE.Vector3(x + 1.2, 0, z));
    waypoints.push(new THREE.Vector3(x, 0.2, z + 1.5));
  }
  const treeSpots = [
    [-22, -24, 1.1],
    [22, 24, 1.0],
    [-22, 24, 1.15],
    [22, -24, 0.95],
    [-34, -8, 1.0],
    [34, 8, 1.05],
    [-34, 12, 0.9],
    [34, -12, 1.0],
    [-16, 28, 1.1],
    [16, -28, 1.0],
    [-28, -28, 1.2],
    [28, 28, 1.15],
  ];
  treeSpots.forEach(([x, z, s]) => placeTree(x, z, s));

  // === DECORATIVE SNOW DRIFTS (static props — not weather) ===
  let snowIndex = 0;
  function snowDrift(x, z, w, h, d, rotY = 0) {
    const drift = box(w, h, d, 0xfffaf8, x, h / 2, z);
    drift.name = `snow_drift_${snowIndex++}`;
    drift.rotation.y = rotY;
    group.add(drift);
    // Soft mound puff
    group.add(box(w * 0.65, h * 0.55, d * 0.7, 0xfffefe, x + 0.1, h * 0.7, z + 0.05));
  }
  const drifts = [
    [-30, -28, 3.2, 0.35, 1.8, 0.2],
    [30, 28, 3.0, 0.32, 1.6, -0.15],
    [-30, 28, 2.8, 0.3, 1.7, 0.4],
    [30, -28, 3.1, 0.34, 1.5, -0.3],
    [-18, -30, 4.0, 0.28, 1.4, 0.1],
    [18, 30, 3.8, 0.28, 1.4, 0],
    [-36, 0, 1.6, 0.4, 4.5, 0],
    [36, 0, 1.6, 0.4, 4.5, 0],
    [-10, -24, 2.2, 0.25, 1.2, 0.2],
    [10, 24, 2.2, 0.25, 1.2, -0.2],
    [-8, 26, 2.5, 0.3, 1.3, 0],
    [8, -26, 2.5, 0.3, 1.3, 0],
    [-24, 8, 1.8, 0.28, 2.0, 0.5],
    [24, -8, 1.8, 0.28, 2.0, -0.5],
    [0, 32, 5.0, 0.22, 1.5, 0],
    [0, -32, 5.0, 0.22, 1.5, 0],
  ];
  drifts.forEach(([x, z, w, h, d, r]) => snowDrift(x, z, w, h, d, r));
  // Snow caps on a few mid barriers / mailboxes later
  for (const [x, z] of [
    [-2.75, -1.2],
    [2.75, 1.6],
    [-5.5, -6],
  ]) {
    const cap = box(1.15, 0.1, 0.48, 0xfffaf8, x, 0.78, z);
    cap.name = `snow_cap_${snowIndex++}`;
    group.add(cap);
  }

  // === SIDE-LANE COVER (between houses and outer yards) ===
  function sideLaneCover(x, z, label) {
    const lane = new THREE.Group();
    lane.name = `side_lane_cover_${label}`;
    group.add(lane);
    makeCrate(1.0, 1.05, x, z, 0.2);
    makeCrate(0.95, 0.95, x + 1.1, z + 0.3, -0.15);
    placeBarrier(x - 0.2, z + 1.6, Math.PI / 2, 2);
    placeBarrier(x + 1.3, z + 1.6, Math.PI / 2, 3);
    coverPoints.push(new THREE.Vector3(x, 0, z));
    waypoints.push(new THREE.Vector3(x, 0.2, z + 2));
  }
  sideLaneCover(-12, -12, 'sw');
  sideLaneCover(11, 11, 'ne');
  sideLaneCover(-12, 10, 'nw');
  sideLaneCover(11, -11, 'se');
  sideLaneCover(-26, -4, 'w');
  sideLaneCover(26, 4, 'e');

  // === BACKYARD SET PIECES ===
  function buildShed(x, z, rotY, name) {
    const shed = new THREE.Group();
    shed.name = name;
    shed.add(box(3.2, 2.2, 2.6, 0xe8d5b7, 0, 1.1, 0));
    shed.add(box(3.5, 0.25, 2.9, 0xd4a574, 0, 2.3, 0));
    shed.add(box(1.1, 1.8, 0.12, 0xc4956a, 0, 0.95, 1.35)); // door
    shed.add(box(0.7, 0.55, 0.1, 0x9ad4ea, -0.9, 1.4, 1.32));
    shed.add(box(0.7, 0.55, 0.1, 0x9ad4ea, 0.9, 1.4, 1.32));
    const cap = box(3.2, 0.12, 2.5, 0xfffaf8, 0, 2.48, 0);
    cap.name = 'snow_cap_shed';
    shed.add(cap);
    shed.position.set(x, 0, z);
    shed.rotation.y = rotY;
    group.add(shed);
    shed.updateMatrixWorld(true);
    addCollider(colliders, shed);
    coverPoints.push(new THREE.Vector3(x + 2, 0, z));
    waypoints.push(new THREE.Vector3(x, 0.2, z + 2.5));
  }
  buildShed(-24, -20, 0.2, 'shed_sw');
  buildShed(24, 20, Math.PI + 0.15, 'shed_ne');

  function buildDoghouse(x, z, name) {
    const dh = new THREE.Group();
    dh.name = name;
    dh.add(box(1.3, 0.9, 1.2, 0xffb6c1, 0, 0.5, 0));
    dh.add(box(1.5, 0.2, 1.4, 0xff8fab, 0, 1.05, 0));
    dh.add(box(0.55, 0.55, 0.1, 0x4a3f55, 0, 0.4, 0.62)); // opening
    dh.position.set(x, 0, z);
    group.add(dh);
    addAabbCollider(colliders, x, 0.55, z, 1.35, 1.1, 1.25);
    coverPoints.push(new THREE.Vector3(x + 1, 0, z));
  }
  buildDoghouse(-20, 22, 'doghouse_nw');
  buildDoghouse(20, -22, 'doghouse_se');

  function buildSwing(x, z, name) {
    const sw = new THREE.Group();
    sw.name = name;
    sw.add(box(0.12, 2.2, 0.12, 0x8a7a9a, -1.0, 1.1, 0));
    sw.add(box(0.12, 2.2, 0.12, 0x8a7a9a, 1.0, 1.1, 0));
    sw.add(box(2.2, 0.12, 0.12, 0x8a7a9a, 0, 2.2, 0));
    sw.add(box(0.7, 0.08, 0.35, 0xffeaa7, 0, 1.0, 0));
    sw.add(box(0.04, 1.0, 0.04, 0x6a5a7a, -0.25, 1.55, 0));
    sw.add(box(0.04, 1.0, 0.04, 0x6a5a7a, 0.25, 1.55, 0));
    sw.position.set(x, 0, z);
    group.add(sw);
    addAabbCollider(colliders, x - 1.0, 1.1, z, 0.35, 2.2, 0.35);
    addAabbCollider(colliders, x + 1.0, 1.1, z, 0.35, 2.2, 0.35);
    waypoints.push(new THREE.Vector3(x, 0.2, z));
  }
  buildSwing(-18, -16, 'swing_sw');
  buildSwing(18, 16, 'swing_ne');

  // Mailboxes near house walks + snow caps / flag / number plate
  for (const [x, z, rot] of [
    [-11, -8, 0],
    [11, 8, Math.PI],
    [-11, 8, 0],
    [11, -8, Math.PI],
  ]) {
    const mb = new THREE.Group();
    mb.name = `mailbox_${x}_${z}`;
    mb.add(box(0.12, 0.9, 0.12, 0x8a7a9a, 0, 0.45, 0));
    mb.add(box(0.28, 0.08, 0.28, 0x6a5a7a, 0, 0.06, 0)); // base plate
    const boxBody = box(0.45, 0.3, 0.28, COLORS.pink, 0, 1.0, 0);
    mb.add(boxBody);
    mb.add(box(0.5, 0.06, 0.32, COLORS.lilac, 0, 1.18, 0));
    mb.add(box(0.42, 0.08, 0.06, 0xfffaf5, 0, 0.92, 0.16)); // door seam
    mb.add(box(0.18, 0.04, 0.22, 0xffe066, 0.28, 1.05, 0)); // flag
    mb.add(box(0.06, 0.14, 0.04, 0xff8fab, 0.32, 1.05, 0));
    mb.add(box(0.2, 0.12, 0.04, 0xffffff, -0.05, 0.55, 0.1)); // number plate
    const mcap = box(0.52, 0.08, 0.34, 0xfffaf8, 0, 1.28, 0);
    mcap.name = `snow_cap_mailbox`;
    mb.add(mcap);
    mb.position.set(x, 0, z);
    mb.rotation.y = rot;
    group.add(mb);
    addAabbCollider(colliders, x, 0.6, z, 0.5, 1.2, 0.45);
  }

  function billboard(x, y, z, w, h, color, rotY = 0) {
    const board = box(w, h, 0.12, color, x, y, z);
    board.name = 'billboard';
    board.rotation.y = rotY;
    group.add(board);
    group.add(box(0.12, y, 0.12, 0x8a7a9a, x, y / 2, z));
    // Pole + board footprint
    addAabbCollider(colliders, x, y / 2, z, 0.35, y, 0.35);
    const bw = Math.abs(Math.cos(rotY)) * w + Math.abs(Math.sin(rotY)) * 0.2;
    const bd = Math.abs(Math.sin(rotY)) * w + Math.abs(Math.cos(rotY)) * 0.2;
    addAabbCollider(colliders, x, y, z, Math.max(0.4, bw * 0.85), h, Math.max(0.4, bd * 0.85));
  }
  billboard(-9, 2.2, -28, 2.6, 1.5, 0xffb6c1, 0.1);
  billboard(9, 2.2, 28, 2.6, 1.5, 0xa0d2db, Math.PI + 0.1);
  billboard(-34, 2.0, 0, 2.0, 1.3, 0xffeaa7, Math.PI / 2);
  billboard(34, 2.0, 0, 2.0, 1.3, 0xc5b4e3, -Math.PI / 2);

  // Hydrants
  for (const [x, z] of [
    [6.5, -4],
    [-6.5, 4],
  ]) {
    group.add(box(0.28, 0.55, 0.28, 0xff8fab, x, 0.3, z));
    group.add(box(0.4, 0.14, 0.14, 0xffb6c1, x, 0.45, z));
    group.add(box(0.18, 0.2, 0.18, 0xffc0cb, x, 0.65, z));
    addAabbCollider(colliders, x, 0.4, z, 0.45, 0.8, 0.45);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE C — Zone set-dressing (visual density; solid colliders only where needed)
  // Named markers: zone_mid_*, zone_yard_*, zone_house_*, prop_trim_*, ao_corner_*
  // ═══════════════════════════════════════════════════════════════════════
  function zoneGroup(name) {
    const z = new THREE.Group();
    z.name = name;
    group.add(z);
    return z;
  }
  function dressBox(parent, w, h, d, color, x, y, z, name, opts = {}) {
    const m = box(w, h, d, color, x, y, z, opts);
    if (name) m.name = name;
    parent.add(m);
    return m;
  }
  function snowCapOn(parent, w, d, x, y, z, name) {
    return dressBox(parent, w, 0.08, d, 0xfffaf8, x, y, z, name || 'prop_snowcap');
  }
  function trimBand(parent, w, d, x, y, z, color = 0xfffaf5, name = 'prop_trim') {
    return dressBox(parent, w, 0.1, d, color, x, y, z, name, { roughness: 0.65 });
  }

  // --- MID STREET density ---
  const zoneMid = zoneGroup('zone_mid_street');
  // Roadside planters
  const midDress = [
    [-4.2, 3.5, COLORS.pink],
    [4.2, -3.5, COLORS.lilac],
    [-4.0, -14, COLORS.sky],
    [4.0, 14, COLORS.peach],
    [-3.8, 18, COLORS.yellow],
    [3.8, -18, COLORS.mint || 0x6ee7b7],
  ];
  midDress.forEach(([x, z, col], i) => {
    dressBox(zoneMid, 0.7, 0.35, 0.7, col, x, 0.2, z, `zone_mid_planter_${i}`);
    dressBox(zoneMid, 0.35, 0.4, 0.35, 0x7dcea0, x, 0.55, z, `zone_mid_plant_${i}`);
    snowCapOn(zoneMid, 0.72, 0.72, x, 0.42, z, `prop_snowcap_mid_${i}`);
  });
  // Extra mid trash / cones (visual + light collider on cones)
  for (let i = 0; i < 6; i++) {
    const x = ((i % 2) * 2 - 1) * (2.2 + (i % 3) * 0.3);
    const z = -8 + i * 3.2;
    dressBox(zoneMid, 0.35, 0.55, 0.35, 0xff9f43, x, 0.28, z, `zone_mid_cone_${i}`);
    trimBand(zoneMid, 0.38, 0.38, x, 0.55, z, 0xffffff, `prop_trim_cone_${i}`);
    addAabbCollider(colliders, x, 0.3, z, 0.4, 0.6, 0.4);
  }
  // Bus stop bench + sign (mid north of bus)
  dressBox(zoneMid, 1.6, 0.12, 0.45, 0xd4a574, -6.5, 0.45, -14, 'zone_mid_bench');
  dressBox(zoneMid, 0.12, 0.45, 0.12, 0x8a7a9a, -7.2, 0.25, -14, 'zone_mid_bench_leg_a');
  dressBox(zoneMid, 0.12, 0.45, 0.12, 0x8a7a9a, -5.8, 0.25, -14, 'zone_mid_bench_leg_b');
  dressBox(zoneMid, 0.9, 0.7, 0.1, COLORS.sky, -6.5, 1.5, -15.2, 'zone_mid_sign');
  snowCapOn(zoneMid, 1.0, 0.15, -6.5, 1.9, -15.2, 'prop_snowcap_sign');

  // --- YARD density ---
  const zoneYard = zoneGroup('zone_yard');
  const yardBits = [
    [-20, -14, 0xffb6c1],
    [20, 14, 0xc5b4e3],
    [-22, 8, 0xa0d2db],
    [22, -8, 0xffeaa7],
    [-15, 22, 0xffdab9],
    [15, -22, 0xb5ead7],
    [-30, -16, 0xe0bbe4],
    [30, 16, 0xff8fab],
  ];
  yardBits.forEach(([x, z, col], i) => {
    dressBox(zoneYard, 0.9, 0.5, 0.9, col, x, 0.28, z, `zone_yard_crate_${i}`, { kind: 'wood' });
    trimBand(zoneYard, 0.95, 0.95, x, 0.55, z, 0xb8956a, `prop_trim_yard_${i}`);
    snowCapOn(zoneYard, 0.9, 0.9, x, 0.58, z, `prop_snowcap_yard_${i}`);
    if (i % 2 === 0) addAabbCollider(colliders, x, 0.3, z, 0.95, 0.55, 0.95);
  });
  // Flower rings / garden beds
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2;
    const x = Math.cos(ang) * 26;
    const z = Math.sin(ang) * 26;
    dressBox(zoneYard, 1.2, 0.18, 1.2, 0x8fd4be, x, 0.1, z, `zone_yard_bed_${i}`);
    dressBox(zoneYard, 0.25, 0.35, 0.25, 0xff8fab, x + 0.2, 0.35, z, `zone_yard_flower_${i}`);
    dressBox(zoneYard, 0.22, 0.3, 0.22, 0xffe066, x - 0.25, 0.32, z + 0.15, `zone_yard_flower_b_${i}`);
  }
  // Extra trees for yard silhouette
  placeTree(-26, -22, 1.05);
  placeTree(26, 22, 1.0);
  placeTree(-18, 30, 0.95);
  placeTree(18, -30, 1.1);

  // --- HOUSE-ADJACENT density (porch gardens, path stones, wall clutter) ---
  const zoneHouse = zoneGroup('zone_house');
  for (const side of [-1, 1]) {
    const hx = side * HOUSE_X;
    // Front garden path stones toward road (offset from door center — walkable)
    for (let i = 0; i < 6; i++) {
      const z = side > 0 ? 6 + i * 0.65 : -6 - i * 0.65;
      dressBox(
        zoneHouse,
        0.55,
        0.06,
        0.45,
        0xe8dcc8,
        hx + side * 0.5 + ((i % 2) * 0.15 - 0.08),
        0.04,
        z,
        `zone_house_stone_${side}_${i}`
      );
    }
    // Window flower boxes under L1 front windows (±3 local) — NOT at door center (hx)
    const winZ = side > 0 ? 5.15 : -5.15;
    for (const [wi, wx] of [
      [0, hx - 3.0],
      [1, hx + 3.0],
    ]) {
      dressBox(zoneHouse, 1.15, 0.18, 0.32, COLORS.cream, wx, 1.15, winZ, `zone_house_windowbox_${side}_${wi}`);
      dressBox(zoneHouse, 0.28, 0.24, 0.24, 0xff8fab, wx - 0.28, 1.4, winZ, `zone_house_bloom_a_${side}_${wi}`);
      dressBox(zoneHouse, 0.28, 0.26, 0.24, 0xc5b4e3, wx + 0.28, 1.42, winZ, `zone_house_bloom_b_${side}_${wi}`);
      dressBox(zoneHouse, 0.22, 0.2, 0.22, 0xffe066, wx, 1.38, winZ, `zone_house_bloom_c_${side}_${wi}`);
      snowCapOn(zoneHouse, 1.2, 0.36, wx, 1.3, winZ, `prop_snowcap_house_${side}_${wi}`);
    }
    // Trash can near garage
    dressBox(zoneHouse, 0.55, 0.75, 0.55, 0x9b8eaa, hx + side * 7, 0.4, 2.5, `zone_house_bin_${side}`);
    trimBand(zoneHouse, 0.58, 0.58, hx + side * 7, 0.8, 2.5, 0xfffaf5, `prop_trim_bin_${side}`);
    // Corner planters at house sides (NOT door/stair paths) — visual only
    for (const [pi, pz] of [
      [0, side > 0 ? -4.2 : 4.2],
      [1, side > 0 ? 4.2 : -4.2],
    ]) {
      const px = hx + side * 5.8;
      dressBox(zoneHouse, 0.65, 0.32, 0.65, COLORS.peach || 0xffc9a8, px, 0.18, pz, `zone_house_planter_${side}_${pi}`);
      dressBox(zoneHouse, 0.3, 0.38, 0.3, 0x7dcea0, px, 0.5, pz, `zone_house_plant_${side}_${pi}`);
      dressBox(zoneHouse, 0.22, 0.28, 0.22, 0xff8fab, px + 0.12, 0.48, pz - 0.08, `zone_house_bloom_p_${side}_${pi}`);
      trimBand(zoneHouse, 0.68, 0.68, px, 0.36, pz, 0xfffaf5, `prop_trim_planter_${side}_${pi}`);
    }
    // Low hedge strip along back wall (yard side) — visual only, away from side door
    const backZ = side > 0 ? -5.4 : 5.4;
    for (let hi = -2; hi <= 2; hi++) {
      if (hi === 0) continue; // gap at center path
      dressBox(
        zoneHouse,
        0.7,
        0.4,
        0.45,
        hi % 2 ? 0x6bc490 : 0x7dcea0,
        hx + hi * 1.4,
        0.22,
        backZ,
        `zone_house_hedge_${side}_${hi}`
      );
    }
  }

  // Extra roadside clutter (visual; cones keep existing light colliders only)
  for (let i = 0; i < 4; i++) {
    const x = ((i % 2) * 2 - 1) * (5.2 + (i % 2) * 0.3);
    const z = -22 + i * 14;
    dressBox(zoneMid, 0.5, 0.28, 0.5, COLORS.lilac, x, 0.16, z, `zone_mid_pot_${i}`);
    dressBox(zoneMid, 0.28, 0.35, 0.28, 0x8fd4be, x, 0.45, z, `zone_mid_shrub_${i}`);
    trimBand(zoneMid, 0.52, 0.52, x, 0.32, z, 0xfffaf5, `prop_trim_pot_${i}`);
  }

  // --- Cheap corner AO / contact shadow cues (dark soft slabs, no solid / no physics) ---
  // Phase 2: stronger opacity + more contact pads (houses, vehicles, wall feet).
  const aoMat = createMat(GFX.aoColor ?? 0x3a3348, {
    name: 'ao_corner',
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: GFX.aoOpacity ?? 0.36,
  });
  aoMat.depthWrite = false;
  const placeAo = (w, d, x, z, name, y = 0.028, h = 0.035) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), aoMat.clone());
    m.name = name;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    m.castShadow = false;
    m.renderOrder = 1;
    group.add(m);
    return m;
  };
  const aoCorners = [
    [-34, -34],
    [34, -34],
    [-34, 34],
    [34, 34],
    [-20, -30],
    [20, 30],
    [-30, -12],
    [30, 12],
  ];
  aoCorners.forEach(([x, z], i) => {
    placeAo(6.5, 6.5, x, z, `ao_corner_${i}`);
  });
  // Soft contact shadow under mid street / arch zone
  placeAo(12, 3.4, 0, 0, 'ao_mid_street', 0.024, 0.03);
  // Vehicle contact pads (bus @ -3.6,-10; truck @ 3.8,9)
  placeAo(3.4, 9.2, -3.6, -10, 'ao_vehicle_bus', 0.022, 0.028);
  placeAo(2.8, 5.2, 3.8, 9, 'ao_vehicle_truck', 0.022, 0.028);
  // House foundation contact (front + side feet) — visual only
  for (const side of [-1, 1]) {
    const hx = side * HOUSE_X;
    const frontZ = side > 0 ? 5.2 : -5.2;
    placeAo(11.5, 2.2, hx, frontZ, `ao_house_front_${side}`, 0.026, 0.03);
    placeAo(2.4, 10.5, hx + side * 5.4, 0, `ao_house_side_${side}`, 0.026, 0.03);
    placeAo(3.2, 3.2, hx + side * 2.5, frontZ * 0.55, `ao_house_porch_${side}`, 0.025, 0.03);
  }
  // Arena wall feet — soft contact along inner perimeter
  const wallAo = wall - 0.6;
  placeAo(span + 0.5, 1.4, 0, -wallAo, 'ao_wall_n', 0.024, 0.03);
  placeAo(span + 0.5, 1.4, 0, wallAo, 'ao_wall_s', 0.024, 0.03);
  placeAo(1.4, span + 0.5, -wallAo, 0, 'ao_wall_w', 0.024, 0.03);
  placeAo(1.4, span + 0.5, wallAo, 0, 'ao_wall_e', 0.024, 0.03);

  // === SPAWNS (expanded edges + mid + house fronts) ===
  const extraSpawns = [
    [0, 1.7, 16],
    [0, 1.7, -16],
    [-26, 1.7, -12],
    [26, 1.7, 12],
    [-26, 1.7, 12],
    [26, 1.7, -12],
    [-8, 1.7, 0],
    [8, 1.7, 0],
    [0, 1.7, 0],
    [-14, 1.7, 20],
    [14, 1.7, -20],
    [-30, 1.7, 0],
    [30, 1.7, 0],
    [-18, 1.7, -24],
    [18, 1.7, 24],
    [-22, 1.7, 22],
    [22, 1.7, -22],
    [-4, 1.7, 22],
    [4, 1.7, -22],
  ];
  for (const [x, y, z] of extraSpawns) {
    spawnPoints.push(new THREE.Vector3(x, y, z));
    waypoints.push(new THREE.Vector3(x, 0.2, z));
  }

  // Waypoint grid for AI — spans expanded yards beyond |20|
  for (let x = -34; x <= 34; x += 4) {
    for (let z = -34; z <= 34; z += 4) {
      waypoints.push(new THREE.Vector3(x, 0.2, z));
    }
  }

  scene.add(group);

  // Spawn points are authored near landmarks, vehicles and house fronts, so
  // some can overlap solid geometry after prop/collider changes. The player
  // reset normalizes every offline spawn to standing eye height; publish only
  // points whose full player capsule is clear at that actual height.
  const safeSpawnPoints = spawnPoints.filter((spawn) => !playerPositionBlocked(
    { x: spawn.x, y: PLAYER_HEIGHT, z: spawn.z },
    colliders,
    { height: PLAYER_HEIGHT, radius: PLAYER_RADIUS },
  ));

  return {
    group,
    colliders,
    floors,
    doors,
    roofMantleZones,
    spawnPoints: safeSpawnPoints,
    coverPoints,
    waypoints,
    flagHomes: {
      alpha: { x: -HOUSE_X, y: 0.15, z: -8 },
      bravo: { x: HOUSE_X, y: 0.15, z: 8 },
    },
  };
}
