@echo off
chcp 65001 > nul
echo ========================================================
echo   AeroTrack IoT - Feinstaub Monitoring Web-App
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/2] Prüfe Python-Installation...
python --version > nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo FEHLER: Python wurde nicht gefunden! Bitte installiere Python 3.10 oder neuer.
    pause
    exit /b 1
)

echo [2/2] Starte Webserver und Dashboard...
echo.
python run_server.py

pause
