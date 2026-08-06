import { Game } from './game/Game.js';
import { applyToGame } from './settings/Settings.js';
import { envSignalUrl, hasRemoteSignalHub } from './net/rtcConfig.js';

const canvas = document.getElementById('game-canvas');
if (!canvas) {
  throw new Error('Missing #game-canvas');
}

/**
 * Wake the Render free-tier hub as soon as someone opens the Vercel site.
 * Fire-and-forget; hub already sends Access-Control-Allow-Origin: *.
 */
function pokeRemoteSignalHub() {
  if (!hasRemoteSignalHub()) return;
  const signal = envSignalUrl() || (typeof window !== 'undefined' && window.__SBARG_SIGNAL_URL__) || '';
  let health = 'https://sbarg-nuketown-hub.onrender.com/health';
  try {
    if (signal) {
      const u = new URL(String(signal).replace(/^ws/i, 'http'));
      health = `${u.origin}/health`;
    }
  } catch (_) {
    /* keep default */
  }
  fetch(health, { method: 'GET', mode: 'cors', cache: 'no-store' }).catch(() => {});
}

pokeRemoteSignalHub();
// Re-poke when tab becomes visible again (helps after idle)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) pokeRemoteSignalHub();
});

// Kick off S'Berg Nuketown
const game = new Game(canvas);

// Phase 0: apply saved graphics preset (safe no-op if a field is missing)
applyToGame(game);

// Expose for debugging
window.__pastelNuketown = game;

// Phase 1a/1b: boot Rapier + build the static physics world before play starts.
// Player.js falls back to its legacy AABB mover if this fails or hasn't resolved yet.
try {
  await game.initPhysics();
} catch (err) {
  console.warn('[main] Rapier physics init failed — falling back to legacy movement', err);
}

console.log('%c🍩 S\'Berg Nuketown loaded — click PLAY to start!', 'color:#ff8fab;font-size:14px;font-weight:bold');
