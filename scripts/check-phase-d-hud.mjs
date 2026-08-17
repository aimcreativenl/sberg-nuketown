/**
 * Phase D HUD/start copy honesty + callout helpers.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GameUI } from '../src/game/UI.js';
import { KILL_LIMIT } from '../src/game/constants.js';
import { hitIndicatorAngle, incomingFromYaw, mergeHitDir } from '../src/game/HitFeedback.js';

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
assert(html.includes('btn-settings-start'), 'Settings on start screen');
assert(html.includes('btn-settings-corner'), 'Settings corner control on start screen');
assert(html.includes('btn-host') && html.includes('Host Server'), 'Host Server on start screen');
assert(html.includes('btn-search') && html.includes('Join Server'), 'Join Server on start screen');
assert(html.includes('class="btn-menu"') || html.includes('btn-menu '), 'start menu options are buttons');
assert(html.includes('touch-controls'), 'touch control overlay');
assert(html.includes('rotate-hint'), 'portrait rotate hint');
assert(gameSrc.includes('isTouchPlay'), 'Game detects touch play');
assert(gameSrc.includes('_syncTouchChrome'), 'Game syncs touch chrome');
assert(html.includes('btn-settings-pause'), 'Settings on pause screen');
assert(html.includes('btn-menu-pause') && html.includes('MAIN MENU'), 'Main Menu on pause screen');
assert(gameSrc.includes('returnToMainMenu'), 'pause can return to start screen');
assert(html.includes('settings-overlay'), 'shared settings overlay');
assert(html.includes('Mouse sensitivity'), 'mouse sensitivity control');
assert(html.includes('Aim sensitivity'), 'ADS/scope sensitivity control');
assert(html.includes('Invert up'), 'invert Y control');
assert(html.includes('death-title'), 'death-title element');
assert(html.includes('HEADSHOT!'), 'HEADSHOT callout in HUD');
assert(html.includes('id="hit-vignette"'), 'hit blood vignette in HUD');
assert(html.includes('id="hit-drips"'), 'hit blood drips in HUD');
assert(html.includes('id="hit-dirs"'), 'hit direction compass in HUD');
assert(html.includes('id="blood-toggle"'), 'Blood setting toggle');
assert(uiSrc.includes('showIncomingHit'), 'showIncomingHit');
assert(uiSrc.includes('updateHitFeedback'), 'updateHitFeedback');
assert(gameSrc.includes('showIncomingHit') || gameSrc.includes('_notifyPlayerHit'), 'Game notifies incoming hits');
assert(gameSrc.includes('updateHitFeedback'), 'Game ticks hit compass');

// Compass: yaw 0 looks −Z; +X is screen-right (+90°); turning to face the shot zeros the arrow.
assert(Math.abs(hitIndicatorAngle(0, 0, 0, 0, -10)) < 1e-9, 'shot from front is 0');
assert(Math.abs(hitIndicatorAngle(0, 0, 0, 10, 0) - Math.PI / 2) < 1e-9, 'shot from +X is +90°');
assert(Math.abs(hitIndicatorAngle(0, 0, 0, -10, 0) + Math.PI / 2) < 1e-9, 'shot from −X is −90°');
assert(Math.abs(hitIndicatorAngle(-Math.PI / 2, 0, 0, 10, 0)) < 1e-9, 'turning toward the shot keeps the arrow in front');
assert(incomingFromYaw(0, 0, 0, 0) == null, 'on-top source has no direction');
const merged = mergeHitDir(mergeHitDir([], -1.2), -1.1);
assert(merged.length === 1, 'nearby world hits share one chevron');
assert(mergeHitDir([{ fromYaw: 0, life: 1, peak: 0.8 }], Math.PI).length === 2, 'opposite hits stay two chevrons');
assert(html.includes('SBARG') || html.includes('NUKETOWN'), 'title branding');
assert(!html.includes('sberg-nuketown-keyart.png'), 'start screen does not embed key art image');
assert(html.includes("S'BERG"), 'start screen wordmark');

// UI helpers
assert(uiSrc.includes('showMatchCallout'), 'showMatchCallout');
assert(uiSrc.includes('lastFightCalloutAt'), 'lastFightCalloutAt');
assert(uiSrc.includes('showKillConfirm') || uiSrc.includes('showStreak'), 'kill callouts remain');
assert(uiSrc.includes('showHeadshot'), 'showHeadshot callout');
assert(uiSrc.includes('showSettings'), 'showSettings overlay');

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
ui.showIncomingHit({
  fromX: 8,
  fromZ: 0,
  playerX: 0,
  playerZ: 0,
  playerYaw: 0,
  damage: 18,
  health: 82,
  maxHealth: 100,
});
assert(ui._hitVignette > 0.3, `vignette pulses on hit (got ${ui._hitVignette})`);
assert(ui._hitDirs.length === 1, 'stores a directional chevron');
assert(ui.lastIncomingHitAt > 0, 'records incoming hit time');
const yawAtHit = ui._hitDirs[0].fromYaw;
ui.updateHitFeedback(-Math.PI / 2, 0.05, 0.82);
assert(ui._hitDirs.length === 1, 'chevron persists while turning');
assert(ui._hitDirs[0].fromYaw === yawAtHit, 'world yaw stays put so the arrow tracks look');
ui.setBloodEnabled(false);
assert(ui._bloodEnabled === false, 'blood can be disabled');
ui.clearHitFeedback();
assert(ui._hitDirs.length === 0 && ui._hitVignette === 0, 'clearHitFeedback resets');

const report = { ok: failures.length === 0, failures };
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: phase-d HUD/copy ok');
