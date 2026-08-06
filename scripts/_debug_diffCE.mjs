import * as THREE from 'three';
import { buildMap } from '../src/game/MapBuilder.js';
import { PhysicsManager } from '../src/physics/PhysicsManager.js';

await PhysicsManager.initRapier();
const scene = new THREE.Scene();
const data = buildMap(scene);

const westClimb = data.colliders.filter((c) => c.kind === 'climb_pad' && c.house === 'west');
const roofClimbW = data.colliders.filter((c) => c.kind === 'roof_climb' && c.house === 'west');

function dump(colliders, floors) {
  const phys = new PhysicsManager();
  phys.setMapFromMapData({ colliders, floors });
  const out = [];
  for (const entry of phys.staticEntries) {
    const t = entry.rigidBody.translation();
    const he = entry.collider.shape.halfExtents;
    if (!he) continue;
    const minX = t.x - he.x, maxX = t.x + he.x;
    if (maxX < -29 || minX > -26) continue; // near climb column only
    out.push({
      kind: entry.meta?.kind,
      cid: entry.colliderId,
      minX: minX.toFixed(2), maxX: maxX.toFixed(2),
      minY: (t.y - he.y).toFixed(2), maxY: (t.y + he.y).toFixed(2),
      minZ: (t.z - he.z).toFixed(2), maxZ: (t.z + he.z).toFixed(2),
    });
  }
  phys.dispose();
  return out;
}

const c = dump(westClimb, data.floors);
const e = dump([...westClimb, ...roofClimbW], data.floors);

console.log('=== C (climb only) ===');
for (const o of c) console.log(JSON.stringify(o));
console.log('=== E (climb + roof) ===');
for (const o of e) console.log(JSON.stringify(o));
