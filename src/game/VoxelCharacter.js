import * as THREE from 'three';
import { createCharMat } from './materials.js';
import { roundedBoxGeo } from './softGeo.js';

export const BOT_NAMES = [
  'LILAC',
  'BUTTER',
  'SHERBET',
  'TAFFY',
  'BUBBLEGUM',
  'SKY',
  'PEACH',
  'FROST',
  'MARS',
];

export const PASTEL_OUTFITS = [
  { body: 0xa8e6cf, accent: 0x7bc8a4, name: 'mint' },
  { body: 0xc5b4e3, accent: 0x9b84c7, name: 'purple' },
  { body: 0xffeaa7, accent: 0xf0d060, name: 'yellow' },
  { body: 0xffb6c1, accent: 0xff8fab, name: 'pink' },
  { body: 0xa0d2db, accent: 0x6bb6c4, name: 'sky' },
  { body: 0xffdab9, accent: 0xf0b890, name: 'peach' },
  { body: 0xe0bbe4, accent: 0xc89fd0, name: 'lilac' },
  { body: 0xb5ead7, accent: 0x8fd4be, name: 'seafoam' },
  { body: 0xffdac1, accent: 0xf0c0a0, name: 'cream' },
];

/** Shared character geo/mat pools (Option A Phase 4 perf). */
const _charMatCache = new Map();
const _charGeoCache = new Map();
const CHAR_SOFT_SEGS = 3;
const CHAR_TINY_SEGS = 2;

/** Modest corner radius — soft toy, still blocky pastel DNA. */
function softRadius(w, h, d) {
  const m = Math.min(w, h, d);
  return Math.min(0.11, m * 0.35);
}

function charMat(color, kind = 'body') {
  const key = `${kind}_${(color >>> 0).toString(16)}`;
  let m = _charMatCache.get(key);
  if (m) return m;
  if (kind === 'body') {
    m = createCharMat(color);
  } else {
    // Soft plastic vs darker metal for held toys
    const presets = {
      metal: { roughness: 0.32, metalness: 0.65 },
      darkMetal: { roughness: 0.42, metalness: 0.5 },
      grip: { roughness: 0.9, metalness: 0.02 },
      accent: { roughness: 0.55, metalness: 0.1 },
    };
    const p = presets[kind] || presets.accent;
    m = createCharMat(color);
    m.roughness = p.roughness;
    m.metalness = p.metalness;
  }
  m.userData.shared = true;
  _charMatCache.set(key, m);
  return m;
}

function charGeo(w, h, d, radius, segments = CHAR_SOFT_SEGS) {
  const r = radius ?? softRadius(w, h, d);
  const key = `${w.toFixed(3)}_${h.toFixed(3)}_${d.toFixed(3)}_r${r.toFixed(3)}_${segments}`;
  let g = _charGeoCache.get(key);
  if (!g) {
    g = roundedBoxGeo(w, h, d, r, segments);
    g.userData.shared = true;
    _charGeoCache.set(key, g);
  }
  return g;
}

function charSphereGeo(radius, widthSegments = 12, heightSegments = 8) {
  const key = `sphere_${radius.toFixed(3)}_${widthSegments}_${heightSegments}`;
  let g = _charGeoCache.get(key);
  if (!g) {
    g = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
    g.userData.shared = true;
    _charGeoCache.set(key, g);
  }
  return g;
}

function charCapsuleGeo(radius, length, capSegments = 4, radialSegments = 8) {
  const key = `capsule_${radius.toFixed(3)}_${length.toFixed(3)}_${capSegments}_${radialSegments}`;
  let g = _charGeoCache.get(key);
  if (!g) {
    g = new THREE.CapsuleGeometry(radius, length, capSegments, radialSegments);
    g.userData.shared = true;
    _charGeoCache.set(key, g);
  }
  return g;
}

function part(w, h, d, color, kind = 'body', radius) {
  const segments = Math.min(w, h, d) <= 0.12 ? CHAR_TINY_SEGS : CHAR_SOFT_SEGS;
  const m = new THREE.Mesh(charGeo(w, h, d, radius, segments), charMat(color, kind));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function spherePart(radius, color, kind = 'body') {
  const m = new THREE.Mesh(charSphereGeo(radius), charMat(color, kind));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function capsulePart(radius, length, color, kind = 'body') {
  const m = new THREE.Mesh(charCapsuleGeo(radius, length), charMat(color, kind));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function gunPart(w, h, d, color, kind = 'metal') {
  // Light soft on major gun blocks; tiny bits clamp via softRadius
  return part(w, h, d, color, kind);
}

function faceTexture() {
  if (typeof document === 'undefined') {
    // Node tests: solid skin color, no canvas
    const data = new Uint8Array([255, 218, 188, 255]);
    const tex = new THREE.DataTexture(data, 1, 1);
    tex.needsUpdate = true;
    return tex;
  }
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffdabc';
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#4a3f55';
  ctx.fillRect(3, 5, 3, 3);
  ctx.fillRect(10, 5, 3, 3);
  ctx.fillStyle = '#ff8fab';
  ctx.fillRect(6, 11, 4, 2);
  ctx.fillStyle = '#fff';
  ctx.fillRect(4, 6, 1, 1);
  ctx.fillRect(11, 6, 1, 1);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

export class VoxelCharacter {
  constructor({ name = 'BOT', outfitIndex = 0, isPlayer = false } = {}) {
    this.name = name;
    this.isPlayer = isPlayer;
    this.outfit = PASTEL_OUTFITS[outfitIndex % PASTEL_OUTFITS.length];
    this.mesh = new THREE.Group();
    this.mesh.name = name;
    this.animPhase = Math.random() * Math.PI * 2;
    this._healthPct = 1;
    this._nameCanvas = null;
    this._nameCtx = null;
    this._nameTex = null;
    this._build();
  }

  _build() {
    const o = this.outfit;
    const skin = 0xffdabc;

    // Dark silhouette outline shells — bots read against pastel map
    const outlineMat = new THREE.MeshBasicMaterial({
      color: 0x3a3048,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.35,
    });
    const addOutline = (w, h, d, parent, y = 0) => {
      const shell = new THREE.Mesh(charGeo(w * 1.12, h * 1.12, d * 1.12), outlineMat);
      shell.position.y = y;
      parent.add(shell);
      return shell;
    };

    // Hip root — keep y=0.95 (locomotion + hit anchors depend on this)
    this.hips = new THREE.Group();
    this.hips.position.y = 0.95;
    this.mesh.add(this.hips);

    // Torso: clearer waist→chest taper, soft rounded shoulders read
    this.torso = part(0.5, 0.58, 0.3, o.body);
    this.torso.position.y = 0.34;
    this.hips.add(this.torso);
    addOutline(0.5, 0.58, 0.3, this.hips, 0.34);
    // Chest plate / belt for silhouette read
    const chest = part(0.54, 0.18, 0.32, o.accent);
    chest.position.y = 0.48;
    this.hips.add(chest);
    const waist = part(0.46, 0.1, 0.28, 0x6a5a7a);
    waist.position.y = 0.08;
    this.hips.add(waist);

    // Accent stripe + collar
    const stripe = part(0.52, 0.1, 0.31, o.accent);
    stripe.position.y = 0.32;
    this.hips.add(stripe);
    const collar = part(0.42, 0.08, 0.3, 0xfffaf5);
    collar.position.y = 0.66;
    this.hips.add(collar);

    // Neck stub (breaks head-on-box look)
    const neck = part(0.16, 0.1, 0.16, skin);
    neck.position.y = 0.72;
    this.hips.add(neck);

    // Head — soft oval (wider/taller, flatter depth); center stays ~0.88 for hit spheres
    this.head = part(0.4, 0.42, 0.36, skin);
    this.head.position.y = 0.88;
    addOutline(0.4, 0.42, 0.36, this.hips, 0.88);
    // Ears / jaw hints
    const earL = part(0.08, 0.12, 0.08, skin);
    earL.position.set(-0.22, 0.0, 0.0);
    this.head.add(earL);
    const earR = part(0.08, 0.12, 0.08, skin);
    earR.position.set(0.22, 0.0, 0.0);
    this.head.add(earR);
    const jaw = part(0.3, 0.1, 0.2, 0xf0c8a8);
    jaw.position.set(0, -0.18, -0.08);
    this.head.add(jaw);
    // Face on front (character forward = -Z)
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.34),
      new THREE.MeshStandardMaterial({
        map: faceTexture(),
        roughness: 0.75,
        metalness: 0.05,
        name: 'bot_face',
      })
    );
    face.position.set(0, 0.02, -0.185);
    face.rotation.y = Math.PI;
    this.head.add(face);
    this.hips.add(this.head);

    // Helmet / hat
    this.hat = part(0.44, 0.16, 0.44, o.accent);
    this.hat.position.y = 1.12;
    this.hat.name = 'bot_hat';
    this.hips.add(this.hat);
    const brim = part(0.52, 0.05, 0.52, o.body);
    brim.position.y = 1.02;
    brim.name = 'bot_hat_brim';
    this.hips.add(brim);

    // Unique accessory per outfit
    const acc = new THREE.Group();
    acc.name = 'bot_accessory';
    const oi = outfitIndexSafe(this.outfit);
    if (oi % 3 === 0) {
      const scarf = part(0.5, 0.12, 0.36, o.accent);
      scarf.position.set(0, 0.62, -0.02);
      scarf.name = 'bot_scarf';
      acc.add(scarf);
      const scarfTail = part(0.1, 0.22, 0.08, o.accent);
      scarfTail.position.set(0.18, 0.48, -0.12);
      acc.add(scarfTail);
    } else if (oi % 3 === 1) {
      const gog = part(0.34, 0.09, 0.12, 0x4a3f55, 'darkMetal');
      gog.position.set(0, 1.08, -0.22);
      gog.name = 'bot_goggles';
      acc.add(gog);
      const lens = part(0.11, 0.07, 0.04, COLORS_SAFE_SKY(), 'accent');
      lens.position.set(-0.09, 1.08, -0.27);
      acc.add(lens);
      const lens2 = part(0.11, 0.07, 0.04, COLORS_SAFE_SKY(), 'accent');
      lens2.position.set(0.09, 1.08, -0.27);
      acc.add(lens2);
    } else {
      const pouch = part(0.14, 0.18, 0.11, o.body);
      pouch.position.set(0.3, 0.22, 0.04);
      pouch.name = 'bot_pouch';
      acc.add(pouch);
      const strap = part(0.06, 0.28, 0.04, o.accent);
      strap.position.set(0.28, 0.4, 0.02);
      acc.add(strap);
    }
    this.hips.add(acc);
    this.accessory = acc;

    // Soft shoulder pads + segmented arms (upper / forearm / hand)
    this.shoulderL = new THREE.Group();
    this.shoulderL.position.set(-0.38, 0.56, 0);
    this.hips.add(this.shoulderL);
    const padL = spherePart(0.13, o.accent);
    padL.position.set(0, 0.02, 0);
    this.shoulderL.add(padL);
    this.armL = capsulePart(0.085, 0.18, o.body);
    this.armL.position.y = -0.18;
    this.shoulderL.add(this.armL);
    const forearmL = capsulePart(0.07, 0.14, o.body);
    forearmL.position.y = -0.42;
    this.shoulderL.add(forearmL);
    const handL = spherePart(0.07, skin);
    handL.position.y = -0.56;
    this.shoulderL.add(handL);

    this.shoulderR = new THREE.Group();
    this.shoulderR.position.set(0.38, 0.56, 0);
    this.hips.add(this.shoulderR);
    const padR = spherePart(0.13, o.accent);
    padR.position.set(0, 0.02, 0);
    this.shoulderR.add(padR);
    this.armR = capsulePart(0.085, 0.18, o.body);
    this.armR.position.y = -0.18;
    this.shoulderR.add(this.armR);
    const forearmR = capsulePart(0.07, 0.14, o.body);
    forearmR.position.y = -0.42;
    this.shoulderR.add(forearmR);
    const handR = spherePart(0.07, skin);
    handR.position.y = -0.56;
    this.shoulderR.add(handR);

    // Held weapon group (tier updates via setHeldWeapon)
    this.heldWeapon = null;
    this._weaponIndex = -1;
    this.setHeldWeapon(0);

    // Legs: pivot at HIP height (y≈0.95) — thigh + shin segments
    this.hipL = new THREE.Group();
    this.hipL.position.set(-0.15, 0.95, 0);
    this.mesh.add(this.hipL);
    this.legL = capsulePart(0.1, 0.22, o.accent);
    this.legL.position.y = -0.16;
    this.hipL.add(this.legL);
    const shinL = capsulePart(0.087, 0.18, o.body);
    shinL.position.y = -0.42;
    this.hipL.add(shinL);
    this.footL = part(0.18, 0.1, 0.28, 0x6a5a7a);
    this.footL.position.set(0, -0.58, 0.06);
    this.hipL.add(this.footL);

    this.hipR = new THREE.Group();
    this.hipR.position.set(0.15, 0.95, 0);
    this.mesh.add(this.hipR);
    this.legR = capsulePart(0.1, 0.22, o.accent);
    this.legR.position.y = -0.16;
    this.hipR.add(this.legR);
    const shinR = capsulePart(0.087, 0.18, o.body);
    shinR.position.y = -0.42;
    this.hipR.add(shinR);
    this.footR = part(0.18, 0.1, 0.28, 0x6a5a7a);
    this.footR.position.set(0, -0.58, 0.06);
    this.hipR.add(this.footR);

    // Backpack accent (behind character; forward is -Z)
    const pack = part(0.32, 0.36, 0.12, o.accent);
    pack.position.set(0, 0.38, 0.2);
    pack.name = 'bot_backpack';
    this.hips.add(pack);
    const packLid = part(0.28, 0.06, 0.1, o.body);
    packLid.position.set(0, 0.58, 0.2);
    this.hips.add(packLid);

    // Silhouette outline shell on torso for range read (matches soft geo)
    const readShell = new THREE.Mesh(
      charGeo(0.58, 0.68, 0.38),
      new THREE.MeshBasicMaterial({
        color: 0x2a2435,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.28,
      })
    );
    readShell.name = 'bot_read_outline';
    readShell.position.y = 0.34;
    this.hips.add(readShell);

    // Floating nameplate + HP bar (keep readable height)
    this.nameSprite = this._makeNameplate(this.name);
    this.nameSprite.position.y = 2.45;
    this.mesh.add(this.nameSprite);
  }

  _makeNameplate(name) {
    if (typeof document === 'undefined') {
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xfff8e7, transparent: true, opacity: 0.9 }));
      spr.scale.set(2.1, 0.63, 1);
      return spr;
    }
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 96;
    this._nameCanvas = c;
    this._nameCtx = c.getContext('2d');
    this._nameTex = new THREE.CanvasTexture(c);
    this._nameTex.magFilter = THREE.LinearFilter;
    this._nameTex.minFilter = THREE.LinearFilter;
    this._drawNameplate(name, 1);
    const mat = new THREE.SpriteMaterial({
      map: this._nameTex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const spr = new THREE.Sprite(mat);
    spr.scale.set(2.1, 0.63, 1);
    spr.renderOrder = 10;
    return spr;
  }

  _drawNameplate(name, healthPct = 1) {
    const ctx = this._nameCtx;
    const c = this._nameCanvas;
    if (!ctx || !c) return;
    ctx.clearRect(0, 0, c.width, c.height);
    // Soft pill background
    ctx.fillStyle = 'rgba(255,248,231,0.94)';
    roundRect(ctx, 20, 8, 280, 52, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(74,63,85,0.55)';
    ctx.lineWidth = 4;
    roundRect(ctx, 20, 8, 280, 52, 16);
    ctx.stroke();
    // Accent edge from outfit
    const accentHex = '#' + this.outfit.body.toString(16).padStart(6, '0');
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 3;
    roundRect(ctx, 24, 12, 272, 44, 14);
    ctx.stroke();
    // Name
    ctx.fillStyle = '#4a3f55';
    ctx.font = 'bold 28px Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(name).toUpperCase(), 160, 34);
    // HP bar track
    const barX = 40;
    const barY = 68;
    const barW = 240;
    const barH = 14;
    ctx.fillStyle = 'rgba(74,63,85,0.35)';
    roundRect(ctx, barX, barY, barW, barH, 7);
    ctx.fill();
    const pct = Math.max(0, Math.min(1, healthPct));
    const fillW = barW * pct;
    if (fillW > 1) {
      const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      if (pct > 0.5) {
        grad.addColorStop(0, '#ff8fab');
        grad.addColorStop(1, '#a8e6cf');
      } else if (pct > 0.25) {
        grad.addColorStop(0, '#ffb347');
        grad.addColorStop(1, '#ffeaa7');
      } else {
        grad.addColorStop(0, '#ff6b6b');
        grad.addColorStop(1, '#ff8fab');
      }
      ctx.fillStyle = grad;
      roundRect(ctx, barX, barY, fillW, barH, 7);
      ctx.fill();
    }
    if (this._nameTex) this._nameTex.needsUpdate = true;
  }

  /** Update floating HP bar from current / max health */
  updateHealth(health, maxHealth = 100) {
    const pct = maxHealth > 0 ? Math.max(0, Math.min(1, health / maxHealth)) : 0;
    if (Math.abs(pct - this._healthPct) < 0.008) return;
    this._healthPct = pct;
    this._drawNameplate(this.name, pct);
  }

  /**
   * Readable held toy guns (tiered) — multi-part, matching FP silhouette language.
   * Character yaw uses camera convention (forward = -Z in local space after rotation).
   */
  setHeldWeapon(weaponIndex = 0) {
    const idx = Math.max(0, Math.min(4, weaponIndex | 0));
    if (idx === this._weaponIndex && this.heldWeapon) return;
    this._weaponIndex = idx;

    if (this.heldWeapon) {
      this.shoulderR.remove(this.heldWeapon);
      this.heldWeapon.traverse((c) => {
        if (c.geometry && !c.geometry.userData?.shared) c.geometry.dispose();
        if (c.material && !c.material.userData?.shared) c.material.dispose();
      });
      this.heldWeapon = null;
    }

    const g = new THREE.Group();
    g.name = 'heldWeapon';
    const accent = this.outfit.accent;
    const metal = 0x4a3f55;
    const dark = 0x3a3048;
    const gripC = 0xd4a574;
    const cream = 0xffeaa7;

    // Build gun pointing local -Z (world forward after bot yaw)
    if (idx === 0) {
      // Pistol — frame, slide, barrel, grip, mag
      g.add(gunPart(0.1, 0.11, 0.32, accent, 'accent'));
      const slide = gunPart(0.11, 0.07, 0.34, metal, 'metal');
      slide.position.set(0, 0.07, -0.02);
      g.add(slide);
      const barrel = gunPart(0.055, 0.055, 0.18, dark, 'darkMetal');
      barrel.position.set(0, 0.04, -0.28);
      g.add(barrel);
      const muzzle = gunPart(0.07, 0.07, 0.05, cream, 'accent');
      muzzle.position.set(0, 0.04, -0.4);
      g.add(muzzle);
      const grip = gunPart(0.09, 0.2, 0.11, gripC, 'grip');
      grip.position.set(0, -0.14, 0.06);
      g.add(grip);
      const mag = gunPart(0.07, 0.15, 0.09, dark, 'darkMetal');
      mag.position.set(0, -0.18, -0.02);
      mag.name = 'botMag';
      mag.userData.restY = -0.18;
      g.add(mag);
      const sight = gunPart(0.03, 0.04, 0.03, dark, 'darkMetal');
      sight.position.set(0, 0.12, -0.28);
      g.add(sight);
    } else if (idx === 1) {
      // SMG
      g.add(gunPart(0.1, 0.12, 0.4, accent, 'accent'));
      const b = gunPart(0.055, 0.055, 0.22, metal, 'metal');
      b.position.set(0, 0.02, -0.32);
      g.add(b);
      const tip = gunPart(0.045, 0.045, 0.1, dark, 'darkMetal');
      tip.position.set(0, 0.02, -0.46);
      g.add(tip);
      const grip = gunPart(0.08, 0.16, 0.1, gripC, 'grip');
      grip.position.set(0, -0.12, 0.04);
      g.add(grip);
      const mag = gunPart(0.07, 0.18, 0.1, dark, 'darkMetal');
      mag.position.set(0, -0.16, 0);
      mag.name = 'botMag';
      mag.userData.restY = -0.16;
      g.add(mag);
      const stock = gunPart(0.07, 0.08, 0.16, accent, 'accent');
      stock.position.set(0, 0.0, 0.22);
      g.add(stock);
    } else if (idx === 2) {
      // Shotgun
      g.add(gunPart(0.11, 0.12, 0.48, accent, 'accent'));
      const b = gunPart(0.07, 0.07, 0.28, metal, 'metal');
      b.position.set(0, 0.01, -0.38);
      g.add(b);
      const pump = gunPart(0.09, 0.08, 0.16, gripC, 'grip');
      pump.position.set(0, -0.02, -0.2);
      g.add(pump);
      const stock = gunPart(0.1, 0.11, 0.22, gripC, 'grip');
      stock.position.set(0, -0.02, 0.28);
      g.add(stock);
      const mag = gunPart(0.07, 0.08, 0.12, dark, 'darkMetal');
      mag.position.set(0, -0.1, -0.02);
      mag.name = 'botMag';
      mag.userData.restY = -0.1;
      g.add(mag);
    } else if (idx === 3) {
      // Assault / M16-like — rails, stock, mag detail
      g.add(gunPart(0.1, 0.1, 0.42, accent, 'accent'));
      const lower = gunPart(0.1, 0.08, 0.36, 0x5a6a5a, 'accent');
      lower.position.set(0, -0.04, -0.02);
      g.add(lower);
      const hg = gunPart(0.09, 0.08, 0.22, 0x4a5548, 'darkMetal');
      hg.position.set(0, 0.02, -0.28);
      g.add(hg);
      const rail = gunPart(0.08, 0.03, 0.2, metal, 'metal');
      rail.position.set(0, 0.08, -0.26);
      g.add(rail);
      const b = gunPart(0.045, 0.045, 0.28, dark, 'darkMetal');
      b.position.set(0, 0.02, -0.48);
      g.add(b);
      const muzzle = gunPart(0.06, 0.06, 0.06, metal, 'metal');
      muzzle.position.set(0, 0.02, -0.64);
      g.add(muzzle);
      const fs = gunPart(0.03, 0.08, 0.03, dark, 'darkMetal');
      fs.position.set(0, 0.08, -0.5);
      g.add(fs);
      const grip = gunPart(0.08, 0.16, 0.1, gripC, 'grip');
      grip.position.set(0, -0.12, 0.08);
      g.add(grip);
      const mag = gunPart(0.07, 0.2, 0.1, dark, 'darkMetal');
      mag.position.set(0, -0.16, -0.04);
      mag.name = 'botMag';
      mag.userData.restY = -0.16;
      g.add(mag);
      const stock = gunPart(0.08, 0.09, 0.2, accent, 'accent');
      stock.position.set(0, 0.0, 0.28);
      g.add(stock);
      const butt = gunPart(0.1, 0.12, 0.05, cream, 'accent');
      butt.position.set(0, 0.0, 0.4);
      g.add(butt);
    } else {
      // Sniper
      g.add(gunPart(0.1, 0.1, 0.55, accent, 'accent'));
      const b = gunPart(0.045, 0.045, 0.4, 0x4a5a6a, 'darkMetal');
      b.position.set(0, 0.02, -0.48);
      g.add(b);
      const scope = gunPart(0.07, 0.07, 0.28, 0x2a3a4a, 'metal');
      scope.position.set(0, 0.12, -0.08);
      g.add(scope);
      const grip = gunPart(0.08, 0.14, 0.09, gripC, 'grip');
      grip.position.set(0, -0.1, 0.06);
      g.add(grip);
      const mag = gunPart(0.06, 0.12, 0.08, dark, 'darkMetal');
      mag.position.set(0, -0.12, -0.02);
      mag.name = 'botMag';
      mag.userData.restY = -0.12;
      g.add(mag);
      const stock = gunPart(0.09, 0.1, 0.22, gripC, 'grip');
      stock.position.set(0, -0.02, 0.32);
      g.add(stock);
    }

    // Sit in right hand — points local -Z (character forward after yaw)
    g.position.set(0.06, -0.5, -0.18);
    g.rotation.set(Math.PI / 2 - 0.15, 0, 0.05);
    g.scale.setScalar(1.2);
    this.heldWeapon = g;
    this.shoulderR.add(g);
    this._heldWeaponRestRot = g.rotation.clone();
  }

  /** Aim pose: right arm points gun forward while attacking */
  setAiming(aiming) {
    this._aiming = !!aiming;
  }

  /**
   * Call when the bot fires a shot — snappy arm kick + flash pose (readable in TPP).
   */
  triggerFire() {
    this._fireKick = 1;
    // Snap aim so the gun is up the frame they shoot (no invisible hip-fire)
    this._aimBlend = 1;
  }

  /** World-space muzzle for VFX (falls back to chest if no gun). */
  getMuzzleWorldPosition() {
    if (this.heldWeapon) {
      const v = new THREE.Vector3(0, 0.02, -0.48);
      this.heldWeapon.localToWorld(v);
      return v;
    }
    return this.getChestWorldPosition();
  }

  /** Brief reload pose: gun dips, mag wiggle */
  setReloading(reloading, t = 0) {
    this._reloading = !!reloading;
    this._reloadT = t;
    if (!this.heldWeapon) return;
    const mag = this.heldWeapon.getObjectByName('botMag');
    const restY = mag?.userData?.restY ?? -0.18;
    if (reloading) {
      if (mag) mag.position.y = restY - Math.sin(t * Math.PI) * 0.2;
      this.heldWeapon.rotation.x = (this._heldWeaponRestRot?.x ?? 1.4) + Math.sin(t * Math.PI) * 0.35;
    } else {
      if (this._heldWeaponRestRot) {
        this.heldWeapon.rotation.copy(this._heldWeaponRestRot);
      }
      if (mag) mag.position.y = restY;
    }
  }

  /**
   * AAA-style toy locomotion (Luckey-like):
   * - Legs ALWAYS cycle when moveSpeed > threshold (including while aiming/strafing)
   * - Hip joints pivot at hips, not feet
   * - Phase driven by distance traveled when moveSpeed provided
   */
  updateAnimation(dt, state = {}) {
    const {
      moving = false,
      sprinting = false,
      grounded = true,
      dead = false,
      aiming = false,
      reloading = false,
      reloadT = 0,
      /** m/s actual horizontal speed — preferred over boolean moving */
      moveSpeed = null,
    } = state;
    if (dead) {
      this.mesh.rotation.x = Math.min(this.mesh.rotation.x + dt * 3, Math.PI / 2);
      this.hipL.rotation.set(0.2, 0, 0.15);
      this.hipR.rotation.set(-0.15, 0, -0.1);
      return;
    }
    this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, 0, 1 - Math.pow(0.001, dt));

    if (this._aimBlend == null) this._aimBlend = 0;
    if (this._moveBlend == null) this._moveBlend = 0;
    if (this._fireKick == null) this._fireKick = 0;
    // Decay fire recoil kick
    this._fireKick = Math.max(0, this._fireKick - dt * 8);

    const aimTarget = aiming && !reloading ? 1 : 0;
    // Fast snap into aim (readable TPP combat) — was too slow → looked like idle hip-fire
    const aimLerp = aimTarget > this._aimBlend ? 1 - Math.pow(0.00002, dt) : 1 - Math.pow(0.001, dt);
    this._aimBlend = THREE.MathUtils.lerp(this._aimBlend, aimTarget, aimLerp);
    if (aiming && !reloading) this._aimBlend = Math.max(this._aimBlend, 0.55);

    // An explicit speed is authoritative: collision-blocked bots must not run in place.
    // Retain the boolean fallback only for older callers without a speed measurement.
    const hasActualSpeed = Number.isFinite(moveSpeed);
    const spd = hasActualSpeed ? Math.max(0, moveSpeed) : moving ? (sprinting ? 5.2 : 3.6) : 0;
    const locoTarget = grounded && spd > 0.35 ? Math.min(1, spd / 5.5) : 0;
    this._moveBlend = THREE.MathUtils.lerp(this._moveBlend, locoTarget, 1 - Math.pow(0.0002, dt));
    const loco = this._moveBlend;

    // Cadence: ~steps proportional to meters (snappy pastel run)
    const phaseRate = sprinting || spd > 4.5 ? 13.5 : 10.5;
    if (loco > 0.08 && grounded) {
      this.animPhase += dt * phaseRate * (0.55 + loco * 0.9);
    } else {
      this.animPhase += dt * 1.6; // subtle idle breathe
    }

    const swing = Math.sin(this.animPhase);
    const swing2 = Math.sin(this.animPhase * 2);
    // Strong leg amp while moving — only slightly reduced when aiming (still visible footwork)
    const legAmp = (sprinting || spd > 4.5 ? 1.05 : 0.78) * (1 - this._aimBlend * 0.22);
    const walkLeg = swing * legAmp * loco;
    const idleLeg = Math.sin(this.animPhase * 0.45) * 0.06 * (1 - loco);

    this.hipL.rotation.x = walkLeg + idleLeg;
    this.hipR.rotation.x = -walkLeg - idleLeg;
    // Slight outward knee-ish twist + foot plant pitch
    this.hipL.rotation.z = loco * 0.06;
    this.hipR.rotation.z = -loco * 0.06;
    if (this.footL) {
      this.footL.rotation.x = Math.max(0, -swing) * 0.45 * loco;
      this.footL.position.z = 0.06 + Math.max(0, swing) * 0.04 * loco;
    }
    if (this.footR) {
      this.footR.rotation.x = Math.max(0, swing) * 0.45 * loco;
      this.footR.position.z = 0.06 + Math.max(0, -swing) * 0.04 * loco;
    }

    // Torso counter-rotate + lean into run (readable AAA silhouette)
    this.hips.rotation.y = -swing * 0.12 * loco;
    this.hips.rotation.x = -0.04 * loco * (sprinting ? 1.4 : 1) - this._aimBlend * 0.05;
    this.hips.rotation.z = swing * 0.05 * loco;

    if (reloading) {
      const t = reloadT;
      this.shoulderR.rotation.x = -0.35 + Math.sin(t * Math.PI) * 0.85;
      this.shoulderR.rotation.z = 0.2 + Math.sin(t * Math.PI) * 0.4;
      this.shoulderR.rotation.y = 0;
      this.shoulderL.rotation.x = -0.55 - Math.sin(t * Math.PI) * 0.45;
      this.shoulderL.rotation.z = -0.15;
      this.shoulderL.rotation.y = 0;
      this.setReloading(true, t);
    } else {
      // Arms: full opposite swing when not aiming; reduced swing while aiming (gun stays up)
      const armSwing = swing * (sprinting || spd > 4.5 ? 0.95 : 0.7) * loco;
      const idleRx = armSwing * 0.55 - 0.15;
      const idleLx = -armSwing * 0.95 - 0.05;
      // Stronger raised aim — gun clearly on target from third person
      const kick = this._fireKick || 0;
      const aimRx = -1.55 - kick * 0.35; // kick up on fire
      const aimRz = 0.28;
      const aimRy = -0.12;
      const aimLx = -1.35;
      const aimLz = -0.4;
      const aimLy = 0.18;
      const b = this._aimBlend;
      const aimSway = swing * 0.06 * loco * (1 - kick);
      this.shoulderR.rotation.x = THREE.MathUtils.lerp(idleRx, aimRx + aimSway, b);
      this.shoulderR.rotation.z = THREE.MathUtils.lerp(0.08, aimRz, b);
      this.shoulderR.rotation.y = THREE.MathUtils.lerp(0, aimRy, b);
      this.shoulderL.rotation.x = THREE.MathUtils.lerp(idleLx, aimLx - aimSway, b);
      this.shoulderL.rotation.z = THREE.MathUtils.lerp(0, aimLz, b);
      this.shoulderL.rotation.y = THREE.MathUtils.lerp(0, aimLy, b);
      this.setReloading(false);
      if (this.heldWeapon && this._heldWeaponRestRot) {
        this.heldWeapon.rotation.x = this._heldWeaponRestRot.x - b * 0.15 + kick * 0.25;
        this.heldWeapon.rotation.y = this._heldWeaponRestRot.y;
        this.heldWeapon.rotation.z = this._heldWeaponRestRot.z;
        // Slight push back on fire
        this.heldWeapon.position.z = -0.18 - kick * 0.08;
      }
    }

    // Vertical bob + hip settle
    const bob = loco > 0.1 ? Math.abs(swing2) * (0.045 + (sprinting ? 0.025 : 0)) : Math.sin(this.animPhase) * 0.012;
    this.hips.position.y = 0.95 + bob;
    // Keep leg roots locked to hip height as torso bobs slightly via hips only

    if (!grounded) {
      this.hipL.rotation.x = THREE.MathUtils.lerp(this.hipL.rotation.x, -0.55, 0.4);
      this.hipR.rotation.x = THREE.MathUtils.lerp(this.hipR.rotation.x, 0.35, 0.4);
      if (!aiming && !reloading) {
        this.shoulderL.rotation.x = -0.7;
        this.shoulderR.rotation.x = 0.45;
      }
    }
  }

  setVisible(v) {
    this.mesh.visible = v;
  }

  getHeadWorldPosition() {
    const v = new THREE.Vector3(0, 0.88, 0);
    this.hips.localToWorld(v);
    return v;
  }

  getChestWorldPosition() {
    const v = new THREE.Vector3(0, 0.35, 0);
    this.hips.localToWorld(v);
    return v;
  }

  getFeetPosition() {
    return this.mesh.position.clone();
  }

  /** Local point → world (tracks animated limbs). */
  _wp(obj, x, y, z) {
    const v = new THREE.Vector3(x, y, z);
    obj.localToWorld(v);
    return v;
  }

  /**
   * Hitscan volumes for the full voxel silhouette (head, torso, arms, legs, feet).
   * Uses live bone transforms so aimed/running poses still register.
   * @returns {Array<{ kind:'sphere'|'capsule', radius:number, headshot?:boolean, center?:THREE.Vector3, a?:THREE.Vector3, b?:THREE.Vector3 }>}
   */
  getHitVolumes() {
    const head = this.getHeadWorldPosition();
    const chest = this.getChestWorldPosition();
    const pelvis = this._wp(this.hips, 0, 0.05, 0);

    const volumes = [
      { kind: 'sphere', center: head, radius: 0.24, headshot: true },
      { kind: 'sphere', center: chest, radius: 0.3, headshot: false },
      { kind: 'sphere', center: pelvis, radius: 0.27, headshot: false },
      { kind: 'capsule', a: pelvis, b: head, radius: 0.28, headshot: false },
    ];

    // Arms: shoulder pad → hand (animated with shoulderL/R)
    if (this.shoulderL) {
      volumes.push({
        kind: 'capsule',
        a: this._wp(this.shoulderL, 0, 0.02, 0),
        b: this._wp(this.shoulderL, 0, -0.56, 0),
        radius: 0.13,
        headshot: false,
      });
    }
    if (this.shoulderR) {
      volumes.push({
        kind: 'capsule',
        a: this._wp(this.shoulderR, 0, 0.02, 0),
        b: this._wp(this.shoulderR, 0, -0.56, 0),
        radius: 0.13,
        headshot: false,
      });
    }

    // Legs + feet (hipL/R animate with run cycle)
    for (const hip of [this.hipL, this.hipR]) {
      if (!hip) continue;
      const thigh = this._wp(hip, 0, -0.16, 0);
      const shin = this._wp(hip, 0, -0.42, 0);
      const ankle = this._wp(hip, 0, -0.58, 0.02);
      const toe = this._wp(hip, 0, -0.58, 0.16);
      volumes.push(
        { kind: 'capsule', a: hip.getWorldPosition(new THREE.Vector3()), b: shin, radius: 0.14, headshot: false },
        { kind: 'capsule', a: shin, b: ankle, radius: 0.13, headshot: false },
        { kind: 'sphere', center: ankle, radius: 0.14, headshot: false },
        { kind: 'sphere', center: toe, radius: 0.13, headshot: false },
        { kind: 'sphere', center: thigh, radius: 0.15, headshot: false }
      );
    }

    return volumes;
  }

  dispose() {
    this.mesh.traverse((c) => {
      if (c.geometry && !c.geometry.userData?.shared) c.geometry.dispose();
      if (c.material && !c.material.userData?.shared) {
        if (c.material.map) c.material.map.dispose();
        c.material.dispose();
      }
    });
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function outfitIndexSafe(outfit) {
  const i = PASTEL_OUTFITS.findIndex((o) => o.name === outfit?.name);
  return i >= 0 ? i : 0;
}

function COLORS_SAFE_SKY() {
  return 0x7ec8e8;
}
