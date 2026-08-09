import * as THREE from 'three';
import { buildMap } from '../src/game/MapBuilder.js';
import { Game } from '../src/game/Game.js';
import {
  makeAabbCollider,
  playerMoveBlocked,
  playerPositionBlocked,
} from '../src/game/collision.js';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from '../src/game/constants.js';

const scene = new THREE.Scene();
const data = buildMap(scene);
const SPAWN_ESCAPE_DISTANCE = 2.2;
const SPAWN_DIRECTION_COUNT = 16;
const SPAWN_MIN_OPEN_DIRECTIONS = 6;
const SPAWN_MIN_BOT_GAP = 4;

function openDirections(spawn) {
  let open = 0;
  for (let i = 0; i < SPAWN_DIRECTION_COUNT; i++) {
    const angle = (i / SPAWN_DIRECTION_COUNT) * Math.PI * 2;
    const to = {
      x: spawn.x + Math.cos(angle) * SPAWN_ESCAPE_DISTANCE,
      y: spawn.y,
      z: spawn.z + Math.sin(angle) * SPAWN_ESCAPE_DISTANCE,
    };
    if (
      !playerMoveBlocked(spawn, to, data.colliders, {
        radius: PLAYER_RADIUS,
        height: PLAYER_HEIGHT,
      })
    ) {
      open++;
    }
  }
  return open;
}

const game = Object.create(Game.prototype);
game.mapData = data;
game.player = { radius: PLAYER_RADIUS };
game.bots = { bots: [] };

// The selector must never choose a ground point that is technically clear but
// surrounded by props/fences. Repeat to cover its randomized tie-breaker.
for (let i = 0; i < 40; i++) {
  const spawn = game._playerSpawn();
  if (spawn.y !== PLAYER_HEIGHT) {
    throw new Error(`player spawn must be ground-level: y=${spawn.y}`);
  }
  if (playerPositionBlocked(spawn, data.colliders, { height: PLAYER_HEIGHT, radius: PLAYER_RADIUS })) {
    throw new Error(`selected player spawn overlaps solid geometry: (${spawn.x},${spawn.z})`);
  }
  const exits = openDirections(spawn);
  if (exits < SPAWN_MIN_OPEN_DIRECTIONS) {
    throw new Error(`selected player spawn has too few clear exits: ${exits}/16 at (${spawn.x},${spawn.z})`);
  }
}

// Regression: even when bots occupy the most open candidate points, the
// player selector must choose another point with a real horizontal buffer.
const openPoints = data.spawnPoints
  .filter((p) => p.y <= PLAYER_HEIGHT + 0.06)
  .filter((p) => openDirections({ x: p.x, y: PLAYER_HEIGHT, z: p.z }) >= SPAWN_MIN_OPEN_DIRECTIONS);
game.bots.bots = openPoints.slice(0, 3).map((p) => ({
  dead: false,
  position: new THREE.Vector3(p.x, 0, p.z),
}));
for (let i = 0; i < 20; i++) {
  const spawn = game._playerSpawn();
  const nearestBot = Math.min(...game.bots.bots.map((bot) =>
    Math.hypot(spawn.x - bot.position.x, spawn.z - bot.position.z)
  ));
  if (nearestBot < SPAWN_MIN_BOT_GAP) {
    throw new Error(`selected player spawn too close to bot: ${nearestBot.toFixed(2)}m`);
  }
}

// The emergency branch must fail loudly instead of returning a trapped point
// if a future map accidentally blocks every possible ground location.
const impossibleGame = Object.create(Game.prototype);
impossibleGame.mapData = {
  spawnPoints: [new THREE.Vector3(0, PLAYER_HEIGHT, 0)],
  colliders: [makeAabbCollider(0, 2, 0, 80, 4, 80)],
};
impossibleGame.player = { radius: PLAYER_RADIUS };
impossibleGame.bots = { bots: [] };
let impossibleSpawnThrew = false;
try {
  impossibleGame._playerSpawn();
} catch (err) {
  impossibleSpawnThrew = /No safe player spawn exists/.test(String(err?.message || err));
}
if (!impossibleSpawnThrew) {
  throw new Error('fully blocked map must reject player spawn explicitly');
}

const knownBadSpawns = [
  [-15, -10],
  [-15, 0],
  [-24.55, -3.45],
  [15, 10],
  [19, 0],
  [0, 16],
  [26, -12],
];
const blocked = data.spawnPoints.filter((spawn) => playerPositionBlocked(
  { x: spawn.x, y: PLAYER_HEIGHT, z: spawn.z },
  data.colliders,
  { height: PLAYER_HEIGHT, radius: PLAYER_RADIUS },
));

if (blocked.length > 0) {
  const points = blocked.map((p) => `(${p.x.toFixed(2)},${p.z.toFixed(2)})`).join(', ');
  throw new Error(`player spawn points overlap solid map geometry: ${points}`);
}

for (const [x, z] of knownBadSpawns) {
  if (!playerPositionBlocked(
    { x, y: PLAYER_HEIGHT, z },
    data.colliders,
    { height: PLAYER_HEIGHT, radius: PLAYER_RADIUS },
  )) {
    throw new Error(`regression fixture no longer overlaps solid geometry: (${x},${z})`);
  }
  if (data.spawnPoints.some((spawn) => Math.hypot(spawn.x - x, spawn.z - z) < 0.01)) {
    throw new Error(`known blocked spawn was published: (${x},${z})`);
  }
}

if (data.spawnPoints.length < 16) {
  throw new Error(`too few safe player spawn points: ${data.spawnPoints.length}`);
}

console.log(JSON.stringify({
  ok: true,
  spawnPoints: data.spawnPoints.length,
  blocked: blocked.length,
  rejectedKnownBad: knownBadSpawns.length,
}));
