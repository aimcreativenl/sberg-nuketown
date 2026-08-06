/**
 * Soft / anti-LEGO geometry helpers — rounded boxes + organic blobs.
 * Consumers (MapBuilder trees/bus, props) import from here; do not raise bloom/exposure.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createMat } from './materials.js';

/**
 * Chamfered / beveled box via ExtrudeGeometry (fallback if RoundedBoxGeometry unusable).
 * Rounded rectangle in XZ, extruded along Y (height).
 */
function chamferedBoxGeo(w, h, d, radius, segments = 2) {
  const r = Math.min(Math.max(radius, 0), w / 2, d / 2, h / 2);
  const hw = w / 2;
  const hd = d / 2;
  const shape = new THREE.Shape();
  if (r < 1e-4) {
    shape.moveTo(-hw, -hd);
    shape.lineTo(hw, -hd);
    shape.lineTo(hw, hd);
    shape.lineTo(-hw, hd);
    shape.closePath();
  } else {
    shape.moveTo(-hw + r, -hd);
    shape.lineTo(hw - r, -hd);
    shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
    shape.lineTo(hw, hd - r);
    shape.quadraticCurveTo(hw, hd, hw - r, hd);
    shape.lineTo(-hw + r, hd);
    shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
    shape.lineTo(-hw, -hd + r);
    shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  }
  const bevel = Math.min(r * 0.85, h / 2);
  const depth = Math.max(h - 2 * bevel, 0.001);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 1e-4,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: Math.max(1, segments | 0),
    curveSegments: Math.max(1, segments | 0),
  });
  // Extrude grows +Z from z=0; map to Y-up box centered at origin
  geo.rotateX(-Math.PI / 2);
  geo.center();
  geo.type = 'ChamferedBoxGeometry';
  return geo;
}

/** Shared RoundedBox buffers — houses/bots/crates call this many times with same sizes. */
const _roundedBoxCache = new Map();

function roundedKey(w, h, d, r, segs) {
  // Quantize to avoid float-key duplicates from softR
  const q = (n) => Math.round(n * 1000) / 1000;
  return `${q(w)}_${q(h)}_${q(d)}_${q(r)}_${segs}`;
}

/**
 * Rounded box geometry. API: radius before segments (unlike three's RoundedBoxGeometry).
 * Results are cached and shared across meshes (do not dispose per-mesh).
 * @param {number} w
 * @param {number} h
 * @param {number} d
 * @param {number} [radius=0.08]
 * @param {number} [segments=2]
 * @returns {THREE.BufferGeometry}
 */
export function roundedBoxGeo(w, h, d, radius = 0.08, segments = 2) {
  const r = Math.min(Math.max(radius, 0), w / 2, h / 2, d / 2);
  const segs = Math.max(1, segments | 0);
  const key = roundedKey(w, h, d, r, segs);
  let geo = _roundedBoxCache.get(key);
  if (geo) return geo;
  if (typeof RoundedBoxGeometry === 'function') {
    // three ctor: (width, height, depth, segments, radius)
    geo = new RoundedBoxGeometry(w, h, d, segs, r);
  } else {
    geo = chamferedBoxGeo(w, h, d, r, segs);
  }
  _roundedBoxCache.set(key, geo);
  return geo;
}

/**
 * Soft box mesh — MapBuilder-style placement with rounded geo + createMat.
 * @param {number} w
 * @param {number} h
 * @param {number} d
 * @param {number|string} color
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {object} [opts]
 * @param {THREE.Material} [opts.mat]
 * @param {number} [opts.radius]
 * @param {number} [opts.segments]
 * @param {string} [opts.detailTag]
 * @param {boolean} [opts.castShadow]
 * @param {boolean} [opts.receiveShadow]
 * @returns {THREE.Mesh}
 */
export function softBox(w, h, d, color, x, y, z, opts = {}) {
  const radius = opts.radius ?? Math.min(0.08, w, h, d) * 0.35;
  const segments = opts.segments ?? 2;
  const mat = opts.mat || createMat(color, opts);
  const mesh = new THREE.Mesh(roundedBoxGeo(w, h, d, radius, segments), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = opts.castShadow !== false;
  mesh.receiveShadow = opts.receiveShadow !== false;
  if (opts.detailTag) mesh.name = opts.detailTag;
  return mesh;
}

/**
 * Soft sphere blob (tree canopy puffs, mounds).
 * @param {number} radius
 * @param {number|string} color
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {object} [opts]
 * @returns {THREE.Mesh}
 */
export function softSphere(radius, color, x, y, z, opts = {}) {
  const widthSegs = opts.widthSegments ?? 12;
  const heightSegs = opts.heightSegments ?? 10;
  const mat = opts.mat || createMat(color, opts);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, widthSegs, heightSegs), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = opts.castShadow !== false;
  mesh.receiveShadow = opts.receiveShadow !== false;
  if (opts.detailTag) mesh.name = opts.detailTag;
  return mesh;
}

/**
 * Soft capsule (Y-axis) for trunks / elongated foliage.
 * @param {number} radius
 * @param {number} length mid-cylinder length (total height ≈ length + 2*radius)
 * @param {number|string} color
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {object} [opts]
 * @returns {THREE.Mesh}
 */
export function softCapsule(radius, length, color, x, y, z, opts = {}) {
  const capSegs = opts.capSegments ?? 6;
  const radSegs = opts.radialSegments ?? 10;
  const mat = opts.mat || createMat(color, opts);
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, Math.max(length, 0), capSegs, radSegs),
    mat
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = opts.castShadow !== false;
  mesh.receiveShadow = opts.receiveShadow !== false;
  if (opts.detailTag) mesh.name = opts.detailTag;
  return mesh;
}

/**
 * Organic blob: sphere when extents are near-equal, else Y-capsule sized to fit.
 * @param {number} rx half-width / radius X
 * @param {number} ry half-height / radius Y
 * @param {number} rz half-depth / radius Z
 * @param {number|string} color
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {object} [opts]
 * @returns {THREE.Mesh}
 */
export function capsuleOrSphere(rx, ry, rz, color, x, y, z, opts = {}) {
  const ax = Math.abs(rx);
  const ay = Math.abs(ry);
  const az = Math.abs(rz);
  const maxR = Math.max(ax, ay, az);
  const minR = Math.min(ax, ay, az);
  if (maxR < 1e-6) {
    return softSphere(0.01, color, x, y, z, opts);
  }
  if (maxR / Math.max(minR, 1e-6) < 1.35) {
    const r = (ax + ay + az) / 3;
    return softSphere(r, color, x, y, z, opts);
  }
  const rad = Math.max((ax + az) / 2, 0.01);
  const length = Math.max(ay * 2 - rad * 2, 0);
  return softCapsule(rad, length, color, x, y, z, opts);
}
