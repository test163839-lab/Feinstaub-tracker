import random
import math
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional
import sqlite3

from .database import get_db_connection
from .services import insert_measurement
from .websocket_manager import manager

logger = logging.getLogger("feinstaub_app")

# Pre-defined realistic route waypoints in Berlin with actual streets
SIMULATED_ROUTES = [
    {
        "robot_id": "ROBOT-ALPHA",
        "description": "City Center & High Traffic Corridor",
        "base_pm": 28.0,
        "waypoints": [
            (52.5163, 13.3777, "Straße des 17. Juni"),
            (52.5168, 13.3888, "Unter den Linden"),
            (52.5172, 13.3930, "Bebelplatz"),
            (52.5180, 13.4010, "Schlossplatz"),
            (52.5195, 13.4070, "Karl-Liebknecht-Straße"),
            (52.5219, 13.4132, "Alexanderplatz"),
            (52.5180, 13.4350, "Karl-Marx-Allee"),
            (52.5150, 13.4540, "Frankfurter Allee"),
            (52.5120, 13.4600, "Warschauer Straße"),
            (52.5050, 13.4480, "Mühlenstraße")
        ]
    },
    {
        "robot_id": "ROBOT-BETA",
        "description": "Urban Residential & Shopping District",
        "base_pm": 16.0,
        "waypoints": [
            (52.5255, 13.3930, "Oranienburger Straße"),
            (52.5290, 13.4000, "Torstraße"),
            (52.5315, 13.4050, "Rosenthaler Straße"),
            (52.5340, 13.4120, "Schönhauser Allee"),
            (52.5380, 13.4150, "Kastanienallee"),
            (52.5400, 13.4080, "Eberswalder Straße"),
            (52.5350, 13.3900, "Bernauer Straße"),
            (52.5320, 13.3780, "Invalidenstraße"),
            (52.5260, 13.3690, "Europaplatz (Hauptbahnhof)"),
            (52.5200, 13.3869, "Friedrichstraße")
        ]
    },
    {
        "robot_id": "ROBOT-GAMMA",
        "description": "South-West Boulevard & Park Perimeter",
        "base_pm": 11.0,
        "waypoints": [
            (52.5096, 13.3759, "Potsdamer Platz"),
            (52.5105, 13.3850, "Leipziger Straße"),
            (52.5070, 13.3910, "Wilhelmstraße"),
            (52.5030, 13.3920, "Kochstraße (Checkpoint Charlie)"),
            (52.5000, 13.3950, "Lindenstraße"),
            (52.5020, 13.4050, "Oranienstraße"),
            (52.5050, 13.3700, "Tiergartenstraße"),
            (52.5120, 13.3500, "Großer Stern"),
            (52.5140, 13.3600, "Spreeweg"),
            (52.5180, 13.3700, "Paul-Löbe-Allee")
        ]
    }
]

def interpolate_points(p1: tuple, p2: tuple, num_steps: int) -> List[tuple]:
    """Erzeugt gleichmäßige Zwischenpunkte zwischen zwei Wegpunkten."""
    lat1, lon1, street = p1
    lat2, lon2, next_street = p2
    points = []
    for step in range(num_steps):
        frac = step / float(num_steps)
        lat = lat1 + (lat2 - lat1) * frac + random.uniform(-0.00015, 0.00015)
        lon = lon1 + (lon2 - lon1) * frac + random.uniform(-0.00015, 0.00015)
        # Use street of first until midway, then next
        curr_street = street if frac < 0.6 else next_street
        points.append((lat, lon, curr_street))
    return points

def generate_sensor_values(base_pm: float, is_hotspot: bool = False) -> Dict[str, float]:
    """Generiert physikalisch konsistente PM-Werte (PM1.0 < PM2.5 < PM4 < PM10) und Wetter."""
    if is_hotspot:
        pm2_5 = round(random.uniform(52.0, 89.0), 1)
    else:
        # Realistic variation with occasional spikes
        var = random.gauss(0, base_pm * 0.35)
        pm2_5 = max(2.5, round(base_pm + var, 1))

    # Physical relationships: PM1.0 is ~40-60% of PM2.5, PM4 is ~130-160%, PM10 is ~170-250%
    pm1_0 = max(1.0, round(pm2_5 * random.uniform(0.42, 0.65), 1))
    pm4_0 = round(pm2_5 * random.uniform(1.25, 1.55), 1)
    pm10_0 = round(pm4_0 * random.uniform(1.30, 1.75), 1)

    # Weather values
    temp = round(random.uniform(16.5, 23.8) + (pm2_5 * 0.03), 1)
    humidity = round(random.uniform(48.0, 75.0), 1)
    pressure = round(random.uniform(1011.5, 1017.8), 1)

    return {
        "pm1_0": pm1_0,
        "pm2_5": pm2_5,
        "pm4_0": pm4_0,
        "pm10_0": pm10_0,
        "temperature": temp,
        "humidity": humidity,
        "pressure": pressure
    }

def seed_initial_test_data(conn: sqlite3.Connection, clear_existing: bool = False, count_per_robot: int = 40):
    """Befüllt die Datenbank mit realistischen Testdaten für alle Roboter."""
    cursor = conn.cursor()
    if clear_existing:
        cursor.execute("DELETE FROM measurements;")
        cursor.execute("DELETE FROM geocode_cache;")
        conn.commit()
    else:
        cursor.execute("SELECT COUNT(*) FROM measurements;")
        if cursor.fetchone()[0] > 0:
            logger.info("Datenbank enthält bereits Messungen. Überspringe automatischen Initial-Seed.")
            return

    now = datetime.now(timezone.utc)
    inserted_count = 0

    for route_info in SIMULATED_ROUTES:
        robot_id = route_info["robot_id"]
        base_pm = route_info["base_pm"]
        waypoints = route_info["waypoints"]

        # Build complete path
        path_points = []
        steps_between = max(3, count_per_robot // (len(waypoints) - 1))
        for i in range(len(waypoints) - 1):
            path_points.extend(interpolate_points(waypoints[i], waypoints[i+1], steps_between))
        path_points.append(waypoints[-1])

        # Slice to requested count
        path_points = path_points[:count_per_robot]

        # Time offsets: spread across the last 4 hours
        time_step_sec = (4 * 3600) // len(path_points)

        for idx, (lat, lon, street) in enumerate(path_points):
            t_offset = (len(path_points) - idx) * time_step_sec
            timestamp = (now - timedelta(seconds=t_offset)).isoformat()

            # Create realistic hotspots on certain streets (e.g. Alexanderplatz, Leipziger Straße)
            is_hotspot = ("Alexanderplatz" in street or "Leipziger" in street or "Frankfurter" in street) and (idx % 3 == 0)
            sensors = generate_sensor_values(base_pm, is_hotspot=is_hotspot)

            data = {
                "robot_id": robot_id,
                "latitude": round(lat, 6),
                "longitude": round(lon, 6),
                "street": street,
                "timestamp": timestamp,
                **sensors
            }
            insert_measurement(conn, data)
            inserted_count += 1

    logger.info(f"Erfolgreich {inserted_count} realistische Testmessungen generiert.")

# Background Live Simulator State
class LiveSimulator:
    def __init__(self):
        self.is_running = False
        self.task: Optional[asyncio.Task] = None
        self.active_index = 0
        self.robot_id = "ROBOT-LIVE-01"
        self.current_lat = 52.5180
        self.current_lon = 13.3900
        self.heading = 0.8  # radians

    async def run_loop(self):
        logger.info("Live-Roboter-Simulator gestartet.")
        step = 0
        while self.is_running:
            try:
                # Move robot along streets (~15-25 meters per step)
                self.heading += random.uniform(-0.25, 0.25)
                distance = 0.00025  # ~20 meters
                self.current_lat += math.cos(self.heading) * distance
                self.current_lon += math.sin(self.heading) * distance * 1.6

                # Keep roughly within Berlin center
                if self.current_lat < 52.49 or self.current_lat > 52.55:
                    self.heading += math.pi
                if self.current_lon < 13.34 or self.current_lon > 13.45:
                    self.heading += math.pi

                # Sensor data with occasional pollution burst
                burst = (step % 12 >= 9)
                sensors = generate_sensor_values(base_pm=24.0, is_hotspot=burst)
                now_iso = datetime.now(timezone.utc).isoformat()

                data = {
                    "robot_id": self.robot_id,
                    "latitude": round(self.current_lat, 6),
                    "longitude": round(self.current_lon, 6),
                    "timestamp": now_iso,
                    **sensors
                }

                # Insert into DB and broadcast to all connected WebSocket clients
                conn = get_db_connection()
                try:
                    result = insert_measurement(conn, data)
                finally:
                    conn.close()

                # Broadcast live event
                await manager.broadcast({
                    "event": "new_measurement",
                    "data": result
                })
                
                step += 1
            except Exception as e:
                logger.error(f"Fehler im Live-Simulator-Loop: {e}")

            # Sleep 3 seconds between measurements
            await asyncio.sleep(3.0)

    def start(self):
        if not self.is_running:
            self.is_running = True
            self.task = asyncio.create_task(self.run_loop())
            return True
        return False

    def stop(self):
        if self.is_running:
            self.is_running = False
            if self.task:
                self.task.cancel()
                self.task = None
            return True
        return False

live_simulator = LiveSimulator()
