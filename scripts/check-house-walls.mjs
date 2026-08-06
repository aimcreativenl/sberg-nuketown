/**
 * House wall solids: mid-thickness samples blocked for bot + player paths;
 * door openings and open yard free. Drives shipped buildMap + collision helpers.
 */
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { buildMap, HOUSE_X } from '../src/game/MapBuilder.js';
import {
  botPositionBlocked,
  playerPositionBlocked,
  BOT_COLLIDE_RADIUS,
} from '../src/game/collision.js';
import { PLAYER_RADIUS, PLAYER_HEIGHT } from '../src/game/constants.js';

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

const houseWalls = colliders.filter((c) => c.kind === 'house_wall');
assert(houseWalls.length >= 16, `tagged house_wall colliders >= 16 got ${houseWalls.length}`);

const parts = new Set(houseWalls.map((c) => c.part));
for (const need of [
  'front_l1_a',
  'front_l1_b',
  'back',
  'outer_side',
  'inner_side_a',
  'inner_side_b',
  'interior_partition',
]) {
  assert(parts.has(need), `house wall part ${need} present`);
}

/** Sample mid-thickness of a house_wall collider AABB. */
function midSamples(c) {
  const b = c.box;
  const mx = (b.min.x + b.max.x) / 2;
  const mz = (b.min.z + b.max.z) / 2;
  // Slightly inset from edges along the long axis so door-adjacent ends don't bleed
  const sx = (b.max.x - b.min.x) * 0.15;
  const sz = (b.max.z - b.min.z) * 0.15;
  return [
    { x: mx, z: mz, label: `${c.house}/${c.part}@mid` },
    { x: mx + sx * 0.5, z: mz + sz * 0.5, label: `${c.house}/${c.part}@inset` },
  ];
}

let wallBlockedBot = 0;
let wallBlockedPlayer = 0;
let wallSamples = 0;

for (const c of houseWalls) {
  // Elevated L2 bands / door lintels — not walk-block samples at feet (y=0 body)
  if (
    c.part === 'side_door_lintel' ||
    c.part === 'front_l1_lintel' ||
    String(c.part).startsWith('front_l2')
  ) {
    continue;
  }
  for (const s of midSamples(c)) {
    wallSamples++;
    const botPos = { x: s.x, y: 0, z: s.z };
    const eyePos = { x: s.x, y: PLAYER_HEIGHT, z: s.z };
    const botHit = botPositionBlocked(botPos, colliders, BOT_COLLIDE_RADIUS);
    const playerHit = playerPositionBlocked(eyePos, colliders, {
      radius: PLAYER_RADIUS,
      height: PLAYER_HEIGHT,
    });
    if (botHit) wallBlockedBot++;
    else failures.push(`bot NOT blocked at wall ${s.label} (${s.x.toFixed(2)},${s.z.toFixed(2)})`);
    if (playerHit) wallBlockedPlayer++;
    else failures.push(`player NOT blocked at wall ${s.label} (${s.x.toFixed(2)},${s.z.toFixed(2)})`);
  }
}

assert(wallSamples >= 20, `enough wall samples ${wallSamples}`);
assert(wallBlockedBot === wallSamples, `all wall samples block bot ${wallBlockedBot}/${wallSamples}`);
assert(
  wallBlockedPlayer === wallSamples,
  `all wall samples block player ${wallBlockedPlayer}/${wallSamples}`
);

// Closed interactive doors BLOCK the doorway; porch / yard / interior stay free.
// Open doors via solid:false then doorway samples must be free.
const doorColliders = colliders.filter((c) => c.kind === 'house_door');
assert(doorColliders.length >= 4, `house doors >= 4 got ${doorColliders.length}`);
for (const d of doorColliders) {
  assert(d.solid !== false, `door starts solid ${d.part}`);
  const mx = (d.box.min.x + d.box.max.x) / 2;
  const mz = (d.box.min.z + d.box.max.z) / 2;
  assert(
    botPositionBlocked({ x: mx, y: 0, z: mz }, colliders),
    `closed door blocks bot ${d.part}`
  );
  // Open → passable
  d.solid = false;
  assert(
    !botPositionBlocked({ x: mx, y: 0, z: mz }, colliders),
    `open door free bot ${d.part}`
  );
  d.solid = true;
}

const freeSamples = [
  // Porch just outside closed door (not inside the door collider slab)
  { x: -HOUSE_X, z: -6.2, label: 'west_front_porch' },
  { x: HOUSE_X, z: 6.2, label: 'east_front_porch' },
  // Side exit approach (offset away from door volume)
  { x: -HOUSE_X + 5.5 + 2.0, z: -2.2, label: 'west_side_approach' },
  { x: HOUSE_X - 5.5 - 2.0, z: 2.2, label: 'east_side_approach' },
  // Open yard / road
  { x: 0, z: 8, label: 'open_road' },
  { x: 0, z: -8, label: 'open_road_south' },
  // Interior clear — house center (away from stairs −3.35, living +2.45, partition +1.2)
  { x: -HOUSE_X - 0.2, z: 0.2, label: 'west_interior_clear' },
];

let freeOk = 0;
for (const s of freeSamples) {
  const botHit = botPositionBlocked({ x: s.x, y: 0, z: s.z }, colliders);
  const playerHit = playerPositionBlocked(
    { x: s.x, y: PLAYER_HEIGHT, z: s.z },
    colliders,
    { radius: PLAYER_RADIUS, height: PLAYER_HEIGHT }
  );
  if (!botHit && !playerHit) freeOk++;
  else {
    if (botHit) failures.push(`bot unexpectedly blocked at free ${s.label} (${s.x},${s.z})`);
    if (playerHit) failures.push(`player unexpectedly blocked at free ${s.label} (${s.x},${s.z})`);
  }
}
assert(freeOk === freeSamples.length, `all free samples open ${freeOk}/${freeSamples.length}`);

// Shipped BotManager._blocked must use the shared helper path
import { BotManager } from '../src/game/BotAI.js';
import { Player } from '../src/game/Player.js';
import { PLAYER_HEIGHT as PH } from '../src/game/constants.js';

const mgr = new BotManager(scene, data, {
  getPlayerPosition: () => null,
  getPlayerAlive: () => false,
});
let mgrBlocked = 0;
let mgrSamples = 0;
for (const c of houseWalls) {
  if (
    c.part === 'side_door_lintel' ||
    c.part === 'front_l1_lintel' ||
    String(c.part).startsWith('front_l2')
  ) {
    continue;
  }
  const b = c.box;
  const pos = new THREE.Vector3((b.min.x + b.max.x) / 2, 0, (b.min.z + b.max.z) / 2);
  mgrSamples++;
  if (mgr._blocked(pos, null)) mgrBlocked++;
  else failures.push(`BotManager._blocked missed wall ${c.house}/${c.part}`);
}
assert(mgrBlocked === mgrSamples, `BotManager._blocked walls ${mgrBlocked}/${mgrSamples}`);

// --- Separation must NOT tunnel through house walls (skeptic repro) ---
// Destination free on the far side is NOT enough — must stay same side of outer wall.
import { botMoveBlocked, playerMoveBlocked, xzSegmentHitsSolid } from '../src/game/collision.js';

const outerWest = houseWalls.find((c) => c.house === 'west' && c.part === 'outer_side');
assert(outerWest, 'west outer_side wall for separation test');
const ow = outerWest.box;
const wallMinX = ow.min.x;
const wallMaxX = ow.max.x;
const wallMidZ = (ow.min.z + ow.max.z) / 2;
// Interior is east of outer wall (more positive x than wallMaxX)
assert(wallMaxX < -20, `west outer wall on west side of map (maxX=${wallMaxX})`);

/** True if X crossed from interior (east of wall) to exterior (west of wall). */
function crossedOuterWest(fromX, toX) {
  // Interior start: fromX > wallMaxX; exterior end: toX < wallMinX
  return fromX > wallMaxX && toX < wallMinX;
}

// Exact skeptic-style positions: bot inside near wall, player closer to center
// Interior free sample: east of outer wall, front room (avoid kitchen/stairs/furniture)
// Probe a few candidates near the outer wall
let botStartX = null;
let botStartZ = null;
for (const z of [-3.6, -2.8, 1.0, 2.0, 3.5]) {
  for (const dx of [1.0, 1.3, 1.6, 2.0]) {
    const x = wallMaxX + dx;
    if (!botPositionBlocked({ x, y: 0, z }, colliders)) {
      botStartX = x;
      botStartZ = z;
      break;
    }
  }
  if (botStartX != null) break;
}
assert(botStartX != null, 'found free interior sample near outer wall');
const playerSepX = botStartX + 1.15;
assert(botStartX > wallMaxX, `bot start interior (bot ${botStartX} > wallMax ${wallMaxX})`);
assert(
  !botPositionBlocked({ x: botStartX, y: 0, z: botStartZ }, colliders),
  `bot start free at ${botStartX.toFixed(2)},${botStartZ.toFixed(2)}`
);
// Destination-only check would allow exterior free point — path must block
assert(
  botMoveBlocked(
    { x: botStartX, y: 0, z: botStartZ },
    { x: -23.7, y: 0, z: botStartZ },
    colliders
  ),
  'botMoveBlocked catches tunnel to exterior -23.7'
);
assert(
  xzSegmentHitsSolid(
    { x: botStartX, z: botStartZ },
    { x: -23.7, z: botStartZ },
    colliders,
    0.8
  ),
  'xz segment hits outer_side wall'
);

const playerNear = new THREE.Vector3(playerSepX, PH, botStartZ);
const sepMgr = new BotManager(scene, data, {
  getPlayerPosition: () => playerNear,
  getPlayerAlive: () => true,
  getPlayerKills: () => 0,
  getPlayerHealth: () => 100,
  getDonuts: () => [],
});
sepMgr.spawnAll(1);
const sepBot = sepMgr.bots[0];
sepBot.dead = false;
sepBot.position.set(botStartX, 0, botStartZ);
sepBot.state = 'attack';
const botFromX = sepBot.position.x;
sepMgr.update(1 / 60);
const afterBot = sepBot.position;
assert(
  !botPositionBlocked({ x: afterBot.x, y: 0, z: afterBot.z }, colliders),
  `bot not embedded after sep (${afterBot.x.toFixed(2)},${afterBot.z.toFixed(2)})`
);
assert(
  !crossedOuterWest(botFromX, afterBot.x),
  `bot must not cross outer wall interior→exterior (from ${botFromX.toFixed(2)} to ${afterBot.x.toFixed(2)}; wall ${wallMinX.toFixed(2)}..${wallMaxX.toFixed(2)})`
);
assert(
  afterBot.x > wallMaxX - 0.05,
  `bot stays interior side of wall (x=${afterBot.x.toFixed(2)} wallMax=${wallMaxX.toFixed(2)})`
);

// Player agent separation: start clear of wall, agent pushes toward wall
const cam = new THREE.PerspectiveCamera();
const pl = new Player(cam, data);
const plStartX = wallMaxX + 1.1;
pl.position.set(plStartX, PH, botStartZ);
pl.grounded = true;
pl.velocity.set(0, 0, 0);
assert(plStartX > wallMaxX, 'player start interior');
assert(
  playerMoveBlocked(
    { x: plStartX, y: PH, z: botStartZ },
    { x: wallMinX - 0.5, y: PH, z: botStartZ },
    colliders,
    { radius: PLAYER_RADIUS, height: PLAYER_HEIGHT }
  ),
  'playerMoveBlocked catches tunnel past outer wall'
);
const agent = { x: plStartX + 1.4, z: botStartZ };
pl.update(1 / 60, colliders, data.floors, [agent]);
assert(
  !playerPositionBlocked(pl.position, colliders, {
    radius: PLAYER_RADIUS,
    height: PLAYER_HEIGHT,
  }),
  `player not embedded after agent sep (x=${pl.position.x.toFixed(2)})`
);
assert(
  !crossedOuterWest(plStartX, pl.position.x),
  `player must not cross outer wall (from ${plStartX} to ${pl.position.x.toFixed(2)})`
);
assert(
  pl.position.x > wallMaxX - 0.05,
  `player stays interior side (x=${pl.position.x.toFixed(2)} wallMax=${wallMaxX.toFixed(2)})`
);

const report = {
  ok: failures.length === 0,
  houseWallColliders: houseWalls.length,
  wallSamples,
  wallBlockedBot,
  wallBlockedPlayer,
  freeOk,
  freeTotal: freeSamples.length,
  botManagerWallHits: `${mgrBlocked}/${mgrSamples}`,
  botRadius: BOT_COLLIDE_RADIUS,
  outerWallX: { min: wallMinX, max: wallMaxX },
  sepBot: { from: botFromX, to: afterBot.x, z: afterBot.z },
  sepPlayer: { from: plStartX, to: pl.position.x, z: pl.position.z },
  failures,
};

const logDir = SCRATCH;
try {
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.join(logDir, 'house-walls.log'), JSON.stringify(report, null, 2), 'utf8');
} catch (err) {
  console.warn('Could not write SCRATCH log:', err.message);
}

console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: house walls block bot/player; doors free');
