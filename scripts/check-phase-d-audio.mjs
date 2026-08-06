/**
 * Phase D audio: volume/mute API + invocable SFX methods without throwing.
 */
import { GameAudio } from '../src/game/Audio.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

// Minimal AudioContext mock for Node
class MockGain {
  constructor() {
    this.gain = { value: 1, cancelScheduledValues() {}, setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  }
  connect() {
    return this;
  }
}
class MockOsc {
  constructor() {
    this.frequency = { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} };
    this.type = 'sine';
  }
  connect() {
    return this;
  }
  start() {}
  stop() {}
}
class MockCtx {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.destination = {};
  }
  createGain() {
    return new MockGain();
  }
  createOscillator() {
    return new MockOsc();
  }
  createBiquadFilter() {
    return {
      type: 'lowpass',
      frequency: { value: 0 },
      connect() {
        return this;
      },
    };
  }
  createBuffer(ch, n) {
    return { getChannelData: () => new Float32Array(n) };
  }
  createBufferSource() {
    return {
      buffer: null,
      connect() {
        return this;
      },
      start() {},
      stop() {},
    };
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
}

globalThis.window = {
  AudioContext: MockCtx,
  webkitAudioContext: MockCtx,
};

const audio = new GameAudio();
assert(typeof audio.setVolume === 'function', 'setVolume');
assert(typeof audio.setMuted === 'function', 'setMuted');
assert(typeof audio.playShoot === 'function', 'playShoot');
assert(typeof audio.playHit === 'function', 'playHit');
assert(typeof audio.playKill === 'function', 'playKill');
assert(typeof audio.playCountdownTick === 'function', 'playCountdownTick');
assert(typeof audio.playFight === 'function', 'playFight');

audio.unlock();
assert(audio.ctx, 'ctx created');
assert(audio.master, 'master gain');

const v = audio.setVolume(0.5);
assert(Math.abs(v - 0.5) < 1e-6, 'volume 0.5');
assert(Math.abs(audio.master.gain.value - 0.5) < 1e-6, 'master gain tracks volume');

audio.setMuted(true);
assert(audio.isMuted() === true, 'muted');
assert(audio.master.gain.value === 0, 'mute silences master');

audio.setMuted(false);
assert(audio.master.gain.value === 0.5, 'unmute restores volume');

// Must not throw
for (const fn of [
  () => audio.playShoot('pistol'),
  () => audio.playShoot('ar'),
  () => audio.playHit(),
  () => audio.playKill(),
  () => audio.playCountdownTick(),
  () => audio.playFight(),
  () => audio.playUI(),
]) {
  try {
    fn();
  } catch (e) {
    failures.push(`SFX threw: ${e.message}`);
  }
}

const report = {
  ok: failures.length === 0,
  volume: audio.getVolume(),
  muted: audio.isMuted(),
  failures,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: phase-d audio volume/mute/SFX ok');
