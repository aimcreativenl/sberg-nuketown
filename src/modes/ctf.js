/**
 * Capture the Flag — Phase 2c mode module (rules stub; flag meshes later).
 */
/** @type {import('./IGameMode.js').IGameMode} */
export const MODE_CTF = {
  id: 'ctf',
  name: 'Capture the Flag',
  captureLimit: 3,
  teams: ['alpha', 'bravo'],
  friendlyFire: false,
  allowLateJoin: true,

  /**
   * @param {{ captures?: { alpha?: number, bravo?: number } }} state
   * @returns {boolean}
   */
  checkWin(state = {}) {
    const limit = MODE_CTF.captureLimit;
    const c = state.captures || {};
    return (c.alpha ?? 0) >= limit || (c.bravo ?? 0) >= limit;
  },

  /**
   * Stub — place/reset flags when match goes live (meshes land in a later phase).
   * @param {object} _ctx
   */
  onMatchStart(_ctx) {
    // TODO Phase 2d+: spawn alpha/bravo flag entities at map flag points
  },
};
