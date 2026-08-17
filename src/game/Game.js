/* CRITIC PASS:
 * 1) Map beauty — curbs/crosswalks, grass patches, house doors/porches/window frames,
 *    detailed bus+truck, parented crate bands, picket caps, emissive lamps, mailboxes,
 *    billboards, hydrant, deterministic bushes.
 * 2) Bot readability — silhouette outlines, held guns, larger nameplates with live HP bars.
 * 3) Weapon feel — idle sway, walk bob, viewmodel punch, reload dip/roll, aim kick via pitch/yaw.
 * 4) Lighting — soft shadows, warmer exposure, gentler fog, stronger hemi/fill balance.
 * 5) HUD polish — kill goal X/20, pastel crosshair gap, low-ammo pulse, stronger weapon banner.
 * PASS2: house interior furniture (tables/chairs/sofa/bed); kill feed+donut always on bot death;
 *        passive HP regen 2/s after 4s; hold-Tab mini scoreboard; bot held-weapon tier visuals;
 *        fix bot donut double-collect spam.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Player } from './Player.js';
import { WeaponController, WEAPONS } from './Weapons.js';
import { BotManager } from './BotAI.js';
import { DonutManager } from './Donuts.js';
import { MedkitManager } from './Medkits.js';
import { DoorManager } from './Doors.js';
import { ParticleSystem } from './Particles.js';
import { GameAudio } from './Audio.js';
import { GameUI } from './UI.js';
import { GFX } from './materials.js';
import { getSettings, getGraphicsPreset, setGraphicsPreset, patchSettings, applyToGame } from '../settings/Settings.js';
import { isTouchPlay, isTouchPortrait, shouldShowRotateHint } from '../input/detectPlayMode.js';
import { TouchControls } from '../input/TouchControls.js';
import { GyroLook } from '../input/GyroLook.js';
import { MenuCamera } from './MenuCamera.js';
import {
  playerMoveBlocked,
  playerPositionBlocked,
  rayBlockedBySolids,
} from './collision.js';
import { PhysicsManager } from '../physics/PhysicsManager.js';
import {
  createMatchFlow,
  beginCountdown,
  tickCountdown,
  endMatch,
  isCombatLive,
  isCountdown,
} from './matchFlow.js';
import {
  BOT_COUNT,
  RESPAWN_TIME,
  DONUT_FUN_POINTS,
  PLAYER_HEIGHT,
  HEAD_HIT_RADIUS,
  VIEWMODEL_LAYER,
} from './constants.js';
import { pickVolumeHit, rayHitsSphere } from './hitscan.js';
import { OnlineSession } from '../net/OnlineSession.js';
import { MpMatch } from '../net/MpMatch.js';
import { getModeById } from '../modes/registry.js';
import { flagsToNet } from '../modes/ctf.js';
import { DEFAULT_MAP_ID, getMap, readStoredMapId, writeStoredMapId } from '../maps/index.js';
import {
  BOT_DIFFICULTY_IDS,
  getBotDifficulty,
  readStoredBotDifficulty,
  setBotDifficulty,
  writeStoredBotDifficulty,
} from './BotDifficulty.js';
import { brZoneFromMap, zoneRadiusAt, isOutsideZone } from '../modes/pubg.js';
import { FlagManager } from './Flags.js';
import { ZoneRing } from './Zone.js';

/** Spawn validation is stricter than a single-point overlap check: the player
 * must have several clear escape directions before combat starts. */
const PLAYER_SPAWN_ESCAPE_DISTANCE = 2.2;
const PLAYER_SPAWN_DIRECTION_COUNT = 16;
const PLAYER_SPAWN_MIN_OPEN_DIRECTIONS = 6;
const PLAYER_SPAWN_MIN_BOT_GAP = 4;

/** Soft pastel color grade + vignette (no midtone lift — that washed outdoor into white). */
const PastelGradeShader = {
  name: 'PastelGradeShader',
  uniforms: {
    tDiffuse: { value: null },
    // Phase 2: slightly deeper vignette for outdoor depth (still no midtone lift)
    vignette: { value: 0.26 },
    // Neutral sat — boost >1 pushed already-bright pastels into clip with bloom
    satBoost: { value: 1.0 },
    lift: { value: new THREE.Vector3(0.0, 0.0, 0.0) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float vignette;
    uniform float satBoost;
    uniform vec3 lift;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float g = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(g), c.rgb, satBoost);
      c.rgb += lift;
      // Soft knee only on hot highlights (keeps midtones; avoids outdoor white-clip)
      float hot = smoothstep(0.72, 1.15, g);
      c.rgb = mix(c.rgb, c.rgb / (c.rgb + vec3(0.45)) * 1.15, hot);
      float d = distance(vUv, vec2(0.5));
      float vig = smoothstep(0.85, 0.25, d * (0.55 + vignette));
      c.rgb *= vig;
      gl_FragColor = c;
    }
  `,
};

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.running = false;
    this.paused = false;
    this.matchOver = false;
    this.clock = new THREE.Clock();
    this.respawnTimer = 0;
    this.lastKiller = '—';
    this.footstepTimer = 0;
    this.spawnGuard = 0;
    /** Decaying camera kick on hit (pitch/yaw impulse applied each frame). */
    this.hitPunch = { pitch: 0, yaw: 0 };
    /** Phase D match fantasy: idle → countdown → live → over */
    this.matchFlow = createMatchFlow();
    /** Phase 2a/2b: OnlineSession (lobby WS + WebRTC). Alias `lan` for older call sites. */
    this.mp = null;
    this.lan = null;
    /** Phase 2a: host-authoritative match sim (null offline). */
    this.mpMatch = null;
    /** Seconds to skip harsh MP soft-correct after a tab wake. */
    this._mpWakeGrace = 0;
    this._mpActive = false;
    this._mpNickname = 'Player';
    /** Phase 2c: active match mode (offline PLAY stays deathmatch). */
    this.matchMode = getModeById('deathmatch');
    /** CTF flag meshes (null unless a CTF network match is live). */
    this.flags = null;
    /** BR safe-zone ring (null unless a Battle Royale match is live). */
    this.zoneRing = null;

    this.ui = new GameUI();
    this.audio = new GameAudio();
    /** Phase 1a/1b: Rapier physics world, created async via `initPhysics()` (see main.js). Null = legacy AABB fallback. */
    this.physics = null;

    this._perf = false;
    try {
      const q = typeof location !== 'undefined' ? location.search : '';
      this._perf =
        /(?:^|[?&])perf=1(?:&|$)/.test(q) ||
        (typeof localStorage !== 'undefined' && localStorage.getItem('sberg-perf') === '1');
    } catch {
      this._perf = false;
    }
    this._perfAcc = 0;
    this._perfFrames = 0;
    this._gfx = null;
    this._botAgents = [];
    this._playerPosScratch = new THREE.Vector3();

    this._initRenderer();
    this._initScene();
    this.mapId = null;
    this.mapData = null;
    this.doors = null;
    this.loadMap(readStoredMapId(), { persist: false });
    this.particles = new ParticleSystem(this.scene);
    this._syncMapSnow();

    this.player = new Player(this.camera, this.mapData);
    this.touchPlay = isTouchPlay();
    this.player._touchPlay = this.touchPlay;
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('touch-play', this.touchPlay);
    }
    this.player.bindInput(canvas);
    this.gyro = new GyroLook();
    this.player.gyroLook = this.gyro;
    this.touch = new TouchControls({
      player: this.player,
      root: typeof document !== 'undefined' ? document.getElementById('touch-controls') : null,
      rotate: typeof document !== 'undefined' ? document.getElementById('rotate-hint') : null,
      onPause: () => this.pause(),
      onUnlock: () => {
        this.audio.unlock();
        this._syncGyroLook();
      },
    });
    this._bindWeaponBannerSwap();
    this._syncTouchChrome();

    this.weapons = new WeaponController(this.camera, this.scene, this.audio, this.particles);
    this.menuCam = new MenuCamera(this.camera, {
      center: new THREE.Vector3(0, 0, 2),
      radius: 30,
      height: 10.5,
      lookY: 2.6,
      yawSpeed: 0.07,
      fov: 52,
      playFov: 75,
    });
    this.donuts = new DonutManager(this.scene, this.audio, this.particles, (pts) => {
      this.player.funPoints += pts;
      this.ui.showPickupToast();
      this.ui.updateStats(this.player, this._hudMatch());
    });
    this.medkits = new MedkitManager(this.scene);

    this.bots = new BotManager(this.scene, this.mapData, {
      doors: this.doors,
      getPlayerPosition: () =>
        this.player.alive ? this._playerPosScratch.copy(this.player.position) : null,
      getPlayerAlive: () =>
        this.player.alive &&
        this.running &&
        !this.matchOver &&
        this.spawnGuard <= 0 &&
        isCombatLive(this.matchFlow),
      getPlayerKills: () => this.player.kills,
      getPlayerHealth: () => this.player.health,
      getDonuts: () => this.donuts.getPositions(),
      onBotDeath: (bot, pos, info) => this._onBotDeath(bot, pos, info),
      onBotShoot: (shot) => this._onBotShoot(shot),
      onBotReload: (bot) => {
        this.audio.playReload?.();
        // Vulnerability callout — reload is a window to push
        if (bot?.name) this.ui.showBotToast?.(`${bot.name} is reloading!`);
      },
      onBotCollectDonut: (bot, pos) => this._botCollectDonut(bot, pos),
    });

    this._bindUI();
    this._bindPointerLockClick();
    this._applyBotDifficulty(readStoredBotDifficulty(), { persist: false });
    this.ui.showStart();
    this._enterMenu();
    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    window.visualViewport?.addEventListener('resize', this._onResize);
    this._resize();

    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  /**
   * Phase 1a/1b: boot Rapier + build the static physics world from the current map.
   * Awaited once from `main.js` right after construction. Safe to skip/fail —
   * `Player.js` falls back to its legacy AABB mover when `this.physics` is null.
   */
  async initPhysics() {
    await PhysicsManager.initRapier();
    this.physics = new PhysicsManager();
    this.physics.setMapFromMapData(this.mapData);
    // Mirror door open/close onto the Rapier collider (Doors.js reads this lazily).
    this.doors.onSolidChange = (collider, solid) => this.physics.setColliderSolid(collider, solid);
    this.player.setPhysics(this.physics);
    this.bots.setPhysics(this.physics);
  }

  /**
   * Swap the live map pack. Default id is nuketown. If a pack `build()` throws,
   * keep the previous map (Foundry builders are written; catch is a safety net).
   * @param {string} id
   * @param {{ persist?: boolean }} [opts]
   */
  loadMap(id, opts = {}) {
    const persist = opts.persist !== false;
    if (this.running) return this.mapData;

    const pack = getMap(id);
    if (pack.id === this.mapId && this.mapData) {
      if (persist) writeStoredMapId(this.mapId);
      this._syncMapToggle();
      return this.mapData;
    }

    let next;
    try {
      next = pack.build(this.scene);
    } catch (err) {
      console.warn(`[maps] ${pack.id} failed to build, keeping ${this.mapId || DEFAULT_MAP_ID}`, err);
      this._syncMapToggle();
      if (!this.mapData && pack.id !== DEFAULT_MAP_ID) {
        return this.loadMap(DEFAULT_MAP_ID, { persist: false });
      }
      return this.mapData;
    }

    if (this.mapData?.group && this.mapData.group !== next.group) {
      this.mapData.dispose?.();
      this.scene.remove(this.mapData.group);
    }

    this.mapData = next;
    this.mapId = pack.id;
    this.doors = new DoorManager(this.mapData.doors || []);
    if (this.physics) {
      this.physics.setMapFromMapData(this.mapData);
      this.doors.onSolidChange = (collider, solid) => this.physics.setColliderSolid(collider, solid);
    }
    if (this.player) {
      this.player.mapData = this.mapData;
      this.player.mapBounds = this.mapData.bounds ?? 38;
    }
    if (this.bots) {
      this.bots.mapData = this.mapData;
      if (this.bots.cb) this.bots.cb.doors = this.doors;
    }
    this._applyMapFog(this.mapData);
    this._applyMapPresentation(this.mapData);
    this._syncMapSnow();
    if (persist) writeStoredMapId(this.mapId);
    this._syncMapToggle();
    return this.mapData;
  }

  /** Falling snow is outdoor-only. Indoor maps set `mapData.snow === false`. */
  _syncMapSnow() {
    if (!this.particles) return;
    this.particles.setSnowEnabled(this.mapData?.snow !== false);
  }

  /**
   * Scale camera far, sky dome, menu orbit, and sun shadow to the live map wall.
   * Nuketown wall 40; Candy Foundry wall 80 — far=180 clips the far hangar wall.
   * @param {import('../maps/IMap.js').MapData} mapData
   */
  _applyMapPresentation(mapData) {
    const wall = Number.isFinite(mapData?.wall) ? mapData.wall : 40;
    const large = wall >= 70;
    if (this.camera) {
      this.camera.far = Math.max(180, wall * 3.2 + 40);
      this.camera.updateProjectionMatrix();
    }
    if (this._skyMesh) {
      const r = Math.max(130, wall * 2.2);
      this._skyMesh.scale.setScalar(r / 130);
    }
    if (this.menuCam) {
      if (large) {
        this.menuCam.configure({
          radius: 52,
          height: 12,
          lookY: 3.4,
          center: new THREE.Vector3(0, 0, 0),
        });
      } else {
        this.menuCam.configure({
          radius: 30,
          height: 10.5,
          lookY: 2.6,
          center: new THREE.Vector3(0, 0, 2),
        });
      }
    }
    if (this.sun?.shadow?.camera) {
      const s = large ? 110 : 56;
      const cam = this.sun.shadow.camera;
      cam.left = -s;
      cam.right = s;
      cam.top = s;
      cam.bottom = -s;
      cam.far = large ? 280 : 150;
      cam.updateProjectionMatrix();
      this.sun.position.set(large ? 70 : 42, large ? 48 : 30, large ? 36 : 20);
    }
  }

  /** @param {import('../maps/IMap.js').MapData} mapData */
  _applyMapFog(mapData) {
    const fog = mapData?.fog;
    if (fog) {
      const color = fog.color ?? GFX.fogColor ?? 0xdcb0c4;
      this.scene.fog = new THREE.Fog(color, fog.near ?? GFX.fogNear ?? 52, fog.far ?? GFX.fogFar ?? 122);
      this.scene.background = new THREE.Color(color);
    } else {
      this.scene.fog = new THREE.Fog(
        GFX.fogColor ?? 0xdcb0c4,
        GFX.fogNear ?? 52,
        GFX.fogFar ?? 122
      );
      this.scene.background = new THREE.Color(GFX.fogColor ?? 0xdcb0c4);
    }
  }

  _syncMapToggle() {
    const id = this.mapId || DEFAULT_MAP_ID;
    const nuke = document.getElementById('btn-map-nuketown');
    const foundry = document.getElementById('btn-map-foundry');
    nuke?.classList.toggle('is-on', id === 'nuketown');
    foundry?.classList.toggle('is-on', id === 'candy-foundry');
    nuke?.setAttribute('aria-pressed', id === 'nuketown' ? 'true' : 'false');
    foundry?.setAttribute('aria-pressed', id === 'candy-foundry' ? 'true' : 'false');
  }

  /**
   * @param {string} id
   * @param {{ persist?: boolean }} [opts]
   */
  _applyBotDifficulty(id, opts = {}) {
    const snap = setBotDifficulty(id);
    if (opts.persist !== false) writeStoredBotDifficulty(snap.id);
    this._syncDiffToggle();
    return snap;
  }

  _syncDiffToggle() {
    const current = getBotDifficulty().id;
    for (const id of BOT_DIFFICULTY_IDS) {
      const btn = document.getElementById(`btn-diff-${id}`);
      const on = id === current;
      btn?.classList.toggle('is-on', on);
      btn?.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  /** Cinematic idle over the live map (start / after match return). */
  _enterMenu() {
    this.menuCam?.start();
    if (this.weapons?.viewModel) this.weapons.viewModel.visible = false;
    this._syncTouchChrome();
  }

  _leaveMenu() {
    this.menuCam?.stop();
    if (this.weapons?.viewModel) this.weapons.viewModel.visible = true;
    this._syncTouchChrome();
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      // Composer + FXAA handle AA; MSAA backbuffer is wasted on RT path
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    const preset = getGraphicsPreset();
    const prCap = preset.pixelRatioCap ?? GFX.maxPixelRatio;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, prCap));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = GFX.toneMappingExposure;
    // Better shadow filtering on supporting GPUs
    if (this.renderer.capabilities?.isWebGL2) {
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    this.composer = null;
    this.fxaaPass = null;
    this._bloomPass = null;
    this._postEnabled = true;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    // Phase 2: match fog so skybox gaps / clear color don't flash brighter than haze
    this.scene.background = new THREE.Color(GFX.fogColor ?? 0xdcb0c4);
    this.scene.fog = new THREE.Fog(
      GFX.fogColor ?? 0xdcb0c4,
      GFX.fogNear ?? 52,
      GFX.fogFar ?? 122
    );
    const skyGeo = new THREE.SphereGeometry(130, 48, 28);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        // Phase 2 richer dome — mid luminance so UnrealBloom does not glow the sky
        topColor: { value: new THREE.Color(GFX.skyTop ?? 0x7e70c4) },
        horizonColor: { value: new THREE.Color(GFX.skyHorizon ?? 0xffc8b4) },
        bottomColor: { value: new THREE.Color(GFX.skyBottom ?? 0xe8a090) },
        glowColor: { value: new THREE.Color(GFX.skyGlow ?? 0xffd8c0) },
        cloudColor: { value: new THREE.Color(GFX.skyCloud ?? 0xf0e0f0) },
        offset: { value: 10 },
        exponent: { value: 0.55 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPosition;
        varying vec3 vDir;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        uniform vec3 glowColor;
        uniform vec3 cloudColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        varying vec3 vDir;

        // Tiny hash — soft cloud suggestion only (no bright white blobs)
        float hash21(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float softNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }

        void main() {
          vec3 dir = normalize(vWorldPosition + vec3(0.0, offset, 0.0));
          float h = dir.y;
          float t = max(pow(max(h, 0.0), exponent), 0.0);

          // Two-band gradient: ground wash → warm horizon → cooler zenith
          vec3 col = mix(bottomColor, horizonColor, smoothstep(-0.15, 0.22, h));
          col = mix(col, topColor, t);

          // Soft horizon glow ring (warm, mid-bright — stays under bloom threshold)
          float horizonBand = exp(-pow((h - 0.06) / 0.18, 2.0) * 2.2);
          col = mix(col, glowColor, horizonBand * 0.38);

          // Soft cloud suggestion in upper sky only (desaturated pastel, low contrast)
          float skyMask = smoothstep(0.12, 0.55, h);
          vec2 cloudUv = vDir.xz * 2.4 + vec2(vDir.y * 0.35, 0.0);
          float n = softNoise(cloudUv * 1.6);
          n += 0.5 * softNoise(cloudUv * 3.3 + 7.1);
          n *= 0.66;
          float clouds = smoothstep(0.52, 0.78, n) * skyMask * 0.22;
          col = mix(col, cloudColor, clouds);

          // Keep sky under bloom: slight soft-knee on hot zenith/horizon mix
          float luma = dot(col, vec3(0.299, 0.587, 0.114));
          col *= mix(1.0, 0.92, smoothstep(0.78, 1.05, luma));

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    skyMesh.name = 'sky_golden_hour';
    this._skyMesh = skyMesh;
    this.scene.add(skyMesh);

    // near=0.02 lets the FP stock sit against the camera without eating the grip
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.02, 180);
    this.camera.position.set(0, PLAYER_HEIGHT, 10);
    // CRITICAL: camera must live in the scene graph. FPS viewmodels are
    // parented to the camera; if the camera is not in the scene they never draw.
    this.scene.add(this.camera);

    // Phase 2: leaner fill stack so directional soft shadows read (no albedo wash)
    const hemi = new THREE.HemisphereLight(
      GFX.hemiSky ?? 0xffe8f0,
      GFX.hemiGround ?? 0x6ed4a8,
      GFX.hemiIntensity ?? 0.46
    );
    hemi.name = 'hemi_key';
    this.scene.add(hemi);

    const ambient = new THREE.AmbientLight(0xfff2e8, GFX.ambientIntensity ?? 0.11);
    ambient.name = 'ambient_fill';
    this.scene.add(ambient);

    this.sun = new THREE.DirectionalLight(GFX.sunColor ?? 0xffe2c4, GFX.sunIntensity ?? 0.98);
    this.sun.name = 'sun_key';
    // Slightly lower sun = longer golden-hour soft shadows across the yard
    this.sun.position.set(42, 30, 20);
    const gfx0 = getGraphicsPreset();
    this.sun.castShadow = !!gfx0.shadowsEnabled;
    const sm = gfx0.shadowMapSize || GFX.shadowMapSize;
    this.sun.shadow.mapSize.set(sm, sm);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 150;
    this.sun.shadow.camera.left = -56;
    this.sun.shadow.camera.right = 56;
    this.sun.shadow.camera.top = 56;
    this.sun.shadow.camera.bottom = -56;
    this.sun.shadow.bias = GFX.shadowBias ?? -0.00042;
    this.sun.shadow.normalBias = GFX.shadowNormalBias ?? 0.034;
    this.sun.shadow.radius = GFX.shadowRadius ?? 5.0;
    this.sun.shadow.intensity = GFX.shadowIntensity ?? 1.0;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    const fill = new THREE.DirectionalLight(GFX.fillColor ?? 0xd4b4f0, GFX.fillIntensity ?? 0.2);
    fill.name = 'fill_lilac';
    fill.position.set(-18, 16, -12);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(GFX.rimColor ?? 0xff9eb8, GFX.rimIntensity ?? 0.15);
    rim.name = 'rim_pink';
    rim.position.set(0, 10, -24);
    this.scene.add(rim);

    const bounce = new THREE.DirectionalLight(0x7ee8b8, GFX.bounceIntensity ?? 0.055);
    bounce.name = 'bounce_mint';
    bounce.position.set(0, -8, 0);
    this.scene.add(bounce);

    this.scene.traverse((obj) => {
      if (obj.isLight) obj.layers.enable(VIEWMODEL_LAYER);
    });

    this._initPostProcess();
  }

  /** Bloom + pastel color grade + FXAA. Safe no-op if composer fails. */
  _initPostProcess() {
    try {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Avoid double tone-mapping: OutputPass applies ACES; renderer stays neutral for RT path
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.composer = new EffectComposer(this.renderer);
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(w, h),
        GFX.bloomStrength,
        GFX.bloomRadius,
        GFX.bloomThreshold
      );
      bloom.name = 'UnrealBloomPass';
      // Only bright emissives/muzzles — not full-scene pastel wash
      bloom.threshold = GFX.bloomThreshold;
      bloom.strength = GFX.bloomStrength;
      bloom.radius = GFX.bloomRadius;
      this.composer.addPass(bloom);
      this._bloomPass = bloom;
      this._syncBloomResolution(w, h);
      const grade = new ShaderPass(PastelGradeShader);
      grade.name = 'PastelGradePass';
      this.composer.addPass(grade);
      const output = new OutputPass();
      // OutputPass uses renderer.toneMapping — set ACES just for output
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = GFX.toneMappingExposure;
      this.composer.addPass(output);
      // FXAA MUST run after OutputPass (LDR / sRGB) — three.js FXAA example order
      const fxaa = new FXAAPass();
      fxaa.name = 'FXAAPass';
      this.fxaaPass = fxaa;
      this.composer.addPass(fxaa);
      this._syncFxaaResolution(w, h);
      this._postEnabled = true;
    } catch (err) {
      console.warn('Post-process init failed, falling back to direct render', err);
      this.composer = null;
      this.fxaaPass = null;
      this._postEnabled = false;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = GFX.toneMappingExposure;
    }
  }

  /** Keep FXAA resolution uniform in sync with CSS size × pixel ratio. */
  _syncFxaaResolution(cssW, cssH) {
    if (!this.fxaaPass) return;
    const pr = this.renderer.getPixelRatio();
    this.fxaaPass.setSize(cssW * pr, cssH * pr);
  }

  /** Bloom backing-store scale comes from the active device preset. */
  _syncBloomResolution(cssW, cssH) {
    if (!this._bloomPass?.setSize) return;
    const pr = this.renderer.getPixelRatio();
    const scale = this._gfx?.bloomResolutionScale ?? getGraphicsPreset().bloomResolutionScale ?? 0.5;
    this._bloomPass.setSize(Math.max(1, cssW * pr * scale), Math.max(1, cssH * pr * scale));
  }

  /**
   * Apply a resolved quality row (from getGraphicsPreset). Low actually turns
   * shadows + composer off; Ultra is the expensive path for this device.
   */
  applyGraphicsQuality(preset = getGraphicsPreset()) {
    if (!preset || !this.renderer) return;
    this._gfx = preset;
    if (this.bots) this.bots.cpuTier = preset.cpuTier ?? 2;

    const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
    this.renderer.setPixelRatio(Math.min(dpr, preset.pixelRatioCap ?? 1));

    const shadowsOn = !!preset.shadowsEnabled;
    this.renderer.shadowMap.enabled = shadowsOn;
    const type = preset.shadowType;
    if (type === 'basic') this.renderer.shadowMap.type = THREE.BasicShadowMap;
    else if (type === 'pcf') this.renderer.shadowMap.type = THREE.PCFShadowMap;
    else this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const sun = this.sun;
    if (sun) {
      sun.castShadow = shadowsOn;
      const sm = Math.max(256, preset.shadowMapSize || 1024);
      if (sun.shadow?.mapSize) {
        if (sun.shadow.mapSize.x !== sm || sun.shadow.mapSize.y !== sm) {
          sun.shadow.mapSize.set(sm, sm);
          if (sun.shadow.map) {
            sun.shadow.map.dispose();
            sun.shadow.map = null;
          }
        }
      }
    }

    this._postEnabled = !!preset.postEnabled && !!this.composer;
    if (this._bloomPass) {
      if (typeof this.__baseBloomStrength !== 'number') {
        this.__baseBloomStrength = this._bloomPass.strength;
      }
      this._bloomPass.enabled = !!preset.bloomEnabled && this._postEnabled;
      this._bloomPass.strength = this.__baseBloomStrength * (preset.bloomStrengthScale ?? 1);
    }
    if (this.fxaaPass) this.fxaaPass.enabled = !!preset.fxaaEnabled && this._postEnabled;

    if (this.particles && 'particleDensity' in this.particles) {
      this.particles.particleDensity = preset.particles ?? 1;
    }
    this.__aoEnabled = !!preset.aoEnabled;

    this._resize();
  }

  _bindUI() {
    document.getElementById('btn-play')?.addEventListener('click', () => this.startMatch());
    document.getElementById('btn-map-nuketown')?.addEventListener('click', () => {
      this.audio.playUI();
      this.loadMap('nuketown');
    });
    document.getElementById('btn-map-foundry')?.addEventListener('click', () => {
      this.audio.playUI();
      this.loadMap('candy-foundry');
    });
    this._syncMapToggle();
    for (const id of BOT_DIFFICULTY_IDS) {
      document.getElementById(`btn-diff-${id}`)?.addEventListener('click', () => {
        this.audio.playUI();
        this._applyBotDifficulty(id);
      });
    }
    document.getElementById('btn-resume')?.addEventListener('click', () => this.resume());
    document.getElementById('btn-restart')?.addEventListener('click', () => {
      if (this.mpMatch || this._mpActive) {
        this.resume();
        return;
      }
      this.startMatch();
    });
    document.getElementById('btn-menu-pause')?.addEventListener('click', () => this.returnToMainMenu());
    document.getElementById('btn-rematch')?.addEventListener('click', () => {
      if (this.mpMatch || this._mpActive) {
        this.cancelMultiplayer();
        return;
      }
      this.startMatch();
    });
    document.getElementById('btn-host')?.addEventListener('click', () => this.hostMultiplayer());
    document.getElementById('btn-search')?.addEventListener('click', () => this.openJoinPanel());
    document.getElementById('btn-join-go')?.addEventListener('click', () => this.joinMultiplayer());
    document.getElementById('btn-join-back')?.addEventListener('click', () => this.cancelMultiplayer());
    document.getElementById('btn-lobby-start')?.addEventListener('click', () => this.lobbyHostStart());
    document.getElementById('btn-lobby-leave')?.addEventListener('click', () => this.cancelMultiplayer());
    document.getElementById('join-code-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.joinMultiplayer();
    });
    document.getElementById('lobby-mode-select')?.addEventListener('change', (e) => {
      const modeId = e.target?.value || 'deathmatch';
      if (!this.lan?.isHost) return;
      try {
        if (typeof this.lan.setMode === 'function') this.lan.setMode(modeId);
      } catch (err) {
        this.ui.setLobbyError(err?.message || String(err));
      }
    });

    const openSettings = () => {
      this.audio.playUI();
      this.ui.showSettings();
      this._syncTouchChrome();
    };
    document.getElementById('btn-settings-start')?.addEventListener('click', openSettings);
    document.getElementById('btn-settings-corner')?.addEventListener('click', openSettings);
    document.getElementById('btn-settings-pause')?.addEventListener('click', openSettings);
    document.getElementById('btn-settings-back')?.addEventListener('click', () => {
      this.ui.hideSettings();
      this._syncTouchChrome();
    });

    const howBtn = document.getElementById('btn-how');
    const howPanel = document.getElementById('start-how');
    howBtn?.addEventListener('click', () => {
      const open = howPanel?.classList.toggle('hidden') === false;
      howBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    this._bindSettingsControls();

    document.addEventListener('pointerlockchange', () => {
      if (this.touchPlay) return;
      if (!document.pointerLockElement && this.running && !this.matchOver && this.player.alive) {
        if (isCountdown(this.matchFlow)) return;
        // Multiplayer: tab-switching steals pointer lock constantly. Pausing the host
        // freezes snapshots/sim and makes dual-window tests feel like a "position reset".
        if (this.mpMatch) return;
        this.pause();
      }
    });

    // After a background tab wakes, drop the accumulated clock gap so physics doesn't hitch.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // Release held keys so a background guest doesn't keep strafing on the host sim.
        this.player?.keys?.clear?.();
        this.player.buttons.left = false;
        this.player.buttons.right = false;
        this.touch?.reset?.();
        return;
      }
      this.clock.getDelta();
      this._mpWakeGrace = 0.75;
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.ui.isSettingsOpen?.()) {
        this.ui.hideSettings();
        this._syncTouchChrome();
        e.preventDefault();
        return;
      }
      const t = e.target;
      if (
        t instanceof Element &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      ) {
        return;
      }
      if (e.code === 'Escape' && this.running && !this.matchOver) {
        if (this.paused) this.resume();
        else this.pause();
      }
      // Hold Tab for mid-match mini scoreboard
      if (e.code === 'Tab' && this.running && !this.matchOver && !this.paused && isCombatLive(this.matchFlow)) {
        e.preventDefault();
        if (!this._tabScoreboard) {
          this._tabScoreboard = true;
          this.ui.showMiniScoreboard(this._scoreboardEntries(), true, this._hudMatch());
        }
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        this._tabScoreboard = false;
        this.ui.showMiniScoreboard(null, false);
      }
    });
  }

  _resetMpSession() {
    try {
      this.mpMatch?.dispose();
    } catch (_) {}
    this.mpMatch = null;
    this._disposeFlags();
    this._disposeZone();
    try {
      this.mp?.disconnect();
    } catch (_) {}
    this.mp = null;
    this.lan = null;
  }

  _disposeFlags() {
    try {
      this.flags?.dispose();
    } catch (_) {}
    this.flags = null;
  }

  _disposeZone() {
    try {
      this.zoneRing?.dispose();
    } catch (_) {}
    this.zoneRing = null;
  }

  /** Phase 2b: lobby signaling + WebRTC datachannel to host. */
  _ensureMpSession() {
    if (this.mp) return this.mp;
    this.mp = new OnlineSession({
      onRoom: (room) => this._onLanRoom(room),
      onCountdown: (msg) => this._onLanCountdown(msg),
      onMatchStart: (msg) => this._onLanMatchStart(msg),
      onHostLeft: (msg) => this._onLanHostLeft(msg),
      onPeerMessage: (msg, fromId) => this.mpMatch?.onMessage(msg, fromId),
      onPeerOpen: (peerId) => {
        if (this.mpMatch && this.running) {
          try {
            this.mp.sendGame?.({
              t: 'hello',
              id: this.mp.playerId,
              name: this._mpNickname,
            });
          } catch (_) {}
        }
        if (!this._mpActive || this.running) return;
        const n = this.mp?.getPeerReadyCount?.() || 0;
        if (n > 0 && this.lan?.room) {
          this.ui.updateLobby({
            status: this.lan.isHost
              ? `P2P ready (${n}) — press Start when ready`
              : 'Connected to host (P2P) — waiting to start…',
            isHost: this.lan.isHost,
            players: this.lan.room.players,
            code: this.lan.room.code,
            modeId: this.lan.room.modeId,
          });
        }
      },
      onError: (err) => {
        if (this.ui.els.join && !this.ui.els.join.classList.contains('hidden')) {
          this.ui.setJoinError(err);
        } else {
          this.ui.setLobbyError(err);
        }
      },
      onClose: () => {
        if (this._mpActive && !this.running) {
          this.ui.setLobbyError('Disconnected from host');
        }
      },
    });
    this.lan = this.mp;
    return this.mp;
  }

  _onMpEvent(msg) {
    if (!msg || !this._mpActive) return;
    const localId = this.mp?.playerId;

    if (msg.kind === 'hit') {
      if (msg.attackerId === localId) {
        this.ui.showHitmarker?.(!!msg.headshot);
        this.ui.showDamageNumber?.(msg.damage || 0, !!msg.headshot);
        if (msg.headshot) {
          this.ui.showHeadshot?.();
          this.audio.playHeadshot?.();
        } else {
          this.audio.playHit?.();
        }
      }
      if (msg.victimId === localId) {
        this.audio.playHurt?.();
        const punch = msg.headshot ? 0.014 : 0.008;
        this.hitPunch.pitch += punch;
        const atk = this.mpMatch?.pawns?.get(msg.attackerId);
        this._notifyPlayerHit({
          fromX: atk?.position?.x,
          fromZ: atk?.position?.z,
          damage: msg.damage,
          omnidirectional: msg.attackerId === 'zone' || !!msg.extra?.zone || !atk,
        });
      }
      return;
    }

    if (msg.kind === 'kill') {
      const killer = this.mpMatch?.pawns?.get(msg.attackerId);
      const victim = this.mpMatch?.pawns?.get(msg.victimId);
      const zoneKill = msg.attackerId === 'zone' || !!msg.extra?.zone;
      const killerName = zoneKill
        ? 'THE ZONE'
        : killer?.name || (msg.attackerId === localId ? 'YOU' : 'Player');
      const victimName = victim?.name || (msg.victimId === localId ? 'YOU' : 'Player');
      this.ui.addKillFeed?.(
        killerName,
        victimName,
        'mp',
        !!msg.headshot,
        msg.victimId === localId
      );
      if (msg.victimId === localId) {
        this.player.alive = false;
        const eliminated = this.matchMode?.allowRespawn === false;
        this.respawnTimer = eliminated ? 0 : 3;
        this.ui.showDeath?.(killerName, this.respawnTimer, { eliminated });
        document.exitPointerLock?.();
        this.audio.playDeath?.();
      }
      if (msg.attackerId === localId) {
        this.audio.playKill?.();
        if (!msg.headshot) this.ui.showKillConfirm?.();
      }
      return;
    }

    if (msg.kind === 'respawn') {
      if (msg.victimId === localId) {
        const x = msg.extra?.x;
        const y = msg.extra?.y;
        const z = msg.extra?.z;
        const spawn =
          x != null
            ? new THREE.Vector3(x, y, z)
            : this._playerSpawn();
        this.player.reset(spawn);
        this.weapons.currentAmmo = this.weapons.getCurrent().magSize;
        this.weapons.reloading = false;
        this.spawnGuard = 2;
        this.ui.hideDeath?.();
        this._requestPointerLock();
      }
      return;
    }

    if (msg.kind === 'door') {
      const doorId = msg.doorId || msg.extra?.doorId;
      const open = msg.open ?? msg.extra?.open;
      if (doorId != null && open != null) {
        this.doors.setOpen(doorId, !!open);
        this.audio.playDonutPickup?.();
      }
      return;
    }

    if (msg.kind === 'flag_pickup' || msg.kind === 'flag_drop' || msg.kind === 'flag_return' || msg.kind === 'flag_capture') {
      const pid = msg.attackerId || msg.extra?.playerId;
      const pawn = this.mpMatch?.pawns?.get(pid);
      const name = pid === localId ? 'YOU' : pawn?.name || 'Player';
      const team = String(msg.extra?.team || '').toUpperCase();
      if (msg.kind === 'flag_capture') {
        this.ui.showMatchCallout('CAPTURE!', { fight: true });
        this._fightHideTimer = 1.15;
        this.ui.addStatusFeed?.(`${name} captured for ${team}`);
        this.audio.playKill?.();
      } else if (msg.kind === 'flag_pickup') {
        this.ui.addStatusFeed?.(`${name} took the ${team} flag`);
        this.audio.playDonutPickup?.();
      } else if (msg.kind === 'flag_return') {
        this.ui.addStatusFeed?.(`${name} returned the ${team} flag`);
        this.audio.playHit?.();
      }
      return;
    }

    if (msg.kind === 'match_end') {
      const extra = msg.extra || {};
      const localPawn = this.mpMatch?.pawns?.get(localId);
      const won = extra.winnerTeam
        ? localPawn?.team === extra.winnerTeam
        : msg.winnerId === localId;
      this._endMatch(won, extra);
    }
  }

  _onLanHostLeft(_msg) {
    if (!this._mpActive) return;
    if (this.running) {
      this._endMatchForHostLeft();
      return;
    }
    this._mpActive = false;
    this._resetMpSession();
    this.ui.hideJoin();
    this.ui.hideLobby();
    this.ui.showStart();
    this.ui.showHostLeft?.('Host left — match ended');
    setTimeout(() => this.ui.hideMatchCallout?.(), 2200);
    this._enterMenu();
  }

  _endMatchForHostLeft() {
    this.matchOver = true;
    this.running = false;
    this._mpActive = false;
    this.matchFlow = endMatch(this.matchFlow || createMatchFlow());
    this._tabScoreboard = false;
    this.ui.showMiniScoreboard(null, false);
    document.exitPointerLock?.();
    this._resetMpSession();
    this.ui.hideVictory?.();
    this.ui.showStart();
    this.ui.showHostLeft?.('Host left — match ended');
    setTimeout(() => this.ui.hideMatchCallout?.(), 2200);
    this._enterMenu();
  }

  _lobbyStatusText(room) {
    if (!room) return '';
    if (room.phase === 'countdown') {
      return `Starting in ${Math.ceil(room.countdown)}…`;
    }
    if (room.phase === 'live') return 'Match in progress';
    return this.lan?.isHost ? 'Share the code — press Start when ready' : 'Waiting for host to start…';
  }

  _onLanRoom(room) {
    if (!room || !this._mpActive) return;
    // Never yank the lobby over a live match (WS room broadcasts still arrive mid-game).
    if (this.running) return;
    this.ui.showLobby({
      code: room.code,
      modeId: room.modeId,
      players: room.players,
      isHost: this.lan?.isHost,
      status: this._lobbyStatusText(room),
    });
  }

  _onLanCountdown(msg) {
    if (!this._mpActive) return;
    const n = Math.ceil(msg.countdown || 0);
    if (msg.phase === 'countdown' && n > 0) {
      this.ui.updateLobby({
        status: `Starting in ${n}…`,
        isHost: this.lan?.isHost,
        players: this.lan?.room?.players,
        code: this.lan?.room?.code,
        modeId: this.lan?.room?.modeId,
      });
      // Mirror big callout while still in lobby overlay
      this.ui.showMatchCallout(String(n));
      this.audio.playCountdownTick?.();
    }
  }

  _onLanMatchStart(msg) {
    if (!this._mpActive) return;
    const late = !!msg.late;
    this.startNetworkMatch({ late });
  }

  async hostMultiplayer() {
    this.audio.unlock();
    this.audio.playUI();
    this._mpActive = true;
    this._mpNickname = 'Host';
    this.ui.setLobbyError('');
    const modeSelect = document.getElementById('lobby-mode-select');
    const modeId = modeSelect?.value || 'deathmatch';
    // Show lobby immediately so a slow/failing WS connect isn't silent
    this.ui.showLobby({
      code: '…',
      modeId,
      players: [{ id: 'local', name: 'Host', isHost: true }],
      isHost: true,
      status: 'Connecting to online hub (may take ~30s if waking)…',
    });
    try {
      this._resetMpSession();
      const mp = this._ensureMpSession();
      await mp.host({ name: this._mpNickname, modeId });
      this.ui.updateLobby({
        status: 'Share the invite code — friends join on the same website',
        isHost: true,
        modeId,
      });
    } catch (err) {
      this._mpActive = false;
      this._resetMpSession();
      this.ui.hideLobby();
      this.ui.showStart();
      const msg = err?.message || String(err);
      console.warn('[mp] host failed', err);
      window.alert(msg);
    }
  }

  openJoinPanel() {
    this.audio.unlock();
    this.audio.playUI();
    this.ui.showJoin();
  }

  async joinMultiplayer() {
    this.audio.unlock();
    this.audio.playUI();
    const code = document.getElementById('join-code-input')?.value || '';
    const name = document.getElementById('join-name-input')?.value?.trim() || 'Guest';
    const hostAddr = document.getElementById('join-host-input')?.value?.trim() || '';
    if (!code.trim()) {
      this.ui.setJoinError('Enter an invite code');
      return;
    }
    this._mpActive = true;
    this._mpNickname = name;
    this.ui.setJoinError('Connecting…');
    try {
      this._resetMpSession();
      const mp = this._ensureMpSession();
      await mp.join({
        code,
        name,
        hostAddress: hostAddr || undefined,
      });
      // onRoom / match_start will open lobby or jump into match; WebRTC offer follows
      this.ui.hideJoin();
      this.ui.showLobby({
        code: code.toUpperCase(),
        players: [],
        isHost: false,
        status: hostAddr ? 'Joining (online / NAT)…' : 'Joining…',
      });
    } catch (err) {
      this._mpActive = false;
      this._resetMpSession();
      this.ui.setJoinError(err?.message || String(err));
    }
  }

  lobbyHostStart() {
    if (!this.lan?.isHost) return;
    this.audio.playUI();
    try {
      this.lan.start(10);
    } catch (err) {
      this.ui.setLobbyError(err?.message || String(err));
    }
  }

  cancelMultiplayer() {
    this.audio.playUI();
    this._mpActive = false;
    this._resetMpSession();
    this.ui.hideJoin();
    this.ui.hideLobby();
    this.ui.hideMatchCallout();
    this.ui.showStart();
    this._enterMenu();
  }

  /**
   * Phase 2a: lobby countdown done → networked match (host owns combat; remotes via WebRTC).
   */
  startNetworkMatch({ late = false } = {}) {
    this.audio.unlock();
    this.ui.hideLobby();
    this.ui.hideJoin();
    this._leaveMenu();
    this.matchMode = getModeById(this.lan?.room?.modeId || 'deathmatch');
    this.matchOver = false;
    this.paused = false;
    this.running = true;
    this.donuts.clear();
    this.medkits.spawnDefault(this.mapData?.medkitSpots);
    this.bots.clear();
    this._disposeFlags();
    this._disposeZone();

    try {
      this.mpMatch?.dispose();
    } catch (_) {}
    this.mpMatch = null;

    const localId = this.mp?.playerId || 'local';
    const isHost = !!this.mp?.isHost;
    this.mpMatch = new MpMatch({
      session: this.mp,
      isHost,
      localId,
      localName: this._mpNickname || 'Player',
      mapData: this.mapData,
      physics: this.physics,
      getLocalPlayer: () => this.player,
      getWeapons: () => this.weapons,
      getDoors: () => this.doors,
      getFlags: () => this.flags,
      getZone: () => this.zoneRing,
      onEvent: (ev) => this._onMpEvent(ev),
      mode: this.matchMode,
    });
    this.mpMatch.attachScene(this.scene);
    if (this.matchMode?.id === 'pubg') {
      this.zoneRing = new ZoneRing(this.scene);
    }
    this.mpMatch.begin(this.lan?.room || { players: [] }, this.mapData?.spawnPoints);
    if (this.matchMode?.id === 'ctf') {
      this.flags = new FlagManager(this.scene);
      this.flags.spawn(this.mapData?.flagHomes);
      if (this.mpMatch.ctf) this.flags.applyNet(flagsToNet(this.mpMatch.ctf));
    }
    if (this.zoneRing) {
      this.zoneRing.setRadius(this.mpMatch.zone?.r ?? zoneRadiusAt(0, brZoneFromMap(this.mapData)));
    }

    const localPawn = this.mpMatch.pawns.get(localId);
    const spawn = localPawn
      ? localPawn.position.clone()
      : this._playerSpawn();
    this.player.fullMatchReset(spawn);
    this.player.clearFireLatches();
    if (localPawn) {
      localPawn.yaw = this.player.yaw;
      localPawn.pitch = this.player.pitch;
    }
    this.weapons.resetAll();
    this.ui.hideVictory();
    this.ui.hideDeath();
    this.ui.showPause(false);
    this.ui.showHUD();
    this.ui.updateStats(this.player, this._hudMatch());
    this.ui.updateWeapon(this.weapons.getCurrent(), this.weapons.slot, this.weapons.getAmmo());
    this._updateScopeUI();
    document.getElementById('interact-prompt')?.classList.add('hidden');

    try {
      this.mp?.sendGame?.({
        t: 'hello',
        id: localId,
        name: this._mpNickname,
      });
    } catch (_) {}

    if (late) {
      this.matchFlow = beginCountdown(createMatchFlow(), 1);
      this.matchFlow = tickCountdown(this.matchFlow, 1);
      this.ui.hideMatchCallout();
      this.spawnGuard = 1.5;
    } else {
      this.matchFlow = beginCountdown(createMatchFlow(), 1);
      this.ui.showMatchCallout('FIGHT!', { fight: true });
      this.audio.playFightGo?.();
      this._fightHideTimer = 1.1;
      this.spawnGuard = 1.5;
    }

    this._tabScoreboard = false;
    this.ui.showMiniScoreboard(null, false);
    this._requestPointerLock();
    this._syncTouchChrome();
    this.clock.getDelta();
  }

  _bindSettingsControls() {
    const pct = (n) => String(Math.round(Number(n) * 100));
    const fillFromStore = () => {
      const s = getSettings();
      const mouse = document.getElementById('sens-mouse');
      const ads = document.getElementById('sens-ads');
      const invert = document.getElementById('sens-invert-y');
      const touch = document.getElementById('sens-touch');
      const gyroMode = document.getElementById('gyro-mode');
      const gyroSens = document.getElementById('sens-gyro');
      const vol = document.getElementById('volume-slider');
      const mute = document.getElementById('mute-toggle');
      const blood = document.getElementById('blood-toggle');
      const gfx = document.getElementById('graphics-preset-select');
      if (mouse) mouse.value = pct(s.mouseSens);
      if (ads) ads.value = pct(s.adsSens);
      if (invert) invert.checked = !!s.invertY;
      if (touch) touch.value = pct(s.touchSens);
      if (gyroMode) gyroMode.value = s.gyroMode;
      if (gyroSens) gyroSens.value = pct(s.gyroSens);
      if (vol) vol.value = pct(s.volume);
      if (mute) mute.checked = !!s.muted;
      if (blood) blood.checked = s.blood !== false;
      if (gfx) gfx.value = s.graphicsPreset;
      const gfxHint = document.getElementById('graphics-preset-hint');
      if (gfxHint) {
        const q = getGraphicsPreset();
        const device = q.device === 'phone' ? 'Phone' : q.device === 'tablet' ? 'Tablet' : 'Desktop';
        const shadow = q.shadowsEnabled ? `shadows ${q.shadowMapSize}` : 'no shadows';
        const glow = q.bloomEnabled ? 'bloom on' : q.postEnabled ? 'FXAA only' : 'no glow';
        gfxHint.textContent = `${device} · ${shadow} · ${glow}`;
      }
      const mouseVal = document.getElementById('sens-mouse-val');
      const adsVal = document.getElementById('sens-ads-val');
      const touchVal = document.getElementById('sens-touch-val');
      const gyroVal = document.getElementById('sens-gyro-val');
      const volVal = document.getElementById('volume-val');
      if (mouseVal) mouseVal.textContent = pct(s.mouseSens);
      if (adsVal) adsVal.textContent = pct(s.adsSens);
      if (touchVal) touchVal.textContent = pct(s.touchSens);
      if (gyroVal) gyroVal.textContent = pct(s.gyroSens);
      if (volVal) volVal.textContent = pct(s.volume);
    };

    fillFromStore();
    try {
      applyToGame(this);
    } catch (_) {}

    const onSens = () => {
      const mouseEl = document.getElementById('sens-mouse');
      const adsEl = document.getElementById('sens-ads');
      const invertEl = document.getElementById('sens-invert-y');
      const touchEl = document.getElementById('sens-touch');
      const gyroModeEl = document.getElementById('gyro-mode');
      const gyroSensEl = document.getElementById('sens-gyro');
      patchSettings({
        mouseSens: Number(mouseEl?.value || 100) / 100,
        adsSens: Number(adsEl?.value || 100) / 100,
        invertY: !!invertEl?.checked,
        touchSens: Number(touchEl?.value || 100) / 100,
        gyroMode: gyroModeEl?.value || 'off',
        gyroSens: Number(gyroSensEl?.value || 100) / 100,
      });
      fillFromStore();
      this._syncGyroLook();
    };
    document.getElementById('sens-mouse')?.addEventListener('input', onSens);
    document.getElementById('sens-ads')?.addEventListener('input', onSens);
    document.getElementById('sens-invert-y')?.addEventListener('change', onSens);
    document.getElementById('sens-touch')?.addEventListener('input', onSens);
    document.getElementById('gyro-mode')?.addEventListener('change', onSens);
    document.getElementById('sens-gyro')?.addEventListener('input', onSens);

    document.getElementById('volume-slider')?.addEventListener('input', (e) => {
      const v = Number(e.target.value) / 100;
      this.audio.unlock();
      patchSettings({ volume: v, muted: false });
      applyToGame(this);
      fillFromStore();
    });
    document.getElementById('mute-toggle')?.addEventListener('change', (e) => {
      this.audio.unlock();
      patchSettings({ muted: !!e.target.checked });
      applyToGame(this);
      fillFromStore();
    });
    document.getElementById('blood-toggle')?.addEventListener('change', (e) => {
      patchSettings({ blood: !!e.target.checked });
      applyToGame(this);
      fillFromStore();
    });
    document.getElementById('graphics-preset-select')?.addEventListener('change', (e) => {
      setGraphicsPreset(e.target.value);
      applyToGame(this);
      fillFromStore();
    });
  }

  startMatch() {
    this.audio.unlock();
    this.audio.playUI();
    this._leaveMenu();
    this.matchMode = getModeById('deathmatch');
    this.matchOver = false;
    this.paused = false;
    this.running = true;
    this.donuts.clear();
    this.medkits.spawnDefault(this.mapData?.medkitSpots);
    this.bots.spawnAll(BOT_COUNT);
    this._disposeFlags();
    this._disposeZone();

    const spawn = this._playerSpawn();
    this.player.fullMatchReset(spawn);
    this.player.clearFireLatches();
    this.weapons.resetAll();
    this.ui.hideVictory();
    this.ui.hideDeath();
    this.ui.showPause(false);
    this.ui.showHUD();
    this.ui.updateStats(this.player, this._hudMatch());
    this.ui.updateWeapon(this.weapons.getCurrent(), this.weapons.slot, this.weapons.getAmmo());
    this._updateScopeUI();
    document.getElementById('interact-prompt')?.classList.add('hidden');

    // Phase D: 3-2-1-FIGHT before free combat
    this.matchFlow = beginCountdown(createMatchFlow(), 3);
    this.ui.showMatchCallout(this.matchFlow.lastCallout || '3');
    this.audio.playCountdownTick?.();
    this._fightHideTimer = 0;

    this.spawnGuard = 4.2; // covers countdown + brief after FIGHT
    this._tabScoreboard = false;
    this.ui.showMiniScoreboard(null, false);
    this._requestPointerLock();
    this._syncTouchChrome();
    this.clock.getDelta();
  }

  _requestPointerLock() {
    if (this.touchPlay) return;
    const p = this.canvas.requestPointerLock?.();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  /** Click the game view to capture mouse look (needed after tab switch / dual-window tests). */
  _bindPointerLockClick() {
    this.canvas.addEventListener('click', () => {
      if (this.touchPlay) return;
      if (!this.running || this.matchOver || this.paused || !this.player?.alive) return;
      if (document.pointerLockElement === this.canvas) return;
      this._requestPointerLock();
    });
  }

  pause() {
    if (!this.running || this.matchOver) return;
    this.paused = true;
    this._tabScoreboard = false;
    this.ui.showMiniScoreboard(null, false);
    document.exitPointerLock?.();
    this.ui.showPause(true);
    this._syncTouchChrome();
  }

  resume() {
    if (!this.running || this.matchOver) return;
    this.paused = false;
    this.ui.hideSettings();
    this.ui.showPause(false);
    this.audio.unlock();
    this._requestPointerLock();
    this._syncTouchChrome();
    this.clock.getDelta();
  }

  /** Leave the current match (offline or MP) and show the start screen. */
  returnToMainMenu() {
    this.audio.playUI();
    this.paused = false;
    this.running = false;
    this.matchOver = false;
    this.matchFlow = endMatch(this.matchFlow || createMatchFlow());
    this._tabScoreboard = false;
    this.ui.showMiniScoreboard(null, false);
    this.ui.setFlagCarry?.(false);
    this.ui.hideDeath();
    this.ui.hideVictory();
    this.ui.showPause(false);
    this.ui.hideMatchCallout();
    this.ui.hideSettings();
    document.exitPointerLock?.();

    this._mpActive = false;
    this._resetMpSession();
    this.ui.hideJoin();
    this.ui.hideLobby();

    this.bots?.clear();
    this.donuts?.clear();
    this._disposeFlags();
    this._disposeZone();

    this.ui.showStart();
    this._enterMenu();
    this._syncTouchChrome();
  }

  _playerSpawn() {
    const pts = this.mapData.spawnPoints || [];
    if (!pts.length) return new THREE.Vector3(0, PLAYER_HEIGHT, 8);

    // Player spawns stay on the ground. Elevated authored points are useful
    // cover/AI locations, but starting there can put the capsule inside a
    // prop or leave it on a narrow roof edge before Rapier has stepped in.
    const ground = pts.filter((p) => p.y <= PLAYER_HEIGHT + 0.06);
    const candidates = ground.length ? ground : pts;
    const colliders = this.mapData.colliders || [];
    const bots = (this.bots?.bots || []).filter((b) => !b.dead);
    const fromOpts = { radius: this.player?.radius || 0.38, height: PLAYER_HEIGHT };

    const scorePoint = (point) => {
      const spawn = point.clone();
      spawn.y = PLAYER_HEIGHT;
      const clear = !playerPositionBlocked(spawn, colliders, fromOpts);
      let openDirections = 0;
      if (clear) {
        for (let i = 0; i < PLAYER_SPAWN_DIRECTION_COUNT; i++) {
          const angle = (i / PLAYER_SPAWN_DIRECTION_COUNT) * Math.PI * 2;
          const to = {
            x: spawn.x + Math.cos(angle) * PLAYER_SPAWN_ESCAPE_DISTANCE,
            y: spawn.y,
            z: spawn.z + Math.sin(angle) * PLAYER_SPAWN_ESCAPE_DISTANCE,
          };
          if (!playerMoveBlocked(spawn, to, colliders, fromOpts)) openDirections++;
        }
      }

      let minBotGap = 99;
      for (const bot of bots) {
        minBotGap = Math.min(
          minBotGap,
          Math.hypot(spawn.x - bot.position.x, spawn.z - bot.position.z)
        );
      }

      return { spawn, clear, openDirections, minBotGap };
    };

    const scored = candidates.map(scorePoint);

    // First discard trap-like locations; then prefer a location with real
    // breathing room from bots. If a future map has too few valid points, the
    // fallback still chooses the least-blocked point instead of crashing.
    const clearCandidates = scored.filter(
      (entry) => entry.clear && entry.openDirections >= PLAYER_SPAWN_MIN_OPEN_DIRECTIONS
    );
    const gapCandidates = clearCandidates.filter(
      (entry) => entry.minBotGap >= PLAYER_SPAWN_MIN_BOT_GAP
    );
    let pool = gapCandidates.length
      ? gapCandidates
      : clearCandidates.length
        ? clearCandidates
        : [];

    // Authored points can become stale after a map edit. Search the playable
    // ground grid before ever accepting a trapped authored point as fallback.
    if (!pool.length) {
      const rescue = [];
      const limit = Math.max(34, Math.floor((this.mapData?.bounds ?? 38) - 4));
      const step = limit > 40 ? 4 : 2;
      for (let x = -limit; x <= limit; x += step) {
        for (let z = -limit; z <= limit; z += step) {
          const entry = scorePoint(new THREE.Vector3(x, PLAYER_HEIGHT, z));
          if (entry.clear && entry.openDirections >= PLAYER_SPAWN_MIN_OPEN_DIRECTIONS) {
            rescue.push(entry);
          }
        }
      }
      pool = rescue;
    }

    if (!pool.length) {
      throw new Error('No safe player spawn exists: map ground is fully blocked');
    }
    const fallbackPool = pool;

    // Evaluate every candidate (rather than eight random samples) so a bad
    // point cannot win simply because it was sampled early in the match.
    let best = fallbackPool[0];
    let bestScore = -Infinity;
    for (const entry of fallbackPool) {
      const score =
        Math.min(entry.minBotGap, 20) +
        entry.openDirections * 0.35 +
        Math.random() * 0.02;
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }
    return best.spawn.clone();
  }

  _loop() {
    requestAnimationFrame(this._loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.mapData?.tick?.(dt);
    const lightFocus = this.running && this.player?.position ? this.player.position : this.camera?.position;
    this.mapData?.syncLights?.(lightFocus, {
      maxPointLights: this._gfx?.maxPointLights,
      lightDistanceScale: this._gfx?.lightDistanceScale,
    });

    if (this.running && !this.paused && !this.matchOver) {
      if (this._mpWakeGrace > 0) this._mpWakeGrace = Math.max(0, this._mpWakeGrace - dt);
      this._update(dt);
    } else {
      // Cinematic orbit on start; snow only if the live map enables it
      if (!this.running && !this.matchOver) {
        this.menuCam.update(dt);
        if (this.weapons?.viewModel) this.weapons.viewModel.visible = false;
      }
      this.particles.update(dt * 0.5);
    }

    this._renderWorldAndViewmodel();
    if (this._perf) this._tickPerf(dt);
  }

  _tickPerf(dt) {
    this._perfAcc += dt;
    this._perfFrames += 1;
    if (this._perfAcc < 1) return;
    const fps = this._perfFrames / this._perfAcc;
    const info = this.renderer?.info?.render;
    const mem = this.renderer?.info?.memory;
    console.log(
      `[perf] fps=${fps.toFixed(1)} calls=${info?.calls ?? '?'} tris=${info?.triangles ?? '?'} geo=${mem?.geometries ?? '?'} tex=${mem?.textures ?? '?'} map=${this.mapId}`
    );
    this._perfAcc = 0;
    this._perfFrames = 0;
    if (this.renderer?.info) this.renderer.info.reset();
  }

  _update(dt) {
    if (this.spawnGuard > 0) this.spawnGuard -= dt;

    // Match countdown fantasy (3 → 2 → 1 → FIGHT!)
    if (isCountdown(this.matchFlow)) {
      const prevLabel = this.matchFlow.lastCallout;
      this.matchFlow = tickCountdown(this.matchFlow, dt);
      if (this.matchFlow.lastCallout !== prevLabel) {
        if (this.matchFlow.lastCallout === 'FIGHT!') {
          this.ui.showMatchCallout('FIGHT!', { fight: true });
          this.audio.playFight?.();
          this._fightHideTimer = 0.95;
        } else {
          this.ui.showMatchCallout(this.matchFlow.lastCallout);
          this.audio.playCountdownTick?.();
        }
      }
    } else if (this._fightHideTimer > 0) {
      this._fightHideTimer -= dt;
      if (this._fightHideTimer <= 0) this.ui.hideMatchCallout();
    }

    // Death / respawn — offline / local only; MP respawn is host-authoritative via MpMatch
    if (!this.player.alive && !this.mpMatch) {
      this.respawnTimer -= dt;
      this.ui.updateDeathTimer(Math.max(0, this.respawnTimer));
      if (this.respawnTimer <= 0) {
        this.player.reset(this._playerSpawn());
        this.weapons.currentAmmo = this.weapons.getCurrent().magSize;
        this.weapons.reloading = false;
        this.weapons.reloadTimer = 0;
        this.spawnGuard = 2.5;
        this.ui.hideDeath();
        this._requestPointerLock();
      }
    } else if (!this.player.alive && this.mpMatch) {
      this.respawnTimer = Math.max(0, this.respawnTimer - dt);
      this.ui.updateDeathTimer(Math.max(0, this.respawnTimer), {
        eliminated: this.matchMode?.allowRespawn === false,
      });
    }

    // Look: ADS hold and full scope share the aim-sensitivity slider
    this.player._lookScope = this.weapons.isScoped();
    this.player._lookAim = !!this.weapons.isAiming?.();
    this.player._scopedLook = this.player._lookAim;

    const aliveBots = this.bots.getAliveBots();
    const agents = this._botAgents;
    agents.length = aliveBots.length;
    for (let i = 0; i < aliveBots.length; i++) {
      const slot = agents[i] || (agents[i] = { x: 0, z: 0 });
      slot.x = aliveBots[i].position.x;
      slot.z = aliveBots[i].position.z;
    }
    const moveState = this.player.update(
      dt,
      this.mapData.colliders,
      this.mapData.floors,
      agents
    );
    // Phase 1d: bots queue kinematic moves before the shared world step so player
    // + bots commit in one Rapier tick (legacy bots ran after step and never touched physics).
    this.bots.update(dt);

    // Phase 2a: host steps remote pawns (queues Rapier) before shared world step
    if (this.mpMatch && isCombatLive(this.matchFlow)) {
      this.mpMatch.update(dt, {
        player: this.player,
        weapons: this.weapons,
        colliders: this.mapData.colliders,
        floors: this.mapData.floors,
        spawnGuard: this.spawnGuard,
        wakeGrace: this._mpWakeGrace > 0,
        shotBlocked: (from, to) =>
          this._shotBlocked(from, to, from.distanceTo(to) + 0.05),
      });
    }

    // Commit queued kinematic translations from player + bots + MP remotes.
    this.physics?.step(dt);

    // Footsteps
    if (this.player.alive && moveState.moving && moveState.grounded) {
      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0) {
        this.audio.playFootstep();
        this.footstepTimer = moveState.sprinting ? 0.28 : 0.4;
      }
    }

    // Weapons
    const weaponSlot = this.player.alive ? this.player.consumeWeaponSlot() : null;
    if (weaponSlot === 0 || weaponSlot === 1) this.player.shootClicks = 0;
    const scopeClick = this.player.alive ? this.player.consumeScopeClick() : false;
    const scopeZoomDelta = this.player.alive ? this.player.consumeScopeZoomDelta() : 0;
    const combatOk = isCombatLive(this.matchFlow) && this.player.alive;
    const shots = this.weapons.update(
      dt,
      {
        shoot: this.player.buttons.left && combatOk,
        // Peek only — consume a buffered click when a semi-auto round actually fires
        shootClick: combatOk && this.player.shootClicks > 0,
        onSemiFire: () => {
          if (this.player.shootClicks > 0) this.player.shootClicks -= 1;
        },
        scopeClick,
        scopeZoomDelta,
        aimHold: !!this.player.buttons.right && combatOk,
        reload: this.player.consumeReloadPress(),
        weaponSlot,
        moving: !!moveState.moving,
        sprinting: !!moveState.sprinting,
      },
      this.player.alive
    );
    // Apply weapon aim kick into look angles (survives next frame overwrite)
    if (this.player.alive) {
      const kick = this.weapons.consumeKick();
      if (kick.pitch || kick.yaw) {
        this.player.pitch = Math.max(-1.45, Math.min(1.45, this.player.pitch + kick.pitch));
        this.player.yaw += kick.yaw;
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.player.yaw;
        this.camera.rotation.x = this.player.pitch;
      }
      // Hit-feedback camera punch (decays each frame)
      if (this.hitPunch && (this.hitPunch.pitch || this.hitPunch.yaw)) {
        const hp = this.hitPunch.pitch;
        const hy = this.hitPunch.yaw;
        this.player.pitch = Math.max(-1.45, Math.min(1.45, this.player.pitch + hp));
        this.player.yaw += hy;
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.player.yaw;
        this.camera.rotation.x = this.player.pitch;
        const decay = Math.exp(-dt * 16);
        this.hitPunch.pitch *= decay;
        this.hitPunch.yaw *= decay;
        if (Math.abs(this.hitPunch.pitch) < 1e-4) this.hitPunch.pitch = 0;
        if (Math.abs(this.hitPunch.yaw) < 1e-4) this.hitPunch.yaw = 0;
      }
    }
    this._updateScopeUI();
    this.ui.updateWeapon(this.weapons.getCurrent(), this.weapons.slot, this.weapons.getAmmo());

    if (shots.length) this.ui.pulseCrosshair?.();
    // Offline hitscan vs bots; MP damage is host-authoritative in MpMatch
    if (!this.mpMatch) {
      for (const shot of shots) {
        this._resolvePlayerShot(shot);
      }
    }

    // Bots only fight the player — no bot-vs-bot combat

    // Keep nameplate HP bars live
    for (const bot of this.bots.bots) {
      if (bot.dead) continue;
      bot.character.updateHealth?.(bot.health, bot.maxHealth);
    }

    // Donuts — player collect
    if (this.player.alive) {
      this.donuts.update(dt, this.player.position, 1.1);
    } else {
      this.donuts.update(dt, null);
    }

    // Doors + medkits (shared E interact)
    this.doors.update(dt);
    this.medkits.update(dt);
    this._updateInteract();
    {
      const prompt = document.getElementById('interact-prompt');
      const shown = prompt && !prompt.classList.contains('hidden');
      const canUse = !!(shown && /(door|medkit)/i.test(prompt.textContent || ''));
      this.touch?.setUseAvailable(canUse && this.touchPlay && this.running && !this.paused);
    }

    // Bot donut pickup (horizontal radius)
    for (const bot of this.bots.getAliveBots()) {
      for (const d of [...this.donuts.donuts]) {
        if (!d.alive) continue;
        const dx = bot.position.x - d.mesh.position.x;
        const dz = bot.position.z - d.mesh.position.z;
        if (Math.hypot(dx, dz) < 1.1) {
          d.alive = false;
          this.scene.remove(d.mesh);
          bot.funPoints += DONUT_FUN_POINTS;
          this.particles.donutSparkle(d.mesh.position.clone());
        }
      }
    }
    this.donuts.donuts = this.donuts.donuts.filter((x) => x.alive);

    this.particles.update(dt);
    this.flags?.update(dt);
    this.zoneRing?.update(dt);
    this.ui.updateStats(this.player, this._hudMatch());
    this.ui.updateHitFeedback?.(
      this.player.yaw,
      dt,
      this.player.alive ? this.player.health / this.player.maxHealth : 0
    );
    this.ui.setFlagCarry?.(this._localCarryingFlag());

    // Refresh Tab scoreboard while held
    if (this._tabScoreboard) {
      this.ui.showMiniScoreboard(this._scoreboardEntries(), true, this._hudMatch());
    }

    // Check win conditions
    this._checkMatchEnd();
  }

  _notifyPlayerHit({ fromX, fromZ, damage, omnidirectional = false } = {}) {
    this.ui.showIncomingHit?.({
      fromX,
      fromZ,
      playerX: this.player.position.x,
      playerZ: this.player.position.z,
      playerYaw: this.player.yaw,
      damage,
      health: this.player.health,
      maxHealth: this.player.maxHealth,
      omnidirectional,
    });
  }

  _localCarryingFlag() {
    const ctf = this.mpMatch?.ctf;
    const localId = this.mp?.playerId;
    if (!ctf?.flags || !localId) return false;
    return Object.values(ctf.flags).some(
      (f) => f.state === 'carried' && f.carrierId === localId
    );
  }

  _hudMatch() {
    const mode = this.matchMode || getModeById('deathmatch');
    const mp = this.mpMatch;
    const localId = this.mp?.playerId;
    const localPawn = localId && mp?.pawns ? mp.pawns.get(localId) : null;
    return {
      modeId: mode.id,
      modeName: mode.name,
      teamKills: mode.id === 'tdm' ? mp?.teamKills || { alpha: 0, bravo: 0 } : null,
      captures: mode.id === 'ctf' ? mp?.captures || { alpha: 0, bravo: 0 } : null,
      localTeam: localPawn?.team || null,
      carrying: this._localCarryingFlag(),
      goalLimit: mode.captureLimit || mode.teamScoreLimit || mode.killLimit || 20,
      aliveCount: mp?.pawns
        ? [...mp.pawns.values()].filter((p) => p.alive).length
        : 0,
    };
  }

  _scoreboardEntries() {
    if (this.mpMatch?.pawns?.size) {
      const localId = this.mp?.playerId;
      const entries = [...this.mpMatch.pawns.values()].map((p) => ({
        name: p.id === localId ? 'YOU' : p.name,
        kills: p.kills,
        deaths: p.deaths,
        funPoints: 0,
        isPlayer: p.id === localId,
        team: p.team || undefined,
      }));
      const teamMode = !!this.matchMode?.teams;
      entries.sort((a, b) => {
        if (teamMode) {
          const ta = a.team === 'alpha' ? 0 : a.team === 'bravo' ? 1 : 2;
          const tb = b.team === 'alpha' ? 0 : b.team === 'bravo' ? 1 : 2;
          if (ta !== tb) return ta - tb;
        }
        return b.kills - a.kills || a.name.localeCompare(b.name);
      });
      return entries;
    }
    const entries = [
      {
        name: 'YOU',
        kills: this.player.kills,
        deaths: this.player.deaths,
        funPoints: this.player.funPoints,
        isPlayer: true,
      },
      ...this.bots.bots.map((b) => ({
        name: b.name,
        kills: b.kills,
        deaths: b.deaths,
        funPoints: b.funPoints,
        isPlayer: false,
      })),
    ];
    entries.sort((a, b) => b.kills - a.kills || b.funPoints - a.funPoints);
    return entries;
  }

  _resolvePlayerShot(shot) {
    // Hitscan vs full voxel silhouette (head/torso/arms/legs/feet) — no aim-cone magnet.
    let best = null;
    let bestDist = shot.range;

    for (const bot of this.bots.getAliveBots()) {
      const head = bot.character.getHeadWorldPosition();
      const volumes =
        typeof bot.character.getHitVolumes === 'function'
          ? bot.character.getHitVolumes()
          : [
              { kind: 'sphere', center: head, radius: HEAD_HIT_RADIUS, headshot: true },
              { kind: 'sphere', center: bot.character.getChestWorldPosition(), radius: 0.3 },
            ];

      const picked = pickVolumeHit(shot.origin, shot.direction, shot.range, volumes, head, {
        rayHitsSphere: (o, d, c, r) => this._rayHitsSphere(o, d, c, r),
        rayHitsCapsule: (o, d, a, b, r) => this._rayHitsCapsule(o, d, a, b, r),
        shotBlocked: (from, to, dist) => this._shotBlocked(from, to, dist),
      });
      if (!picked || picked.dist > bestDist) continue;
      best = { bot, dist: picked.dist, headshot: picked.headshot, point: picked.point };
      bestDist = picked.dist;
    }

    if (!best) return;

    const dmg = best.headshot ? best.bot.maxHealth : Math.round(shot.damage);
    const result = this.bots.damageBot(best.bot.id, dmg, {
      killerName: 'YOU',
      isPlayer: true,
      weaponId: shot.weaponId,
      headshot: best.headshot,
    });

    this.particles.bloodPuff(best.point);
    this.particles.hitSparks(best.point);
    // Always run hit UI + audio hooks
    this.ui.showHitmarker(best.headshot);
    this.ui.showDamageNumber(dmg, best.headshot);
    if (best.headshot) {
      this.ui.showHeadshot?.();
      this.audio.playHeadshot();
    } else {
      this.audio.playHit();
    }
    // Small temporary camera hit punch (decays in _update)
    const punch = best.headshot ? 0.014 : 0.008;
    this.hitPunch.pitch += punch;
    this.hitPunch.yaw += (Math.random() - 0.5) * (best.headshot ? 0.012 : 0.008);

    if (result.killed) {
      this._playerGotKill(best.bot, shot.weaponId, { headshot: best.headshot });
    }
  }

  _rayHitsSphere(origin, dir, center, radius) {
    return rayHitsSphere(origin, dir, center, radius);
  }

  /**
   * Ray vs finite capsule (segment a→b + radius). Covers torso between pelvis and chest.
   * @returns {{ dist: number, point: THREE.Vector3 } | null}
   */
  _rayHitsCapsule(origin, dir, a, b, radius) {
    const ba = b.clone().sub(a);
    const baLen = ba.length();
    if (baLen < 1e-5) return this._rayHitsSphere(origin, dir, a, radius);
    const baN = ba.clone().multiplyScalar(1 / baLen);
    const oc = origin.clone().sub(a);
    const dDot = dir.dot(baN);
    const ocDot = oc.dot(baN);
    const dPerp = dir.clone().addScaledVector(baN, -dDot);
    const ocPerp = oc.clone().addScaledVector(baN, -ocDot);
    const A = dPerp.lengthSq();
    const B = 2 * dPerp.dot(ocPerp);
    const C = ocPerp.lengthSq() - radius * radius;
    let tCand = null;
    if (A < 1e-10) {
      if (C > 0) return null;
      tCand = 0;
    } else {
      const disc = B * B - 4 * A * C;
      if (disc < 0) return null;
      const s = Math.sqrt(disc);
      let t0 = (-B - s) / (2 * A);
      let t1 = (-B + s) / (2 * A);
      if (t0 < 0) t0 = t1;
      if (t0 < 0 || t0 > 200) return null;
      tCand = t0;
    }
    const hit = origin.clone().addScaledVector(dir, tCand);
    const proj = hit.clone().sub(a).dot(baN);
    if (proj < 0) return this._rayHitsSphere(origin, dir, a, radius);
    if (proj > baLen) return this._rayHitsSphere(origin, dir, b, radius);
    return { dist: tCand, point: hit };
  }

  _shotBlocked(from, to, maxDist) {
    return rayBlockedBySolids(from, to, this.mapData.colliders, {
      maxDist,
      minHeight: 0.5,
      tMin: 0.08,
      tEndPad: 0.08,
    });
  }

  _playerGotKill(bot, weaponId, { headshot = false } = {}) {
    this.player.kills += 1;
    this.player.killStreak += 1;
    // Kill feed + donut are guaranteed in _onBotDeath (single source of truth)
    this.ui.updateStats(this.player, this._hudMatch());
    // Loadout stays manual: 1 = Pistol, 2 = M16 (no auto-swap on kill)

    // Kill juice: flash, confirm, sting, confetti burst at death pos
    this.ui.showKillFlash?.();
    if (!headshot) this.ui.showKillConfirm?.();
    this.audio.playKill?.();
    const burstAt = (bot.position || bot.mesh?.position || new THREE.Vector3()).clone();
    burstAt.y = (burstAt.y || 0) + 0.9;
    if (this.particles.killBurst) this.particles.killBurst(burstAt);
    else this.particles.donutSparkle?.(burstAt);

    if ([3, 5, 7, 10].includes(this.player.killStreak)) {
      this.ui.showStreak(this.player.killStreak);
      this.audio.playKillStreak(this.player.killStreak);
    }

    this.ui.updateWeapon(this.weapons.getCurrent(), this.weapons.slot, this.weapons.getAmmo());
  }

  _onBotDeath(bot, pos, info) {
    const deathAt = (pos || bot.position).clone();
    deathAt.y = 0;
    this.particles.deathPoof(deathAt.clone().add(new THREE.Vector3(0, 0.5, 0)));
    this.audio.playDeath();
    // Always drop a donut on any bot death
    this.donuts.spawn(deathAt);

    // Always show kill feed (player + bot killers)
    const killerName = info?.isPlayer ? 'YOU' : info?.killerName || 'BOT';
    const weaponId = info?.weaponId || 'pistol';
    this.ui.addKillFeed(killerName, bot.name, weaponId, !!info?.isPlayer, false);
  }

  _onBotShoot(shot) {
    // Third-person bot fire: large muzzle + tracer (FPS muzzle is too tiny to see on enemies)
    if (this.particles.botMuzzleFlash) {
      this.particles.botMuzzleFlash(shot.origin, shot.direction, { tracerLength: 5 });
    } else {
      this.particles.muzzleFlash(shot.origin, shot.direction);
    }
    // Always play a clear pistol shot for bot fire
    this.audio.playShoot(shot.weaponId || 'pistol');

    if (!this.player.alive) return;

    // Hitscan vs player — spheres shrink when crouched
    const vols = this.player.getHitSpheres();
    let hit = this._rayHitsSphere(shot.origin, shot.direction, vols.head, vols.head.radius);
    let headshot = true;
    if (!hit) {
      hit = this._rayHitsSphere(shot.origin, shot.direction, vols.chest, vols.chest.radius);
      headshot = false;
    }
    if (!hit || hit.dist > shot.range) return;
    if (this._shotBlocked(shot.origin, hit.point, hit.dist)) return;

    if (this.spawnGuard > 0) return;
    const dmg = Math.round(shot.damage * (headshot ? 1.2 : 1) * 0.55);
    const killed = this.player.takeDamage(dmg);
    this.particles.bloodPuff(hit.point);
    this.audio.playHurt?.();
    this.ui.updateStats(this.player, this._hudMatch());
    this._notifyPlayerHit({
      fromX: shot.origin?.x,
      fromZ: shot.origin?.z,
      damage: dmg,
    });
    this.hitPunch.pitch += headshot ? 0.012 : 0.007;

    if (killed) {
      this.lastKiller = shot.bot.name;
      this.player.weaponIndex = Math.max(0, this.weapons.index);
      // On death, demote one weapon tier optionally - keep gun game by kills only
      this.respawnTimer = RESPAWN_TIME;
      this.ui.showDeath(this.lastKiller, this.respawnTimer);
      this.ui.addKillFeed(shot.bot.name, 'YOU', shot.weaponId, false, true);
      this.audio.playDeath();
      shot.bot.kills += 1;
      shot.bot.killStreak += 1;
      shot.bot.weaponIndex = Math.min(shot.bot.kills, WEAPONS.length - 1);
      this.bots._syncWeaponVisual?.(shot.bot);
      document.exitPointerLock?.();
    }
  }

  _botCollectDonut(bot, pos) {
    // Pickup is handled once in the donut loop (avoids per-frame double-count)
    bot.funPoints += DONUT_FUN_POINTS;
  }

  _checkMatchEnd() {
    // MP win is emitted by MpMatch (match_end event)
    if (this.mpMatch) return;
    const mode = this.matchMode || getModeById('deathmatch');
    if (mode.id === 'deathmatch') {
      if (mode.checkWin({ kills: this.player.kills })) {
        this._endMatch(true);
        return;
      }
      for (const bot of this.bots.bots) {
        if (mode.checkWin({ kills: bot.kills })) {
          this._endMatch(false);
          return;
        }
      }
      return;
    }
    // TDM / CTF / PUBG: multiplayer-oriented; offline PLAY stays deathmatch
  }

  _endMatch(playerWon, extra = {}) {
    this.matchOver = true;
    this.running = false;
    this.matchFlow = endMatch(this.matchFlow || createMatchFlow());
    this.ui.hideMatchCallout?.();
    this._tabScoreboard = false;
    this.ui.showMiniScoreboard(null, false);
    this.ui.setFlagCarry?.(false);
    document.exitPointerLock?.();

    this.ui.showVictory(this._scoreboardEntries(), playerWon, {
      ...this._hudMatch(),
      ...extra,
    });
    this._syncTouchChrome();
    this.audio.playKillStreak(10);
  }

  _updateScopeUI() {
    const scoped = this.weapons.isScoped() && this.player.alive && this.running;
    const ads = this.weapons.adsHeld && this.player.alive && this.running;
    const overlay = document.getElementById('scope-overlay');
    const cross = document.getElementById('crosshair');
    if (overlay) overlay.classList.toggle('hidden', !scoped);
    if (cross) {
      cross.classList.toggle('scoped-hide', scoped);
      this.ui.setADS(ads || scoped);
    }
    // Optional zoom label on weapon banner
    const zoomEl = document.getElementById('scope-zoom-label');
    if (zoomEl) {
      if (scoped) {
        zoomEl.textContent = `${this.weapons.scopeZoom}x`;
        zoomEl.classList.remove('hidden');
      } else {
        zoomEl.classList.add('hidden');
      }
    }
  }

  /** Shared E: doors first, then medkits. */
  _updateInteract() {
    const prompt = document.getElementById('interact-prompt');
    if (!this.player.alive || !this.running) {
      prompt?.classList.add('hidden');
      return;
    }
    const door = this.doors.getNearby(this.player.position);
    if (door) {
      if (prompt) {
        prompt.textContent = door.open
          ? `${this._useVerb()} to close door`
          : `${this._useVerb()} to open door`;
        prompt.classList.remove('hidden');
      }
      // MP: host owns door toggles via interact input — don't flip locally (desyncs physics)
      if (this.mpMatch) return;
      if (this.player.consumeUsePress()) {
        this.doors.toggle(door);
        this.audio.playDonutPickup?.(); // light click feedback
      }
      return;
    }

    const promptEl = prompt;
    const localId = this.mp?.playerId;
    const localPawn = localId ? this.mpMatch?.pawns?.get(localId) : null;
    const ctf = this.mpMatch?.ctf;
    if (ctf && localPawn?.team) {
      if (this._localCarryingFlag()) {
        if (promptEl) {
          promptEl.textContent = 'Take the flag home!';
          promptEl.classList.remove('hidden');
        }
        return;
      }
      const hint = this.flags?.promptFor(this.player.position, localPawn.team, ctf);
      if (hint && hint !== 'Home base') {
        if (promptEl) {
          promptEl.textContent = hint;
          promptEl.classList.remove('hidden');
        }
        return;
      }
    }

    const near = this.medkits.getNearby(this.player.position);
    if (near) {
      if (prompt) {
        prompt.textContent = `${this._useVerb()} to take medkit!`;
        prompt.classList.remove('hidden');
      }
      if (this.player.consumeUsePress()) {
        const healed = this.medkits.tryPickup(this.player.position, () => {
          this.player.health = this.player.maxHealth;
          this.player.timeSinceDamage = 99;
          this.audio.playDonutPickup?.();
          this.ui.updateStats(this.player, this._hudMatch());
          const toast = document.getElementById('pickup-toast');
          if (toast) {
            toast.textContent = 'MEDKIT + FULL HP ❤️';
            toast.classList.remove('hidden');
            toast.style.animation = 'none';
            void toast.offsetWidth;
            toast.style.animation = '';
            setTimeout(() => {
              toast.classList.add('hidden');
              toast.textContent = '+50 FUN';
            }, 900);
          }
        });
        if (healed) prompt?.classList.add('hidden');
      }
      return;
    }

    const zone = this.mpMatch?.zone;
    if (this.matchMode?.id === 'pubg' && zone) {
      if (
        isOutsideZone(
          this.player.position.x,
          this.player.position.z,
          zone.r,
          zone.cx ?? 0,
          zone.cz ?? 0
        )
      ) {
        if (prompt) {
          prompt.textContent = 'Get inside the zone!';
          prompt.classList.remove('hidden');
        }
        return;
      }
    }

    prompt?.classList.add('hidden');
    this.player.usePressed = false;
  }

  _useVerb() {
    return this.touchPlay ? 'Tap USE' : 'Press E';
  }

  _bindWeaponBannerSwap() {
    const banner = typeof document !== 'undefined' ? document.getElementById('weapon-banner') : null;
    if (!banner) return;
    banner.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.touchPlay || !this.running || this.paused || this.matchOver) return;
        if (!this.player?.alive) return;
        e.preventDefault();
        e.stopPropagation();
        const cur = this.weapons?.slot ?? 0;
        this.player.weaponSlotPressed = cur === 0 ? 1 : 0;
      },
      { passive: false }
    );
  }

  _syncTouchChrome() {
    if (!this.touch) return;
    const portrait = !!this.touchPlay && isTouchPortrait();
    this.touch.setRotateVisible(
      shouldShowRotateHint({
        touchPlay: this.touchPlay,
        portrait,
        running: this.running,
        paused: this.paused,
        matchOver: this.matchOver,
        settingsOpen: !!this.ui?.isSettingsOpen?.(),
      })
    );
    const live = this.touchPlay && this.running && !this.paused && !this.matchOver && !portrait;
    if (live) this.touch.show();
    else this.touch.hide();
    this._syncGyroLook();
  }

  _syncGyroLook() {
    if (!this.gyro) return;
    const portrait = !!this.touchPlay && isTouchPortrait();
    const live = this.touchPlay && this.running && !this.paused && !this.matchOver && !portrait;
    const wanted = live && getSettings().gyroMode !== 'off';
    if (wanted) void this.gyro.start();
    else this.gyro.stop();
  }

  /**
   * World + bloom first (layer 0). Then the FP gun on a cleared depth buffer
   * so bloom from bright fences cannot bleed through the weapon, and walls
   * cannot clip the viewmodel.
   */
  _renderWorldAndViewmodel() {
    const cam = this.camera;
    cam.layers.set(0);

    if (this._postEnabled && this.composer) {
      this.composer.render();
    } else {
      this.renderer.autoClear = true;
      this.renderer.render(this.scene, cam);
    }

    const vm = this.weapons?.viewModel;
    if (vm?.visible) {
      cam.layers.set(VIEWMODEL_LAYER);
      const prevShadow = this.renderer.shadowMap.enabled;
      const prevBackground = this.scene.background;
      const prevFog = this.scene.fog;
      this.renderer.shadowMap.enabled = false;
      this.scene.background = null;
      this.scene.fog = null;
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.scene, cam);
      this.scene.background = prevBackground;
      this.scene.fog = prevFog;
      this.renderer.autoClear = true;
      this.renderer.shadowMap.enabled = prevShadow;
    }

    cam.layers.set(0);
  }

  _resize() {
    const canvas = this.canvas || this.renderer?.domElement;
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const w = Math.max(
      1,
      Math.round(canvas?.clientWidth || vv?.width || window.innerWidth || 1)
    );
    const h = Math.max(
      1,
      Math.round(canvas?.clientHeight || vv?.height || window.innerHeight || 1)
    );
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const prCap = getGraphicsPreset().pixelRatioCap ?? GFX.maxPixelRatio;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, prCap));
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
      this._syncFxaaResolution(w, h);
      this._syncBloomResolution(w, h);
    }
    this._syncTouchChrome();
  }
}
