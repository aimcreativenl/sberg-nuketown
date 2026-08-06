/**
 * Team Deathmatch — Phase 2c mode module.
 * Teams alpha / bravo; win when a team's kill total reaches the limit.
 */
import { KILL_LIMIT } from '../game/constants.js';

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
