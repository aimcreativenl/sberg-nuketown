/**
 * Scrolling syrup-river surface. One unique canvas texture per plane so
 * offsets do not share a cache. Tick from Game via mapData.tick(dt).
 */
import * as THREE from 'three';

function hexRgb(hex) {
  const n = hex & 0xffffff;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

/** Tileable swirl/streak texture. DataTexture so Node tests need no canvas. */
export function makeSyrupTexture(color, seed = 1) {
  const size = 128;
  const { r, g, b } = hexRgb(color);
  const dark = { r: mix(r, 20, 0.35), g: mix(g, 10, 0.35), b: mix(b, 8, 0.35) };
  const lite = { r: mix(r, 255, 0.42), g: mix(g, 255, 0.38), b: mix(b, 240, 0.32) };
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const ribbon =
        0.55 +
        0.28 * Math.sin((v + seed * 0.07) * Math.PI * 8) +
        0.18 * Math.sin((v * 2.4 + u * 0.35 + seed) * Math.PI * 4);
      const streak = 0.5 + 0.5 * Math.sin((v * 14 + u * 0.8 + seed * 0.4) * Math.PI * 2);
      const bubble = Math.sin((u * 19 + seed) * Math.PI * 2) * Math.sin((v * 17 - seed) * Math.PI * 2);
      const t = Math.max(0, Math.min(1, ribbon));
      let cr = mix(dark.r, r, t);
      let cg = mix(dark.g, g, t);
      let cb = mix(dark.b, b, t);
      if (streak > 0.82) {
        const k = (streak - 0.82) / 0.18;
        cr = mix(cr, lite.r, k);
        cg = mix(cg, lite.g, k);
        cb = mix(cb, lite.b, k);
      }
      if (bubble > 0.72) {
        const k = (bubble - 0.72) / 0.28;
        cr = mix(cr, lite.r, k * 0.55);
        cg = mix(cg, lite.g, k * 0.55);
        cb = mix(cb, lite.b, k * 0.55);
      }
      const o = (y * size + x) * 4;
      data[o] = cr;
      data[o + 1] = cg;
      data[o + 2] = cb;
      data[o + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Horizontal flow plane just above the canal body.
 * `alongX` true = strawberry / lemon (east–west). Chocolate flows north–south.
 * @returns {{ mesh: THREE.Mesh, tick: (dt: number) => void, dispose: () => void }}
 */
export function createSyrupFlow({ color, alongX, width, depth, x, y, z, name }) {
  const tex = makeSyrupTexture(color, Math.abs((x * 3 + z * 7) | 0) % 17);
  const tilesU = Math.max(1.5, width / 5.5);
  const tilesV = Math.max(1.5, depth / 5.5);
  tex.repeat.set(tilesU, tilesV);

  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.34,
    metalness: 0.1,
    emissive: color,
    emissiveMap: tex,
    emissiveIntensity: 0.22,
    name: `${name}_mat`,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = name;

  const speed = 0.16;
  const du = alongX ? speed : speed * 0.12;
  const dv = alongX ? speed * 0.12 : speed;

  return {
    mesh,
    tick(dt) {
      if (!dt || dt <= 0) return;
      tex.offset.x = (tex.offset.x + du * dt) % 1;
      tex.offset.y = (tex.offset.y + dv * dt) % 1;
    },
    dispose() {
      tex.dispose();
      mat.dispose();
      mesh.geometry.dispose();
    },
  };
}

export function tickSyrupFlows(flows, dt) {
  if (!flows?.length) return;
  for (let i = 0; i < flows.length; i++) flows[i].tick(dt);
}

export function disposeSyrupFlows(flows) {
  if (!flows?.length) return;
  for (let i = 0; i < flows.length; i++) flows[i].dispose?.();
  flows.length = 0;
}
