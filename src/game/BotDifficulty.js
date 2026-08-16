/**
 * Offline PLAY bot skill table. Start-screen picker persists like the map toggle.
 * Medium matches the pre-picker numbers so existing bot tests stay honest.
 */

export const BOT_DIFFICULTY_IDS = ['easy', 'medium', 'difficult', 'extreme'];
export const DEFAULT_BOT_DIFFICULTY = 'medium';
export const BOT_DIFFICULTY_STORAGE_KEY = 'sberg-bot-diff';

/** @typedef {{ id: string, aimWindup: number, accuracy: number, hunterBonus: number, reactionMul: number, speedMul: number, aggression: number, spreadMul: number }} BotDifficultySnap */

/** @type {Record<string, BotDifficultySnap>} */
export const BOT_DIFFICULTY = {
  easy: {
    id: 'easy',
    aimWindup: 0.72,
    accuracy: 0.55,
    hunterBonus: -1,
    reactionMul: 1.85,
    speedMul: 0.78,
    aggression: 0.55,
    spreadMul: 1.8,
  },
  medium: {
    id: 'medium',
    aimWindup: 0.35,
    accuracy: 1,
    hunterBonus: 0,
    reactionMul: 1,
    speedMul: 1,
    aggression: 1,
    spreadMul: 1,
  },
  difficult: {
    id: 'difficult',
    aimWindup: 0.18,
    accuracy: 1.45,
    hunterBonus: 1,
    reactionMul: 0.55,
    speedMul: 1.15,
    aggression: 1.35,
    spreadMul: 0.62,
  },
  extreme: {
    id: 'extreme',
    aimWindup: 0.08,
    accuracy: 1.9,
    hunterBonus: 2,
    reactionMul: 0.28,
    speedMul: 1.32,
    aggression: 1.7,
    spreadMul: 0.35,
  },
};

/** @type {BotDifficultySnap} */
let current = BOT_DIFFICULTY[DEFAULT_BOT_DIFFICULTY];

/** @param {string} [id] @returns {BotDifficultySnap} */
export function resolveBotDifficulty(id) {
  return BOT_DIFFICULTY[id] || BOT_DIFFICULTY[DEFAULT_BOT_DIFFICULTY];
}

/** @returns {BotDifficultySnap} */
export function getBotDifficulty() {
  return current;
}

/** @param {string} [id] @returns {BotDifficultySnap} */
export function setBotDifficulty(id) {
  current = resolveBotDifficulty(id);
  return current;
}

/** @returns {string} */
export function readStoredBotDifficulty() {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_BOT_DIFFICULTY;
    const id = localStorage.getItem(BOT_DIFFICULTY_STORAGE_KEY);
    return BOT_DIFFICULTY[id] ? id : DEFAULT_BOT_DIFFICULTY;
  } catch {
    return DEFAULT_BOT_DIFFICULTY;
  }
}

/** @param {string} id */
export function writeStoredBotDifficulty(id) {
  try {
    if (typeof localStorage === 'undefined') return;
    const resolved = BOT_DIFFICULTY[id] ? id : DEFAULT_BOT_DIFFICULTY;
    localStorage.setItem(BOT_DIFFICULTY_STORAGE_KEY, resolved);
  } catch {
    /* private mode / SSR */
  }
}
