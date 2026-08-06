import * as THREE from 'three';
import { buildMap } from '../src/game/MapBuilder.js';

const scene = new THREE.Scene();
buildMap(scene);

scene.traverse((obj) => {
  if (!obj.isMesh && !obj.isGroup) return;
  const box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) return;
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  if (Math.abs(cx - -28) < 0.6 && Math.abs(cz - 0) < 0.6) {
    console.log(obj.name || '(unnamed)', obj.type, 'box', box.min, box.max);
  }
});
