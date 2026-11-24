from fastapi import FastAPI, Depends, HTTPException, Query, Header, status, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional, List, Dict, Any
import sqlite3
import logging

from .database import init_db, get_db, get_db_connection
from .models import (
    MeasurementCreate,
    MeasurementResponse,
    MeasurementListResponse,
    SummaryStatistics,
    StreetStatistics,
    SettingsUpdate
)
from .services import (
    insert_measurement,
    get_filtered_measurements,
    get_summary_statistics,
    get_street_statistics,
    get_timeseries_aggregated,
    get_settings,
    update_settings
)
from .websocket_manager import manager
from .simulator import seed_initial_test_data, live_simulator

# Logging configuration
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("feinstaub_app")

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize Database (clean schema without test data injection)
    logger.info("Starte Feinstaub-Monitoring-Server...")
    init_db()
    logger.info("Datenbank bereit für reale Messdaten.")
    yield
    # Shutdown
    live_simulator.stop()
    logger.info("Server wird beendet.")

app = FastAPI(
    title="Feinstaub & IoT Umwelt-Monitoring API",
    description="""
API für mobile Messroboter zur kontinuierlichen Erfassung von Feinstaub (PM1.0, PM2.5, PM4, PM10),
Wetterdaten (Temperatur, Luftfeuchtigkeit, Luftdruck) und GPS-Koordinaten.

Entwickelt für die Anbindung externer Handy-Apps und Dashboards.
    """,
    version="2.0.0",
    lifespan=lifespan
)

# CORS Middleware for external access (e.g. mobile apps / cross-domain frontends)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def verify_api_key(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    authorization: Optional[str] = Header(None),
    api_key_query: Optional[str] = Query(None, alias="api_key"),
    db: sqlite3.Connection = Depends(get_db)
):
    settings = get_settings(db)
    if not settings.get("require_api_key", False):
        return True  # Auth is disabled by default
    
    expected_key = settings.get("api_key", "")
    received_key = x_api_key or api_key_query
    if not received_key and authorization:
        if authorization.startswith("Bearer "):
            received_key = authorization[7:].strip()
        else:
            received_key = authorization.strip()

    if received_key != expected_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Ungültiger oder fehlender API-Schlüssel (Header 'X-API-Key' erforderlich)"
        )
    return True

# =========================================================================
# API Endpoints
# =========================================================================

@app.post(
    "/api/messung",
    response_model=MeasurementResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Neuen Messdatensatz empfangen",
    tags=["Messungen"]
)
async def post_measurement(
    measurement: MeasurementCreate,
    auth: bool = Depends(verify_api_key),
    db: sqlite3.Connection = Depends(get_db)
):
    """
    Empfängt einen neuen Sensor-Messdatensatz einer externen Handy-App oder des Roboters.
    - Führt Plausibilitätsprüfungen durch.
    - Speichert den Datensatz dauerhaft in SQLite.
    - Ermittelt automatisch den Straßennamen (Reverse-Geocoding Cache).
    - Überträgt die neue Messung per WebSocket an alle aktiven Frontend-Karten in Echtzeit.
    """
    data = measurement.model_dump()
    result = insert_measurement(db, data)
    
    # Broadcast to live clients via WebSocket
    await manager.broadcast({
        "event": "new_measurement",
        "data": result
    })
    
    return result

@app.post(
    "/api/messungen/batch",
    status_code=status.HTTP_201_CREATED,
    summary="Mehrere Messdatensätze auf einmal senden",
    tags=["Messungen"]
)
async def post_measurements_batch(
    measurements: List[MeasurementCreate],
    auth: bool = Depends(verify_api_key),
    db: sqlite3.Connection = Depends(get_db)
):
    """Ermöglicht das Nachsenden gepufferter Messdaten, wenn die Handy-App offline war."""
    inserted = []
    for m in measurements:
        res = insert_measurement(db, m.model_dump())
        inserted.append(res)

    if inserted:
        await manager.broadcast({
            "event": "batch_measurements",
            "count": len(inserted),
            "data": inserted[-1]  # latest
        })

    return {"status": "success", "inserted_count": len(inserted)}

@app.get(
    "/api/messungen",
    response_model=MeasurementListResponse,
    summary="Gespeicherte Messdaten mit flexiblen Filtern abrufen",
    tags=["Messungen"]
)
def get_measurements(
    robot_id: Optional[str] = Query(None, description="Nach bestimmter Roboter-ID filtern (z.B. ROBOT-ALPHA)"),
    start_date: Optional[str] = Query(None, description="Startdatum im Format YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="Enddatum im Format YYYY-MM-DD"),
    start_time: Optional[str] = Query(None, description="Startuhrzeit im Format HH:MM"),
    end_time: Optional[str] = Query(None, description="Enduhrzeit im Format HH:MM"),
    min_pm2_5: Optional[float] = Query(None, description="Mindestwert PM2.5"),
    max_pm2_5: Optional[float] = Query(None, description="Höchstwert PM2.5"),
    min_pm10: Optional[float] = Query(None, description="Mindestwert PM10"),
    max_pm10: Optional[float] = Query(None, description="Höchstwert PM10"),
    street: Optional[str] = Query(None, description="Nach Straßennamen filtern"),
    limit: int = Query(2000, ge=1, le=50000, description="Maximale Anzahl der zurückgegebenen Punkte"),
    offset: int = Query(0, ge=0, description="Offset für Paginierung"),
    db: sqlite3.Connection = Depends(get_db)
):
    measurements, total_count = get_filtered_measurements(
        conn=db,
        robot_id=robot_id,
        start_date=start_date,
        end_date=end_date,
        start_time=start_time,
        end_time=end_time,
        min_pm2_5=min_pm2_5,
        max_pm2_5=max_pm2_5,
        min_pm10=min_pm10,
        max_pm10=max_pm10,
        street=street,
        limit=limit,
        offset=offset
    )
    return {
        "total": total_count,
        "count": len(measurements),
        "measurements": measurements
    }

@app.delete(
    "/api/messungen",
    summary="Alle Messdaten löschen (Datenbank leeren für Echtbetrieb)",
    tags=["Messungen"]
)
async def delete_all_measurements(db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("DELETE FROM measurements;")
    cursor.execute("DELETE FROM geocode_cache;")
    db.commit()
    await manager.broadcast({"event": "batch_measurements", "count": 0})
    return {"status": "success", "message": "Datenbank wurde vollständig geleert."}

@app.get(
    "/api/messungen/summary",
    response_model=SummaryStatistics,
    summary="Statistische Gesamtzusammenfassung abrufen",
    tags=["Auswertung"]
)
def get_summary(
    robot_id: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: sqlite3.Connection = Depends(get_db)
):
    return get_summary_statistics(db, robot_id=robot_id, start_date=start_date, end_date=end_date)

@app.get(
    "/api/messungen/streets",
    response_model=List[StreetStatistics],
    summary="Straßenbezogene Feinstaub-Auswertung und Hotspots",
    tags=["Auswertung"]
)
def get_streets(
    min_measurements: int = Query(1, ge=1, description="Mindestanzahl an Messungen pro Straße"),
    db: sqlite3.Connection = Depends(get_db)
):
    return get_street_statistics(db, min_count=min_measurements)

@app.get(
    "/api/messungen/timeseries",
    summary="Zeitreihenverlauf für Diagramme",
    tags=["Auswertung"]
)
def get_timeseries(
    robot_id: Optional[str] = Query(None),
    points: int = Query(150, ge=10, le=1000),
    db: sqlite3.Connection = Depends(get_db)
):
    return get_timeseries_aggregated(db, robot_id=robot_id, max_points=points)

@app.get(
    "/api/config",
    summary="Grenzwerte und Systemeinstellungen abrufen",
    tags=["Konfiguration"]
)
def get_configuration(db: sqlite3.Connection = Depends(get_db)):
    return get_settings(db)

@app.put(
    "/api/config",
    summary="Grenzwerte oder API-Authentifizierung anpassen",
    tags=["Konfiguration"]
)
def update_configuration(update: SettingsUpdate, db: sqlite3.Connection = Depends(get_db)):
    updated = update_settings(db, update.model_dump())
    return {"status": "success", "settings": updated}

@app.post(
    "/api/testdaten/generate",
    summary="Neue realistische Testdaten generieren oder zurücksetzen",
    tags=["Entwicklung & Test"]
)
def generate_test_data(
    count_per_robot: int = Query(50, ge=5, le=300),
    clear_existing: bool = Query(True),
    db: sqlite3.Connection = Depends(get_db)
):
    seed_initial_test_data(db, clear_existing=clear_existing, count_per_robot=count_per_robot)
    return {
        "status": "success",
        "message": f"Testdaten erfolgreich generiert ({count_per_robot} Punkte pro Roboter, clear={clear_existing})."
    }

@app.post(
    "/api/simulator/toggle",
    summary="Live-Roboter-Fahrt starten oder anhalten",
    tags=["Entwicklung & Test"]
)
async def toggle_simulator():
    if live_simulator.is_running:
        live_simulator.stop()
        return {"running": False, "message": "Live-Simulation gestoppt."}
    else:
        live_simulator.start()
        return {"running": True, "message": "Live-Simulation gestartet. Roboter sendet alle 3 Sekunden Messwerte."}

@app.get(
    "/api/simulator/status",
    summary="Status des Live-Simulators prüfen",
    tags=["Entwicklung & Test"]
)
def get_simulator_status():
    return {
        "running": live_simulator.is_running,
        "robot_id": live_simulator.robot_id,
        "current_position": {
            "latitude": round(live_simulator.current_lat, 6),
            "longitude": round(live_simulator.current_lon, 6)
        }
    }

# =========================================================================
# WebSocket for Live Real-Time Dashboard Updates
# =========================================================================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep alive and receive ping messages
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

# =========================================================================
# Static Web Frontend Mounting
# =========================================================================

app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

@app.get("/", include_in_schema=False)
async def serve_index():
    index_file = FRONTEND_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return JSONResponse({"status": "Frontend loading error", "detail": "index.html not found"})
