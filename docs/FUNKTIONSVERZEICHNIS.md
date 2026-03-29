# CRM Funktionsverzeichnis — crm.job-step.com

> Automatisch generiert am 2026-03-27 durch CRM-Crawler | 103 Seiten gecrawlt
> System: Jobstep CRM | Eingeloggt als: Denis Selmanovic

---

## Inhaltsverzeichnis

1. [Dashboard / Startseite](#1-dashboard--startseite)
2. [Nachrichten (Messages)](#2-nachrichten-messages)
3. [Kandidaten](#3-kandidaten)
4. [Sales / Akquise](#4-sales--akquise)
5. [Unternehmen (Companies)](#5-unternehmen-companies)
6. [Aufträge (Nalozi)](#6-aufträge-nalozi)
7. [Finanzen](#7-finanzen)
8. [Aufgaben (Tasks)](#8-aufgaben-tasks)
9. [Mitarbeiter (Employees)](#9-mitarbeiter-employees)
10. [Kampagnen](#10-kampagnen)
11. [DIPL — Diplomanden / Nostrifikation](#11-dipl--diplomanden--nostrifikation)
12. [DAK](#12-dak)
13. [Partner](#13-partner)
14. [DVAG Kandidaten & Aufträge](#14-dvag-kandidaten--aufträge)
15. [Positionen / Stellen](#15-positionen--stellen)
16. [Teams (Timovi)](#16-teams-timovi)
17. [Protokoll / Logs](#17-protokoll--logs)
18. [Tickets (Tiketi)](#18-tickets-tiketi)
19. [Statistiken](#19-statistiken)
20. [Task Force (TF)](#20-task-force-tf)
21. [Casting / Termine](#21-casting--termine)
22. [Dashboard Aufträge](#22-dashboard-aufträge)
23. [Abgänge (Odlasci)](#23-abgänge-odlasci)
24. [Finanzprojektion](#24-finanzprojektion)
25. [Bewerbungsübersicht](#25-bewerbungsübersicht)
26. [Mitarbeiter-Reports](#26-mitarbeiter-reports)
27. [Provisionen (Provizije)](#27-provisionen-provizije)
28. [Link-Generator](#28-link-generator)
29. [Kandidatengruppen](#29-kandidatengruppen)
30. [Schulen (Skole)](#30-schulen-skole)
31. [Nachrichtenanbieter (Message Providers)](#31-nachrichtenanbieter-message-providers)
32. [Tutorial](#32-tutorial)
33. [Partner FAQ Bot](#33-partner-faq-bot)
34. [Weitere entdeckte Module](#34-weitere-entdeckte-module)
35. [Zusammenfassung & Automatisierungspotential](#35-zusammenfassung--automatisierungspotential)

---

## 1. Dashboard / Startseite

**URL:** `/`
**Titel:** Jobstep — Willkommen Denis Selmanovic

### Funktionen
- Anzeige der Willkommens-Nachricht mit eingeloggtem Benutzer
- Statistik der Kandidaten nach Filialen (Poslovnice)
- Globale System-Übersicht

### Tabellen-Felder
| # | Naziv (Name) | Adresa (Adresse) | PKN | PN |
|---|---|---|---|---|
| Filial-Nr. | Filialname | Adresse | PKN-Wert | PN-Wert |

### Buttons / Aktionen
- `Refresh` — Daten neu laden
- `Idi na dashboard naloga` — Zum Auftrags-Dashboard wechseln

### Automatisierungspotential
Automatisches Dashboard-Monitoring, tägliche KPI-Reports per E-Mail, Alerting bei Abweichungen von Sollwerten.

---

## 2. Nachrichten (Messages)

**URL:** `/messages?page=list`
**Weitere Seiten:** `/messages?page=new`, `/messages?page=open&id=*`, `/messages?page=reply&id=*`

### Funktionen
- Internes Nachrichtensystem (Inbox & Outbox)
- Neue Nachricht erstellen und versenden
- Nachrichten lesen, beantworten, löschen

### Tabellen-Felder — Eingang (Inbox)
| Od (Von) | Naslov (Betreff) | Primljeno (Erhalten) |
|---|---|---|

### Tabellen-Felder — Ausgang (Outbox)
| Za (An) | Naslov (Betreff) | Poslano (Gesendet) |
|---|---|---|

### Formulare
- Neue Nachricht: Empfänger auswählen, Betreff, Nachrichtentext, Senden

### Buttons / Aktionen
- `Nova poruka` — Neue Nachricht verfassen
- `Pošalji` — Nachricht senden
- `OBRIŠI` — Nachricht löschen
- `Povratak` — Zurück zur Liste

### Automatisierungspotential
Automatischer Nachrichtenversand bei CRM-Ereignissen (neuer Kandidat, Status-Änderung), Template-basierter Massenversand, automatische Weiterleitung und Archivierung.

---

## 3. Kandidaten

**URL:** `/kandidati?page=list_ajax`

### Funktionen
- Liste aller Kandidaten mit AJAX-geladener Tabelle
- Suchfilter nach verschiedenen Kriterien
- Archivierung von Kandidaten
- Transfer zu Task Force (`/candidateTransferToTF/candidateTransferFIlter`)
- Marketing-Export (`/marketingCandidateExport/marketingCandidateFilter`)
- Kandidatengruppen-Verwaltung

### Suche / Filter
- TRAŽI (Suche) mit mehreren Filterfeldern

### Buttons / Aktionen
- `TRAŽI` — Kandidaten suchen/filtern
- `ARHIVA` — Archiv anzeigen
- `ARHIVIRAJ` — Ausgewählte Kandidaten archivieren
- `Prebaci` — Kandidaten zur Task Force übertragen
- `Export` — Kandidatendaten für Marketing exportieren

### Automatisierungspotential
Automatischer Kandidaten-Import aus externen Quellen (Jobbörsen, Formulare), automatische Status-Updates, regelbasierte Zuweisung zu Agenten/Teams, Massenexport für Marketingkampagnen.

---

## 4. Sales / Akquise

**URLs:**
- `/sales?page=list&type=0&status=0` — First Call - Neu
- `/sales?page=list&type=0&status=1` — First Call - Aktiv
- `/sales?page=list&type=0&status=2` — First Call - Archiv
- `/sales?page=list&type=1&status=0` — Prodaja (Verkauf) - Neu
- `/sales?page=list&type=1&status=1` — Prodaja - Aktiv
- `/sales?page=list&type=1&status=2` — Prodaja - Archiv
- `/sales?page=add` — Neuen Lead hinzufügen
- `/sales?page=open&id=*` — Lead-Detailansicht
- `/sales?page=edit&id=*` — Lead bearbeiten

### Funktionen
- Zweistufige Sales-Pipeline: **First Call** (Erstgespräch) und **Prodaja** (Verkauf)
- Lead-Verwaltung mit drei Status-Stufen: Neu / Aktiv / Archiv
- Detailansicht mit Kontaktpersonen und Dokumenten
- Terminplanung und Aufgaben pro Lead
- Status-Tracking mit Pipeline-Ansicht

### Tabellen-Felder — Listen
| Naziv (Name) | Porijeklo (Herkunft) | Grad (Stadt) | Telefon | E-mail | Status |
|---|---|---|---|---|---|

### Tabellen-Felder — Detailansicht Kontakt
| Ime i prezime (Name) | Telefon | E-mail |
|---|---|---|

### Tabellen-Felder — Detailansicht Dokumente
| Datum | Naziv (Name) | Opis (Beschreibung) | Preuzimanje (Download) |
|---|---|---|---|

### Buttons / Aktionen
- `Dodaj` — Neuen Lead hinzufügen
- `Snimi` — Änderungen speichern
- `PROMJENI` — Status/Daten ändern
- `ZAKAŽI` — Termin planen
- `IZVRŠI` — Aufgabe ausführen/abschließen
- `Lead` / `In progress` / `Aktivan` — Status-Wechsel
- `Povratak` — Zurück zur Liste

### Automatisierungspotential
Automatische Follow-up Erinnerungen nach X Tagen ohne Kontakt, Status-basierte Trigger-Nachrichten, Lead-Scoring, automatische Zuweisung nach Region/Branche, Pipeline-Reports.

---

## 5. Unternehmen (Companies)

**URLs:**
- `/companies?page=list` — Alle Unternehmen
- `/companies?page=add` — Neues Unternehmen anlegen
- `/companies?page=partner_companies` — Unternehmen von Partnern
- `/dashboardRemindera/companiesReminders` — Reminder-Dashboard

### Funktionen
- Firmendatenbank mit vollständigen Kontaktdaten
- Unternehmen archivieren/reaktivieren
- Partner-Unternehmen separat verwalten
- Export der Unternehmensliste
- Mehrstufige Reminder-Verwaltung (4 Level)

### Tabellen-Felder — Hauptliste
| Naziv (Name) | Vrsta kontakta (Kontakttyp) | Grad (Stadt) | Telefon | E-mail | Nalozi (Aufträge) |
|---|---|---|---|---|---|

### Tabellen-Felder — Partner-Unternehmen
| Naziv | Veličina kompanije (Firmengröße) | Kontakt | Telefon | E-mail |
|---|---|---|---|---|

### Tabellen-Felder — Reminder-Dashboard
| Ime Kompanije | Level 1 | Level 2 | Level 3 | Level 4 |
|---|---|---|---|---|

### Formulare — Neue Firma
Felder: Name, Kontakttyp, Stadt, Telefon, E-Mail, Adresse, weitere Firmendaten

### Buttons / Aktionen
- `Export` — Firmenliste exportieren
- `Dodaj` — Neue Firma hinzufügen
- `ARHIVIRAJ` — Firma archivieren
- `Kompanije sa partnera` — Partnerunternehmen anzeigen
- `Aktivne` / `Arhivirane` — Ansicht wechseln

### Automatisierungspotential
Automatische Duplikatsprüfung bei Neuanlage, Sync mit externen Datenquellen, automatische Reminder-Erstellung nach Kontaktregeln, Export für CRM-Kampagnen.

---

## 6. Aufträge (Nalozi)

**URLs:**
- `/nalozi?page=list` — Aktive Aufträge
- `/nalozi?page=list_finish` — Abgeschlossene Aufträge
- `/nalozi?page=list_arhivirani_nalozi` — Archivierte Aufträge
- `/nalozi?page=predefinisani_dokumenti` — Vordefinierte Dokumente
- `/naloziNP.php?page=list` — Aufträge NP (Sonderansicht)
- `/odlasci.php` — Aufträge Abgänge

### Funktionen
- Vollständige Auftragsverwaltung mit Status-Tracking
- Projekt-Manager Zuweisung
- Dokumente pro Auftrag verwalten
- Archivierung mit Bestätigung (Ja/Nein-Dialog)
- Abgangsmanagement
- Vordefinierte Dokumentvorlagen

### Tabellen-Felder — Aktive Aufträge
| Broj (Nr.) | Naziv (Name) | Kompanija (Firma) | Projekt menadžer | Status | Vrsta (Art) |
|---|---|---|---|---|---|

### Tabellen-Felder — Abgeschlossene Aufträge
| Broj | Naziv | Kompanija | Status | Kreirano (Erstellt) |
|---|---|---|---|---|

### Tabellen-Felder — Abgänge
| Broj | Naziv | Kompanija | Traženo (Gesucht) |
|---|---|---|---|

### Tabellen-Felder — Vordefinierte Dokumente
| # | Naziv (Dokumentname) | Naziv (Typ) | Kreirao korisnik | Datum kreiranja |
|---|---|---|---|---|

### Buttons / Aktionen
- `Export` — Auftragsliste exportieren
- `DA` / `NE` — Archivierungsbestätigung
- `Traži` — Suchen/Filtern
- `Novi tip dokumenta` — Neuen Dokumenttyp anlegen
- `Dodaj` — Neues Dokument hinzufügen

### Automatisierungspotential
Automatische Auftragsanlage aus Templates, Status-Benachrichtigungen an PM, automatische Rechnungsauslösung bei Statuswechsel, Archivierungs-Workflows, Abgangs-Reporting.

---

## 7. Finanzen

**URLs:**
- `/finances?page=info` — Finanz-Übersicht / Dashboard
- `/finances?page=list` — Finanzen Kandidaten
- `/finances?page=list_nalozi` — Finanzen Aufträge
- `/finances?page=dipl_odabir_drzave` — DIPL Länderauswahl (Finanzen)

### Funktionen
- Finanzielle Übersicht nach Kandidaten und Aufträgen
- Suchfilter für Transaktionen
- CSV/Excel-Export
- DIPL-spezifische Finanzauswertung nach Ländern

### Buttons / Aktionen
- `Traži` — Finanzdaten suchen/filtern
- `Export` — Daten exportieren

### Automatisierungspotential
Automatische Rechnungserstellung, Zahlungserinnerungen, monatliche Finanzreports, Budget-Alerts bei Überschreitung, automatischer Export für Buchhaltungssoftware.

---

## 8. Aufgaben (Tasks)

**URLs:**
- `/tasks?page=list&sort=new` — Meine Aufgaben (neu zuerst)
- `/tasks?page=list_all&sort=new` — Alle Aufgaben

### Funktionen
- Persönliche Aufgabenliste
- Gesamtübersicht aller Aufgaben im System
- Aufgaben erstellen, bearbeiten, abschließen, löschen
- Aufgaben einer Person zuweisen
- Notizen/Kommentare zu Aufgaben

### Buttons / Aktionen
- `Završi` — Aufgabe abschließen
- `Poništi` — Aufgabe stornieren
- `OBRIŠI` — Aufgabe löschen
- `Snimi` — Aufgabe speichern

### Automatisierungspotential
Automatische Task-Erstellung bei CRM-Ereignissen (neuer Lead, Kandidaten-Status), Deadline-Benachrichtigungen, Eskalation bei Überfälligkeit, tägliche Task-Digest E-Mails.

---

## 9. Mitarbeiter (Employees)

**URLs:**
- `/employees?page=list` — Mitarbeiterliste
- `/employees?page=add` — Neuen Mitarbeiter anlegen
- `/employees?page=open&id=*` — Mitarbeiter-Detailansicht
- `/employees?page=edit_profile` — Eigenes Profil bearbeiten
- `/employees?page=list_arhiva` — Archivierte Mitarbeiter
- `/employees-reports?page=list` — Eigene Arbeitszeit-Reports
- `/employees-reports?page=list_all` — Alle Reports

### Funktionen
- Vollständige Mitarbeiterverwaltung
- Telefonnummern-Verwaltung pro Mitarbeiter
- Dokumenten-Upload und -verwaltung
- Profil-Selbstverwaltung
- Archivierung mit Reaktivierungsmöglichkeit
- Arbeitszeit-Reports und Stundenerfassung

### Tabellen-Felder — Mitarbeiterliste
| Ime i prezime (Name) | Tim (Team) | Poslovnica (Filiale) | Odjel (Abteilung) |
|---|---|---|---|

### Tabellen-Felder — Archivierte Mitarbeiter
| Ime i prezime | Telefon | E-mail | Status |
|---|---|---|---|

### Tabellen-Felder — Reports
| Datum | Ukupno sati (Gesamtstunden) | Broj stavki (Anzahl Einträge) |
|---|---|---|

### Tabellen-Felder — Reports-Übersicht (alle)
| Ime i prezime | Pozicija (Position) | E-mail | Zadnji izvještaj (Letzter Report) |
|---|---|---|---|

### Formulare
- Neuen Mitarbeiter hinzufügen: Name, Tim, Poslovnica, Odjel, E-Mail, Telefon, Passwort
- Profil bearbeiten: Persönliche Daten, Kontakt, Passwort

### Buttons / Aktionen
- `Dodaj` — Mitarbeiter/Telefonnummer hinzufügen
- `ARHIVIRAJ` — Mitarbeiter archivieren
- `OBRIŠI` — Daten löschen
- `Snimi` — Profil speichern
- `Ukloni` — Eintrag entfernen
- `ODBIJ` — Ablehnen
- `Kreiraj izvještaj` — Report erstellen

### Automatisierungspotential
Automatisches Onboarding-Workflow, Passwort-Reset, Leistungsreports per Schedule, Zugriffsmanagement nach Rolle, Abwesenheitsverwaltung.

---

## 10. Kampagnen

**URL:** `/kampanje?page=list`

### Funktionen
- Marketing-Kampagnen erstellen und verwalten
- Kampagnen-Statistiken (Aufrufe, Anmeldungen)
- Archivierung von Kampagnen
- Kampagnen-Performance-Analyse

### Tabellen-Felder
| Naziv (Name) | Poruka kampanje (Kampagnennachricht) | Pregleda (Aufrufe) | Prijava (Anmeldungen) |
|---|---|---|---|

### Buttons / Aktionen
- `Dodaj` — Neue Kampagne erstellen
- `Statistika` — Kampagnen-Statistiken anzeigen
- `ARHIVIRAJ` — Kampagne archivieren

### Automatisierungspotential
Kampagnen-Scheduling, automatische A/B-Tests, Segmentierung nach Kandidatenprofilen, automatische Performance-Reports, Trigger-basiertes Nachfassen.

---

## 11. DIPL — Diplomanden / Nostrifikation

**URLs:**
- `/dipl?page=listaObrada` — Verarbeitungsliste
- `/dipl?page=add_new_kandidat&type=1` — Neuen Kandidaten hinzufügen
- `/dipl?page=pregledDIPL&type=1` — DIPL-Übersicht
- `/dipl?page=lista_kandidata&type=12` — Kandidatenliste Typ 12
- `/dipl?page=lista_kandidata&type=10` — Kandidatenliste Typ 10 (Kalenderansicht)
- `/dipl?page=inkaso_pocetna` — Inkasso-Startseite
- `/dipl_agenti?page=list` — DIPL-Agentenliste
- `/nostrifikacija_diploma?page=ustanove` — Nostrifikations-Institutionen

### Funktionen
- Verwaltung von Diplomanerkennungsverfahren (Nostrifikation)
- Kandidaten-Bearbeitungsliste mit Zeitfilter (vergangen/heute/zukünftig)
- Mehrere Kandidatentypen/-kategorien
- Agenten-Verwaltung mit Länder- und Kategorie-Zuweisungen und täglichen Limits
- Inkasso-Verwaltung
- Institutionsverwaltung für Nostrifikationsstellen
- Statistiken pro Agent

### Tabellen-Felder — Verarbeitungsliste
| #ID | Ime i Prezime (Name) | Država (Land) | Kontakt | Status |
|---|---|---|---|---|

### Tabellen-Felder — Nostrifikations-Institutionen
| #ID | Naziv (Name) | Država (Land) | Period nostrifikacije (Dauer) | Dodao zaposlenik (Hinzugefügt von) |
|---|---|---|---|---|

### Tabellen-Felder — DIPL-Agenten
| Ime i prezime | Tim (Team) | Države (Länder) | Kategorije (Kategorien) | Dnevni (Tägl. Limit) |
|---|---|---|---|---|

### Buttons / Aktionen
- `Potpuna prijava` / `Facebook/Instagram` / `Inbound Leads` — Kandidatenquelle
- `Export` — Daten exportieren
- `Traži` — Suchen
- `Nova ustanova` — Neue Institution anlegen
- `Statistike` — Statistiken anzeigen
- `SPREMI` — Agenten-Einstellungen speichern
- `Arhivirani agenti` — Archivierte Agenten anzeigen
- `15 Prošli` / `0 Danas` / `0 Budući` — Zeitfilter

### Automatisierungspotential
Automatische Statusupdates bei Fristablauf, Benachrichtigungen über Nostrifikationsfortschritt, automatische Agentenzuweisung nach Land/Kategorie, Inkasso-Mahnwesen, Statistik-Reports.

---

## 12. DAK

**URLs:**
- `/dak?page=list&type=0` bis `type=8` — DAK-Listen nach Typ (9 Kategorien)
- `/dak?page=stats` — DAK-Statistiken

### Funktionen
- 9 verschiedene DAK-Kategorien/Statustypen (Neu bis Stufe 8)
- Vollständige CRUD-Operationen pro Eintrag
- Export-Funktion für alle Kategorien
- Bestätigung / Stornierung / Archivierung
- Statistische Auswertungen

### Tabellen-Felder (alle Typen gleich)
| #ID | Naziv (Name) | Broj (Nummer) | Email | Status |
|---|---|---|---|---|

### Buttons / Aktionen
- `Export` — Daten exportieren
- `POTVRDI` — Eintrag bestätigen
- `STORNIRAJ` — Eintrag stornieren
- `ARHIVIRAJ` — Eintrag archivieren

### Automatisierungspotential
Automatische Datenpflege und Validierung, Status-Eskalation nach Zeitregeln, Export-Scheduling, automatische Bestätigungen nach definierten Kriterien.

---

## 13. Partner

**URLs:**
- `/partners/list` — Partnerliste
- `/partners/listdvag` — DVAG-Partner
- `/partners/finance` — Partner-Finanzen / Provisionsabrechnung
- `/partners/eligible_leads_to_assign` — Zuzuweisende Leads

### Funktionen
- Verwaltung aller Partnerbeziehungen
- DVAG-spezifische Partnerverwaltung
- Provisionsabrechnung und -auszahlung
- Lead-Zuweisung an Partner
- Offene Provisionen anzeigen und auszahlen

### Tabellen-Felder — Partnerliste
| ID | Ime i prezime (Name) | Telefon | Država (Land) |
|---|---|---|---|

### Tabellen-Felder — DVAG-Partner
| ID | Ime i prezime | Telefon | E-mail | Registracija (Registrierung) |
|---|---|---|---|---|

### Tabellen-Felder — Partner-Finanzen (Aktive)
| ID | PARTNER | KANDIDAT | NALOG (Auftrag) | DATUM POCETKA RADA (Startdatum) |
|---|---|---|---|---|

### Tabellen-Felder — Partner-Finanzen (Offene Provisionen)
| #ID | PARTNER | UKUPNO NEISPLACENIH PREPORUKA | PROVIZIJA (Provision) | Isplati sve! |
|---|---|---|---|---|

### Tabellen-Felder — Eligible Leads
| #ID | Ime i prezime | Nalog (Auftrag) | Status prijave | Dogovoreni početak rada (Starttermin) |
|---|---|---|---|---|

### Buttons / Aktionen
- `Dodjeli sve označene kandidate` — Alle markierten Kandidaten zuweisen
- `POTVRDI` — Provisionsauszahlung bestätigen
- `NE` — Ablehnen
- `Povratak` — Zurück

### Automatisierungspotential
Automatische Provisionsberechnung bei Kandidatenstart, monatliche Abrechnungsreports, automatische Lead-Zuweisung nach Partnerkapazität, Benachrichtigungen bei neuen Provisionen.

---

## 14. DVAG Kandidaten & Aufträge

**URLs:**
- `/dvag_kandidati?page=list` — Kandidaten DVAG-Makler
- `/dvag_nalozi?page=list` — DVAG-Aufträge
- `/dvag_notifications?page=form` — DVAG-Benachrichtigungen (mehrsprachig)
- `/statistics-dvag/page.php` — DVAG-Statistiken

### Funktionen
- Verwaltung von Kandidaten aus dem DVAG-Makler-Netzwerk
- DVAG-spezifische Auftragsverwaltung
- Push-Benachrichtigungen an DVAG-Nutzer (Deutsch/Englisch)
- Detaillierte Makler-Statistiken mit Export

### Tabellen-Felder — Kandidaten DVAG
| ID | Ime i prezime kandidata | Datum prijave (Anmeldedatum) | Status prijave |
|---|---|---|---|

### Tabellen-Felder — DVAG-Aufträge
| ID | Naziv naloga (Auftragsname) | Makler | Kompanija | Kreirano |
|---|---|---|---|---|

### Tabellen-Felder — DVAG Notifications
| ID | Uposlenik (Mitarbeiter) | Naslov na njemačkom (Titel DE) | Sadržaj na njemačkom | Naslov na engleskom (Titel EN) |
|---|---|---|---|---|

### Tabellen-Felder — Statistiken Aktive Makler
| Ime i prezime | Direktiva | Makler ID | Broj kreiranih kompanija | Broj odbijenih (Abgelehnte) |
|---|---|---|---|---|

### Tabellen-Felder — Statistiken Registrierungen
| Ime i prezime | Direktiva | Makler ID | Datum Registracije | Prvi login (Erster Login) |
|---|---|---|---|---|

### Buttons / Aktionen
- `Pošalji` — Benachrichtigung senden
- `Export BiH` / `Export DE` — Statistiken nach Region exportieren

### Automatisierungspotential
Automatischer Kandidaten-Sync mit DVAG-System, Status-Update-Benachrichtigungen, automatische Reports für Makler, Onboarding-Benachrichtigungen.

---

## 15. Positionen / Stellen

**URL:** `/positions?page=list`

### Funktionen
- Verwaltung von Kandidaten-Positionen/Stellenbezeichnungen
- Neue Positionen anlegen

### Tabellen-Felder
| Pozicija (Position) | — |
|---|---|

### Buttons / Aktionen
- `Dodaj` — Neue Position hinzufügen

### Automatisierungspotential
Automatischer Export auf Jobbörsen, Matching-Algorithmus Kandidaten/Positionen, automatische Benachrichtigung bei passenden Kandidaten.

---

## 16. Teams (Timovi)

**URL:** `/timovi?page=list`

### Funktionen
- Teams anlegen und verwalten
- Team-Bezeichnung und Registrierungsdatum
- Team-Übersicht für die Organisation

### Tabellen-Felder
| # | Naziv tima (Teamname) | Oznaka tima (Teamkürzel) | Datum registracije |
|---|---|---|---|

### Formulare
- Team registrieren: Name, Bezeichnung/Kürzel

### Buttons / Aktionen
- `Dodaj Tim` — Neues Team anlegen

### Automatisierungspotential
Automatische Team-Zuweisung für neue Mitarbeiter, Team-Leistungsauswertung, Benachrichtigungen an Team-Leads.

---

## 17. Protokoll / Logs

**URLs:**
- `/logs?page=list` — Eigene Logs (letzte 2 Wochen)
- `/logs?page=list_all` — Alle Logs aller Mitarbeiter

### Funktionen
- Vollständiges Aktivitätsprotokoll
- Zeitlich gefilterte Ansicht
- Mitarbeiterübergreifende Gesamtansicht

### Tabellen-Felder — Eigene Logs
| Datum i vrijeme (Datum & Zeit) | Log opis (Log-Beschreibung) |
|---|---|

### Tabellen-Felder — Alle Logs
| Datum i vrijeme | Log opis | Zaposlenik (Mitarbeiter) |
|---|---|---|

### Automatisierungspotential
Automatische Anomalie-Erkennung (ungewöhnliche Aktivitäten), Compliance-Reports, Audit-Trails, Alert bei sicherheitsrelevanten Ereignissen.

---

## 18. Tickets (Tiketi)

**URL:** `/tiketi?page=list`

### Funktionen
- Internes Ticketsystem für Support-Anfragen
- Tickets einreichen, annehmen, kommentieren
- Priorisierung von Tickets
- Eingehende und ausgehende Tickets getrennt

### Tabellen-Felder (Eingang & Ausgang)
| Broj (Nr.) | Predmet (Betreff) | Hitnost (Dringlichkeit) | Pošiljaoc odjel (Absender-Abteilung) |
|---|---|---|---|

### Buttons / Aktionen
- `Dodaj` — Neues Ticket erstellen
- `Prihvati` — Ticket annehmen
- `Dodaj komentar` — Kommentar hinzufügen

### Automatisierungspotential
Automatisches Ticket-Routing nach Abteilung/Priorität, SLA-Überwachung mit Eskalation, automatische Benachrichtigungen bei Status-Änderungen, Ticket-Reporting.

---

## 19. Statistiken

**URL:** `/modul_statistike?page=open`

### Funktionen
- DIPL-Statistiken (Agenten, Status, Kommunikationen)
- Inkasso-Statistiken
- Mehrere Ansichten/Filter

### Buttons / Aktionen
- `Agenti` — Agenten-Statistiken anzeigen
- `Statusi` — Status-Statistiken anzeigen
- `Komunikacije` — Kommunikations-Statistiken

### Automatisierungspotential
Automatische KPI-Report-Generierung per E-Mail, tägliche/wöchentliche/monatliche Statistik-Snapshots, Dashboard-Exports, Performance-Benchmarking.

---

## 20. Task Force (TF)

**URLs:**
- `/tf_naslovnica` — Task Force Startseite / Arbeitsmaske
- `/tf_nalog_list` — TF-Auftragsliste (Aktivierung/Deaktivierung)
- `/tf_nalog_list?page=obrada_postavke` — TF-Verarbeitungseinstellungen
- `/tf_agent_stats` — TF-Agenten-Statistiken

### Funktionen
- Spezialisiertes Bearbeitungssystem für Kandidaten durch Agenten
- Echtzeit-Bearbeitung mit Agentenwechsel
- Aufträge für TF aktivieren/deaktivieren und priorisieren
- Task-Typen: Posredovanje (Vermittlung), Obrada (Verarbeitung), Casting
- TF-Agentenstatistiken mit Export
- Task-Listen-Verwaltung mit Prioritäten

### Tabellen-Felder — Hauptliste
| Ime i prezime (Name) | Nalog (Auftrag) | Vrsta taska (Aufgabentyp) | Task Force Status |
|---|---|---|---|

### Tabellen-Felder — Auftragsliste
| Broj (Nr.) | Naziv (Name) | Status | TF prioritet (Priorität) | Agenti (Agenten) |
|---|---|---|---|---|

### Tabellen-Felder — Verarbeitungs-Tasks
| ID | Naziv | Status | Akcija (Aktion) |
|---|---|---|---|

### Buttons / Aktionen
- `TRAŽI DALJE` — Nächsten Kandidaten suchen
- `Posredovanje` / `Obrada` / `Casting` — Aufgabentyp wählen
- `Spremi` — Agent-Zuweisung speichern
- `Promijeni agenta` — Agent wechseln
- `Ukloni iz TF-a` / `Dodaj u TF` — TF-Zugehörigkeit verwalten
- `Dodaj nove taskove` — Neue Tasks hinzufügen
- `Traži` / `Export` / `Stara statistika` — Statistiken

### Automatisierungspotential
Automatische Kandidaten-Zuweisung nach Agentenverfügbarkeit, Echtzeit-Monitoring, automatische Eskalation bei langen Wartezeiten, TF-Performance-Reports.

---

## 21. Casting / Termine

**URLs:**
- `/casting_appointments?page=openAll` — Alle laufenden Casting-Termine
- `/casting_stats` — Casting-Statistiken

### Funktionen
- Übersicht aller laufenden Casting-Termine mit Fotos
- Statistiken nach Agenten und Links
- Filterung nach abgeschlossenen / laufenden Castings

### Tabellen-Felder — Termine
| Agent | Kandidat | Telefon | Slika (Foto) |
|---|---|---|---|

### Buttons / Aktionen
- `Agendata - Završeni` — Abgeschlossene Agenten-Castings
- `Linkova - Završeni` — Abgeschlossene Link-Castings
- `Agenata - Tekući` — Laufende Agenten-Castings
- `Linkova - Tekući` — Laufende Link-Castings

### Automatisierungspotential
Automatische Terminplanung und -erinnerungen, Kalender-Sync (Google/Outlook), automatische Nachfass-Aktionen nach Casting, Casting-Performance-Reports.

---

## 22. Dashboard Aufträge

**URL:** `/dashboardNaloga/companies.php`

### Funktionen
- Gesamtübersicht Dashboard für Aufträge und Kandidaten
- Mehrere Ansichten nach Prozessschritt
- Unternehmens-basierte Übersicht

### Buttons / Aktionen
- `Recruiting` — Recruiting-Ansicht
- `DIPL` — DIPL-Ansicht
- `Jezik` — Sprach-Ansicht
- `Viziranje` — Visierungs-Ansicht
- `Projekcija odlaska` — Abgangsprojektion

### Automatisierungspotential
Echtzeit-Dashboard-Monitoring, automatische Alerts bei Abweichungen, tägliche Snapshot-Reports.

---

## 23. Abgänge (Odlasci)

**URL:** `/odlasci.php`

### Funktionen
- Aufträge mit geplanten Kandidaten-Abgängen verwalten
- Suche und Filterung nach Abgängen

### Tabellen-Felder
| Broj (Nr.) | Naziv (Name) | Kompanija | Traženo (Gesucht) |
|---|---|---|---|

### Buttons / Aktionen
- `Traži` — Abgänge suchen/filtern

### Automatisierungspotential
Automatische HR-Benachrichtigungen vor Abgang, Offboarding-Checklisten, Abgangs-Reporting an Management.

---

## 24. Finanzprojektion

**URLs:**
- `/financesProjection.php?page=list` — Projektionsliste
- `/projekcijaForm.php` — Projektionsformular

### Funktionen
- Finanzielle Projektion für Aufträge
- Abgangsprojektion mit Finanzauswirkung
- Export und Dashboard-Integration

### Buttons / Aktionen
- `Export` — Projektionsdaten exportieren
- `Idi na dashboard DIPL` — Zum DIPL-Dashboard

### Automatisierungspotential
Automatische Prognose-Berechnung aus historischen Daten, Budget-Alerts, automatische Reports für Finanzplanung.

---

## 25. Bewerbungsübersicht

**URL:** `/pregledPrijava.php?page=main_list`

### Funktionen
- Übersicht aller Bewerbungen im System
- Suchfilter

### Buttons / Aktionen
- `Traži` — Bewerbungen suchen

### Automatisierungspotential
Automatisches Bewerbungs-Screening, regelbasierte Vorauswahl, Status-Updates und Benachrichtigungen, Bewerbungs-Reporting.

---

## 26. Mitarbeiter-Reports

**URLs:**
- `/employees-reports?page=list` — Eigene Arbeitszeit-Reports
- `/employees-reports?page=list_all` — Alle Reports (Übersicht)

### Funktionen
- Arbeitszeit-Erfassung und Reporting
- Stundenübersicht pro Tag
- Gesamtübersicht aller Mitarbeiter mit letztem Report-Datum

### Tabellen-Felder — Eigene Reports
| Datum | Ukupno sati (Gesamtstunden) | Broj stavki (Anzahl Einträge) |
|---|---|---|

### Tabellen-Felder — Alle Reports
| Ime i prezime | Pozicija | E-mail | Zadnji izvještaj (Letzter Report) |
|---|---|---|---|

### Buttons / Aktionen
- `Kreiraj izvještaj` — Neuen Report erstellen
- `ARHIVIRAJ` — Report archivieren

### Automatisierungspotential
Automatische Report-Erinnerungen, Stundenauswertung für Buchhaltung, automatischer Export für Lohnabrechnung.

---

## 27. Provisionen (Provizije)

**URLs:**
- `/provizije?page=postavke` — Provisions-Einstellungen
- `/provizije?page=lista` — Provisions-Übersicht

### Funktionen
- Provisions-Konfiguration nach Abteilung und Mitarbeiter
- Faktoren für BiH und andere Regionen
- Provisions-Auszahlung verwalten
- Auswertung offener und bezahlter Provisionen

### Tabellen-Felder — Einstellungen
| Odjel (Abteilung) | Zaposlenik (Mitarbeiter) | Faktor BiH | Iznos BiH (Betrag) |
|---|---|---|---|

### Tabellen-Felder — Provisions-Liste
| Ime i prezime | Odjel | Moguća uplata (Mögl. Zahlung) | Za isplatu (Auszuzahlen) | Isplaćeno (Ausgezahlt) |
|---|---|---|---|---|

### Buttons / Aktionen
- `SPREMI` — Provisions-Einstellungen speichern
- `Traži` — Provisionen suchen
- `Export` — Daten exportieren

### Hinweis
Währungen: **KM** (Konvertible Mark, Bosnien-Herzegowina) und **RSD** (Serbischer Dinar)

### Automatisierungspotential
Automatische Provisionsberechnung nach festen Regeln, monatliche Abrechnungen, Auszahlungs-Workflows mit Bestätigung.

---

## 28. Link-Generator

**URL:** `/link_generator?page=list`

### Funktionen
- Tracking-Links erstellen für Kampagnen und Recruiting
- Aufruf- und Anmeldungsstatistiken pro Link
- Link-Archivierung

### Tabellen-Felder
| Url | Opis (Beschreibung) | Pregleda (Aufrufe) | Prijava (Anmeldungen) |
|---|---|---|---|

### Buttons / Aktionen
- `Dodaj` — Neuen Link erstellen
- `ARHIVIRAJ` — Link archivieren

### Automatisierungspotential
Automatische UTM-Parameter-Generierung, Performance-Reporting, Link-Ablaufdaten, Kampagnen-Tracking.

---

## 29. Kandidatengruppen

**URL:** `/grupe_kandidata?page=list`

### Funktionen
- Kandidaten in benannte Gruppen zusammenfassen
- Gruppen archivieren

### Tabellen-Felder
| Naziv grupe (Gruppenname) | Datum |
|---|---|

### Buttons / Aktionen
- `Dodaj` — Neue Gruppe erstellen
- `ARHIVIRAJ` — Gruppe archivieren

### Automatisierungspotential
Automatische Gruppenzuweisung nach definierten Kriterien (Land, Status, Kampagne), Massenaktionen auf Gruppenebene.

---

## 30. Schulen (Skole)

**URL:** `/skole?page=pregled`

### Funktionen
- Schulen und Bildungseinrichtungen verwalten
- Deutscher und lokaler Schulname
- Bildungstyp-Kategorisierung (relevant für Nostrifikation)

### Tabellen-Felder
| #ID | Naziv škole (Schulname) | Njemački naziv škole (Dt. Name) | Tip obrazovanja (Bildungstyp) |
|---|---|---|---|

### Buttons / Aktionen
- `Dodaj školu` — Neue Schule hinzufügen
- `Otvori` — Schule öffnen/bearbeiten

### Automatisierungspotential
Automatische Nostrifikations-Verknüpfung, Datenbank-Sync mit Bildungsministerien.

---

## 31. Nachrichtenanbieter (Message Providers)

**URL:** `/message_providers?page=list_all`

### Funktionen
- SMS/Messaging-Provider konfigurieren
- Provider nach Gruppen organisieren
- Provider für alle Gruppen gleichzeitig wechseln
- Aktiver Provider pro Gruppe

### Tabellen-Felder
| ID | Grupa (Gruppe) | Provider | Akcija (Aktion) |
|---|---|---|---|

### Buttons / Aktionen
- `Promjeni za sve grupe` — Provider für alle Gruppen wechseln
- `Uredi` — Provider bearbeiten
- `Spremi` — Änderungen speichern

### Automatisierungspotential
Automatisches Failover bei Provider-Ausfall, Load-Balancing zwischen Providern, Kosten-Monitoring.

---

## 32. Tutorial

**URL:** `/tutorial?page=list`

### Funktionen
- Video/Text-Tutorials nach Modulen
- Tutorials hinzufügen, löschen, anzeigen
- Modul-basierte Organisation

### Buttons / Aktionen
- `Otvori tutorial` — Tutorial anzeigen
- `Dodaj tutorijal` — Neues Tutorial hinzufügen
- `Izbriši` — Tutorial löschen

### Automatisierungspotential
Automatisches Onboarding für neue Mitarbeiter, Fortschritts-Tracking.

---

## 33. Partner FAQ Bot

**URL:** `/partner_faq_bot`

### Funktionen
- FAQ-Verwaltung für den Partner-Chatbot
- Kategorien-basierte Struktur
- Sichtbarkeit pro FAQ konfigurieren

### Buttons / Aktionen
- `Dodaj novu kategoriju` — Neue FAQ-Kategorie anlegen
- `Spremi promjene` — Änderungen speichern
- `Pregled vidljivosti` — Sichtbarkeit verwalten

### Automatisierungspotential
Automatische FAQ-Aktualisierung aus Support-Tickets, Chatbot-Training aus häufigen Anfragen.

---

## 34. Weitere entdeckte Module

### Kandidaten-Registrierung
**URL:** `/registracija/korak1`
- Mehrsprachige Registrierung (Deutsch/Bosnisch)
- Schritt-für-Schritt-Prozess (Korak 1 = Schritt 1)

### Marketing Export
**URL:** `/marketingCandidateExport/marketingCandidateFilter`
- Kandidaten nach Marketingkriterien filtern und exportieren
- Für externe Marketing-Systeme und Kampagnen

### Kandidaten-Transfer zu Task Force
**URL:** `/candidateTransferToTF/candidateTransferFIlter`
- Massentransfer von Kandidaten zur Task Force
- Filter vor dem Transfer

### Nostrifikation (Institutionen)
**URL:** `/nostrifikacija_diploma?page=ustanove`
- Verwaltung von Anerkennungsbehörden für Diplome

### DIPL-Agenten-Verwaltung
**URL:** `/dipl_agenti?page=list`
- Agenten mit Länder- und Kategorie-Limits konfigurieren
- Tägliche Bearbeitungslimits pro Agent

### Reminder-Dashboard (Unternehmen)
**URL:** `/dashboardRemindera/companiesReminders`
- Mehrstufige Reminder-Verfolgung für Unternehmen (4 Level)
- Übersicht offener Kontaktaufgaben

---

## 35. Zusammenfassung & Automatisierungspotential

### Modulübersicht

| Modul | URL-Muster | Kernfunktion | Export | Formulare |
|-------|-----------|--------------|--------|-----------|
| Dashboard | `/` | Übersicht, Filialen-KPIs | Nein | Nein |
| Nachrichten | `/messages` | Internes Messaging | Nein | Ja |
| Kandidaten | `/kandidati` | Kandidatenverwaltung | Ja | Ja |
| Sales | `/sales` | Vertriebspipeline (2-stufig) | Nein | Ja |
| Companies | `/companies` | Firmendatenbank | Ja | Ja |
| Aufträge | `/nalozi` | Auftragsverwaltung | Ja | Nein |
| Finanzen | `/finances` | Finanzverwaltung | Ja | Ja |
| Tasks | `/tasks` | Aufgabenverwaltung | Nein | Ja |
| Mitarbeiter | `/employees` | HR-Verwaltung | Nein | Ja |
| Kampagnen | `/kampanje` | Marketing | Nein | Ja |
| DIPL | `/dipl`, `/dipl_agenti` | Nostrifikation | Ja | Ja |
| DAK | `/dak` | Datenpflege (9 Typen) | Ja | Ja |
| Partner | `/partners` | Partnerverwaltung + Provision | Nein | Nein |
| DVAG | `/dvag_*` | DVAG-Integration | Ja | Ja |
| Positionen | `/positions` | Stellenverwaltung | Nein | Ja |
| Teams | `/timovi` | Team-Management | Nein | Ja |
| Logs | `/logs` | Audit-Trail | Nein | Nein |
| Tickets | `/tiketi` | Interner Support | Nein | Ja |
| Statistiken | `/modul_statistike` | Reporting | Nein | Nein |
| Task Force | `/tf_*` | Agenten-Bearbeitung | Ja | Nein |
| Casting | `/casting_*` | Terminverwaltung | Nein | Nein |
| Dashboard Aufträge | `/dashboardNaloga` | Auftrags-Übersicht | Nein | Nein |
| Abgänge | `/odlasci.php` | Abgangsmanagement | Nein | Nein |
| Finanzprojektion | `/financesProjection.php` | Finanzplanung | Ja | Nein |
| Bewerbungen | `/pregledPrijava.php` | Bewerbungsübersicht | Nein | Nein |
| MA-Reports | `/employees-reports` | Zeiterfassung | Nein | Ja |
| Provisionen | `/provizije` | Provisionsmanagement | Ja | Ja |
| Link-Generator | `/link_generator` | Tracking | Nein | Ja |
| Kandidatengruppen | `/grupe_kandidata` | Gruppierung | Nein | Ja |
| Schulen | `/skole` | Bildungsverwaltung | Nein | Ja |
| Message Providers | `/message_providers` | Provider-Konfiguration | Nein | Ja |
| Tutorial | `/tutorial` | Onboarding | Nein | Nein |
| FAQ Bot | `/partner_faq_bot` | Support-Bot | Nein | Ja |

### Top Automatisierungspotentiale (priorisiert)

| Priorität | Modul | Automatisierung | Aufwand |
|-----------|-------|-----------------|---------|
| Hoch | Sales | Follow-up Reminder, automatische Status-Updates, Lead-Scoring | Mittel |
| Hoch | Kandidaten | Import aus Jobbörsen, automatische Agenten-Zuweisung | Hoch |
| Hoch | Nachrichten | Template-Massenversand, Event-getriggerte Nachrichten | Gering |
| Hoch | Tasks | Automatische Task-Erstellung bei CRM-Ereignissen | Gering |
| Hoch | DIPL | Statusupdates bei Fristen, Agentenzuweisung nach Land | Mittel |
| Mittel | Finanzen | Rechnungserstellung, Zahlungserinnerungen, Buchhaltungs-Export | Mittel |
| Mittel | Provisionen | Automatische Berechnung und Monats-Abrechnungen | Mittel |
| Mittel | Partner | Lead-Zuweisung nach Kapazität, Provisionsbenachrichtigungen | Mittel |
| Mittel | Casting | Terminplanung, Erinnerungen, Kalender-Sync | Hoch |
| Mittel | Reports | Automatischer Export für Lohnabrechnung, Scheduling | Gering |
| Mittel | DAK | Status-Eskalation nach Zeitregeln, automatische Bestätigungen | Mittel |
| Niedrig | Logs | Anomalie-Erkennung, Compliance-Reports, Security-Alerting | Hoch |
| Niedrig | Tickets | SLA-Überwachung, automatisches Routing | Mittel |
| Niedrig | Kampagnen | A/B-Tests, automatische Segmentierung | Hoch |

### Datenstruktur-Übersicht

Das System speichert und verarbeitet folgende Kerndaten:

**Personen:**
- Kandidaten: Name, Land, Kontakt, Status, Quelle (Facebook/Inbound/Vollbewerbung), DIPL-Kategorie
- Mitarbeiter: Name, Team, Filiale, Abteilung, Telefon, E-Mail, Passwort, Arbeitszeiten

**Firmen & Aufträge:**
- Unternehmen: Name, Kontakttyp, Stadt, Telefon, E-Mail, Größe, verknüpfte Aufträge
- Aufträge: Nummer, Name, Firma, Projekt-Manager, Status, Typ, Dokumente, Abgangsdaten

**Finanzen:**
- Transaktionen nach Kandidat und Auftrag
- Projektionen und Abgangsfinanzplanung
- Provisionen in KM (Bosnien) und RSD (Serbien)

**Aktivitäten:**
- Logs: Zeitstempel, Beschreibung, Mitarbeiter
- Tasks: Typ, Status, Zuweisung, Deadline
- Tickets: Betreff, Dringlichkeit, Abteilung, Kommentare

**Kommunikation:**
- Nachrichten: Von/An, Betreff, Zeitstempel
- Kampagnen: Name, Nachricht, Aufrufe, Anmeldungen
- DVAG-Notifications: Titel/Inhalt auf Deutsch und Englisch

**Spezialmodule:**
- DIPL/DAK: Nostrifikationsverfahren, Institutionen, Agenten mit täglichen Limits
- DVAG: Makler-IDs, Direktiven, Kandidaten-Synchronisation
- Task Force: Aufgabentypen (Vermittlung/Verarbeitung/Casting), Prioritäten
- Links: URL, Beschreibung, Aufrufe, Anmeldungen (Tracking)
