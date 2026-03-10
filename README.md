# 🍺 BJCP Beer Style Game

Joc de cartes multijugador per identificar estils de cervesa BJCP.

---

## 🚀 Com posar-ho en marxa (15 minuts)

### 1. Crea un compte Firebase (gratuït)

1. Ves a https://firebase.google.com
2. Clica "Get Started" → inicia sessió amb Google
3. Clica "Add project" → posa un nom (ex: `bjcp-game`)
4. Desactiva Google Analytics (no cal) → "Create project"

### 2. Configura la base de dades

1. Al panell de Firebase, clica **"Realtime Database"** (menú esquerre)
2. Clica "Create Database"
3. Tria la ubicació (Europe - West és la més propera)
4. Comença en **"test mode"** (permetrà accés durant 30 dies)
5. Clica "Done"

### 3. Obtén la configuració

1. Al panell principal, clica la icona ⚙️ → "Project settings"
2. Baixa fins a "Your apps" → clica `</>` (Web)
3. Posa un nom a l'app (ex: `bjcp-web`)
4. Copia el codi `firebaseConfig` que apareix

### 4. Afegeix la config al joc

Obre el fitxer `js/game.js` i substitueix:

```javascript
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  // ...
};
```

...per les teves dades reals.

### 5. Puja el joc (hosting gratuït)

**Opció A — Netlify (el més fàcil, 0 minuts):**
1. Ves a https://netlify.com → "Sign up" gratis
2. Arrossega la carpeta `bjcp-game` a la pàgina
3. Et dona una URL com `https://amazing-name-123.netlify.app`
4. Comparteix-la amb els jugadors!

**Opció B — Firebase Hosting:**
1. Instal·la Firebase CLI: `npm install -g firebase-tools`
2. A la carpeta del projecte: `firebase login`
3. `firebase init hosting` → tria el teu projecte
4. `firebase deploy`

---

## 🎮 Com jugar

### El Master (tu):
1. Entra a la web → selecciona **"Master"**
2. Introdueix el teu nom → "Crear Partida Nova"
3. Comparteix el codi de 5 lletres amb els equips
4. Quan tots estiguin connectats → "Iniciar Partida"
5. Cada ronda:
   - Selecciona la cervesa que serviràs
   - Els equips filtren les cartes i fan propostes
   - Confirma qui ha encertat (guanya 3 punts + 1 carta d'acció)
   - Revela informació si cal (IBU, ABV, etc.)

### Els Equips:
1. Entren a la mateixa URL → seleccionen **"Equip"**
2. Introdueixen el codi, el nom i l'equip
3. Veuen totes les 120 cartes BJCP
4. Filtren/descarten cartes, marquen possibles (⭐)
5. Envien propostes quan creuen saber l'estil
6. Usen cartes d'acció per obtenir pistes

---

## 🃏 Cartes d'Acció

| Carta | Efecte |
|-------|--------|
| 🌿 IBU | Revela els IBU de la cervesa |
| 🍺 ABV | Revela el grau d'alcohol |
| 🎨 Color | Revela el rang de color SRM |
| 🌾 Ingredient | El master dóna una pista d'ingredient |
| ✂️ Eliminar meitat | Elimina la meitat de les cartes |
| ❓ Pregunta Sí/No | El master respon sí o no |
| 🃏 Mentida | L'equip rival ha de mentir si se'ls demana ajuda |
| 📂 Categoria | Revela la categoria principal |
| 🔬 Fermentació | Revela el tipus de fermentació |
| 🌍 Origen | Revela la regió geogràfica |

---

## 📁 Estructura del projecte

```
bjcp-game/
├── index.html          # La web completa
├── data/
│   └── cards.js        # Les 20 cartes de prova (ampliables)
├── js/
│   ├── game.js         # Lògica Firebase i joc
│   └── ui.js           # Interfície i interacció
└── README.md           # Aquest document
```

---

## ➕ Afegir més cartes BJCP

Obre `data/cards.js` i afegeix entrades seguint el format:

```javascript
{
  id: "1C",
  name: "Nom de l'estil",
  number: "1C",
  category: "Categoria",
  categoryNumber: "1",
  overallImpression: "...",
  aroma: "...",
  appearance: "...",
  flavor: "...",
  mouthfeel: "...",
  ibuMin: 10, ibuMax: 20,
  abvMin: 4.0, abvMax: 5.5,
  srmMin: 2, srmMax: 4,
  commercialExamples: "Cervesa A, Cervesa B",
  tags: "standard-strength, pale-color, ..."
}
```

---

## 🔒 Seguretat (per producció)

Un cop probat, canvia les regles de Firebase Realtime Database:

```json
{
  "rules": {
    "games": {
      "$gameCode": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

---

*Fet amb ❤️ per a cervesers 🍺*
