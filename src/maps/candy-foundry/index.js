/**
 * Syrup Canal Foundry — IMap pack. Shell / buildings / yard fill `ctx`.
 */
import * as THREE from 'three';
import { playerPositionBlocked } from '../../game/collision.js';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from '../../game/constants.js';
import {
  BR_ZONE,
  CANDY_BOUNDS,
  CANDY_FOG,
  CANDY_MAP_ID,
  CANDY_MAP_NAME,
  CANDY_MAP_WALL,
  FLAG_HOMES,
  MEDKIT_SPOTS,
} from './layout.js';
import { makeCtx } from './helpers.js';
import { buildShell } from './shell.js';
import { buildBuildings } from './buildings.js';
import { buildYard } from './yard.js';
import { buildTastingKiosk } from './kiosk.js';
import { buildConveyor } from './conveyor.js';
import { buildCupcakeKiosk } from './cupcakeKiosk.js';
import { buildGummyBears } from './gummyBears.js';
import { buildSoftServe } from './softServe.js';
import { buildGiftGantry } from './giftGantry.js';
import { buildCandySilos } from './candySilos.js';
import { buildLicoricePipe } from './licoricePipe.js';
import { buildCandyLandmarks } from './candyLandmarks.js';
import { disposeSyrupFlows, tickSyrupFlows } from './syrupFlow.js';

export function buildCandyFoundry(scene) {
  const ctx = makeCtx(scene);
  buildShell(ctx);
  buildBuildings(ctx);
  buildTastingKiosk(ctx);
  buildConveyor(ctx);
  buildCupcakeKiosk(ctx);
  buildGummyBears(ctx);
  buildSoftServe(ctx);
  buildGiftGantry(ctx);
  buildCandySilos(ctx);
  buildLicoricePipe(ctx);
  buildCandyLandmarks(ctx);
  buildYard(ctx);

  const safeSpawnPoints = (ctx.spawnPoints || []).filter((spawn) => {
    const y = spawn.y > PLAYER_HEIGHT + 0.5 ? spawn.y : PLAYER_HEIGHT;
    return !playerPositionBlocked(
      { x: spawn.x, y, z: spawn.z },
      ctx.colliders,
      { height: PLAYER_HEIGHT, radius: PLAYER_RADIUS }
    );
  });

  scene.add(ctx.group);
  const flows = ctx.syrupFlows;
  const conveyors = ctx.conveyors;
  const lights = ctx.pointLights || [];
  const lightWorld = new THREE.Vector3();
  return {
    id: CANDY_MAP_ID,
    group: ctx.group,
    colliders: ctx.colliders,
    floors: ctx.floors,
    doors: ctx.doors,
    roofMantleZones: ctx.roofMantleZones,
    spawnPoints: safeSpawnPoints,
    coverPoints: ctx.coverPoints,
    waypoints: ctx.waypoints,
    flagHomes: FLAG_HOMES,
    medkitSpots: MEDKIT_SPOTS.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    slowZones: ctx.slowZones,
    belts: ctx.belts,
    bounds: CANDY_BOUNDS,
    wall: CANDY_MAP_WALL,
    fog: CANDY_FOG,
    brZone: BR_ZONE,
    snow: false,
    tick(dt) {
      tickSyrupFlows(flows, dt);
      for (let i = 0; i < conveyors.length; i++) conveyors[i].tick?.(dt);
    },
    syncLights(focus, opts = {}) {
      if (!focus || !lights.length) return;
      const fx = focus.x;
      const fz = focus.z;
      const max =
        Number.isFinite(opts.maxPointLights) && opts.maxPointLights >= 0
          ? opts.maxPointLights
          : lights.length;
      const scale = opts.lightDistanceScale ?? 1;
      const ranked = [];
      for (let i = 0; i < lights.length; i++) {
        const L = lights[i];
        L.getWorldPosition(lightWorld);
        const dx = lightWorld.x - fx;
        const dz = lightWorld.z - fz;
        const d2 = dx * dx + dz * dz;
        const pad = L.userData.cullPad ?? 12;
        const reach = ((L.distance || 20) + pad) * scale;
        ranked.push({ L, d2, reach2: reach * reach });
      }
      ranked.sort((a, b) => a.d2 - b.d2);
      for (let i = 0; i < ranked.length; i++) {
        const s = ranked[i];
        s.L.visible = i < max && s.d2 < s.reach2;
      }
    },
    dispose() {
      disposeSyrupFlows(flows);
      for (let i = 0; i < conveyors.length; i++) conveyors[i].dispose?.();
    },
  };
}

/** @type {import('../IMap.js').IMap} */
export const MAP_CANDY_FOUNDRY = {
  id: CANDY_MAP_ID,
  name: CANDY_MAP_NAME,
  build(scene) {
    return buildCandyFoundry(scene);
  },
};
