# S'Berg Weapon & Bot Combat Polish — Design Specification

Status: execution-ready after the user's reiterated approval of the five requested changes
Date: 2026-08-09

## Goal

Make the desktop FPS feel more deliberate and readable while preserving the pastel/toybox identity: weapon switching must never fire by itself, weapons and bots must have visibly softer and more detailed silhouettes, bots must accelerate and animate naturally, and a headshot must immediately eliminate a bot.

## Scope and constraints

- Desktop keyboard/mouse remains the only input scope for this pass; touch is explicitly out of scope.
- Offline PLAY vs 9 bots remains first-class and must continue to work.
- Multiplayer remains host-authoritative. The client may request a shot, but the host decides hit location, damage, health and kills.
- No Meshy asset is required for this pass. Procedural Three.js geometry is the lowest-risk way to improve both first-person weapons and third-person bot weapons while matching the existing pastel palette, cache strategy and collision proxies. Meshy remains useful later for a single hero weapon or prop after the procedural baseline is proven.
- The Meshy key already supplied by the user must not be written to source, docs, Git, screenshots or logs.

## Current causes

1. `WeaponController.update()` calls `setLoadoutSlot()` and that method resets `wasShoot` to `false`. If LMB is still down after a switch, the new weapon interprets the held button as a fresh trigger; a queued semi-auto click can do the same.
2. `Weapons.js` builds nearly every viewmodel part with `BoxGeometry` and `flatShading: true`, so the many parts still read as small cubes.
3. `VoxelCharacter.js` already has rounded boxes, but uses only two bevel segments and a very small radius; the silhouette and materials therefore remain blocky at gameplay distance.
4. `BotAI.js` computes a target direction and applies the full target speed immediately. The existing animation receives actual movement speed, but the locomotion input itself has abrupt starts, stops and direction changes.
5. Offline damage applies only a 1.5× head multiplier and multiplayer uses a fixed 42 head damage value, so a headshot is not an authoritative one-hit kill.

## Design

### 1. Weapon-switch trigger gate

`WeaponController.update()` records the slot before processing `input.weaponSlot`. When the slot changes, the current frame becomes a switch frame:

- do not consume `shootClick`;
- do not create an automatic shot, even when LMB is held;
- set `wasShoot` to the actual current `input.shoot` state before returning/continuing, so a held button stays held and must be released before a later semi-auto edge can fire;
- preserve normal auto-fire, semi-auto edge, reload, scope and ammo behavior on all non-switch frames.

This is an input-state fix, not an arbitrary cooldown. It prevents both the observed one/two-shot switch burst and future buffered-click variants.

### 2. Higher-quality weapon presentation

Keep the existing named parts (`slide`, `mag`, `muzzleZ`, `handL`, `handR`) and viewmodel positions so recoil/reload code remains compatible. Replace the shared box geometry path with a cached rounded-box path using three bevel segments and a dimension-aware radius. Add cached low-poly cylinders/rings for barrels, muzzle collars and other naturally round details. Use smooth standard-material normals for weapon parts while retaining the pastel metal/plastic roughness presets. Add small, high-contrast details (rail, sight, trigger guard, muzzle collar and grip panels) only where they improve the silhouette at first-person scale.

No new gameplay collider is derived from render geometry; weapons remain visual-only.

### 3. Higher-quality bot visuals

Increase shared character bevel quality to three segments for major parts and give torso, head, shoulder and limb parts a larger proportionate radius. Use rounded/capsule-like geometry for the most visible limb and shoulder forms, while keeping tiny accessories on the cheaper rounded-box path. Disable the character material's blanket flat shading so the bevels catch light; preserve the existing palette, outfit variation, outline shell, nameplate and held-weapon tier API. All shared geometry/material caches remain in place to avoid one material or geometry allocation per frame.

### 4. Natural bot locomotion

Introduce a small steering layer inside the existing BotAI movement block:

- derive a desired horizontal velocity from the current AI direction and state speed;
- accelerate toward that velocity and decelerate toward zero when a target is reached or the state stops moving;
- smooth heading with the existing `lerpAngle`, using the actual steering velocity for travel-facing states and the player-facing heading during combat aim;
- pass the smoothed speed to Rapier and the legacy resolver, preserving door opening, fence vaulting, wall checks, player separation and host/offline authority;
- retain actual `bot.moveSpeed` as the animation source, with a small stride/turn sway and grounded blend in `VoxelCharacter.updateAnimation()`.

The change is deliberately local to steering/animation inputs; it does not introduce a navmesh or alter collision truth.

### 5. Authoritative headshots

Offline `BotManager.damageBot()` treats `attackerInfo.headshot === true` as lethal regardless of weapon damage, updates the bot health bar to zero and routes through the existing death/respawn callback exactly once. `Game._resolvePlayerShot()` reports the bot's full health as the headshot damage number so the UI matches the kill.

Multiplayer host combat uses `PLAYER_MAX_HP` for the headshot damage constant (or an equivalent direct lethal branch) and keeps the existing hit/kill event fields and host authority. Body damage remains unchanged. A headshot test covers both offline runtime damage and the MP source/constant contract.

## Verification matrix

- `test:phase-a-weapons` plus a new switch regression: held LMB and buffered semi-auto click on a slot-change frame produce zero shots; release and click later produce exactly one shot.
- `test:bot-anim` plus a new geometry/locomotion assertion: higher-segment rounded geometry is used, idle remains quiet, movement has leg swing, and a short acceleration/deceleration sequence changes speed continuously rather than teleporting between zero and target speed.
- A new headshot test creates a real `BotManager`, applies a low-damage headshot, and asserts `killed === true`, `health === 0`, `dead === true`; it also checks the multiplayer headshot damage contract.
- Existing map, Rapier, bot, feedback and `test:mp-sync` suites remain green.
- `npm run build` remains green; the existing large-chunk warning is acceptable if no new runtime error appears.
- Browser smoke on the active Vite server: start offline PLAY, capture the first-person weapon and at least one bot, switch with LMB held, move for several seconds, and inspect console errors. Save before/after screenshots and note commit IDs in `CHANGELOG-SESSION.md`/`progress.md`.

## Meshy decision

Meshy is not used for the first implementation. It would be useful for a later hero asset if a generated GLB materially beats the procedural silhouette after import, pivot, scale, material and performance review. It is not the right tool for trigger state, locomotion or headshot logic, and using it now would add an asset pipeline without addressing the underlying gameplay issues.
