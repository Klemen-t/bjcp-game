# 🍺 BJCP Beer Style Game — Börn Loka Ales
**v2026.12 · 15/03/2026**

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
│   └── ui.js         # Interfície, vistes, filtres sensorials
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
3. Desactiva Google Analytics (opcional)
4. Al panell, ves a **Realtime Database** → **Crear base de dades**
5. Tria la ubicació (Europe - West recomanat)
6. Inicia en **mode test** (30 dies d'accés obert; canvia les regles després)

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

Això evita usos no autoritzats de la clau des d'altres dominis.

### 5. Puja a GitHub i activa Pages

```bash
git add .
git commit -m "Config Firebase actualitzada"
git push origin main
```

A GitHub → Settings → Pages → Source: **Deploy from branch** → `main` / `root` → Save.

La URL serà: `https://klemen-t.github.io/bjcp-game/`

---

## 🔒 Regles Firebase (producció)

Un cop fetes les proves, canvia les regles de la Realtime Database a:

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
3. Tria **Crear Partida** → el joc genera un codi de 5 lletres
4. Comparteix el codi amb els participants
5. Quan tots estiguin connectats → **Iniciar Partida**

**Cada ronda:**
- Selecciona la cervesa i prem **Iniciar ronda amb aquesta cervesa**
- Els equips examinen les cartes i envien propostes
- Jutja cada proposta (correcta / incorrecta) i assigna punts i cartes d'acció
- Quan totes les propostes estiguin jutjades, prem **Revelar Resultat a Tots**
- Prem **Pròxima Ronda** per continuar

### Els Equips (participants)
1. Entren a la mateixa URL → seleccionen **Equip**
2. Introdueixen el codi de partida, el nom i l'equip
3. Usen les tres vistes de la pestanya **Cartes**:
   - **☰ Llista** — vista clàssica amb detalls expandibles
   - **⊞ Graella** — vista compacta agrupada per categoria
   - **◉ Mapa** — scatter plot IBU vs ABV
4. Obren **🎛️ Filtres sensorials** per descriure el que perceben
5. Marquen cartes com ⭐ Possible o ✕ Descartada
6. Quan estan segurs, premen 🎯 sobre una carta possible per proposar-la
7. Usen les **Cartes d'Acció** (pestanya ⚡) per obtenir informació o sabotejar rivals

---

## 🎛️ Filtres Sensorials

El sistema de filtres permet descriure el que es percep i veure quins estils coincideixen. El percentatge de coincidència es calcula en temps real i apareix a totes tres vistes.

| Filtre | Opcions |
|--------|---------|
| **Color** | Banda SRM visual + sliders (Pàl·lid / Daurat / Ambre / Marró / Negre) |
| **Fermentació** | Ale · Lager · Salvatge · Híbrida |
| **Alcohol** | Slider 0–15% + dreceres ràpides |
| **Amargor** | Slider IBU + opcions en paraules (Gens / Lleuger / Moderat / Intens / Molt) |
| **Cos** | Lleuger · Mig · Ple |
| **Caràcter** | Malta · Llúpol · Torrat · Àcid |

---

## 🃏 Cartes d'Acció

S'aconsegueixen encertant rondes. S'usen des de la pestanya ⚡.

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

La puntuació d'equip mai baixa de 0.

---

## ⚙️ Panell Master — Pestanyes

| Pestanya | Contingut |
|----------|-----------|
| **🎮 Ronda** | Selecció de cervesa, gestió de propostes, jutjar i revelar |
| **🏆 Equips** | Ranking en temps real, ajust manual de punts (+/−) |
| **📋 Log** | Historial de propostes, info revelada, activitat de cartes |
| **💬 Missatge** | Enviar avisos a equips o jugadors individuals |

**Recuperar partida**: si el Master tanca el navegador, pot recuperar la sessió amb la contrasenya i el codi.

---

## ➕ Afegir o modificar estils BJCP

Obre `data/cards.js`. Cada carta segueix aquest format:

```javascript
{
  id: "21a",
  name: "American IPA",
  number: "21A",
  category: "IPA",
  categoryNumber: 21,
  overallImpression: "...",
  aroma: "...",
  appearance: "...",
  flavor: "...",
  mouthfeel: "...",
  ibuMin: 40, ibuMax: 70,
  abvMin: 5.5, abvMax: 7.5,
  srmMin: 6,  srmMax: 14,
  commercialExamples: "Cervesa A, Cervesa B",
  tags: "standard-strength, amber-color, top-fermented, ipa-family, bitter, hoppy"
}
```

Tags que influencien els filtres sensorials:
- Fermentació: `top-fermented`, `bottom-fermented`, `lagered`, `wild-fermented`
- Força: `session-strength`, `standard-strength`, `high-strength`, `very-high-strength`
- Color: `pale-color`, `amber-color`, `dark-color`
- Caràcter: `malty`, `hoppy`, `roasty`, `sour`, `bitter`, `balanced`

---

## 🔑 Contrasenya Master

La contrasenya per defecte és **** (hash SHA-256 emmagatzemat al codi).

Per canviar-la, substitueix el hash a `js/ui.js` (línia `MASTER_PW_HASH`). Pots generar el hash a:
https://emn178.github.io/online-tools/sha256.html

---

## 📱 Compatibilitat

- ✅ Chrome / Safari mòbil (iOS i Android)
- ✅ Firefox mòbil i escriptori
- ✅ Sense instal·lació — funciona directament al navegador
- ✅ La sessió es desa automàticament

---

*Fet amb ❤️ per Börn Loka Ales 🍺*
