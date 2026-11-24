import unittest
import sqlite3
import json
from pathlib import Path
import sys

# Ensure backend package can be imported
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.app.database import init_db, get_db_connection
from backend.app.services import insert_measurement, get_filtered_measurements, get_summary_statistics, get_street_statistics
from backend.app.models import MeasurementCreate
from pydantic import ValidationError

class TestFeinstaubBackend(unittest.TestCase):
    def setUp(self):
        init_db()
        self.conn = get_db_connection()

    def tearDown(self):
        self.conn.close()

    def test_measurement_validation_valid(self):
        data = {
            "robot_id": "TEST-BOT-01",
            "latitude": 52.5200,
            "longitude": 13.4050,
            "pm1_0": 8.5,
            "pm2_5": 14.2,
            "pm4_0": 19.8,
            "pm10_0": 26.4,
            "temperature": 18.5,
            "humidity": 62.0,
            "pressure": 1013.25
        }
        m = MeasurementCreate(**data)
        self.assertEqual(m.robot_id, "TEST-BOT-01")
        self.assertEqual(m.pm2_5, 14.2)

    def test_measurement_alias_normalization(self):
        """Testet, ob die Handy-App alternative Schreibweisen wie PM2.5, lat, lng, temp senden darf."""
        flexible_data = {
            "robot": "TEST-BOT-02",
            "lat": 52.5168,
            "lng": 13.3888,
            "PM1.0": 5.2,
            "PM2.5": 9.8,
            "PM4.0": 13.5,
            "PM10": 17.0,
            "temp": 21.0,
            "hum": 55.0,
            "press": 1014.0
        }
        m = MeasurementCreate(**flexible_data)
        self.assertEqual(m.robot_id, "TEST-BOT-02")
        self.assertEqual(m.latitude, 52.5168)
        self.assertEqual(m.pm2_5, 9.8)
        self.assertEqual(m.temperature, 21.0)

    def test_measurement_invalid_latitude_rejected(self):
        invalid_data = {
            "robot_id": "TEST-BOT-03",
            "latitude": 192.5200,  # Invalid latitude (> 90)
            "longitude": 13.4050,
            "pm1_0": 5.0, "pm2_5": 10.0, "pm4_0": 15.0, "pm10_0": 20.0,
            "temperature": 20.0, "humidity": 50.0, "pressure": 1013.0
        }
        with self.assertRaises(ValidationError):
            MeasurementCreate(**invalid_data)

    def test_measurement_negative_pm_rejected(self):
        invalid_data = {
            "robot_id": "TEST-BOT-04",
            "latitude": 52.5200,
            "longitude": 13.4050,
            "pm1_0": -5.0,  # Negative PM not physically possible
            "pm2_5": 10.0, "pm4_0": 15.0, "pm10_0": 20.0,
            "temperature": 20.0, "humidity": 50.0, "pressure": 1013.0
        }
        with self.assertRaises(ValidationError):
            MeasurementCreate(**invalid_data)

    def test_database_insert_and_retrieval(self):
        data = {
            "robot_id": "UNIT-TEST-ROBOT",
            "latitude": 52.5170,
            "longitude": 13.3890,
            "pm1_0": 6.1,
            "pm2_5": 12.3,
            "pm4_0": 18.0,
            "pm10_0": 24.5,
            "temperature": 19.2,
            "humidity": 58.0,
            "pressure": 1012.0,
            "timestamp": "2026-11-20T21:00:00Z",
            "street": "Testallee"
        }
        res = insert_measurement(self.conn, data)
        self.assertIsNotNone(res["id"])
        self.assertEqual(res["street"], "Testallee")
        self.assertEqual(res["level"], "yellow")  # 12.3 is between 10 and 25

        # Check filtered query
        items, count = get_filtered_measurements(self.conn, robot_id="UNIT-TEST-ROBOT")
        self.assertGreaterEqual(count, 1)
        self.assertEqual(items[0]["robot_id"], "UNIT-TEST-ROBOT")

    def test_street_statistics(self):
        streets = get_street_statistics(self.conn)
        self.assertIsInstance(streets, list)

    def test_summary_statistics(self):
        summary = get_summary_statistics(self.conn)
        self.assertIn("total_measurements", summary)
        self.assertIn("avg_pm2_5", summary)
        self.assertIn("active_robots", summary)

if __name__ == "__main__":
    unittest.main()
