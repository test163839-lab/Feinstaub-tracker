from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, List, Dict, Any, Union
from datetime import datetime, timezone

class MeasurementCreate(BaseModel):
    robot_id: str = Field(..., description="Eindeutige Kennung des Messroboters (z.B. ROBOT-01)")
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Geografische Breite (-90 bis 90)")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Geografische Länge (-180 bis 180)")
    pm1_0: float = Field(..., ge=0.0, le=1000.0, description="Feinstaub PM1.0 in µg/m³")
    pm2_5: float = Field(..., ge=0.0, le=1000.0, description="Feinstaub PM2.5 in µg/m³")
    pm4_0: float = Field(..., ge=0.0, le=1000.0, description="Feinstaub PM4.0 in µg/m³")
    pm10_0: float = Field(..., ge=0.0, le=1000.0, description="Feinstaub PM10.0 in µg/m³")
    temperature: float = Field(..., ge=-50.0, le=75.0, description="Temperatur in °C")
    humidity: float = Field(..., ge=0.0, le=100.0, description="Relative Luftfeuchtigkeit in %")
    pressure: float = Field(..., ge=300.0, le=1200.0, description="Luftdruck in hPa")
    timestamp: Optional[str] = Field(None, description="ISO 8601 Zeitstempel (z.B. 2026-11-20T22:30:00Z). Falls leer, wird aktuelle Serverzeit genutzt.")
    street: Optional[str] = Field(None, description="Optionaler Straßenname (wird sonst via Geocoding ermittelt)")

    @model_validator(mode='before')
    @classmethod
    def normalize_aliases(cls, data: Any) -> Any:
        """Flexibel für Handy-App: Akzeptiert alternative Schlüssel wie PM2.5, pm25, Temperatur, etc."""
        if not isinstance(data, dict):
            return data
        
        normalized = {}
        # Mapping alternative key spellings to standard field names
        mapping = {
            # robot_id / sps_id / device_id
            "robot_id": "robot_id", "robotId": "robot_id", "robot": "robot_id", "id_robot": "robot_id", "roboter_id": "robot_id",
            "sps_id": "robot_id", "spsId": "robot_id", "sps": "robot_id", "device_id": "robot_id", "deviceId": "robot_id", "geraet_id": "robot_id", "geraet": "robot_id",
            # latitude
            "latitude": "latitude", "lat": "latitude", "breite": "latitude",
            # longitude
            "longitude": "longitude", "lon": "longitude", "lng": "longitude", "laenge": "longitude",
            # pm1.0
            "pm1_0": "pm1_0", "pm1.0": "pm1_0", "PM1.0": "pm1_0", "pm1": "pm1_0", "PM1": "pm1_0",
            # pm2.5
            "pm2_5": "pm2_5", "pm2.5": "pm2_5", "PM2.5": "pm2_5", "pm25": "pm2_5", "PM25": "pm2_5",
            # pm4.0
            "pm4_0": "pm4_0", "pm4.0": "pm4_0", "PM4.0": "pm4_0", "pm4": "pm4_0", "PM4": "pm4_0",
            # pm10.0
            "pm10_0": "pm10_0", "pm10.0": "pm10_0", "PM10.0": "pm10_0", "pm10": "pm10_0", "PM10": "pm10_0",
            # temperature
            "temperature": "temperature", "temp": "temperature", "temperatur": "temperature", "t": "temperature",
            # humidity
            "humidity": "humidity", "hum": "humidity", "feuchte": "humidity", "luftfeuchtigkeit": "humidity", "rh": "humidity",
            # pressure
            "pressure": "pressure", "press": "pressure", "druck": "pressure", "luftdruck": "pressure", "p": "pressure",
            # timestamp
            "timestamp": "timestamp", "time": "timestamp", "zeitstempel": "timestamp", "datetime": "timestamp",
            # street
            "street": "street", "strasse": "street", "road": "street"
        }
        
        for k, v in data.items():
            norm_key = mapping.get(k, k)
            normalized[norm_key] = v
            
        # Defaults for timestamp
        if not normalized.get("timestamp"):
            normalized["timestamp"] = datetime.now(timezone.utc).isoformat()
            
        return normalized

class MeasurementResponse(BaseModel):
    id: int
    robot_id: str
    latitude: float
    longitude: float
    pm1_0: float
    pm2_5: float
    pm4_0: float
    pm10_0: float
    temperature: float
    humidity: float
    pressure: float
    timestamp: str
    street: Optional[str] = None
    created_at: Optional[str] = None
    level: Optional[str] = "green"  # green, yellow, orange, red

class MeasurementListResponse(BaseModel):
    total: int
    count: int
    measurements: List[MeasurementResponse]

class SummaryStatistics(BaseModel):
    total_measurements: int
    avg_pm2_5: float
    min_pm2_5: float
    max_pm2_5: float
    avg_pm1_0: float
    avg_pm4_0: float
    avg_pm10_0: float
    avg_temperature: float
    min_temperature: float
    max_temperature: float
    avg_humidity: float
    avg_pressure: float
    robot_count: int
    active_robots: List[str]
    last_update: Optional[str] = None

class StreetStatistics(BaseModel):
    street: str
    measurement_count: int
    avg_pm2_5: float
    max_pm2_5: float
    min_pm2_5: float
    avg_pm10_0: float
    avg_temperature: float
    avg_humidity: float
    risk_level: str

class SettingsUpdate(BaseModel):
    pm2_5_green_max: Optional[float] = Field(None, ge=1.0, le=100.0)
    pm2_5_yellow_max: Optional[float] = Field(None, ge=1.0, le=200.0)
    pm2_5_orange_max: Optional[float] = Field(None, ge=1.0, le=500.0)
    require_api_key: Optional[bool] = None
    api_key: Optional[str] = None
