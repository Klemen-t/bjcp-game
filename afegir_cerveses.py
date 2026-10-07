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
    "brewery": "Alvinne",
    "name": "Peace & Joy",
    "country": "Belgica",
    "styleId": "30c",
    "styleName": "Winter Seasonal Beer",
    "styleId2": "",
    "styleName2": "",
    "abv": "10.0",
    "ibu": "34",
    "srm": "28",
    "ingredients": "Sucre cremat, especies, nespres, fulles de figa (en la edició del 2023)",
    "description": "Aquesta collita del 2023 de Peace & Joy és una complexa Winter Seasonal Beer que mostra la profunditat característica d'Alvinne. Amb un 10% ABV, presenta un perfil sensorial fosc i ric definit per l'addició de fulles de figuera fresques i nespres. Les nespres aporten notes profundes i terroses de fruita madura i una dolçor que recorda el dàtil, mentre que les fulles de figuera introdueixen una espècie subtil, herbal i similar al coco. El sucre cremat proporciona una columna vertebral robusta i caramel·litzada que serveix dʻancoratge per al perfil. Aquesta ale és intensament càlida i maltosa, i equilibra les addicions poc convencionals de fruites i botànics amb un final luxós i lleugerament dolç, ideal per als mesos més freds.",
    "image": None
  }
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
