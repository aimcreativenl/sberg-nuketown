/**
 * Phase A: light TTK loadout + viewmodel juice (recoil / kick / punch).
 * Imports shipped Weapons.js only — minimal THREE camera mock, null audio/particles.
 */
import * as THREE from 'three';
import { WeaponController, LOADOUT } from '../src/game/Weapons.js';
import { Player } from '../src/game/Player.js';
import { PLAYER_HEIGHT } from '../src/game/constants.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

function makeInput(overrides = {}) {
  return {
    weaponSlot: null,
    scopeClick: false,
    shoot: false,
    reload: false,
    shootClick: false,
    aimHold: false,
    sprinting: false,
    moving: false,
    onSemiFire: () => {},
    ...overrides,
  };
}

// Minimal camera hierarchy: parent Object3D + PerspectiveCamera (viewmodel attaches to camera)
const parent = new THREE.Object3D();
const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 500);
parent.add(camera);

const wc = new WeaponController(camera, null, null, null);

// ── LOADOUT TTK ──────────────────────────────────────────────────────────
const pistol = LOADOUT[0];
const m16 = LOADOUT[1];
assert(pistol?.id === 'pistol', 'LOADOUT[0] is pistol');
assert(m16?.id === 'm16', 'LOADOUT[1] is m16');
assert(pistol.damage >= 24 && pistol.damage <= 28, `pistol damage ~26 got ${pistol.damage}`);
assert(pistol.fireRate >= 4.5 && pistol.fireRate <= 5.5, `pistol fireRate ~5 got ${pistol.fireRate}`);
assert(m16.damage >= 16 && m16.damage <= 20, `m16 damage ~18 got ${m16.damage}`);
assert(m16.fireRate >= 9 && m16.fireRate <= 11, `m16 fireRate ~10 got ${m16.fireRate}`);
assert(pistol.magSize === 10, 'pistol magSize 10');
assert(m16.magSize === 30, 'm16 magSize 30');
assert(m16.hasScope === true, 'm16 hasScope');
assert(pistol.auto === false, 'pistol semi-auto');
assert(m16.auto === true, 'm16 full-auto');

// ── getJuiceState exposed ────────────────────────────────────────────────
assert(typeof wc.getJuiceState === 'function', 'getJuiceState exported on controller');
const juice0 = wc.getJuiceState();
assert(juice0.slot === 0, 'start on pistol slot 0');
assert(juice0.ammo === pistol.magSize, `start full mag got ${juice0.ammo}`);
assert(juice0.recoil === 0, 'start recoil 0');
assert(juice0.kickPitch === 0, 'start kickPitch 0');
assert(juice0.punchLength === 0, 'start punchLength 0');

// Switching weapons must not turn an already-held trigger into a shot.
const switchHeld = new WeaponController(camera, null, null, null);
const m16AmmoBeforeHeldSwitch = switchHeld.ammoBySlot[1];
const heldSwitchShots = switchHeld.update(1 / 60, makeInput({ weaponSlot: 1, shoot: true }), true);
assert(heldSwitchShots.length === 0, 'held trigger does not fire on weapon switch');
assert(switchHeld.ammoBySlot[1] === m16AmmoBeforeHeldSwitch, 'M16 ammo unchanged on held switch');

const switchClick = new WeaponController(camera, null, null, null);
const m16AmmoBeforeClickSwitch = switchClick.ammoBySlot[1];
const clickSwitchShots = switchClick.update(
  1 / 60,
  makeInput({ weaponSlot: 1, shoot: true, shootClick: true }),
  true
);
assert(clickSwitchShots.length === 0, 'click does not fire on weapon switch');
assert(switchClick.ammoBySlot[1] === m16AmmoBeforeClickSwitch, 'M16 ammo unchanged on click switch');

const switchRelease = new WeaponController(camera, null, null, null);
switchRelease.update(1 / 60, makeInput({ weaponSlot: 1, shoot: true }), true);
const heldSwitchToPistolShots = switchRelease.update(1 / 60, makeInput({ weaponSlot: 0, shoot: true }), true);
assert(heldSwitchToPistolShots.length === 0, 'held trigger stays held on pistol switch');
const heldAfterSwitchShots = switchRelease.update(1 / 60, makeInput({ shoot: true }), true);
assert(heldAfterSwitchShots.length === 0, 'held trigger stays held after switching to pistol');
switchRelease.update(1 / 60, makeInput({ shoot: false }), true);
const freshPistolShots = switchRelease.update(1 / 60, makeInput({ shoot: true, shootClick: true }), true);
assert(freshPistolShots.length === 1, 'fresh pistol click fires exactly one shot after release');

const bufferedSwitch = new WeaponController(camera, null, null, null);
bufferedSwitch.setLoadoutSlot(1);
let semiFireCallsOnSwitch = 0;
const pistolAmmoBeforeSwitch = bufferedSwitch.ammoBySlot[0];
const switchToPistolShots = bufferedSwitch.update(
  1 / 60,
  makeInput({
    weaponSlot: 0,
    shoot: false,
    shootClick: true,
    onSemiFire: () => {
      semiFireCallsOnSwitch++;
    },
  }),
  true
);
assert(switchToPistolShots.length === 0, 'buffered pistol click does not fire on weapon switch');
assert(semiFireCallsOnSwitch === 1, 'buffered pistol click is discarded on weapon switch');
assert(bufferedSwitch.ammoBySlot[0] === pistolAmmoBeforeSwitch, 'pistol ammo unchanged on click switch');
const leftoverAfterSwitch = bufferedSwitch.update(1 / 60, makeInput({ shoot: false }), true);
assert(leftoverAfterSwitch.length === 0, 'discarded switch click does not fire next frame');
const freshAfterSwitch = bufferedSwitch.update(1 / 60, makeInput({ shoot: true, shootClick: true }), true);
assert(freshAfterSwitch.length === 1, 'fresh click after switch fires');

// ── Fire pistol (semi): ammo -1, juice rises ─────────────────────────────
const ammoBeforePistol = wc.currentAmmo;
const shotsP = wc.update(1 / 60, makeInput({ shoot: true, shootClick: true }), true);
assert(shotsP.length >= 1, 'pistol produced shot(s)');
assert(wc.currentAmmo === ammoBeforePistol - 1, `pistol ammo -1 (${ammoBeforePistol} → ${wc.currentAmmo})`);
const juiceP = wc.getJuiceState();
assert(juiceP.recoil > 0, `pistol recoil > 0 got ${juiceP.recoil}`);
assert(juiceP.kickPitch > 0, `pistol kickPitch > 0 got ${juiceP.kickPitch}`);
assert(juiceP.punchLength > 0, `pistol punchLength > 0 got ${juiceP.punchLength}`);
assert(juiceP.ammo === wc.currentAmmo, 'juice ammo matches');

// Punch drives viewmodel (position includes punch after update)
assert(wc.viewModel != null, 'viewModel present');
const vmZ = wc.viewModel.position.z;
assert(Number.isFinite(vmZ), 'viewModel.position.z finite');
assert(wc.hipPos.z > -0.40 && wc.hipPos.z < -0.28, `hip between float and clip (z=${wc.hipPos.z})`);
assert(wc.viewScale >= 1.25 && wc.viewScale <= 1.5, `viewmodel scale mid held-size got ${wc.viewScale}`);
assert(Math.abs(wc.viewModel.scale.x - wc.viewScale) < 1e-6, 'viewmodel mesh uses viewScale');

// Semi-auto: holding shoot without new click / edge must not dump mag next frame
wc.cooldown = 0;
const ammoHold = wc.currentAmmo;
const shotsHold = wc.update(1 / 60, makeInput({ shoot: true, shootClick: false }), true);
assert(shotsHold.length === 0, 'semi-auto no fire on hold without click/edge');
assert(wc.currentAmmo === ammoHold, 'semi-auto ammo stable on hold');

// ── setLoadoutSlot 0/1 ───────────────────────────────────────────────────
wc.setLoadoutSlot(1);
assert(wc.slot === 1, 'slot 1 M16');
assert(wc.getCurrent().id === 'm16', 'current is m16');
assert(wc.getJuiceState().slot === 1, 'juice slot 1');
assert(wc.currentAmmo === m16.magSize, 'M16 full mag after switch');

wc.setLoadoutSlot(0);
assert(wc.slot === 0 && wc.getCurrent().id === 'pistol', 'back to pistol');
wc.setLoadoutSlot(1);

// ── Fire M16 auto path: hold shoot fires, juice rises ────────────────────
const ammoBeforeM16 = wc.currentAmmo;
const juiceBeforeM16 = wc.getJuiceState();
const shotsM = wc.update(1 / 60, makeInput({ shoot: true, shootClick: false }), true);
assert(shotsM.length >= 1, 'M16 auto produced shot while held');
assert(wc.currentAmmo === ammoBeforeM16 - 1, `M16 ammo -1 (${ammoBeforeM16} → ${wc.currentAmmo})`);
const juiceM = wc.getJuiceState();
assert(juiceM.recoil > juiceBeforeM16.recoil, `M16 recoil increased (${juiceBeforeM16.recoil} → ${juiceM.recoil})`);
assert(juiceM.kickPitch > juiceBeforeM16.kickPitch, `M16 kickPitch increased`);
assert(juiceM.punchLength > 0, `M16 punchLength > 0 got ${juiceM.punchLength}`);

{
  wc.cooldown = 0;
  const ammoTap = wc.currentAmmo;
  let consumed = 0;
  const tapShots = wc.update(
    1 / 60,
    makeInput({
      shoot: false,
      shootClick: true,
      onSemiFire: () => {
        consumed += 1;
      },
    }),
    true
  );
  assert(tapShots.length === 1, 'M16 tap (shootClick) fires one round');
  assert(consumed === 1, 'M16 tap consumes the click buffer');
  assert(wc.currentAmmo === ammoTap - 1, 'M16 tap spends one ammo');
}

{
  const hipGun = new WeaponController(camera, null, null, null);
  hipGun.setLoadoutSlot(1);
  hipGun.update(1 / 60, makeInput({ shoot: true }), true);
  const hipKick = hipGun.getJuiceState().kickPitch;
  const adsGun = new WeaponController(camera, null, null, null);
  adsGun.setLoadoutSlot(1);
  adsGun.adsBlend = 1;
  adsGun.adsHeld = true;
  adsGun.update(1 / 60, makeInput({ shoot: true, aimHold: true }), true);
  const adsKick = adsGun.getJuiceState().kickPitch;
  assert(adsKick > 0, `ADS still has some kick got ${adsKick}`);
  assert(adsKick < hipKick * 0.45, `ADS kick milder than hip (${adsKick} vs ${hipKick})`);
}

// Auto continues after cooldown with hold
wc.cooldown = 0;
const ammo2 = wc.currentAmmo;
const shotsM2 = wc.update(1 / 60, makeInput({ shoot: true }), true);
assert(shotsM2.length >= 1, 'M16 second auto shot on hold after cooldown');
assert(wc.currentAmmo === ammo2 - 1, 'M16 second shot consumes 1');

// ── Scope toggle still works on M16 ──────────────────────────────────────
assert(wc.scoped === false, 'not scoped initially');
const scopedOn = wc.toggleScope();
assert(scopedOn === true && wc.scoped === true, 'scope toggles on');
assert(wc.isScoped() === true, 'isScoped true');
wc.toggleScope();
assert(wc.scoped === false, 'scope toggles off');

// Scope clears when leaving M16
wc.toggleScope();
assert(wc.scoped === true, 'scoped before swap');
wc.setLoadoutSlot(0);
assert(wc.scoped === false, 'scope cleared on pistol slot');

// ── canReload / reload path ──────────────────────────────────────────────
// Spend one round then reload
wc.setLoadoutSlot(0);
wc.currentAmmo = pistol.magSize; // reset
wc.update(1 / 60, makeInput({ shoot: true, shootClick: true }), true);
assert(wc.canReload() === true, 'canReload when ammo < mag');
assert(wc.currentAmmo < pistol.magSize, 'ammo spent');

const started = wc.update(1 / 60, makeInput({ reload: true }), true);
assert(wc.isReloading() === true, 'reload started via R');
assert(Array.isArray(started) && started.length === 0, 'no shots during reload start');

// Finish reload over reloadTime
const rt = wc.reloadDuration;
let steps = 0;
while (wc.isReloading() && steps < 200) {
  wc.update(0.1, makeInput({}), true);
  steps++;
}
assert(wc.isReloading() === false, 'reload finished');
assert(wc.currentAmmo === pistol.magSize, `full mag after reload got ${wc.currentAmmo}`);
assert(wc.canReload() === false, 'cannot reload when full');

// Empty-click starts reload
wc.currentAmmo = 0;
wc.update(1 / 60, makeInput({ shoot: true, shootClick: true }), true);
assert(wc.isReloading() === true, 'dry-fire starts reload');

// Hip pose NDC: grip on-screen, stock at/near the frame, muzzle inward (16:9 play cam)
{
  const playCam = new THREE.PerspectiveCamera(75, 16 / 9, 0.02, 180);
  const playWc = new WeaponController(playCam, null, null, null);
  playWc.setLoadoutSlot(1);
  playWc.viewModel.position.copy(playWc.hipPos);
  playWc.viewModel.rotation.copy(playWc.hipRot);
  playWc.viewModel.scale.setScalar(playWc.viewScale);
  playCam.updateMatrixWorld(true);
  playWc.viewModel.updateWorldMatrix(true, true);
  const ndcOf = (x, y, z) => {
    const v = new THREE.Vector3(x, y, z);
    playWc.viewModel.localToWorld(v);
    v.project(playCam);
    return v;
  };
  const grip = ndcOf(0, -0.05, 0.04);
  const stock = ndcOf(0, 0.02, 0.12);
  const muzzle = ndcOf(0, 0.02, playWc.viewModel.userData.muzzleZ || -0.34);
  const inView = (p) => Math.abs(p.x) <= 1.02 && Math.abs(p.y) <= 1.02;
  const ndc = {
    grip: { x: +grip.x.toFixed(3), y: +grip.y.toFixed(3) },
    stock: { x: +stock.x.toFixed(3), y: +stock.y.toFixed(3) },
    muzzle: { x: +muzzle.x.toFixed(3), y: +muzzle.y.toFixed(3) },
  };
  assert(inView(grip), `grip on-screen ndc=(${ndc.grip.x},${ndc.grip.y}) stock=(${ndc.stock.x},${ndc.stock.y}) muzzle=(${ndc.muzzle.x},${ndc.muzzle.y})`);
  assert(inView(muzzle), `muzzle on-screen ndc=(${ndc.muzzle.x},${ndc.muzzle.y})`);
  assert(grip.x > 0.05 && grip.x < 0.95, `grip in lower-right x=${ndc.grip.x}`);
  assert(grip.y < -0.15, `grip below center y=${ndc.grip.y}`);
  assert(
    !inView(stock) || stock.y < -0.70 || stock.x > 0.78,
    `stock at frame edge, not floating ndc=(${ndc.stock.x},${ndc.stock.y})`
  );
  assert(muzzle.x < grip.x - 0.05, `muzzle inward of grip (${ndc.muzzle.x} < ${ndc.grip.x})`);
  globalThis.__viewmodelNdc = ndc;
}

// ── Match start leftover trigger (PLAY click / held LMB) ───────────────
{
  const startGun = new WeaponController(camera, null, null, null);
  startGun.setLoadoutSlot(1);
  startGun.resetAll();
  const leftover = startGun.update(1 / 60, makeInput({ shoot: true, shootClick: true }), true);
  assert(leftover.length === 0, 'resetAll / match start swallows leftover shoot+click');
  const stillHeld = startGun.update(1 / 60, makeInput({ shoot: true }), true);
  assert(stillHeld.length === 0, 'held LMB after match start does not auto-fire');
  startGun.update(1 / 60, makeInput({ shoot: false }), true);
  const freshStart = startGun.update(1 / 60, makeInput({ shoot: true, shootClick: true }), true);
  assert(freshStart.length === 1, 'fresh trigger after match start fires');
}

{
  const p = new Player(camera, {});
  p.shootClicks = 2;
  p.buttons.left = true;
  p.buttons.right = true;
  p.fullMatchReset(new THREE.Vector3(0, PLAYER_HEIGHT, 8));
  assert(p.shootClicks === 0, 'fullMatchReset clears shootClicks');
  assert(p.buttons.left === false, 'fullMatchReset clears held LMB');
}

const report = {
  ok: failures.length === 0,
  ttk: {
    pistol: { damage: pistol.damage, fireRate: pistol.fireRate, magSize: pistol.magSize },
    m16: { damage: m16.damage, fireRate: m16.fireRate, magSize: m16.magSize },
  },
  juiceSample: juiceP,
  viewmodelNdc: globalThis.__viewmodelNdc || null,
  failures,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: phase-a weapons TTK + juice checks ok');
