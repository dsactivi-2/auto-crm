@echo off
cd /d C:\Users\ds\crm-automation

:menu
cls
echo ============================================
echo   CRM DEMO - job-step.com
echo ============================================
echo.
echo   1  Kandidaten Demo
echo   2  Sales Demo
echo   3  Finanzen Demo
echo   4  Auftraege Demo
echo   5  Tasks Demo
echo   6  Companies Demo
echo   7  Dashboard Demo
echo   8  ALLE Module (komplett)
echo   9  Eigene Eingabe
echo   0  Beenden
echo.
set /p wahl="Auswahl: "

if "%wahl%"=="1" goto kandidaten
if "%wahl%"=="2" goto sales
if "%wahl%"=="3" goto finanzen
if "%wahl%"=="4" goto auftraege
if "%wahl%"=="5" goto tasks
if "%wahl%"=="6" goto companies
if "%wahl%"=="7" goto dashboard
if "%wahl%"=="8" goto komplett
if "%wahl%"=="9" goto eigene
if "%wahl%"=="0" goto ende
goto menu

:kandidaten
python src/live_demo.py --demo kandidaten --auto 2
goto menu

:sales
python src/live_demo.py --demo sales --auto 2
goto menu

:finanzen
python src/live_demo.py --demo finanzen --auto 2
goto menu

:auftraege
python src/live_demo.py --demo auftraege --auto 2
goto menu

:tasks
python src/live_demo.py --demo tasks --auto 2
goto menu

:companies
python src/live_demo.py --demo companies --auto 2
goto menu

:dashboard
python src/live_demo.py --demo dashboard --auto 2
goto menu

:komplett
python src/live_demo.py --komplett --auto 2
goto menu

:eigene
set /p args="Argumente (z.B. --demo tiketi --auto 3): "
python src/live_demo.py %args%
goto menu

:ende
exit
