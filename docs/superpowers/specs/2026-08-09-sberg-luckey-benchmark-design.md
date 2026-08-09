# S’Berg Nuketown — Luckey benchmark en voortgangsdashboard

Status: voorgestelde uitvoeringsspecificatie, klaar voor gebruikersreview  
Datum: 2026-08-09

## 1. Doel en stijlbesluit

S’Berg Nuketown gebruikt de aangeleverde video als benchmark voor visuele helderheid, leesbare actie, feedbacksnelheid en gameplay-energie. De game wordt geen kopie van de video: de bestaande pastel/toybox-identiteit, eigen arena-opbouw, personages en kleurtaal blijven leidend.

De huidige desktop-ervaring blijft de primaire scope. Touchbediening voor mobiele apparaten valt buiten deze uitvoeringsfase en mag geen reden zijn om desktop-input, offline PLAY of bots te wijzigen.

Het einddoel is een aantoonbare verbetering op twee assen:

1. De speler begrijpt sneller waar hij is, waarop hij schiet, wat de wedstrijdstand is en waarom een kill of hit betekenis heeft.
2. De wereld, wapens en feedback voelen levendiger, rijker en meer als een samenhangende speelgoedarena, zonder de pastel-identiteit te verliezen.

## 2. Scope

### In scope

- Render- en belichtingshelderheid, contrast, kleurhiërarchie, fog en materiaalrespons.
- Camera- en spawnpresentatie zodat de eerste gameplay-frame speelbaar en informatief is.
- Arena-landmarks, cover-readability en de visuele compositie van de centrale speelruimte.
- HUD-feedback voor score, leader, target, vitality/HP, ammo, weapon state, killfeed en matchdoel.
- Weapon identity en presentatie, met enkele geselecteerde hero-assets.
- Gameplay-feedback: hit confirmation, eliminatiefeedback, match pacing en leesbare doelstatus.
- Behoud en verbetering van de bestaande bot- en offline-matchloop.
- Een eigen voortgangspagina met periodieke screenshots, asset-preview, changelog, commitkoppeling en onafhankelijke reviewstatus.
- Meshy-evaluatie en, wanneer de proefasset de kwaliteit en integratiekosten rechtvaardigt, generatie van geselecteerde GLB-assets.
- Git-history per uitvoeringsstap, zodat iedere wijziging afzonderlijk teruggedraaid kan worden.

### Out of scope voor deze fase

- Touchcontrols en mobiele HUD-layout.
- Een volledige vervanging van de procedurele map door een externe asset pack.
- Een volledige vervanging van de bestaande character pipeline.
- Niet-ondersteunde multiplayermechanieken toevoegen zonder server-authoritative ontwerp.
- Een meta- of battle-passysteem bouwen voordat de kernmatch en feedback bewezen beter werken.
- De bestaande pagina op `http://127.0.0.1:8765/` overschrijven of aanpassen.

## 3. Functionele en visuele acceptatiecriteria

### A. Beeld en leesbaarheid

- Een desktop gameplay-capture op 1280×720 toont in de eerste speelbare frame een herkenbare landmark of cover in de centrale beeldzone; een hek of ander foreground-object mag de oriëntatie niet domineren.
- De pastelkleuren blijven aanwezig, maar de scène krijgt een hogere signaal-ruisverhouding: minder grauwe haze, duidelijkere silhouettes en een stabiele scheiding tussen speler, vijand, cover en achtergrond.
- Belangrijke gameplay-objecten zijn onderscheidbaar zonder dat de speler de HUD of een screenshot hoeft te bestuderen.
- De belichting ondersteunt een heldere speelgoedarena in plaats van een donkere of modderige golden-hour look.
- Renderverbeteringen veroorzaken geen nieuwe browser-console errors en houden de bestaande scene performant genoeg voor de huidige desktopdoelgroep.

### B. HUD en combat feedback

- Tijdens een match zijn score, leader, target/matchdoel, vitality/HP, ammo, huidig wapen en recente eliminaties direct afleesbaar.
- Hit, kill, damage en objective-feedback hebben elk een herkenbare visuele toestand; feedback is kort, duidelijk en niet schermvullend.
- De HUD ondersteunt de bestaande offline PLAY-flow en blijft bruikbaar in de bestaande multiplayerflow.
- De HUD introduceert geen touch-only bediening of desktopinput-regressie.

### C. Gameplay-energie

- De speler kan vanuit de eerste speelbare camera direct de arena lezen en een geldige volgende actie kiezen.
- Bots blijven bewegen, aanvallen en reageren volgens de bestaande offline-logica; verbeteringen aan pacing of feedback mogen de autoritatieve netwerkregels niet omzeilen.
- Een match bevat een duidelijke voortgang richting het doel en geeft de speler voldoende feedback om verlies, winst en momentum te begrijpen.
- De bestaande MP-sync-test en build blijven groen na iedere netwerk- of game-statewijziging.

### D. Wapens en Meshy-assets

- Minimaal één weapon-presentation-verbetering wordt gemeten met een before/after screenshot en een korte reviewnotitie.
- Meshy wordt alleen gebruikt voor assets met hoge visuele opbrengst en lage integratierisico’s: bijvoorbeeld een hero-wapen, lollipop/pickup of een duidelijke arena-prop.
- Een gegenereerd asset wordt eerst lokaal beoordeeld op silhouette, schaal, pivot/orientatie, materiaalgedrag, polycount en GLB-import voordat het de gameplay-scene in gaat.
- Gameplay-collision gebruikt eenvoudige, onderhoudbare proxy-colliders; gegenereerde rendergeometrie wordt niet automatisch gameplay-truth.
- De Meshy API-key blijft uitsluitend in een lokale environment variable en komt niet in Git, screenshots, logs, progress-data of documentatie. De door de gebruiker gedeelde sleutel wordt na gebruik geroteerd.

### E. Voortgangspagina

- Er komt een afzonderlijke lokale progress-server op `http://127.0.0.1:8766/`; poort 8765 blijft onaangeroerd.
- De pagina toont minstens: huidige fase, laatste commit, laatste update, overall voortgang, per-subsystem voortgang, reviewstatus, activity log, nieuwste game-link en screenshotgalerij.
- Screenshots worden tijdens actieve uitvoering ongeveer iedere vijf minuten gegenereerd en kunnen ook handmatig via “capture nu” worden vernieuwd.
- Galerie-items zijn getagd als baseline, gameplay, weapon close-up, asset preview, before/after of review en bevatten timestamp, commit en korte context.
- De pagina toont assetpreviews zodra die bestaan, maar publiceert geen secrets of onbedoelde lokale environment-inhoud.
- Een capture-fout maakt de game of de progresspagina niet onbruikbaar; de fout verschijnt als expliciete activity-log-entry.

## 4. Voorgestelde technische opbouw

De bestaande gamecode blijft de bron voor runtimegedrag. De progressfunctionaliteit wordt geïsoleerd in een aparte `progress/`-map, zodat dashboardcode geen game-state of netwerk-authoriteit overneemt.

Beoogde onderdelen:

- `progress/server.mjs`: lokale statische server en JSON-endpoints voor status, log en galerie.
- `progress/index.html`, `progress/styles.css`, `progress/app.js`: dashboardpresentatie in dezelfde pastel/toybox-familie, maar functioneel dicht bij het bekeken voorbeeld.
- `progress/data.json`: machineleesbare voortgang, zonder secrets.
- `progress/gallery/`: door Git genegeerde of expliciet beheerde captures volgens de gekozen opslagstrategie.
- Een capture-script dat de bestaande game-link opent, korte input uitvoert, een screenshot maakt en metadata aan de progress-feed toevoegt.

De game-link op de voortgangspagina wijst naar de actuele Vite-build. De dashboardserver draait los van Vite en van de bestaande service op 8765.

## 5. Werkpakketten en specialistische controles

De uitvoering verloopt sequentieel per werkpakket. Voor elk pakket geldt dezelfde keten: specialistische implementer, onafhankelijke reviewer, gerichte fixes indien nodig, daarna opnieuw reviewen. Een reviewer mag geen succes claimen zonder reproduceerbare test- of screenshot-evidence.

1. Baseline en capture-instrumentatie: reproduceerbare browser-smoke, baseline-screenshots en nulmeting.
2. Progress-dashboard: server, galerij, metadata, handmatige capture en periodieke capture.
3. Render/readability: fog, licht, materialen, contrast, camera en spawnpresentatie.
4. Arena composition: landmarks, cover-readability en visuele oriëntatie.
5. HUD/combat feedback: score, leader, target, vitality, ammo, hit/kill/objective states.
6. Weapon identity: procedurele verbeteringen en één gecontroleerde Meshy-proefasset.
7. Gameplay energy: match feedback, pacing en bot-interactie binnen de bestaande authorityregels.
8. Integratie en polish: before/after review, regressiecontrole en documentatie.

Werkpakketten die dezelfde bestanden of runtime-state raken worden niet parallel geïmplementeerd. Onafhankelijke read-only audits mogen wel parallel worden uitgevoerd wanneer dat geen gedeelde writes oplevert.

## 6. Verificatie en bewijs

Per wijziging worden vastgelegd:

- doel en scope;
- gewijzigde bestanden;
- implementatiecommit;
- testcommando’s en uitkomst;
- browser- of screenshotbewijs;
- reviewer, bevindingen en eventuele fixcommit;
- resterende risico’s.

Voor de finale claim zijn minimaal vereist:

```text
npm run test:mp-sync
npm run build
```

Daarnaast wordt de game in de browser geopend, offline PLAY gestart, een korte speelinteractie uitgevoerd en de console gecontroleerd. De reviewer vergelijkt de nieuwste captures met de baseline op de criteria uit deze spec. “100% zeker” wordt praktisch ingevuld als: alle afgesproken checks zijn uitgevoerd, geen bekende blocker resteert en de evidence is reproduceerbaar; absolute foutloosheid wordt niet beweerd op basis van alleen een screenshot.

## 7. Git- en documentatiebeleid

Het project heeft al een Git-repository en staat momenteel op `main`. Voor de eerste codewijziging wordt een geïsoleerde `codex/`-werkbranch of worktree gebruikt, afhankelijk van de bevestigde uitvoeringsworkflow. Iedere afgeronde substap krijgt een kleine, beschrijvende commit. Pushen gebeurt niet zonder expliciete opdracht.

Na relevante wijzigingen worden `CONTINUITY.md`, `CHANGELOG-SESSION.md` en waar passend `ROADMAP.md` bijgewerkt. Secrets, lokale sleutels, tijdelijke captures en browserprofielen worden uitgesloten via `.gitignore` of blijven buiten de repository.

## 8. Beslissingen en risico’s

- De video is een benchmark, geen stijltemplate. Dit voorkomt dat S’Berg zijn eigen identiteit verliest.
- Meshy is nuttig als versneller voor enkele hero-assets; het is geen vervanging voor HUD, camera, lighting, bots of leveldesign.
- Een externe asset verhoogt alleen de kwaliteit als de import, schaal, shading, performance en colliderstrategie beheersbaar blijven.
- De progresspagina is observability voor het ontwikkelproces en mag geen tweede gameplay-runtime worden.
- Elke visuele verbetering moet naast mooier ook leesbaarder of informatiever zijn; losse decoratie zonder gameplaywaarde krijgt lagere prioriteit.
