/**
 * Battle Royale (PUBG-style) — Phase 2c mode module.
 * Late join off once started; zone shrink is data-only for now.
 */
/** @type {import('./IGameMode.js').IGameMode} */
export const MODE_PUBG = {
  id: 'pubg',
  name: 'Battle Royale',
  allowLateJoin: false,
  /** Zone config stub — rendering/shrink tick comes later. */
  zone: { shrinkInterval: 60, stages: 5 },

  /**
   * Last combatant standing.
   * @param {{ aliveCount?: number }} state
   * @returns {boolean}
   */
  checkWin(state = {}) {
    return (state.aliveCount ?? Infinity) <= 1;
  },
};
