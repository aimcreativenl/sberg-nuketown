/**
 * L2 windows: openings exist; ray through window unblocked; ray through solid wall blocked.
 * Uses shipped buildMap + rayBlockedBySolids (same as Game._shotBlocked / BotAI LOS).
 */
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { buildMap, HOUSE_X } from '../src/game/MapBuilder.js';
import { rayBlockedBySolids } from '../src/game/collision.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

const SCRATCH =
  process.env.GROK_SCRATCH ||
  'C:\\Users\\GEBRUI~1\\AppData\\Local\\Temp\\grok-goal-c9b61c05f4f7\\implementer';

const scene = new THREE.Scene();
const data = buildMap(scene);
const colliders = data.colliders || [];

// Named L2 window markers
const openMarkers = [];
data.group.traverse((o) => {
  if (o.name && o.name.startsWith('window_l2_open_')) openMarkers.push(o);
});
assert(openMarkers.length >= 4, `L2 open markers >= 4 got ${openMarkers.length}`);

const glassNames = [];
data.group.traverse((o) => {
  if (o.name && o.name.includes('window_l2_glass')) glassNames.push(o.name);
});
assert(glassNames.length >= 4, `L2 glass meshes >= 4 got ${glassNames.length}`);

// World positions of openings (house groups already positioned)
const worldOpens = openMarkers.map((m) => {
  const w = new THREE.Vector3();
  m.getWorldPosition(w);
  return { name: m.name, pos: w };
});

let throughWindowFree = 0;
let throughWallBlocked = 0;

for (const open of worldOpens) {
  // Interior eye slightly inside house; exterior target outside beyond window
  const towardOut = open.pos.z > 0 ? 1 : -1; // east house front +Z, west front -Z
  // Infer house center X from marker name / position
  const houseCx = open.pos.x > 0 ? HOUSE_X : -HOUSE_X;
  const eye = new THREE.Vector3(open.pos.x, open.pos.y, open.pos.z - towardOut * 1.4);
  // Keep eye on house interior side of front wall
  const exterior = new THREE.Vector3(open.pos.x, open.pos.y, open.pos.z + towardOut * 2.5);

  const blockedWin = rayBlockedBySolids(eye, exterior, colliders, { step: 0.35, minHeight: 0.5 });
  if (!blockedWin) throughWindowFree++;
  else failures.push(`window ray blocked ${open.name} eye=${eye.toArray().map((n) => n.toFixed(2))} → ext`);

  // Adjacent solid wall sample: same Y, offset in X toward pier/header (away from opening center)
  const wallX = houseCx; // center pier between the two L2 windows
  const wallEye = new THREE.Vector3(wallX, open.pos.y, open.pos.z - towardOut * 1.4);
  const wallExt = new THREE.Vector3(wallX, open.pos.y, open.pos.z + towardOut * 2.5);
  const blockedWall = rayBlockedBySolids(wallEye, wallExt, colliders, { step: 0.35, minHeight: 0.5 });
  if (blockedWall) throughWallBlocked++;
  else failures.push(`solid front wall ray NOT blocked at x=${wallX.toFixed(2)} y=${open.pos.y.toFixed(2)}`);
}

assert(
  throughWindowFree === worldOpens.length,
  `all window rays free ${throughWindowFree}/${worldOpens.length}`
);
assert(
  throughWallBlocked === worldOpens.length,
  `all solid-wall rays blocked ${throughWallBlocked}/${worldOpens.length}`
);

// L2 sill/header colliders exist; no solid sealing the open mid-band at window X
const l2Parts = colliders.filter((c) => c.kind === 'house_wall' && String(c.part).startsWith('front_l2'));
assert(l2Parts.some((c) => c.part === 'front_l2_sill'), 'front_l2_sill collider');
assert(l2Parts.some((c) => c.part === 'front_l2_header'), 'front_l2_header collider');
assert(l2Parts.some((c) => String(c.part).includes('pier')), 'front_l2 pier colliders');

const report = {
  ok: failures.length === 0,
  openMarkers: openMarkers.map((m) => m.name),
  glassNames,
  throughWindowFree,
  throughWallBlocked,
  l2WallParts: l2Parts.map((c) => `${c.house}:${c.part}`),
  failures,
};

try {
  fs.mkdirSync(SCRATCH, { recursive: true });
  fs.writeFileSync(path.join(SCRATCH, 'house-windows.log'), JSON.stringify(report, null, 2), 'utf8');
} catch (err) {
  console.warn('SCRATCH write failed', err.message);
}

console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: L2 windows shoot-through; solid walls block');
