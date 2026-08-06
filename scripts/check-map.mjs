/**
 * Structural + runtime check of shipped buildMap() (Phase 1–4 acceptance).
 * Run: node scripts/check-map.mjs
 * Exit 0 on pass; non-zero with failures listed on stderr.
 */
import * as THREE from 'three';
import {
  buildMap,
  MAP_GROUND,
  MAP_WALL,
  HOUSE_X,
  ROAD_WIDTH,
  ROAD_LENGTH,
} from '../src/game/MapBuilder.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

const scene = new THREE.Scene();
let data;
try {
  data = buildMap(scene);
} catch (e) {
  console.error('buildMap threw:', e);
  process.exit(1);
}

assert(MAP_GROUND === 84, `MAP_GROUND expected 84 got ${MAP_GROUND}`);
assert(MAP_WALL === 40, `MAP_WALL expected 40 got ${MAP_WALL}`);
assert(HOUSE_X >= 16 && HOUSE_X <= 18, `HOUSE_X in 16–18 got ${HOUSE_X}`);
assert(ROAD_WIDTH >= 8, `ROAD_WIDTH >= 8 got ${ROAD_WIDTH}`);
assert(ROAD_LENGTH >= 70, `ROAD_LENGTH >= 70 got ${ROAD_LENGTH}`);

assert(data && typeof data === 'object', 'buildMap returns object');
assert(Array.isArray(data.colliders) && data.colliders.length > 0, 'colliders non-empty');
assert(Array.isArray(data.floors) && data.floors.length > 0, 'floors non-empty');
assert(
  Array.isArray(data.spawnPoints) && data.spawnPoints.length >= 16,
  `spawnPoints >= 16 got ${data.spawnPoints?.length}`
);
assert(Array.isArray(data.coverPoints) && data.coverPoints.length > 0, 'coverPoints non-empty');
assert(Array.isArray(data.waypoints) && data.waypoints.length > 0, 'waypoints non-empty');

let maxAbs = 0;
for (const w of data.waypoints) {
  maxAbs = Math.max(maxAbs, Math.abs(w.x), Math.abs(w.z));
}
assert(maxAbs > 20, `waypoints span beyond |20| (maxAbs=${maxAbs})`);

const names = [];
data.group.traverse((o) => {
  if (o.name) names.push(o.name);
});
const has = (n) => names.includes(n);
const countPrefix = (p) => names.filter((n) => n.startsWith(p)).length;
const countExact = (n) => names.filter((x) => x === n).length;

// Phase 1–2 regression
assert(has('ground'), 'ground mesh present');
assert(has('road'), 'road mesh present');
assert(has('house_west'), 'house_west present');
assert(has('house_east'), 'house_east present');
assert(has('garage_west'), 'garage_west present');
assert(has('garage_east'), 'garage_east present');
assert(has('vehicle_bus'), 'vehicle_bus present');
assert(has('vehicle_truck'), 'vehicle_truck present');
assert(has('vehicle_sedan'), 'vehicle_sedan present (3rd vehicle)');
assert(has('mid_silhouette_arch'), 'mid silhouette arch present');

const vehicles = names.filter((n) => n.startsWith('vehicle_'));
assert(vehicles.length >= 3, `vehicles >= 3 got ${vehicles.length}`);

const barriers = names.filter((n) => n.startsWith('barrier_'));
assert(barriers.length > 4, `barriers > prior 4 got ${barriers.length}`);

const crates = names.filter((n) => n.startsWith('crate_'));
assert(crates.length >= 20, `crate pieces denser got ${crates.length}`);

const clusters = names.filter((n) => n.startsWith('crate_cluster_'));
assert(clusters.length >= 4, `crate clusters >= 4 got ${clusters.length}`);

const crosswalks = names.filter((n) => n === 'crosswalk');
assert(crosswalks.length >= 6, `crosswalk stripes present got ${crosswalks.length}`);

const ground = data.group.getObjectByName('ground');
assert(ground, 'ground object');
const gParams = ground.geometry?.parameters;
assert(
  gParams?.width === 84 && gParams?.depth === 84,
  `ground 84×84 got ${gParams?.width}×${gParams?.depth}`
);

const hw = data.group.getObjectByName('house_west');
const he = data.group.getObjectByName('house_east');
assert(Math.abs(hw.position.x + HOUSE_X) < 0.01, `west house x ~ -${HOUSE_X}`);
assert(Math.abs(he.position.x - HOUSE_X) < 0.01, `east house x ~ ${HOUSE_X}`);

const perims = names.filter((n) => n.startsWith('perimeter_'));
assert(perims.length === 4, `4 perimeter walls got ${perims.length}`);

// Phase 3 — yards / trees / snow / set pieces / porch / side lanes
const trees = countPrefix('tree_');
assert(trees >= 8, `trees >= 8 got ${trees}`);
const bushes = countPrefix('bush_');
assert(bushes >= 30, `bushes denser >= 30 got ${bushes}`);
const snowDrifts = countPrefix('snow_drift_');
assert(snowDrifts >= 8, `snow drifts >= 8 got ${snowDrifts}`);
const snowCaps =
  countPrefix('snow_cap_') +
  countExact('snow_cap_bus') +
  countExact('snow_cap_shed') +
  countExact('snow_cap_tree') +
  countExact('snow_cap_mailbox');
// snow_cap_tree is per-tree child name reused; countExact counts all
const anySnowCap =
  names.some((n) => n.startsWith('snow_cap')) || names.includes('snow_cap_bus');
assert(anySnowCap, 'decorative snow caps present');
assert(snowDrifts >= 1 && anySnowCap, 'decorative snow (drifts + caps) present');

assert(has('shed_sw') || has('shed_ne'), 'backyard shed set piece');
assert(has('shed_sw') && has('shed_ne'), 'sheds on both yard ends');
assert(has('doghouse_nw') || has('doghouse_se'), 'doghouse set piece');
assert(has('swing_sw') || has('swing_ne'), 'swing set piece');
assert(has('porch_furniture_west'), 'porch furniture west');
assert(has('porch_furniture_east'), 'porch furniture east');
const sideLanes = countPrefix('side_lane_cover_');
assert(sideLanes >= 4, `side-lane cover clusters >= 4 got ${sideLanes}`);
assert(has('yard_fences'), 'yard_fences marker present');

// Phase 4 — side exits, interior, elevated floors
assert(has('side_exit_west'), 'side_exit_west second route');
assert(has('side_exit_east'), 'side_exit_east second route');
assert(has('interior_west'), 'interior_west group');
assert(has('interior_east'), 'interior_east group');
const interiorWest = data.group.getObjectByName('interior_west');
const interiorEast = data.group.getObjectByName('interior_east');
assert(interiorWest && interiorWest.children.length >= 12, `interior_west richer got ${interiorWest?.children.length}`);
assert(interiorEast && interiorEast.children.length >= 12, `interior_east richer got ${interiorEast?.children.length}`);
assert(has('balcony_detail_west'), 'balcony_detail_west');
assert(has('balcony_detail_east'), 'balcony_detail_east');
assert(has('garage_roof_west'), 'garage_roof_west elevated');
assert(has('garage_roof_east'), 'garage_roof_east elevated');
assert(has('garage_climb_west'), 'garage_climb_west access');
assert(has('garage_climb_east'), 'garage_climb_east access');

// Elevated floors: y clearly above ground ( > 1.5 )
const elevatedFloors = data.floors.filter((f) => f.y > 1.5);
assert(
  elevatedFloors.length >= 3,
  `elevated floors (y>1.5) >= 3 got ${elevatedFloors.length}`
);
const garageRoofFloors = data.floors.filter((f) => f.y > 2.4 && f.y < 3.5);
assert(garageRoofFloors.length >= 2, `garage/bus roof floors present got ${garageRoofFloors.length}`);

const report = {
  ok: failures.length === 0,
  MAP_GROUND,
  MAP_WALL,
  HOUSE_X,
  colliders: data.colliders.length,
  floors: data.floors.length,
  elevatedFloors: elevatedFloors.length,
  spawnPoints: data.spawnPoints.length,
  coverPoints: data.coverPoints.length,
  waypoints: data.waypoints.length,
  waypointMaxAbs: maxAbs,
  vehicles,
  barrierCount: barriers.length,
  crateCount: crates.length,
  clusterCount: clusters.length,
  treeCount: trees,
  bushCount: bushes,
  snowDriftCount: snowDrifts,
  sideLaneCount: sideLanes,
  interiorWestPieces: interiorWest?.children.length,
  interiorEastPieces: interiorEast?.children.length,
  failures,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: map Phase 1–4 checks ok');
