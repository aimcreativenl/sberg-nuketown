/**
 * Interactive doors: wood leaf meshes, start closed/solid, open → passable, swing yaws set.
 */
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { buildMap } from '../src/game/MapBuilder.js';
import { DoorManager } from '../src/game/Doors.js';
import { botPositionBlocked } from '../src/game/collision.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

const scene = new THREE.Scene();
const data = buildMap(scene);
const doors = data.doors || [];
assert(doors.length >= 4, `doors >= 4 got ${doors.length}`);

const names = doors.map((d) => d.name);
for (const n of [
  'door_front_west',
  'door_front_east',
  'door_side_west',
  'door_side_east',
]) {
  assert(names.includes(n), `door ${n}`);
}

// Wood panel meshes exist (not empty grey trim slabs)
let panels = 0;
data.group.traverse((o) => {
  if (o.name && o.name.endsWith('_panel')) panels++;
});
assert(panels >= 4, `door panels >= 4 got ${panels}`);

const mgr = new DoorManager(doors);
for (const d of doors) {
  assert(d.open === false, `${d.name} starts closed`);
  assert(d.collider?.solid !== false, `${d.name} collider solid`);
  assert(Math.abs(d.openYaw) > 0.5, `${d.name} has swing yaw`);
  const p = d.interact;
  assert((p.y ?? 0) > 0.5, `${d.name} interact Y is door mid-height`);
  assert(botPositionBlocked({ x: p.x, y: 0, z: p.z }, data.colliders), `${d.name} blocks when closed`);
  // Same storey can reach; upstairs eye cannot
  assert(mgr.getNearby({ x: p.x, y: p.y, z: p.z }), `${d.name} nearby at door Y`);
  assert(
    !mgr.getNearby({ x: p.x, y: 4.9, z: p.z }),
    `${d.name} NOT reachable from L2 eye`
  );
  mgr.toggle(d);
  assert(d.open === true, `${d.name} toggled open`);
  assert(d.collider.solid === false, `${d.name} solid false when open`);
  // Advance anim so yaw moves
  for (let i = 0; i < 20; i++) mgr.update(0.05);
  assert(d.anim > 0.9, `${d.name} anim open`);
  assert(
    !botPositionBlocked({ x: p.x, y: 0, z: p.z }, data.colliders),
    `${d.name} free when open`
  );
  mgr.toggle(d); // close again
}

// MP helpers: absolute setOpen + net state round-trip
{
  const d0 = doors[0];
  mgr.setOpen(d0.name, true);
  assert(d0.open === true, 'setOpen by id opens');
  mgr.setOpen(d0.name, true);
  assert(d0.open === true, 'setOpen idempotent');
  const net = mgr.toNetState();
  assert(Array.isArray(net) && net.length === doors.length, 'toNetState length');
  assert(net.some((e) => e.id === d0.name && e.open === true), 'toNetState includes open door');
  mgr.setOpen(d0.name, false);
  assert(d0.open === false, 'setOpen closes');
  mgr.applyNetState([{ id: d0.name, open: true }]);
  assert(d0.open === true, 'applyNetState opens');
  mgr.setOpen(d0.name, false);
}

const report = { ok: failures.length === 0, doorCount: doors.length, names, panels, failures };
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: interactive doors closed→open');

try {
  const SCRATCH =
    process.env.GROK_SCRATCH ||
    'C:\\Users\\GEBRUI~1\\AppData\\Local\\Temp\\grok-goal-c9b61c05f4f7\\implementer';
  fs.mkdirSync(SCRATCH, { recursive: true });
  fs.writeFileSync(path.join(SCRATCH, 'doors.log'), JSON.stringify(report, null, 2));
} catch {
  /* ignore */
}
