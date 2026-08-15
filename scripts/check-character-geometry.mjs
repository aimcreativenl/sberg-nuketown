/**
 * Bot character visual contract: rounded major forms, shared smooth materials,
 * and gameplay-facing part / hit-volume APIs remain intact.
 */
import { VoxelCharacter } from '../src/game/VoxelCharacter.js';

const failures = [];
function assert(condition, message) {
  if (!condition) failures.push(message);
}

const character = new VoxelCharacter({ name: 'GEOMETRY', outfitIndex: 0 });
const duplicate = new VoxelCharacter({ name: 'GEOMETRY_CACHE', outfitIndex: 0 });

for (const name of ['hips', 'torso', 'head', 'shoulderL', 'shoulderR', 'hipL', 'hipR', 'footL', 'footR']) {
  assert(character[name], `public character part ${name} exists`);
}
assert(typeof character.setHeldWeapon === 'function', 'setHeldWeapon remains public');
assert(typeof character.updateAnimation === 'function', 'updateAnimation remains public');
assert(typeof character.getHitVolumes === 'function', 'getHitVolumes remains public');

const roundedMajorParts = [
  ['torso', character.torso],
  ['head', character.head],
];
for (const [name, part] of roundedMajorParts) {
  assert(part.geometry?.attributes?.position?.count >= 1764, `${name} has at least three-segment rounded-box detail`);
  assert(part.geometry?.userData?.shared === true, `${name} geometry is shared`);
  assert(part.material?.userData?.shared === true, `${name} material is shared`);
  assert(part.material?.flatShading === false, `${name} material uses smooth shading`);
}
assert(character.torso.geometry === duplicate.torso.geometry, 'torso geometry is reused from the shared cache');
assert(character.torso.material === duplicate.torso.material, 'torso material is reused from the shared cache');

for (const [name, part] of [
  ['left shoulder', character.shoulderL.children[0]],
  ['right shoulder', character.shoulderR.children[0]],
  ['left arm', character.armL],
  ['right arm', character.armR],
  ['left leg', character.legL],
  ['right leg', character.legR],
]) {
  assert(
    part?.geometry?.type === 'SphereGeometry' || part?.geometry?.type === 'CapsuleGeometry',
    `${name} uses a rounded non-box silhouette geometry`
  );
  assert(part?.material?.flatShading === false, `${name} material uses smooth shading`);
}

const volumes = character.getHitVolumes();
const headshots = volumes.filter((volume) => volume.headshot === true);
assert(headshots.length === 1, `exactly one headshot volume (got ${headshots.length})`);
assert(headshots[0].radius >= 0.34, `head sphere covers visual cube corners (got ${headshots[0].radius})`);
assert(volumes.length > 1, 'body and limb hit volumes exist');
assert(
  volumes.filter((volume) => volume !== headshots[0]).every((volume) => volume.headshot !== true),
  'all body and limb hit volumes are non-headshot'
);

const report = {
  ok: failures.length === 0,
  majorVertexCounts: Object.fromEntries(roundedMajorParts.map(([name, part]) => [name, part.geometry.attributes.position.count])),
  limbGeometry: [character.armL, character.legL].map((part) => part.geometry.type),
  hitVolumeCount: volumes.length,
  failures,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error(`FAIL: ${failures.join('\n')}`);
  process.exit(1);
}
console.log('PASS: character geometry / material / hit-volume contract ok');
