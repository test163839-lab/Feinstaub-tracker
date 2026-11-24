# 📡 HTTP-API Dokumentation – Feinstaub-Monitoring (AeroTrack IoT)

Diese Dokumentation richtet sich an die Entwicklergruppe der **mobilen Smartphone-App**, die Messdaten (GPS-Koordinaten, Feinstaubwerte und Wetterparameter) vom fahrenden Roboter entgegennimmt und an das zentrale Monitoring-Backend übermittelt.

---

## 1. Basis-URL & Interaktive Swagger-UI

- **Lokale Basis-URL:** `http://localhost:8000`
- **Netzwerk/Server Basis-URL:** `http://<SERVER-IP-ADRESSE>:8000`
- **Interaktive Swagger-Dokumentation:** `http://<SERVER-IP-ADRESSE>:8000/docs`
- **OpenAPI Schema (JSON):** `http://<SERVER-IP-ADRESSE>:8000/openapi.json`

Über die Swagger-UI (`/docs`) können alle Endpunkte direkt im Browser mit Beispiel-Nutzdaten interaktiv ausprobiert und verifiziert werden.

---

## 2. Haupt-Endpunkt: `POST /api/messung`

Empfängt einen einzelnen Messdatensatz von der Handy-App, führt eine Plausibilitätsprüfung durch, ermittelt den Straßennamen (Geocoding-Cache), speichert den Datensatz dauerhaft in der SQLite-Datenbank und streamt ihn via WebSocket an alle verbundenen Web-Dashboards.

### HTTP-Header
| Header | Wert | Pflicht | Beschreibung |
|---|---|---|---|
| `Content-Type` | `application/json` | Ja | Teilt dem Server mit, dass der Body JSON ist. |
| `X-API-Key` | `<DEIN_TOKEN>` | Optional | Nur erforderlich, falls im Backend die Authentifizierung aktiviert wurde. |

### JSON Request-Body

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
  "timestamp": "2026-11-20T22:30:00Z",
  "street": "Unter den Linden"
}
```

### Parameter-Spezifikation & Plausibilitätsprüfung

| Feld | Typ | Pflicht | Wertebereich | Beschreibung |
|---|---|---|---|---|
| `robot_id` | String | Ja | 1–50 Zeichen | Eindeutige Kennung des Messroboters (z.B. `ROBOT-01`, `ALPHA`) |
| `latitude` | Float | Ja | -90.0 bis 90.0 | Geografische Breite der GPS-Position |
| `longitude` | Float | Ja | -180.0 bis 180.0 | Geografische Länge der GPS-Position |
| `pm1_0` | Float | Ja | 0.0 bis 1000.0 | Feinstaub PM1.0 in µg/m³ |
| `pm2_5` | Float | Ja | 0.0 bis 1000.0 | Feinstaub PM2.5 in µg/m³ |
| `pm4_0` | Float | Ja | 0.0 bis 1000.0 | Feinstaub PM4.0 in µg/m³ |
| `pm10_0` | Float | Ja | 0.0 bis 1000.0 | Feinstaub PM10.0 in µg/m³ |
| `temperature` | Float | Ja | -50.0 bis 75.0 | Umgebungstemperatur in Grad Celsius (°C) |
| `humidity` | Float | Ja | 0.0 bis 100.0 | Relative Luftfeuchtigkeit in Prozent (%) |
| `pressure` | Float | Ja | 300.0 bis 1200.0 | Luftdruck in Hektopascal (hPa) |
| `timestamp` | String | Nein | ISO 8601 | Zeitstempel (z.B. `2026-11-20T22:30:00Z`). Falls leer, setzt der Server die aktuelle UTC-Zeit ein. |
| `street` | String | Nein | Text | Optional. Falls nicht angegeben, ermittelt das Backend die Straße via Geocoding. |

### 💡 Fehlertoleranz / Flexible Alias-Namen
Für maximale Kompatibilität mit der externen Handy-App akzeptiert unser Backend auch alternative Feldnamen:
- `robot_id` = `robot`, `robotId`, `roboter_id`
- `latitude` = `lat`, `breite`
- `longitude` = `lon`, `lng`, `laenge`
- `pm1_0` = `PM1.0`, `pm1.0`, `pm1`
- `pm2_5` = `PM2.5`, `pm2.5`, `pm25`
- `pm4_0` = `PM4.0`, `pm4.0`, `pm4`
- `pm10_0` = `PM10.0`, `pm10.0`, `pm10`
- `temperature` = `temp`, `temperatur`, `t`
- `humidity` = `hum`, `feuchte`, `luftfeuchtigkeit`, `rh`
- `pressure` = `press`, `druck`, `luftdruck`, `p`

### Erfolgreiche Antwort (HTTP 201 Created)
```json
{
  "id": 142,
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
  "timestamp": "2026-11-20T22:30:00Z",
  "street": "Unter den Linden",
  "created_at": "2026-11-20 22:30:01",
  "level": "yellow"
}
```

---

## 3. Batch-Endpunkt: `POST /api/messungen/batch`

Falls das Smartphone während der Fahrt durch ein Funkloch fährt, kann die Handy-App mehrere Messpunkte zwischenspeichern und als JSON-Array auf einmal nachsenden:

```json
[
  {
    "robot_id": "ROBOT-01",
    "latitude": 52.5168,
    "longitude": 13.3888,
    "pm1_0": 6.5,
    "pm2_5": 12.0,
    "pm4_0": 16.0,
    "pm10_0": 21.0,
    "temperature": 19.5,
    "humidity": 60.0,
    "pressure": 1013.0,
    "timestamp": "2026-11-20T22:25:00Z"
  },
  {
    "robot_id": "ROBOT-01",
    "latitude": 52.5175,
    "longitude": 13.3910,
    "pm1_0": 7.0,
    "pm2_5": 13.2,
    "pm4_0": 17.5,
    "pm10_0": 23.0,
    "temperature": 19.6,
    "humidity": 59.5,
    "pressure": 1013.1,
    "timestamp": "2026-11-20T22:25:30Z"
  }
]
```

---

## 4. Abfrage-Endpunkt: `GET /api/messungen`

Liefert gespeicherte Messdaten zurück. Unterstützt flexible Filterparameter:

| Parameter | Typ | Beispiel | Beschreibung |
|---|---|---|---|
| `robot_id` | String | `ROBOT-01` | Filtert nach einer bestimmten Roboter-ID |
| `start_date` | String (YYYY-MM-DD) | `2026-11-20` | Nur Messungen ab diesem Datum |
| `end_date` | String (YYYY-MM-DD) | `2026-11-20` | Nur Messungen bis zu diesem Datum |
| `start_time` | String (HH:MM) | `08:00` | Nur Messungen ab dieser Uhrzeit |
| `end_time` | String (HH:MM) | `18:00` | Nur Messungen bis zu dieser Uhrzeit |
| `min_pm2_5` | Float | `15.0` | Minimaler PM2.5-Wert |
| `max_pm2_5` | Float | `50.0` | Maximaler PM2.5-Wert |
| `street` | String | `Friedrichstraße` | Filtert nach Straßennamen |
| `limit` | Integer | `500` | Begrenzt die Anzahl (Standard: 2000, Max: 50000) |
| `offset` | Integer | `0` | Offset für Paginierung |

---

## 5. HTTP-Statuscodes & Fehlerbehandlung

| Code | Bedeutung | Ursache / Lösung |
|---|---|---|
| `201 Created` | Erfolgreich gespeichert | Messung wurde validiert und gespeichert. |
| `200 OK` | Abfrage erfolgreich | GET-Anfrage liefert gültige Daten. |
| `400 Bad Request` | Ungültiges JSON | Syntaxfehler im übermittelten JSON-Body. |
| `401 Unauthorized` | Auth-Fehler | Falscher oder fehlender `X-API-Key`-Header. |
| `422 Unprocessable Entity` | Validierungsfehler | GPS außerhalb gültiger Werte (-90 bis 90 / -180 bis 180), Feinstaub negativ, etc. Die Antwort enthält das genaue Feld. |
| `500 Internal Error` | Serverfehler | Unerwarteter interner Fehler (Details in Server-Logs). |

---

## 6. Codebeispiele zur Anbindung

### cURL
```bash
curl -X POST "http://localhost:8000/api/messung" \
  -H "Content-Type: application/json" \
  -d '{
    "robot_id": "ROBOT-01",
    "latitude": 52.520008,
    "longitude": 13.404954,
    "pm1_0": 8.5,
    "pm2_5": 15.2,
    "pm4_0": 20.1,
    "pm10_0": 27.8,
    "temperature": 21.0,
    "humidity": 55.0,
    "pressure": 1013.25
  }'
```

### Flutter / Dart (Mobile App)
```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

Future<bool> sendMeasurementToBackend({
  required String robotId,
  required double lat,
  required double lon,
  required double pm1,
  required double pm25,
  required double pm4,
  required double pm10,
  required double temp,
  required double hum,
  required double pressure,
}) async {
  final url = Uri.parse('http://<DEINE-SERVER-IP>:8000/api/messung');
  
  final payload = {
    'robot_id': robotId,
    'latitude': lat,
    'longitude': lon,
    'pm1_0': pm1,
    'pm2_5': pm25,
    'pm4_0': pm4,
    'pm10_0': pm10,
    'temperature': temp,
    'humidity': hum,
    'pressure': pressure,
    'timestamp': DateTime.now().toUtc().toIso8601String(),
  };

  try {
    final response = await http.post(
      url,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(payload),
    );
    return response.statusCode == 201;
  } catch (e) {
    print('Netzwerkfehler: $e');
    return false;
  }
}
```

### Android Kotlin (OkHttp)
```kotlin
val client = OkHttpClient()
val jsonBody = """
{
  "robot_id": "ROBOT-01",
  "latitude": 52.5200,
  "longitude": 13.4050,
  "pm1_0": 7.0,
  "pm2_5": 14.0,
  "pm4_0": 18.0,
  "pm10_0": 24.0,
  "temperature": 20.0,
  "humidity": 55.0,
  "pressure": 1013.0
}
""".trimIndent()

val request = Request.Builder()
    .url("http://<DEINE-SERVER-IP>:8000/api/messung")
    .post(jsonBody.toRequestBody("application/json".toMediaTypeOrNull()))
    .build()

client.newCall(request).execute().use { response ->
    if (response.isSuccessful) {
        println("Messung erfolgreich gespeichert!")
    }
}
```

### Python
```python
import requests

payload = {
    "robot_id": "ROBOT-PYTHON-01",
    "latitude": 52.5168,
    "longitude": 13.3888,
    "pm1_0": 6.8,
    "pm2_5": 13.5,
    "pm4_0": 17.9,
    "pm10_0": 23.4,
    "temperature": 19.8,
    "humidity": 61.2,
    "pressure": 1014.0
}

response = requests.post("http://localhost:8000/api/messung", json=payload)
print(response.status_code, response.json())
```
