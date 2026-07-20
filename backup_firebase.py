import urllib.request
import json
import time
from datetime import datetime

# ==============================================================================
# INSTRUCCIONS:
# Aquest script fa una còpia de seguretat (backup) completa de tota la teva
# base de dades de Firebase (incloses totes les partides i el catàleg de cerveses).
# El resultat es guardarà en un fitxer JSON a la mateixa carpeta.
# 
# Executa-ho amb: python3 backup_firebase.py
# ==============================================================================

url = "https://bjcp-7d159-default-rtdb.europe-west1.firebasedatabase.app/.json"

def backup_database():
    print("⏳ Connectant a Firebase per descarregar les dades...")
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
            
            # Formatem la data actual per donar nom al fitxer
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"backup_bjcp_{timestamp}.json"
            
            # Guardem a un fitxer local
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
                
            print(f"✅ Còpia de seguretat completada amb èxit!")
            print(f"📁 S'ha guardat tota la base de dades al fitxer: {filename}")
            
    except Exception as e:
        print(f"❌ Error al fer el backup: {e}")

if __name__ == "__main__":
    backup_database()
