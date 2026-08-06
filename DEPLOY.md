# Deploy — Vercel (game) + Render (signal hub)

Flow you want:

1. Speler 1 → `mijngame.vercel.app` → **Host Server** → invite code  
2. Speler 2 → dezelfde site → **Search Server** → code invoeren  
3. Samen spelen (WebRTC; speler 1’s browser blijft de match-host)

---

## Kan ik jouw PC / browser overnemen?

**Nee.** Ik kan niet inloggen op jouw Vercel- of Render-account, en ik kan je muis/browser niet besturen.

**Wel:**

- Alles in de repo staat klaar (`vercel.json`, `render.yaml`, signal-URL, `npm start`)
- Jij logt in (1×) en klikt deploy — of je deelt je scherm en ik zeg precies waar je moet klikken
- Optioneel later: CLI (`vercel` / Render dashboard) terwijl jij in de terminal inlogt

---

## Stap A — Render (signal hub) eerst

1. Ga naar [https://render.com](https://render.com) → account / login (GitHub mag)
2. **New** → **Blueprint** → verbind deze GitHub-repo  
   *Of:* **New Web Service** → repo selecteren, handmatig:
   - **Build:** `npm install`
   - **Start:** `npm start`
   - **Instance:** Free
   - Health check: `/health`
3. Deploy → wacht tot status **Live**
4. Kopieer de service-URL, bv. `https://sbarg-nuketown-hub.onrender.com`  
   Signal-URL wordt:  
   `wss://sbarg-nuketown-hub.onrender.com/mp`  
5. Test in browser: `https://JOUW-HUB.onrender.com/health` → moet `{"ok":true,...}` tonen  
   *(Free tier: eerste request kan ~30–60s duren door cold start.)*

`render.yaml` in de projectroot is al voorbereid.

---

## Stap B — Vercel (game site)

1. Ga naar [https://vercel.com](https://vercel.com) → login
2. **Add New Project** → importeer dezelfde GitHub-repo  
   *(Nog geen git? Eerst repo op GitHub zetten, of Vercel CLI vanaf deze map.)*
3. Framework: Vite (of laat auto-detect). Output: `dist` (staat in `vercel.json`)
4. **Environment Variables** (Production):

   | Name | Value |
   |------|--------|
   | `VITE_SBARG_SIGNAL_URL` | `wss://JOUW-HUB.onrender.com/mp` |

5. Deploy
6. Open je Vercel-URL → Host Server → code → tweede browser Join met alleen de code

`vercel.json` + `.env.production.example` staan klaar.

---

## Stap C — Volgorde onthouden

1. Render hub live + health OK  
2. Vercel env `VITE_SBARG_SIGNAL_URL` zetten  
3. **Opnieuw** Vercel deployen (env zit in de JS-build)  
4. Testen met 2 browsers / 2 PC’s

---

## Lokaal blijven ontwikkelen

```bash
npm run dev
```

Gebruikt nog steeds hub op poort **8787**. Zet `VITE_SBARG_SIGNAL_URL` níet in `.env` voor dagelijks LAN-werk, tenzij je expres tegen Render wilt testen.

---

## Bekende beperkingen

| Punt | Uitleg |
|------|--------|
| Host-tab open | Speler 1 moet de game open houden (listen-server) |
| Render Free sleep | Hub valt in slaap → eerste join traag / even wakker maken via `/health` |
| Strenge NAT | Soms faalt P2P; later optioneel TURN |
| Geen accounts | Alleen nickname + invite code |

---

## Checklist na deploy

- [ ] `https://HUB.onrender.com/health` → ok  
- [ ] Vercel env `VITE_SBARG_SIGNAL_URL=wss://HUB.onrender.com/mp`  
- [ ] Vercel opnieuw gebuild  
- [ ] Host + Join met code op de Vercel-URL  
- [ ] Elkaar zien / schieten  

Als je wilt “samen klikken”: zet een Vercel- en Render-tab open en zeg **klaar** — dan begeleid ik je stap voor stap (jij klikt, ik zeg wat).
