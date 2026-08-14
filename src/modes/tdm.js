/**
 * Team Deathmatch — Phase 3: teams alpha / bravo; win on team kill total.
 */
import { KILL_LIMIT } from '../game/constants.js';

/** Pink vs sky — readable at range without replacing VoxelCharacter outfits. */
export const TEAM_OUTFIT = { alpha: 3, bravo: 4 };

/**
 * Prefer house-side spawns: alpha on −X, bravo on +X. Falls back to the full list.
 * @param {Array<{x?:number,clone?:Function}|import('three').Vector3>} spawns
 * @param {string|null} [team]
 * @param {() => number} [rng]
 */
export function pickTeamSpawn(spawns, team, rng = Math.random) {
  const list = spawns || [];
  if (!list.length) return null;
  const pred =
    team === 'alpha' ? (s) => (s.x ?? 0) <= 0 : team === 'bravo' ? (s) => (s.x ?? 0) > 0 : null;
  const pool = pred ? list.filter(pred) : list;
  const use = pool.length ? pool : list;
  return use[Math.floor(rng() * use.length)] || null;
}

/** @param {string|null} [team] @param {number} [fallback] */
export function teamOutfitIndex(team, fallback = 0) {
  if (team === 'alpha') return TEAM_OUTFIT.alpha;
  if (team === 'bravo') return TEAM_OUTFIT.bravo;
  return fallback;
}

/**
 * @param {{ alpha?: number, bravo?: number }} scores
 * @param {number} limit
 * @returns {'alpha'|'bravo'|null}
 */
export function teamReachedLimit(scores = {}, limit = KILL_LIMIT) {
  if ((scores.alpha ?? 0) >= limit) return 'alpha';
  if ((scores.bravo ?? 0) >= limit) return 'bravo';
  return null;
}

/** @type {import('./IGameMode.js').IGameMode} */
export const MODE_TDM = {
  id: 'tdm',
  name: 'Team Deathmatch',
  teamScoreLimit: KILL_LIMIT || 30,
  teams: ['alpha', 'bravo'],
  friendlyFire: false,
  allowLateJoin: true,

  /**
   * @param {{ teamKills?: { alpha?: number, bravo?: number } }} state
   * @returns {boolean}
   */
  checkWin(state = {}) {
    const limit = MODE_TDM.teamScoreLimit;
    const tk = state.teamKills || {};
    return (tk.alpha ?? 0) >= limit || (tk.bravo ?? 0) >= limit;
  },

  /**
   * Optional kill credit — increments team score when ctx.teamKills is provided.
   * @param {{ teamKills?: { alpha?: number, bravo?: number } }} ctx
   * @param {{ team?: string }} killer
   */
  onKill(ctx, killer) {
    if (!ctx?.teamKills || !killer?.team) return;
    const t = killer.team;
    if (t !== 'alpha' && t !== 'bravo') return;
    ctx.teamKills[t] = (ctx.teamKills[t] ?? 0) + 1;
  },
};
