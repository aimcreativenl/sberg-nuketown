/**
 * Phase D match flow: countdown → FIGHT → live; victory phase.
 */
import {
  createMatchFlow,
  beginCountdown,
  tickCountdown,
  endMatch,
  isCombatLive,
  isCountdown,
  MATCH_PHASE,
} from '../src/game/matchFlow.js';
import { GameUI } from '../src/game/UI.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

let flow = createMatchFlow();
assert(flow.phase === MATCH_PHASE.idle, 'starts idle');
assert(!isCombatLive(flow), 'not live at idle');

flow = beginCountdown(flow, 3);
assert(isCountdown(flow), 'countdown started');
assert(flow.lastCallout === '3', `callout 3 got ${flow.lastCallout}`);
assert(!isCombatLive(flow), 'not combat during countdown');

// Advance ~1s → still countdown, label may be 2
flow = tickCountdown(flow, 1.05);
assert(isCountdown(flow), 'still countdown after 1s');
assert(flow.lastCallout === '2' || flow.lastCallout === '3', `label ~2 got ${flow.lastCallout}`);

// Finish countdown
let steps = 0;
while (isCountdown(flow) && steps < 200) {
  flow = tickCountdown(flow, 0.05);
  steps++;
}
assert(isCombatLive(flow), 'live after countdown');
assert(flow.lastCallout === 'FIGHT!', `FIGHT callout got ${flow.lastCallout}`);
assert(flow.fightAnnounced === true, 'fightAnnounced');

flow = endMatch(flow);
assert(flow.phase === MATCH_PHASE.over, 'over');
assert(!isCombatLive(flow), 'not live when over');

// UI callout timestamps
const ui = new GameUI();
ui.showMatchCallout('3');
assert(ui.lastMatchCallout === '3', 'UI lastMatchCallout');
ui.showMatchCallout('FIGHT!', { fight: true });
assert(ui.lastFightCalloutAt > 0, 'lastFightCalloutAt set');
assert(ui.lastMatchCallout === 'FIGHT!', 'FIGHT stored');

const report = { ok: failures.length === 0, failures, steps };
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: phase-d match flow ok');
