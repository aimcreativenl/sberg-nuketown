/**
 * Phase C structural density / readability / atmosphere checks.
 * Calls real buildMap + material/GFX exports.
 */
import * as THREE from 'three';
import { buildMap, HOUSE_X } from '../src/game/MapBuilder.js';
import { GFX, isStandardMaterial, createMat } from '../src/game/materials.js';
import { VoxelCharacter } from '../src/game/VoxelCharacter.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

const scene = new THREE.Scene();
const data = buildMap(scene);
assert(data.colliders.length > 0, 'colliders');
assert(data.floors.length > 0, 'floors');
assert(data.spawnPoints.length >= 16, 'spawns');
assert(data.coverPoints.length > 0, 'cover');
assert(data.waypoints.length > 20, 'waypoints');

const names = [];
data.group.traverse((o) => {
  if (o.name) names.push(o.name);
});
const countPrefix = (p) => names.filter((n) => n.startsWith(p)).length;

// Zone set-dress markers
assert(names.includes('zone_mid_street'), 'zone_mid_street group');
assert(names.includes('zone_yard'), 'zone_yard group');
assert(names.includes('zone_house'), 'zone_house group');
const midProps = countPrefix('zone_mid_');
const yardProps = countPrefix('zone_yard_');
const houseProps = countPrefix('zone_house_');
assert(midProps >= 8, `mid density markers >= 8 got ${midProps}`);
assert(yardProps >= 10, `yard density >= 10 got ${yardProps}`);
assert(houseProps >= 6, `house-adjacent >= 6 got ${houseProps}`);

// Prop language
const trims = countPrefix('prop_trim');
const snowcaps = countPrefix('prop_snowcap') + names.filter((n) => n.includes('snow_cap')).length;
assert(trims >= 4, `prop trims >= 4 got ${trims}`);
assert(snowcaps >= 6, `snow caps language >= 6 got ${snowcaps}`);

// AO corner cues
const ao = countPrefix('ao_corner') + (names.includes('ao_mid_street') ? 1 : 0);
assert(ao >= 4, `ao corners >= 4 got ${ao}`);

// Ground/road still standard materials
const ground = data.group.getObjectByName('ground');
const road = data.group.getObjectByName('road');
assert(ground && isStandardMaterial(ground.material), 'ground MeshStandard');
assert(road && isStandardMaterial(road.material), 'road MeshStandard');

// Character readability accessories
const ch = new VoxelCharacter({ name: 'TEST', outfitIndex: 0 });
assert(ch.mesh.getObjectByName('bot_accessory') || ch.accessory, 'bot accessory');
assert(ch.mesh.getObjectByName('bot_read_outline') || ch.mesh.getObjectByName('bot_backpack'), 'bot read cues');
const ch2 = new VoxelCharacter({ name: 'T2', outfitIndex: 1 });
const ch3 = new VoxelCharacter({ name: 'T3', outfitIndex: 2 });
// At least two different accessory types across outfit indices
const accNames = [0, 1, 2].map((i) => {
  const c = new VoxelCharacter({ name: `A${i}`, outfitIndex: i });
  const a = c.mesh.getObjectByName('bot_accessory');
  return a?.children?.[0]?.name || 'none';
});
assert(new Set(accNames).size >= 2, `varied accessories ${accNames.join(',')}`);

// Atmosphere knobs
assert(GFX.atmosphere === 'golden_hour', 'GFX.atmosphere golden_hour');
// Exposure stays near or slightly under neutral; golden hour is light *color*, not overdrive
assert(GFX.toneMappingExposure >= 0.88 && GFX.toneMappingExposure <= 1.15, 'balanced exposure');
assert(GFX.bloomThreshold >= 0.9, 'bloom threshold high enough to spare pastel albedo');
assert(GFX.bloomStrength <= 0.15, 'bloom strength capped');
assert(GFX.sunIntensity <= 1.0, 'sun intensity capped against pastel wash');
assert(GFX.sunColor != null && GFX.fogColor != null, 'sun/fog colors');
assert(GFX.shadowMapSize >= 2048, 'shadows kept');
assert(GFX.maxPixelRatio >= 2, 'high-DPI path kept');

const gameSrc = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/game/Game.js'),
  'utf8'
);
assert(gameSrc.includes('golden_hour') || gameSrc.includes('sky_golden_hour') || gameSrc.includes('GFX.sunColor'), 'Game golden-hour wiring');
assert(gameSrc.includes('shadowMap.enabled = true'), 'shadows enabled on the renderer');
assert(gameSrc.includes('PCFSoftShadowMap'), 'soft shadow filtering kept');

// Sample: many meshes still standard
let std = 0;
let total = 0;
data.group.traverse((o) => {
  if (!o.isMesh || !o.material) return;
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  for (const m of mats) {
    total++;
    if (m.isMeshStandardMaterial) std++;
  }
});
assert(std / total > 0.45, `standard material share ${(std / total).toFixed(2)}`);

const report = {
  ok: failures.length === 0,
  midProps,
  yardProps,
  houseProps,
  trims,
  snowcaps,
  ao,
  accessories: accNames,
  atmosphere: GFX.atmosphere,
  exposure: GFX.toneMappingExposure,
  meshMaterials: { total, standard: std },
  colliders: data.colliders.length,
  HOUSE_X,
  failures,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: phase-c map density / look checks ok');
