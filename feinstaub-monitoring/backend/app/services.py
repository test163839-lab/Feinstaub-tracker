import sqlite3
import requests
import math
import logging
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime

logger = logging.getLogger("feinstaub_app")

# In-memory settings cache for speed
_cached_settings = {
    "pm2_5_green_max": 10.0,
    "pm2_5_yellow_max": 25.0,
    "pm2_5_orange_max": 50.0,
    "require_api_key": False,
    "api_key": "feinstaub_secure_key_2026"
}

def load_settings_from_db(conn: sqlite3.Connection) -> Dict[str, Any]:
    global _cached_settings
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM settings;")
    rows = cursor.fetchall()
    for row in rows:
        key, val = row["key"], row["value"]
        if key in ("pm2_5_green_max", "pm2_5_yellow_max", "pm2_5_orange_max"):
            _cached_settings[key] = float(val)
        elif key == "require_api_key":
            _cached_settings[key] = val.lower() in ("true", "1", "yes")
        else:
            _cached_settings[key] = val
    return _cached_settings

def get_settings(conn: sqlite3.Connection) -> Dict[str, Any]:
    return load_settings_from_db(conn)

def update_settings(conn: sqlite3.Connection, new_settings: Dict[str, Any]) -> Dict[str, Any]:
    cursor = conn.cursor()
    for key, val in new_settings.items():
        if val is not None:
            cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);", (key, str(val)))
    conn.commit()
    return load_settings_from_db(conn)

def calculate_pm2_5_level(pm2_5: float, settings: Optional[Dict[str, Any]] = None) -> str:
    s = settings or _cached_settings
    green_max = s.get("pm2_5_green_max", 10.0)
    yellow_max = s.get("pm2_5_yellow_max", 25.0)
    orange_max = s.get("pm2_5_orange_max", 50.0)

    if pm2_5 <= green_max:
        return "green"
    elif pm2_5 <= yellow_max:
        return "yellow"
    elif pm2_5 <= orange_max:
        return "orange"
    else:
        return "red"

def resolve_street_name(lat: float, lon: float, conn: sqlite3.Connection, provided_street: Optional[str] = None) -> str:
    """Ermittelt den Straßennamen mit Geocode-Cache und optionalem OpenStreetMap-Fallback."""
    if provided_street and provided_street.strip():
        return provided_street.strip()

    # Cache lookup using ~20m rounding
    lat_r = round(lat, 4)
    lon_r = round(lon, 4)
    
    cursor = conn.cursor()
    cursor.execute("SELECT street FROM geocode_cache WHERE lat_rounded = ? AND lon_rounded = ?;", (lat_r, lon_r))
    cached = cursor.fetchone()
    if cached and cached["street"]:
        return cached["street"]

    # Try OpenStreetMap reverse geocoding (with short timeout & graceful failure)
    street_name = None
    try:
        url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lon}&zoom=18&addressdetails=1"
        headers = {"User-Agent": "FeinstaubMonitoringRobotApp/1.0 (academic-iot-research)"}
        resp = requests.get(url, headers=headers, timeout=1.5)
        if resp.status_code == 200:
            data = resp.json()
            address = data.get("address", {})
            street_name = address.get("road") or address.get("pedestrian") or address.get("suburb") or address.get("city_district")
    except Exception as e:
        logger.debug(f"Reverse geocode remote lookup skipped or failed: {e}")

    # Fallback if offline, timeout, or unnamed
    if not street_name:
        # Determine fallback name based on spatial sectors/synthetic district
        street_name = f"Zone {lat_r:.3f}, {lon_r:.3f}"

    # Cache result
    try:
        cursor.execute("INSERT OR REPLACE INTO geocode_cache (lat_rounded, lon_rounded, street) VALUES (?, ?, ?);",
                       (lat_r, lon_r, street_name))
        conn.commit()
    except Exception:
        pass

    return street_name

def insert_measurement(conn: sqlite3.Connection, data: Dict[str, Any]) -> Dict[str, Any]:
    street = resolve_street_name(data["latitude"], data["longitude"], conn, data.get("street"))
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO measurements (
        robot_id, latitude, longitude, pm1_0, pm2_5, pm4_0, pm10_0,
        temperature, humidity, pressure, timestamp, street
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data["robot_id"],
        float(data["latitude"]),
        float(data["longitude"]),
        float(data["pm1_0"]),
        float(data["pm2_5"]),
        float(data["pm4_0"]),
        float(data["pm10_0"]),
        float(data["temperature"]),
        float(data["humidity"]),
        float(data["pressure"]),
        data["timestamp"],
        street
    ))
    conn.commit()
    meas_id = cursor.lastrowid
    
    settings = get_settings(conn)
    level = calculate_pm2_5_level(float(data["pm2_5"]), settings)
    
    return {
        "id": meas_id,
        "robot_id": data["robot_id"],
        "latitude": float(data["latitude"]),
        "longitude": float(data["longitude"]),
        "pm1_0": float(data["pm1_0"]),
        "pm2_5": float(data["pm2_5"]),
        "pm4_0": float(data["pm4_0"]),
        "pm10_0": float(data["pm10_0"]),
        "temperature": float(data["temperature"]),
        "humidity": float(data["humidity"]),
        "pressure": float(data["pressure"]),
        "timestamp": data["timestamp"],
        "street": street,
        "level": level
    }

def get_filtered_measurements(
    conn: sqlite3.Connection,
    robot_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    min_pm2_5: Optional[float] = None,
    max_pm2_5: Optional[float] = None,
    min_pm10: Optional[float] = None,
    max_pm10: Optional[float] = None,
    street: Optional[str] = None,
    limit: int = 5000,
    offset: int = 0
) -> Tuple[List[Dict[str, Any]], int]:
    query = "SELECT * FROM measurements WHERE 1=1"
    params = []

    if robot_id:
        query += " AND robot_id = ?"
        params.append(robot_id)

    if start_date:
        query += " AND date(timestamp) >= date(?)"
        params.append(start_date)

    if end_date:
        query += " AND date(timestamp) <= date(?)"
        params.append(end_date)

    if start_time:
        query += " AND time(timestamp) >= time(?)"
        params.append(start_time)

    if end_time:
        query += " AND time(timestamp) <= time(?)"
        params.append(end_time)

    if min_pm2_5 is not None:
        query += " AND pm2_5 >= ?"
        params.append(min_pm2_5)

    if max_pm2_5 is not None:
        query += " AND pm2_5 <= ?"
        params.append(max_pm2_5)

    if min_pm10 is not None:
        query += " AND pm10_0 >= ?"
        params.append(min_pm10)

    if max_pm10 is not None:
        query += " AND pm10_0 <= ?"
        params.append(max_pm10)

    if street:
        query += " AND street LIKE ?"
        params.append(f"%{street}%")

    # Count total matching
    count_query = query.replace("SELECT *", "SELECT COUNT(*)", 1)
    cursor = conn.cursor()
    cursor.execute(count_query, params)
    total_count = cursor.fetchone()[0]

    # Add order and limits
    query += " ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    cursor.execute(query, params)
    rows = cursor.fetchall()
    
    settings = get_settings(conn)
    results = []
    for r in rows:
        item = dict(r)
        item["level"] = calculate_pm2_5_level(item["pm2_5"], settings)
        results.append(item)

    return results, total_count

def get_summary_statistics(conn: sqlite3.Connection, robot_id: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None) -> Dict[str, Any]:
    where_clauses = ["1=1"]
    params = []
    if robot_id:
        where_clauses.append("robot_id = ?")
        params.append(robot_id)
    if start_date:
        where_clauses.append("date(timestamp) >= date(?)")
        params.append(start_date)
    if end_date:
        where_clauses.append("date(timestamp) <= date(?)")
        params.append(end_date)
        
    where_sql = " AND ".join(where_clauses)
    
    cursor = conn.cursor()
    cursor.execute(f"""
    SELECT 
        COUNT(*) as total_count,
        COALESCE(AVG(pm2_5), 0.0) as avg_pm2_5,
        COALESCE(MIN(pm2_5), 0.0) as min_pm2_5,
        COALESCE(MAX(pm2_5), 0.0) as max_pm2_5,
        COALESCE(AVG(pm1_0), 0.0) as avg_pm1_0,
        COALESCE(AVG(pm4_0), 0.0) as avg_pm4_0,
        COALESCE(AVG(pm10_0), 0.0) as avg_pm10_0,
        COALESCE(AVG(temperature), 0.0) as avg_temp,
        COALESCE(MIN(temperature), 0.0) as min_temp,
        COALESCE(MAX(temperature), 0.0) as max_temp,
        COALESCE(AVG(humidity), 0.0) as avg_hum,
        COALESCE(AVG(pressure), 0.0) as avg_press,
        MAX(timestamp) as last_update
    FROM measurements
    WHERE {where_sql}
    """, params)
    
    row = cursor.fetchone()
    
    # Distinct active robots
    cursor.execute(f"SELECT DISTINCT robot_id FROM measurements WHERE {where_sql} ORDER BY robot_id;", params)
    active_robots = [r[0] for r in cursor.fetchall()]

    return {
        "total_measurements": row["total_count"] or 0,
        "avg_pm2_5": round(row["avg_pm2_5"] or 0.0, 2),
        "min_pm2_5": round(row["min_pm2_5"] or 0.0, 2),
        "max_pm2_5": round(row["max_pm2_5"] or 0.0, 2),
        "avg_pm1_0": round(row["avg_pm1_0"] or 0.0, 2),
        "avg_pm4_0": round(row["avg_pm4_0"] or 0.0, 2),
        "avg_pm10_0": round(row["avg_pm10_0"] or 0.0, 2),
        "avg_temperature": round(row["avg_temp"] or 0.0, 1),
        "min_temperature": round(row["min_temp"] or 0.0, 1),
        "max_temperature": round(row["max_temp"] or 0.0, 1),
        "avg_humidity": round(row["avg_hum"] or 0.0, 1),
        "avg_pressure": round(row["avg_press"] or 0.0, 1),
        "robot_count": len(active_robots),
        "active_robots": active_robots,
        "last_update": row["last_update"]
    }

def get_street_statistics(conn: sqlite3.Connection, min_count: int = 1) -> List[Dict[str, Any]]:
    cursor = conn.cursor()
    cursor.execute("""
    SELECT 
        street,
        COUNT(*) as measurement_count,
        ROUND(AVG(pm2_5), 2) as avg_pm2_5,
        ROUND(MAX(pm2_5), 2) as max_pm2_5,
        ROUND(MIN(pm2_5), 2) as min_pm2_5,
        ROUND(AVG(pm10_0), 2) as avg_pm10_0,
        ROUND(AVG(temperature), 1) as avg_temperature,
        ROUND(AVG(humidity), 1) as avg_humidity
    FROM measurements
    WHERE street IS NOT NULL AND TRIM(street) != ''
    GROUP BY street
    HAVING COUNT(*) >= ?
    ORDER BY avg_pm2_5 DESC
    """, (min_count,))
    
    rows = cursor.fetchall()
    settings = get_settings(conn)
    
    result = []
    for r in rows:
        d = dict(r)
        d["risk_level"] = calculate_pm2_5_level(d["avg_pm2_5"], settings)
        result.append(d)
        
    return result

def get_timeseries_aggregated(conn: sqlite3.Connection, robot_id: Optional[str] = None, max_points: int = 150) -> List[Dict[str, Any]]:
    """Gibt zeitlich sortierte Messpunkte für Verlaufsdiagramme zurück."""
    query = "SELECT timestamp, pm1_0, pm2_5, pm4_0, pm10_0, temperature, humidity, pressure, street, robot_id FROM measurements"
    params = []
    if robot_id:
        query += " WHERE robot_id = ?"
        params.append(robot_id)
    query += " ORDER BY timestamp ASC"

    cursor = conn.cursor()
    cursor.execute(query, params)
    rows = cursor.fetchall()

    if not rows:
        return []

    if len(rows) <= max_points:
        return [dict(r) for r in rows]

    # Downsample evenly to keep charts responsive
    step = len(rows) / float(max_points)
    downsampled = []
    for i in range(max_points):
        idx = int(i * step)
        downsampled.append(dict(rows[idx]))
    if dict(rows[-1]) != downsampled[-1]:
        downsampled.append(dict(rows[-1]))
    return downsampled
