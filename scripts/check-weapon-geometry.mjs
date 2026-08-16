/**
 * Task 2 regression check: first-person weapons keep their named animation
 * parts while using shared rounded and cylindrical visual-only geometry.
 */
import { LOADOUT, buildViewModel } from '../src/game/Weapons.js';

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

function meshes(root) {
  const result = [];
  root.traverse((node) => {
    if (node.isMesh) result.push(node);
  });
  return result;
}

for (const weaponId of ['pistol', 'm16']) {
  const def = LOADOUT.find((weapon) => weapon.id === weaponId);
  const viewModel = buildViewModel(def);
  const parts = meshes(viewModel);

  assert(
    parts.every((mesh) => mesh.material?.depthWrite === true && mesh.material?.transparent !== true),
    `${weaponId}: viewmodel materials are opaque and write depth`
  );
  assert(
    parts.every((mesh) => mesh.geometry?.type !== 'BoxGeometry'),
    `${weaponId}: major viewmodel meshes are not raw BoxGeometry`
  );
  assert(
    parts.some(
      (mesh) =>
        (mesh.geometry?.type === 'RoundedBoxGeometry' || mesh.geometry?.type === 'ChamferedBoxGeometry') &&
        (mesh.geometry.attributes.position?.count ?? 0) > 24
    ),
    `${weaponId}: rounded bevel geometry has extra vertex detail`
  );
  assert(
    parts.some((mesh) => mesh.geometry?.type === 'CylinderGeometry'),
    `${weaponId}: includes a cylindrical barrel, muzzle, or sight detail`
  );
  assert(
    parts.every((mesh) => mesh.material?.flatShading === false),
    `${weaponId}: materials use smooth standard-material normals`
  );
  assert(viewModel.getObjectByName('mag'), `${weaponId}: keeps mag reload part`);
  assert(viewModel.getObjectByName('handL'), `${weaponId}: keeps left hand reload part`);
  assert(viewModel.getObjectByName('handR'), `${weaponId}: keeps right hand part`);
  assert(Number.isFinite(viewModel.userData.muzzleZ), `${weaponId}: keeps muzzleZ`);
  assert(
    viewModel.userData.handLRest?.isVector3 && viewModel.userData.handRRest?.isVector3,
    `${weaponId}: keeps hand reload rest poses`
  );
}

const pistol = buildViewModel(LOADOUT.find((weapon) => weapon.id === 'pistol'));
assert(pistol.getObjectByName('slide'), 'pistol: keeps named slide recoil part');

console.log(JSON.stringify({ ok: failures.length === 0, failures }, null, 2));
if (failures.length) {
  console.error(`FAIL: ${failures.join('\n')}`);
  process.exit(1);
}
console.log('PASS: weapon geometry check');
