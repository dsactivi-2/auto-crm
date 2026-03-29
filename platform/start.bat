@echo off
title CRM Platform - Startup
echo.
echo ============================================
echo   CRM Automation Platform - Setup & Start
echo ============================================
echo.

:: Pruefen ob Docker laeuft
docker info >nul 2>&1
if errorlevel 1 (
    echo [FEHLER] Docker ist nicht gestartet!
    echo Bitte starte Docker Desktop und versuche es erneut.
    echo.
    pause
    exit /b 1
)

echo [OK] Docker laeuft.
echo.

:: Pruefen ob .env existiert
if not exist ".env" (
    echo [INFO] Keine .env Datei gefunden. Erstelle aus Vorlage...
    copy .env.example .env >nul
    echo.
    echo ============================================
    echo   WICHTIG: .env Datei konfigurieren!
    echo ============================================
    echo.
    echo Oeffne die Datei ".env" und trage deine Keys ein:
    echo.
    echo   1. NEXT_PUBLIC_SUPABASE_URL
    echo   2. NEXT_PUBLIC_SUPABASE_ANON_KEY
    echo   3. SUPABASE_SERVICE_ROLE_KEY
    echo   4. ANTHROPIC_API_KEY
    echo   5. CREDENTIALS_ENCRYPTION_KEY
    echo.
    echo Fuer den Encryption Key fuehre aus:
    echo   openssl rand -hex 32
    echo.
    echo Danach starte dieses Script erneut.
    echo.
    start notepad .env
    pause
    exit /b 0
)

echo [OK] .env Datei gefunden.
echo.

:: Container bauen und starten
echo [START] Baue und starte Container...
echo.
docker compose up --build -d

if errorlevel 1 (
    echo.
    echo [FEHLER] Container-Start fehlgeschlagen!
    echo Pruefe die Logs mit: docker compose logs
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Platform erfolgreich gestartet!
echo ============================================
echo.
echo   App:        http://localhost:3000
echo   Playwright: http://localhost:3001/health
echo.
echo   Logs:       docker compose logs -f
echo   Stoppen:    docker compose down
echo.
echo ============================================
echo.

:: Browser oeffnen
timeout /t 5 /nobreak >nul
start http://localhost:3000

pause
