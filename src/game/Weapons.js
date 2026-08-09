import * as THREE from 'three';

/** Player loadout (hotkeys 1 / 2) — Phase A light TTK (snappier than sponge) */
export const LOADOUT = [
  {
    id: 'pistol',
    name: 'Pistol',
    damage: 26,
    fireRate: 5,
    magSize: 10,
    reloadTime: 1.35,
    spread: 0.01,
    range: 90,
    auto: false,
    color: 0xff9eb5,
    adsFov: 52,
    pellets: 1,
  },
  {
    id: 'm16',
    name: 'M16',
    damage: 18,
    fireRate: 10,
    magSize: 30,
    reloadTime: 2.0,
    spread: 0.012,
    range: 120,
    auto: true,
    color: 0x7d8b6a,
    adsFov: 48,
    /** Base FOVs for scoped zoom tiers (2x / 3x / 4x) — hip FOV / zoom */
    scopeFovs: { 2: 38, 3: 26, 4: 18 },
    scopeFov: 18,
    hasScope: true,
    pellets: 1,
  },
];

/** Legacy / bot / gun-game table (kept for bot tiers) */
export const WEAPONS = [
  {
    id: 'pistol',
    name: 'Pistol',
    damage: 22,
    fireRate: 3.2,
    magSize: 10,
    reloadTime: 1.35,
    spread: 0.018,
    range: 90,
    auto: false,
    color: 0xff9eb5,
    adsFov: 52,
    pellets: 1,
  },
  {
    id: 'smg',
    name: 'SMG',
    damage: 14,
    fireRate: 11,
    magSize: 10,
    reloadTime: 1.45,
    spread: 0.038,
    range: 70,
    auto: true,
    color: 0xc5b4e3,
    adsFov: 48,
    pellets: 1,
  },
  {
    id: 'shotgun',
    name: 'Shotgun',
    damage: 11,
    fireRate: 1.15,
    magSize: 10,
    reloadTime: 2.0,
    spread: 0.11,
    range: 28,
    auto: false,
    color: 0xffeaa7,
    adsFov: 55,
    pellets: 6,
  },
  {
    id: 'ar',
    name: 'Assault Rifle',
    damage: 18,
    fireRate: 8,
    magSize: 10,
    reloadTime: 1.75,
    spread: 0.022,
    range: 110,
    auto: true,
    color: 0xa8e6cf,
    adsFov: 45,
    pellets: 1,
  },
  {
    id: 'sniper',
    name: 'Sniper',
    damage: 85,
    fireRate: 0.75,
    magSize: 10,
    reloadTime: 2.15,
    spread: 0.004,
    range: 220,
    auto: false,
    color: 0xa0d2db,
    adsFov: 24,
    pellets: 1,
  },
];

/** Shared FP gun materials — plastic vs metal contrast (Option A Phase 4). */
const _vmMatCache = new Map();
const _vmGeoCache = new Map();

function vmMat(color, kind = 'plastic') {
  const key = `${kind}_${(color >>> 0).toString(16)}`;
  let m = _vmMatCache.get(key);
  if (m) return m;
  // MeshStandard for light response; still drawn over world (depthTest off in _setViewModel)
  const presets = {
    plastic: { roughness: 0.62, metalness: 0.06 },
    metal: { roughness: 0.28, metalness: 0.72 },
    darkMetal: { roughness: 0.38, metalness: 0.55 },
    grip: { roughness: 0.88, metalness: 0.02 },
    skin: { roughness: 0.78, metalness: 0.0 },
    accent: { roughness: 0.55, metalness: 0.12 },
  };
  const p = presets[kind] || presets.plastic;
  m = new THREE.MeshStandardMaterial({
    color,
    roughness: p.roughness,
    metalness: p.metalness,
    flatShading: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  m.userData.shared = true;
  m.name = `vm_${kind}`;
  _vmMatCache.set(key, m);
  return m;
}

function vmGeo(w, h, d) {
  const key = `${w.toFixed(4)}_${h.toFixed(4)}_${d.toFixed(4)}`;
  let g = _vmGeoCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    g.userData.shared = true;
    _vmGeoCache.set(key, g);
  }
  return g;
}

function box(w, h, d, color, x = 0, y = 0, z = 0, kind = 'plastic') {
  const m = new THREE.Mesh(vmGeo(w, h, d), vmMat(color, kind));
  m.position.set(x, y, z);
  m.frustumCulled = false;
  m.renderOrder = 9999;
  return m;
}

/**
 * First-person pastel toy weapons — multi-part silhouette, not 4 giant cubes.
 * Camera looks down -Z; barrel points -Z. Named: mag, handL, handR, slide.
 */
export function buildViewModel(def) {
  const root = new THREE.Group();
  root.name = 'ViewModel';
  const c = def.color ?? 0xff9eb5;
  const mint = 0xb5ead7;
  const cream = 0xfff5e8;
  const metal = 0x5a5166;
  const darkMetal = 0x3a3444;
  const gripC = 0xe8c4a8;

  // Hands — right always; left during reload
  const handR = box(0.042, 0.04, 0.048, 0xffd4b8, 0.035, -0.04, 0.03, 'skin');
  handR.name = 'handR';
  root.add(handR);
  root.add(box(0.038, 0.032, 0.038, 0xc5b4e3, 0.035, -0.054, 0.048, 'plastic')); // sleeve
  root.add(box(0.02, 0.016, 0.022, 0xffd4b8, 0.05, -0.038, 0.01, 'skin')); // thumb hint

  const handL = box(0.036, 0.036, 0.038, 0xffd4b8, -0.02, -0.02, 0.02, 'skin');
  handL.name = 'handL';
  handL.visible = false;
  root.add(handL);

  if (def.id === 'pistol' || !def.id) {
    // Frame / receiver body
    root.add(box(0.052, 0.048, 0.13, c, 0.0, 0.008, -0.038, 'plastic'));
    root.add(box(0.048, 0.022, 0.06, darkMetal, 0.0, -0.012, -0.02, 'darkMetal')); // dust cover
    // Slide (named — fire kick + reload rack)
    const slide = box(0.056, 0.028, 0.142, metal, 0.0, 0.04, -0.05, 'metal');
    slide.name = 'slide';
    root.add(slide);
    // Slide serrations + optic rail strip
    root.add(box(0.01, 0.018, 0.04, darkMetal, 0.026, 0.048, 0.0, 'darkMetal'));
    root.add(box(0.01, 0.018, 0.04, darkMetal, -0.026, 0.048, 0.0, 'darkMetal'));
    root.add(box(0.048, 0.01, 0.1, mint, 0.0, 0.056, -0.04, 'accent'));
    // Barrel segments + muzzle
    root.add(box(0.024, 0.024, 0.055, darkMetal, 0.0, 0.03, -0.145, 'darkMetal'));
    root.add(box(0.02, 0.02, 0.04, metal, 0.0, 0.03, -0.185, 'metal'));
    root.add(box(0.03, 0.03, 0.016, cream, 0.0, 0.03, -0.205, 'accent'));
    // Front / rear sights
    root.add(box(0.01, 0.016, 0.01, darkMetal, 0.0, 0.062, -0.145, 'darkMetal'));
    root.add(box(0.018, 0.014, 0.012, darkMetal, 0.0, 0.06, 0.01, 'darkMetal'));
    // Grip with panel detail
    root.add(box(0.046, 0.095, 0.048, gripC, 0.0, -0.05, 0.02, 'grip'));
    root.add(box(0.05, 0.07, 0.012, 0xd4a070, 0.022, -0.048, 0.02, 'grip'));
    root.add(box(0.05, 0.07, 0.012, 0xd4a070, -0.022, -0.048, 0.02, 'grip'));
    // Mag + floorplate
    const mag = box(0.038, 0.068, 0.038, darkMetal, 0.0, -0.07, 0.0, 'darkMetal');
    mag.name = 'mag';
    root.add(mag);
    root.add(box(0.042, 0.012, 0.042, cream, 0.0, -0.105, 0.0, 'accent'));
    // Trigger guard + trigger
    root.add(box(0.028, 0.022, 0.032, metal, 0.0, -0.012, -0.018, 'metal'));
    root.add(box(0.01, 0.016, 0.008, darkMetal, 0.0, -0.006, -0.02, 'darkMetal'));
    root.userData.muzzleZ = -0.21;
  } else if (def.id === 'm16') {
    const olive = c;
    const black = 0x3a3f3a;
    const rail = 0x4a5248;
    // Upper + lower receiver
    root.add(box(0.048, 0.032, 0.18, olive, 0.0, 0.032, -0.07, 'plastic'));
    root.add(box(0.05, 0.028, 0.16, 0x6a7858, 0.0, 0.006, -0.06, 'plastic'));
    // Carry handle / rear sight
    root.add(box(0.028, 0.036, 0.075, black, 0.0, 0.058, -0.015, 'darkMetal'));
    root.add(box(0.014, 0.012, 0.02, cream, 0.0, 0.078, -0.04, 'accent'));
    // Picatinny rail strip on handguard
    root.add(box(0.042, 0.01, 0.11, rail, 0.0, 0.048, -0.155, 'metal'));
    for (let i = 0; i < 4; i++) {
      root.add(box(0.038, 0.008, 0.012, darkMetal, 0.0, 0.052, -0.12 - i * 0.028, 'darkMetal'));
    }
    // Handguard body + side rails
    root.add(box(0.046, 0.038, 0.11, 0x5a6550, 0.0, 0.018, -0.155, 'plastic'));
    root.add(box(0.01, 0.028, 0.1, rail, 0.026, 0.018, -0.155, 'metal'));
    root.add(box(0.01, 0.028, 0.1, rail, -0.026, 0.018, -0.155, 'metal'));
    // Barrel segments + gas block + muzzle
    root.add(box(0.02, 0.02, 0.08, black, 0.0, 0.024, -0.24, 'darkMetal'));
    root.add(box(0.026, 0.026, 0.03, metal, 0.0, 0.024, -0.275, 'metal')); // gas block
    root.add(box(0.016, 0.016, 0.05, black, 0.0, 0.024, -0.31, 'darkMetal'));
    root.add(box(0.028, 0.028, 0.028, metal, 0.0, 0.024, -0.34, 'metal')); // muzzle
    root.add(box(0.032, 0.014, 0.012, cream, 0.0, 0.024, -0.355, 'accent'));
    // Front sight post
    root.add(box(0.012, 0.032, 0.012, black, 0.0, 0.05, -0.285, 'darkMetal'));
    root.add(box(0.02, 0.008, 0.008, black, 0.0, 0.068, -0.285, 'darkMetal'));
    // STANAG mag + spine
    const mag = box(0.034, 0.098, 0.042, black, 0.0, -0.06, -0.04, 'darkMetal');
    mag.name = 'mag';
    root.add(mag);
    root.add(box(0.01, 0.08, 0.038, metal, 0.0, -0.055, -0.04, 'metal'));
    root.add(box(0.038, 0.012, 0.046, olive, 0.0, -0.112, -0.04, 'plastic'));
    // Pistol grip
    root.add(box(0.038, 0.088, 0.042, gripC, 0.0, -0.05, 0.042, 'grip'));
    root.add(box(0.042, 0.05, 0.014, 0xd4a070, 0.02, -0.05, 0.042, 'grip'));
    // Stock + buttpad + buffer tube (kept short on +Z to avoid near-clip under punch)
    root.add(box(0.028, 0.028, 0.05, metal, 0.0, 0.018, 0.05, 'metal'));
    root.add(box(0.04, 0.042, 0.07, olive, 0.0, 0.014, 0.085, 'plastic'));
    root.add(box(0.048, 0.055, 0.022, cream, 0.0, 0.018, 0.118, 'accent'));
    root.add(box(0.02, 0.03, 0.032, darkMetal, 0.0, -0.01, 0.08, 'darkMetal')); // stock brace
    // Forward assist / ejection port cue
    root.add(box(0.014, 0.02, 0.035, darkMetal, 0.026, 0.028, -0.05, 'darkMetal'));
    root.userData.muzzleZ = -0.34;
  } else if (def.id === 'smg') {
    root.add(box(0.052, 0.05, 0.16, c, 0.0, 0.015, -0.055, 'plastic'));
    root.add(box(0.028, 0.028, 0.08, metal, 0.0, 0.02, -0.16, 'metal'));
    root.add(box(0.022, 0.022, 0.05, darkMetal, 0.0, 0.02, -0.22, 'darkMetal'));
    root.add(box(0.042, 0.085, 0.038, gripC, 0.0, -0.045, 0.02, 'grip'));
    const mag = box(0.034, 0.078, 0.038, darkMetal, 0.0, -0.06, -0.02, 'darkMetal');
    mag.name = 'mag';
    root.add(mag);
    root.add(box(0.018, 0.036, 0.048, mint, 0.028, 0.04, -0.04, 'accent'));
    root.userData.muzzleZ = -0.26;
  } else if (def.id === 'shotgun') {
    root.add(box(0.052, 0.048, 0.2, c, 0.0, 0.01, -0.07, 'plastic'));
    root.add(box(0.032, 0.032, 0.1, metal, 0.0, 0.01, -0.2, 'metal'));
    root.add(box(0.028, 0.028, 0.06, darkMetal, 0.0, 0.01, -0.26, 'darkMetal'));
    root.add(box(0.048, 0.085, 0.048, gripC, 0.0, -0.05, 0.04, 'grip'));
    const mag = box(0.038, 0.038, 0.055, darkMetal, 0.0, -0.03, -0.02, 'darkMetal');
    mag.name = 'mag';
    root.add(mag);
    root.userData.muzzleZ = -0.3;
  } else if (def.id === 'ar') {
    root.add(box(0.052, 0.05, 0.18, c, 0.0, 0.015, -0.065, 'plastic'));
    root.add(box(0.026, 0.026, 0.1, metal, 0.0, 0.02, -0.18, 'metal'));
    root.add(box(0.02, 0.02, 0.06, darkMetal, 0.0, 0.02, -0.25, 'darkMetal'));
    root.add(box(0.042, 0.09, 0.038, gripC, 0.0, -0.05, 0.02, 'grip'));
    const mag = box(0.034, 0.088, 0.038, darkMetal, 0.0, -0.065, -0.03, 'darkMetal');
    mag.name = 'mag';
    root.add(mag);
    root.add(box(0.014, 0.036, 0.055, darkMetal, 0.0, 0.05, -0.05, 'darkMetal'));
    root.userData.muzzleZ = -0.3;
  } else {
    // sniper
    root.add(box(0.048, 0.042, 0.22, c, 0.0, 0.01, -0.07, 'plastic'));
    root.add(box(0.022, 0.022, 0.12, metal, 0.0, 0.015, -0.22, 'metal'));
    root.add(box(0.018, 0.018, 0.06, darkMetal, 0.0, 0.015, -0.3, 'darkMetal'));
    root.add(box(0.038, 0.085, 0.038, gripC, 0.0, -0.05, 0.03, 'grip'));
    root.add(box(0.032, 0.032, 0.075, 0x3a4a5a, 0.0, 0.045, -0.06, 'metal'));
    const mag = box(0.028, 0.055, 0.038, darkMetal, 0.0, -0.04, -0.02, 'darkMetal');
    mag.name = 'mag';
    root.add(mag);
    root.userData.muzzleZ = -0.34;
  }

  root.userData.handLRest = handL.position.clone();
  root.userData.handRRest = handR.position.clone();
  const mag = root.getObjectByName('mag');
  if (mag) root.userData.magRest = mag.position.clone();

  return root;
}

export class WeaponController {
  constructor(camera, scene, audio, particles) {
    this.camera = camera;
    this.scene = scene;
    this.audio = audio;
    this.particles = particles;
    /** Loadout slot: 0 = Pistol (key 1), 1 = M16 (key 2) */
    this.slot = 0;
    this.index = 0; // alias for UI/gun-game display
    /** Per-slot magazine ammo */
    this.ammoBySlot = LOADOUT.map((w) => w.magSize);
    this.cooldown = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this.reloadDuration = 1.35;
    this.recoil = 0;
    /** Hold-RMB ADS (hip → sights) vs click-RMB scope toggle */
    this.adsHeld = false;
    this.adsBlend = 0;
    this.viewModel = null;
    this.hipPos = new THREE.Vector3(0.22, -0.18, -0.42);
    this.adsPos = new THREE.Vector3(0.0, -0.11, -0.34);
    this.baseFov = 75;
    this.wasShoot = false;
    this.muzzleLocal = new THREE.Vector3(0.0, 0.03, -0.21);
    this.kickPitch = 0;
    this.kickYaw = 0;
    this.bobTime = 0;
    this.punchPos = new THREE.Vector3();
    /** M16 optic scope (RMB tap toggle) */
    this.scoped = false;
    this.scopeBlend = 0;
    /** Zoom multiplier while scoped: 2 | 3 | 4 */
    this.scopeZoom = 4;
    this._setViewModel();
  }

  isScoped() {
    return this.scoped && this.getCurrent().hasScope;
  }

  /** True when hold-ADS or full scope is active (for sensitivity / UI). */
  isAiming() {
    return this.adsHeld || this.isScoped();
  }

  get currentAmmo() {
    return this.ammoBySlot[this.slot] ?? 0;
  }

  set currentAmmo(v) {
    this.ammoBySlot[this.slot] = Math.max(0, Math.floor(v));
  }

  _setViewModel() {
    if (this.viewModel) {
      this.camera.remove(this.viewModel);
      this.viewModel.traverse((c) => {
        // Shared geo/mat pool — do not dispose cached FP assets
        if (c.geometry && !c.geometry.userData?.shared) c.geometry.dispose();
        if (c.material && !c.material.userData?.shared) c.material.dispose();
      });
    }
    const def = this.getCurrent();
    this.viewModel = buildViewModel(def);
    this.viewModel.position.copy(this.hipPos);
    // Keep modest — reference is a small handgun, not a screen prop
    this.viewModel.scale.setScalar(0.78);
    this.viewModel.renderOrder = 9999;
    this.viewModel.frustumCulled = false;
    this.viewModel.traverse((c) => {
      c.frustumCulled = false;
      c.renderOrder = 9999;
      if (c.material) {
        c.material.depthTest = false;
        c.material.depthWrite = false;
        c.material.toneMapped = false;
      }
    });
    this.camera.add(this.viewModel);
    const mz = this.viewModel.userData.muzzleZ || -0.65;
    this.muzzleLocal.set(0.02, 0.1, mz);
  }

  /** Switch loadout slot (0 = pistol / key 1, 1 = M16 / key 2) */
  setLoadoutSlot(slot) {
    const next = Math.max(0, Math.min(LOADOUT.length - 1, slot | 0));
    if (next === this.slot && this.viewModel) return;
    // Cancel reload when swapping
    this.reloading = false;
    this.reloadTimer = 0;
    this.slot = next;
    this.index = next;
    this.cooldown = 0;
    this.wasShoot = false;
    // Scope only exists on M16 — always close when leaving it
    if (!LOADOUT[next]?.hasScope) this.scoped = false;
    this._setViewModel();
    this.audio?.playUI?.();
  }

  toggleScope() {
    const def = this.getCurrent();
    if (!def.hasScope) {
      this.scoped = false;
      return false;
    }
    this.scoped = !this.scoped;
    if (this.scoped) this.scopeZoom = 4;
    this.audio?.playUI?.();
    return this.scoped;
  }

  /** Scroll while scoped: cycle 2x ↔ 3x ↔ 4x. deltaY > 0 zooms out. */
  nudgeScopeZoom(deltaY) {
    if (!this.isScoped()) return this.scopeZoom;
    const tiers = [2, 3, 4];
    let i = tiers.indexOf(this.scopeZoom);
    if (i < 0) i = 2;
    if (deltaY > 0) i = Math.max(0, i - 1);
    else if (deltaY < 0) i = Math.min(tiers.length - 1, i + 1);
    this.scopeZoom = tiers[i];
    return this.scopeZoom;
  }

  /** @deprecated gun-game helper — maps to loadout pistol / M16 */
  setWeaponIndex(i) {
    // Keep API: 0 → pistol, anything else prefers M16 if available
    this.setLoadoutSlot(i <= 0 ? 0 : Math.min(1, i));
  }

  getCurrent() {
    return LOADOUT[this.slot] || LOADOUT[0];
  }

  getAmmo() {
    const w = this.getCurrent();
    return {
      current: Math.max(0, Math.floor(this.currentAmmo)),
      mag: w.magSize,
    };
  }

  canReload() {
    if (this.reloading) return false;
    return this.currentAmmo < this.getCurrent().magSize;
  }

  isReloading() {
    return this.reloading;
  }

  consumeKick() {
    const pitch = this.kickPitch;
    const yaw = this.kickYaw;
    this.kickPitch = 0;
    this.kickYaw = 0;
    return { pitch, yaw };
  }

  /**
   * Readable juice / fire-feel state for tests and debug.
   * punchLength = |punchPos| (viewmodel positional punch magnitude).
   */
  getJuiceState() {
    return {
      recoil: this.recoil,
      kickPitch: this.kickPitch,
      punchLength: this.punchPos.length(),
      slot: this.slot,
      ammo: Math.max(0, Math.floor(this.currentAmmo)),
    };
  }

  resetAll() {
    this.slot = 0;
    this.index = 0;
    this.ammoBySlot = LOADOUT.map((w) => w.magSize);
    this.reloading = false;
    this.reloadTimer = 0;
    this.cooldown = 0;
    this.recoil = 0;
    this.wasShoot = false;
    this.scoped = false;
    this.scopeBlend = 0;
    this.scopeZoom = 4;
    this.adsHeld = false;
    this.adsBlend = 0;
    this._setViewModel();
  }

  /**
   * Start reload if at least one round was spent (ammo < magSize), including empty (0).
   */
  _startReload() {
    if (this.reloading) return false;
    const def = this.getCurrent();
    if (this.currentAmmo >= def.magSize) return false;
    this.reloading = true;
    this.reloadDuration = def.reloadTime;
    this.reloadTimer = def.reloadTime;
    this.cooldown = 0;
    this.audio?.playReload?.();
    return true;
  }

  /**
   * Magazine-out / magazine-in hand animation (scaled to small pistol).
   * t = 0..1 through the reload.
   */
  _animateReload(t) {
    const vm = this.viewModel;
    if (!vm) return;
    const handL = vm.getObjectByName('handL');
    const mag = vm.getObjectByName('mag');
    const slide = vm.getObjectByName('slide');
    const handLRest = vm.userData.handLRest || new THREE.Vector3(-0.02, -0.02, 0.02);
    const magRest = vm.userData.magRest || new THREE.Vector3(0.0, -0.07, 0.0);

    if (handL) handL.visible = true;

    if (handL) {
      if (t < 0.25) {
        const p = t / 0.25;
        handL.position.lerpVectors(handLRest, magRest.clone().add(new THREE.Vector3(-0.02, 0.01, 0.02)), p);
        handL.rotation.z = -p * 0.35;
      } else if (t < 0.55) {
        const p = (t - 0.25) / 0.3;
        const out = magRest.clone().add(new THREE.Vector3(-0.03, -0.12 * p - 0.02, 0.02));
        handL.position.copy(out.clone().add(new THREE.Vector3(-0.02, 0.01, 0.02)));
        handL.rotation.z = -0.35 - p * 0.25;
        if (mag) {
          mag.position.copy(out);
          mag.rotation.x = p * 0.4;
          mag.visible = true;
        }
      } else if (t < 0.85) {
        const p = (t - 0.55) / 0.3;
        const from = magRest.clone().add(new THREE.Vector3(-0.03, -0.14, 0.02));
        const to = magRest.clone();
        const pos = from.clone().lerp(to, p);
        handL.position.copy(pos.clone().add(new THREE.Vector3(-0.02, 0.01, 0.02)));
        handL.rotation.z = -0.55 + p * 0.4;
        if (mag) {
          mag.position.copy(pos);
          mag.rotation.x = (1 - p) * 0.4;
          mag.visible = true;
        }
      } else {
        const p = (t - 0.85) / 0.15;
        handL.position.lerpVectors(
          magRest.clone().add(new THREE.Vector3(-0.02, 0.01, 0.02)),
          handLRest,
          p
        );
        handL.rotation.z = -0.15 * (1 - p);
        if (mag) {
          mag.position.copy(magRest);
          mag.rotation.x = 0;
          mag.visible = true;
        }
        if (slide) {
          slide.position.z = -0.05 + Math.sin(p * Math.PI) * 0.025;
        }
      }
    }

    // Gentle dip — keep it subtle
    vm.rotation.x = -0.08 - Math.sin(Math.min(t, 1) * Math.PI) * 0.12;
    vm.rotation.z = Math.sin(t * Math.PI) * 0.06;
  }

  _resetReloadPose() {
    const vm = this.viewModel;
    if (!vm) return;
    const handL = vm.getObjectByName('handL');
    const mag = vm.getObjectByName('mag');
    const slide = vm.getObjectByName('slide');
    if (handL && vm.userData.handLRest) {
      handL.position.copy(vm.userData.handLRest);
      handL.rotation.set(0, 0, 0);
      handL.visible = false;
    }
    if (mag && vm.userData.magRest) {
      mag.position.copy(vm.userData.magRest);
      mag.rotation.set(0, 0, 0);
      mag.visible = true;
    }
    if (slide) slide.position.z = -0.05;
    vm.rotation.x = 0;
    vm.rotation.z = 0;
  }

  update(dt, input, playerAlive) {
    const shots = [];
    if (!playerAlive) {
      if (this.viewModel) this.viewModel.visible = false;
      return shots;
    }
    if (this.viewModel) this.viewModel.visible = true;

    // Hotkeys 1 / 2
    let switchedSlot = false;
    if (input.weaponSlot === 0 || input.weaponSlot === 1) {
      switchedSlot = input.weaponSlot !== this.slot;
      this.setLoadoutSlot(input.weaponSlot);
    }

    const def = this.getCurrent();
    // RMB tap toggles M16 optic scope; hold is separate ADS
    if (input.scopeClick) {
      this.toggleScope();
    }
    if (!def.hasScope) this.scoped = false;
    if (input.scopeZoomDelta) {
      this.nudgeScopeZoom(input.scopeZoomDelta);
    }

    this.adsHeld = !!input.aimHold && !this.isScoped();
    const adsTarget = this.adsHeld || this.isScoped() ? 1 : 0;
    this.adsBlend = THREE.MathUtils.lerp(this.adsBlend, adsTarget, 1 - Math.pow(0.00015, dt));

    const wantShoot = !!input.shoot;
    const wantReload = !!input.reload;
    const shootClick = !!input.shootClick;

    const scopeTarget = this.isScoped() ? 1 : 0;
    this.scopeBlend = THREE.MathUtils.lerp(this.scopeBlend, scopeTarget, 1 - Math.pow(0.0002, dt));

    this.bobTime += dt * (input.sprinting ? 1.35 : input.moving ? 1 : 0.55);
    const moveAmp = input.sprinting ? 1.5 : input.moving ? 1 : 0.25;
    const bobAmp = THREE.MathUtils.lerp(1, 0.12, this.adsBlend) * moveAmp;
    const swayX = Math.sin(this.bobTime * 1.35) * 0.012 * THREE.MathUtils.lerp(1, 0.2, this.adsBlend);
    const swayY = Math.cos(this.bobTime * 1.7) * 0.008 * THREE.MathUtils.lerp(1, 0.2, this.adsBlend);
    const walkBobY = Math.sin(this.bobTime * 9.5) * 0.012 * bobAmp;
    const walkBobX = Math.sin(this.bobTime * 4.75) * 0.01 * bobAmp;

    // Juice decay — punch snaps back, recoil/kick settle (viewmodel reads punchPos every frame)
    this.recoil = Math.max(0, this.recoil - dt * 8);
    this.punchPos.multiplyScalar(Math.pow(0.0008, dt));
    this.kickPitch = THREE.MathUtils.lerp(this.kickPitch, 0, 1 - Math.pow(0.00015, dt));
    this.kickYaw = THREE.MathUtils.lerp(this.kickYaw, 0, 1 - Math.pow(0.00015, dt));

    const targetPos = this.hipPos.clone().lerp(this.adsPos, this.adsBlend);
    // Stronger punchPos + recoil drive on viewmodel position
    targetPos.x += swayX + walkBobX + this.punchPos.x;
    targetPos.y += this.recoil * 0.08 + swayY + walkBobY + this.punchPos.y;
    targetPos.z += this.recoil * 0.06 + this.punchPos.z;
    this.viewModel.position.lerp(targetPos, 1 - Math.pow(0.00008, dt));

    if (!this.reloading) {
      this.viewModel.rotation.x =
        -this.recoil * 0.22 +
        this.punchPos.z * 0.35 +
        Math.sin(this.bobTime * 1.2) * 0.01 * bobAmp;
      this.viewModel.rotation.y =
        this.punchPos.x * 0.8 + Math.sin(this.bobTime * 0.9) * 0.012 * bobAmp;
      this.viewModel.rotation.z =
        Math.sin(performance.now() * 0.008) * this.recoil * 0.05 +
        Math.sin(this.bobTime * 1.1) * 0.008 * bobAmp;
    }

    // FOV: hip → hold-ADS → scoped zoom tier
    let zoomFov = def.adsFov ?? 48;
    if (this.isScoped()) {
      const map = def.scopeFovs || {};
      zoomFov = map[this.scopeZoom] ?? def.scopeFov ?? 18;
    } else if (this.adsHeld) {
      zoomFov = def.adsFov ?? 48;
    }
    const aimBlend = this.isScoped() ? this.scopeBlend : this.adsBlend;
    const targetFov = THREE.MathUtils.lerp(this.baseFov, zoomFov, aimBlend);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.pow(0.0004, dt));
    this.camera.updateProjectionMatrix();

    // Hide viewmodel only in full optic scope (ADS keeps the gun up)
    if (this.viewModel) {
      this.viewModel.visible = this.scopeBlend < 0.85;
    }

    this.cooldown = Math.max(0, this.cooldown - dt);

    // ── RELOAD IN PROGRESS: no shooting allowed ──────────────────────────
    if (this.reloading) {
      this.reloadTimer -= dt;
      const t = 1 - Math.max(0, this.reloadTimer) / Math.max(0.001, this.reloadDuration);
      this._animateReload(Math.max(0, Math.min(1, t)));
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        this.currentAmmo = def.magSize; // full mag after reload
        this.reloadTimer = 0;
        this._resetReloadPose();
      }
      // Swallow shoot edge so we don't fire the same frame reload ends
      this.wasShoot = wantShoot;
      return shots;
    }

    // ── START RELOAD (R, or click on empty) ──────────────────────────────
    // Allowed whenever at least 1 round has been spent (current < magSize),
    // including completely empty (0).
    if (wantReload && this.canReload()) {
      this._startReload();
      this.wasShoot = wantShoot;
      return shots;
    }

    // Clicking dry (0 ammo) also starts reload
    if (wantShoot && this.currentAmmo <= 0 && this.canReload()) {
      this._startReload();
      this.wasShoot = wantShoot;
      return shots;
    }

    // ── FIRE: exactly 1 ammo per shot ────────────────────────────────────
    // Semi-auto (pistol): buffered click queue + edge — never lose a click
    // Full-auto (M16): fire every tick while LMB held, until mag empty
    let triggerPulled = false;
    if (def.auto) {
      triggerPulled = wantShoot;
    } else {
      // Prefer explicit click buffer; also allow classic edge if buffer empty
      triggerPulled = shootClick || (wantShoot && !this.wasShoot);
    }
    if (switchedSlot) triggerPulled = false;
    const canFire =
      !this.reloading &&
      this.cooldown <= 0 &&
      this.currentAmmo > 0 &&
      triggerPulled;

    if (canFire) {
      this.currentAmmo = Math.max(0, Math.floor(this.currentAmmo) - 1);
      this.cooldown = 1 / Math.max(0.1, def.fireRate);
      // Only consume buffered click when the round actually left the barrel
      if (!def.auto) input.onSemiFire?.();

      // Phase A viewmodel juice — stronger punch / kick / recoil per shot
      const kick =
        def.id === 'm16' ? 0.58 : def.id === 'shotgun' ? 1.35 : def.id === 'pistol' ? 0.78 : 0.65;
      this.recoil = Math.min(1.85, this.recoil + kick);
      this.kickPitch += 0.032 + kick * 0.028;
      this.kickYaw += (Math.random() - 0.5) * 0.022 * kick;
      // Cap +Z punch so M16 stock stays beyond camera near plane (0.05)
      const punchZ = Math.min(0.12, 0.08 + kick * 0.05);
      this.punchPos.set(
        (Math.random() - 0.5) * 0.045,
        0.04 + kick * 0.035,
        punchZ
      );

      const slide = this.viewModel.getObjectByName('slide');
      if (slide) slide.position.z = -0.02;

      this.audio?.playShoot?.(def.id === 'm16' ? 'ar' : def.id);

      const origin = new THREE.Vector3();
      this.camera.getWorldPosition(origin);
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);

      const muzzle = this.muzzleLocal.clone();
      this.viewModel.localToWorld(muzzle);
      this.particles?.muzzleFlash?.(muzzle, dir);
      this.particles?.bulletCasings?.(muzzle, dir);

      // Keep bullets close to the crosshair — light hip spread, tighter ADS/scope
      const spreadMul = this.isScoped() ? 0.2 : this.adsHeld || this.adsBlend > 0.5 ? 0.4 : 0.85;
      const recoilSpread = 1 + this.recoil * 0.18;
      // Pellets are spread rays for one shell — still only 1 ammo used above
      const pellets = def.pellets || 1;
      for (let i = 0; i < pellets; i++) {
        const d = dir.clone();
        d.x += (Math.random() - 0.5) * def.spread * spreadMul * 2 * recoilSpread;
        d.y += (Math.random() - 0.5) * def.spread * spreadMul * 2 * recoilSpread;
        d.z += (Math.random() - 0.5) * def.spread * spreadMul * 2 * recoilSpread;
        d.normalize();
        shots.push({
          origin: origin.clone(),
          direction: d,
          damage: def.damage,
          weaponId: def.id,
          range: def.range,
        });
      }
    } else {
      const slide = this.viewModel?.getObjectByName('slide');
      if (slide) {
        slide.position.z = THREE.MathUtils.lerp(slide.position.z, -0.05, 1 - Math.pow(0.001, dt));
      }
    }

    this.wasShoot = wantShoot;
    return shots;
  }
}
