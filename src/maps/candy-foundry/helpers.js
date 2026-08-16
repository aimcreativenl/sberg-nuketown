/**
 * Shared voxel builders for Candy Foundry. Do not import MapBuilder.js.
 */
import * as THREE from 'three';
import { createMat, createWoodMat, createGlassMat, createCeilingMat } from '../../game/materials.js';
import { roundedBoxGeo } from '../../game/softGeo.js';
import { makeAabbCollider } from '../../game/collision.js';

export function resolveMat(color, opts = {}) {
  if (opts.mat) return opts.mat;
  if (opts.kind === 'wood') return createWoodMat(color);
  if (opts.kind === 'glass') return createGlassMat(color);
  if (opts.kind === 'ceiling') return createCeilingMat(color);
  return createMat(color, opts);
}

export function box(w, h, d, color, x, y, z, opts = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), resolveMat(color, opts));
  mesh.position.set(x, y, z);
  mesh.castShadow = opts.castShadow !== false;
  mesh.receiveShadow = opts.receiveShadow !== false;
  if (opts.name) mesh.name = opts.name;
  return mesh;
}

export function rbox(w, h, d, color, x, y, z, opts = {}) {
  const radius = opts.radius ?? Math.min(0.1, Math.min(w, h, d) * 0.12);
  const mesh = new THREE.Mesh(roundedBoxGeo(w, h, d, radius, opts.segments ?? 2), resolveMat(color, opts));
  mesh.position.set(x, y, z);
  mesh.castShadow = opts.castShadow !== false;
  mesh.receiveShadow = opts.receiveShadow !== false;
  if (opts.name) mesh.name = opts.name;
  return mesh;
}

export function addFloor(floors, minX, maxX, minZ, maxZ, y) {
  floors.push({ minX, maxX, minZ, maxZ, y });
}

export function addAabb(colliders, x, y, z, w, h, d, meta = {}) {
  colliders.push(makeAabbCollider(x, y, z, w, h, d, { solid: true, ...meta }));
}

export function addMeshCollider(colliders, mesh, meta = {}) {
  mesh.updateMatrix();
  mesh.updateWorldMatrix(true, true);
  const b = new THREE.Box3().setFromObject(mesh);
  colliders.push({ box: b, solid: true, ...meta });
}

/**
 * Swing door compatible with DoorManager (pivot, openYaw, interact, collider).
 * `kind` 'front' = leaf along +X; 'side' = mount yaw so leaf runs along +Z.
 */
export function addSwingDoor(ctx, opts) {
  const {
    parent,
    name,
    houseTag,
    kind = 'front',
    hingeLocal,
    leafW,
    leafH,
    leafD = 0.1,
    openYaw,
    woodColor = 0xd4a574,
    accentColor = 0xff8fab,
    colX,
    colY,
    colZ,
    colW,
    colH,
    colD,
    interactX,
    interactZ,
  } = opts;

  const mount = new THREE.Group();
  mount.name = `${name}_mount`;
  mount.position.set(hingeLocal.x, hingeLocal.y, hingeLocal.z);
  if (kind === 'side') mount.rotation.y = -Math.PI / 2;

  const pivot = new THREE.Group();
  pivot.name = name;
  const panel = rbox(leafW - 0.04, leafH - 0.04, leafD, woodColor, leafW / 2, 0, 0, { kind: 'wood' });
  panel.name = `${name}_panel`;
  pivot.add(panel);
  pivot.add(rbox(0.08, 0.08, 0.14, 0xfff0c8, leafW * 0.82, 0, leafD * 0.9));
  pivot.add(rbox(0.05, 0.22, 0.05, accentColor, leafW * 0.82, 0, leafD * 0.5));
  mount.add(pivot);
  parent.add(mount);

  const collider = makeAabbCollider(colX, colY, colZ, colW, colH, colD, {
    kind: 'house_door',
    house: houseTag,
    part: name,
    solid: true,
  });
  ctx.colliders.push(collider);
  ctx.doors.push({
    name,
    house: houseTag,
    kind,
    pivot,
    openYaw,
    closedYaw: 0,
    open: false,
    anim: 0,
    interact: new THREE.Vector3(interactX, colY ?? 1.15, interactZ),
    collider,
  });
  return pivot;
}

export function makeCtx(scene) {
  const group = new THREE.Group();
  group.name = 'CandyFoundry';
  return {
    scene,
    group,
    colliders: [],
    floors: [],
    doors: [],
    roofMantleZones: [],
    spawnPoints: [],
    coverPoints: [],
    waypoints: [],
    slowZones: [],
    syrupFlows: [],
    belts: [],
    conveyors: [],
  };
}
