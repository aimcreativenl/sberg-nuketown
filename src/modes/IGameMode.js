/**
 * Documents the shape a match mode should have so `Game.js` can delegate
 * match-start / win / death logic to a swappable mode object.
 * Phase 2c: deathmatch, tdm, ctf, pubg registered in `registry.js`.
 */

/**
 * @typedef {Object} IGameMode
 * @property {string} id - Stable identifier, e.g. 'deathmatch'.
 * @property {string} name - Display name, e.g. 'Deathmatch'.
 * @property {boolean} [allowLateJoin] - Whether join is allowed after lobby (room also uses ROOM_MODES).
 * @property {number} [killLimit] - FFA kill goal (deathmatch).
 * @property {number} [teamScoreLimit] - Team kill goal (tdm).
 * @property {number} [captureLimit] - Captures to win (ctf).
 * @property {string[]} [teams] - Team ids when applicable, e.g. ['alpha','bravo'].
 * @property {boolean} [friendlyFire]
 * @property {boolean} [allowRespawn] - False for Battle Royale (no mid-match revive).
 * @property {object} [zone] - BR zone stub / config data.
 * @property {(ctx: object) => void} [onMatchStart] - Called when a match begins (countdown → live).
 * @property {(ctx: object, victim: object, killer: object|null) => void} [onDeath] - Called whenever any combatant dies.
 * @property {(ctx: object, killer: object, victim: object) => void} [onKill] - Called on a confirmed kill credit.
 * @property {(state: { kills?: number, teamKills?: object, captures?: object, aliveCount?: number, playerCount?: number, eliminatedCount?: number, [key: string]: any }) => boolean} checkWin - Returns true when the match should end.
 * @property {(ctx: object) => {x:number,y:number,z:number}} [getSpawn] - Returns a spawn point for a respawning combatant.
 */

export {};
