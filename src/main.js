import { Game } from './game/Game.js';
import { applyToGame } from './settings/Settings.js';

const canvas = document.getElementById('game-canvas');
if (!canvas) {
  throw new Error('Missing #game-canvas');
}

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
