/**
 * Combat authority regression: headshots are direct kills, while body shots
 * retain their normal damage. Exercises the real bot and MP match paths.
 */
import * as THREE from 'three';
import { BotManager } from '../src/game/BotAI.js';
import { Game } from '../src/game/Game.js';
import { MpMatch } from '../src/net/MpMatch.js';

const failures = [];
function assert(condition, message) {
  if (!condition) failures.push(message);
}

const mapData = {
  colliders: [],
  floors: [],
  spawnPoints: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(4, 0, 0)],
  coverPoints: [],
  waypoints: [],
};

let deathCallbacks = 0;
const bots = new BotManager(new THREE.Scene(), mapData, {
  onBotDeath: () => {
    deathCallbacks += 1;
  },
});
bots.spawnAll(2);

const headshotBot = bots.bots[0];
const headshot = bots.damageBot(headshotBot.id, 1, { headshot: true });
assert(headshot.killed === true, 'low-damage bot headshot kills');
assert(headshot.headshot === true, 'bot headshot result is flagged');
assert(headshotBot.health === 0, `bot headshot health is zero (got ${headshotBot.health})`);
assert(headshotBot.dead === true, 'bot headshot marks bot dead');
assert(deathCallbacks === 1, `bot death callback fires once (got ${deathCallbacks})`);
bots.damageBot(headshotBot.id, 1, { headshot: true });
assert(deathCallbacks === 1, `dead bot does not repeat death callback (got ${deathCallbacks})`);

const bodyBot = bots.bots[1];
const body = bots.damageBot(bodyBot.id, 1, { headshot: false });
assert(body.killed === false, 'low-damage body shot does not kill bot');
assert(bodyBot.health === 99, `body shot keeps normal damage (got ${bodyBot.health})`);
assert(bodyBot.dead === false, 'body shot leaves bot alive');

// Exercise the real offline resolver against the overlapping head/torso hit volumes.
// UI/audio/particles are inert because this test's observable contract is hit selection.
const resolverScene = new THREE.Scene();
const resolverBots = new BotManager(resolverScene, mapData);
resolverBots.spawnAll(1);
resolverScene.updateMatrixWorld(true);
const resolverBot = resolverBots.bots[0];
const resolverHead = resolverBot.character.getHeadWorldPosition();
const resolverOrigin = resolverHead.clone().add(new THREE.Vector3(0, 0, 5));
const resolverContext = {
  bots: resolverBots,
  _rayHitsSphere: Game.prototype._rayHitsSphere,
  _rayHitsCapsule: Game.prototype._rayHitsCapsule,
  _shotBlocked: () => false,
  particles: { bloodPuff() {}, hitSparks() {} },
  ui: { showHitmarker() {}, showDamageNumber() {} },
  audio: { playHeadshot() {}, playHit() {} },
  hitPunch: { pitch: 0, yaw: 0 },
  _playerGotKill() {},
};
Game.prototype._resolvePlayerShot.call(resolverContext, {
  origin: resolverOrigin,
  direction: resolverHead.clone().sub(resolverOrigin).normalize(),
  range: 80,
  damage: 26,
  weaponId: 'pistol',
});
assert(
  resolverBot.health === 0,
  `offline resolver headshot wins over overlapping torso (got ${resolverBot.health})`
);
assert(resolverBot.dead === true, 'offline resolver headshot marks bot dead');

// Bot A's closest body hit is between Bot B's overlapping torso and head hits.
// The resolver must first select B's head, then compare A (4.74m) vs B (4.76m).
const maskingBots = new BotManager(new THREE.Scene(), mapData);
maskingBots.spawnAll(2);
const maskingBodies = [
  { head: new THREE.Vector3(0, 2, -5), radius: 0.26 },
  { head: new THREE.Vector3(0, 0, -5), radius: 0.28 },
];
for (const [index, bot] of maskingBots.bots.entries()) {
  const { head, radius } = maskingBodies[index];
  bot.character.getHeadWorldPosition = () => head.clone();
  bot.character.getHitVolumes = () => [
    ...(index === 1 ? [{ kind: 'sphere', center: head.clone(), radius: 0.24, headshot: true }] : []),
    { kind: 'sphere', center: new THREE.Vector3(0, 0, -5), radius, headshot: false },
  ];
}
const maskingContext = {
  ...resolverContext,
  bots: maskingBots,
};
Game.prototype._resolvePlayerShot.call(maskingContext, {
  origin: new THREE.Vector3(0, 0, 0),
  direction: new THREE.Vector3(0, 0, -1),
  range: 80,
  damage: 26,
  weaponId: 'pistol',
});
assert(maskingBots.bots[0].health === 74, `closest bot body takes damage (got ${maskingBots.bots[0].health})`);
assert(
  maskingBots.bots[1].health === 100,
  `farther bot head does not mask closer bot body (got ${maskingBots.bots[1].health})`
);

function runHostShot(headshot) {
  const match = new MpMatch({ isHost: true, localId: 'attacker' });
  match.begin(
    {
      players: [
        { id: 'attacker', name: 'Attacker' },
        { id: 'victim', name: 'Victim' },
      ],
    },
    [new THREE.Vector3(0, 1.7, 0), new THREE.Vector3(0, 1.7, -4)]
  );
  const attacker = match.pawns.get('attacker');
  const victim = match.pawns.get('victim');
  attacker.lastInput = { fire: true };
  match._hitscan = () => ({ pawn: victim, headshot });
  match._hostCombat(0, {});
  return { victim, events: match._pendingEvents };
}

const mpHeadshot = runHostShot(true);
assert(mpHeadshot.victim.health === 0, `MP headshot health is zero (got ${mpHeadshot.victim.health})`);
assert(mpHeadshot.victim.alive === false, 'MP headshot kills victim');
assert(
  mpHeadshot.events.some((event) => event.kind === 'kill' && event.headshot === true),
  'MP headshot emits existing headshot kill event'
);

const mpBody = runHostShot(false);
const mpBodyHit = mpBody.events.find((event) => event.kind === 'hit');
assert(mpBody.victim.health === 72, `MP body shot health remains 72 (got ${mpBody.victim.health})`);
assert(mpBodyHit?.damage === 28, `MP body damage remains 28 (got ${mpBodyHit?.damage})`);
assert(mpBody.victim.alive === true, 'MP body shot leaves victim alive');

const report = { ok: failures.length === 0, failures };
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: authoritative offline and MP headshots are lethal');
