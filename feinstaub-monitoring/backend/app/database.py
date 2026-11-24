import sqlite3
import os
from pathlib import Path
from typing import Generator

# Define database location relative to project root
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "feinstaub.db"

def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Measurements table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS measurements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        robot_id TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        pm1_0 REAL NOT NULL,
        pm2_5 REAL NOT NULL,
        pm4_0 REAL NOT NULL,
        pm10_0 REAL NOT NULL,
        temperature REAL NOT NULL,
        humidity REAL NOT NULL,
        pressure REAL NOT NULL,
        timestamp TEXT NOT NULL,
        street TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    );
    """)
    
    # Indexes for fast querying & filtering
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_measurements_timestamp ON measurements(timestamp);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_measurements_robot_id ON measurements(robot_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_measurements_pm2_5 ON measurements(pm2_5);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_measurements_street ON measurements(street);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_measurements_lat_lon ON measurements(latitude, longitude);")

    # Dynamic settings table for threshold configuration
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    """)

    # Cache for reverse geocoding to avoid excessive external queries
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS geocode_cache (
        lat_rounded REAL NOT NULL,
        lon_rounded REAL NOT NULL,
        street TEXT NOT NULL,
        PRIMARY KEY (lat_rounded, lon_rounded)
    );
    """)

    # Seed default thresholds if not present
    default_settings = [
        ("pm2_5_green_max", "10.0"),
        ("pm2_5_yellow_max", "25.0"),
        ("pm2_5_orange_max", "50.0"),
        ("require_api_key", "false"),
        ("api_key", "feinstaub_secure_key_2026")
    ]
    for key, val in default_settings:
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?);", (key, val))

    conn.commit()
    conn.close()

def get_db():
    conn = get_db_connection()
    try:
        yield conn
    finally:
        conn.close()
