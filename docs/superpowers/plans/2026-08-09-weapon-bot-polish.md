# S'Berg Weapon & Bot Combat Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove weapon-switch misfires, upgrade weapon and bot visuals, smooth bot locomotion, and make headshots immediate authoritative kills in offline and multiplayer play.

**Architecture:** Keep the existing vanilla ES-module game architecture and shared procedural geometry caches. Apply the input fix inside `WeaponController`, visual changes inside `Weapons.js`/`VoxelCharacter.js`, steering changes inside the existing `BotAI` movement block, and lethal headshot rules at the offline damage boundary plus the host MP combat boundary. Add focused executable checks before each production change, then verify the full relevant suite and browser runtime.

**Tech Stack:** Three.js r185, vanilla ES modules, Vite 8, Rapier character controller, Node `.mjs` check scripts, Playwright/in-app browser.

## Global Constraints

- Desktop keyboard/mouse is in scope; touch controls are out of scope for this pass.
- Offline PLAY vs 9 bots must remain playable.
- Multiplayer health, hit location, damage and kills remain host-authoritative.
- Do not add Meshy assets in this pass; do not expose or commit the supplied Meshy API key.
- Preserve existing named weapon parts and public APIs used by recoil/reload, bots, HUD and tests.
- Do not use render geometry as gameplay collision truth.
- Run `npm run test:mp-sync` and `npm run build` before the final completion claim.

---

### Task 1: Lock the switch-trigger regression

**Files:**
- Modify: `scripts/check-phase-a-weapons.mjs`
- Modify: `package.json` only if a separate `test:weapon-switch` script is needed
- Test: `scripts/check-phase-a-weapons.mjs`

**Interfaces:**
- Consumes: `WeaponController.update(dt, input, playerAlive)` and `setLoadoutSlot(slot)`.
- Produces: executable evidence that a slot-change frame cannot fire from held LMB or a buffered semi-auto click.

- [ ] **Step 1: Add the failing behavior checks**

Add a fresh controller scenario that starts on pistol, holds LMB, calls `update()` with `weaponSlot: 1`, and asserts zero shots and unchanged M16 ammo. Add a second scenario with `shootClick: true` on the switch frame and assert zero shots. Then release for one frame and assert that a later fresh pistol click fires exactly one shot.

- [ ] **Step 2: Run the check before production changes**

Run: `node scripts/check-phase-a-weapons.mjs`
Expected: FAIL because the current switch resets `wasShoot` and the new weapon interprets the input as a trigger.

- [ ] **Step 3: Implement the smallest switch-frame gate**

In `src/game/Weapons.js`, capture the prior slot, process the requested slot, derive `switched`, suppress `shootClick`/`triggerPulled` when `switched`, and update `wasShoot` from the current `wantShoot` state. Do not alter ordinary fire/reload behavior.

- [ ] **Step 4: Run the focused check green**

Run: `node scripts/check-phase-a-weapons.mjs`
Expected: PASS, including the existing TTK, recoil, scope and reload assertions.

- [ ] **Step 5: Commit the isolated fix**

Run: `git add src/game/Weapons.js scripts/check-phase-a-weapons.mjs; git commit -m "fix: prevent weapon switch trigger shots"`

### Task 2: Upgrade first-person weapon geometry

**Files:**
- Modify: `src/game/Weapons.js`
- Modify: `src/game/softGeo.js` only if a small reusable cached cylinder/ring helper is genuinely needed
- Modify: `scripts/check-phase-a-weapons.mjs` or create `scripts/check-weapon-geometry.mjs`

**Interfaces:**
- Consumes: existing `buildViewModel(def)`, `vmMat`, `box`, named reload/recoil parts and `muzzleZ`.
- Produces: cached rounded weapon parts with preserved names and a focused geometry/material regression check.

- [ ] **Step 1: Add a failing geometry contract**

Instantiate pistol and M16 viewmodels and assert that their major mesh geometries are not raw `BoxGeometry`, that at least one major part has bevel-generated vertices, and that the viewmodel materials are smooth (`flatShading === false`). Keep assertions based on actual objects, not only source text.

- [ ] **Step 2: Run the geometry check red**

Run: `node scripts/check-weapon-geometry.mjs`
Expected: FAIL because `vmGeo()` currently returns `BoxGeometry` and `vmMat()` sets flat shading.

- [ ] **Step 3: Implement rounded detail helpers**

Import/use the shared rounded geometry cache for box-like parts with three segments and a dimension-aware radius. Add cached low-poly cylinder or ring meshes for barrel/muzzle details where the existing silhouette benefits. Preserve `slide`, `mag`, `handL`, `handR`, `muzzleZ`, reload rest poses, colors and materials.

- [ ] **Step 4: Run focused and existing weapon checks green**

Run: `node scripts/check-weapon-geometry.mjs; node scripts/check-phase-a-weapons.mjs`
Expected: both PASS with no geometry disposal errors.

- [ ] **Step 5: Commit the visual upgrade**

Run: `git add src/game/Weapons.js src/game/softGeo.js scripts/check-weapon-geometry.mjs scripts/check-phase-a-weapons.mjs; git commit -m "feat: soften and detail weapon viewmodels"`

### Task 3: Upgrade bot geometry and materials

**Files:**
- Modify: `src/game/VoxelCharacter.js`
- Modify: `src/game/materials.js` if character material defaults must change
- Modify: `scripts/check-bot-anim.mjs` or create `scripts/check-character-geometry.mjs`

**Interfaces:**
- Consumes: existing `VoxelCharacter`, `setHeldWeapon`, `getHitVolumes`, nameplate and animation part references.
- Produces: smoother shared character geometry/materials without changing hit-volume semantics or public part names.

- [ ] **Step 1: Add a failing character-quality check**

Create a real `VoxelCharacter`, inspect torso/head/limb geometries, and assert major parts use at least three bevel segments (or an equivalent non-box vertex count) and character materials are not flat-shaded. Assert `getHitVolumes()` still returns the head and body volumes.

- [ ] **Step 2: Run it red**

Run: `node scripts/check-character-geometry.mjs`
Expected: FAIL against the current two-segment, flat-shaded character setup.

- [ ] **Step 3: Implement the visual upgrade**

Raise major shared bevel quality and radius, use capsule/sphere-style forms for the most visible shoulders/limbs where appropriate, and switch character materials to smooth shading. Keep caches, outfit colors, outline/nameplate, held-weapon index mapping and hit volumes intact.

- [ ] **Step 4: Run focused bot checks**

Run: `node scripts/check-character-geometry.mjs; node scripts/check-bot-anim.mjs; node scripts/check-phase-b-bots.mjs`
Expected: PASS with all existing role, spawn and animation checks preserved.

- [ ] **Step 5: Commit the bot visual upgrade**

Run: `git add src/game/VoxelCharacter.js src/game/materials.js scripts/check-character-geometry.mjs scripts/check-bot-anim.mjs; git commit -m "feat: polish bot character silhouettes"`

### Task 4: Add smooth bot steering and natural locomotion

**Files:**
- Modify: `src/game/BotAI.js`
- Modify: `src/game/VoxelCharacter.js` only for the small stride/turn blend required by the new actual-speed input
- Modify: `scripts/check-bot-anim.mjs` or create `scripts/check-bot-locomotion.mjs`

**Interfaces:**
- Consumes: existing target direction/state speed, `bot.velocity`, legacy collision path, `_moveBotRapier`, `lerpAngle` and `updateAnimation`.
- Produces: acceleration/deceleration-smoothed horizontal movement while preserving collision, vault, door and combat behavior.

- [ ] **Step 1: Add a failing steering/animation check**

Drive a real `BotManager` through a short update sequence with a reachable target. Record `bot.moveSpeed`; assert the first moving frame is below target speed, later frames approach it, and after the target is cleared speed decays rather than snapping instantly. Keep the existing leg-swing and idle assertions.

- [ ] **Step 2: Run it red**

Run: `node scripts/check-bot-locomotion.mjs`
Expected: FAIL because the current movement uses the full state speed immediately and does not decay a stored steering velocity.

- [ ] **Step 3: Implement bounded steering**

Use the existing `bot.velocity` as horizontal state. Each frame compute desired XZ velocity, move it toward the desired value with separate acceleration/deceleration limits, use the resulting velocity for legacy movement and Rapier wish velocity, and keep `bot.moveSpeed`/`updateAnimation()` driven by the actual resolved displacement. Continue using collision/path checks and preserve vault/door/unstick branches.

- [ ] **Step 4: Run focused movement and regression checks**

Run: `node scripts/check-bot-locomotion.mjs; node scripts/check-bot-anim.mjs; node scripts/check-phase-b-bots.mjs; npm run test:rapier-bots`
Expected: PASS; bots still engage, reload, vault and resolve through Rapier/legacy paths.

- [ ] **Step 5: Commit the locomotion upgrade**

Run: `git add src/game/BotAI.js src/game/VoxelCharacter.js scripts/check-bot-locomotion.mjs scripts/check-bot-anim.mjs; git commit -m "feat: smooth bot steering and locomotion"`

### Task 5: Make headshots authoritative instant kills

**Files:**
- Modify: `src/game/BotAI.js`
- Modify: `src/game/Game.js`
- Modify: `src/net/MpMatch.js`
- Modify/create: `scripts/check-headshots.mjs`

**Interfaces:**
- Consumes: offline `BotManager.damageBot`, `Game._resolvePlayerShot`, MP `_hostCombat`, `PLAYER_MAX_HP`, existing hit/kill events.
- Produces: headshot kills from any positive weapon damage in offline PLAY and host-authoritative MP, with consistent UI damage reporting.

- [ ] **Step 1: Add failing headshot tests**

Create a real `BotManager` with one bot, apply a deliberately low-damage `{headshot:true,isPlayer:true}` hit, and assert the bot is killed, health is zero and the death path fires once. Assert the MP combat source uses `PLAYER_MAX_HP` (or a direct lethal branch) for headshots while body damage remains 28.

- [ ] **Step 2: Run red**

Run: `node scripts/check-headshots.mjs`
Expected: FAIL because offline applies the supplied damage and MP head damage is 42.

- [ ] **Step 3: Implement the two authority-boundary fixes**

In `BotAI.damageBot()`, branch on `attackerInfo.headshot` before subtracting health and preserve the existing callback/death bookkeeping. In `Game._resolvePlayerShot()`, pass/report full bot health for a headshot. In `MpMatch`, use `PLAYER_MAX_HP` for host headshot damage without trusting a client-provided value.

- [ ] **Step 4: Run focused and combat regressions**

Run: `node scripts/check-headshots.mjs; node scripts/check-phase-b-bots.mjs; node scripts/check-phase-a-feedback.mjs; npm run test:mp-sync`
Expected: PASS with body damage and hit/kill event behavior unchanged.

- [ ] **Step 5: Commit the combat rule**

Run: `git add src/game/BotAI.js src/game/Game.js src/net/MpMatch.js scripts/check-headshots.mjs; git commit -m "feat: make headshots lethal"`

### Task 6: Integrate, capture and independently review

**Files:**
- Modify: `CHANGELOG-SESSION.md`
- Modify: `progress.md`
- Modify: `CONTINUITY.md` and `HANDOFF.md` according to the existing closeout rules
- Create: before/after screenshots outside Git or in the existing ignored capture location

**Interfaces:**
- Consumes: all prior commits, existing progress dashboard, Vite game server and browser smoke workflow.
- Produces: reproducible test/build/browser evidence and a reviewer-approved handoff.

- [ ] **Step 1: Run the relevant complete checks**

Run:

```text
npm run test:phase-a-weapons
npm run test:gfx
npm run test:bot-anim
npm run test:phase-b-bots
npm run test:mp-sync
npm run build
```

Also run the new focused geometry, locomotion and headshot checks. Record exact exit codes/output summaries.

- [ ] **Step 2: Perform browser smoke**

Open the active workspace Vite URL, start offline PLAY, verify the first-person rounded weapon, observe a bot, hold LMB while switching, release/click, walk and inspect console errors. Capture a weapon close-up and bot locomotion/arena frame.

- [ ] **Step 3: Dispatch an independent whole-branch reviewer**

Give the reviewer the final diff, the design spec, the complete test output and the five explicit requirements. Require a separate verdict for each requirement, one runtime/screenshot check, and any Critical/Important findings.

- [ ] **Step 4: Fix and re-review any findings**

Do not claim completion while a confirmed Critical or Important finding remains. Re-run the affected tests and browser capture after each fix.

- [ ] **Step 5: Update project history and finish**

Record each commit, changed file group, test evidence, screenshot path and reviewer verdict in `CHANGELOG-SESSION.md` and `progress.md`; update `CONTINUITY.md`/`HANDOFF.md`; leave the active Vite game link available. Do not push or commit secrets.
