# AGENTS.md — BJCP Beer Style Game
## Börn Loka Ales · v2026.26

Instruccions per a qualsevol agent (Claude o altre LLM) que treballi en aquest projecte.

---

## Descripció del projecte

Joc de cartes multijugador en temps real per identificar estils de cervesa BJCP. Construït com a web app (HTML/CSS/JS pur), desplegat a **GitHub Pages**, amb **Firebase Realtime Database** com a backend.

URL de producció: `https://klemen-t.github.io/bjcp-game/`

---

## Estructura de fitxers

```
bjcp-game/
├── index.html        # App completa: UI, CSS (dark/light mode), animació portada
├── data/
│   └── cards.js      # 116 estils BJCP (+ exemples locals Börn Loka) — FONT DE VERITAT
├── js/
│   ├── game.js       # Classe BJCPGame: Firebase, sessions, lògica de joc, cartes d'acció
│   └── ui.js         # Tot la UI: vistes, filtres sensorials, mapa, historial, temes
├── README.md         # Documentació per a humans
└── AGENTS.md         # Aquest fitxer
```

---

## Regles invariants (mai les trenquis)

### Seguretat
- **Mai escriure la contrasenya del Master** en cap fitxer. Ni en comentaris, ni en README, ni en logs. Només existeix el hash SHA-256 a `js/ui.js` (variable `MASTER_PW_HASH`).
- La clau d'API Firebase és pública i restringida per HTTP referrer. No cal amagar-la.

### Versions
- **Sempre incrementar `APP_VERSION`** a `js/ui.js` quan es fa qualsevol canvi. Format: `'vANY.NUM · DD/MM/YYYY'`. Exemple: `'v2026.26 · 24/03/2026'`.
- La versió es mostra a la portada del joc (element `#app-version`).

### Cards
- `data/cards.js` és la **font de veritat** per als estils BJCP. Conté 116 estils en català amb exemples comercials actualitzats, incloent cerveses locals catalanes (DosKiwis, La Pirata, Guineu, etc.).
- **Mai sobreescriure `data/cards.js` automàticament**. Sempre usar la versió més recent proporcionada per l'usuari.
- Si l'usuari puja un nou `cards.js`, substituir immediatament el fitxer i usar-lo per a tota la resta de la sessió.

### Desplegament
- Hosting: **GitHub Pages** (`main` branch, root). No és Netlify.
- Backend: **Firebase Realtime Database** (Europe West).
- No cal servidor. Tot és estàtic + Firebase.

---

## Arquitectura i estat del joc

### Firebase — estructura de dades
```
games/{CODE}/
  status: 'lobby' | 'playing' | 'finished'
  currentRound: number
  totalRounds: number
  cardsLocked: boolean
  activeLieTeam: string|null      # equip que té "Carta Mentida" activa
  cancelShieldTeam: string|null   # equip que té "Anular Ajuda" activa
  activeCardIds: string[]|null    # null = totes; array = pool restringit
  currentBeer: { id, name, number, category, ... revealedInfo, teamInfo, guesses, ... }
  roundHistory: { 1: {...}, 2: {...} }  # historial per als participants
  teams/{teamId}/
    points: number
    players/{playerName}/
      cardStates: { [cardId]: 'possible'|'discarded'|null }
      actionCards: [{id, type}]
      pendingCards: [{id, type}]   # lliurades al principi de la pròxima ronda
      usedCards: [{id, type, usedAt}]
  messages/{ts}/
    from, fromRole, toTeam, toPlayer, text, ts
    isCardGrant?, isInfoReveal?, isSystemAlert?, forMasterOnly?
```

### Puntuació actual
- Encert = **+1 punt** (independentment de si s'han usat ajudes)
- Error = **0 punts**
- El master pot ajustar punts manualment (+/−) des de la pestanya Equips

### Cartes d'acció
| ID | Nom | Efecte |
|----|-----|--------|
| `ibu` | Info IBU | Master revela rang IBU al equip sol·licitant |
| `abv` | Info Alcohol | Master revela rang ABV |
| `srm` | Info Color | Master revela rang SRM |
| `category` | Revelar Categoria | Auto: revela número de categoria |
| `yes_no` | Sí o No | Jugador fa pregunta → Master respon |
| `sensory` | Pista Sensorial | Master escriu pista d'ingredients/aromes |
| `lie` | Carta Mentida | Pròxima info que rebi un equip rival serà falsa. Afecta: ibu/abv/srm/category/yes_no. No afecta: steal/cancel/lie |
| `cancel` | Anular Ajuda | Bloqueja la pròxima carta que usi qualsevol equip rival (excepte cancel/lie/steal) |
| `steal` | Robar Carta | Roba carta aleatòria d'un rival. Notifica TOT l'equip víctima |
| `eliminate` | Descartar la Meitat | Descarta la meitat de les "possibles" incorrectes |
| `wildcard` | Comodí Trucada | Obra el marcador de telèfon |

**Lie card sobre Yes/No**: el flag `mustLie` és llegit per `answerYesNo()` que inverteix la resposta mostrada.

---

## Sistema de filtres sensorials

El filtre sensorial (`EF` object a `ui.js`) calcula un percentatge de coincidència (0–100%) per cada carta. Es basa en:
- `srmMin/Max` — color visual
- `abvMin/Max` — alcohol
- `ibuMin/Max` — amargor
- `ferm` — Set: ale/lager/wild/hybrid
- `body` — Set: light/medium/full
- `chars` — Set: malty/hoppy/roasty/sour/fruity/spice/smoke/hicarb/dry/sweet

Les pills de color/alcohol/amargor funcionen com a **toggle**: clic sobre la mateixa pill activa → desactiva.

### Ordenació de la llista
1. ✅ Cartes que coincideixen amb info revelada per ajudes (`getRevealStatus` = 'match')
2. % de coincidència sensorial descendent (si hi ha filtres actius)
3. Número de categoria + nom alfabètic (si no hi ha filtres)
4. ❌ Cartes excloses per info revelada (`getRevealStatus` = 'nomatch') — sempre al final

---

## Mapa de famílies

El mapa (`renderMapView`) usa coordenades (x,y) en espai 0–100 basades en el poster "Very Many Varieties of Beer". Cada estil té una posició fixa a `_CARD_COORDS`. Les zones de color (`_MAP_ZONES`) i les connexions de subestils (`_MAP_LINKS`) estan totes definides a `ui.js`.

**Viewport**: `_mapVP = {x0, x1, y0, y1}` — permet zoom/pan. Reset: tots a 0/100.

---

## Paleta de colors i disseny

```
Dark mode (per defecte):
  --k:#080808  --k2:#0f0f0f  --k3:#161616  --k4:#1e1e1e
  --t:#CCCCCC  --m:#555  --sl:#EDEDED
  --r:#C41230  --rl:#E5172F  --rd:#8A0B21

Light mode (body.light-mode):
  --k:#F4F1ED  --k2:#FDFCFB  --k3:#EDE9E3  --k4:#D8D2C8
  --t:#1A1410  --m:#7A6E62  --sl:#1A1410
```

Fonts: `Bebas Neue` (display) · `Barlow Condensed` (UI) · `Barlow` (body)

**Regla important**: mai usar colors hardcoded (`rgba(8,8,8,...)`, `rgba(255,255,255,...)`) en elements que han de funcionar en els dos modes. Sempre usar `var(--k)`, `var(--t)`, `var(--m)`, etc.

---

## Patrons de codi importants

### Renderitzar cartes de cervesa
```js
renderBeerCards()       // vista llista
renderMapView()         // vista mapa
renderCurrentCardView() // crida la vista activa (list o map)
```

### Mostrar un modal
```js
showModal('Títol', '<html del cos>');
closeModal();
```

### Toast
```js
showToast('missatge', durada_ms); // durada per defecte 2800ms
```

### Guardar estat de carta
```js
await game.saveCardState(cardId, 'possible' | 'discarded' | 'normal');
```

### Reinici de ronda (automàtic via Firebase listener)
Quan `s.roundReset !== lastRoundReset`:
- `cardStates = {}`
- `cardSearch = ''`
- `cardFilter = 'all'`
- `explorerResetFilters()` — esborra tots els filtres sensorials

---

## Convencions

- **Català** — tota la UI és en català. Els missatges del sistema, toasts, etiquetes, tot.
- **Mòbil primer** — disseny optimitzat per a mòbil. Touch targets mínims 36px.
- **No jQuery, no frameworks** — JS pur + Firebase SDK compat v9.
- **No `var(--amber)`, `var(--text)`, `var(--muted)`, `var(--border)`** — variables obsoletes d'una versió anterior. Usar `var(--r)`, `var(--t)`, `var(--m)`, `var(--k4)`.
- **Backticks en template literals** — el codi usa template literals extensament. Mai escapar backticks (`\``) dins de template literals, és un error de sintaxi.

---

## Canvis habituals i on fer-los

| Canvi | Fitxer | Funció/Secció |
|-------|--------|---------------|
| Afegir estil BJCP | `data/cards.js` | Array `BJCP_CARDS` |
| Canviar puntuació | `js/game.js` | `judgeGuess()` |
| Afegir carta d'acció | `js/game.js` | `ACTION_CARD_TYPES` + `useCard()` switch |
| Canviar filtre sensorial | `js/ui.js` | `EF` object + `initExplorerPills()` |
| Canviar posició al mapa | `js/ui.js` | `_CARD_COORDS` |
| Afegir connexió de subestil | `js/ui.js` | `_MAP_LINKS` |
| Canviar colors del tema | `index.html` | `:root` / `body.light-mode` |
| Afegir pestanya (participant) | `index.html` + `js/ui.js` | HTML nav + `switchTab()` array |
| Afegir pestanya (master) | `index.html` + `js/ui.js` | HTML nav + `switchMasterTab()` array |

---

## Historial de versions rellevants

| Versió | Data | Canvis principals |
|--------|------|-------------------|
| v2026.26 | 24/03/2026 | Pills toggle, reset filtres per ronda, ordenació millorada |
| v2026.25 | 23/03/2026 | Historial rondes (participants), puntuació 1pt/0pt, lie+yes_no fix |
| v2026.24 | 23/03/2026 | Light mode complet, toggle tema, fixes missatges |
| v2026.23 | 23/03/2026 | Fix mapa (h.cx/h.cy), light mode, filtres mòbil grans |
| v2026.22 | 15/03/2026 | Mapa famílies BJCP, zones color, connexions subestils |
| v2026.20 | 15/03/2026 | Cartes possibles en ambre, modal mapa info-only |
| v2026.17 | 15/03/2026 | Fix _pinch0 duplicat, zoom mapa funcional |
| v2026.15 | 15/03/2026 | Eixos mapa 0–100 IBU, filtres visibles sempre |
| v2026.14 | 15/03/2026 | Gradient continu probabilitat, llista ordenada per % |
| v2026.11 | 12/03/2026 | Versió base funcional multijugador |
