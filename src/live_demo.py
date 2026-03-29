"""
CRM Live Demo — Playwright Prasentationsmodus
Jobstep IT Solutions v1.15.5 | https://crm.job-step.com

Verwendung:
  python src/live_demo.py                          # Standard-Rundgang, manuell
  python src/live_demo.py --auto 2                 # 2 Sek. pro Seite
  python src/live_demo.py --modul sales            # Einzelnes Modul (Routen-Modus)
  python src/live_demo.py --alle                   # Alle Routen-Module
  python src/live_demo.py --kandidaten-demo        # Legacy: Kandidaten-Workflow
  python src/live_demo.py --demo kandidaten        # Demo-Funktion: kandidaten
  python src/live_demo.py --demo dashboard         # Demo-Funktion: dashboard
  python src/live_demo.py --komplett               # ALLE Demo-Funktionen nacheinander
  python src/live_demo.py --demo kandidaten --auto 2  # Mit 2s Pause

Steuerung (manuell): Pfeil RECHTS/LINKS im Browser
"""

import os, sys, time, argparse
sys.stdout.reconfigure(encoding='utf-8')
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, Page

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../config/.env'))

CRM_URL  = os.getenv('CRM_URL', 'https://crm.job-step.com')
USERNAME = os.getenv('CRM_USERNAME')
PASSWORD = os.getenv('CRM_PASSWORD')

# ── Demo-Routen (Legacy Routen-Modus) ─────────────────────────────────────────
ROUTEN = {
    "dashboard": [
        ("Dashboard", "/"),
    ],
    "kandidaten": [
        ("Kandidaten - Uebersicht", "/kandidati?page=list_ajax"),
        ("Neuer Kandidat Formular", "/dipl?page=add_new_kandidat&type=1"),
    ],
    "sales": [
        ("Sales - Neue Leads",    "/sales?page=list&type=0&status=0"),
        ("Sales - Aktive Leads",  "/sales?page=list&type=0&status=1"),
        ("Sales - Prodaja Neu",   "/sales?page=list&type=1&status=0"),
        ("Sales - Prodaja Aktiv", "/sales?page=list&type=1&status=1"),
    ],
    "companies": [
        ("Unternehmen - Liste",   "/companies?page=list"),
        ("Unternehmen - Partner", "/companies?page=partner_companies"),
    ],
    "auftraege": [
        ("Auftraege - Aktive",        "/nalozi?page=list"),
        ("Auftraege - Abgeschlossen", "/nalozi?page=list_finish"),
        ("Auftrags-Dashboard",        "/dashboardNaloga/companies.php"),
    ],
    "finanzen": [
        ("Finanzen - Uebersicht", "/finances?page=info"),
        ("Finanzen - Kandidaten", "/finances?page=list"),
        ("Finanzen - Auftraege",  "/finances?page=list_nalozi"),
        ("Finanzprojektion",      "/financesProjection.php?page=list"),
        ("Provisionen",           "/provizije?page=lista"),
    ],
    "tasks": [
        ("Meine Aufgaben", "/tasks?page=list&sort=new"),
        ("Alle Aufgaben",  "/tasks?page=list_all&sort=new"),
    ],
    "mitarbeiter": [
        ("Mitarbeiter - Aktiv", "/employees?page=list"),
        ("Reports",             "/employees-reports?page=list"),
    ],
    "kampagnen": [
        ("Kampagnen",         "/kampanje?page=list"),
        ("Link-Generator",    "/link_generator?page=list"),
        ("Kandidatengruppen", "/grupe_kandidata?page=list"),
    ],
    "dipl": [
        ("DIPL - Bearbeitung",     "/dipl?page=listaObrada"),
        ("DIPL - Alle Kandidaten", "/dipl?page=lista_kandidata&type=10"),
        ("DIPL - Inkasso",         "/dipl?page=inkaso_pocetna"),
    ],
    "statistiken": [
        ("Statistiken",  "/modul_statistike?page=open"),
        ("TF Statistik", "/casting_stats"),
        ("Abgaenge",     "/odlasci.php"),
    ],
}

ALLE_MODULE = list(ROUTEN.keys())

# ── Demo-Funktionen Mapping ────────────────────────────────────────────────────
DEMO_NAMEN = [
    "dashboard", "nachrichten", "kandidaten", "sales", "companies",
    "auftraege", "finanzen", "tasks", "mitarbeiter", "kampagnen",
    "dipl", "dak", "partner", "statistiken", "tf", "reminders",
    "log", "tiketi",
]


# ── Hilfsfunktionen ────────────────────────────────────────────────────────────
def zeige_overlay(page: Page, titel: str, index: int, gesamt: int, hinweis: str = ""):
    hint = hinweis or "Demo-Modus | Formular wird NICHT gespeichert"
    js = f"""
    (function() {{
        var el = document.getElementById('_demo_bar');
        if (!el) {{
            el = document.createElement('div');
            el.id = '_demo_bar';
            el.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:rgba(10,10,40,0.92);color:#fff;font:bold 15px Arial;padding:10px 20px;z-index:999999;display:flex;justify-content:space-between;align-items:center;box-shadow:0 -2px 8px rgba(0,0,0,0.5)';
            document.body.appendChild(el);
        }}
        el.innerHTML = '<span style="color:#7cf">[{index}/{gesamt}]</span>&nbsp;&nbsp;<span style="flex:1">{titel}</span>'
                     + '<span style="font-size:12px;opacity:0.7;font-weight:normal;margin-left:20px">{hint}</span>';
    }})();
    """
    try:
        page.evaluate(js)
    except Exception:
        pass


def login(page: Page):
    print("Login ...")
    page.goto(CRM_URL + '/login', wait_until='networkidle', timeout=30000)
    page.fill('input[name="login_email"]', USERNAME)
    page.fill('input[name="login_password"]', PASSWORD)
    page.locator('button[type="submit"], input[type="submit"]').first.click()
    try:
        page.wait_for_url(lambda url: 'login' not in url, timeout=20000)
    except Exception:
        pass
    print(f"Eingeloggt: {page.url}")


def gehe_zu(page: Page, url: str, titel: str, index: int, gesamt: int):
    print(f"  [{index}/{gesamt}] {titel}")
    try:
        page.goto(url, wait_until='domcontentloaded', timeout=25000)
    except Exception as e:
        print(f"  Warnung: {e}")
    time.sleep(0.4)
    zeige_overlay(page, titel, index, gesamt)


def nav(page: Page, pfad: str, timeout: int = 25000):
    """Navigiere zu URL, ignoriere Fehler."""
    try:
        page.goto(CRM_URL + pfad, wait_until='domcontentloaded', timeout=timeout)
    except Exception as e:
        print(f"  Nav-Warnung: {e}")


def klicke(page: Page, selector: str) -> bool:
    """Klicke auf erstes sichtbares Element, gibt True bei Erfolg."""
    try:
        el = page.locator(selector).first
        if el.count() > 0 and el.is_visible():
            el.click()
            return True
    except Exception:
        pass
    return False


def tippe(page: Page, selector: str, text: str, delay: int = 55) -> bool:
    """Tippe in Feld, gibt True bei Erfolg."""
    try:
        el = page.locator(selector).first
        if el.count() > 0 and el.is_visible():
            el.click()
            el.type(text, delay=delay)
            return True
    except Exception:
        pass
    return False


def warte_laden(page: Page, timeout: int = 10000):
    try:
        page.wait_for_load_state('domcontentloaded', timeout=timeout)
    except Exception:
        pass


# ═══════════════════════════════════════════════════════════════════════════════
# DEMO-FUNKTIONEN
# ═══════════════════════════════════════════════════════════════════════════════

def dashboard_demo(page: Page, pause: float = 2.0):
    """
    Dashboard Demo:
    1. Haupt-Dashboard anzeigen
    2. Statistiken/Widgets zeigen
    3. Auftrags-Dashboard navigieren
    """
    print("\n=== DASHBOARD DEMO ===")

    # Schritt 1: Haupt-Dashboard
    print("[1/3] Haupt-Dashboard")
    nav(page, '/')
    time.sleep(pause * 0.5)
    zeige_overlay(page, "Dashboard — Uebersicht", 1, 3, "Haupt-Dashboard mit allen Statistiken")
    time.sleep(pause)

    # Schritt 2: Statistik-Widgets scrollen
    print("[2/3] Statistiken zeigen")
    try:
        page.evaluate("window.scrollTo({top: 400, behavior: 'smooth'})")
        time.sleep(0.8)
        page.evaluate("window.scrollTo({top: 0, behavior: 'smooth'})")
    except Exception:
        pass
    zeige_overlay(page, "Dashboard — Statistiken & KPIs", 2, 3, "Alle wichtigen Kennzahlen auf einen Blick")
    time.sleep(pause)

    # Schritt 3: Auftrags-Dashboard
    print("[3/3] Auftrags-Dashboard")
    nav(page, '/dashboardNaloga/companies.php')
    time.sleep(pause * 0.5)
    zeige_overlay(page, "Dashboard — Auftrags-Uebersicht", 3, 3, "Alle aktiven Auftraege nach Unternehmen")
    time.sleep(pause)

    print("Dashboard-Demo fertig.")


def nachrichten_demo(page: Page, pause: float = 2.0):
    """
    Nachrichten Demo:
    1. Nachrichten-Liste anzeigen
    2. Neue Nachricht Formular oeffnen
    3. Felder Demo-ausfuellen (nicht absenden)
    """
    print("\n=== NACHRICHTEN DEMO ===")

    # Schritt 1: Nachrichten-Liste
    print("[1/3] Nachrichten-Liste")
    nav(page, '/messages?page=list')
    time.sleep(pause * 0.5)
    zeige_overlay(page, "Nachrichten — Liste", 1, 3, "Alle eingegangenen und gesendeten Nachrichten")
    time.sleep(pause)

    # Schritt 2: Neue Nachricht
    print("[2/3] Neue Nachricht Formular")
    nav(page, '/messages?page=new')
    time.sleep(pause * 0.5)
    zeige_overlay(page, "Nachrichten — Neue Nachricht", 2, 3, "Formular fuer neue Nachricht")
    time.sleep(pause * 0.5)

    # Schritt 3: Felder ausfuellen (Demo)
    print("[3/3] Felder ausfuellen (Demo)")
    # Betreff
    for sel in ['input[name="subject"]', 'input[placeholder*="Betreff"]',
                'input[placeholder*="Subject"]', 'input[name="naslov"]']:
        if tippe(page, sel, "Demo-Nachricht vom System"):
            print("  Betreff eingetragen")
            time.sleep(0.3)
            break

    # Empfaenger
    for sel in ['input[name="to"]', 'input[name="recipient"]', 'input[name="primatelj"]',
                'input[placeholder*="Empfaenger"]', 'input[placeholder*="To"]']:
        if tippe(page, sel, "demo@example.com"):
            print("  Empfaenger eingetragen")
            time.sleep(0.3)
            break

    # Nachrichtentext
    for sel in ['textarea[name="message"]', 'textarea[name="poruka"]',
                'textarea[name="body"]', 'textarea']:
        if tippe(page, sel, "Dies ist eine Demo-Nachricht. Wird nicht abgesendet.", delay=35):
            print("  Nachrichtentext eingetragen")
            time.sleep(0.3)
            break

    zeige_overlay(page, "Nachrichten — Formular ausgefuellt (Demo)", 3, 3, "NICHT abgesendet — Demo-Modus")
    time.sleep(pause)
    print("Nachrichten-Demo fertig.")


def kandidaten_demo(page: Page, pause: float = 2.0):
    """
    Kandidaten Demo:
    1. Kandidaten-Liste oeffnen
    2. Filter anwenden
    3. Kandidaten-Profil oeffnen (ID 20 Fallback)
    4. Bearbeiten-Button
    5. Neues Formular ausfuellen (nicht absenden)
    """
    print("\n=== KANDIDATEN DEMO ===")

    def warte(sek=None, msg=""):
        t = sek if sek is not None else pause
        if msg:
            print(f"  --> {msg}")
        time.sleep(t)

    # Schritt 1: Liste
    print("[1/5] Kandidaten-Liste")
    nav(page, '/kandidati?page=list_ajax')
    warte(pause * 0.5)
    zeige_overlay(page, "Kandidaten — Liste", 1, 5, "Alle Kandidaten werden angezeigt")
    warte(pause)

    # Schritt 2: Suche / Filter
    print("[2/5] Kandidaten suchen")
    zeige_overlay(page, "Kandidaten — Suche & Filter", 2, 5, "Suchfilter werden angewendet ...")
    warte(0.5)

    try:
        search = page.locator('input[type="text"], input[type="search"]').first
        if search.is_visible():
            search.click()
            search.type("Demo", delay=80)
            warte(0.8)
            search.triple_click()
            search.fill("")
    except Exception:
        pass

    try:
        btn = page.locator(
            'button:has-text("Filter"), button:has-text("Pretrazi"), button:has-text("Filtriraj")'
        ).first
        if btn.count() > 0 and btn.is_visible():
            btn.click()
            warte(1)
    except Exception:
        pass

    zeige_overlay(page, "Kandidaten — Suche & Filter", 2, 5, "Suchergebnisse geladen")
    warte(pause, "Suche abgeschlossen")

    # Schritt 3: Profil oeffnen
    print("[3/5] Kandidaten-Profil oeffnen")
    zeige_overlay(page, "Kandidaten — Profil oeffnen", 3, 5, "Erstes Ergebnis wird geoeffnet ...")
    warte(0.5)

    profil_geoeffnet = False
    try:
        link = page.locator(
            'table a[href*="page=open"], a[href*="kandidati?page=open"]'
        ).first
        if link.count() > 0 and link.is_visible():
            link.click()
            warte_laden(page)
            warte(1)
            profil_geoeffnet = True
    except Exception:
        pass

    if not profil_geoeffnet:
        nav(page, '/kandidati?page=open&id=20')
        warte(1)

    zeige_overlay(page, "Kandidaten — Profil", 3, 5, "Vollstaendiges Profil mit allen Daten")
    warte(pause, "Profil geladen")

    # Schritt 4: Bearbeiten
    print("[4/5] Daten bearbeiten")
    zeige_overlay(page, "Kandidaten — Bearbeiten", 4, 5, "Bearbeitungs-Modus wird geoeffnet ...")
    warte(0.5)

    try:
        edit_btn = page.locator(
            'a:has-text("Uredi"), button:has-text("Uredi"), '
            'a:has-text("Edit"), a[href*="page=edit"]'
        ).first
        if edit_btn.count() > 0 and edit_btn.is_visible():
            edit_btn.click()
            warte_laden(page)
            warte(1)
            zeige_overlay(page, "Kandidaten — Bearbeiten", 4, 5, "Felder koennen hier geaendert werden")
        else:
            zeige_overlay(page, "Kandidaten — Bearbeiten", 4, 5, "Daten im Profil sichtbar und bearbeitbar")
    except Exception as e:
        print(f"  Warnung: {e}")

    warte(pause, "Bearbeitung geoeffnet")

    # Schritt 5: Neuen Kandidaten anlegen
    print("[5/5] Neuen Kandidaten anlegen")
    nav(page, '/dipl?page=add_new_kandidat&type=1')
    warte(0.8)
    zeige_overlay(page, "Kandidaten — Neuer Kandidat (Formular)", 5, 5, "Formular wird ausgefuellt ...")

    demo_daten = {
        'input[name="ime_new_ND_cand"]':     ("Vorname",  "Max"),
        'input[name="prezime_new_ND_cand"]': ("Nachname", "Mustermann"),
        'input[name="mobilni_new_ND_cand"]': ("Telefon",  "+49 170 1234567"),
        'input[name="email_new_ND_cand"]':   ("Email",    "max.mustermann@example.com"),
    }

    for selector, (label, wert) in demo_daten.items():
        try:
            feld = page.locator(selector).first
            if feld.count() > 0 and feld.is_visible():
                feld.click()
                feld.type(wert, delay=60)
                warte(0.3, f"{label}: {wert}")
        except Exception:
            pass

    try:
        kommentar = page.locator('textarea[name="koment_new_ND_cand"]').first
        if kommentar.count() > 0 and kommentar.is_visible():
            kommentar.click()
            kommentar.type("Demo-Kandidat angelegt via CRM Automation", delay=40)
            warte(0.3, "Kommentar eingetragen")
    except Exception:
        pass

    zeige_overlay(page, "Kandidaten — Formular ausgefuellt (Demo)", 5, 5,
                  "NICHT gespeichert — Demo-Modus")
    warte(pause, "Demo abgeschlossen")
    print("Kandidaten-Demo fertig.")


def sales_demo(page: Page, pause: float = 2.0):
    """
    Sales Demo:
    1. First Call Liste (neue Leads)
    2. Aktive Leads
    3. Prodaja-Liste
    4. Ersten Eintrag oeffnen
    """
    print("\n=== SALES DEMO ===")

    # Schritt 1: First Call / Neue Leads
    print("[1/4] First Call Liste")
    nav(page, '/sales?page=list&type=0&status=0')
    time.sleep(pause * 0.5)
    zeige_overlay(page, "Sales — First Call (Neue Leads)", 1, 4, "Alle neuen Leads im Ueberblick")
    time.sleep(pause)

    # Schritt 2: Aktive Leads
    print("[2/4] Aktive Leads")
    nav(page, '/sales?page=list&type=0&status=1')
    time.sleep(pause * 0.5)
    zeige_overlay(page, "Sales — Aktive Leads", 2, 4, "Laufende Verkaufsgespaeche")
    time.sleep(pause)

    # Schritt 3: Prodaja-Liste
    print("[3/4] Prodaja-Liste")
    nav(page, '/sales?page=list&type=1&status=0')
    time.sleep(pause * 0.5)
    zeige_overlay(page, "Sales — Prodaja (Verkauf)", 3, 4, "Prodaja-Eintraege werden angezeigt")
    time.sleep(pause * 0.5)

    # Schritt 4: Ersten Eintrag oeffnen
    print("[4/4] Ersten Eintrag oeffnen")
    aktion_gemacht = False
    try:
        link = page.locator('table a[href*="page=open"], table tbody tr a').first
        if link.count() > 0 and link.is_visible():
            href = link.get_attribute('href') or ''
            if href:
                link.click()
                warte_laden(page)
                time.sleep(pause * 0.5)
                aktion_gemacht = True
    except Exception:
        pass

    if not aktion_gemacht:
        nav(page, '/sales?page=list&type=1&status=1')
        time.sleep(pause * 0.5)

    zeige_overlay(page, "Sales — Detail-Ansicht", 4, 4, "Vollstaendiger Sales-Eintrag")
    time.sleep(pause)
    print("Sales-Demo fertig.")


def companies_demo(page: Page, pause: float = 2.0):
    """
    Companies Demo:
    1. Unternehmen-Liste anzeigen
    2. Ersten Eintrag oeffnen
    3. Partner-Companies zeigen
    """
    print("\n=== COMPANIES DEMO ===")

    # Schritt 1: Liste
    print("[1/3] Unternehmen-Liste")
    nav(page, '/companies?page=list')
    time.sleep(pause * 0.5)
    zeige_overlay(page, "Unternehmen — Liste", 1, 3, "Alle Unternehmen im System")
    time.sleep(pause)

    # Schritt 2: Ersten Eintrag oeffnen
    print("[2/3] Erstes Unternehmen oeffnen")
    aktion_gemacht = False
    try:
        link = page.locator(
            'table a[href*="page=open"], table a[href*="companies"]'
        ).first
        if link.count() > 0 and link.is_visible():
            link.click()
            warte_laden(page)
            time.sleep(pause * 0.5)
            aktion_gemacht = True
    except Exception:
        pass

    if not aktion_gemacht:
        nav(page, '/companies?page=list')
        time.sleep(pause * 0.5)

    zeige_overlay(page, "Unternehmen — Detailansicht", 2, 3, "Vollstaendiges Unternehmensprofil")
    time.sleep(pause)

    # Schritt 3: Partner-Companies
    print("[3/3] Partner-Companies")
    nav(page, '/companies?page=partner_companies')
    time.sleep(pause * 0.5)
    zeige_overlay(page, "Unternehmen — Partner-Companies", 3, 3, "Alle Partnerunternehmen")
    time.sleep(pause)

    print("Companies-Demo fertig.")


def auftraege_demo(page: Page, pause: float = 2.0):
    """
    Auftraege Demo:
    1. Aktive Auftraege
    2. Ersten Auftrag oeffnen
    3. Abgeschlossene Auftraege
    4. Auftrags-Dashboard
    """
    print("\n=== AUFTRAEGE DEMO ===")

    # Schritt 1: Aktive Auftraege
    print("[1/4] Aktive Auftraege")
    nav(page, '/nalozi?page=list')
    time.sleep(pause * 0.5)
    zeige_overlay(page, "Auftraege — Aktive Auftraege", 1, 4, "Alle laufenden Auftraege")
    time.sleep(pause)

    # Schritt 2: Ersten Auftrag oeffnen
    print("[2/4] Ersten Auftrag oeffnen")
    aktion_gemacht = False
    try:
        link = page.locator(
            'table a[href*="page=open"], table a[href*="nalozi"]'
        ).first
        if link.count() > 0 and link.is_visible():
            link.click()
            warte_laden(page)
            time.sleep(pause * 0.5)
            aktion_gemacht = True
    except Exception:
        pass

    if not aktion_gemacht:
        nav(page, '/nalozi?page=list')
        time.sleep(pause * 0.5)

    zeige_overlay(page, "Auftraege — Detail-Ansicht", 2, 4, "Vollstaendiger Auftrags-Eintrag")
    time.sleep(pause)

    # Schritt 3: Abgeschlossene Auftraege
    print("[3/4] Abgeschlossene Auftraege")
    nav(page, '/nalozi?page=list_finish')
    time.sleep(pause * 0.5)
    zeige_overlay(page, "Auftraege — Abgeschlossene Auftraege", 3, 4, "Erledigte und archivierte Auftraege")
    time.sleep(pause)

    # Schritt 4: Dashboard
    print("[4/4] Auftrags-Dashboard")
    nav(page, '/dashboardNaloga/companies.php')
    time.sleep(pause * 0.5)
    zeige_overlay(page, "Auftraege — Dashboard", 4, 4, "Auftrags-Dashboard nach Unternehmen")
    time.sleep(pause)

    print("Auftraege-Demo fertig.")


def finanzen_demo(page: Page, pause: float = 2.0):
    """
    Finanzen Demo:
    1. Finanzen-Uebersicht
    2. Kandidaten-Finanzen
    3. Auftrags-Finanzen
    4. Finanzprojektion
    5. Provisionen
    """
    print("\n=== FINANZEN DEMO ===")

    schritte = [
        ("/finances?page=info",              "Finanzen — Uebersicht",     "Alle Finanzkennzahlen"),
        ("/finances?page=list",              "Finanzen — Kandidaten",     "Kandidaten-Finanztransaktionen"),
        ("/finances?page=list_nalozi",       "Finanzen — Auftraege",      "Auftrags-Finanztransaktionen"),
        ("/financesProjection.php?page=list","Finanzen — Projektion",     "Umsatz- und Gewinnprognose"),
        ("/provizije?page=lista",            "Finanzen — Provisionen",    "Provisionsuebersicht"),
    ]

    gesamt = len(schritte)
    for i, (pfad, titel, hinweis) in enumerate(schritte, 1):
        print(f"[{i}/{gesamt}] {titel}")
        nav(page, pfad)
        time.sleep(pause * 0.5)
        zeige_overlay(page, titel, i, gesamt, hinweis)
        time.sleep(pause)

    print("Finanzen-Demo fertig.")


def tasks_demo(page: Page, pause: float = 2.0):
    """
    Tasks Demo:
    1. Meine Tasks (sortiert nach Neu)
    2. Alle Tasks
    3. Neuen Task Formular (falls vorhanden)
    """
    print("\n=== TASKS DEMO ===")

    # Schritt 1: Meine Tasks
    print("[1/3] Meine Tasks")
    nav(page, '/tasks?page=list&sort=new')
    time.sleep(pause * 0.5)
    zeige_overlay(page, "Tasks — Meine Aufgaben", 1, 3, "Eigene Tasks sortiert nach Datum")
    time.sleep(pause)

    # Schritt 2: Alle Tasks
    print("[2/3] Alle Tasks")
    nav(page, '/tasks?page=list_all&sort=new')
    time.sleep(pause * 0.5)
    zeige_overlay(page, "Tasks — Alle Aufgaben (Team)", 2, 3, "Tasks aller Mitarbeiter")
    time.sleep(pause)

    # Schritt 3: Neuen Task Formular (Button suchen)
    print("[3/3] Neuen Task Formular")
    aktion_gemacht = False
    for btn_sel in [
        'a:has-text("Novi zadatak")', 'a:has-text("Neuer Task")',
        'button:has-text("Novi")', 'a[href*="page=new"]', 'a[href*="add"]',
    ]:
        try:
            btn = page.locator(btn_sel).first
            if btn.count() > 0 and btn.is_visible():
                btn.click()
                warte_laden(page)
                time.sleep(pause * 0.5)
                aktion_gemacht = True
                break
        except Exception:
            pass

    if not aktion_gemacht:
        nav(page, '/tasks?page=list&sort=new')
        time.sleep(pause * 0.3)

    zeige_overlay(page, "Tasks — Formular / Liste", 3, 3, "Task-Verwaltung vollstaendig")
    time.sleep(pause)

    print("Tasks-Demo fertig.")


def mitarbeiter_demo(page: Page, pause: float = 2.0):
    """
    Mitarbeiter Demo:
    1. Mitarbeiter-Liste
    2. Ersten Mitarbeiter oeffnen
    3. Reports
    """
    print("\n=== MITARBEITER DEMO ===")

    # Schritt 1: Liste
    print("[1/3] Mitarbeiter-Liste")
    nav(page, '/employees?page=list')
    time.sleep(pause * 0.5)
    zeige_overlay(page, "Mitarbeiter — Aktive Liste", 1, 3, "Alle aktiven Mitarbeiter")
    time.sleep(pause)

    # Schritt 2: Ersten Mitarbeiter oeffnen
    print("[2/3] Ersten Mitarbeiter oeffnen")
    aktion_gemacht = False
    try:
        link = page.locator('table a[href*="employees"], table a[href*="page=open"]').first
        if link.count() > 0 and link.is_visible():
            link.click()
            warte_laden(page)
            time.sleep(pause * 0.5)
            aktion_gemacht = True
    except Exception:
        pass

    if not aktion_gemacht:
        nav(page, '/employees?page=list')
        time.sleep(pause * 0.3)

    zeige_overlay(page, "Mitarbeiter — Profil", 2, 3, "Mitarbeiterprofil mit allen Details")
    time.sleep(pause)

    # Schritt 3: Reports
    print("[3/3] Mitarbeiter-Reports")
    nav(page, '/employees-reports?page=list')
    time.sleep(pause * 0.5)
    zeige_overlay(page, "Mitarbeiter — Reports", 3, 3, "Leistungsberichte und Statistiken")
    time.sleep(pause)

    print("Mitarbeiter-Demo fertig.")


def kampagnen_demo(page: Page, pause: float = 2.0):
    """
    Kampagnen Demo:
    1. Kampagnen-Liste
    2. Link-Generator
    3. Kandidatengruppen
    """
    print("\n=== KAMPAGNEN DEMO ===")

    schritte = [
        ("/kampanje?page=list",       "Kampagnen — Liste",           "Alle aktiven Kampagnen"),
        ("/link_generator?page=list", "Kampagnen — Link-Generator",  "Tracking-Links generieren"),
        ("/grupe_kandidata?page=list","Kampagnen — Kandidatengruppen","Zielgruppen-Verwaltung"),
    ]

    gesamt = len(schritte)
    for i, (pfad, titel, hinweis) in enumerate(schritte, 1):
        print(f"[{i}/{gesamt}] {titel}")
        nav(page, pfad)
        time.sleep(pause * 0.5)
        zeige_overlay(page, titel, i, gesamt, hinweis)
        time.sleep(pause)

    print("Kampagnen-Demo fertig.")


def dipl_demo(page: Page, pause: float = 2.0):
    """
    DIPL Demo:
    1. Bearbeitungs-Liste
    2. Alle Kandidaten
    3. Inkasso
    4. Prioritaeten (falls vorhanden)
    """
    print("\n=== DIPL DEMO ===")

    schritte = [
        ("/dipl?page=listaObrada",             "DIPL — Bearbeitungs-Liste",   "Kandidaten in Bearbeitung"),
        ("/dipl?page=lista_kandidata&type=10", "DIPL — Alle Kandidaten",      "Vollstaendige Kandidatenliste"),
        ("/dipl?page=inkaso_pocetna",          "DIPL — Inkasso",              "Inkasso-Uebersicht"),
        ("/dipl?page=prioritete",              "DIPL — Prioritaeten",         "Priorisierte Kandidaten"),
    ]

    gesamt = len(schritte)
    for i, (pfad, titel, hinweis) in enumerate(schritte, 1):
        print(f"[{i}/{gesamt}] {titel}")
        nav(page, pfad)
        time.sleep(pause * 0.5)
        zeige_overlay(page, titel, i, gesamt, hinweis)
        time.sleep(pause)

    print("DIPL-Demo fertig.")


def dak_demo(page: Page, pause: float = 2.0):
    """
    DAK Demo:
    1. Durch alle DAK-Status navigieren (type=0 bis type=8)
    2. Statistik-Seite
    """
    print("\n=== DAK DEMO ===")

    dak_typen = [
        (0, "DAK — Alle"),
        (1, "DAK — Status 1"),
        (2, "DAK — Status 2"),
        (3, "DAK — Status 3"),
        (4, "DAK — Status 4"),
        (5, "DAK — Status 5"),
        (6, "DAK — Status 6"),
        (7, "DAK — Status 7"),
        (8, "DAK — Status 8"),
    ]

    gesamt = len(dak_typen) + 1  # +1 fuer Statistik

    for i, (typ, titel) in enumerate(dak_typen, 1):
        print(f"[{i}/{gesamt}] {titel}")
        nav(page, f'/dak?page=list&type={typ}')
        time.sleep(pause * 0.4)
        zeige_overlay(page, titel, i, gesamt, f"DAK-Liste Status {typ}")
        time.sleep(pause * 0.7)

    # Statistik
    print(f"[{gesamt}/{gesamt}] DAK Statistik")
    nav(page, '/dak?page=statistika')
    time.sleep(pause * 0.5)
    zeige_overlay(page, "DAK — Statistik", gesamt, gesamt, "DAK-Statistiken und Auswertungen")
    time.sleep(pause)

    print("DAK-Demo fertig.")


def partner_demo(page: Page, pause: float = 2.0):
    """
    Partner Demo:
    1. Partner-Liste
    2. Finance-Partner
    3. DVAG Partner
    """
    print("\n=== PARTNER DEMO ===")

    schritte = [
        ("/partners/list",         "Partner — Liste",          "Alle Partner im System"),
        ("/partners/finance",      "Partner — Finance",        "Finance-Partner Uebersicht"),
        ("/partners/dvag",         "Partner — DVAG",           "DVAG Partner-Liste"),
    ]

    gesamt = len(schritte)
    for i, (pfad, titel, hinweis) in enumerate(schritte, 1):
        print(f"[{i}/{gesamt}] {titel}")
        nav(page, pfad)
        time.sleep(pause * 0.5)
        zeige_overlay(page, titel, i, gesamt, hinweis)
        time.sleep(pause)

    print("Partner-Demo fertig.")


def statistiken_demo(page: Page, pause: float = 2.0):
    """
    Statistiken Demo:
    1. Statistiken-Uebersicht
    2. TF Statistik (Casting Stats)
    3. Abgaenge
    4. Casting Stats
    """
    print("\n=== STATISTIKEN DEMO ===")

    schritte = [
        ("/modul_statistike?page=open", "Statistiken — Uebersicht",   "Alle System-Statistiken"),
        ("/casting_stats",              "Statistiken — Casting Stats", "TF Casting Statistiken"),
        ("/odlasci.php",                "Statistiken — Abgaenge",      "Abgangs-Auswertungen"),
    ]

    # Zusaetzlich TF Statistik falls erreichbar
    schritte.append(("/modul_statistike?page=tf", "Statistiken — TF Statistik", "Task Force Statistiken"))

    gesamt = len(schritte)
    for i, (pfad, titel, hinweis) in enumerate(schritte, 1):
        print(f"[{i}/{gesamt}] {titel}")
        nav(page, pfad)
        time.sleep(pause * 0.5)
        zeige_overlay(page, titel, i, gesamt, hinweis)
        time.sleep(pause)

    print("Statistiken-Demo fertig.")


def tf_demo(page: Page, pause: float = 2.0):
    """
    Task Force Demo:
    1. TF Hauptseite
    2. Casting Termine
    3. TF Nalog Liste
    """
    print("\n=== TASK FORCE DEMO ===")

    schritte = [
        ("/tf_naslovnica",         "Task Force — Hauptseite",    "TF Uebersicht und Navigation"),
        ("/tf_termini",            "Task Force — Casting Termine","Anstehende Casting-Termine"),
        ("/tf_nalozi?page=list",   "Task Force — Nalog Liste",   "TF Auftrags-Liste"),
    ]

    gesamt = len(schritte)
    for i, (pfad, titel, hinweis) in enumerate(schritte, 1):
        print(f"[{i}/{gesamt}] {titel}")
        nav(page, pfad)
        time.sleep(pause * 0.5)
        zeige_overlay(page, titel, i, gesamt, hinweis)
        time.sleep(pause)

    print("Task Force Demo fertig.")


def reminders_demo(page: Page, pause: float = 2.0):
    """
    Reminders Demo:
    1. Reminder-Dashboard (Companies)
    2. Kandidaten-Reminder (falls vorhanden)
    """
    print("\n=== REMINDERS DEMO ===")

    schritte = [
        ("/dashboardRemindera/companiesReminders",  "Reminders — Companies",   "Unternehmens-Erinnerungen"),
        ("/dashboardRemindera/candidatesReminders", "Reminders — Kandidaten",  "Kandidaten-Erinnerungen"),
    ]

    gesamt = len(schritte)
    for i, (pfad, titel, hinweis) in enumerate(schritte, 1):
        print(f"[{i}/{gesamt}] {titel}")
        nav(page, pfad)
        time.sleep(pause * 0.5)
        zeige_overlay(page, titel, i, gesamt, hinweis)
        time.sleep(pause)

    print("Reminders-Demo fertig.")


def log_demo(page: Page, pause: float = 2.0):
    """
    Log Demo:
    1. Eigene Logs
    2. Alle Logs
    """
    print("\n=== LOG DEMO ===")

    schritte = [
        ("/logs?page=list",     "Logs — Eigene Logs",   "Eigene Aktivitaetslogs"),
        ("/logs?page=list_all", "Logs — Alle Logs",     "System-weite Log-Uebersicht"),
    ]

    gesamt = len(schritte)
    for i, (pfad, titel, hinweis) in enumerate(schritte, 1):
        print(f"[{i}/{gesamt}] {titel}")
        nav(page, pfad)
        time.sleep(pause * 0.5)
        zeige_overlay(page, titel, i, gesamt, hinweis)
        time.sleep(pause)

    print("Log-Demo fertig.")


def tiketi_demo(page: Page, pause: float = 2.0):
    """
    Tiketi (Tickets) Demo:
    1. Ticket-Liste
    2. Ersten Ticket oeffnen (falls vorhanden)
    """
    print("\n=== TIKETI DEMO ===")

    # Schritt 1: Ticket-Liste
    print("[1/2] Ticket-Liste")
    nav(page, '/tiketi?page=list')
    time.sleep(pause * 0.5)
    zeige_overlay(page, "Tiketi — Ticket-Liste", 1, 2, "Alle Support-Tickets")
    time.sleep(pause)

    # Schritt 2: Ersten Ticket oeffnen
    print("[2/2] Ersten Ticket oeffnen")
    aktion_gemacht = False
    try:
        link = page.locator('table a[href*="page=open"], table a[href*="tiketi"]').first
        if link.count() > 0 and link.is_visible():
            link.click()
            warte_laden(page)
            time.sleep(pause * 0.5)
            aktion_gemacht = True
    except Exception:
        pass

    if not aktion_gemacht:
        print("  Kein Ticket gefunden, bleibe auf Liste")

    zeige_overlay(page, "Tiketi — Detail / Liste", 2, 2, "Ticket-Verwaltung vollstaendig")
    time.sleep(pause)

    print("Tiketi-Demo fertig.")


# ── Demo-Funktionen Tabelle ────────────────────────────────────────────────────
DEMO_FUNKTIONEN = {
    "dashboard":   dashboard_demo,
    "nachrichten": nachrichten_demo,
    "kandidaten":  kandidaten_demo,
    "sales":       sales_demo,
    "companies":   companies_demo,
    "auftraege":   auftraege_demo,
    "finanzen":    finanzen_demo,
    "tasks":       tasks_demo,
    "mitarbeiter": mitarbeiter_demo,
    "kampagnen":   kampagnen_demo,
    "dipl":        dipl_demo,
    "dak":         dak_demo,
    "partner":     partner_demo,
    "statistiken": statistiken_demo,
    "tf":          tf_demo,
    "reminders":   reminders_demo,
    "log":         log_demo,
    "tiketi":      tiketi_demo,
}


# ── Hauptprogramm ─────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description='CRM Live Demo — Playwright Prasentationsmodus'
    )
    parser.add_argument('--modul', choices=ALLE_MODULE, default=None,
                        help='Einzelnes Routen-Modul (Legacy-Modus)')
    parser.add_argument('--alle', action='store_true',
                        help='Alle Routen-Module durchlaufen (Legacy-Modus)')
    parser.add_argument('--auto', type=float, default=0,
                        help='Sekunden pro Schritt (0 = manuell per Pfeiltaste)')
    parser.add_argument('--kandidaten-demo', action='store_true',
                        help='Legacy: Live Kandidaten-Workflow')
    parser.add_argument('--demo', choices=list(DEMO_FUNKTIONEN.keys()), default=None,
                        metavar='MODUL',
                        help='Demo-Funktion starten: ' + ', '.join(DEMO_FUNKTIONEN.keys()))
    parser.add_argument('--komplett', action='store_true',
                        help='ALLE Demo-Funktionen nacheinander ausfuehren')
    args = parser.parse_args()

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=False,
            slow_mo=0,
            args=[
                '--start-maximized',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-infobars',
            ]
        )
        context = browser.new_context(viewport=None, ignore_https_errors=True)
        page = context.new_page()

        try:
            login(page)
            pause = args.auto if args.auto > 0 else 2.0

            # ── Demo-Funktion (--demo MODUL) ─────────────────────
            if args.demo:
                print(f"\nStarte Demo: {args.demo} (Pause: {pause}s)")
                DEMO_FUNKTIONEN[args.demo](page, pause=pause)
                print("\nBrowser bleibt offen. Fenster schliessen zum Beenden.")
                try:
                    page.wait_for_event('close', timeout=0)
                except Exception:
                    pass
                return

            # ── Komplett-Demo (--komplett) ───────────────────────
            if args.komplett:
                print(f"\nKOMPLETT-DEMO startet ({len(DEMO_FUNKTIONEN)} Module, Pause: {pause}s)")
                for name, fn in DEMO_FUNKTIONEN.items():
                    print(f"\n{'='*60}")
                    print(f"MODUL: {name.upper()}")
                    print('='*60)
                    try:
                        fn(page, pause=pause)
                    except Exception as e:
                        print(f"  Fehler in {name}: {e}")
                    time.sleep(1)

                print("\nAlle Module abgeschlossen!")
                print("Browser bleibt offen. Fenster schliessen zum Beenden.")
                try:
                    page.wait_for_event('close', timeout=0)
                except Exception:
                    pass
                return

            # ── Legacy: Kandidaten-Demo ──────────────────────────
            if args.kandidaten_demo:
                print(f"Kandidaten-Demo startet (Pause: {pause}s) ...")
                kandidaten_demo(page, pause=pause)
                print("Browser bleibt offen. Fenster schliessen zum Beenden.")
                try:
                    page.wait_for_event('close', timeout=0)
                except Exception:
                    pass
                return

            # ── Legacy: Normaler Modul-Rundgang ─────────────────
            if args.alle:
                module = ALLE_MODULE
            elif args.modul:
                module = [args.modul]
            else:
                module = ['dashboard', 'kandidaten', 'sales', 'companies',
                          'auftraege', 'finanzen', 'tasks']

            seiten = []
            for m in module:
                seiten.extend(ROUTEN[m])

            gesamt = len(seiten)
            print(f"Demo: {gesamt} Seiten | Module: {', '.join(module)}")

            index = 0
            titel, pfad = seiten[0]
            gehe_zu(page, CRM_URL + pfad, titel, 1, gesamt)

            if args.auto > 0:
                print(f"Auto-Modus: {args.auto}s pro Seite")
                while index < gesamt - 1:
                    time.sleep(args.auto)
                    index += 1
                    titel, pfad = seiten[index]
                    gehe_zu(page, CRM_URL + pfad, titel, index + 1, gesamt)
                time.sleep(args.auto)
            else:
                print("Bereit — Pfeil RECHTS/LINKS im Browser zur Steuerung")

                def handle_key(key):
                    nonlocal index
                    if key == 'ArrowRight' and index < gesamt - 1:
                        index += 1
                        t, p = seiten[index]
                        gehe_zu(page, CRM_URL + p, t, index + 1, gesamt)
                    elif key == 'ArrowLeft' and index > 0:
                        index -= 1
                        t, p = seiten[index]
                        gehe_zu(page, CRM_URL + p, t, index + 1, gesamt)

                page.on('keydown', lambda e: handle_key(e.get('key', '')))
                try:
                    page.wait_for_event('close', timeout=0)
                except Exception:
                    pass

        except KeyboardInterrupt:
            pass
        except Exception as e:
            print(f"Fehler: {e}")
        finally:
            print("Demo beendet.")
            try:
                browser.close()
            except Exception:
                pass


if __name__ == '__main__':
    main()
