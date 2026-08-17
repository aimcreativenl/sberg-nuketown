/**
 * Settings store + look scaling: hip vs ADS, invert Y, persistence fields.
 */
import * as THREE from 'three';
import { Player } from '../src/game/Player.js';
import { MOUSE_SENS, SCOPE_SENS_MULT, TOUCH_LOOK_MULT, TOUCH_LOOK_PIXEL } from '../src/game/constants.js';
import {
  getSettings,
  patchSettings,
  setGraphicsPreset,
  lookScale,
  GRAPHICS_PRESETS,
  GRAPHICS_QUALITY,
  resolveGraphicsQuality,
  applyToGame,
} from '../src/settings/Settings.js';
import { getPlayDevice } from '../src/input/detectPlayMode.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

const s0 = getSettings();
assert(s0.mouseSens === 1, `default mouseSens is 1 (got ${s0.mouseSens})`);
assert(s0.adsSens === 1, `default adsSens is 1 (got ${s0.adsSens})`);
assert(s0.invertY === false, 'default invertY is off');
assert(s0.touchSens === 1, `default touchSens is 1 (got ${s0.touchSens})`);
assert(s0.gyroMode === 'always', `default gyroMode is always (got ${s0.gyroMode})`);
assert(s0.gyroSens === 1, `default gyroSens is 1 (got ${s0.gyroSens})`);
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

// Per-device quality: same label, different cost; Low actually disables the expensive path
for (const device of ['desktop', 'phone', 'tablet']) {
  assert(GRAPHICS_QUALITY[device], `quality table ${device}`);
  const low = resolveGraphicsQuality('low', device);
  const mid = resolveGraphicsQuality('medium', device);
  const high = resolveGraphicsQuality('high', device);
  const ultra = resolveGraphicsQuality('ultra', device);
  assert(low.device === device && low.id === 'low', `${device} low tagged`);
  assert(low.postEnabled === false, `${device} low skips composer`);
  assert(low.bloomEnabled === false, `${device} low has no bloom`);
  assert(low.shadowsEnabled === false, `${device} low has no shadows`);
  assert(ultra.bloomEnabled === true, `${device} ultra keeps bloom`);
  assert(ultra.postEnabled === true, `${device} ultra keeps post`);
  assert(high.pixelRatioCap >= mid.pixelRatioCap, `${device} high DPR >= medium`);
  assert(ultra.maxPointLights > low.maxPointLights, `${device} ultra more lights than low`);
  const sig = (q) =>
    [q.shadowsEnabled, q.shadowMapSize, q.postEnabled, q.bloomEnabled, q.bloomResolutionScale, q.pixelRatioCap, q.maxPointLights].join('|');
  assert(sig(low) !== sig(mid), `${device} low !== medium`);
  assert(sig(mid) !== sig(high), `${device} medium !== high`);
  assert(sig(high) !== sig(ultra), `${device} high !== ultra`);
}
assert(
  resolveGraphicsQuality('high', 'phone').shadowMapSize < resolveGraphicsQuality('high', 'desktop').shadowMapSize,
  'phone High is cheaper than desktop High'
);
assert(
  resolveGraphicsQuality('high', 'tablet').shadowMapSize < resolveGraphicsQuality('high', 'desktop').shadowMapSize,
  'tablet High is cheaper than desktop High'
);
assert(resolveGraphicsQuality('high', 'desktop').shadowMapSize >= 4096, 'desktop High keeps 4096 shadows');
assert(GRAPHICS_PRESETS.high.shadowMapSize >= 4096, 'GRAPHICS_PRESETS.high stays desktop High');

let appliedQuality = null;
applyToGame({
  applyGraphicsQuality(p) {
    appliedQuality = p;
  },
});
assert(appliedQuality && appliedQuality.id, 'applyToGame delegates to applyGraphicsQuality');
assert(typeof appliedQuality.postEnabled === 'boolean', 'applied quality has postEnabled');

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

patchSettings({ mouseSens: 1, adsSens: 1, invertY: false, touchSens: 1 });
const touchHip = lookScale({ aiming: false, touch: true });
assert(
  Math.abs(100 * TOUCH_LOOK_PIXEL * touchHip.yawScale - Math.PI) < 1e-9,
  `touch 100px swipe is 180° at 100% (got ${100 * TOUCH_LOOK_PIXEL * touchHip.yawScale})`
);
assert(
  Math.abs(touchHip.yawScale - MOUSE_SENS * TOUCH_LOOK_MULT) < 1e-12,
  'touch look ignores mouseSens and uses TOUCH_LOOK_MULT'
);

const desktop = lookScale({ aiming: false, touch: false });
assert(Math.abs(desktop.yawScale - MOUSE_SENS) < 1e-12, 'desktop look still uses mouseSens');

player._touchPlay = true;
player.gyroLook = { active: true, yawRate: Math.PI, pitchRate: 0 };
patchSettings({ gyroMode: 'always', gyroSens: 1, invertY: false });
player.yaw = 0;
player.pitch = 0;
player.mouse.dx = 0;
player.mouse.dy = 0;
player.updateLook(false, 0.5);
assert(Math.abs(player.yaw + Math.PI / 2) < 1e-9, `gyro always: π rad/s for 0.5s is -90° (got ${player.yaw})`);

player.yaw = 0;
patchSettings({ gyroMode: 'ads' });
player.updateLook(false, 0.5);
assert(player.yaw === 0, 'gyro ads mode does not look while hip-firing');
player.updateLook(true, 0.5);
assert(Math.abs(player.yaw + Math.PI / 2) < 1e-9, 'gyro ads mode looks while aiming');

player.yaw = 0;
patchSettings({ gyroMode: 'off' });
player.updateLook(true, 0.5);
assert(player.yaw === 0, 'gyro off never looks');
player._touchPlay = false;
player.gyroLook = null;

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
  touchSens: 1,
  gyroMode: 'always',
  gyroSens: 1,
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
