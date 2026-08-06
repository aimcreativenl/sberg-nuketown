/**
 * After boarding the west garage climb, walking onto the garage roof deck
 * must NOT fall through into the garage (legacy clip bug deleted the deck).
 */
import * as THREE from 'three';
import { buildMap } from '../src/game/MapBuilder.js';
import { PhysicsManager } from '../src/physics/PhysicsManager.js';
import { PLAYER_HEIGHT } from '../src/game/constants.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

await PhysicsManager.initRapier();
const scene = new THREE.Scene();
const data = buildMap(scene);
const phys = new PhysicsManager();
phys.setMapFromMapData(data);

const roofY = 2.93;

// Mid garage deck, clear of the roof→main-roof climb column (x≈-24.2).
const handle = phys.createPlayerController({
  position: { x: -23.2, y: PLAYER_HEIGHT + roofY + 0.2, z: 1.2 },
});
let settled = null;
for (let i = 0; i < 90; i++) {
  settled = phys.moveCharacter(handle, {
    wishVelX: 0,
    wishVelZ: 0,
    jumpPressed: false,
    dt: 1 / 60,
  });
  phys.step(1 / 60);
}
const settleFeet = settled.y - PLAYER_HEIGHT;
assert(settled.grounded, 'grounded on garage roof deck');
assert(settleFeet >= roofY - 0.2, `settle feet near roof (${settleFeet.toFixed(2)} vs ${roofY})`);
assert(settleFeet <= roofY + 0.25, `not floating above roof (${settleFeet.toFixed(2)})`);

// Pace the deck (stay away from the outer climb strip); must not fall into garage.
let minFeetOnDeck = settleFeet;
let fellIntoGarage = false;
for (let i = 0; i < 180; i++) {
  let wishX = 1.2;
  let wishZ = 0.8;
  if (i > 60) {
    wishX = -1.2;
    wishZ = 0.5;
  }
  if (i > 120) {
    wishX = 0.8;
    wishZ = -1.0;
  }
  const r = phys.moveCharacter(handle, {
    wishVelX: wishX,
    wishVelZ: wishZ,
    jumpPressed: false,
    dt: 1 / 60,
  });
  phys.step(1 / 60);
  const feet = r.y - PLAYER_HEIGHT;
  const onDeck = r.x > -26.2 && r.x < -22.8 && r.z > -1.8 && r.z < 2.6;
  if (onDeck) {
    minFeetOnDeck = Math.min(minFeetOnDeck, feet);
    if (feet < 2.2) fellIntoGarage = true;
  }
}
assert(!fellIntoGarage, `no fall-through into garage (minOnDeck=${minFeetOnDeck.toFixed(2)})`);
assert(minFeetOnDeck >= 2.5, `feet on deck stay elevated got ${minFeetOnDeck.toFixed(2)}`);

const report = { ok: failures.length === 0, settleFeet, minFeetOnDeck, fellIntoGarage, failures };
console.log(JSON.stringify(report, null, 2));
phys.dispose();
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: Rapier garage roof deck solid (no fall-through)');
