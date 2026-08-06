# Pastel Nuketown / Sbarg Nuketown — Sessie-notities & wijzigingen

**Project (actueel):** `c:\Users\Gebruiker\Desktop\AI projecten\Sbarg Nuketown`  
**Stack:** Three.js r185 + Vite (vanilla JS modules)  
**Play:** `npm run dev` → **http://127.0.0.1:5173/**  
**Laatst bijgewerkt:** 2026-08-04  

> **Voor AI-agents:** lees eerst **`HANDOFF.md`** in de projectroot.  
> Dat is de complete “waar gebleven / niet kapot maken / volgende stappen”-status.  
> Dit CHANGELOG is chronologisch/historisch en deels verouderd van pad/naam.

---

## 1. Spelconcept (huidige staat)

| Item | Status |
|------|--------|
| Mode | Free For All — **1 speler vs 9 AI bots** |
| Doel | Eerste tot **20 kills** |
| Loadout | **1** = Pistol · **2** = M16 (geen auto gun-game swap meer op kill) |
| Donuts | Dode vijanden droppen donut → +50 Fun Points (eroverheen lopen) |
| Medkits | **2** op de map · staan + **E** → full HP |
| Bots | Alleen tegen de speler (geen bot-vs-bot) · max **3 hunters** tegelijk |
| Style | Pastel voxel Nuketown-achtige arena |

### Besturing

| Input | Actie |
|-------|--------|
| WASD | Lopen |
| Space | Springen |
| Shift | Sprint |
| LMB | Schieten (pistool = semi · M16 = full-auto bij vasthouden) |
| RMB | **M16 scope toggle** (alleen M16; pistool negeert) |
| R | Reload (mag als `ammo < magSize`, inclusief 0) |
| E | Medkit oppakken (als je erop staat) |
| 1 / 2 | Pistol / M16 |
| Esc | Pauze |
| Tab | Scoreboard (vasthouden) |

---

## 2. Projectstructuur

```
Pastel Town 3/
├── index.html              # HUD, start/pause/victory, scope overlay, medkit prompt
├── package.json
├── README.md
├── CHANGELOG-SESSION.md    # ← dit bestand
├── src/
│   ├── main.js
│   ├── style.css
│   └── game/
│       ├── Game.js           # Main loop, combat, medkits, scope UI
│       ├── Player.js         # FPS movement, input queue (shoot/reload/scope/use)
│       ├── Weapons.js        # LOADOUT (pistol+M16), viewmodels, fire/reload/scope
│       ├── BotAI.js          # Bot AI (hunters, standoff, aim windup)
│       ├── VoxelCharacter.js # Blocky bots + held weapons + aim pose
│       ├── MapBuilder.js     # Pastel Nuketown map + colliders/floors/spawns
│       ├── Donuts.js         # Fun point pickups
│       ├── Medkits.js        # 2 medkits + E pickup
│       ├── Particles.js      # Muzzle, snow, sparkles, etc.
│       ├── Audio.js          # Procedural Web Audio SFX
│       ├── UI.js             # HUD helpers
│       └── constants.js      # Stats, colors, sensitivity, kill limit
└── ref/                    # Reference frames / verify screenshots (dev)
```

---

## 3. Chronologische wijzigingen (deze sessie)

### 3.1 Basis FPS (eerste build)

- Vite + Three.js scaffold in lege workspace.
- Map: road, bus, pink truck, 2 huizen, crates, fences, lamps, sneeuw.
- FPS controller, 9 bots, donuts, K/D + Fun Points, kill feed, death/victory UI.
- Gun-game progressie bestond oorspronkelijk; later **losgelaten** voor handmatige loadout 1/2.

### 3.2 Viewmodel-geweer onzichtbaar → root cause

- **Bug:** camera zat **niet** in de scene → children (FPS gun) werden nooit gerenderd.
- **Fix in `Game.js`:** `this.scene.add(this.camera);`
- Viewmodel: `MeshBasicMaterial`, `depthTest: false`, parented aan camera.

### 3.3 Geweer te groot

- Viewmodel geometry + scale teruggebracht tot subtiel handpistool (rechtsonder).
- Scale ca. **0.78**, compacte box-proporties.

### 3.4 Ammo & reload (netjes 10→0)

- `currentAmmo` per loadout-slot (integer).
- Elke schot: **exact −1**.
- Reload met **R** als `ammo < magSize` (ook bij 0 of 9).
- Tijdens reload: **niet schieten**.
- Leeg + LMB start ook reload.
- Key **R** negeert `e.repeat`.

### 3.5 Bot-gedrag (meerdere iteraties)

| Onderwerp | Huidige regel |
|-----------|----------------|
| Bot-vs-bot | **Uit** (`simulateBotCombat` is no-op) |
| Target | Alleen de speler |
| Hunters | Max **3** bots mogen chase/attack tegelijk |
| Snelheid | `BOT_SPEED 3.6` · `BOT_SPRINT 5.2` |
| Sight / attack | 30 / 20 |
| Standoff | Stop ~**6.5** · harde min-afstand ~**3.2** |
| Aim | Armen omhoog + **~0.45s windup** vóór schieten |
| Vuurcadans | Langzamer (~0.55–1.0s tussen schoten) |

### 3.6 Schietbetrouwbaarheid (LMB)

- `shootClicks` buffer bij mousedown.
- Semi-auto consumeert buffer **pas bij echt afgevuurde kogel** (`onSemiFire`).
- Voorkomt “dode” klikken tijdens cooldown/frame-gaps.

### 3.7 Loadout: Pistol + M16

- `LOADOUT` in `Weapons.js`: slot 0 pistol (10, semi), slot 1 M16 (30, full-auto).
- Toets **1** / **2** wisselt wapen (eigen ammo per slot).
- Kill-upgrade wapenswaps **uit** (handmatige loadout blijft).
- M16 viewmodel: receiver, barrel, mag, stock, sights.

### 3.8 M16 scope (RMB toggle)

- Alleen als `hasScope: true` (M16).
- **Eén klik RMB** togglet scope (niet hold-to-ADS).
- FOV → ~**22** (`scopeFov`), lage muissens (`SCOPE_SENS_MULT`).
- HTML overlay `#scope-overlay` (vignette + reticle).
- Viewmodel verborgen bij bijna-volledige scope.
- Pistool / wisselen naar 1 → scope uit.

### 3.9 Medkits

- `Medkits.js`: 2 kits op vaste spots `(-14, ·, 10)` en `(14, ·, -10)`.
- Bob + rotatie, rood kruis.
- Dichtbij → prompt: **Press E to take medkit!**
- **E** → HP = 100, kit weg, toast “MEDKIT + FULL HP”.
- Op `startMatch` / rematch: `medkits.spawnDefault()` opnieuw.

---

## 4. Belangrijke constants (`constants.js`)

```
KILL_LIMIT = 20
BOT_COUNT = 9
PLAYER_MAX_HP = 100
RESPAWN_TIME = 3
DONUT_FUN_POINTS = 50
MOUSE_SENS / ADS_SENS_MULT / SCOPE_SENS_MULT / SCOPE_FOV
```

Bot-constants staan in `BotAI.js` (snelheid, hunters, ranges).

---

## 5. API-schetsen (voor latere edits)

### Weapons (`WeaponController`)

- `setLoadoutSlot(0|1)` · `toggleScope()` · `isScoped()`
- `getCurrent()` → LOADOUT entry
- `getAmmo()` → `{ current, mag }`
- `update(dt, input, playerAlive)` input o.a.:
  - `shoot`, `shootClick`, `onSemiFire`, `scopeClick`, `reload`, `weaponSlot`, `moving`, `sprinting`

### Player input queues

- `shootClicks`, `reloadPressed`, `scopeClick`, `usePressed`, `weaponSlotPressed`
- Consumers: `consumeShootClick` (optioneel), `consumeReloadPress`, `consumeScopeClick`, `consumeUsePress`, `consumeWeaponSlot`

### Medkits

- `spawnDefault()` · `getNearby(pos)` · `tryPickup(pos, onHeal)` · `update(dt)`

### Bots

- `spawnAll(9)` · `update(dt)` · `damageBot(id, dmg, info)`
- Callbacks: `getPlayerPosition`, `getPlayerAlive`, `getDonuts`, `onBotDeath`, `onBotShoot`, `onBotReload`

---

## 6. Bekende beperkingen / bewuste keuzes

1. **Gun game auto-upgrade** is uitgezet voor de speler (1/2 loadout).
2. Bots gebruiken nog `WEAPONS` tiers voor visual/weaponIndex op kills; ze schieten vooral “pistol-like” SFX.
3. Medkits respawnen **niet** mid-match (wel bij rematch).
4. Scope is 2D HTML overlay + FOV, geen echte 3D lens-mesh.
5. Pathfinding is waypoint-steering + AABB colliders, geen echte NavMesh.
6. `dist/` is build-output; source of truth is `src/`.

---

## 7. Handige commando’s

```bash
cd "c:\Users\Gebruiker\Documents\Pastel Town 3"
npm install
npm run dev      # http://127.0.0.1:5173/
npm run build
```

Hard refresh bij twijfel over cache: **Ctrl+F5**.

---

## 8. Mogelijke volgende stappen (niet gedaan)

- [ ] Medkits mid-match laten respawnen (timer)
- [ ] Bot difficulty slider / wave-style hunter scaling
- [ ] Echte gun-game opnieuw als optionele mode naast 1/2 loadout
- [ ] Hitmarker/damage polish, headshot multiplier UI
- [ ] Sound volume / mute knop
- [ ] Mobile / gamepad (niet gevraagd)
- [ ] Deploy (Vercel/static host)

---

## 9. Referentiebestanden in repo

- `ref/frame_*.png` — stills uit WhatsApp-referentievideo (stijl)
- `ref/gun_verify*.png/jpg` — dev screenshots viewmodel
- `README.md` — korte play-instructies

---

## Visuele / movement referentie (Luckey)

Zie **`ref/REFERENCE_LUCKEY.md`** voor de volledige analyse van  
https://x.com/luckeyfaraday/status/2083357621017346267/video/1  
(movement, bot walk-cycle, pastel identity, anti-patterns). Bij “maak het zoals de video” → dat bestand.

*Einde sessie-log. Bij een nieuwe chat: lees dit bestand + `ref/REFERENCE_LUCKEY.md` + `src/game/Game.js` eerst.*
