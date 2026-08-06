export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    /** Master volume 0–1 (used when not muted) */
    this.volume = 0.35;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this._applyGain();
      return;
    }
    const AC =
      (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) ||
      null;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this._applyGain();
  }

  _applyGain() {
    if (!this.master) return;
    const v = this.muted ? 0 : Math.max(0, Math.min(1, this.volume));
    this.master.gain.value = v;
  }

  /** @param {number} v 0–1 */
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, Number(v) || 0));
    this._applyGain();
    return this.volume;
  }

  getVolume() {
    return this.volume;
  }

  setMuted(m) {
    this.muted = !!m;
    this._applyGain();
    return this.muted;
  }

  isMuted() {
    return !!this.muted;
  }

  _now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  _env(gain, t0, a, d, s, r, peak = 1) {
    gain.gain.cancelScheduledValues(t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + a);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, s * peak), t0 + a + d);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d + r);
  }

  _noise(duration) {
    const sr = this.ctx.sampleRate;
    const n = Math.floor(sr * duration);
    const buf = this.ctx.createBuffer(1, n, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  playShoot(weaponType = 'pistol') {
    if (!this.ctx || this.muted) return;
    // Always unlock-safe
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = this._now();

    // Clear, punchy pistol report (also used as base for other guns)
    if (weaponType === 'pistol' || !weaponType) {
      // Layer 1: sharp transient crack
      const crack = this.ctx.createBufferSource();
      crack.buffer = this._noise(0.08);
      const crackF = this.ctx.createBiquadFilter();
      crackF.type = 'highpass';
      crackF.frequency.value = 1800;
      const crackG = this.ctx.createGain();
      this._env(crackG, t, 0.0005, 0.01, 0.15, 0.05, 0.9);
      crack.connect(crackF);
      crackF.connect(crackG);
      crackG.connect(this.master);
      crack.start(t);

      // Layer 2: body boom
      const body = this.ctx.createOscillator();
      body.type = 'triangle';
      body.frequency.setValueAtTime(140, t);
      body.frequency.exponentialRampToValueAtTime(55, t + 0.12);
      const bodyG = this.ctx.createGain();
      this._env(bodyG, t, 0.001, 0.04, 0.25, 0.1, 0.7);
      body.connect(bodyG);
      bodyG.connect(this.master);
      body.start(t);
      body.stop(t + 0.18);

      // Layer 3: metallic snap
      const snap = this.ctx.createOscillator();
      snap.type = 'square';
      snap.frequency.setValueAtTime(520, t);
      snap.frequency.exponentialRampToValueAtTime(180, t + 0.06);
      const snapG = this.ctx.createGain();
      this._env(snapG, t, 0.0005, 0.015, 0.1, 0.04, 0.35);
      snap.connect(snapG);
      snapG.connect(this.master);
      snap.start(t);
      snap.stop(t + 0.1);
      return;
    }

    const configs = {
      smg: { f: 220, d: 0.05, noise: 0.1 },
      shotgun: { f: 90, d: 0.28, noise: 0.4 },
      ar: { f: 160, d: 0.09, noise: 0.14 },
      sniper: { f: 70, d: 0.4, noise: 0.28 },
    };
    const c = configs[weaponType] || { f: 180, d: 0.12, noise: 0.15 };

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(c.f, t);
    osc.frequency.exponentialRampToValueAtTime(c.f * 0.4, t + c.d);
    this._env(g, t, 0.001, c.d * 0.3, 0.2, c.d * 0.7, 0.55);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + c.d + 0.05);

    const src = this.ctx.createBufferSource();
    src.buffer = this._noise(c.d);
    const ng = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1400;
    this._env(ng, t, 0.001, 0.02, 0.15, c.d, c.noise);
    src.connect(filter);
    filter.connect(ng);
    ng.connect(this.master);
    src.start(t);
  }

  playReload() {
    if (!this.ctx || this.muted) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = this._now();

    // 1) Mag release click
    const click1 = this.ctx.createOscillator();
    click1.type = 'square';
    click1.frequency.value = 180;
    const g1 = this.ctx.createGain();
    this._env(g1, t, 0.001, 0.02, 0.1, 0.05, 0.4);
    click1.connect(g1);
    g1.connect(this.master);
    click1.start(t);
    click1.stop(t + 0.08);

    // 2) Mag out (rattly noise)
    const n1 = this.ctx.createBufferSource();
    n1.buffer = this._noise(0.12);
    const nf1 = this.ctx.createBiquadFilter();
    nf1.type = 'bandpass';
    nf1.frequency.value = 900;
    const ng1 = this.ctx.createGain();
    this._env(ng1, t + 0.06, 0.005, 0.04, 0.2, 0.08, 0.35);
    n1.connect(nf1);
    nf1.connect(ng1);
    ng1.connect(this.master);
    n1.start(t + 0.06);

    // 3) Mag in clack
    const click2 = this.ctx.createOscillator();
    click2.type = 'triangle';
    click2.frequency.setValueAtTime(240, t + 0.45);
    click2.frequency.exponentialRampToValueAtTime(120, t + 0.55);
    const g2 = this.ctx.createGain();
    this._env(g2, t + 0.45, 0.001, 0.03, 0.15, 0.08, 0.55);
    click2.connect(g2);
    g2.connect(this.master);
    click2.start(t + 0.45);
    click2.stop(t + 0.6);

    // 4) Slide rack
    const n2 = this.ctx.createBufferSource();
    n2.buffer = this._noise(0.1);
    const nf2 = this.ctx.createBiquadFilter();
    nf2.type = 'highpass';
    nf2.frequency.value = 2200;
    const ng2 = this.ctx.createGain();
    this._env(ng2, t + 0.75, 0.001, 0.02, 0.15, 0.08, 0.45);
    n2.connect(nf2);
    nf2.connect(ng2);
    ng2.connect(this.master);
    n2.start(t + 0.75);

    // 5) Final seat click
    const click3 = this.ctx.createOscillator();
    click3.type = 'sine';
    click3.frequency.value = 680;
    const g3 = this.ctx.createGain();
    this._env(g3, t + 0.95, 0.001, 0.02, 0.1, 0.06, 0.3);
    click3.connect(g3);
    g3.connect(this.master);
    click3.start(t + 0.95);
    click3.stop(t + 1.1);
  }

  playHit() {
    if (!this.ctx || this.muted) return;
    const t = this._now();
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.08);
    this._env(g, t, 0.001, 0.03, 0.2, 0.06, 0.35);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  playHeadshot() {
    if (!this.ctx || this.muted) return;
    const t = this._now();
    [1200, 1600, 2000].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      this._env(g, t + i * 0.03, 0.001, 0.04, 0.3, 0.1, 0.3);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t + i * 0.03);
      osc.stop(t + 0.2);
    });
  }

  /** Satisfying kill sting — brighter / longer than a body hit */
  playKill() {
    if (!this.ctx || this.muted) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = this._now();
    // Low thud
    const thud = this.ctx.createOscillator();
    const thudG = this.ctx.createGain();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(180, t);
    thud.frequency.exponentialRampToValueAtTime(70, t + 0.14);
    this._env(thudG, t, 0.001, 0.05, 0.25, 0.12, 0.45);
    thud.connect(thudG);
    thudG.connect(this.master);
    thud.start(t);
    thud.stop(t + 0.22);
    // Rising chime stack
    [660, 880, 1175, 1568].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = i < 2 ? 'square' : 'sine';
      osc.frequency.value = f;
      const t0 = t + 0.02 + i * 0.045;
      this._env(g, t0, 0.002, 0.05, 0.35, 0.18, 0.28 - i * 0.03);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.32);
    });
  }

  playDeath() {
    if (!this.ctx || this.muted) return;
    const t = this._now();
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.45);
    this._env(g, t, 0.01, 0.15, 0.3, 0.35, 0.4);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.55);
  }

  playDonutPickup() {
    if (!this.ctx || this.muted) return;
    const t = this._now();
    // Bright ding chime
    [1046, 1318, 1568].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      const t0 = t + i * 0.06;
      this._env(g, t0, 0.005, 0.1, 0.4, 0.35, 0.45);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.5);
    });
  }

  playFootstep() {
    if (!this.ctx || this.muted) return;
    const t = this._now();
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise(0.06);
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 400;
    this._env(g, t, 0.001, 0.02, 0.1, 0.04, 0.12);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  playJump() {
    if (!this.ctx || this.muted) return;
    const t = this._now();
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.12);
    this._env(g, t, 0.005, 0.05, 0.2, 0.1, 0.2);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  playKillStreak(count) {
    if (!this.ctx || this.muted) return;
    const t = this._now();
    const base = 500 + count * 40;
    for (let i = 0; i < 4; i++) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = base * (1 + i * 0.25);
      this._env(g, t + i * 0.07, 0.005, 0.06, 0.3, 0.15, 0.22);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t + i * 0.07);
      osc.stop(t + 0.4);
    }
  }

  playUI() {
    if (!this.ctx || this.muted) return;
    const t = this._now();
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 660;
    this._env(g, t, 0.005, 0.05, 0.2, 0.08, 0.2);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  /** Countdown tick (3, 2, 1) */
  playCountdownTick() {
    if (!this.ctx || this.muted) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = this._now();
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(280, t + 0.12);
    this._env(g, t, 0.002, 0.04, 0.2, 0.08, 0.35);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  /** FIGHT! sting */
  playFight() {
    if (!this.ctx || this.muted) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = this._now();
    [523, 659, 784, 1046].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = i % 2 ? 'square' : 'sawtooth';
      osc.frequency.value = f;
      this._env(g, t + i * 0.05, 0.002, 0.06, 0.25, 0.2, 0.28);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t + i * 0.05);
      osc.stop(t + 0.45);
    });
  }

  playHurt() {
    if (!this.ctx || this.muted) return;
    const t = this._now();
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.15);
    this._env(g, t, 0.001, 0.05, 0.2, 0.1, 0.3);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.2);
  }
}
