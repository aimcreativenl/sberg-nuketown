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
import { buildMap } from './MapBuilder.js';
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
import { getSettings, setGraphicsPreset, applyToGame } from '../settings/Settings.js';
import { MenuCamera } from './MenuCamera.js';
import { rayBlockedBySolids } from './collision.js';
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
} from './constants.js';
import { OnlineSession } from '../net/OnlineSession.js';
import { MpMatch } from '../net/MpMatch.js';
import { getModeById } from '../modes/registry.js';

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

    this.ui = new GameUI();
    this.audio = new GameAudio();
    /** Phase 1a/1b: Rapier physics world, created async via `initPhysics()` (see main.js). Null = legacy AABB fallback. */
    this.physics = null;

    this._initRenderer();
    this._initScene();
    this.mapData = buildMap(this.scene);
    this.doors = new DoorManager(this.mapData.doors || []);
    this.particles = new ParticleSystem(this.scene);
    this.particles.snowDust();

    this.player = new Player(this.camera, this.mapData);
    this.player.bindInput(canvas);

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
      this.ui.updateStats(this.player);
    });
    this.medkits = new MedkitManager(this.scene);

    this.bots = new BotManager(this.scene, this.mapData, {
      doors: this.doors,
      getPlayerPosition: () =>
        this.player.alive ? this.player.position.clone() : null,
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
    this.ui.showStart();
    this._enterMenu();
    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
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

  /** Cinematic idle over the live map (start / after match return). */
  _enterMenu() {
    this.menuCam?.start();
    if (this.weapons?.viewModel) this.weapons.viewModel.visible = false;
  }

  _leaveMenu() {
    this.menuCam?.stop();
    if (this.weapons?.viewModel) this.weapons.viewModel.visible = true;
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      // Composer + FXAA handle AA; MSAA backbuffer is wasted on RT path
      antialias: false,
      powerPreference: 'high-performance',
      // Keep last frame readable; also helps FP gun debug overlays
      preserveDrawingBuffer: true,
    });
    // High-DPI path for 4K-class displays (capped for GPU sanity)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, GFX.maxPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
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
    this.scene.add(skyMesh);

    // near=0.05 so the large FP pistol is never near-clipped; far covers expanded arena
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 180);
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
    this.sun.castShadow = true;
    const sm = GFX.shadowMapSize;
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

  _bindUI() {
    document.getElementById('btn-play')?.addEventListener('click', () => this.startMatch());
    document.getElementById('btn-resume')?.addEventListener('click', () => this.resume());
    document.getElementById('btn-restart')?.addEventListener('click', () => this.startMatch());
    document.getElementById('btn-rematch')?.addEventListener('click', () => this.startMatch());
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

    const howBtn = document.getElementById('btn-how');
    const howPanel = document.getElementById('start-how');
    howBtn?.addEventListener('click', () => {
      const open = howPanel?.classList.toggle('hidden') === false;
      howBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    this._bindVolumeControls();
    this._bindGraphicsControls();

    document.addEventListener('pointerlockchange', () => {
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
        return;
      }
      this.clock.getDelta();
      this._mpWakeGrace = 0.75;
    });

    window.addEventListener('keydown', (e) => {
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
          this.ui.showMiniScoreboard(this._scoreboardEntries(), true);
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
    try {
      this.mp?.disconnect();
    } catch (_) {}
    this.mp = null;
    this.lan = null;
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
        if (msg.headshot) this.audio.playHeadshot?.();
        else this.audio.playHit?.();
      }
      if (msg.victimId === localId) {
        this.audio.playHurt?.();
        const punch = msg.headshot ? 0.014 : 0.008;
        this.hitPunch.pitch += punch;
      }
      return;
    }

    if (msg.kind === 'kill') {
      const killer = this.mpMatch?.pawns?.get(msg.attackerId);
      const victim = this.mpMatch?.pawns?.get(msg.victimId);
      const killerName = killer?.name || (msg.attackerId === localId ? 'YOU' : 'Player');
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
        this.respawnTimer = 3;
        this.ui.showDeath?.(killerName, this.respawnTimer);
        document.exitPointerLock?.();
        this.audio.playDeath?.();
      }
      if (msg.attackerId === localId) {
        this.audio.playKill?.();
        this.ui.showKillConfirm?.();
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

    if (msg.kind === 'match_end') {
      const won = msg.winnerId === localId;
      this._endMatch(won);
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
    this.medkits.spawnDefault();
    this.bots.clear();

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
      onEvent: (ev) => this._onMpEvent(ev),
    });
    this.mpMatch.attachScene(this.scene);
    this.mpMatch.begin(this.lan?.room || { players: [] }, this.mapData?.spawnPoints);

    const localPawn = this.mpMatch.pawns.get(localId);
    const spawn = localPawn
      ? localPawn.position.clone()
      : this._playerSpawn();
    this.player.fullMatchReset(spawn);
    if (localPawn) {
      localPawn.yaw = this.player.yaw;
      localPawn.pitch = this.player.pitch;
    }
    this.weapons.resetAll();
    this.ui.hideVictory();
    this.ui.hideDeath();
    this.ui.showPause(false);
    this.ui.showHUD();
    this.ui.updateStats(this.player);
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
    this.clock.getDelta();
  }

  _bindVolumeControls() {
    const syncSliders = (vol01, muted) => {
      const pct = Math.round(vol01 * 100);
      for (const id of ['volume-slider', 'volume-slider-pause']) {
        const el = document.getElementById(id);
        if (el) el.value = String(pct);
      }
      for (const id of ['mute-toggle', 'mute-toggle-pause']) {
        const el = document.getElementById(id);
        if (el) el.checked = !!muted;
      }
    };
    const onVol = (e) => {
      const v = Number(e.target.value) / 100;
      this.audio.unlock();
      this.audio.setVolume(v);
      syncSliders(this.audio.getVolume(), this.audio.isMuted());
    };
    const onMute = (e) => {
      this.audio.unlock();
      this.audio.setMuted(e.target.checked);
      syncSliders(this.audio.getVolume(), this.audio.isMuted());
    };
    for (const id of ['volume-slider', 'volume-slider-pause']) {
      document.getElementById(id)?.addEventListener('input', onVol);
    }
    for (const id of ['mute-toggle', 'mute-toggle-pause']) {
      document.getElementById(id)?.addEventListener('change', onMute);
    }
    syncSliders(this.audio.getVolume(), this.audio.isMuted());
  }

  /** Phase 0: minimal graphics preset control on the pause screen. Safe no-op if missing. */
  _bindGraphicsControls() {
    const select = document.getElementById('graphics-preset-select');
    if (!select) return;
    try {
      select.value = getSettings().graphicsPreset;
    } catch (err) {
      console.warn('[Game] Failed to read saved graphics preset', err);
    }
    select.addEventListener('change', (e) => {
      setGraphicsPreset(e.target.value);
      applyToGame(this);
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
    this.medkits.spawnDefault();
    this.bots.spawnAll(BOT_COUNT);

    const spawn = this._playerSpawn();
    this.player.fullMatchReset(spawn);
    this.weapons.resetAll();
    this.ui.hideVictory();
    this.ui.hideDeath();
    this.ui.showPause(false);
    this.ui.showHUD();
    this.ui.updateStats(this.player);
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
    this.clock.getDelta();
  }

  _requestPointerLock() {
    const p = this.canvas.requestPointerLock?.();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  /** Click the game view to capture mouse look (needed after tab switch / dual-window tests). */
  _bindPointerLockClick() {
    this.canvas.addEventListener('click', () => {
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
  }

  resume() {
    if (!this.running || this.matchOver) return;
    this.paused = false;
    this.ui.showPause(false);
    this.audio.unlock();
    this._requestPointerLock();
    this.clock.getDelta();
  }

  _playerSpawn() {
    const pts = this.mapData.spawnPoints || [];
    // Prefer open-road spawns away from house interiors
    const preferred = pts.filter((p) => Math.abs(p.x) < 8 || Math.abs(p.z) > 10);
    const pool = preferred.length ? preferred : pts;
    let best = pool[Math.floor(Math.random() * pool.length)].clone();
    let bestScore = -Infinity;
    for (let i = 0; i < 8; i++) {
      const cand = pool[Math.floor(Math.random() * pool.length)].clone();
      let minBot = 99;
      for (const b of this.bots?.bots || []) {
        if (b.dead) continue;
        minBot = Math.min(minBot, cand.distanceTo(b.position));
      }
      if (minBot > bestScore) {
        bestScore = minBot;
        best = cand;
      }
    }
    best.y = PLAYER_HEIGHT;
    return best;
  }

  _loop() {
    requestAnimationFrame(this._loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.running && !this.paused && !this.matchOver) {
      if (this._mpWakeGrace > 0) this._mpWakeGrace = Math.max(0, this._mpWakeGrace - dt);
      this._update(dt);
    } else {
      // Cinematic orbit on start; gentle snow on all idle menus
      if (!this.running && !this.matchOver) {
        this.menuCam.update(dt);
        if (this.weapons?.viewModel) this.weapons.viewModel.visible = false;
      }
      this.particles.update(dt * 0.5);
    }

    if (this._postEnabled && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
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
      this.ui.updateDeathTimer(Math.max(0, this.respawnTimer));
    }

    // Scope sensitivity uses last frame's aim state (ADS hold or optic)
    this.player._scopedLook = this.weapons.isAiming?.() || this.weapons.isScoped();

    const botAgents = this.bots
      .getAliveBots()
      .map((b) => ({ x: b.position.x, z: b.position.z }));
    const moveState = this.player.update(
      dt,
      this.mapData.colliders,
      this.mapData.floors,
      botAgents
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
    this.ui.updateStats(this.player);

    // Refresh Tab scoreboard while held
    if (this._tabScoreboard) {
      this.ui.showMiniScoreboard(this._scoreboardEntries(), true);
    }

    // Check win conditions
    this._checkMatchEnd();
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
      entries.sort((a, b) => b.kills - a.kills || a.name.localeCompare(b.name));
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
              { kind: 'sphere', center: head, radius: 0.24, headshot: true },
              { kind: 'sphere', center: bot.character.getChestWorldPosition(), radius: 0.3 },
            ];

      for (const vol of volumes) {
        const hit =
          vol.kind === 'capsule'
            ? this._rayHitsCapsule(shot.origin, shot.direction, vol.a, vol.b, vol.radius)
            : this._rayHitsSphere(shot.origin, shot.direction, vol.center, vol.radius);
        if (!hit || hit.dist > bestDist || hit.dist < 0.05) continue;
        if (this._shotBlocked(shot.origin, hit.point, hit.dist)) continue;
        const headshot = !!vol.headshot && hit.point.distanceTo(head) <= (vol.radius ?? 0.24) + 0.05;
        best = {
          bot,
          dist: hit.dist,
          headshot,
          point: hit.point,
        };
        bestDist = hit.dist;
      }
    }

    if (!best) return;

    const dmg = Math.round(shot.damage * (best.headshot ? 1.5 : 1));
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
    if (best.headshot) this.audio.playHeadshot();
    else this.audio.playHit();
    // Small temporary camera hit punch (decays in _update)
    const punch = best.headshot ? 0.014 : 0.008;
    this.hitPunch.pitch += punch;
    this.hitPunch.yaw += (Math.random() - 0.5) * (best.headshot ? 0.012 : 0.008);

    if (result.killed) {
      this._playerGotKill(best.bot, shot.weaponId);
    }
  }

  _rayHitsSphere(origin, dir, center, radius) {
    const oc = origin.clone().sub(center);
    const b = oc.dot(dir);
    const c = oc.dot(oc) - radius * radius;
    const disc = b * b - c;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    let t = -b - s;
    if (t < 0) t = -b + s;
    if (t < 0 || t > 200) return null;
    return { dist: t, point: origin.clone().addScaledVector(dir, t) };
  }

  /**
   * Ray vs finite capsule (segment a→b + radius). Covers torso between pelvis and head.
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

  _playerGotKill(bot, weaponId) {
    this.player.kills += 1;
    this.player.killStreak += 1;
    // Kill feed + donut are guaranteed in _onBotDeath (single source of truth)
    this.ui.updateStats(this.player);
    // Loadout stays manual: 1 = Pistol, 2 = M16 (no auto-swap on kill)

    // Kill juice: flash, confirm, sting, confetti burst at death pos
    this.ui.showKillFlash?.();
    this.ui.showKillConfirm?.();
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

    // Hitscan vs player
    const head = this.player.position.clone();
    const chest = this.player.position.clone();
    chest.y -= 0.35;

    let hit = this._rayHitsSphere(shot.origin, shot.direction, head, 0.28);
    let headshot = true;
    if (!hit) {
      hit = this._rayHitsSphere(shot.origin, shot.direction, chest, 0.45);
      headshot = false;
    }
    if (!hit || hit.dist > shot.range) return;
    if (this._shotBlocked(shot.origin, hit.point, hit.dist)) return;

    if (this.spawnGuard > 0) return;
    const dmg = Math.round(shot.damage * (headshot ? 1.2 : 1) * 0.55);
    const killed = this.player.takeDamage(dmg);
    this.particles.bloodPuff(hit.point);
    this.audio.playHurt?.();
    this.ui.updateStats(this.player);
    // Screen hurt flash
    const app = document.getElementById('app');
    if (app) {
      app.classList.remove('hurt');
      void app.offsetWidth;
      app.classList.add('hurt');
      setTimeout(() => app.classList.remove('hurt'), 280);
    }

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

  _endMatch(playerWon) {
    this.matchOver = true;
    this.running = false;
    this.matchFlow = endMatch(this.matchFlow || createMatchFlow());
    this.ui.hideMatchCallout?.();
    this._tabScoreboard = false;
    this.ui.showMiniScoreboard(null, false);
    document.exitPointerLock?.();

    this.ui.showVictory(this._scoreboardEntries(), playerWon);
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
          ? 'Press E to close door'
          : 'Press E to open door';
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

    const near = this.medkits.getNearby(this.player.position);
    if (near) {
      if (prompt) {
        prompt.textContent = 'Press E to take medkit!';
        prompt.classList.remove('hidden');
      }
      if (this.player.consumeUsePress()) {
        const healed = this.medkits.tryPickup(this.player.position, () => {
          this.player.health = this.player.maxHealth;
          this.player.timeSinceDamage = 99;
          this.audio.playDonutPickup?.();
          this.ui.updateStats(this.player);
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

    prompt?.classList.add('hidden');
    this.player.usePressed = false;
  }

  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, GFX.maxPixelRatio));
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
      this._syncFxaaResolution(w, h);
    }
  }
}
