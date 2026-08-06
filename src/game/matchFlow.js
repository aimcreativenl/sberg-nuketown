/**
 * Pure match fantasy helpers — countdown → FIGHT → live → over.
 * Testable without WebGL / DOM.
 */

export const MATCH_PHASE = {
  idle: 'idle',
  countdown: 'countdown',
  live: 'live',
  over: 'over',
};

/**
 * @returns {{ phase: string, countdown: number, lastCallout: string|null, fightAnnounced: boolean }}
 */
export function createMatchFlow() {
  return {
    phase: MATCH_PHASE.idle,
    countdown: 0,
    lastCallout: null,
    fightAnnounced: false,
  };
}

/**
 * Start pre-fight countdown (default 3 seconds).
 * @param {ReturnType<typeof createMatchFlow>} flow
 * @param {number} seconds
 */
export function beginCountdown(flow, seconds = 3) {
  const s = Math.max(1, seconds);
  return {
    ...flow,
    phase: MATCH_PHASE.countdown,
    countdown: s,
    lastCallout: String(Math.ceil(s)),
    fightAnnounced: false,
  };
}

/**
 * Advance countdown by dt. When finished → live + FIGHT! callout once.
 * @param {ReturnType<typeof createMatchFlow>} flow
 * @param {number} dt
 */
export function tickCountdown(flow, dt) {
  if (!flow || flow.phase !== MATCH_PHASE.countdown) return flow;
  const next = flow.countdown - Math.max(0, dt);
  if (next <= 0) {
    return {
      ...flow,
      phase: MATCH_PHASE.live,
      countdown: 0,
      lastCallout: 'FIGHT!',
      fightAnnounced: true,
    };
  }
  const label = String(Math.ceil(next));
  return {
    ...flow,
    countdown: next,
    lastCallout: label,
    fightAnnounced: false,
  };
}

/** Mark match finished (victory / defeat). */
export function endMatch(flow) {
  return {
    ...flow,
    phase: MATCH_PHASE.over,
    countdown: 0,
    lastCallout: flow?.lastCallout ?? null,
  };
}

/** Combat is free only in live phase. */
export function isCombatLive(flow) {
  return flow?.phase === MATCH_PHASE.live;
}

/** True while 3-2-1 is running (player/bots should not free-fight). */
export function isCountdown(flow) {
  return flow?.phase === MATCH_PHASE.countdown;
}
