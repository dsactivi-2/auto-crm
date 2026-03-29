import requests
import os
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../config/.env'))

CRM_URL = os.getenv('CRM_URL')
USERNAME = os.getenv('CRM_USERNAME')
PASSWORD = os.getenv('CRM_PASSWORD')

session = requests.Session()

# Login-Seite holen (CSRF-Token etc.)
r = session.get(CRM_URL, timeout=10)
print(f"Login-Seite Status: {r.status_code}")

# Login versuchen
payload = {
    'login_email': USERNAME,
    'login_password': PASSWORD,
    'login_rm': '1'
}

r2 = session.post(CRM_URL + '/do.php?form=login', data=payload, timeout=10, allow_redirects=True)
print(f"Login POST Status: {r2.status_code}")
print(f"Final URL: {r2.url}")

# Prüfen ob eingeloggt
if 'login' in r2.url.lower() or 'index.php' in r2.url.lower():
    print("Status: Noch auf Login-Seite — Login fehlgeschlagen oder Redirect nötig")
else:
    print("Status: Erfolgreich eingeloggt!")

print("\n--- Response Snippet ---")
print(r2.text[:500])
