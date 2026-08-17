/**
 * Elevated gift gantry: walkable deck, stairs both ends, looping boxes, belt carry.
 */
import * as THREE from 'three';
import { GIFT_GANTRY } from './layout.js';
import { addAabb, addAxisStairs, addFloor, box, rbox } from './helpers.js';

const BOX_COLORS = [0xff8fab, 0xffe066, 0x7ee8d4, 0xc9a0e8];

function makeGift(color, i) {
  const g = new THREE.Group();
  g.name = `gantry_box_${i}`;
  g.add(rbox(0.48, 0.36, 0.42, color, 0, 0.2, 0, { name: `${g.name}_body` }));
  g.add(box(0.52, 0.07, 0.12, 0xfff6e8, 0, 0.3, 0));
  g.add(box(0.12, 0.07, 0.46, 0xfff6e8, 0, 0.3, 0));
  g.add(rbox(0.14, 0.1, 0.14, 0xffe066, 0, 0.4, 0));
  return g;
}

export function buildGiftGantry(ctx) {
  const spec = GIFT_GANTRY;
  const len = spec.x1 - spec.x0;
  const cx = (spec.x0 + spec.x1) / 2;
  const cz = spec.z;
  const y = spec.y;
  const halfW = spec.width / 2;

  const root = new THREE.Group();
  root.name = spec.id;
  ctx.group.add(root);

  const posts = 5;
  for (let i = 0; i < posts; i++) {
    const t = i / (posts - 1);
    const px = spec.x0 + t * len;
    for (const side of [-1, 1]) {
      root.add(rbox(0.26, y, 0.26, 0xffc9a8, px, y / 2, cz + side * (halfW + 0.08)));
      addAabb(ctx.colliders, px, y / 2, cz + side * (halfW + 0.08), 0.26, y, 0.26, {
        kind: 'cover',
        part: `${spec.id}_post`,
      });
    }
  }

  root.add(rbox(len + 0.4, 0.18, spec.width + 0.2, 0x6b3a22, cx, y - 0.08, cz, { kind: 'wood', name: `${spec.id}_deck` }));
  addFloor(ctx.floors, spec.x0 + 0.1, spec.x1 - 0.1, cz - halfW + 0.08, cz + halfW - 0.08, y);
  addAabb(ctx.colliders, cx, y - 0.1, cz, len, 0.2, spec.width, { kind: 'pretzel_deck', part: `${spec.id}_deck` });

  const tex = new THREE.DataTexture(new Uint8Array(64 * 64 * 4), 64, 64, THREE.RGBAFormat);
  {
    const data = tex.image.data;
    for (let i = 0; i < 64; i++) {
      for (let j = 0; j < 64; j++) {
        const slat = Math.floor(j / 8) % 2 === 0;
        const o = (i * 64 + j) * 4;
        data[o] = slat ? 62 : 82;
        data[o + 1] = slat ? 50 : 68;
        data[o + 2] = slat ? 46 : 58;
        data[o + 3] = 255;
      }
    }
    tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(Math.max(4, len / 1.6), 1);
  }
  const beltMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.08 });
  const belt = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.25, spec.width - 0.22), beltMat);
  belt.rotation.x = -Math.PI / 2;
  belt.position.set(cx, y + 0.03, cz);
  belt.name = `${spec.id}_belt`;
  root.add(belt);

  for (const side of [-1, 1]) {
    const rz = cz + side * (halfW + 0.05);
    root.add(rbox(len, 0.34, 0.1, 0xffc9a8, cx, y + 0.28, rz));
    addAabb(ctx.colliders, cx, y + 0.28, rz, len, 0.34, 0.12, { kind: 'railing', part: `${spec.id}_rail` });
  }

  addAxisStairs(ctx, root, {
    name: `${spec.id}_stairs_w`,
    axis: 'x',
    sign: 1,
    landX: spec.x0 + 0.35,
    landZ: cz,
    width: spec.width - 0.15,
    deckY: y,
    color: 0x8a5a32,
  });
  addAxisStairs(ctx, root, {
    name: `${spec.id}_stairs_e`,
    axis: 'x',
    sign: -1,
    landX: spec.x1 - 0.35,
    landZ: cz,
    width: spec.width - 0.15,
    deckY: y,
    color: 0x8a5a32,
  });

  const boxes = [];
  const travel = len - 1.1;
  for (let i = 0; i < spec.boxCount; i++) {
    const gift = makeGift(BOX_COLORS[i % BOX_COLORS.length], i);
    gift.position.set(spec.x0 + 0.55 + ((i + 0.5) / spec.boxCount) * travel, y, cz);
    root.add(gift);
    boxes.push(gift);
  }

  ctx.belts.push({
    id: spec.id,
    minX: spec.x0 + 0.25,
    maxX: spec.x1 - 0.25,
    minZ: cz - halfW + 0.1,
    maxZ: cz + halfW - 0.1,
    yMin: y - 0.2,
    yMax: y + 0.75,
    dirX: spec.dirX,
    dirZ: spec.dirZ,
    speed: spec.speed,
  });

  const uvSpeed = spec.speed / 5.5;
  ctx.conveyors.push({
    tick(dt) {
      if (dt <= 0) return;
      tex.offset.x = (tex.offset.x + uvSpeed * dt) % 1;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        b.position.x += spec.dirX * spec.speed * dt;
        if (b.position.x > spec.x1 - 0.5) b.position.x = spec.x0 + 0.5;
      }
    },
    dispose() {
      tex.dispose();
      beltMat.dispose();
      belt.geometry.dispose();
    },
  });

  ctx.coverPoints.push(new THREE.Vector3(spec.x0 + 1, 0, cz + 1.5));
  ctx.waypoints.push(new THREE.Vector3(cx, y + 0.1, cz));
  ctx.waypoints.push(new THREE.Vector3(spec.x0 - 2.2, 0.2, cz));
  ctx.waypoints.push(new THREE.Vector3(spec.x1 + 2.2, 0.2, cz));
}
