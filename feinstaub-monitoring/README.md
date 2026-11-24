# 🌍 AeroTrack IoT – Feinstaub- & Umwelt-Monitoring Web-App

Eine moderne, performante und optisch ansprechende Web-Anwendung zur Echtzeit-Visualisierung und Auswertung von Feinstaub- und Wetterdaten mobiler Messroboter.

Entwickelt für den Betrieb im lokalen Netzwerk sowie für das produktive Server-Hosting mit REST-API und WebSocket-Live-Streaming für externe Smartphone-Apps.

---

## 🌟 Kernfunktionen im Überblick

### 1. Interaktive Karte (Hauptfunktion)
- **Leaflet & OpenStreetMap:** Performante Vektor- & Kacheldarstellung ohne verpflichtenden kostenpflichtigen API-Schlüssel.
- **Farbskala für PM2.5:**
  - 🟢 **Grün:** 0–10 µg/m³ (Gut)
  - 🟡 **Gelb:** 10–25 µg/m³ (Mäßig)
  - 🟠 **Orange:** 25–50 µg/m³ (Ungesund)
  - 🔴 **Rot:** &gt; 50 µg/m³ (Sehr hoch / Alarm)
- **Heatmap-Modus:** Umschaltbar zwischen präzisen Einzelmesspunkten und kontinuierlicher Feinstaub-Heatmap (`leaflet-heat`).
- **Messpunkt-Inspektion:** Klick auf einen Messpunkt öffnet ein detailliertes Pop-up mit sämtlichen Sensorwerten (PM1.0, PM2.5, PM4, PM10, Temperatur, Feuchte, Druck, GPS, Zeitstempel, Straße).
- **Fahrtrouten-Visualisierung:** Chronologische Linienverbindung der gefahrenen Strecken je Roboter.
- **Zeitschieberegler & Animation:** Schieberegler zur zeitlichen Filterung sowie Play/Pause-Button zur Wiedergabe der Roboterfahrt über die Zeit.
- **Karten-Zentrierung:** Button *"Auf Messpunkte zentrieren"*, um automatisch auf alle vorhandenen Messdaten zu zoomen.

### 2. Auswertung, Statistiken & Diagramme
- **KPI-Zusammenfassung:** 
  - Gesamtzahl aller Messungen
  - Durchschnittliche Feinstaubbelastung (PM2.5)
  - Höchster und niedrigster Messwert
  - Durchschnittliche Temperatur (°C)
  - Durchschnittliche Luftfeuchtigkeit (%)
  - Durchschnittlicher Luftdruck (hPa)
  - Anzahl aktiver Roboter
- **Straßenbezogene Auswertung:**
  - Automatische Zuordnung von GPS-Koordinaten zu Straßennamen (Reverse-Geocoding-Cache).
  - Rangliste der am stärksten belasteten Straßen (Hotspots) zur Identifikation von Problemzonen.
  - Klick auf eine Straße zoomt und filtert direkt auf der Karte.
- **Interaktive Diagramme (Chart.js):**
  - Feinstaubentwicklung über die Zeit (PM1.0, PM2.5, PM4, PM10)
  - Partikelgrößen-Vergleich (Balkendiagramm)
  - Temperaturverlauf
  - Luftfeuchtigkeits- und Luftdruckverlauf
- **Filter-Kombinationen:**
  - Filter nach Roboter-ID, Datumsbereich (von/bis), Uhrzeit (von/bis), Feinstaub-Schwellenwerten und Straßennamen.

### 3. Messdaten-Tabelle & Export
- Tabellarische Ansicht mit Spaltensortierung, Suchfunktion und Paginierung.
- Detailansicht einzelner Messungen im Modal-Dialog.
- **Datenexport:** 1-Klick-Export aller gefilterten Messwerte als **CSV** oder **JSON**.

### 4. Backend & REST-API für Smartphone-App
- **Technologie:** Python FastAPI mit Uvicorn & SQLite im WAL-Modus (hohe Schreib- und Lese-Performance, dauerhafte Speicherung).
- **Echtzeit-Aktualisierung:** WebSockets übertragen eintreffende Messdaten verzögerungsfrei an alle offenen Frontend-Sitzungen (kein manueller Reload nötig).
- **Plausibilitätsprüfung:** Strikte Validierung aller GPS-Koordinaten (Breite -90 bis 90, Länge -180 bis 180) und Messbereiche.
- **Fehlertolerante Feldnamen:** Erkennt flexible Aliase der Handy-App (`PM2.5`, `pm25`, `lat`, `lng`, `temp`, etc.).
- **Interaktive Swagger-UI:** Unter `/docs` direkt im Browser aufrufbar.
- **Integrierter Roboter-Simulator:** Startet per Knopfdruck eine virtuelle Testfahrt, um die Web-App auch ohne physikalischen Roboter live vorführen zu können.

---

## 🛠️ Tech-Stack

| Bereich | Technologie | Beschreibung |
|---|---|---|
| **Backend** | Python 3.10+ & FastAPI | Asynchrone, typisierte REST-API mit OpenAPI-Generierung |
| **Server** | Uvicorn (ASGI) | Schneller ASGI-Webserver mit WebSocket-Unterstützung |
| **Datenbank** | SQLite 3 (WAL-Mode) | Dauerhafte, transaktionssichere Speicherung mit Indizes |
| **Frontend** | HTML5, Modern CSS, Vanilla ES6 | Schlank, ohne Build-Tools (kein Webpack/Vite zwingend nötig) |
| **Karten** | Leaflet.js 1.9 & Leaflet.heat | OpenStreetMap / CartoDB Kacheln, interaktive Overlays |
| **Diagramme** | Chart.js 4.4 | Responsive Zeitreihen- und Vergleichsdiagramme |
| **Echtzeit** | WebSockets (RFC 6455) | Push-Events für neue Messwerte |

---

## 🚀 Installation & Schnellstart

### Voraussetzungen
- Python 3.10 oder neuer installiert ([python.org](https://www.python.org/downloads/))

### 1. Abhängigkeiten installieren
Öffne ein Terminal (PowerShell / Eingabeaufforderung oder Bash) im Projektverzeichnis:

```bash
pip install -r requirements.txt
```

### 2. Server starten

#### Unter Windows:
Doppelklicke auf:
```
start_windows.bat
```
*Oder über die Konsole:*
```powershell
python run_server.py
```

#### Unter Linux / macOS:
```bash
chmod +x start_linux.sh
./start_linux.sh
```
*Oder direkt:*
```bash
python3 run_server.py
```

### 3. Im Browser öffnen
- **Web-Dashboard:** [http://localhost:8000](http://localhost:8000)
- **Interaktive Swagger-API-Dokumentation:** [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 📱 Anbindung der externen Handy-App

Die Handy-App sendet Messwerte via HTTP-POST:

- **URL:** `http://<SERVER-IP>:8000/api/messung`
- **Method:** `POST`
- **Header:** `Content-Type: application/json`
- **Body:**
```json
{
  "robot_id": "ROBOT-01",
  "latitude": 52.516842,
  "longitude": 13.388865,
  "pm1_0": 7.4,
  "pm2_5": 14.8,
  "pm4_0": 19.5,
  "pm10_0": 26.2,
  "temperature": 20.5,
  "humidity": 58.0,
  "pressure": 1013.25,
  "timestamp": "2026-11-20T22:30:00Z"
}
```

Ausführliche Code-Beispiele für **Flutter/Dart**, **Android Kotlin**, **iOS Swift**, **cURL** und **Python** befinden sich in der Datei [`API_DOCUMENTATION.md`](file:///C:/Users/Homel/.gemini/antigravity/scratch/feinstaub-monitoring/API_DOCUMENTATION.md) sowie direkt im Dashboard unter dem Reiter **"Mobile-App API-Doku"**.

---

## 🧪 Automatische Tests ausführen

Das Projekt enthält eine Test-Suite zur Überprüfung der Validierungsregeln, Alias-Erkennung und Datenbank-Operationen:

```bash
python backend/tests/test_api.py
```

---

## 📁 Projektstruktur

```
feinstaub-monitoring/
├── backend/
│   ├── app/
│   │   ├── __init__.py          # Paket-Initialisierung
│   │   ├── main.py              # FastAPI-App, Routing, WebSockets, Lifespan
│   │   ├── database.py          # SQLite-Verbindung, WAL-Modus, Tabellen-Schema & Indizes
│   │   ├── models.py            # Pydantic-Datenmodelle & Alias-Validierung
│   │   ├── services.py          # Berechnungen, Geocoding-Cache, Filter-Logik
│   │   ├── websocket_manager.py # Broadcast-Manager für Live-Updates
│   │   └── simulator.py         # Realistischer Testdaten-Generator & Live-Fahrsimulator
│   └── tests/
│       └── test_api.py          # Automatisierte Unit- und Integrationstests
├── frontend/
│   ├── index.html               # Moderne Single-Page-Benutzeroberfläche
│   ├── css/
│   │   └── style.css            # Responsive Styles, Glassmorphism, Farbthemen
│   └── js/
│       ├── app.js               # Zentraler State-Manager & Event-Handling
│       ├── map.js               # Leaflet-Kartensteuerung, Marker, Heatmap, Zeitschieberegler
│       ├── charts.js            # Chart.js Visualisierungen
│       ├── table.js             # Datentabelle mit Sortierung, Suche, Export, Details
│       ├── street_stats.js      # Straßen-Ranking & Hotspot-Auswertung
│       └── websocket.js         # WebSocket-Echtzeitanbindung mit Auto-Reconnect
├── data/
│   └── feinstaub.db             # Persistente SQLite-Datenbank
├── API_DOCUMENTATION.md         # Ausführliche API-Spezifikation für die Smartphone-App
├── requirements.txt             # Python-Paketabhängigkeiten
├── run_server.py                # Server-Starter
├── start_windows.bat            # 1-Klick-Starter für Windows
├── start_linux.sh               # Starter für Linux / macOS
└── README.md                    # Gesamtdokumentation
```

---

## 🌐 Hosting auf einem Server (Produktivbetrieb)

Zur Bereitstellung auf einem Linux-Server (z.B. Ubuntu/Debian):

1. **Systemd Service einrichten** (`/etc/systemd/system/feinstaub.service`):
```ini
[Unit]
Description=AeroTrack Feinstaub Monitoring Backend
After=network.target

[Service]
User=www-data
WorkingDirectory=/var/www/feinstaub-monitoring
ExecStart=/usr/bin/python3 run_server.py
Restart=always

[Install]
WantedBy=multi-user.target
```

2. **Nginx Reverse-Proxy mit WebSocket-Unterstützung**:
```nginx
server {
    listen 80;
    server_name feinstaub.deine-domain.de;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```
