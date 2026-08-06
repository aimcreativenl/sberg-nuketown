/**
 * Deathmatch mode — Phase 2c wired via `registry.js` (`getModeById` / `MODES`).
 * First-to-KILL_LIMIT; used offline and as the default lobby mode.
 */
import { KILL_LIMIT } from '../game/constants.js';

/** @type {import('./IGameMode.js').IGameMode} */
export const MODE_DEATHMATCH = {
  id: 'deathmatch',
  name: 'Deathmatch',
  killLimit: KILL_LIMIT,
  allowLateJoin: true,

  /**
   * @param {{ kills?: number }} state
   * @returns {boolean}
   */
  checkWin(state = {}) {
    return (state.kills ?? 0) >= MODE_DEATHMATCH.killLimit;
  },
};
