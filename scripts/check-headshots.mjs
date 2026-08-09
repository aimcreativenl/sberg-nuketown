/**
 * Combat authority regression: headshots are direct kills, while body shots
 * retain their normal damage. Exercises the real bot and MP match paths.
 */
import * as THREE from 'three';
import { BotManager } from '../src/game/BotAI.js';
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
