/**
 * Main roof floors + double-Space mantle helper + player path integration.
 * Uses shipped buildMap, tryRoofMantle, Player.update.
 */
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { buildMap, HOUSE_X } from '../src/game/MapBuilder.js';
import { tryRoofMantle } from '../src/game/movement.js';
import { Player } from '../src/game/Player.js';
import { PLAYER_HEIGHT } from '../src/game/constants.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

const SCRATCH =
  process.env.GROK_SCRATCH ||
  'C:\\Users\\GEBRUI~1\\AppData\\Local\\Temp\\grok-goal-c9b61c05f4f7\\implementer';

const scene = new THREE.Scene();
const data = buildMap(scene);

// Roof mantle zones from map
const zones = data.roofMantleZones || [];
assert(zones.length >= 4, `roofMantleZones >= 4 (2 main + 2 garage) got ${zones.length}`);
const mainRoofs = zones.filter((z) => z.kind === 'main_roof');
assert(mainRoofs.length >= 2, `main roofs ${mainRoofs.length}`);
for (const z of mainRoofs) {
  assert(z.y > 5.0, `main roof y above L2 got ${z.y}`);
  assert(z.y > 3.5, `main roof clearly above L2 floor`);
}

// Floors at main roof height
const roofFloors = (data.floors || []).filter((f) => f.y >= 5.5 && f.y <= 6.2);
assert(roofFloors.length >= 2, `roof floor pads >= 2 got ${roofFloors.length}`);

// Named main roof meshes
const names = [];
data.group.traverse((o) => {
  if (o.name) names.push(o.name);
});
assert(names.includes('main_roof_west'), 'main_roof_west mesh');
assert(names.includes('main_roof_east'), 'main_roof_east mesh');
assert(
  names.some((n) => n.startsWith('main_roof_climb_') || n.startsWith('roof_climb_pad_')),
  'roof climb pads present'
);

// Pure mantle helper: airborne near edge of west main roof
const westRoof = mainRoofs.find((z) => z.house === 'west') || mainRoofs[0];
const edgeX = westRoof.minX - 0.2;
const edgeZ = (westRoof.minZ + westRoof.maxZ) / 2;
const belowEye = {
  x: edgeX,
  y: westRoof.y - 0.6 + PLAYER_HEIGHT, // feet ~0.6 below roof
  z: edgeZ,
};
const hit = tryRoofMantle(belowEye, PLAYER_HEIGHT, zones, {
  reach: 1.45,
  margin: 0.7,
  edgeBand: 1.0,
});
assert(hit && Math.abs(hit.y - westRoof.y) < 0.01, `mantle grabs west roof y=${hit?.y}`);

// Deep under roof center should NOT mantle
const deep = {
  x: (westRoof.minX + westRoof.maxX) / 2,
  y: westRoof.y - 0.6 + PLAYER_HEIGHT,
  z: (westRoof.minZ + westRoof.maxZ) / 2,
};
const noDeep = tryRoofMantle(deep, PLAYER_HEIGHT, zones, {
  reach: 1.45,
  margin: 0.7,
  edgeBand: 1.0,
});
assert(!noDeep, 'no mantle deep under roof center');

// Too far below should fail
const tooLow = {
  x: edgeX,
  y: westRoof.y - 2.5 + PLAYER_HEIGHT,
  z: edgeZ,
};
assert(!tryRoofMantle(tooLow, PLAYER_HEIGHT, zones, { reach: 1.45 }), 'no mantle when too low');

// Pure mantle must clamp XZ onto the roof floor (not leave player outside minX)
assert(hit.x >= westRoof.minX && hit.x <= westRoof.maxX, `mantle x on roof ${hit.x}`);
assert(hit.z >= westRoof.minZ && hit.z <= westRoof.maxZ, `mantle z on roof ${hit.z}`);

// Player.update path: synthetic airborne + double-Space edge at west minX-0.2
const camera = new THREE.PerspectiveCamera();
const player = new Player(camera, data);
player.position.set(edgeX, westRoof.y - 0.55 + PLAYER_HEIGHT, edgeZ);
player.grounded = false;
player._airJumpUsed = true;
player._spaceHeld = false;
player._mantleCooldown = 0;
player.velocity.set(0, -1, 0);
player.keys.add('Space');
const result = player.update(1 / 60, data.colliders, data.floors, []);
assert(result.mantled === true || player.grounded, `player mantled/grounded got mantled=${result.mantled} grounded=${player.grounded}`);
const feet = player.position.y - PLAYER_HEIGHT;
assert(
  Math.abs(feet - westRoof.y) < 0.15,
  `player feet on roof after mantle (feet=${feet.toFixed(2)} roof=${westRoof.y})`
);
// XZ must land inside roof floor so walk sampling keeps them up
assert(
  player.position.x >= westRoof.minX && player.position.x <= westRoof.maxX,
  `mantle clamps x onto roof (got ${player.position.x.toFixed(2)}, zone ${westRoof.minX}..${westRoof.maxX})`
);
assert(
  player.position.z >= westRoof.minZ && player.position.z <= westRoof.maxZ,
  `mantle clamps z onto roof (got ${player.position.z.toFixed(2)})`
);

// Multi-frame: after mantle, player must stay on roof for ~20 frames (no fall-off)
player.keys.clear();
player.velocity.set(0, 0, 0);
let stayedOnRoof = true;
let lastFeet = feet;
for (let i = 0; i < 20; i++) {
  player.update(1 / 60, data.colliders, data.floors, []);
  lastFeet = player.position.y - PLAYER_HEIGHT;
  if (lastFeet < westRoof.y - 0.35 || !player.grounded) {
    stayedOnRoof = false;
    failures.push(
      `fell off roof after mantle frame ${i + 1}: feet=${lastFeet.toFixed(2)} grounded=${player.grounded}`
    );
    break;
  }
}
assert(stayedOnRoof, `stay on roof after mantle (feet=${lastFeet.toFixed(2)})`);

// Standing on roof floor via floor snap (no mantle) — simulate a short fall onto roof
const player2 = new Player(camera, data);
player2.position.set(-HOUSE_X, westRoof.y + PLAYER_HEIGHT + 0.35, 0);
player2.velocity.set(0, -0.5, 0);
player2.grounded = false;
for (let i = 0; i < 20; i++) {
  player2.update(1 / 60, data.colliders, data.floors, []);
  if (player2.grounded) break;
}
const feet2 = player2.position.y - PLAYER_HEIGHT;
assert(
  player2.grounded && Math.abs(feet2 - westRoof.y) < 0.12,
  `stand on roof floor feet=${feet2.toFixed(2)} grounded=${player2.grounded}`
);

const report = {
  ok: failures.length === 0,
  roofMantleZones: zones.length,
  mainRoofs: mainRoofs.map((z) => ({ house: z.house, y: z.y })),
  roofFloors: roofFloors.length,
  mantleY: hit?.y,
  mantleXZ: { x: hit?.x, z: hit?.z },
  playerFeetAfterMantle: feet,
  playerXZAfterMantle: { x: player.position.x, z: player.position.z },
  stayedOnRoof,
  lastFeetAfter20: lastFeet,
  playerFeetStand: feet2,
  failures,
};

try {
  fs.mkdirSync(SCRATCH, { recursive: true });
  fs.writeFileSync(path.join(SCRATCH, 'house-roofs.log'), JSON.stringify(report, null, 2), 'utf8');
} catch (err) {
  console.warn('SCRATCH write failed', err.message);
}

console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: roof floors + double-Space mantle');
