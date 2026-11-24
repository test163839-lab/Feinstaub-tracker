#!/usr/bin/env bash
set -e

echo "========================================================"
echo "  AeroTrack IoT - Feinstaub Monitoring Web-App"
echo "========================================================"
echo ""

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "[1/2] Prüfe Python-Umgebung..."
if ! command -v python3 &> /dev/null; then
    echo "FEHLER: python3 wurde nicht gefunden. Bitte installiere Python 3."
    exit 1
fi

echo "[2/2] Starte Server auf Port 8000..."
python3 run_server.py
