import { PhysicsManager } from '../src/physics/PhysicsManager.js';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from '../src/game/constants.js';

await PhysicsManager.initRapier();
const phys = new PhysicsManager();
// Manually build two step boxes matching pad0/pad1 geometry (no MapBuilder involved).
const RAPIER_ = phys.RAPIER;

function addBox(cx, cy, cz, hx, hy, hz) {
  const rb = phys.world.createRigidBody(RAPIER_.RigidBodyDesc.fixed().setTranslation(cx, cy, cz));
  const cd = RAPIER_.ColliderDesc.cuboid(hx, hy, hz);
  phys.world.createCollider(cd, rb);
}

// Ground plane
addBox(-27.5, -0.1, 0, 20, 0.1, 20);

// pad0: z=[-1.525,-0.675], y=[0.20,0.48]
addBox(-27.5, (0.48 + 0.20) / 2, (-1.525 + -0.675) / 2, 0.575, (0.48 - 0.20) / 2, (-0.675 - -1.525) / 2);
// pad1: z=[-0.675,-0.125], y=[0.43,0.96]
addBox(-27.5, (0.96 + 0.43) / 2, (-0.675 + -0.125) / 2, 0.575, (0.96 - 0.43) / 2, (-0.125 - -0.675) / 2);
// pad2: z=[-0.125, 0.425], y=[0.91, 1.44] approx (following same pattern, prev.topY - 0.05 = 0.91)
addBox(-27.5, (1.44 + 0.91) / 2, (-0.125 + 0.425) / 2, 0.575, (1.44 - 0.91) / 2, (0.425 - -0.125) / 2);

const handle = phys.createPlayerController({
  position: { x: -27.5, y: PLAYER_HEIGHT + 0.05, z: -2.8 },
});

let maxFeet = 0;
for (let i = 0; i < 300; i++) {
  const r = phys.moveCharacter(handle, { wishVelX: 0, wishVelZ: 6, jumpPressed: false, dt: 1 / 60 });
  phys.step(1 / 60);
  const feet = r.y - PLAYER_HEIGHT;
  maxFeet = Math.max(maxFeet, feet);
  if (i % 10 === 0) console.log(i, 'feet', feet.toFixed(3), 'z', r.z.toFixed(3), 'grounded', r.grounded);
}
console.log('maxFeet', maxFeet, 'radius', PLAYER_RADIUS);
