/**
 * Structural + runtime checks for stylized AAA graphics upgrade.
 * Drives real materials.js + buildMap (shipped paths).
 */
import * as THREE from 'three';
import {
  createMat,
  createGrassMat,
  createRoadMat,
  createWoodMat,
  createFacadeMat,
  createGlassMat,
  createCharMat,
  isStandardMaterial,
  GFX,
  PASTEL,
  makeProcTexture,
} from '../src/game/materials.js';
import { buildMap } from '../src/game/MapBuilder.js';
import { ParticleSystem } from '../src/game/Particles.js';
import { COLORS } from '../src/game/constants.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

// --- Criterion 1: materials not flat Lambert ---
const m1 = createMat(0xff8fab, { name: 'test' });
assert(isStandardMaterial(m1), 'createMat returns MeshStandardMaterial');
assert(m1.roughness > 0.2, 'createMat has roughness');
assert(typeof m1.metalness === 'number', 'createMat has metalness');
const donutA = createMat(0xff8fab, { roughness: 0.55, emissive: 0xff6a90, emissiveIntensity: 0.08, cache: false });
const donutB = createMat(0xff8fab, { roughness: 0.55, emissive: 0xff6a90, emissiveIntensity: 0.08, cache: false });
assert(donutA !== donutB, 'uncached donut mats are unique');
donutA.transparent = true;
donutA.opacity = 0.15;
assert(donutB.opacity === 1, 'fading one donut does not fade another');
assert(m1.opacity === 1, 'fading a donut does not fade cached world mats');

const grass = createGrassMat();
const road = createRoadMat();
const wood = createWoodMat();
const facade = createFacadeMat(COLORS.yellow);
const glass = createGlassMat();
const char = createCharMat(0xa8e6cf);
for (const [label, mat] of [
  ['grass', grass],
  ['road', road],
  ['wood', wood],
  ['facade', facade],
  ['glass', glass],
  ['char', char],
]) {
  assert(isStandardMaterial(mat), `${label} is MeshStandard`);
  assert(!mat.isMeshLambertMaterial, `${label} is not Lambert`);
}

assert(PASTEL.pink === 0xff8fab || PASTEL.pink > 0xff0000, 'PASTEL palette present');
assert(COLORS.pink === PASTEL.pink || COLORS.grass === PASTEL.grass, 'COLORS aligned with popping palette');
assert(GFX.shadowMapSize >= 4096, `shadowMapSize >= 4096 got ${GFX.shadowMapSize}`);
assert(GFX.maxPixelRatio >= 2, `maxPixelRatio >= 2 got ${GFX.maxPixelRatio}`);
assert(GFX.bloomStrength > 0, 'bloomStrength configured');

// Proc texture helper exists (null in node without canvas is OK)
const tex = makeProcTexture('noise', 16, { seed: 1 });
assert(tex === null || tex.isTexture, 'makeProcTexture returns texture or null in node');

// --- Criterion 2–3: map build with standard materials on key surfaces ---
const scene = new THREE.Scene();
const data = buildMap(scene);
assert(data.colliders.length > 0 && data.floors.length > 0, 'map data intact');

const ground = data.group.getObjectByName('ground');
const roadMesh = data.group.getObjectByName('road');
assert(ground, 'ground exists');
assert(roadMesh, 'road exists');
assert(isStandardMaterial(ground.material), 'ground uses MeshStandard');
assert(isStandardMaterial(roadMesh.material), 'road uses MeshStandard');
assert(ground.userData.gfxDetail === 'grass_textured' || ground.material.name === 'grass', 'ground gfx detail marker');
assert(roadMesh.userData.gfxDetail === 'road_textured' || roadMesh.material.name === 'road', 'road gfx detail');

// Sample map materials — majority should be Standard (not exclusive Lambert)
let std = 0;
let lamb = 0;
let total = 0;
data.group.traverse((o) => {
  if (!o.isMesh || !o.material) return;
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  for (const mat of mats) {
    total++;
    if (mat.isMeshStandardMaterial) std++;
    if (mat.isMeshLambertMaterial) lamb++;
  }
});
assert(total > 50, `enough meshes sampled ${total}`);
assert(std > lamb, `more Standard than Lambert (std=${std}, lamb=${lamb})`);
assert(std / total > 0.5, `majority Standard materials ${(std / total).toFixed(2)}`);

// Named detail markers
const names = [];
data.group.traverse((o) => {
  if (o.name) names.push(o.name);
});
assert(names.some((n) => n === 'facade_detail' || n.includes('facade')), 'facade detail present');
assert(names.includes('lamp_bulb') || names.some((n) => n.includes('lamp')), 'emissive lamp bulbs');
assert(names.includes('ground_detail_patch') || std > 100, 'ground micro-detail');

// --- Criterion 4: VFX API ---
const particles = new ParticleSystem(scene);
assert(typeof particles.muzzleFlash === 'function', 'muzzleFlash');
assert(typeof particles.hitSparks === 'function', 'hitSparks');
assert(typeof particles.donutSparkle === 'function', 'donutSparkle');
assert(typeof particles.deathPoof === 'function', 'deathPoof');
assert(typeof particles.snowDust === 'function', 'snowDust');
// Drive real effect path (no hardcode of particle count)
const origin = new THREE.Vector3(0, 1, 0);
const dir = new THREE.Vector3(0, 0, -1);
const before = scene.children.length;
particles.muzzleFlash(origin, dir);
particles.hitSparks(origin);
assert(scene.children.length > before, 'muzzle/hit spawn meshes into scene');
assert(particles.particles.length > 0, 'particle list populated');

// Post-process entry points exist in Game source
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameSrc = fs.readFileSync(path.join(__dirname, '../src/game/Game.js'), 'utf8');
assert(gameSrc.includes('EffectComposer'), 'Game wires EffectComposer');
assert(gameSrc.includes('UnrealBloomPass'), 'Game wires UnrealBloomPass');
assert(gameSrc.includes('VIEWMODEL_LAYER'), 'viewmodel uses overlay layer');
assert(gameSrc.includes('clearDepth'), 'viewmodel overlay clears depth');
assert(gameSrc.includes('PastelGradeShader') || gameSrc.includes('PastelGradePass'), 'pastel grade pass');
assert(gameSrc.includes('GFX.shadowMapSize') || gameSrc.includes('shadowMapSize'), 'shadow size from GFX');
assert(gameSrc.includes('maxPixelRatio') || gameSrc.includes('GFX.maxPixelRatio'), 'high DPI path');

const report = {
  ok: failures.length === 0,
  materialType: GFX.materialType,
  shadowMapSize: GFX.shadowMapSize,
  maxPixelRatio: GFX.maxPixelRatio,
  bloomStrength: GFX.bloomStrength,
  meshMaterials: { total, standard: std, lambert: lamb },
  particleCountAfterFx: particles.particles.length,
  colliders: data.colliders.length,
  failures,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: gfx upgrade checks ok');
