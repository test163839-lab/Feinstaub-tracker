import uvicorn
import os
import sys
from pathlib import Path

# Add project root to sys.path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

if __name__ == "__main__":
    print("=" * 70)
    print("🌍 FEINSTAUB- & UMWELTMONITORING SYSTEM GESTARTET")
    print("=" * 70)
    print("  🖥️  Web-Dashboard:    http://localhost:8000")
    print("  📑  Interaktive API:  http://localhost:8000/docs")
    print("  📡  WebSocket Feed:   ws://localhost:8000/ws")
    print("  📱  Mobile App Ziel:  http://<DEINE-IP>:8000/api/messung")
    print("=" * 70)
    print("Drücke STRG + C zum Beenden.\n")
    
    uvicorn.run(
        "backend.app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="info"
    )
