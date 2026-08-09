import * as THREE from 'three';
import { buildMap } from '../src/game/MapBuilder.js';
import { playerPositionBlocked } from '../src/game/collision.js';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from '../src/game/constants.js';

const scene = new THREE.Scene();
const data = buildMap(scene);
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
