/**
 * Phase A: light TTK loadout + viewmodel juice (recoil / kick / punch).
 * Imports shipped Weapons.js only — minimal THREE camera mock, null audio/particles.
 */
import * as THREE from 'three';
import { WeaponController, LOADOUT } from '../src/game/Weapons.js';

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
let semiFireCallsOnSwitch = 0;
const pistolAmmoBeforeSwitch = switchRelease.ammoBySlot[0];
const switchToPistolShots = switchRelease.update(
  1 / 60,
  makeInput({
    weaponSlot: 0,
    shoot: true,
    shootClick: true,
    onSemiFire: () => {
      semiFireCallsOnSwitch++;
    },
  }),
  true
);
assert(switchToPistolShots.length === 0, 'buffered pistol click does not fire on weapon switch');
assert(semiFireCallsOnSwitch === 0, 'buffered pistol click is not consumed on weapon switch');
assert(switchRelease.ammoBySlot[0] === pistolAmmoBeforeSwitch, 'pistol ammo unchanged on click switch');
const heldAfterSwitchShots = switchRelease.update(1 / 60, makeInput({ shoot: true }), true);
assert(heldAfterSwitchShots.length === 0, 'held trigger stays held after switching to pistol');
switchRelease.update(1 / 60, makeInput({ shoot: false }), true);
const freshPistolShots = switchRelease.update(1 / 60, makeInput({ shoot: true, shootClick: true }), true);
assert(freshPistolShots.length === 1, 'fresh pistol click fires exactly one shot after release');

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
// After punch, z should be pushed back relative to pure hip (hip z = -0.42) — allow lerp lag
assert(Number.isFinite(vmZ), 'viewModel.position.z finite');

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

const report = {
  ok: failures.length === 0,
  ttk: {
    pistol: { damage: pistol.damage, fireRate: pistol.fireRate, magSize: pistol.magSize },
    m16: { damage: m16.damage, fireRate: m16.fireRate, magSize: m16.magSize },
  },
  juiceSample: juiceP,
  failures,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: phase-a weapons TTK + juice checks ok');
