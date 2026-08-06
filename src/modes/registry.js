/**
 * Mode registry — Phase 2c. Resolves mode objects by id for Game / lobby.
 */
import { MODE_DEATHMATCH } from './deathmatch.js';
import { MODE_TDM } from './tdm.js';
import { MODE_CTF } from './ctf.js';
import { MODE_PUBG } from './pubg.js';
import { ROOM_MODES } from '../net/roomLogic.js';

/** @type {Record<string, import('./IGameMode.js').IGameMode>} */
export const MODES = {
  deathmatch: MODE_DEATHMATCH,
  tdm: MODE_TDM,
  ctf: MODE_CTF,
  pubg: MODE_PUBG,
};

/** @returns {import('./IGameMode.js').IGameMode[]} */
export function listModes() {
  return Object.values(MODES);
}

/**
 * @param {string} [id]
 * @returns {import('./IGameMode.js').IGameMode}
 */
export function getModeById(id) {
  return MODES[id] || MODES.deathmatch;
}

/**
 * Bridge to ROOM_MODES lobby labels / late-join flags.
 * @param {string} [id]
 * @returns {{ id: string, label: string, allowLateJoin: boolean }}
 */
export function getRoomModeMeta(id) {
  const room = ROOM_MODES[id] || ROOM_MODES.deathmatch;
  return {
    id: room.id,
    label: room.label,
    allowLateJoin: room.allowLateJoin !== false,
  };
}
