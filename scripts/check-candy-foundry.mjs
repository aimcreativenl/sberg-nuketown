/**
 * Candy Foundry layout + registry + actual THREE build (no WebGL renderer).
 */
import * as THREE from 'three';
import {
  BR_ZONE as CANDY_BR_ZONE,
  CANDY_BOUNDS,
  CANDY_MAP_ID,
  CANDY_MAP_WALL,
  CANALS,
  FLAG_HOMES,
  MEDKIT_SPOTS,
  SWEET_CO,
  SUGAR_WORKS,
  TASTING_KIOSK,
  CONVEYOR,
  CUPCAKE_KIOSK,
  GUMMY_BEARS,
  SOFT_SERVE,
  GIFT_GANTRY,
} from '../src/maps/candy-foundry/layout.js';
import {
  DEFAULT_MAP_ID,
  MAP_CANDY_FOUNDRY,
  MAP_NUKETOWN,
  MAPS,
  getMap,
  listMaps,
} from '../src/maps/index.js';
import { brZoneFromMap, zoneRadiusAt } from '../src/modes/pubg.js';
import { DoorManager } from '../src/game/Doors.js';
import { playerPositionBlocked } from '../src/game/collision.js';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from '../src/game/constants.js';
import { existsSync } from 'node:fs';
import { SYRUP_BITMAPS } from '../src/maps/candy-foundry/syrupFlow.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

assert(CANDY_MAP_ID === 'candy-foundry', `CANDY_MAP_ID (${CANDY_MAP_ID})`);
assert(CANDY_MAP_WALL >= 80, `CANDY_MAP_WALL >= 80 (got ${CANDY_MAP_WALL})`);
assert(CANDY_BOUNDS >= 70, `CANDY_BOUNDS inside wall (got ${CANDY_BOUNDS})`);

assert(FLAG_HOMES?.alpha && FLAG_HOMES?.bravo, 'FLAG_HOMES alpha + bravo');
assert(typeof FLAG_HOMES.alpha.x === 'number' && FLAG_HOMES.alpha.x < 0, 'FLAG_HOMES.alpha on −X');
assert(typeof FLAG_HOMES.bravo.x === 'number' && FLAG_HOMES.bravo.x > 0, 'FLAG_HOMES.bravo on +X');

assert(Array.isArray(MEDKIT_SPOTS) && MEDKIT_SPOTS.length >= 2, `MEDKIT_SPOTS >= 2 (got ${MEDKIT_SPOTS?.length})`);
assert(Array.isArray(CANALS) && CANALS.length >= 1, 'CANALS / slowZones authored');
assert(CANALS.every((c) => c.speedMul > 0 && c.speedMul < 1), 'canal speedMul is a slowdown');

assert(DEFAULT_MAP_ID === 'nuketown', 'default map stays nuketown');
assert(MAP_NUKETOWN?.id === 'nuketown', 'MAP_NUKETOWN id');
assert(MAP_CANDY_FOUNDRY?.id === 'candy-foundry', 'MAP_CANDY_FOUNDRY id');
assert(MAPS.nuketown === MAP_NUKETOWN, 'registry has nuketown');
assert(MAPS['candy-foundry'] === MAP_CANDY_FOUNDRY, 'registry has candy-foundry');
assert(getMap('nuketown').id === 'nuketown', 'getMap nuketown');
assert(getMap('candy-foundry').id === 'candy-foundry', 'getMap candy-foundry');
assert(getMap('nope').id === 'nuketown', 'unknown id falls back to nuketown');
assert(
  listMaps().some((m) => m.id === 'nuketown') && listMaps().some((m) => m.id === 'candy-foundry'),
  'listMaps includes both packs'
);

assert(CANDY_BR_ZONE.stages[0].r >= 80, `candy BR start radius covers wall 80 (got ${CANDY_BR_ZONE.stages[0].r})`);
assert(zoneRadiusAt(0, CANDY_BR_ZONE) === CANDY_BR_ZONE.stages[0].r, 'zoneRadiusAt reads candy brZone');
assert(zoneRadiusAt(0) === 44, 'default zoneRadiusAt stays Nuketown 44');
assert(brZoneFromMap({ brZone: CANDY_BR_ZONE }) === CANDY_BR_ZONE, 'brZoneFromMap prefers mapData.brZone');
assert(brZoneFromMap({}) === brZoneFromMap(null), 'brZoneFromMap falls back to MODE default');

const scene = new THREE.Scene();
let data;
try {
  data = MAP_CANDY_FOUNDRY.build(scene);
} catch (err) {
  console.error('candy-foundry build() threw:', err);
  process.exit(1);
}

const nanColliders = (data.colliders || []).filter((c) => {
  const b = c.box;
  if (!b?.min || !b?.max) return true;
  return ![b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].every(Number.isFinite);
});
assert(nanColliders.length === 0, `no NaN collider boxes (got ${nanColliders.length})`);
const nanFloors = (data.floors || []).filter(
  (f) => ![f.minX, f.maxX, f.minZ, f.maxZ, f.y].every(Number.isFinite)
);
assert(nanFloors.length === 0, `no NaN floors (got ${nanFloors.length})`);

const flowNames = [];
data.group.traverse((o) => {
  if (o.isMesh && String(o.name).startsWith('canal_flow_')) flowNames.push(o.name);
});
assert(flowNames.length >= 3, `syrup flow planes >= 3 (got ${flowNames.length})`);
assert(typeof data.tick === 'function', 'mapData.tick animates syrup');
assert(typeof data.syncLights === 'function', 'mapData.syncLights culls far point lights');
{
  const byKind = {};
  data.group.traverse((o) => {
    if (!o.isMesh || !String(o.name).startsWith('canal_flow_')) return;
    const map = o.material?.map;
    if (!map) return;
    const kind = map.userData?.syrupKind || o.userData?.syrupKind;
    if (kind) byKind[kind] = { mesh: o, map };
  });
  assert(byKind.strawberry, 'strawberry canal uses a flow map');
  assert(byKind.chocolate, 'chocolate canal uses a flow map');
  const berrySrc = String(byKind.strawberry.map.userData.syrupSrc || byKind.strawberry.mesh.userData.syrupSrc || '');
  const chocoSrc = String(byKind.chocolate.map.userData.syrupSrc || byKind.chocolate.mesh.userData.syrupSrc || '');
  assert(berrySrc.includes('syrup-strawberry'), `strawberry bitmap src (${berrySrc})`);
  assert(chocoSrc.includes('syrup-chocolate'), `chocolate bitmap src (${chocoSrc})`);
  assert(!(byKind.strawberry.map.isDataTexture), 'strawberry is not a procedural DataTexture');
  assert(!(byKind.chocolate.map.isDataTexture), 'chocolate is not a procedural DataTexture');
  assert(existsSync('public/maps/candy-foundry/syrup-strawberry.jpg'), 'strawberry Imagine file on disk');
  assert(existsSync('public/maps/candy-foundry/syrup-chocolate.jpg'), 'chocolate Imagine file on disk');
  assert(SYRUP_BITMAPS.strawberry.endsWith('syrup-strawberry.jpg'), 'SYRUP_BITMAPS strawberry');
  assert(SYRUP_BITMAPS.chocolate.endsWith('syrup-chocolate.jpg'), 'SYRUP_BITMAPS chocolate');
  const sample = byKind.strawberry.map;
  const ox = sample.offset.x;
  const oy = sample.offset.y;
  data.tick(0.5);
  assert(
    Math.abs(sample.offset.x - ox) > 1e-5 || Math.abs(sample.offset.y - oy) > 1e-5,
    'tick shifts syrup UV offset'
  );
}

assert(data?.id === 'candy-foundry', 'build returns candy-foundry id');
assert(data.wall >= 80, `build wall >= 80 (got ${data.wall})`);
assert(data.bounds >= 70, `build bounds >= 70 (got ${data.bounds})`);
assert(Array.isArray(data.colliders) && data.colliders.length > 40, `colliders > 40 (got ${data.colliders?.length})`);
assert(Array.isArray(data.floors) && data.floors.length > 10, `floors > 10 (got ${data.floors?.length})`);
assert(Array.isArray(data.spawnPoints) && data.spawnPoints.length >= 16, `safe spawns >= 16 (got ${data.spawnPoints?.length})`);
assert(Array.isArray(data.coverPoints) && data.coverPoints.length > 20, `cover > 20 (got ${data.coverPoints?.length})`);
assert(Array.isArray(data.waypoints) && data.waypoints.length > 40, `waypoints > 40 (got ${data.waypoints?.length})`);
assert(Array.isArray(data.slowZones) && data.slowZones.length >= 1, `slowZones authored (got ${data.slowZones?.length})`);
assert(data.fog?.far > 150, `fog.far covers hangar (got ${data.fog?.far})`);
assert(data.snow === false, 'indoor Foundry disables falling snow');

const names = [];
data.group.traverse((o) => {
  if (o.name) names.push(o.name);
});
assert(data.group.name === 'CandyFoundry', 'root group CandyFoundry');
assert(names.includes(SWEET_CO.id), 'sweet_co group');
assert(names.includes(SUGAR_WORKS.id), 'sugar_works group');
assert(names.includes('CandyYard') || names.includes('fountain_island'), 'yard / fountain present');

const doorNames = (data.doors || []).map((d) => d.name);
for (const n of [
  'door_front_sweet_co',
  'door_side_sweet_co',
  'door_front_sugar_works',
  'door_side_sugar_works',
  'door_front_tasting_kiosk',
  'door_front_cupcake_kiosk',
]) {
  assert(doorNames.includes(n), `door ${n}`);
}
assert(names.includes(CUPCAKE_KIOSK.id), 'cupcake_kiosk group');
assert(names.includes('gummy_bears'), 'gummy_bears group');
assert(names.includes(SOFT_SERVE.id), 'soft_serve_tower group');
assert(names.includes(GIFT_GANTRY.id), 'gift_gantry group');
assert(GUMMY_BEARS.length >= 3, 'three gummy bears authored');
assert((data.belts || []).length >= 2, `belts include ground line + gantry (got ${data.belts?.length})`);
{
  const gantryBelt = (data.belts || []).find((b) => b.id === GIFT_GANTRY.id);
  assert(gantryBelt && gantryBelt.speed > 0, 'gantry belt authored');
  let box0 = null;
  data.group.traverse((o) => {
    if (!box0 && o.name === 'gantry_box_0') box0 = o;
  });
  assert(!!box0, 'gantry gift box 0');
  const gx = box0.position.x;
  data.tick(0.4);
  assert(box0.position.x > gx + 0.4, `gantry box moved +X (Δ=${(box0.position.x - gx).toFixed(2)})`);
}

const eye = { height: PLAYER_HEIGHT, radius: PLAYER_RADIUS };
const blocked = (x, z) =>
  playerPositionBlocked({ x, y: PLAYER_HEIGHT, z }, data.colliders, eye);

assert(blocked(SWEET_CO.cx, SWEET_CO.cz - SWEET_CO.d / 2), 'Sweet Co back wall blocks');
assert(blocked(SUGAR_WORKS.cx, SUGAR_WORKS.cz + SUGAR_WORKS.d / 2), 'Sugar Works back wall blocks');

const mgr = new DoorManager(data.doors || []);
const frontSweet = (data.doors || []).find((d) => d.name === 'door_front_sweet_co');
const frontSugar = (data.doors || []).find((d) => d.name === 'door_front_sugar_works');
if (frontSweet) {
  const p = frontSweet.interact;
  assert(blocked(p.x, p.z), 'Sweet Co front blocks when closed');
  mgr.setOpen(frontSweet.name, true);
  assert(!blocked(p.x, p.z), 'Sweet Co front walkable when open');
  const inner = { x: SWEET_CO.cx, z: SWEET_CO.cz + (SWEET_CO.d / 2 - 3.2) };
  assert(
    !playerPositionBlocked({ x: inner.x, y: PLAYER_HEIGHT, z: inner.z }, data.colliders, eye),
    `Sweet Co reception clear at (${inner.x.toFixed(1)}, ${inner.z.toFixed(1)})`
  );
} else {
  failures.push('missing door_front_sweet_co for walk-in check');
}
if (frontSugar) {
  const p = frontSugar.interact;
  assert(blocked(p.x, p.z), 'Sugar Works front blocks when closed');
  mgr.setOpen(frontSugar.name, true);
  assert(!blocked(p.x, p.z), 'Sugar Works front walkable when open');
  const inner = { x: SUGAR_WORKS.cx, z: SUGAR_WORKS.cz - (SUGAR_WORKS.d / 2 - 3.2) };
  assert(
    !playerPositionBlocked({ x: inner.x, y: PLAYER_HEIGHT, z: inner.z }, data.colliders, eye),
    `Sugar Works wrapping clear at (${inner.x.toFixed(1)}, ${inner.z.toFixed(1)})`
  );
} else {
  failures.push('missing door_front_sugar_works for walk-in check');
}

const frontKiosk = (data.doors || []).find((d) => d.name === 'door_front_tasting_kiosk');
if (frontKiosk) {
  const p = frontKiosk.interact;
  assert(blocked(p.x, p.z), 'kiosk front blocks when closed');
  mgr.setOpen(frontKiosk.name, true);
  assert(!blocked(p.x, p.z), 'kiosk front walkable when open');
  const inner = { x: TASTING_KIOSK.cx, z: TASTING_KIOSK.cz + 1.1 };
  assert(
    !playerPositionBlocked({ x: inner.x, y: PLAYER_HEIGHT, z: inner.z }, data.colliders, eye),
    `kiosk interior clear at (${inner.x.toFixed(1)}, ${inner.z.toFixed(1)})`
  );
} else {
  failures.push('missing door_front_tasting_kiosk for walk-in check');
}
{
  const cupcakeDoor = (data.doors || []).find((d) => d.name === 'door_front_cupcake_kiosk');
  if (cupcakeDoor) {
    const p = cupcakeDoor.interact;
    assert(blocked(p.x, p.z), 'cupcake door blocks when closed');
    mgr.setOpen(cupcakeDoor.name, true);
    assert(!blocked(p.x, p.z), 'cupcake door walkable when open');
    const inner = { x: CUPCAKE_KIOSK.cx, z: CUPCAKE_KIOSK.cz };
    assert(
      !playerPositionBlocked({ x: inner.x, y: PLAYER_HEIGHT, z: inner.z }, data.colliders, eye),
      'cupcake interior walkable'
    );
  } else {
    failures.push('missing door_front_cupcake_kiosk for walk-in check');
  }
}

assert(names.includes(TASTING_KIOSK.id), 'tasting_kiosk group');
assert(names.includes(CONVEYOR.id) || names.includes(`${CONVEYOR.id}_belt`), 'conveyor present');
assert(Array.isArray(data.belts) && data.belts.length >= 1, 'mapData.belts for occupancy ride');

{
  let boxMesh = null;
  data.group.traverse((o) => {
    if (!boxMesh && o.name === 'conveyor_box_0') boxMesh = o;
  });
  assert(!!boxMesh, 'conveyor gift box 0 exists');
  const x0 = boxMesh.position.x;
  data.tick(0.4);
  assert(boxMesh.position.x > x0 + 0.5, `conveyor box moved +X (Δ=${(boxMesh.position.x - x0).toFixed(2)})`);
}

{
  const { Player } = await import('../src/game/Player.js');
  const { beltCarryDelta } = await import('../src/game/movement.js');
  const ride = beltCarryDelta(40, CONVEYOR.y, CONVEYOR.z, data.belts);
  assert(ride && ride.dx > 2, `beltCarryDelta occupancy (got ${JSON.stringify(ride)})`);
  const noSprint = beltCarryDelta(40, CONVEYOR.y, CONVEYOR.z, false, data.belts);
  assert(noSprint && noSprint.dx > 2, `carry without sprint (got ${JSON.stringify(noSprint)})`);
  const offBelt = beltCarryDelta(0, CONVEYOR.y, 0, data.belts);
  assert(offBelt == null, 'no carry off the belt AABB');
  const cam = new THREE.PerspectiveCamera();
  const player = new Player(cam, data);
  player.mapBounds = data.bounds;
  player.position.set(40, PLAYER_HEIGHT + CONVEYOR.y, CONVEYOR.z);
  player._lastFloorY = CONVEYOR.y;
  player.grounded = false;
  player.velocity.set(0, 3.4, 0);
  player.yaw = -Math.PI / 2;
  player.keys.clear();
  const xStart = player.position.x;
  const frames = 50;
  for (let i = 0; i < frames; i++) player.update(1 / 60, data.colliders, data.floors, []);
  const dx = player.position.x - xStart;
  const expected = CONVEYOR.speed * (frames / 60);
  assert(
    dx > expected * 0.55,
    `jump-then-stand on belt rides +X without sprint (Δ=${dx.toFixed(2)} expected~${expected.toFixed(2)})`
  );
}

const gumdropFloor = (data.floors || []).some(
  (f) => f.minX <= -28 && f.maxX >= -28 && f.minZ <= -4 && f.maxZ >= -4 && f.y > 0.3
);
assert(gumdropFloor, 'gumdrop bridge at (-28,-4) has a walk floor');

const pretzelFloor = (data.floors || []).some(
  (f) => f.y >= 4.2 && f.minX <= -6 && f.maxX >= -6 && f.minZ <= 0 && f.maxZ >= 0
);
assert(pretzelFloor, 'pretzel NS deck has a floor pad at y≈4.6');

{
  const meshBox = (o) => {
    o.updateWorldMatrix(true, false);
    return new THREE.Box3().setFromObject(o);
  };
  const xzHits = (a, b) =>
    !(a.max.x <= b.min.x || a.min.x >= b.max.x || a.max.z <= b.min.z || a.min.z >= b.max.z);
  const yOverlap = (a, b) => a.max.y > b.min.y + 1e-3 && b.max.y > a.min.y + 1e-3;
  const areaXZ = (a, b) => {
    const w = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
    const d = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
    return Math.max(0, w) * Math.max(0, d);
  };
  const named = [];
  data.group.traverse((o) => {
    if (!o.isMesh || !o.name) return;
    if (
      o.name.startsWith('canal_') ||
      o.name === 'candy_hangar_underlay' ||
      o.name.startsWith('candy_hangar_underlay_')
    ) {
      named.push({ name: o.name, box: meshBox(o) });
    }
  });
  const canals = named.filter((m) => m.name.startsWith('canal_'));
  const underlays = named.filter((m) => m.name.startsWith('candy_hangar_underlay'));
  assert(canals.length >= 3, `canal water meshes (got ${canals.length})`);
  let canalOnCanal = 0;
  for (let i = 0; i < canals.length; i++) {
    for (let j = i + 1; j < canals.length; j++) {
      const a = canals[i].box;
      const b = canals[j].box;
      if (xzHits(a, b) && yOverlap(a, b) && areaXZ(a, b) > 4) canalOnCanal += 1;
    }
  }
  assert(canalOnCanal === 0, `canal slabs must not overlap (pairs=${canalOnCanal})`);
  let underOnCanal = 0;
  for (const u of underlays) {
    for (const c of canals) {
      if (xzHits(u.box, c.box) && yOverlap(u.box, c.box) && areaXZ(u.box, c.box) > 4) {
        underOnCanal += 1;
      }
    }
  }
  assert(underOnCanal === 0, `underlay must not intersect canal water (pairs=${underOnCanal})`);
}

const groundSpawns = (data.spawnPoints || []).filter((p) => p.y <= PLAYER_HEIGHT + 0.06);
const west = groundSpawns.filter((p) => p.x <= 0).length;
const east = groundSpawns.filter((p) => p.x > 0).length;
assert(west >= 8, `ground spawns on −X >= 8 (got ${west})`);
assert(east >= 8, `ground spawns on +X >= 8 (got ${east})`);

{
  const { Game } = await import('../src/game/Game.js');
  const game = Object.create(Game.prototype);
  game.mapData = data;
  game.player = { radius: PLAYER_RADIUS };
  game.bots = { bots: [] };
  for (let i = 0; i < 12; i++) {
    const spawn = game._playerSpawn();
    assert(spawn.y === PLAYER_HEIGHT, `candy player spawn ground y (got ${spawn.y})`);
    assert(
      !playerPositionBlocked(spawn, data.colliders, eye),
      `candy _playerSpawn clear (${spawn.x.toFixed(1)}, ${spawn.z.toFixed(1)})`
    );
  }
}

/** Rapier-driven walks: doors, interior L2, gumdrop, canal slow, pretzel. */
const rapierWalk = { sweetL2: 0, sugarL2: 0, pretzel: 0, gumY: 0, canalMul: 1, drySpeed: 0, canalSpeed: 0 };
{
  const { Player } = await import('../src/game/Player.js');
  const { PhysicsManager } = await import('../src/physics/PhysicsManager.js');
  await PhysicsManager.initRapier();
  const physics = new PhysicsManager();
  physics.setMapFromMapData(data);
  mgr.onSolidChange = (collider, solid) => physics.setColliderSolid(collider, solid);

  const cam = new THREE.PerspectiveCamera();
  const player = new Player(cam, data);
  player.mapBounds = data.bounds;
  player.setPhysics(physics);
  assert(!!player._rapier, 'candy player got Rapier controller');

  const settle = (n = 20) => {
    for (let i = 0; i < n; i++) {
      player.update(1 / 60, data.colliders, data.floors, []);
      physics.step(1 / 60);
    }
  };
  const warp = (x, y, z, yaw = 0) => {
    physics.teleport(player._rapier, x, y, z);
    player.position.set(x, y, z);
    player.velocity.set(0, 0, 0);
    player.grounded = true;
    player._lastFloorY = y - PLAYER_HEIGHT;
    player.yaw = yaw;
    player.pitch = 0;
    player.keys.clear();
    settle(8);
  };
  const drive = (yaw, frames, extraKey = null) => {
    player.yaw = yaw;
    player.keys.clear();
    player.keys.add('KeyW');
    if (extraKey) player.keys.add(extraKey);
    let maxY = player.position.y - PLAYER_HEIGHT;
    for (let i = 0; i < frames; i++) {
      player.update(1 / 60, data.colliders, data.floors, []);
      physics.step(1 / 60);
      maxY = Math.max(maxY, player.position.y - PLAYER_HEIGHT);
    }
    player.keys.clear();
    return { x: player.position.x, y: player.position.y, z: player.position.z, feet: player.position.y - PLAYER_HEIGHT, maxY };
  };

  // Sweet Co: stand on dock, open door, walk −Z into reception, then L2 stairs.
  warp(-50, PLAYER_HEIGHT, -37.15, 0);
  const sweetNear = mgr.getNearby(player.position);
  assert(sweetNear?.name === 'door_front_sweet_co', `Sweet Co door nearby (got ${sweetNear?.name})`);
  mgr.setOpen('door_front_sweet_co', true);
  const inSweet = drive(0, 150);
  assert(inSweet.z < -39.5, `walk into Sweet Co (z=${inSweet.z.toFixed(2)})`);
  assert(inSweet.x > -62 && inSweet.x < -38, `stay in Sweet Co X (x=${inSweet.x.toFixed(2)})`);

  warp(-58.75, PLAYER_HEIGHT + 0.25, -55.85, Math.PI);
  const sweetL2 = drive(Math.PI, 260);
  rapierWalk.sweetL2 = sweetL2.maxY;
  assert(sweetL2.maxY >= 3.1, `Sweet Co L2 stairs (maxFeet=${sweetL2.maxY.toFixed(2)})`);

  // Sugar Works: dock +Z, stairs toward −Z.
  warp(50, PLAYER_HEIGHT, 37.15, Math.PI);
  const sugarNear = mgr.getNearby(player.position);
  assert(sugarNear?.name === 'door_front_sugar_works', `Sugar Works door nearby (got ${sugarNear?.name})`);
  mgr.setOpen('door_front_sugar_works', true);
  const inSugar = drive(Math.PI, 150);
  assert(inSugar.z > 39.5, `walk into Sugar Works (z=${inSugar.z.toFixed(2)})`);

  warp(58.55, PLAYER_HEIGHT + 0.25, 55.85, 0);
  const sugarL2 = drive(0, 260);
  rapierWalk.sugarL2 = sugarL2.maxY;
  assert(sugarL2.maxY >= 3.1, `Sugar Works L2 stairs (maxFeet=${sugarL2.maxY.toFixed(2)})`);

  // Gumdrop (−28, −4): walk across, stay on raised floor.
  warp(-32.2, PLAYER_HEIGHT + 0.55, -4, -Math.PI / 2);
  const gum = drive(-Math.PI / 2, 140);
  rapierWalk.gumY = gum.feet;
  assert(gum.x > -26, `cross gumdrop toward +X (x=${gum.x.toFixed(2)})`);
  assert(gum.y > 1.4, `gumdrop does not drop into void (y=${gum.y.toFixed(2)})`);

  // Canal slow vs dry ground. Scale wish then cap — do not compound.
  const measureSpeed = (frames) => {
    const x0 = player.position.x;
    const z0 = player.position.z;
    const end = drive(player.yaw, frames);
    const dist = Math.hypot(end.x - x0, end.z - z0);
    return dist / (frames / 60);
  };
  warp(0, PLAYER_HEIGHT, 52, Math.PI);
  rapierWalk.drySpeed = measureSpeed(90);
  warp(-20, PLAYER_HEIGHT, 0, -Math.PI / 2);
  rapierWalk.canalSpeed = measureSpeed(90);
  rapierWalk.canalMul = rapierWalk.drySpeed > 0.5 ? rapierWalk.canalSpeed / rapierWalk.drySpeed : 1;
  assert(rapierWalk.drySpeed > 5, `dry walk speed (got ${rapierWalk.drySpeed.toFixed(2)})`);
  assert(
    rapierWalk.canalSpeed > 1.5 && rapierWalk.canalSpeed < rapierWalk.drySpeed * 0.7,
    `canal slows (dry=${rapierWalk.drySpeed.toFixed(2)} canal=${rapierWalk.canalSpeed.toFixed(2)})`
  );
  assert(player.position.y - PLAYER_HEIGHT > -0.25, 'canal is not a kill pit');

  // Pretzel island south stairs: east lip, climb west onto NS deck y≈4.6
  warp(2.45, PLAYER_HEIGHT + 0.2, -10, Math.PI / 2);
  const pretzel = drive(Math.PI / 2, 320);
  rapierWalk.pretzel = pretzel.maxY;
  assert(pretzel.maxY >= 4.2, `pretzel island stairs (maxFeet=${pretzel.maxY.toFixed(2)})`);

  physics.dispose();
}

const report = {
  ok: failures.length === 0,
  failures,
  colliders: data.colliders.length,
  floors: data.floors.length,
  spawns: data.spawnPoints.length,
  groundSpawns: groundSpawns.length,
  doors: data.doors.length,
  slowZones: data.slowZones.length,
  rapierWalk,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: candy-foundry layout + registry + build + rapier walks');
