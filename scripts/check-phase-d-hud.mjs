/**
 * Phase D HUD/start copy honesty + callout helpers.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GameUI } from '../src/game/UI.js';
import { KILL_LIMIT } from '../src/game/constants.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const uiSrc = fs.readFileSync(path.join(__dirname, '../src/game/UI.js'), 'utf8');
const gameSrc = fs.readFileSync(path.join(__dirname, '../src/game/Game.js'), 'utf8');

// Start screen: current mode (not obsolete gun-game upgrades as primary pitch)
assert(html.includes('First to 20') || html.includes('first to 20') || html.includes(`/${KILL_LIMIT}`), 'kill goal mentioned');
assert(html.includes('1 Pistol') || html.includes('Pistol') && html.includes('M16'), 'loadout 1/2 mentioned');
assert(html.includes('9 AI') || html.includes('AI Bots'), 'AI bots mentioned');
assert(!html.includes('Weapon Upgrades') || html.includes('1 Pistol'), 'no false upgrades-only pitch');
assert(html.includes('volume-slider') || html.includes('Volume'), 'volume control in HTML');
assert(html.includes('death-title'), 'death-title element');
assert(html.includes('SBARG') || html.includes('NUKETOWN'), 'title branding');

// UI helpers
assert(uiSrc.includes('showMatchCallout'), 'showMatchCallout');
assert(uiSrc.includes('lastFightCalloutAt'), 'lastFightCalloutAt');
assert(uiSrc.includes('showKillConfirm') || uiSrc.includes('showStreak'), 'kill callouts remain');

// Game wires countdown
assert(gameSrc.includes('beginCountdown'), 'beginCountdown used');
assert(gameSrc.includes('tickCountdown'), 'tickCountdown used');
assert(gameSrc.includes('isCombatLive'), 'isCombatLive used');
assert(gameSrc.includes('playFight') || gameSrc.includes('playCountdownTick'), 'fight/countdown audio');

const ui = new GameUI();
ui.showMatchCallout('2');
assert(ui.lastMatchCallout === '2', 'callout state');
ui.showKillConfirm?.('ELIMINATED!');
assert(ui.lastKillConfirmAt >= 0, 'kill confirm still works');

const report = { ok: failures.length === 0, failures };
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: phase-d HUD/copy ok');
