/**
 * Scrolling syrup-river surface. Imagine bitmaps on canal planes; UV offset
 * still ticks so the liquid reads as flowing. Node tests get a Texture stub
 * with the same userData / offset so they do not need TextureLoader.
 */
import * as THREE from 'three';

/** Public Imagine 2.0 tiles — strawberry / chocolate / lemon. */
export const SYRUP_BITMAPS = {
  strawberry: '/maps/candy-foundry/syrup-strawberry.jpg',
  chocolate: '/maps/candy-foundry/syrup-chocolate.jpg',
  lemon: '/maps/candy-foundry/syrup-lemon.jpg',
};

export function flavorFromName(name, fallback = 'strawberry') {
  const s = String(name || '').toLowerCase();
  if (s.includes('chocolate')) return 'chocolate';
  if (s.includes('lemon')) return 'lemon';
  if (s.includes('straw') || s.includes('berry')) return 'strawberry';
  return fallback;
}

function makeSyrupMap(kind) {
  const flavor = SYRUP_BITMAPS[kind] ? kind : 'strawberry';
  const src = SYRUP_BITMAPS[flavor];
  const canLoad = typeof document !== 'undefined';
  const tex = canLoad ? new THREE.TextureLoader().load(src) : new THREE.Texture();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.userData.syrupSrc = src;
  tex.userData.syrupKind = flavor;
  tex.userData.imagine = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Horizontal flow plane just above the canal body.
 * `alongX` true = strawberry / lemon (east–west). Chocolate flows north–south.
 * @returns {{ mesh: THREE.Mesh, tick: (dt: number) => void, dispose: () => void }}
 */
export function createSyrupFlow({ color, alongX, width, depth, x, y, z, name, kind }) {
  const flavor = kind || flavorFromName(name);
  const tex = makeSyrupMap(flavor);
  const tilesU = Math.max(1.5, width / 5.5);
  const tilesV = Math.max(1.5, depth / 5.5);
  tex.repeat.set(tilesU, tilesV);

  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.28,
    metalness: 0.12,
    emissive: color,
    emissiveMap: tex,
    emissiveIntensity: 0.18,
    name: `${name}_mat`,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = name;
  mesh.userData.syrupKind = flavor;
  mesh.userData.syrupSrc = tex.userData.syrupSrc;

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
