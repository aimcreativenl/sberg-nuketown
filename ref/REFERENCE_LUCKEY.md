# Luckey Faraday Pastel Nuketown — Project reference (video lessons)

**Source:** https://x.com/luckeyfaraday/status/2083357621017346267/video/1  
**Local clip:** `ref/ref_luckey_clip.mp4`  
**Use this file whenever we say “like the Luckey video”.**

---

## What the video shows (remember all of this)

### Identity
- **Pastel toybox FPS** — saturated mint/pink/lilac/yellow, soft lighting, chunky silhouettes.
- Feels **premium multiplayer lobby + FFA**, not milsim.
- Dense Nuketown-like street: two houses, bus, props, nameplates, kill feed, HUD.

### Characters / bots (critical for animation)
- Bots are **blocky avatars with clear walk cycles** — legs pump, arms counter-swing.
- When moving they **never ice-skate**: feet plant, hips bob, torso slightly counters legs.
- Combat stance still shows **leg motion when strafing/repositioning**.
- Aiming raises arms/gun but **locomotion stays alive**.
- Turns are readable; bodies face move or target with a short ease, not teleport spins.
- Nameplates float; outfits are high-contrast pastels.

### Movement / physics feel
- Snappy ground speed; chases feel purposeful.
- Strafing in fights is **continuous arcs**, not random freeze-frames.
- Verticality exists (balconies/props) but primary fights are street-level.
- Death is a clear pose + pickup feedback (donuts in our game).

### World
- Prop density, soft shadows, readable cover (bus, crates, barriers).
- Guns readable in third person on bots.

### Audio/UI (for later)
- Punchy SFX, clean pastel HUD, kill streak popups, scoreboard energy.

---

## Lessons applied to *our* project

| Lesson | Our response |
|--------|----------------|
| Legs must cycle when translating | Drive walk cycle from real displacement / moveSpeed |
| Never disable locomotion on aim | Aim arms ≠ freeze legs |
| Hip pivot at hips, not feet | Leg joints at ~hip height |
| Readable AAA toy walk | Stronger amplitude, knee/foot, torso counter, bob |
| Smooth facing | Lerp yaw toward target/move dir |
| Continuous combat footwork | Deterministic strafe, not random per-frame stop |

---

## Anti-patterns we had (fixed / avoid again)

1. `moving: moving && !aiming` → combat slide.
2. Hip groups at `y=0` → rotation around feet = skate.
3. Per-frame random `wantMove` while “strafing” → stutter/teleport.
4. Instant yaw snap every frame.
5. Animation phase not linked to actual meters moved.

---

## Phase B applied (bot presence)

| Feature | Implementation |
|---------|----------------|
| Roles | `hunter` / `flanker` / `lurker` / `scavenger` per bot |
| Dynamic hunters | `computeMaxHunters(kills, hp)` → 2–6 pressure |
| Cover peek | lurkers + cover-biased roles: hide → peak → shoot |
| Flank | flankers path around player via side offset |
| Aim cone | `aimErrorForDistance` — worse at range |
| Reaction delay | LOS must hold `reactionDelayForRole` before fire |
| Reload toast | `onBotReload` → UI “NAME is reloading!” |
| Tests | `npm run test:phase-b-bots` |

---

## Phase C applied (world density)

| Feature | Implementation |
|---------|----------------|
| Zone set-dress | `zone_mid_street`, `zone_yard`, `zone_house` named props |
| Prop language | `prop_trim_*`, `prop_snowcap_*` on dress pieces |
| Cheap AO | `ao_corner_*`, `ao_mid_street` soft dark slabs |
| Bot read | scarf / goggles / pouch + `bot_read_outline` |
| Atmosphere | `GFX.atmosphere = golden_hour` warm sun/fog/sky |
| Tests | `npm run test:phase-c` |

---

## Phase D applied (show package)

| Feature | Implementation |
|---------|----------------|
| Match flow | `matchFlow.js`: countdown → FIGHT → live → over |
| Go-signal | Center `#match-callout` 3-2-1-FIGHT! + SFX |
| Combat gate | `isCombatLive` — no free fire until FIGHT |
| Audio | `setVolume` / `setMuted`; countdown + fight stings |
| Start copy | Sbarg Nuketown · 1v9 · 1/2 loadout · first to 20 |
| Settings | Volume + mute on start + pause |
| Tests | `test:phase-d-flow`, `test:phase-d-audio`, `test:phase-d-hud` |
