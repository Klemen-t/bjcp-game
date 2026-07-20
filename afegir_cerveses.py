import urllib.request
import json
import time
import random

# ==============================================================================
# INSTRUCCIONS:
# 1. Afegeix les cerveses que vulguis a la llista 'beers'.
# 2. Assegura't de posar els 'styleId' correctes (pots consultar data/cards.js).
# 3. Executa aquest script amb: python3 afegir_cerveses.py
# ==============================================================================

beers = [
  {
    "brewery": "Nom de la Cervesera",
    "name": "Nom de la Cervesa",
    "country": "País (Opcional)",
    "styleId": "1a",             # L'ID principal (Ex: "1a", "21a", "m1")
    "styleName": "American Light Lager", # El nom de l'estil per referència
    "styleId2": "",              # Opcional: Estil secundari (Ex: "21b")
    "styleName2": "",            # Opcional: Nom de l'estil secundari
    "abv": "5.0",                # Grau d'alcohol
    "ibu": "20",                 # Amargor
    "srm": "3",                  # Color
    "ingredients": "Ingredients principals (Opcional)",
    "description": "Descripció comercial de la cervesa (Opcional)",
    "image": None                # Pots posar-hi una URL directa a una imatge (ex: "https://...")
  },
  # Pots copiar i enganxar el bloc anterior per afegir-ne més
]

def afegir_cerveses():
    if not beers or beers[0]["name"] == "Nom de la Cervesa":
        print("⚠️ Modifica el fitxer 'afegir_cerveses.py' i afegeix dades reals abans d'executar-lo.")
        return

    updates = {}
    now = int(time.time() * 1000)

    for i, b in enumerate(beers):
        # Generem un ID únic i netegem valors buits (opcionals)
        rand_str = ''.join(random.choices('0123456789abcdefghijklmnopqrstuvwxyz', k=5))
        beer_id = f"b_{now + i}_{rand_str}"
        
        b['id'] = beer_id
        b['createdAt'] = now + i
        
        # Eliminem claus buides
        b_neta = {k: v for k, v in b.items() if v != "" and v is not None}
        updates[beer_id] = b_neta

    url = "https://bjcp-7d159-default-rtdb.europe-west1.firebasedatabase.app/master_catalog.json"
    req = urllib.request.Request(url, method="PATCH")
    req.add_header('Content-Type', 'application/json')
    data = json.dumps(updates).encode('utf-8')

    print(f"⏳ Pujant {len(beers)} cerveses a Firebase...")
    
    try:
        with urllib.request.urlopen(req, data=data) as response:
            result = response.read().decode('utf-8')
            print("✅ Cerveses importades correctament!")
    except Exception as e:
        print(f"❌ Error en la pujada: {e}")

if __name__ == "__main__":
    afegir_cerveses()
