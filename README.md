# 🍺 BJCP Beer Style Game — Börn Loka Ales
**v2026.23 · 23/03/2026**

Joc de cartes multijugador en temps real per identificar estils de cervesa BJCP. Dissenyat per a sessions de cata en grup, optimitzat per a mòbil.

---

## 📁 Estructura del projecte

```
bjcp-game/
├── index.html        # App completa (UI + CSS + animació portada)
├── data/
│   └── cards.js      # 116 estils BJCP (dades completes)
├── js/
│   ├── game.js       # Lògica Firebase, sessions, cartes d'acció
│   └── ui.js         # Interfície, vistes, filtres sensorials, mapa
└── README.md         # Aquest document
```

---

## 🚀 Desplegament a GitHub Pages

El joc s'allotja a **GitHub Pages** i usa **Firebase Realtime Database** com a backend en temps real.

### 1. Fork o clona el repositori

```bash
git clone https://github.com/klemen-t/bjcp-game.git
cd bjcp-game
```

### 2. Crea un projecte Firebase

1. Ves a https://firebase.google.com
2. Crea un nou projecte (ex: `bjcp-game`)
3. Al panell, ves a **Realtime Database** → **Crear base de dades**
4. Tria la ubicació (Europe - West recomanat)
5. Inicia en **mode test**

### 3. Configura la connexió Firebase

Al panell de Firebase: ⚙️ → Configuració del projecte → Apps web → `</>` → copia el `firebaseConfig`.

Obre `js/game.js` i substitueix la configuració:

```javascript
const FIREBASE_CONFIG = {
  apiKey:            "LA_TEVA_API_KEY",
  authDomain:        "el-teu-projecte.firebaseapp.com",
  databaseURL:       "https://el-teu-projecte-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "el-teu-projecte",
  storageBucket:     "el-teu-projecte.firebasestorage.app",
  messagingSenderId: "XXXXXXXXXX",
  appId:             "1:XXXXXXXXXX:web:XXXXXXXXXXXXXXXX"
};
```

### 4. (Opcional) Restringeix la clau d'API

A Google Cloud Console → APIs i serveis → Credencials → la teva API Key → Restriccions HTTP referrer:

```
https://el-teu-usuari.github.io/*
```

### 5. Puja a GitHub i activa Pages

```bash
git add .
git commit -m "Config Firebase actualitzada"
git push origin main
```

A GitHub → Settings → Pages → Source: **Deploy from branch** → `main` / `root` → Save.

---

## 🔒 Regles Firebase (producció)

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

## 🎮 Com jugar

### El Master (organitzador)
1. Entra a la web → selecciona **Master**
2. Introdueix el teu nom i la contrasenya Master
3. Tria **Crear Partida** → codi de 5 lletres
4. Comparteix el codi amb els participants
5. Quan tots estiguin connectats → **Iniciar Partida**

**Cada ronda:** selecciona la cervesa → els equips fan propostes → jutja → revela resultats → pròxima ronda.

### Els Equips (participants)
1. Entren a la URL → seleccionen **Equip**
2. Introdueixen el codi de partida, nom i equip
3. Usen les **3 vistes** de la pestanya Cartes:
   - **☰ Llista** — estils ordenats per % coincidència quan hi ha filtres actius
   - **◉ Mapa** — mapa de famílies BJCP basat en el poster "Very Many Varieties of Beer"
4. Obren **🎛️ Filtres sensorials** per descriure el que perceben
5. Marquen cartes com ⭐ Possible o ✕ Descartada
6. Premen 🎯 sobre una carta possible per proposar-la
7. Usen les **Cartes d'Acció** (pestanya ⚡)

---

## 🗺️ Mapa de famílies BJCP

El mapa segueix la disposició del poster "The Very Many Varieties of Beer":

| Color | Família |
|-------|---------|
| 🟢 Verd | Ale (britànica, americana, pale ale, IPA) |
| 🔵 Blau | Lager (americana, internacional) |
| 🟠 Taronja | Belga / Sour (lambic, saison, trappist) |
| 🟣 Lila | Weizen / Ale alemanya (kölsch, altbier) |
| 🔴 Vermell | Stout / Porter |
| 🩵 Cian | Lager alemanya (Munich, Märzen, Bocks) |
| ⬜ Gris | Especialitats |

Les **línies** entre punts indiquen relacions de subestil o família directa.

Quan hi ha **filtres sensorials actius**, cada estil mostra un anell de color:
- 🟢 **Verd** ≥70% coincidència
- 🟡 **Groc** 40–69%
- 🔴 **Vermell** <40%

**Controls del mapa:** dos dits per ampliar · un dit per desplaçar · doble toc per reiniciar.

---

## 🎛️ Filtres Sensorials

| Filtre | Opcions |
|--------|---------|
| **Color** | Banda SRM visual + Pàl·lid (1–4) · Daurat (4–9) · Ambre (9–18) · Marró (18–30) · Negre (30+) |
| **Fermentació** | Ale (alt-ferm.) · Lager (baix-ferm.) · Salvatge · Híbrida |
| **Alcohol** | Baix (2–3.5%) · Moderat (3.5–5%) · Normal (5–6.5%) · Alt (6.5–9%) · Fort (9%+) |
| **Amargor** | Gens (0–12) · Suau (8–25) · Moderat (20–40) · Intens (35–60) · Molt amarg (55+) |
| **Cos** | Lleuger · Mig · Ple |
| **Caràcter** | Malta · Llúpol · Torrat/Cafè · Àcid · Afruitat · Especiat/Herbes · Fumat |
| **Final** | Sec · Dolç/Residual · Molt carbonat |

---

## 🃏 Cartes d'Acció

| Carta | Efecte |
|-------|--------|
| 🌿 Info IBU | El Master revela el rang d'amargor |
| 🍺 Info Alcohol | El Master revela el rang d'ABV |
| 🎨 Info Color | El Master revela el rang de color SRM |
| 🌾 Pista Sensorial | El Master escriu una pista d'ingredients o aromes |
| ✂️ Descartar la Meitat | Descarta la meitat de les cartes marcades com a normals |
| ❓ Sí o No | El jugador fa una pregunta; el Master respon sí o no |
| 🤥 Carta Mentida | La pròxima carta d'informació dels rivals serà falsa |
| 📂 Revelar Categoria | Revela automàticament la categoria BJCP |
| 🚫 Anul·lar Ajuda | Bloqueja la pròxima carta d'informació dels rivals |
| 🦝 Robar Carta | Roba una carta d'acció aleatòria d'un rival |
| 📞 Comodí Trucada | Obre el marcador de telèfon per demanar ajuda externa |

---

## 📊 Puntuació

| Situació | Punts |
|----------|-------|
| Encert sense haver usat cartes d'info | **+3 pts** |
| Encert havent usat cartes d'info | **+1 pt** |
| Error havent usat cartes d'info | **−1 pt** |
| Error sense haver usat cartes d'info | **0 pts** |

---

## ⚙️ Panell Master

| Pestanya | Contingut |
|----------|-----------|
| **🎮 Ronda** | Selecció de cervesa, gestió de propostes, jutjar i revelar |
| **🏆 Equips** | Ranking en temps real, ajust manual de punts (+/−) |
| **📋 Log** | Historial de propostes, info revelada, activitat de cartes |
| **💬 Missatge** | Enviar avisos a equips o jugadors individuals |

---

## ➕ Afegir o modificar estils BJCP

Obre `data/cards.js`. Format de cada carta:

```javascript
{
  id: "21a",
  name: "American IPA",
  number: "21A",
  category: "IPA",
  categoryNumber: 21,
  overallImpression: "...",
  aroma: "...", appearance: "...", flavor: "...", mouthfeel: "...",
  ibuMin: 40, ibuMax: 70,
  abvMin: 5.5, abvMax: 7.5,
  srmMin: 6,  srmMax: 14,
  commercialExamples: "Cervesa A, Cervesa B",
  tags: "standard-strength, amber-color, top-fermented, ipa-family, bitter, hoppy"
}
```

---

## 🔑 Contrasenya Master

La validació es fa comparant el hash SHA-256 de l'entrada amb el hash emmagatzemat a `js/ui.js`. Per canviar-la, substitueix el valor del hash per un de propi.

---

## 📱 Compatibilitat

- ✅ Chrome / Safari mòbil (iOS i Android)
- ✅ Firefox mòbil i escriptori
- ✅ Sense instal·lació — funciona directament al navegador
- ✅ La sessió es desa automàticament

---

*Fet amb ❤️ per Börn Loka Ales 🍺*
