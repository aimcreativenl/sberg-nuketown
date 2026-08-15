/**
 * Settings store + look scaling: hip vs ADS, invert Y, persistence fields.
 */
import * as THREE from 'three';
import { Player } from '../src/game/Player.js';
import { MOUSE_SENS, SCOPE_SENS_MULT } from '../src/game/constants.js';
import {
  getSettings,
  patchSettings,
  setGraphicsPreset,
  lookScale,
  GRAPHICS_PRESETS,
  applyToGame,
} from '../src/settings/Settings.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

const s0 = getSettings();
assert(s0.mouseSens === 1, `default mouseSens is 1 (got ${s0.mouseSens})`);
assert(s0.adsSens === 1, `default adsSens is 1 (got ${s0.adsSens})`);
assert(s0.invertY === false, 'default invertY is off');
assert(s0.volume === 0.35, `default volume is 0.35 (got ${s0.volume})`);
assert(s0.muted === false, 'default muted is off');
assert(GRAPHICS_PRESETS[s0.graphicsPreset], 'default graphics preset is known');

patchSettings({ mouseSens: 2, adsSens: 0.5, invertY: true, volume: 0.8, muted: true });
const s1 = getSettings();
assert(s1.mouseSens === 2, `patch mouseSens (got ${s1.mouseSens})`);
assert(s1.adsSens === 0.5, `patch adsSens (got ${s1.adsSens})`);
assert(s1.invertY === true, 'patch invertY');
assert(s1.volume === 0.8, `patch volume (got ${s1.volume})`);
assert(s1.muted === true, 'patch muted');

patchSettings({ mouseSens: 9, adsSens: 0 });
const clamped = getSettings();
assert(clamped.mouseSens === 2, `mouseSens clamps to 2 (got ${clamped.mouseSens})`);
assert(clamped.adsSens === 0.25, `adsSens clamps to 0.25 (got ${clamped.adsSens})`);

setGraphicsPreset('low');
assert(getSettings().graphicsPreset === 'low', 'setGraphicsPreset low');
setGraphicsPreset('high');
assert(getSettings().graphicsPreset === 'high', 'setGraphicsPreset high');

patchSettings({ mouseSens: 1, adsSens: 1, invertY: false });
const hip = lookScale({ aiming: false, scoped: false });
assert(
  Math.abs(hip.yawScale - MOUSE_SENS) < 1e-12,
  `hip yaw matches MOUSE_SENS (got ${hip.yawScale})`
);
assert(hip.pitchScale === hip.yawScale, 'default pitch matches yaw');

const ads = lookScale({ aiming: true, scoped: false });
assert(
  Math.abs(ads.yawScale - MOUSE_SENS * SCOPE_SENS_MULT) < 1e-12,
  `ADS uses existing scope multiplier so 100% matches current feel (got ${ads.yawScale})`
);

const scoped = lookScale({ aiming: true, scoped: true });
assert(
  Math.abs(scoped.yawScale - ads.yawScale) < 1e-12,
  'scope and ADS share the aim-sensitivity slider'
);

patchSettings({ adsSens: 2, mouseSens: 1, invertY: false });
const adsFast = lookScale({ aiming: true });
assert(
  Math.abs(adsFast.yawScale - MOUSE_SENS * SCOPE_SENS_MULT * 2) < 1e-12,
  `adsSens 2 doubles aim look (got ${adsFast.yawScale})`
);

patchSettings({ mouseSens: 1, adsSens: 1, invertY: true });
const inv = lookScale({ aiming: false });
assert(inv.yawScale === hip.yawScale, 'invert Y does not change yaw');
assert(inv.pitchScale === -hip.pitchScale, 'invert Y flips pitch');

const cam = new THREE.PerspectiveCamera();
const player = new Player(cam, { colliders: [], floors: [] });
patchSettings({ mouseSens: 1, adsSens: 1, invertY: false });
player.yaw = 0;
player.pitch = 0;
player.mouse.dx = 10;
player.mouse.dy = 10;
player.updateLook(false);
const pitchNormal = player.pitch;
assert(pitchNormal < 0, `default look: mouse down decreases pitch (got ${pitchNormal})`);

player.yaw = 0;
player.pitch = 0;
patchSettings({ invertY: true });
player.mouse.dx = 10;
player.mouse.dy = 10;
player.updateLook(false);
assert(player.pitch > 0, `invert Y: mouse down increases pitch (got ${player.pitch})`);
assert(
  Math.abs(player.pitch + pitchNormal) < 1e-9,
  'invert Y is an exact pitch flip of the same mouse delta'
);

const audio = {
  vol: null,
  mute: null,
  setVolume(v) {
    this.vol = v;
  },
  setMuted(m) {
    this.mute = m;
  },
};
patchSettings({ volume: 0.42, muted: true });
applyToGame({ audio });
assert(audio.vol === 0.42, `applyToGame sets volume (got ${audio.vol})`);
assert(audio.mute === true, 'applyToGame sets muted');

// Restore defaults so this process cannot leak into later imports.
patchSettings({
  mouseSens: 1,
  adsSens: 1,
  invertY: false,
  volume: 0.35,
  muted: false,
  graphicsPreset: 'high',
});

const report = { ok: failures.length === 0, failures };
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: settings look / audio / graphics store ok');
