/**
 * Moving candy conveyor: scrolling belt + looping gift boxes.
 * Player sprint-to-ride is handled in Player/NetPawn via mapData.belts.
 */
import * as THREE from 'three';
import { CONVEYOR } from './layout.js';
import { addAabb, addFloor, box, rbox } from './helpers.js';

const BOX_COLORS = [0xff8fab, 0xffe066, 0x7ee8d4, 0xc9a0e8, 0xffc9a8, 0x7ec8e8];

function makeBeltTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const slat = Math.floor(x / 8) % 2 === 0;
      const o = (y * size + x) * 4;
      data[o] = slat ? 58 : 78;
      data[o + 1] = slat ? 48 : 62;
      data[o + 2] = slat ? 44 : 56;
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function makeGift(color, i) {
  const g = new THREE.Group();
  g.name = `conveyor_box_${i}`;
  g.add(rbox(0.52, 0.4, 0.46, color, 0, 0.22, 0, { name: `${g.name}_body` }));
  g.add(box(0.56, 0.08, 0.14, 0xfff6e8, 0, 0.34, 0, { name: `${g.name}_ribbon` }));
  g.add(box(0.14, 0.08, 0.5, 0xfff6e8, 0, 0.34, 0));
  g.add(rbox(0.16, 0.12, 0.16, 0xffe066, 0, 0.46, 0, { name: `${g.name}_bow` }));
  return g;
}

export function buildConveyor(ctx) {
  const spec = CONVEYOR;
  const len = spec.x1 - spec.x0;
  const cx = (spec.x0 + spec.x1) / 2;
  const cz = spec.z;
  const y = spec.y;
  const halfW = spec.width / 2;

  const root = new THREE.Group();
  root.name = spec.id;
  ctx.group.add(root);

  const frameH = y - 0.08;
  root.add(rbox(len + 0.5, 0.16, spec.width + 0.35, 0x6b5344, cx, 0.1, cz, { kind: 'wood', name: `${spec.id}_bed` }));
  addAabb(ctx.colliders, cx, 0.1, cz, len + 0.35, 0.16, spec.width + 0.2, { kind: 'cover', part: `${spec.id}_bed` });

  for (const end of [spec.x0 + 0.4, cx, spec.x1 - 0.4]) {
    root.add(rbox(0.28, frameH, 0.28, 0x5a4638, end, frameH / 2, cz - halfW - 0.12));
    root.add(rbox(0.28, frameH, 0.28, 0x5a4638, end, frameH / 2, cz + halfW + 0.12));
  }

  const tex = makeBeltTexture();
  tex.repeat.set(Math.max(4, len / 1.6), 1);
  const beltMat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.72,
    metalness: 0.08,
    name: `${spec.id}_belt_mat`,
  });
  const belt = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.2, spec.width - 0.18), beltMat);
  belt.rotation.x = -Math.PI / 2;
  belt.position.set(cx, y + 0.02, cz);
  belt.receiveShadow = true;
  belt.castShadow = false;
  belt.name = `${spec.id}_belt`;
  root.add(belt);

  addFloor(ctx.floors, spec.x0 + 0.15, spec.x1 - 0.15, cz - halfW + 0.1, cz + halfW - 0.1, y);

  const railH = 0.38;
  const railY = y + railH / 2;
  for (const side of [-1, 1]) {
    const rz = cz + side * (halfW + 0.06);
    root.add(rbox(len, railH, 0.12, 0xffc9a8, cx, railY, rz, { name: `${spec.id}_rail_${side}` }));
    addAabb(ctx.colliders, cx, railY, rz, len, railH, 0.14, { kind: 'railing', part: `${spec.id}_rail` });
  }

  const boxes = [];
  const travel = len - 1.2;
  for (let i = 0; i < spec.boxCount; i++) {
    const gift = makeGift(BOX_COLORS[i % BOX_COLORS.length], i);
    const t = (i + 0.5) / spec.boxCount;
    gift.position.set(spec.x0 + 0.6 + t * travel, y, cz);
    root.add(gift);
    boxes.push(gift);
  }

  const beltRec = {
    id: spec.id,
    minX: spec.x0 + 0.2,
    maxX: spec.x1 - 0.2,
    minZ: cz - halfW + 0.12,
    maxZ: cz + halfW - 0.12,
    yMin: y - 0.15,
    yMax: y + 0.7,
    dirX: spec.dirX,
    dirZ: spec.dirZ,
    speed: spec.speed,
  };
  ctx.belts.push(beltRec);

  const uvSpeed = spec.speed / 5.5;
  ctx.conveyors.push({
    tick(dt) {
      if (dt <= 0) return;
      tex.offset.x = (tex.offset.x + uvSpeed * dt) % 1;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        b.position.x += spec.dirX * spec.speed * dt;
        b.position.z += spec.dirZ * spec.speed * dt;
        if (b.position.x > spec.x1 - 0.55) b.position.x = spec.x0 + 0.55;
        if (b.position.x < spec.x0 + 0.55) b.position.x = spec.x1 - 0.55;
      }
    },
    dispose() {
      tex.dispose();
      beltMat.dispose();
      belt.geometry.dispose();
    },
  });

  ctx.coverPoints.push(new THREE.Vector3(spec.x0 + 1.2, 0, cz + 1.4));
  ctx.coverPoints.push(new THREE.Vector3(spec.x1 - 1.2, 0, cz - 1.4));
  ctx.waypoints.push(new THREE.Vector3(spec.x0 + 2, y + 0.1, cz));
  ctx.waypoints.push(new THREE.Vector3(cx, y + 0.1, cz));
  ctx.waypoints.push(new THREE.Vector3(spec.x1 - 2, y + 0.1, cz));
}
