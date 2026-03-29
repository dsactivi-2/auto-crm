# -*- coding: utf-8 -*-
"""
CRM Crawler for crm.job-step.com
Crawls all known URLs, extracts structure, saves to JSON and Markdown.
"""

import sys
import os
import json
import re
import time
from urllib.parse import urljoin, urlparse, urlencode
from collections import OrderedDict

# Disable SSL warnings
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

import requests
from bs4 import BeautifulSoup

# ── Config ──────────────────────────────────────────────────────────────────
BASE_URL = "https://crm.job-step.com"
USERNAME = "d.selmanovic@step2job.com"
PASSWORD = "y2@U2y9qx1@?"
TIMEOUT  = 30
OUT_JSON = os.path.join(os.path.dirname(__file__), "../docs/crm_map.json")
OUT_MD   = os.path.join(os.path.dirname(__file__), "../docs/FUNKTIONSVERZEICHNIS.md")

# ── Known URLs ───────────────────────────────────────────────────────────────
KNOWN_URLS = [
    "/messages?page=list",
    "/kandidati?page=list_ajax",
    "/sales?page=list&type=0&status=0",
    "/sales?page=list&type=1&status=0",
    "/companies?page=list",
    "/nalozi?page=list",
    "/finances?page=info",
    "/finances?page=list",
    "/finances?page=list_nalozi",
    "/tasks?page=list&sort=new",
    "/employees?page=list",
    "/kampanje?page=list",
    "/dipl?page=listaObrada",
    "/dak?page=list&type=0",
    "/partners/list",
    "/dvag_kandidati?page=list",
    "/positions?page=list",
    "/timovi?page=list",
    "/logs?page=list",
    "/tiketi?page=list",
    "/modul_statistike?page=open",
    "/casting_appointments?page=openAll",
    "/tf_naslovnica",
    "/dashboardNaloga/companies.php",
    "/odlasci.php",
    "/projekcijaForm.php",
    "/pregledPrijava.php?page=main_list",
    "/employees-reports?page=list",
    "/financesProjection.php?page=list",
    "/provizije?page=postavke",
    "/link_generator?page=list",
    "/grupe_kandidata?page=list",
    "/skole?page=pregled",
    "/message_providers?page=list_all",
    "/tutorial?page=list",
    "/partner_faq_bot",
]

# ── Helpers ───────────────────────────────────────────────────────────────────

def make_session():
    s = requests.Session()
    s.verify = False
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    })
    return s


def login(session):
    print("[*] GET login page …")
    r = session.get(BASE_URL + "/login", timeout=TIMEOUT, verify=False)
    print(f"    Status: {r.status_code}  URL: {r.url}")

    payload = {
        "login_email":    USERNAME,
        "login_password": PASSWORD,
        "login_rm":       "1",
    }
    print("[*] POST login …")
    r2 = session.post(
        BASE_URL + "/do.php?form=login",
        data=payload,
        timeout=TIMEOUT,
        verify=False,
        allow_redirects=True,
    )
    print(f"    Status: {r2.status_code}  URL: {r2.url}")

    if "login" in r2.url.lower():
        print("[!] Login scheint fehlgeschlagen (noch auf Login-Seite).")
        return False
    print("[+] Login erfolgreich!")
    return True


def is_same_domain(url):
    parsed = urlparse(url)
    return parsed.netloc == "" or parsed.netloc == urlparse(BASE_URL).netloc


def clean_text(text):
    if not text:
        return ""
    return " ".join(text.split())


def extract_page_info(url, html, response_url):
    """Extract structured info from a page's HTML."""
    soup = BeautifulSoup(html, "lxml")

    info = {
        "url": url,
        "final_url": response_url,
        "title": "",
        "headings": [],
        "nav_links": [],
        "tables": [],
        "forms": [],
        "buttons": [],
        "sub_navigation": [],
        "labels_fields": [],
        "select_options": {},
        "modals": [],
        "links_found": [],
        "error": None,
    }

    # Title
    title_tag = soup.find("title")
    if title_tag:
        info["title"] = clean_text(title_tag.get_text())

    # Headings
    for tag in ["h1", "h2", "h3", "h4"]:
        for h in soup.find_all(tag):
            t = clean_text(h.get_text())
            if t and t not in info["headings"]:
                info["headings"].append(t)

    # Sub-navigation / tabs (ul.nav, .tabs, .sub-nav, breadcrumb)
    nav_selectors = [
        "ul.nav", "ul.tabs", ".sub-nav", ".sub-navigation",
        ".breadcrumb", ".navbar", "nav", ".sidebar", ".menu",
        ".nav-tabs", ".nav-pills",
    ]
    seen_nav = set()
    for sel in nav_selectors:
        for el in soup.select(sel):
            for a in el.find_all("a", href=True):
                text = clean_text(a.get_text())
                href = a["href"]
                if text and href and text not in seen_nav:
                    seen_nav.add(text)
                    info["sub_navigation"].append({"text": text, "href": href})

    # Tables
    for table in soup.find_all("table"):
        headers = []
        for th in table.find_all("th"):
            h = clean_text(th.get_text())
            if h:
                headers.append(h)
        # also first tr td if no th
        if not headers:
            first_row = table.find("tr")
            if first_row:
                for td in first_row.find_all("td"):
                    h = clean_text(td.get_text())
                    if h:
                        headers.append(h)
        if headers:
            info["tables"].append({"headers": headers})

    # Forms
    for form in soup.find_all("form"):
        form_info = {
            "action": form.get("action", ""),
            "method": form.get("method", "GET").upper(),
            "id":     form.get("id", ""),
            "fields": [],
        }
        for inp in form.find_all(["input", "select", "textarea"]):
            field = {
                "tag":   inp.name,
                "name":  inp.get("name", ""),
                "type":  inp.get("type", ""),
                "id":    inp.get("id", ""),
                "placeholder": inp.get("placeholder", ""),
            }
            # Label for field
            label = soup.find("label", attrs={"for": field["id"]}) if field["id"] else None
            field["label"] = clean_text(label.get_text()) if label else ""
            if inp.name == "select":
                options = [clean_text(o.get_text()) for o in inp.find_all("option") if o.get_text(strip=True)]
                field["options"] = options[:20]  # limit
            form_info["fields"].append(field)
        if form_info["fields"] or form_info["action"]:
            info["forms"].append(form_info)

    # Buttons (inside and outside forms)
    seen_btns = set()
    for btn in soup.find_all(["button", "input"]):
        if btn.name == "input" and btn.get("type") not in ("submit", "button", "reset"):
            continue
        text = clean_text(btn.get_text()) or btn.get("value", "") or btn.get("title", "")
        if text and text not in seen_btns:
            seen_btns.add(text)
            info["buttons"].append({
                "text":    text,
                "type":    btn.get("type", ""),
                "id":      btn.get("id", ""),
                "onclick": btn.get("onclick", "")[:120] if btn.get("onclick") else "",
                "class":   " ".join(btn.get("class", [])),
            })
    # Also <a> styled as buttons
    for a in soup.find_all("a", class_=re.compile(r"btn|button", re.I)):
        text = clean_text(a.get_text())
        if text and text not in seen_btns:
            seen_btns.add(text)
            info["buttons"].append({
                "text":  text,
                "type":  "link-button",
                "href":  a.get("href", ""),
                "class": " ".join(a.get("class", [])),
            })

    # Labels / field labels outside forms
    for label in soup.find_all("label"):
        t = clean_text(label.get_text())
        if t and len(t) < 80:
            info["labels_fields"].append(t)
    # also .form-group dt, .field-label
    for sel in [".form-group", "dt", ".field-label", ".label", "th"]:
        for el in soup.select(sel):
            t = clean_text(el.get_text())
            if t and len(t) < 80 and t not in info["labels_fields"]:
                info["labels_fields"].append(t)

    # Modals / dialogs
    for modal in soup.select(".modal, [role='dialog'], .dialog"):
        modal_id = modal.get("id", "")
        modal_title_el = modal.find(class_=re.compile(r"modal-title|dialog-title", re.I))
        modal_title = clean_text(modal_title_el.get_text()) if modal_title_el else ""
        if modal_id or modal_title:
            info["modals"].append({"id": modal_id, "title": modal_title})

    # All internal links found on this page
    seen_links = set()
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href or href.startswith("#") or href.startswith("javascript"):
            continue
        full = urljoin(BASE_URL, href)
        if is_same_domain(full) and full not in seen_links:
            seen_links.add(full)
            link_text = clean_text(a.get_text())
            info["links_found"].append({"url": full, "text": link_text[:80]})

    # Deduplicate labels
    info["labels_fields"] = list(OrderedDict.fromkeys(info["labels_fields"]))[:60]

    return info


def fetch_page(session, url, label=""):
    full_url = urljoin(BASE_URL, url)
    try:
        r = session.get(full_url, timeout=TIMEOUT, verify=False)
        print(f"  [{r.status_code}] {label or url}")
        if r.status_code == 200 and r.text:
            return r.text, r.url
        return None, r.url
    except Exception as e:
        print(f"  [ERR] {url}: {e}")
        return None, full_url


def should_crawl_sublink(url):
    """Filter which discovered links are worth crawling."""
    parsed = urlparse(url)
    path = parsed.path.lower()
    # skip static files, external, anchors
    skip_exts = (".css", ".js", ".png", ".jpg", ".jpeg", ".gif", ".svg",
                 ".ico", ".pdf", ".zip", ".xlsx", ".docx", ".woff", ".woff2")
    if any(path.endswith(e) for e in skip_exts):
        return False
    if not is_same_domain(url):
        return False
    # skip do.php actions (they POST / redirect)
    if "do.php" in path:
        return False
    # skip logout
    if "logout" in path or "signout" in path:
        return False
    return True


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    session = make_session()

    if not login(session):
        print("[!] Login fehlgeschlagen. Abbruch.")
        sys.exit(1)

    crm_map = {}  # url -> page_info

    visited = set()
    queue = list(KNOWN_URLS)

    # Phase 1: Crawl all known URLs
    print("\n[*] Phase 1: Bekannte URLs crawlen …")
    for url in queue:
        if url in visited:
            continue
        visited.add(url)
        html, final_url = fetch_page(session, url, url)
        if html:
            info = extract_page_info(url, html, final_url)
            crm_map[url] = info
            time.sleep(0.3)  # polite delay

    # Phase 2: Crawl 1 level of newly discovered internal links
    print("\n[*] Phase 2: Entdeckte Links (1 Ebene tief) …")
    sub_queue = []
    for url, info in crm_map.items():
        for link in info.get("links_found", []):
            link_url = link["url"]
            # Convert full URL back to path+query for consistency
            parsed = urlparse(link_url)
            path_q = parsed.path
            if parsed.query:
                path_q += "?" + parsed.query
            if path_q not in visited and should_crawl_sublink(link_url):
                sub_queue.append(path_q)

    # Deduplicate
    sub_queue = list(OrderedDict.fromkeys(sub_queue))
    print(f"    {len(sub_queue)} neue Links gefunden")

    for url in sub_queue[:80]:  # cap at 80 sub-links to avoid endless crawl
        if url in visited:
            continue
        visited.add(url)
        html, final_url = fetch_page(session, url, url)
        if html:
            info = extract_page_info(url, html, final_url)
            crm_map[url] = info
            time.sleep(0.3)

    # Save JSON
    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(crm_map, f, ensure_ascii=False, indent=2)
    print(f"\n[+] JSON gespeichert: {OUT_JSON}  ({len(crm_map)} Seiten)")

    # Generate Markdown
    generate_markdown(crm_map, OUT_MD)
    print(f"[+] Markdown gespeichert: {OUT_MD}")


# ── Markdown Generator ────────────────────────────────────────────────────────

MODULE_NAMES = {
    "/messages":              "Nachrichten (Messages)",
    "/kandidati":             "Kandidaten",
    "/sales":                 "Sales / Akquise",
    "/companies":             "Unternehmen (Companies)",
    "/nalozi":                "Aufträge (Nalozi)",
    "/finances":              "Finanzen",
    "/tasks":                 "Aufgaben (Tasks)",
    "/employees":             "Mitarbeiter",
    "/kampanje":              "Kampagnen",
    "/dipl":                  "Diplomanden (Dipl)",
    "/dak":                   "DAK",
    "/partners":              "Partner",
    "/dvag_kandidati":        "DVAG Kandidaten",
    "/positions":             "Positionen / Stellen",
    "/timovi":                "Teams (Timovi)",
    "/logs":                  "Protokoll / Logs",
    "/tiketi":                "Tickets",
    "/modul_statistike":      "Statistiken",
    "/casting_appointments":  "Casting / Termine",
    "/tf_naslovnica":         "TF Startseite",
    "/dashboardNaloga":       "Dashboard Aufträge",
    "/odlasci.php":           "Abgänge (Odlasci)",
    "/projekcijaForm.php":    "Projektionsformular",
    "/pregledPrijava.php":    "Bewerbungsübersicht",
    "/employees-reports":     "Mitarbeiter-Reports",
    "/financesProjection.php":"Finanzprojektion",
    "/provizije":             "Provisionen",
    "/link_generator":        "Link-Generator",
    "/grupe_kandidata":       "Kandidatengruppen",
    "/skole":                 "Schulen",
    "/message_providers":     "Nachrichtenanbieter",
    "/tutorial":              "Tutorial",
    "/partner_faq_bot":       "Partner FAQ Bot",
}

AUTOMATION_HINTS = {
    "/messages":             "Automatisches Versenden von Nachrichten, Template-Management, Massenversand.",
    "/kandidati":            "Kandidaten-Import/Export, Status-Updates, automatische Zuordnung zu Jobs.",
    "/sales":                "Lead-Tracking, automatische Follow-up Reminder, Pipeline-Updates.",
    "/companies":            "Firmendaten-Sync, automatische Duplikatsprüfung, CRM-Integration.",
    "/nalozi":               "Auftragsanlage aus Templates, Status-Benachrichtigungen, Rechnungsauslösung.",
    "/finances":             "Automatische Rechnungserstellung, Zahlungserinnerungen, Reporting.",
    "/tasks":                "Task-Zuweisung nach Regeln, Deadline-Benachrichtigungen, Eskalation.",
    "/employees":            "Onboarding-Workflows, Leistungsberichte, Zugriffsmanagement.",
    "/kampanje":             "Kampagnen-Scheduling, A/B-Test-Auswertung, automatische Segmentierung.",
    "/dipl":                 "Bewerbungsverarbeitung, automatische Statusupdates, Benachrichtigungen.",
    "/dak":                  "Datenpflege, automatische Validierung, Export.",
    "/partners":             "Partner-Kommunikation, Provisionsberechnung, Reporting.",
    "/dvag_kandidati":       "Kandidaten-Sync mit DVAG, Status-Updates, automatische Zuordnung.",
    "/positions":            "Stellenausschreibungs-Export auf Jobbörsen, Matching mit Kandidaten.",
    "/timovi":               "Team-Zuweisung, Leistungsauswertung, Benachrichtigungen.",
    "/logs":                 "Automatische Anomalie-Erkennung, Audit-Reports, Alerting.",
    "/tiketi":               "Ticket-Routing, SLA-Überwachung, automatische Eskalation.",
    "/modul_statistike":     "Automatische KPI-Reports, Dashboard-Exports, Scheduling.",
    "/casting_appointments": "Terminplanung, automatische Erinnerungen, Kalender-Sync.",
    "/tf_naslovnica":        "Dashboard-Monitoring, automatische Alerts bei Abweichungen.",
    "/dashboardNaloga":      "Echtzeit-Überwachung, automatische Reports.",
    "/odlasci.php":          "Abgangs-Tracking, automatische HR-Benachrichtigungen.",
    "/projekcijaForm.php":   "Automatische Projektionserstellung aus historischen Daten.",
    "/pregledPrijava.php":   "Bewerbungs-Screening, automatische Vorauswahl, Status-Updates.",
    "/employees-reports":    "Automatische Report-Generierung, Scheduling, E-Mail-Versand.",
    "/financesProjection.php":"Automatische Finanzprognosen, Budget-Alerts.",
    "/provizije":            "Automatische Provisionsberechnung nach Regeln.",
    "/link_generator":       "Automatische Link-Erstellung für Kampagnen, Tracking.",
    "/grupe_kandidata":      "Automatische Gruppenzuweisung nach Kriterien.",
    "/skole":                "Schulverwaltung, automatische Kursbenachrichtigungen.",
    "/message_providers":    "Provider-Konfiguration, automatisches Failover.",
    "/tutorial":             "Onboarding-Automation, FortschrittsTracking.",
    "/partner_faq_bot":      "Chatbot-Training, automatische FAQ-Updates.",
}


def get_module_key(url):
    for key in MODULE_NAMES:
        if url.startswith(key):
            return key
    return url.split("?")[0]


def generate_markdown(crm_map, out_path):
    # Group pages by module
    modules = OrderedDict()
    for url, info in crm_map.items():
        key = get_module_key(url)
        if key not in modules:
            modules[key] = []
        modules[key].append((url, info))

    lines = []
    lines.append("# CRM Funktionsverzeichnis — crm.job-step.com")
    lines.append("")
    lines.append(f"> Automatisch generiert am {__import__('datetime').date.today().isoformat()} "
                 f"durch CRM-Crawler  |  {len(crm_map)} Seiten gecrawlt")
    lines.append("")
    lines.append("---")
    lines.append("")

    # TOC
    lines.append("## Inhaltsverzeichnis")
    lines.append("")
    for key, pages in modules.items():
        name = MODULE_NAMES.get(key, key)
        anchor = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        lines.append(f"- [{name}](#{anchor})")
    lines.append("")
    lines.append("---")
    lines.append("")

    # Modules
    for key, pages in modules.items():
        name = MODULE_NAMES.get(key, key)
        hint = AUTOMATION_HINTS.get(key, "Automatisierungspotential vorhanden.")

        lines.append(f"## {name}")
        lines.append("")

        # Collect all data across sub-pages of this module
        all_headings = []
        all_tables   = []
        all_buttons  = []
        all_forms    = []
        all_labels   = []
        all_subnav   = []
        all_modals   = []

        for url, info in pages:
            lines.append(f"### Seite: `{url}`")
            if info.get("title"):
                lines.append(f"**Titel:** {info['title']}")
            lines.append("")

            for h in info.get("headings", []):
                if h not in all_headings:
                    all_headings.append(h)
            for t in info.get("tables", []):
                all_tables.append(t)
            for b in info.get("buttons", []):
                all_buttons.append(b)
            for f in info.get("forms", []):
                all_forms.append(f)
            for l in info.get("labels_fields", []):
                if l not in all_labels:
                    all_labels.append(l)
            for s in info.get("sub_navigation", []):
                all_subnav.append(s)
            for m in info.get("modals", []):
                all_modals.append(m)

            # Page-level details
            if info.get("headings"):
                lines.append("**Überschriften:**")
                for h in info["headings"][:10]:
                    lines.append(f"- {h}")
                lines.append("")

            if info.get("sub_navigation"):
                lines.append("**Navigation / Tabs:**")
                seen = set()
                for s in info["sub_navigation"][:15]:
                    if s["text"] not in seen:
                        seen.add(s["text"])
                        lines.append(f"- {s['text']} → `{s['href']}`")
                lines.append("")

            if info.get("tables"):
                lines.append("**Tabellen-Felder:**")
                for i, t in enumerate(info["tables"][:5], 1):
                    if t["headers"]:
                        lines.append(f"- Tabelle {i}: " + " | ".join(t["headers"][:15]))
                lines.append("")

            if info.get("forms"):
                lines.append("**Formulare:**")
                for form in info["forms"][:5]:
                    action = form.get("action") or "(kein action)"
                    method = form.get("method", "GET")
                    fid    = form.get("id", "")
                    lines.append(f"- Form `{fid}` [{method}] → `{action}`")
                    for field in form.get("fields", [])[:12]:
                        fname = field.get("name") or field.get("id") or "?"
                        ftype = field.get("type") or field.get("tag")
                        flabel = field.get("label") or field.get("placeholder") or ""
                        lines.append(f"  - `{fname}` ({ftype}){': ' + flabel if flabel else ''}")
                lines.append("")

            if info.get("buttons"):
                btn_texts = [b["text"] for b in info["buttons"] if b.get("text")]
                # deduplicate
                btn_texts = list(OrderedDict.fromkeys(btn_texts))[:20]
                if btn_texts:
                    lines.append("**Buttons / Aktionen:**")
                    lines.append(", ".join(f"`{b}`" for b in btn_texts))
                    lines.append("")

            if info.get("modals"):
                lines.append("**Dialoge / Modals:**")
                for m in info["modals"][:5]:
                    lines.append(f"- {m['title'] or m['id']}")
                lines.append("")

            if info.get("error"):
                lines.append(f"> Fehler beim Laden: {info['error']}")
                lines.append("")

        # Module summary
        lines.append("---")
        lines.append(f"**Automatisierungspotential:** {hint}")
        lines.append("")
        lines.append("---")
        lines.append("")

    # Overall summary table
    lines.append("## Zusammenfassung")
    lines.append("")
    lines.append("| Modul | Seiten | Tabellen | Formulare | Buttons |")
    lines.append("|-------|--------|----------|-----------|---------|")
    for key, pages in modules.items():
        name = MODULE_NAMES.get(key, key)
        n_pages  = len(pages)
        n_tables = sum(len(info.get("tables", [])) for _, info in pages)
        n_forms  = sum(len(info.get("forms", []))  for _, info in pages)
        n_btns   = sum(len(info.get("buttons", [])) for _, info in pages)
        lines.append(f"| {name} | {n_pages} | {n_tables} | {n_forms} | {n_btns} |")
    lines.append("")

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


if __name__ == "__main__":
    main()
